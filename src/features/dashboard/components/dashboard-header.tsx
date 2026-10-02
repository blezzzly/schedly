import { HeaderAvatar } from "@/components/header-avatar";
import { NotificationBell } from "@/components/notification-bell";

// Time-based greeting header. The profile avatar sits inline, flush with the
// title (Settings-page style: title over a muted subtitle), and the
// notification bell sits on the right end of the same row.
export function DashboardHeader({
  greeting,
  username,
}: {
  greeting: string;
  username: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <HeaderAvatar />
        <div className="min-w-0">
          <h1 className="font-heading text-[clamp(1.5rem,1.25rem+1vw,1.875rem)] leading-tight font-bold tracking-tight text-foreground">
            {greeting}, {username}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Here&apos;s your day at a glance.
          </p>
        </div>
      </div>
      <NotificationBell variant="inline" className="hidden md:flex" />
    </header>
  );
}