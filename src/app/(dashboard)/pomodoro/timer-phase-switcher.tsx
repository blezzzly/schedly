/**
 * Phase switcher for the Pomodoro timer (Focus / Break).
 *
 * One copy of the markup, rendered once, at both breakpoints. Position comes
 * from the caller's flex `order` — `order-first` while the card is a column,
 * natural order once it is a row — rather than from rendering two instances and
 * hiding one per breakpoint.
 *
 * Rendering two was tried first and it is a trap: `hidden` and `inline-flex` are
 * both display utilities, so which applies depends on their order in the
 * generated stylesheet, not on the order they appear in the class attribute. Two
 * instances gated on opposite breakpoints can therefore both render, which
 * shows up as a duplicated Focus/Break switcher.
 *
 * Toggle semantics (`aria-pressed` on plain buttons) rather than `role="tab"`:
 * a tablist without a tabpanel and without arrow-key handling is an incomplete
 * ARIA pattern, and worse than plain buttons.
 */
export function TimerPhaseSwitcher({
  phase,
  onSwitch,
  className,
}: {
  phase: "focus" | "break";
  onSwitch: (p: "focus" | "break") => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Timer phase"
      className={`inline-flex rounded-lg border-2 border-foreground/70 bg-muted/40 p-1 ${className ?? ""}`}
    >
      {(["focus", "break"] as const).map((p) => {
        const active = phase === p;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={active}
            onClick={() => onSwitch(p)}
            className={`min-w-28 rounded-md px-8 py-1.5 text-sm font-bold capitalize transition-colors duration-150 ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}