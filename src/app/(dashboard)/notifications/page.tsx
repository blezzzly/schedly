"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUserSchedules } from "@/app/(dashboard)/classes/actions";
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification as deleteNotificationAction,
} from "@/app/(dashboard)/notifications/actions";
import { getUserReminders, updateReminder, type UpdateReminderResult } from "@/app/(dashboard)/reminders/actions";
import { isPushSupported, getPushState, enablePush, disablePush, sendTestPush, isIosPwa, type PushErrorCode } from "@/lib/push";
import { programReminderAlarms } from "@/lib/notification-scheduler";
import {
  setNotificationDetailOpen,
} from "@/lib/notification-detail-store";
import { Button } from "@/components/ui/button";
import { openQuickAdd } from "@/lib/quick-add-sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Skeleton as BoneSkeleton } from "boneyard-js/react";
import { HeaderBack } from "@/components/header-back";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Calendar,
  Info,
  Clock,
  CalendarDays,
  MapPin,
  Camera,
  Loader2,
  ArrowLeft,
} from "lucide-react";

type Notification = {
  id: string;
  type: "class_reminder" | "schedule_update" | "system";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

type Day =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

const DAY_SHORT: Record<Day, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const DAY_FULL: Record<Day, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DAY_KEYS: Day[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MINUTE_OPTIONS = [5, 10, 15, 30, 60];

type ReminderUi = {
  id: string;
  classId: string;
  minutesBefore: number;
  isActive: boolean;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function fmtTime(value: string | Date): string {
  const d = new Date(value);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function startMinutes(value: string | Date): number {
  const d = new Date(value);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

const typeIcons = {
  class_reminder: Clock,
  schedule_update: Calendar,
  system: Info,
};

const typeColors = {
  class_reminder: "bg-primary/10 text-primary",
  schedule_update: "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400",
  system: "bg-muted text-muted-foreground",
};

/** Friendlier category label for a notification. To-do deadline reminders
 *  reuse the `system` type, so they get a readable label instead of "system". */
function typeLabel(n: { type: Notification["type"]; title: string }): string {
  if (n.type === "system" && (n.title === "Task due today" || n.title === "Task overdue")) {
    return "task reminder";
  }
  return n.type.replace("_", " ");
}

/** Small pill switch — the app doesn't have a Switch component. */
function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? "bg-primary" : "bg-muted"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span className="absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-primary shadow-sm transition-transform duration-200">
        {checked ? <Check className="h-3 w-3" /> : null}
      </span>
    </button>
  );
}

/** Troubleshooting steps shown in the dialog when enabling class reminders
 *  (push subscription) fails on this device. */
function buildPushHelpSteps(code: PushErrorCode): string[] {
  if (isIosPwa()) {
    return [
      "Make sure Schedly was installed from your Home Screen — push alerts don't work in Safari tabs.",
      "Open iOS Settings → Schedly → Notifications and allow alerts.",
      "Reopen the app and turn reminders on again.",
    ];
  }
  if (code === "NOTIFICATION_PERMISSION_DENIED") {
    return [
      "Notifications are blocked for this site. Open your browser or phone settings and allow Schedly notifications.",
      "Then reopen the app and turn reminders on again.",
    ];
  }
  if (code === "SERVICE_WORKER_NOT_READY") {
    // A worker that fails to attach is almost always an in-app browser or a
    // flaky first load — not something a page refresh fixes.
    return [
      "Close the app completely, then open it again.",
      "On Android, use the Chrome app — in-app browsers (like Facebook or Messenger) block push alerts.",
      "Make sure you're online with a stable connection.",
      "If it still fails, check that notifications for Schedly aren't blocked in your device settings.",
    ];
  }
  return [
    "On Android, use the Chrome app — in-app browsers (like Facebook or Messenger) block push alerts.",
    "Make sure you're online with a stable connection, then try again.",
    "If it still fails, check that notifications for Schedly aren't blocked in your device settings.",
  ];
}

export function NotificationsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"notifications" | "reminders">("notifications");

  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  // Reminders state
  const [schedules, setSchedules] = useState<null | Awaited<ReturnType<typeof getUserSchedules>>>(null);
  const [reminders, setReminders] = useState<ReminderUi[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushUpdating, setPushUpdating] = useState(false);
  const [pushBlocked, setPushBlocked] = useState(false);
  const [pushMessage, setPushMessage] = useState<{ kind: "error"; text: string } | null>(null);
  const [pushTesting, setPushTesting] = useState(false);
  const [savingMinutes, setSavingMinutes] = useState<string | null>(null);
  const [pushHelpOpen, setPushHelpOpen] = useState(false);
  const [pushHelp, setPushHelp] = useState<{ reason: string; steps: string[] } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getUserSchedules(), getUserNotifications()])
      .then(([, dbNotifications]) => {
        if (!active) return;
        const dbNotes = dbNotifications.map((n) => ({
          id: n.id,
          type: n.type as Notification["type"],
          title: n.title,
          body: n.body,
          read: n.read,
          createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
        }));
        setNotifications(
          dbNotes.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        );
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Reset the shared detail-open state when leaving this page so the layout
  // doesn't keep hiding the avatar/floating buttons after navigation.
  useEffect(() => {
    return () => setNotificationDetailOpen(false);
  }, []);

  // Reminders data
  useEffect(() => {
    let active = true;
    getUserSchedules()
      .then((s) => {
        if (active) setSchedules(s);
      })
      .catch(() => {
        if (active) setSchedules([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getUserReminders()
      .then((r) => {
        if (active)
          setReminders(
            (r as unknown as ReminderUi[]).map((x) => ({
              ...x,
            }))
          );
      })
      .catch(() => {
        if (active) setReminders([]);
      });
    return () => {
      active = false;
    };
  }, []);

  // Restore push subscription state, and auto-enable where that's possible
  // without asking.
  //
  // `Notification.requestPermission()` is deliberately NOT called here. Browsers
  // treat an unsolicited prompt as spam: Chrome will frequently ignore or
  // auto-dismiss it, and that can burn the site's chance to prompt again for
  // the user. iOS additionally requires a real user gesture. So we only
  // auto-subscribe in the one case that needs no prompt at all: permission has
  // already been granted on this device but the push subscription is missing
  // (e.g. the VAPID key rotated, or the SW was re-registered).
  //
  // A device that has never been asked still requires one tap, so the toggle
  // below stays the way in.
  useEffect(() => {
    if (!isPushSupported()) return;
    let active = true;
    getPushState()
      .then(async (s) => {
        if (!active) return;
        if (s.kind === "granted") {
          if (s.subscribed) {
            setPushEnabled(true);
            return;
          }
          // Already permitted — finish the job without a prompt.
          const result = await enablePush();
          if (!active) return;
          if (result.ok) setPushEnabled(true);
          return;
        }
        if (s.kind === "denied") setPushBlocked(true);
      })
      .catch(() => {
        if (active) setPushEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Program local alarms whenever schedules or reminder settings change.
  useEffect(() => {
    if (!schedules || reminders.length === 0) return;
    programReminderAlarms(schedules as never, reminders as never).catch(() => {});
  }, [schedules, reminders]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const reminderByClass = new Map(reminders.map((r) => [r.classId, r]));
  const allClasses = (schedules ?? []).flatMap((s) =>
    s.classes.map((c) => ({ ...c, days: c.days as Day[] }))
  );

  const todayKey = DAY_KEYS[now.getDay()]!;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const todays = allClasses
    .filter((c) => c.days.includes(todayKey) && startMinutes(c.startTime) > nowMin)
    .sort((a, b) => startMinutes(a.startTime) - startMinutes(b.startTime));

  let visible = todays;
  let contextLabel = "Today";
  let contextSub =
    visible.length > 0
      ? `${visible.length} upcoming class${visible.length !== 1 ? "es" : ""}`
      : "";

  if (todays.length === 0) {
    let nextIdx = -1;
    for (let offset = 1; offset <= 7; offset++) {
      const idx = (now.getDay() + offset) % 7;
      if (allClasses.some((c) => c.days.includes(DAY_KEYS[idx]!))) {
        nextIdx = idx;
        break;
      }
    }
    const nextKey = nextIdx >= 0 ? DAY_KEYS[nextIdx]! : null;
    visible = nextKey
      ? allClasses
          .filter((c) => c.days.includes(nextKey))
          .sort((a, b) => startMinutes(a.startTime) - startMinutes(b.startTime))
      : [];
    contextLabel = nextKey ? DAY_FULL[nextKey] : "Upcoming";
    contextSub =
      visible.length > 0
        ? `${visible.length} upcoming class${visible.length !== 1 ? "es" : ""}`
        : "No classes found";
  }

  const togglePush = async () => {
    if (pushUpdating) return;
    setPushUpdating(true);
    setPushMessage(null);
    setPushBlocked(false);
    try {
      if (pushEnabled) {
        const result = await disablePush();
        if (result.ok) setPushEnabled(false);
        else setPushMessage({ kind: "error", text: result.reason });
      } else {
        const result = await enablePush();
        if (result.ok) setPushEnabled(true);
        else {
          if (result.code === "NOTIFICATION_PERMISSION_DENIED") setPushBlocked(true);
          setPushMessage({ kind: "error", text: result.reason });
          setPushHelp({ reason: result.reason, steps: buildPushHelpSteps(result.code) });
          setPushHelpOpen(true);
        }
      }
    } catch {
      setPushMessage({ kind: "error", text: "Something went wrong. Try again." });
    }
    setPushUpdating(false);
  };

  const handleRetryPush = () => {
    setPushHelpOpen(false);
    togglePush();
  };

  /** One tap for a first-time device: turn reminders on AND prove they work by
   *  sending a test push, so the user doesn't have to enable and then test as
   *  two separate steps. */
  const enableAndTest = async () => {
    if (pushUpdating || pushTesting) return;
    setPushUpdating(true);
    setPushMessage(null);
    setPushBlocked(false);
    try {
      const result = await enablePush();
      if (!result.ok) {
        if (result.code === "NOTIFICATION_PERMISSION_DENIED") setPushBlocked(true);
        setPushMessage({ kind: "error", text: result.reason });
        setPushHelp({ reason: result.reason, steps: buildPushHelpSteps(result.code) });
        setPushHelpOpen(true);
        return;
      }
      setPushEnabled(true);
      // Already subscribed now, so send the test the user was actually after.
      const test = await sendTestPush();
      if (!test.ok) setPushMessage({ kind: "error", text: test.reason });
    } catch {
      setPushMessage({ kind: "error", text: "Something went wrong. Try again." });
    } finally {
      setPushUpdating(false);
    }
  };

  const sendTest = async () => {
    if (pushTesting) return;
    setPushTesting(true);
    setPushMessage(null);
    const result = await sendTestPush();
    if (!result.ok) setPushMessage({ kind: "error", text: result.reason });
    setPushTesting(false);
  };

  const toggleReminder = async (classId: string) => {
    const r = reminderByClass.get(classId);
    if (!r) return;
    const res = (await updateReminder(r.id, { isActive: !r.isActive })) as UpdateReminderResult;
    if (res.success) {
      setReminders((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, isActive: !x.isActive } : x))
      );
    }
  };

  const changeMinutes = async (reminderId: string, minutes: number) => {
    setSavingMinutes(reminderId);
    try {
      const res = (await updateReminder(reminderId, { minutesBefore: minutes })) as UpdateReminderResult;
      if (res.success) {
        setReminders((prev) => prev.map((x) => (x.id === reminderId ? { ...x, minutesBefore: minutes } : x)));
      }
    } finally {
      setSavingMinutes(null);
    }
  };

  function markAsRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    markNotificationRead(id).catch(() => {});
  }

  function openNotification(notification: Notification) {
    setOpenId(notification.id);
    setNotificationDetailOpen(true);
    if (!notification.read) markAsRead(notification.id);
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    markAllNotificationsRead().catch(() => {});
  }

  function deleteNotification(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    deleteNotificationAction(id).catch(() => {});
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filtered =
    filter === "unread"
      ? notifications.filter((n) => !n.read)
      : notifications;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pt-4 md:pt-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-3">
          <HeaderBack to="/dashboard" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Notifications
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread — stay on top of your schedule.`
                : "You're all caught up."}
            </p>
          </div>
        </div>
        {tab === "notifications" && unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            className="shrink-0"
          >
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Segmented tabs. Capped and centred: stretched to the full 768px content
          width on desktop, each tab was ~370px wide holding two words, so it
          read as a toolbar rather than a tab switch. */}
      <div className="mx-auto grid max-w-md grid-cols-2 gap-1 rounded-2xl border border-border/30 bg-card/30 p-1 backdrop-blur-sm">
        {(
          [
            { key: "notifications", label: "Notifications", icon: Bell },
            { key: "reminders", label: "Class Reminders", icon: Clock },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium transition-all duration-200 sm:gap-2 sm:px-3 sm:text-sm ${
                active
                  ? "bg-card text-foreground shadow-sm ring-1 ring-border/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
              {t.label}
              {t.key === "notifications" && unreadCount > 0 && (
                <span className="hidden h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold leading-none text-destructive-foreground min-[360px]:flex">
                  {unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ---------- Notifications tab ---------- */}
      {tab === "notifications" && (
        <>
          {loaded && notifications.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex gap-1 rounded-xl bg-card/30 p-1 backdrop-blur-sm">
                {(["all", "unread"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`relative rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      filter === f
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f}
                    {f === "unread" && unreadCount > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold leading-none text-primary-foreground shadow-sm">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{filtered.length} shown</p>
            </div>
          )}

          <BoneSkeleton
            name="notifications-tab-list"
            loading={!loaded}
            fallback={
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-4 rounded-2xl border border-border/30 bg-card/30 px-4 py-4">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            }
          >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Bell className="h-7 w-7 text-primary/60" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {filter === "unread" ? "No unread notifications" : "No notifications yet"}
              </p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                {filter === "unread"
                  ? "Nice — you've read everything."
                  : "Upload a schedule photo and you'll see its updates here."}
              </p>
              {filter !== "unread" && (
                <Button className="mt-5" onClick={openQuickAdd}>
                  <Camera className="mr-1.5 h-4 w-4" />
                  Upload Schedule
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((notification) => {
                const Icon = typeIcons[notification.type];
                const unread = !notification.read;
                return (
                  <div
                    key={notification.id}
                    onClick={() => openNotification(notification)}
                    className={`group flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 transition-[background-color,box-shadow] hover:shadow-sm sm:gap-4 ${
                      unread
                        ? "border-primary/25 bg-primary/[0.04]"
                        : "border-border/30 bg-card/30"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${typeColors[notification.type]}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm font-semibold ${
                            unread ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {notification.title}
                        </p>
                        <span className="shrink-0 text-[11px] text-muted-foreground/60">
                          {timeAgo(notification.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {notification.body}
                      </p>
                    </div>
                    {/* Actions — visible on touch, hover-revealed on desktop */}
                    <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      {unread ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification.id);
                          }}
                          aria-label="Mark as read"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="hidden h-8 w-8" aria-hidden />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notification.id);
                        }}
                        aria-label="Delete notification"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </BoneSkeleton>
        </>
      )}

      {/* ---------- Class Reminders tab ---------- */}
      {tab === "reminders" && (
        <>
          {/* Reminders are on by default wherever push is already permitted —
              see the auto-enable effect above. There is no on/off card: the
              only question left is "am I on?", answered by the button below
              (turn on + prove it) or the test row once it's on. */}
          {!pushEnabled && isPushSupported() && !pushBlocked && !pushUpdating && (
            <Button
              onClick={enableAndTest}
              disabled={pushTesting}
              className="h-11 w-full font-semibold"
            >
              {pushTesting ? "Sending test…" : "Turn on reminders & send a test"}
            </Button>
          )}

          {pushMessage && (
            <p className="flex items-start gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {pushMessage.text}
            </p>
          )}

          {pushBlocked && !pushEnabled && (
            <p className="flex items-start gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {isIosPwa()
                ? "Notifications are blocked in iOS Settings. Go to Settings, Schedly, Notifications and allow them, then toggle this back on."
                : "Notifications are blocked in your browser or device settings. Allow Schedly to send notifications there, then toggle this back on."}
            </p>
          )}

          <p className="flex items-start gap-1.5 rounded-xl border border-border/40 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Alerts still work when the app is closed. On iPhone, tap Share,
            then Add to Home Screen first.
          </p>

          {pushEnabled && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/30 bg-card/30 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Test notifications</p>
                <p className="text-xs text-muted-foreground">
                  Send a test push to every device where you enabled reminders.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={sendTest}
                disabled={pushTesting}
                className="h-9 shrink-0"
              >
                {pushTesting ? "Sending..." : "Send test"}
              </Button>
            </div>
          )}

          <BoneSkeleton
            name="reminders-tab-list"
            loading={schedules === null}
            fallback={
              <div className="space-y-3">
                <Skeleton className="h-3 w-16" />
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 rounded-2xl border border-border/30 bg-card/30 px-4 py-4">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                    <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
                  </div>
                ))}
              </div>
            }
          >
          {schedules && schedules.length === 0 ? (
            <div className="flex items-center justify-center min-h-[50vh]">
              <div className="w-full max-w-sm rounded-2xl border-2 border-border bg-card shadow-sm p-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Camera className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">No classes yet</h3>
                <p className="mt-1 max-w-xs mx-auto text-sm text-muted-foreground leading-relaxed">
                  Upload a photo of your class schedule and we&rsquo;ll automatically create a reminder for each class.
                </p>
                <div className="mt-5">
                  <Button className="h-11 px-6 font-medium" onClick={() => router.push("/classes")}>
                    <Camera className="mr-2 h-4 w-4" />
                    Upload Schedule
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Context header: Today / next class day */}
              <div>
                <p className="text-sm font-semibold text-foreground">{contextLabel}</p>
                <p className="text-xs text-muted-foreground">{contextSub}</p>
              </div>

              <div className="space-y-2">
                {visible.map((c, i) => {
                  const reminder = reminderByClass.get(c.id);
                  const active = reminder?.isActive ?? false;
                  return (
                    <div
                      key={c.id ?? i}
                      className="flex items-center gap-3 rounded-2xl border border-border/30 bg-card/30 px-4 py-4 transition-[background-color,box-shadow] hover:shadow-sm sm:gap-4"
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: c.color + "1f", color: c.color }}
                      >
                        <Bell className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          {c.shortName?.trim() || c.code?.trim() || c.subject}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {fmtTime(c.startTime)} &ndash; {fmtTime(c.endTime)}
                          </span>
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {c.days.map((d) => DAY_SHORT[d]).join(", ")}
                          </span>
                          {c.room && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {c.room}
                            </span>
                          )}
                        </div>
                      </div>
                      {reminder && (
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <Toggle
                            checked={active}
                            onChange={() => toggleReminder(reminder.classId)}
                            label={`Toggle reminder for ${c.subject}`}
                          />
                          <div className="relative h-7 w-[4.5rem]">
                            <select
                              aria-label="Remind minutes before"
                              value={reminder.minutesBefore}
                              onChange={(e) => changeMinutes(reminder.id, Number(e.target.value))}
                              disabled={!active || savingMinutes === reminder.id}
                              className={`h-7 w-full rounded-md border border-border/60 bg-card px-1.5 text-[11px] font-medium text-foreground outline-none disabled:opacity-40 ${savingMinutes === reminder.id ? "invisible" : ""}`}
                            >
                              {MINUTE_OPTIONS.map((m) => (
                                <option key={m} value={m}>
                                  {m} min
                                </option>
                              ))}
                            </select>
                            {savingMinutes === reminder.id && (
                              <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-primary" />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {pushEnabled && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  Reminders fire exactly on your class times — even when the app
                  is closed.
                </p>
              )}
            </>
          )}
          </BoneSkeleton>
        </>
      )}

      {/* Gmail-style full view of a single notification */}
      {openId && (
        <NotificationDetail
          notification={notifications.find((n) => n.id === openId) ?? null}
          onBack={() => {
            setOpenId(null);
            setNotificationDetailOpen(false);
          }}
          onDelete={(id) => {
            deleteNotification(id);
            setOpenId(null);
            setNotificationDetailOpen(false);
          }}
        />
      )}

      {/* Help dialog when enabling class reminders fails */}
      <Dialog open={pushHelpOpen} onOpenChange={setPushHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Couldn&apos;t enable class reminders</DialogTitle>
            <DialogDescription>{pushHelp?.reason}</DialogDescription>
          </DialogHeader>
          {pushHelp && (
            <ol className="space-y-3 text-xs leading-relaxed text-muted-foreground">
              {pushHelp.steps.map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPushHelpOpen(false)}>
              Close
            </Button>
            <Button size="sm" onClick={handleRetryPush} disabled={pushUpdating}>
              {pushUpdating ? "Trying..." : "Try again"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NotificationDetail({
  notification,
  onBack,
  onDelete,
}: {
  notification: Notification | null;
  onBack: () => void;
  onDelete: (id: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  if (!notification) return null;
  const Icon = typeIcons[notification.type];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 animate-fade-up">
      <div className="relative z-10 flex h-full max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border/40 bg-background shadow-2xl">
        {/* Header bar */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={onBack}
            aria-label="Back to notifications"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="flex-1 truncate text-base font-semibold text-foreground">
            {notification.title}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(notification.id)}
            aria-label="Delete notification"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Message body — centered tall floating card reading pane */}
        <div className="flex-1 overflow-y-auto px-5 pb-10">
          <div className="mx-auto mt-2 max-w-2xl">
            <div className="flex items-start gap-4 rounded-2xl border border-border/30 bg-card/30 px-5 py-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${typeColors[notification.type]}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold leading-snug text-foreground">
                  {notification.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="capitalize">
                    {typeLabel(notification)}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                  <span>{new Date(notification.createdAt).toLocaleString()}</span>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                  <span>{timeAgo(notification.createdAt)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-border/30 bg-card/30 px-5 py-6 text-[15px] leading-relaxed text-foreground">
              {notification.body}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NotificationsPage;