"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, X, Share, Home, Check, Smartphone, ExternalLink } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "schedly-install-dismissed";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/* True when the page is loaded inside a social app's built-in webview
 * (Facebook, Instagram, Messenger, TikTok, ...). These webviews block
 * PWA installs, so we redirect users to their real browser instead. */
function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /FBAN|FBAV|FBIOS|FB_IAB|fbsbrowser|Instagram|Messenger|TikTok|musical_ly|Line\/|KakaoTalk|NaverApp|WhatsApp/i.test(
      ua,
    ) ||
    (/Android/i.test(ua) && /wv/i.test(ua))
  );
}

/* True when the page is already running as an installed app — either a
 * standalone PWA (launched from home screen) or the native app. */
function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (window.matchMedia?.("(display-mode: standalone)")?.matches ?? false) ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [inAppBrowser, setInAppBrowser] = useState(false);
  const [escapeTried, setEscapeTried] = useState(false);
  const [ios, setIos] = useState(false);
  const reloadedOnce = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    // The onboarding flow has its own "Add to home screen" step, so the
    // global install sheet should not compete with it.
    if (pathname?.startsWith("/onboarding")) return;

    // Already running as an installed app — nothing to install, never show.
    if (isStandaloneApp()) return;

    // Register the service worker so the PWA is installable (Chrome/Edge)
    // and the app shell is cached for offline use. Registered on every mount
    // so already-installed PWAs also pick up SW updates (cache v2). Skipped
    // in development — the SW's cache-first chunk policy breaks dev reloads.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch(() => {});
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      // Show the install sheet immediately when the browser is ready.
      if (!localStorage.getItem(DISMISS_KEY)) setVisible(true);
    };
    const onInstalled = () => {
      // Permanently remember the install so the prompt never returns.
      localStorage.setItem(DISMISS_KEY, "1");
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Show the sheet unless this device already said no (or already installed).
    // Popped almost immediately so it's the first thing users see after
    // escaping Facebook's in-app browser into Chrome.
    const timer = setTimeout(() => {
      if (!localStorage.getItem(DISMISS_KEY)) {
        setIos(isIOS());
        setInAppBrowser(isInAppBrowser());
        setVisible(true);
      }
    }, 600);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(timer);
    };
  }, [pathname]);

  if (pathname?.startsWith("/onboarding")) return null;
  if (isStandaloneApp()) return null;

  /**
   * "Not now" / the ✕ button — and tapping the backdrop.
   *
   * Writes DISMISS_KEY so the sheet is gone for good on this device, across
   * browser restarts. It used to only call setVisible(false), which meant the
   * sheet popped up again 600ms into every single visit (see the timer above)
   * until the app was actually installed — so anyone who said "not now" was
   * asked again forever. Only clearing site data brings it back.
   */
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode / storage disabled — the sheet still hides for this visit.
    }
    setVisible(false);
  };

  const handleInstall = async () => {
    // Install prompt available -> install directly.
    if (deferred) {
      setInstalling(true);
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setInstalling(false);
      if (choice.outcome === "accepted") {
        localStorage.setItem(DISMISS_KEY, "1");
      }
      setVisible(false);
      return;
    }

    // No prompt yet: the service worker may not be controlling this page yet
    // (a fresh visit). Reload once to activate it — the browser then considers
    // the site installable and the "Install" button works on the next tap.
    if (!reloadedOnce.current) {
      reloadedOnce.current = true;
      try {
        await navigator.serviceWorker.ready;
      } catch {
        // Ignore — reload anyway.
      }
      window.location.reload();
      return;
    }

    // After the reload the browser still can't install (e.g. Firefox) —
    // fall back to manual instructions.
    setShowFallback(true);
  };

  const openInExternalBrowser = () => {
    // Try to escape the in-app webview (Facebook/Instagram/etc.) into the
    // real external browser, where one-tap PWA install actually works.
    const url = window.location.href;
    try {
      const ua = navigator.userAgent;
      if (/android/i.test(ua) && /FBAN|FBAV|FB_IAB|fbsbrowser|Instagram|Messenger|TikTok|musical_ly/i.test(ua)) {
        // Android: hand off to Chrome via an intent URL. If Chrome isn't
        // installed, browser_fallback_url opens the default browser instead.
        const target = new URL(url);
        const intentUrl = `intent://${target.host}${target.pathname}${target.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
        const a = document.createElement("a");
        a.href = intentUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch {
      // Ignore — the manual steps are shown right after.
    }
    setEscapeTried(true);
  };

  if (!visible) return null;

  const isSheet = !ios && !showFallback && !inAppBrowser;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]"
        onClick={dismiss}
        aria-hidden
      />

      {inAppBrowser ? (
        /* ===== In-app browser escape dialog (Facebook/Instagram/etc.) ===== */
        <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto w-full max-w-md rounded-t-3xl border-2 border-foreground/70 bg-card p-6 pb-[calc(1.25rem+var(--sab))] shadow-[4px_4px_0_0_#401f32]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Smartphone className="h-5 w-5" />
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {!escapeTried ? (
            <>
              <h2 className="mt-4 text-lg font-bold tracking-tight text-foreground">
                Open Schedly in your browser
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                You&apos;re browsing inside a social app&apos;s built-in browser,
                which can&apos;t install apps. Open Schedly in your normal
                browser to install it — one tap and you&apos;re set.
              </p>

              <button
                type="button"
                onClick={openInExternalBrowser}
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#EC4899] to-[#F472B6] text-[15px] font-semibold text-white shadow-[0_12px_30px_rgba(236,72,153,0.35)] active:scale-[0.97]"
              >
                <ExternalLink className="h-5 w-5" />
                Open in browser
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="mt-2.5 h-10 w-full text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Not now
              </button>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-lg font-bold tracking-tight text-foreground">
                Didn&apos;t open? Do it manually
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Some apps block the automatic open. It takes two taps — then
                Schedly opens in your regular browser and the install pop-up
                appears there.
              </p>

              <div className="mt-5 space-y-3">
                {ios ? (
                  <>
                    <Step
                      icon={<Share className="h-4 w-4" />}
                      text="Tap the Share button at the bottom."
                    />
                    <Step
                      icon={<ExternalLink className="h-4 w-4" />}
                      text="Tap &quot;Open in Safari&quot;."
                    />
                  </>
                ) : (
                  <>
                    <Step
                      icon={<Share className="h-4 w-4" />}
                      text="Tap the ⋯ (three-dot) menu at the top right."
                    />
                    <Step
                      icon={<ExternalLink className="h-4 w-4" />}
                      text="Tap &quot;Open in Browser&quot; — Schedly opens in your real browser."
                    />
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={openInExternalBrowser}
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#EC4899] to-[#F472B6] text-[15px] font-semibold text-white shadow-[0_12px_30px_rgba(236,72,153,0.35)] active:scale-[0.97]"
              >
                <ExternalLink className="h-5 w-5" />
                Try opening again
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="mt-2.5 h-10 w-full text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Not now
              </button>
            </>
          )}
        </div>
      ) : isSheet ? (
        /* ===== Install sheet (Android / desktop Chrome, Edge) ===== */
        <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto w-full max-w-md rounded-t-3xl border-2 border-foreground/70 bg-card p-6 pb-[calc(1.25rem+var(--sab))] shadow-[4px_4px_0_0_#401f32]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Download className="h-5 w-5" />
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <h2 className="mt-4 text-lg font-bold tracking-tight text-foreground">
            Install Schedly
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Get the full app experience — install Schedly on your device for a
            dedicated icon, faster startup, and offline access.
          </p>

          <button
            type="button"
            onClick={handleInstall}
            disabled={installing}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#EC4899] to-[#F472B6] text-[15px] font-semibold text-white shadow-[0_12px_30px_rgba(236,72,153,0.35)] active:scale-[0.97] disabled:opacity-60"
          >
            <Download className="h-5 w-5" />
            {installing ? "Installing..." : "Install App"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="mt-2.5 h-10 w-full text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Not now
          </button>
        </div>
      ) : (
        /* ===== Instructions dialog (iPhone / unsupported browsers) ===== */
        <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto w-full max-w-md rounded-t-3xl border-2 border-foreground/70 bg-card p-6 pb-[calc(1.25rem+var(--sab))] shadow-[4px_4px_0_0_#401f32]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Smartphone className="h-5 w-5" />
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <h2 className="mt-4 text-lg font-bold tracking-tight text-foreground">
            {ios ? "Install Schedly on your iPhone" : "Install Schedly"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {ios
              ? "Add Schedly to your Home Screen so it works just like a native app — one tap to open, no browser tabs."
              : "Your browser doesn't offer one-tap install. Create a shortcut manually instead."}
          </p>

          <div className="mt-5 space-y-3">
            {ios ? (
              <>
                <Step
                  icon={<Share className="h-4 w-4" />}
                  text="Tap the Share button in your browser."
                />
                <Step
                  icon={<Home className="h-4 w-4" />}
                  text="Scroll down and tap &quot;Add to Home Screen&quot;."
                />
                <Step
                  icon={<Check className="h-4 w-4" />}
                  text="Tap &quot;Add&quot; in the top-right corner. Done!"
                />
              </>
            ) : (
              <Step
                icon={<Download className="h-4 w-4" />}
                text="Use your browser&apos;s menu and choose &quot;Install app&quot; or &quot;Add to Home Screen&quot;."
              />
            )}
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-[#EC4899] to-[#F472B6] text-[15px] font-semibold text-white shadow-[0_12px_30px_rgba(236,72,153,0.35)] active:scale-[0.97]"
          >
            Got it
          </button>
        </div>
      )}
    </>
  );
}

function Step({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-foreground/70 bg-muted/40 p-3.5 shadow-[3px_3px_0_0_#401f32]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
        {icon}
      </span>
      <p className="text-sm font-medium leading-snug text-foreground">{text}</p>
    </div>
  );
}
