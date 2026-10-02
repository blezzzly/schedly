// Keyboard-accessibility helper: a "Skip to main content" link that is the
// first tab stop on every dashboard page. It stays off-screen until it
// receives focus (keyboard / screen-reader users), then slides into view.
// Note: relies on a plain anchor + fragment (#main-content), so it works the
// same in the browser, an installed PWA, and the Capacitor shell.

export function SkipNavigation() {
  return (
    <div className="pointer-events-none fixed left-4 top-4 z-[100]">
      <a
        href="#main-content"
        className="block -translate-y-24 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-2xl ring-2 ring-background transition-transform duration-200 focus:translate-y-0 focus:outline-none"
      >
        Skip to main content
      </a>
    </div>
  );
}