import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Unit tests run without a database. Without this, any test that happens to
// reach server code which touches Prisma opens a real connection attempt and
// the runner fills the log with PrismaClientKnownRequestError / ECONNREFUSED.
//
// It passes, but it trains everyone to ignore the error log. The next real
// failure is indistinguishable from the noise, which is how a genuine problem
// gets missed. It is also slow: every accidental call waits on a socket timeout.
//
// The stub is a Proxy that answers every method with a chainable no-op resolving
// to an empty result, so code under test keeps working without each test having
// to enumerate the models it happens to touch. Tests that assert on real queries
// override this with their own `vi.mock`.
//
// Stubbed in setup rather than guarded in the source on purpose: whether a
// database exists is a property of the test run, not of the running application.
// A `if (!process.env.DATABASE_URL) return` in production code would be a test
// concern leaking into the app, and would silently disable usage tracking
// instead of surfacing a misconfiguration.
vi.mock("@/server/db/client", () => {
  // A callable Proxy, so a stub answers to any depth: `db.usageCounter.upsert(…)`
  // works the same as `db.limitSnapshot.findMany(…)` without this file having to
  // know which models exist. A one-level Proxy returns a plain function for
  // `db.usageCounter`, and the next hop then throws "upsert is not a function".
  const handler: ProxyHandler<() => void> = {
    get(_target, prop) {
      // Awaiting the stub must not look like a thenable, or every `await db.x`
      // would try to call `stub.then(...)` and hang.
      if (prop === "then") return undefined;
      return makeStub();
    },
    apply() {
      return Promise.resolve([]);
    },
  };

  function makeStub(): unknown {
    return new Proxy(function stub() {} as () => void, handler);
  }

  return { db: makeStub() };
});