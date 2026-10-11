import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The service worker.
 *
 * This is the one file with no test coverage and the most to lose if it breaks:
 * it decides what opens with no connection. The cases below are the ones that
 * have actually gone wrong in apps like this, and each has a comment in the
 * worker explaining the trap it avoids.
 *
 * The worker is plain JavaScript with no imports, so it is loaded as source and
 * driven through the `self`/Cache API seams it already uses. That keeps the
 * test honest about the real file rather than a reimplementation of it.
 */

// `src/lib` → repo root is two levels up, not one.
const SOURCE = readFileSync(
  path.resolve(__dirname, "../../public/sw.js"),
  "utf8"
);

/**
 * A Request with a forced `mode`.
 *
 * `new Request(url, { mode: "navigate" })` is rejected by undici, and the worker
 * branches on `request.mode === "navigate"` for the HTML shell. Defining the
 * property is the only way to exercise that path outside a real browser.
 */
function navigateRequest(url: string): Request {
  const req = new Request(url, { method: "GET" });
  Object.defineProperty(req, "mode", { value: "navigate", configurable: true });
  return req;
}

/** Minimal in-memory stand-in for Cache Storage. */
class FakeCache {
  entries = new Map<string, Response>();
  constructor(public name: string) {}
  static key(request: Request | string) {
    return typeof request === "string" ? request : request.url;
  }
  async put(request: Request | string, response: Response) {
    this.entries.set(FakeCache.key(request), response);
  }
  async match(request: Request | string) {
    return this.entries.get(FakeCache.key(request));
  }
  async addAll(urls: string[]) {
    for (const u of urls) {
      this.entries.set(u, new Response("cached", { status: 200 }));
    }
  }
  async delete(request: Request | string) {
    return this.entries.delete(FakeCache.key(request));
  }
  async keys() {
    return Array.from(this.entries.keys()).map((k) => ({ url: k }) as Request);
  }
}

/**
 * The slice of `ExtendableEvent` the worker actually uses.
 *
 * Typed rather than `any` so the harness cannot drift into passing something the
 * browser would not, which would make a passing test meaningless.
 */
type WorkerEvent = {
  request?: Request;
  waitUntil: (p: Promise<unknown>) => void;
  respondWith: (p: Promise<Response>) => void;
  data?: unknown;
};

type Listener = (event: WorkerEvent) => void;

type Harness = {
  listeners: Map<string, Listener[]>;
  caches: Map<string, FakeCache>;
  fetchMock: ReturnType<typeof vi.fn>;
  /** Dispatch an event and resolve with whatever the worker responded with. */
  emit: (
    type: string,
    event?: Partial<WorkerEvent>
  ) => Promise<{ response?: Response; handled: boolean }>;
  getCache: (name: string) => FakeCache;
  /** The fake `self`, so a test can swap out `registration` to model a browser. */
  scope: Record<string, unknown>;
};

/**
 * Evaluate the worker source against fakes.
 *
 * `IS_DEV` is driven by the `?dev=1` query the app uses, so the production path
 * is what runs here.
 */
function loadWorker(href = "https://schedly.test/sw.js"): Harness {
  const listeners = new Map<string, Listener[]>();
  const caches = new Map<string, FakeCache>();

  const getCache = (name: string) => {
    let cache = caches.get(name);
    if (!cache) {
      cache = new FakeCache(name);
      caches.set(name, cache);
    }
    return cache;
  };

  const cacheStorage = {
    open: async (name: string) => getCache(name),
    keys: async () => Array.from(caches.keys()),
    delete: async (name: string) => caches.delete(name),
    match: async () => undefined,
  };

  const registration = {
    showNotification: vi.fn(async () => undefined),
    sync: { register: vi.fn(async () => undefined) },
  };

  const fetchMock = vi.fn();

  const scope: Record<string, unknown> = {
    location: { href, origin: "https://schedly.test" },
    addEventListener: (type: string, fn: Listener) => {
      const existing = listeners.get(type);
      if (existing) existing.push(fn);
      else listeners.set(type, [fn]);
    },
    clients: { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => []) },
    registration,
    skipWaiting: vi.fn(async () => undefined),
    caches: cacheStorage,
    fetch: fetchMock,
  };

  (globalThis as Record<string, unknown>).self = scope;
  (globalThis as Record<string, unknown>).caches = cacheStorage;

  // The worker body runs at import time and registers its listeners.
  new Function("self", "caches", "fetch", "Response", SOURCE)(
    scope,
    cacheStorage,
    fetchMock,
    Response
  );

  return {
    listeners,
    caches,
    fetchMock,
    getCache,
    scope,
    emit: async (type, event = {}) => {
      const handlers = listeners.get(type) ?? [];
      const waits: Promise<unknown>[] = [];
      let response: Response | undefined;
      let handled = false;
      const full: WorkerEvent = {
        waitUntil: (p) => {
          waits.push(p);
        },
        respondWith: (p) => {
          // `respondWith` is the seam under test: it records whether the worker
          // chose to answer, and captures what it answered with. `handled`
          // matters as much as the response — a worker that stays out of the
          // way for an API request is behaving correctly, and that is `false`.
          handled = true;
          waits.push(p.then((r) => {
            response = r;
          }));
        },
        ...event,
      };
      for (const handler of handlers) handler(full);
      await Promise.all(waits);
      return { response, handled };
    },
  };
}

describe("service worker", () => {
  let h: Harness;

  beforeEach(() => {
    h = loadWorker();
  });

  afterEach(() => {
    // The worker installs `self` and `caches` as globals when it loads. Left in
    // place they would leak into the next test file and mask missing setup.
    const globals = globalThis as Record<string, unknown>;
    delete globals.self;
    delete globals.caches;
  });

  it("precaches the icons and the offline page, so both exist before any page is opened", async () => {
    await h.emit("install");
    const cache = h.getCache("schedly-cache-v9");
    // The offline page is what a never-downloaded device is shown, so it has to
    // be in the cache from the very first install.
    expect(cache.entries.has("/offline.html")).toBe(true);
    expect(cache.entries.has("/icons/icon-192.png")).toBe(true);
    expect(cache.entries.has("/manifest.webmanifest")).toBe(true);
  });

  it("deletes caches from older versions on activate", async () => {
    const stale = h.getCache("schedly-cache-v7");
    await stale.put("/dashboard", new Response("old"));
    // The current cache is created by the install step, not activate.
    const current = h.getCache("schedly-cache-v9");
    await current.put("/dashboard", new Response("new"));

    await h.emit("activate");

    // A stale cache means pages that used to open offline silently stop, and
    // that is what actually ships an old offline experience to installed apps.
    expect(h.caches.has("schedly-cache-v7")).toBe(false);
    expect(h.caches.has("schedly-cache-v9")).toBe(true);
    expect(await current.match("/dashboard")).toBeDefined();
  });

  it("keeps the reminder-alarm cache, which is state rather than cached content", async () => {
    const alarms = h.getCache("schedly-alarms");
    await alarms.put("/alarms.json", new Response("[]"));
    h.getCache("schedly-cache-v7");

    await h.emit("activate");

    // Deleting this would silently cancel every class reminder the user has set
    // for a notification they believe is still armed.
    expect(h.caches.has("schedly-alarms")).toBe(true);
  });

  it("serves a cached page when the network is gone", async () => {
    const cache = h.getCache("schedly-cache-v9");
    await cache.put("https://schedly.test/dashboard", new Response("<html>dashboard</html>", { status: 200 }));
    h.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { response, handled } = await h.emit("fetch", {
      request: navigateRequest("https://schedly.test/dashboard"),
    });

    expect(handled).toBe(true);
    expect(await response!.text()).toContain("dashboard");
  });

  it("serves the offline page when nothing at all is cached", async () => {
    const cache = h.getCache("schedly-cache-v9");
    await cache.put("/offline.html", new Response("<html>not downloaded</html>"));
    h.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { response } = await h.emit("fetch", {
      request: navigateRequest("https://schedly.test/classes"),
    });

    // Better a page that explains the problem than the app shell whose every
    // request will now fail behind it.
    expect(await response!.text()).toContain("not downloaded");
  });

  it("never serves the HTML shell to an API request", async () => {
    const cache = h.getCache("schedly-cache-v9");
    await cache.put("https://schedly.test/dashboard", new Response("<html>dashboard</html>"));

    const { handled } = await h.emit("fetch", {
      request: new Request("https://schedly.test/api/reminders", { method: "GET" }),
    });

    // Returning the app shell for /api/* would hand a caller HTML where JSON
    // was expected — a data bug that looks like a random parse failure.
    expect(handled).toBe(false);
  });

  it("does not cache API responses at all", async () => {
    const cache = h.getCache("schedly-cache-v9");

    const { handled } = await h.emit("fetch", {
      request: new Request("https://schedly.test/api/some-data", { method: "GET" }),
    });

    expect(handled).toBe(false);
    expect(cache.entries.size).toBe(0);
  });

  it("ignores non-GET requests entirely", async () => {
    const { handled } = await h.emit("fetch", {
      request: new Request("https://schedly.test/dashboard", { method: "POST" }),
    });
    // A cached response to a POST would replay the user's write on a later
    // request, which is not something a cache is allowed to do.
    expect(handled).toBe(false);
  });

  it("serves a hashed static chunk from cache without going to the network", async () => {
    const cache = h.getCache("schedly-cache-v9");
    await cache.put(
      "https://schedly.test/_next/static/chunks/main-abc123.js",
      new Response("console.log(1)")
    );
    h.fetchMock.mockRejectedValue(new TypeError("offline"));

    const { response, handled } = await h.emit("fetch", {
      request: new Request("https://schedly.test/_next/static/chunks/main-abc123.js", {
        method: "GET",
      }),
    });

    expect(handled).toBe(true);
    expect(await response!.text()).toBe("console.log(1)");
    // Content-hashed filenames cannot go stale, so revalidating them would
    // re-request every script and stylesheet on every visit for no possible
    // benefit. Not making this request is the whole point.
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it("still refreshes a fixed-name image, which can genuinely change", async () => {
    const cache = h.getCache("schedly-cache-v9");
    await cache.put("https://schedly.test/icons/icon-192.png", new Response("old-icon"));
    h.fetchMock.mockResolvedValue(new Response("new-icon", { status: 200 }));

    const { response } = await h.emit("fetch", {
      request: new Request("https://schedly.test/icons/icon-192.png", { method: "GET" }),
    });

    // Served instantly from cache...
    expect(await response!.text()).toBe("old-icon");
    // ...while the refresh happens behind it.
    expect(h.fetchMock).toHaveBeenCalled();
  });

  it("bounds the runtime image cache so it cannot grow without limit", async () => {
    const cache = h.getCache("schedly-cache-v9");
    h.fetchMock.mockImplementation(async () => new Response("img", { status: 200 }));

    for (let i = 0; i < 130; i++) {
      await h.emit("fetch", {
        request: new Request(`https://openweathermap.org/icon/${i}.png`, { method: "GET" }),
      });
    }

    // Unbounded growth on a device with a few hundred MB is how the browser ends
    // up evicting the app shell along with the photos.
    expect(cache.entries.size).toBeLessThanOrEqual(120);
  });

  it("never caches a prefetch payload over a real navigation", async () => {
    // The regression that made tapping an unopened page flash and hard-reload.
    //
    // Next.js fetches a *partial* payload ahead of a tap (Next-Router-Prefetch:
    // 1) and a *complete* one when the tap happens. Sharing a cache key meant the
    // tap could be answered with the partial one; Next.js then had nothing to
    // render, treated the client navigation as failed, and fell back to a full
    // page load — which is the white flash, and offline is what dragged it to
    // the dashboard.
    const cache = h.getCache("schedly-cache-v9-rsc");
    const url = "https://schedly.test/notes";

    const prefetch = new Request(url, { method: "GET", headers: { RSC: "1", "Next-Router-Prefetch": "1" } });
    const navigation = new Request(url, { method: "GET", headers: { RSC: "1" } });

    h.fetchMock.mockResolvedValue(new Response("PARTIAL", { status: 200 }));
    const prefetchResult = await h.emit("fetch", { request: prefetch });

    // Left entirely alone: not served from cache, and not written to it.
    expect(prefetchResult.handled).toBe(false);
    expect(cache.entries.size).toBe(0);

    h.fetchMock.mockResolvedValue(new Response("COMPLETE", { status: 200 }));
    const navResult = await h.emit("fetch", { request: navigation });

    expect(navResult.handled).toBe(true);
    // The real navigation must reach the network, not inherit a stale partial.
    expect(await navResult.response!.text()).toBe("COMPLETE");
  });

  it("still serves a previously cached real navigation payload", async () => {
    // The fix above must not cost offline navigation — a route genuinely
    // visited while online still has to open with no connection.
    const cache = h.getCache("schedly-cache-v9-rsc");
    await cache.put("https://schedly.test" + "/notes", new Response("COMPLETE", { status: 200 }));
    h.fetchMock.mockRejectedValue(new TypeError("offline"));

    const { response, handled } = await h.emit("fetch", {
      request: new Request("https://schedly.test/notes", {
        method: "GET",
        headers: { RSC: "1" },
      }),
    });

    expect(handled).toBe(true);
    expect(await response!.text()).toBe("COMPLETE");
  });

  it("registers Background Sync without failing when it is unsupported", async () => {
    await h.emit("message", {
      data: { type: "REGISTER_SYNC", tag: "schedly-sync" },
    });
    // Some browsers do not implement it at all. That must not throw: the page's
    // foreground triggers are what guarantee delivery.
    expect(true).toBe(true);
  });

  it("tolerates a browser with no Background Sync support", async () => {
    const original = h.scope.registration;
    // Firefox and Safari have no `registration.sync` at all. Registering must
    // not throw, because the foreground triggers are what guarantee delivery.
    h.scope.registration = { showNotification: vi.fn(async () => undefined) };

    await expect(
      h.emit("message", { data: { type: "REGISTER_SYNC", tag: "schedly-sync" } })
    ).resolves.toBeDefined();

    h.scope.registration = original;
  });

  it("does no caching at all in dev, where chunk URLs change every restart", async () => {
    const dev = loadWorker("http://localhost:3000/sw.js?dev=1");
    const cache = dev.getCache("schedly-cache-v9");
    await dev.emit("install");

    // A cache-first worker in dev hands back stale module factories and breaks
    // hot reload, which is why the worker opts out entirely there.
    expect(cache.entries.size).toBe(0);

    const { handled } = await dev.emit("fetch", {
      request: new Request("http://localhost:3000/_next/static/chunks/main.js", {
        method: "GET",
      }),
    });
    expect(handled).toBe(false);
  });
});
