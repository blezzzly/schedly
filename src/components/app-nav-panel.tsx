"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { mainNav } from "@/config/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";

// Desktop app navigation — the Settings page's left-panel pattern: a rounded
// card of text-only pills rendered BELOW each page's header, hugging the
// content beside it (Settings puts its tab panel under the page title the
// same way). Mobile hides it — the drawer + bottom nav take over.
export function AppNavPanel() {
  const pathname = usePathname();
  const { signOut } = useAuth();

  const pill = (isActive: boolean) =>
    cn(
      "shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-colors",
      isActive
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
    );

  return (
    <nav className="hidden w-48 shrink-0 flex-col gap-1 self-start rounded-xl border-2 border-foreground/70 bg-card/80 p-2 backdrop-blur-sm md:sticky md:top-6 md:flex shadow-[3px_3px_0_0_#401f32]">
      {mainNav.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link key={item.href} href={item.href} prefetch className={pill(isActive)}>
            {item.label}
          </Link>
        );
      })}
      <div className="my-2 h-px bg-border/60" />
      <Link href="/settings" className={pill(pathname === "/settings")}>
        Settings
      </Link>
      <button
        type="button"
        onClick={() => signOut()}
        className="shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        Sign out
      </button>
    </nav>
  );
}
