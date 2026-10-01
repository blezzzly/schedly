"use client";

import { useEffect, useState } from "react";
import { getAdminStats, getUsers, getOnlineUsers, getFeedbacks, toggleAdminRole, sendBroadcastNotification, sendThankYouNotification, getLimitsStatsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { FloatingLabelTextarea } from "@/components/ui/floating-label-textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Skeleton as BoneSkeleton } from "boneyard-js/react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Megaphone, LayoutDashboard, Users, Radio, Globe, Smartphone, Apple, MessageSquare, Send, Search, Gauge, AlertTriangle, CheckCircle, Info, AlertCircle, Sparkles, Trash2, type LucideIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { HeaderBack } from "@/components/header-back";
import { NotificationBell } from "@/components/notification-bell";
import { friendlyError } from "@/server/lib/friendly-error";
import {
  AdminSectionRail,
  type AdminSectionId,
} from "@/components/admin-section-rail";
import { cn } from "@/lib/utils";

type AdminUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  isAdmin: boolean;
  emailVerified: boolean;
  clientType: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  avatarUrl?: string | null;
};

type FeedbackWithUser = {
  id: string;
  userId: string;
  email: string | null;
  type: string;
  subject: string | null;
  message: string;
  page: string | null;
  status: string;
  createdAt: Date;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
  };
};

type OnlineUser = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  isAdmin: boolean;
  clientType: string | null;
  lastSeenAt: Date;
  avatarUrl: string | null;
};

type LimitsStat = {
  id: string;
  name: string;
  description: string;
  usage: number;
  limit: number;
  bytesUsed?: number;
  bytesLimit?: number;
  unit: "requests" | "transactions" | "bandwidth";
  color: "ok" | "warn" | "critical";
  realtime?: {
    usage: number;
    limit: number | null;
    reset: string | null;
    remaining: number | null;
    isFreeTier: boolean;
    label: string;
  };
};

export default function AdminPage() {
  const [stats, setStats] = useState<{
    users: number;
    schedules: number;
    uploads: number;
    feedback: number;
  } | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackWithUser[]>([]);
  const [feedbacksLoading, setFeedbacksLoading] = useState(false);
  const [thankingId, setThankingId] = useState<string | null>(null);
  const [feedbackQuery, setFeedbackQuery] = useState("");
  const [feedbackType, setFeedbackType] = useState<"all" | "bug" | "feedback" | "question">("all");
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  // Which of the six sections is showing. Plain component state, not a route:
  // the admin page stays one page and one data load, and switching sections
  // doesn't unmount the others' loaded data.
  const [section, setSection] = useState<AdminSectionId>("overview");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const { user } = useAuth();
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);
  const [openPopupId, setOpenPopupId] = useState<string | null>(null);
  const [limitsStats, setLimitsStats] = useState<LimitsStat[] | null>(null);
  const [limitsDate, setLimitsDate] = useState("");
  const [limitsLoading, setLimitsLoading] = useState(false);
  const [limitsError, setLimitsError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [showOnlineList, setShowOnlineList] = useState(false);

  async function loadOnlineUsers() {
    setOnlineLoading(true);
    try {
      const data = (await getOnlineUsers()) as OnlineUser[];
      setOnlineUsers(data);
    } catch {
      // ignore — admin will see stale data on next refresh
    } finally {
      setOnlineLoading(false);
    }
  }

  // Refresh online users every 60s while overview tab is shown.
  useEffect(() => {
    void loadOnlineUsers();
    const t = setInterval(() => void loadOnlineUsers(), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function loadLimits(background = false) {
    if (!background) setLimitsLoading(true);
    try {
      const res = await getLimitsStatsAction();
      setLimitsStats(res.stats as LimitsStat[]);
      setLimitsDate(res.date);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setLimitsError(err instanceof Error ? err.message : "Failed to load limits");
    } finally {
      setLimitsLoading(false);
    }
  }

  useEffect(() => {
    void loadLimits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredFeedbacks = feedbacks.filter((fb) => {
    if (feedbackType !== "all" && fb.type !== feedbackType) return false;
    if (!feedbackQuery.trim()) return true;
    const q = feedbackQuery.toLowerCase();
    return (
      fb.message.toLowerCase().includes(q) ||
      (fb.subject?.toLowerCase().includes(q) ?? false) ||
      fb.user.email.toLowerCase().includes(q) ||
      fb.user.username.toLowerCase().includes(q) ||
      `${fb.user.firstName} ${fb.user.lastName}`.toLowerCase().includes(q)
    );
  });

  const feedbackCounts = {
    all: feedbacks.length,
    bug: feedbacks.filter((f) => f.type === "bug").length,
    feedback: feedbacks.filter((f) => f.type === "feedback").length,
    question: feedbacks.filter((f) => f.type === "question").length,
  };

  async function loadFeedbacks() {
    setFeedbacksLoading(true);
    try {
      const data = await getFeedbacks();
      setFeedbacks(data as FeedbackWithUser[]);
    } catch (err) {
      toast.error(friendlyError(err, "save"));
    }
    setFeedbacksLoading(false);
  }

  useEffect(() => {
    if (feedbacks.length === 0 && !feedbacksLoading) {
      void loadFeedbacks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [s, u] = await Promise.all([getAdminStats(), getUsers()]);
        setStats(s);
        setUsers(u as AdminUser[]);
      } catch {
        window.location.href = "/login";
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleToggle(userId: string) {
    setConfirmId(userId);
    setConfirmPassword("");
    setConfirmError("");
  }

  async function confirmToggle() {
    if (!confirmId) return;
    setTogglingId(confirmId);
    setConfirmId(null);
    try {
      const updated = await toggleAdminRole(confirmId, confirmPassword);
      setUsers((prev) =>
        prev.map((u) => (u.id === confirmId ? { ...u, isAdmin: updated.isAdmin } : u))
      );
    } catch (err) {
      toast.error(friendlyError(err, "save"));
    }
    setTogglingId(null);
  }

  async function handleThankYou(userId: string) {
    setThankingId(userId);
    try {
      await sendThankYouNotification(userId);
      toast.success("Thank you notification sent!");
    } catch (err) {
      toast.error(friendlyError(err, "reminder"));
    }
    setThankingId(null);
  }

  async function handleBroadcast(targetUserId?: string) {
    if (broadcasting) return;
    if (!broadcastMessage.trim()) {
      toast.error("Enter a message first.");
      return;
    }
    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      const res = await sendBroadcastNotification({
        title: broadcastTitle.trim() || undefined,
        message: broadcastMessage.trim(),
        targetUserId,
      });
      const scope = targetUserId ? "self (test)" : `${res.users} users`;
      const fcm = res.fcmConfigured
        ? `FCM push delivered: ${res.fcmSent}${res.fcmFailed ? `, failed: ${res.fcmFailed}` : ""}${res.fcmErrors?.length ? ` (${res.fcmErrors.join("; ")})` : ""}`
        : "FCM push NOT configured on server";
      const vapid = res.vapidConfigured
        ? `web push delivered: ${res.legacySent}`
        : "web push not configured";
      setBroadcastResult(
        `Sent to ${scope}. In-app: ${res.users} notification(s). ${fcm}; ${vapid}.`
      );
      toast.success("Notification sent.");
    } catch (err) {
      toast.error(friendlyError(err, "reminder"));
      setBroadcastResult(null);
    }
    setBroadcasting(false);
  }

  return (
    <div className="mx-auto max-w-6xl pt-4 md:pt-0">
      <BoneSkeleton
        name="admin-page"
        loading={loading}
        fallback={renderSkeleton()}
      >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderBack to="/dashboard" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Admin Dashboard
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage users, monitor activity, and broadcast updates.
            </p>
          </div>
        </div>
        <NotificationBell variant="inline" className="hidden md:flex" />
      </div>

      <div className="flex items-start gap-4 md:gap-5">
        <AdminSectionRail
          active={section}
          onChange={setSection}
          counts={{ feedback: stats?.feedback }}
        />

      <div className="min-w-0 flex-1 space-y-6">
          {/* Overview */}
          {section === "overview" && (
          <section className="space-y-3">
              <SectionHeader
                icon={LayoutDashboard}
                title="Overview"
                description="Platform activity at a glance"
              />
              {stats && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Users" value={stats.users} />
                  <StatCard label="Schedules" value={stats.schedules} />
                  <StatCard label="Uploads" value={stats.uploads} />
                  <StatCard label="Feedback" value={stats.feedback} />
                </div>
              )}

              {/* Online Users */}
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="flex h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                      Online Users
                    </CardTitle>
                    <CardDescription className="mt-0.5 text-xs">
                      Active in the last 5 minutes
                    </CardDescription>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOnlineList(!showOnlineList)}
                    className="text-xs text-primary hover:underline"
                  >
                    {showOnlineList ? "Hide" : "Show list"}
                  </button>
                </CardHeader>
                <CardContent className="pt-0">
                  {onlineLoading ? (
                    <div className="flex -space-x-2">
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-10 w-10 rounded-full" />
                      ))}
                    </div>
                  ) : onlineUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No users online right now.</p>
                  ) : (
                    <>
                      <div className="flex -space-x-2">
                        {onlineUsers.slice(0, 8).map((u, i) => (
                          <OnlineAvatar
                            key={u.id}
                            user={u}
                            style={{ zIndex: 8 - i }}
                          />
                        ))}
                        {onlineUsers.length > 8 && (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground ring-2 ring-background">
                            +{onlineUsers.length - 8}
                          </div>
                        )}
                      </div>
                      {showOnlineList && (
                        <div className="mt-3 space-y-1">
                          {onlineUsers.map((u) => (
                            <div key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40">
                              <OnlineAvatar user={u} size="sm" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : `@${u.username}`}
                                </p>
                                <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                              </div>
                              <span className="flex h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="Online" />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {/* Broadcast */}
          {section === "broadcast" && (
          <section className="space-y-3">
              <SectionHeader
                icon={Radio}
                title="Broadcast"
                description="Send a push notification to all users — or just yourself to test"
              />
              <Card className="border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Send Notification</CardTitle>
                  <CardDescription className="mt-0.5 text-xs">
                    Shows in every user&rsquo;s Notifications tab. A push alert is
                    also sent when the server&rsquo;s FCM keys are set and the device
                    has notifications enabled.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <TextField
                    label="Title (optional)"
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    maxLength={100}
                    disabled={broadcasting}
                  />
                  <FloatingLabelTextarea
                    label="Message"
                    inputClassName="min-h-[110px] resize-y"
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    maxLength={500}
                    disabled={broadcasting}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() => handleBroadcast()}
                      disabled={broadcasting}
                    >
                      {broadcasting ? (
                        <Spinner size={16} className="mr-1.5 text-primary-foreground" />
                      ) : (
                        <Megaphone className="mr-1.5 h-4 w-4" />
                      )}
                      Send to all users
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleBroadcast((user as { id?: string } | null)?.id)}
                      disabled={broadcasting}
                    >
                      Send to myself (test)
                    </Button>
                  </div>
                  {broadcastResult && (
                    <p className="text-sm text-muted-foreground">{broadcastResult}</p>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {/* Feedback */}
          {section === "feedback" && (
          <section className="space-y-4">
              <SectionHeader
                icon={MessageSquare}
                title="User Feedback"
                description="What users are saying — send a thank-you to acknowledge their input"
              />

              {/* Search + Filter */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search feedback..."
                    value={feedbackQuery}
                    onChange={(e) => setFeedbackQuery(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border/60 bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="flex gap-1">
                  {(["all", "bug", "feedback", "question"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFeedbackType(t)}
                      className={cn(
                        "h-9 rounded-lg px-3 text-xs font-medium transition-colors capitalize",
                        feedbackType === t
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {t} {feedbackCounts[t] > 0 && `(${feedbackCounts[t]})`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Feedback list */}
              {feedbacksLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="rounded-xl border border-border/40 bg-card/60 p-4">
                      <div className="flex items-start gap-3">
                        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Skeleton className="h-3.5 w-36" />
                            <Skeleton className="h-4 w-16 rounded-full" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-3/4" />
                        </div>
                        <Skeleton className="h-8 w-24 shrink-0 rounded-md" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredFeedbacks.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/40 py-16 text-center">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-foreground">No feedback found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {feedbacks.length > 0 ? "Try adjusting your search or filter" : "Feedback will appear here when users submit it"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredFeedbacks.map((fb) => (
                    <FeedbackRow
                      key={fb.id}
                      fb={fb}
                      thankingId={thankingId}
                      onThankYou={handleThankYou}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Users */}
          {section === "users" && (
          <section className="space-y-3">
              <SectionHeader
                icon={Users}
                title="User Management"
                description="Roles, devices, and account access"
              />
              <Card className="border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Users</CardTitle>
                </CardHeader>
                <CardContent>
                <div className="max-h-[560px] overflow-y-auto pr-1">
                {/* Desktop table */}
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border/40 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <th className="pb-3 pr-4">Name</th>
                        <th className="pb-3 pr-4">Email</th>
                        <th className="pb-3 pr-4">Username</th>
                        <th className="pb-3 pr-4">Device</th>
                        <th className="pb-3 pr-4">Joined</th>
                        <th className="pb-3 pr-4">Role</th>
                        <th className="pb-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {users.slice(0, visibleCount).map((user) => (
                        <tr key={user.id} className="transition-colors hover:bg-muted/30">
                          <td className="py-3 pr-4 font-medium text-foreground">
                            {user.firstName} {user.lastName}
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">{user.email}</td>
                          <td className="py-3 pr-4 text-muted-foreground">@{user.username}</td>
                          <td className="py-3 pr-4">
                            <DeviceBadge clientType={user.clientType} lastSeenAt={user.lastSeenAt} />
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {new Date(user.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </td>
                          <td className="py-3 pr-4">
                            <RoleBadge isAdmin={user.isAdmin} />
                          </td>
                          <td className="py-3 text-right">
                            <ToggleAdminButton user={user} togglingId={togglingId} onToggle={handleToggle} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="space-y-3 sm:hidden">
                  {users.slice(0, visibleCount).map((user) => (
                    <div key={user.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground text-sm">
                          {user.firstName} {user.lastName}
                        </p>
                        <RoleBadge isAdmin={user.isAdmin} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      <p className="text-xs text-muted-foreground">@{user.username}</p>
                      <div className="flex items-center justify-between pt-1">
                        <DeviceBadge clientType={user.clientType} lastSeenAt={user.lastSeenAt} />
                        <p className="text-xs text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        <ToggleAdminButton user={user} togglingId={togglingId} onToggle={handleToggle} />
                      </div>
                    </div>
                  ))}
                </div>
                </div>

                {visibleCount < users.length && (
                  <div className="flex shrink-0 justify-center pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleCount((c) => c + 5)}
                    >
                      Load more ({users.length - visibleCount} left)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            </section>
          )}

          {/* Service Limits */}
          {section === "limits" && (
          <section className="space-y-3">
              <SectionHeader
                icon={Gauge}
                title="Service Limits"
                description={`Daily usage caps for ${limitsDate || "today"} — auto-refreshes every 5 min · resets at midnight.`}
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  LIVE
                </span>
                {lastUpdated && <span>Last updated {lastUpdated}</span>}
                <span className="tabular-nums">· now {now.toLocaleTimeString()}</span>
                {!limitsLoading && limitsStats && (
                  <span>{limitsStats.filter((s) => s.realtime?.remaining === 0).length} cap(s) exhausted</span>
                )}
              </div>

              {limitsError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
                  {limitsError}
                </div>
              )}

              {limitsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-2xl" />
                  ))}
                </div>
              ) : limitsStats ? (
                <div className="space-y-4">
                  {limitsStats.map((stat) => (
                    <LimitsStatBar key={stat.id} stat={stat} />
                  ))}
                </div>
              ) : !limitsError ? (
                <p className="text-sm text-muted-foreground">No data available yet.</p>
              ) : null}

              {!limitsLoading && limitsStats && (
                <div className="rounded-xl border border-border/60 bg-muted/40 p-4 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Tips</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    <li>The OpenRouter card aggregates every configured key — it reads the provider&rsquo;s live rate-limit headers and sums them.</li>
                    <li>Once a key&rsquo;s reset time passes, the card automatically clears to a fresh window.</li>
                    <li>Gemini, QStash, and B2 counts come from local request counters.</li>
                    <li>B2 free tier: 1 GB/day download bandwidth + 2,500 Class B &amp; C transactions/day.</li>
                    <li>When a cap is at 90%+ it turns red — consider slowing down or adding a payment method.</li>
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* Test Pop-ups */}
          {section === "popups" && (
          <section className="space-y-4">
              <SectionHeader
                icon={Megaphone}
                title="Test Pop-ups"
                description="Preview every modal and dialog used in the app — click a card to trigger it"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {POPUP_DEMOS.map((demo) => (
                  <PopupPreviewCard
                    key={demo.id}
                    demo={demo}
                    isOpen={openPopupId === demo.id}
                    onOpen={() => setOpenPopupId(demo.id)}
                    onClose={() => setOpenPopupId(null)}
                  />
                ))}
              </div>
            </section>
          )}
      </div>
      </div>
        </BoneSkeleton>

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Confirm your password</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Re-enter your password to authorize this admin action.
            </p>
            <TextField
              label="Your password"
              type="password"
              autoFocus
              className="mt-4"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setConfirmError(""); }}
              onKeyDown={(e) => e.key === "Enter" && confirmToggle()}
            />
            {confirmError && (
              <p className="mt-2 text-xs text-destructive">{confirmError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setConfirmId(null)}>
                Cancel
              </Button>
              <Button className="flex-1 h-11" onClick={confirmToggle} disabled={!confirmPassword}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const AVATAR_COLORS = [
  "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  "bg-amber-500/10 text-amber-600 dark:text-amber-400",
];

function getAvatarColor(id: string) {
  const idx = id.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx] ?? AVATAR_COLORS[0]!;
}

const TYPE_CONFIG: Record<string, { label: string; variant: "destructive" | "default" | "outline"; icon?: string }> = {
  bug:       { label: "Bug",       variant: "destructive" },
  feedback:  { label: "Feedback",  variant: "default" },
  question:  { label: "Question",  variant: "outline" },
};

function FeedbackRow({
  fb,
  thankingId,
  onThankYou,
}: {
  fb: FeedbackWithUser;
  thankingId: string | null;
  onThankYou: (userId: string) => void;
}) {
  const typeCfg = TYPE_CONFIG[fb.type] ?? { label: fb.type, variant: "outline" as const };
  const colorClass = getAvatarColor(fb.user.id);
  const initials = (fb.user.firstName?.[0] || fb.user.username?.[0] || "?").toUpperCase();
  const displayName = fb.user.firstName || fb.user.lastName
    ? `${fb.user.firstName ?? ""} ${fb.user.lastName ?? ""}`.trim()
    : `@${fb.user.username}`;

  const date = new Date(fb.createdAt);
  const timeStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="group/single rounded-xl border border-border/40 bg-card/60 p-4 hover:bg-muted/20 transition-colors">
      {/* Top row: avatar + name + email + type + date + thank button */}
      <div className="flex items-start gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold", colorClass)}>
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-foreground leading-tight">{displayName}</span>
            <span className="text-xs text-muted-foreground">{fb.user.email}</span>
            <Badge variant={typeCfg.variant} className="text-[10px] h-4 px-1.5 uppercase tracking-wide">
              {typeCfg.label}
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto shrink-0">{timeStr}</span>
          </div>

          {fb.subject && (
            <p className="mt-1 text-xs font-medium text-foreground">{fb.subject}</p>
          )}

          <p className="mt-1.5 text-sm text-foreground/80 leading-relaxed line-clamp-3 whitespace-pre-wrap">
            {fb.message}
          </p>

          {fb.page && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              <span className="font-medium">From:</span> {fb.page}
            </p>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0 opacity-0 group-hover/single:opacity-100 transition-opacity max-sm:opacity-100 max-sm:mt-2"
          disabled={thankingId === fb.userId}
          onClick={() => onThankYou(fb.userId)}
        >
          {thankingId === fb.userId ? (
            <Spinner size={10} className="mr-1" />
          ) : (
            <Send className="mr-1.5 h-3 w-3" />
          )}
          Thank you
        </Button>
      </div>
    </div>
  );
}

function renderSkeleton() {
  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div className="flex items-start gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-3.5 w-72" />
          </div>
        </div>
        <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
      </div>

      {/* All sections skeleton */}
      <div className="space-y-6">
        <SectionSkeleton titleWidth="w-20" descWidth="w-44" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border-border/50">
              <CardContent className="pt-5 pb-4 text-center">
                <Skeleton className="h-7 w-14 mx-auto" />
                <Skeleton className="h-3 w-16 mx-auto mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
        <SectionSkeleton titleWidth="w-24" descWidth="w-80" />
        <Card className="border-border/50 shadow-sm">
          <CardContent className="space-y-3 pt-4">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-[110px] w-full rounded-md" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-36 rounded-md" />
              <Skeleton className="h-10 w-44 rounded-md" />
            </div>
          </CardContent>
        </Card>
        <SectionSkeleton titleWidth="w-32" descWidth="w-96" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-border/40 bg-card/60 p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 min-w-0 space-y-2">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function SectionSkeleton({ titleWidth, descWidth }: { titleWidth: string; descWidth: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <Skeleton className="h-6 w-6 rounded-md" />
      <div className="space-y-1">
        <Skeleton className={`h-4 ${titleWidth}`} />
        <Skeleton className={`h-3 ${descWidth}`} />
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="pt-5 pb-4 text-center">
        <p className="text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function OnlineAvatar({ user, size = "md", style }: {
  user: OnlineUser;
  size?: "sm" | "md";
  style?: React.CSSProperties;
}) {
  const initials = ((user.firstName?.[0] ?? user.username?.[0] ?? "?")).toUpperCase();
  const name = user.firstName || user.lastName
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
    : `@${user.username}`;
  const avatarSize = size === "sm" ? "h-7 w-7 text-[11px]" : "h-10 w-10 text-sm";
  const isRemote = user.avatarUrl?.startsWith("https");

  return (
    <div
      title={`${name} — ${user.email}`}
      style={style}
      className={cn(
        "group relative shrink-0 rounded-full bg-primary/10 ring-2 ring-background flex items-center justify-center overflow-hidden",
        avatarSize,
      )}
    >
      {user.avatarUrl ? (
        isRemote ? (
          <img
            src={user.avatarUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary/10 text-primary font-semibold text-xs">
            {initials}
          </div>
        )
      ) : (
        <span className="font-semibold text-primary">{initials}</span>
      )}
      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
    </div>
  );
}

type PopupDemo = {
  id: string;
  label: string;
  description: string;
  badge?: string;
  badgeVariant?: "default" | "destructive" | "outline";
  accentColor?: string;
  renderDialog: (close: () => void) => React.ReactNode;
};

const POPUP_DEMOS: PopupDemo[] = [
  {
    id: "basic-info",
    label: "Basic Info",
    description: "Simple dialog with title and description",
    badge: "base",
    badgeVariant: "outline",
    accentColor: "bg-blue-500/10 text-blue-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>About Schedly</DialogTitle>
            <DialogDescription>Schedly helps you manage your class schedule, assignments, and study sessions in one place. Built for students by students.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => close()}>Got it</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "success",
    label: "Success",
    description: "Confirmation dialog for successful action",
    badge: "success",
    badgeVariant: "default",
    accentColor: "bg-emerald-500/10 text-emerald-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-3 py-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle className="h-6 w-6 text-emerald-600" />
            </span>
            <DialogHeader>
              <DialogTitle>Schedule saved!</DialogTitle>
              <DialogDescription>Your class schedule has been updated successfully. Changes will reflect immediately.</DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => close()}>View Schedule</Button>
            <Button variant="outline" className="flex-1" onClick={() => close()}>Dismiss</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "warning",
    label: "Warning",
    description: "Alert dialog for important notices",
    badge: "warning",
    badgeVariant: "destructive",
    accentColor: "bg-amber-500/10 text-amber-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-3 py-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </span>
            <DialogHeader>
              <DialogTitle>Approaching limit</DialogTitle>
              <DialogDescription>You&apos;ve used 87% of your daily AI generation limit. Consider slowing down or upgrading your plan.</DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" className="flex-1" onClick={() => close()}>Upgrade Plan</Button>
            <Button variant="outline" className="flex-1" onClick={() => close()}>Dismiss</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "error",
    label: "Error",
    description: "Error dialog for failed actions",
    badge: "error",
    badgeVariant: "destructive",
    accentColor: "bg-red-500/10 text-red-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-3 py-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </span>
            <DialogHeader>
              <DialogTitle>Upload failed</DialogTitle>
              <DialogDescription>The image could not be processed. Please check that the file is a clear photo of your class schedule and try again.</DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" className="flex-1" onClick={() => close()}>Try Again</Button>
            <Button variant="outline" className="flex-1" onClick={() => close()}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "confirm-action",
    label: "Confirm Action",
    description: "Yes/No confirmation for critical actions",
    badge: "confirm",
    badgeVariant: "outline",
    accentColor: "bg-violet-500/10 text-violet-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark all as read?</DialogTitle>
            <DialogDescription>This will mark all {123} unread notifications as read. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => close()}>Cancel</Button>
            <Button className="flex-1" onClick={() => close()}>Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "destructive",
    label: "Destructive",
    description: "Delete confirmation with red danger styling",
    badge: "danger",
    badgeVariant: "destructive",
    accentColor: "bg-red-500/10 text-red-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete schedule?</DialogTitle>
            <DialogDescription>Permanently delete &ldquo;Mon-Wed-Fri Schedule&rdquo;? All associated classes and reminders will be removed. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => close()}>Keep it</Button>
            <Button variant="destructive" className="flex-1" onClick={() => close()}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "with-input",
    label: "With Input",
    description: "Dialog with text field input",
    badge: "input",
    badgeVariant: "outline",
    accentColor: "bg-cyan-500/10 text-cyan-600",
    renderDialog: () => {
      const [name, setName] = useState("");
      return (
        <Dialog open onOpenChange={(o) => { if (!o) { setName(""); close(); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename schedule</DialogTitle>
              <DialogDescription>Enter a new name for your class schedule.</DialogDescription>
            </DialogHeader>
            <TextField
              label="Schedule name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mon-Wed-Fri"
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setName(""); close(); }}>Cancel</Button>
              <Button className="flex-1" disabled={!name.trim()} onClick={() => close()}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      );
    },
  },
  {
    id: "loading",
    label: "Loading",
    description: "Dialog with spinner — action in progress",
    badge: "loading",
    badgeVariant: "outline",
    accentColor: "bg-orange-500/10 text-orange-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-4 py-4">
            <Spinner size={32} className="text-primary" />
            <DialogHeader>
              <DialogTitle>Generating flashcards…</DialogTitle>
              <DialogDescription>Creating your flashcards from your notes. This usually takes about 10–30 seconds.</DialogDescription>
            </DialogHeader>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "wide-content",
    label: "Wide Content",
    description: "Wide dialog for rich content or tables",
    badge: "wide",
    badgeVariant: "outline",
    accentColor: "bg-teal-500/10 text-teal-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Weekly Schedule</DialogTitle>
            <DialogDescription>Your class schedule for the current week</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => (
              <div key={day} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-4 py-3">
                <span className="font-medium text-foreground">{day}</span>
                <span className="text-muted-foreground">
                  {day === "Monday" ? "Fund. of Prog. 9–12, Math 1–3" :
                   day === "Tuesday" ? "Intr. to Comp. 1–6" :
                   day === "Wednesday" ? "No classes scheduled" :
                   day === "Thursday" ? "Fund. of Prog. 9–12, RPH 9–11" :
                   "Prof. Deve. 7–9, VLSD 1–4"}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => close()}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "two-column",
    label: "Two Column",
    description: "Two-column layout for detailed forms",
    badge: "2-col",
    badgeVariant: "outline",
    accentColor: "bg-indigo-500/10 text-indigo-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Class</DialogTitle>
            <DialogDescription>Fill in the details below to add a new class to your schedule.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <TextField label="Subject name" placeholder="e.g. Intr. to Comp." />
            </div>
            <TextField label="Short code" placeholder="ITC" />
            <TextField label="Room" placeholder="Lab 101" />
            <TextField label="Start time" placeholder="13:00" />
            <TextField label="End time" placeholder="18:00" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => close()}>Cancel</Button>
            <Button className="flex-1" onClick={() => close()}>Add Class</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },

  // ─── Real dialogs from across the site ─────────────────────────
  {
    id: "profile-photo",
    label: "Profile Photo",
    description: "Onboarding — pick a profile photo",
    badge: "onboarding",
    badgeVariant: "outline",
    accentColor: "bg-pink-500/10 text-pink-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Profile photo</DialogTitle>
            <DialogDescription>Add a photo so your friends can recognize you.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-2xl font-semibold text-primary">
              B
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => close()}>Skip</Button>
            <Button className="flex-1" onClick={() => close()}>Upload</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "syllabus-upload",
    label: "Syllabus Upload",
    description: "Syllabus — multi-step upload flow",
    badge: "syllabus",
    badgeVariant: "outline",
    accentColor: "bg-rose-500/10 text-rose-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add a Syllabus</DialogTitle>
            <DialogDescription>Upload a photo or PDF of your syllabus and we&apos;ll extract the important dates and topics automatically.</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border-2 border-dashed border-border/60 bg-muted/20 p-8 text-center">
            <p className="text-sm text-muted-foreground">Drop your syllabus here, or click to browse</p>
            <p className="mt-1 text-xs text-muted-foreground">JPG, PNG, PDF — max 20MB</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close()}>Cancel</Button>
            <Button onClick={() => close()}>Continue</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "support-schedly",
    label: "Support Schedly",
    description: "Settings — contact & feedback form",
    badge: "support",
    badgeVariant: "outline",
    accentColor: "bg-cyan-500/10 text-cyan-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Support Schedly</DialogTitle>
            <DialogDescription>Found a bug or have a suggestion? Let us know!</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <span className="text-xs font-medium text-foreground">Type</span>
              <div className="mt-1 flex gap-1">
                {["Bug", "Feedback", "Question"].map((t) => (
                  <Button key={t} variant="outline" size="sm" className="flex-1">{t}</Button>
                ))}
              </div>
            </div>
            <TextField label="Subject" placeholder="Brief summary" />
            <FloatingLabelTextarea label="Message" inputClassName="min-h-[100px] resize-y" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => close()}>Cancel</Button>
            <Button className="flex-1" onClick={() => close()}>Send</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "edit-schedule",
    label: "Edit Schedule",
    description: "Dashboard — add / edit classes for the day",
    badge: "edit",
    badgeVariant: "outline",
    accentColor: "bg-emerald-500/10 text-emerald-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Schedule</DialogTitle>
            <DialogDescription>Add or update the classes for this schedule.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {[
              { name: "Fund. of Prog.", code: "FOP", time: "7:00 AM – 9:00 AM" },
              { name: "Math. in the Modern World", code: "MMW", time: "1:00 PM – 2:30 PM" },
            ].map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.code} · {c.time}</p>
                </div>
                <Button variant="ghost" size="sm">Edit</Button>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close()}>Cancel</Button>
            <Button onClick={() => close()}>Save changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "schedule-preview",
    label: "Schedule Preview",
    description: "Dashboard — class detail card with actions",
    badge: "preview",
    badgeVariant: "outline",
    accentColor: "bg-violet-500/10 text-violet-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md overflow-hidden p-0">
          <div className="border-b border-border/40 bg-primary/5 p-4">
            <h2 className="text-base font-semibold text-foreground">Fund. of Prog.</h2>
            <p className="text-xs text-muted-foreground">FOP · Mon · 7:00 AM – 9:00 AM</p>
          </div>
          <div className="space-y-2 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Room</span>
              <span className="font-medium text-foreground">Lab 101</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Instructor</span>
              <span className="font-medium text-foreground">Prof. Cruz</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Color</span>
              <span className="h-4 w-4 rounded-full bg-blue-500" />
            </div>
          </div>
          <div className="flex gap-2 border-t border-border/40 p-3">
            <Button variant="outline" className="flex-1" onClick={() => close()}>Close</Button>
            <Button className="flex-1" onClick={() => close()}>Edit class</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "add-card",
    label: "Add Card",
    description: "Flashcards deck — add or edit a card",
    badge: "flashcards",
    badgeVariant: "outline",
    accentColor: "bg-fuchsia-500/10 text-fuchsia-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Card</DialogTitle>
            <DialogDescription>Add a new flashcard to this deck.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <TextField label="Question (front)" placeholder="What is photosynthesis?" />
            <FloatingLabelTextarea label="Answer (back)" inputClassName="min-h-[100px] resize-y" placeholder="The process by which plants…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close()}>Cancel</Button>
            <Button onClick={() => close()}>Add card</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "delete-card",
    label: "Delete Card",
    description: "Flashcards deck — confirm card delete",
    badge: "danger",
    badgeVariant: "destructive",
    accentColor: "bg-red-500/10 text-red-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete card?</DialogTitle>
            <DialogDescription>This card will be permanently removed from this deck. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close()}>Cancel</Button>
            <Button variant="destructive" onClick={() => close()}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "edit-deck",
    label: "Edit Deck",
    description: "Flashcards deck — edit deck name and settings",
    badge: "flashcards",
    badgeVariant: "outline",
    accentColor: "bg-fuchsia-500/10 text-fuchsia-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Deck</DialogTitle>
            <DialogDescription>Update the deck&apos;s name, subject, or description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <TextField label="Deck name" defaultValue="Biology 101" />
            <TextField label="Subject" defaultValue="Biology" />
            <FloatingLabelTextarea label="Description (optional)" inputClassName="min-h-[80px] resize-y" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close()}>Cancel</Button>
            <Button onClick={() => close()}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "new-deck",
    label: "New Deck",
    description: "Flashcards — generate deck from syllabus",
    badge: "flashcards",
    badgeVariant: "outline",
    accentColor: "bg-fuchsia-500/10 text-fuchsia-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Deck</DialogTitle>
            <DialogDescription>Generate flashcards from a syllabus or your notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <TextField label="Deck name" placeholder="e.g. Biology 101" />
            <TextField label="Subject (optional)" placeholder="Biology" />
            <TextField label="Topic (optional)" placeholder="Cell structure" />
            <div>
              <span className="text-xs font-medium text-foreground">Number of cards</span>
              <div className="mt-1 flex gap-1">
                {[5, 10, 15, 20, 30].map((n) => (
                  <Button key={n} variant={n === 10 ? "default" : "outline"} size="sm" className="flex-1">{n}</Button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close()}>Cancel</Button>
            <Button onClick={() => close()}>Generate</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "delete-deck",
    label: "Delete Deck",
    description: "Flashcards — confirm deck delete",
    badge: "danger",
    badgeVariant: "destructive",
    accentColor: "bg-red-500/10 text-red-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete deck?</DialogTitle>
            <DialogDescription>All {42} cards in this deck will be permanently deleted. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close()}>Cancel</Button>
            <Button variant="destructive" onClick={() => close()}>Delete deck</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "add-planner",
    label: "Add to Planner",
    description: "Planner — add or edit a task / event",
    badge: "planner",
    badgeVariant: "outline",
    accentColor: "bg-sky-500/10 text-sky-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Planner</DialogTitle>
            <DialogDescription>Schedule a new task or event in your planner.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <TextField label="Title" placeholder="Review notes" />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Date" type="date" />
              <TextField label="Time" type="time" />
            </div>
            <TextField label="Category" placeholder="Study" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close()}>Cancel</Button>
            <Button onClick={() => close()}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "delete-planner",
    label: "Delete Entry",
    description: "Planner — confirm entry delete",
    badge: "danger",
    badgeVariant: "destructive",
    accentColor: "bg-red-500/10 text-red-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete entry?</DialogTitle>
            <DialogDescription>This planner entry will be permanently removed. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close()}>Cancel</Button>
            <Button variant="destructive" onClick={() => close()}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "push-help",
    label: "Push Help",
    description: "Notifications — troubleshooting steps",
    badge: "notifications",
    badgeVariant: "outline",
    accentColor: "bg-amber-500/10 text-amber-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Couldn&apos;t enable class reminders</DialogTitle>
            <DialogDescription>Notifications are blocked in your browser. Allow them in settings, then try again.</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            {[
              "Refresh the page, then try the toggle again.",
              "On Android, use the Chrome app — in-app browsers block push alerts.",
              "Make sure you&apos;re online with a stable connection, then try again.",
            ].map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => close()}>Close</Button>
            <Button onClick={() => close()}>Try again</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "new-note",
    label: "New Note",
    description: "Notes — create or edit a note",
    badge: "notes",
    badgeVariant: "outline",
    accentColor: "bg-yellow-500/10 text-yellow-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Note</DialogTitle>
            <DialogDescription>Capture a thought, lecture, or idea.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <TextField label="Title" placeholder="Lecture notes — Sept 15" />
            <FloatingLabelTextarea label="Content" inputClassName="min-h-[180px] resize-y" placeholder="Start writing…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close()}>Cancel</Button>
            <Button onClick={() => close()}>Save note</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "new-folder",
    label: "New Folder",
    description: "Notes — create a folder to organize notes",
    badge: "notes",
    badgeVariant: "outline",
    accentColor: "bg-yellow-500/10 text-yellow-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>Group related notes together.</DialogDescription>
          </DialogHeader>
          <TextField label="Folder name" placeholder="e.g. Lecture notes" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close()}>Cancel</Button>
            <Button onClick={() => close()}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "view-profile",
    label: "View Profile Photo",
    description: "Profile — full-screen view of avatar",
    badge: "profile",
    badgeVariant: "outline",
    accentColor: "bg-pink-500/10 text-pink-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <div className="flex justify-center">
            <div className="flex h-48 w-48 items-center justify-center rounded-full bg-primary/10 text-6xl font-semibold text-primary ring-4 ring-border/40">
              B
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => close()}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: "update-announcement",
    label: "Update Announcement",
    description: "Dashboard — one-time popup on app open",
    badge: "system",
    badgeVariant: "default",
    accentColor: "bg-indigo-500/10 text-indigo-600",
    renderDialog: (close) => (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent showCloseButton={false}>
          <div className="flex flex-col items-center text-center gap-3 py-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </span>
            <DialogHeader>
              <DialogTitle>We&apos;re back!</DialogTitle>
              <DialogDescription>Schedly is back online after a quick maintenance break. Sorry for the interruption — everything&apos;s good to go now.</DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => close()}>Got it</Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  },
];

function PopupPreviewCard({ demo, isOpen, onOpen, onClose }: {
  demo: PopupDemo;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="group flex flex-col items-start gap-2 rounded-xl border border-border/40 bg-card/60 p-4 text-left transition-all hover:border-primary/30 hover:bg-muted/30 hover:shadow-sm"
      >
        <div className="flex w-full items-center justify-between">
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", demo.accentColor ?? "bg-muted text-muted-foreground")}>
            {demo.badge === "success" ? <CheckCircle className="h-4 w-4" /> :
             demo.badge === "error" ? <AlertCircle className="h-4 w-4" /> :
             demo.badge === "warning" ? <AlertTriangle className="h-4 w-4" /> :
             demo.badge === "destructive" ? <Trash2 className="h-4 w-4" /> :
             demo.badge === "loading" ? <Sparkles className="h-4 w-4" /> :
             <Info className="h-4 w-4" />}
          </span>
          {demo.badge && (
            <Badge variant={demo.badgeVariant as "default" | "destructive" | "outline"} className="text-[10px]">
              {demo.badge}
            </Badge>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{demo.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{demo.description}</p>
        </div>
      </button>

      {isOpen && demo.renderDialog(onClose)}
    </>
  );
}

function RoleBadge({ isAdmin }: { isAdmin: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isAdmin
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {isAdmin ? "Admin" : "User"}
    </span>
  );
}

function DeviceBadge({
  clientType,
  lastSeenAt,
}: {
  clientType: string | null;
  lastSeenAt: Date | null;
}) {
  const config: Record<string, { label: string; cls: string; Icon: LucideIcon }> = {
    web: { label: "Website", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400", Icon: Globe },
    "pwa-android": { label: "PWA · Android", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", Icon: Smartphone },
    "pwa-ios": { label: "PWA · iOS", cls: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400", Icon: Apple },
  };
  const c = config[clientType ?? ""];

  return (
    <span className="inline-flex items-center gap-2">
      {c ? (
        <span
          title={
            lastSeenAt
              ? `Last active: ${new Date(lastSeenAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : "Never reported"
          }
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${c.cls}`}
        >
          <c.Icon className="h-3 w-3" />
          {c.label}
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          Unknown
        </span>
      )}
    </span>
  );
}

function ToggleAdminButton({
  user,
  togglingId,
  onToggle,
}: {
  user: AdminUser;
  togglingId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      disabled={togglingId === user.id}
      onClick={() => onToggle(user.id)}
    >
      {togglingId === user.id
        ? "Updating..."
        : user.isAdmin
          ? "Remove Admin"
          : "Make Admin"}
    </Button>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1_024) return `${(n / 1_024).toFixed(1)} KB`;
  return `${n} B`;
}

function LimitsStatBar({ stat }: { stat: LimitsStat }) {
  const isBandwidth = stat.unit === "bandwidth";
  const usage = isBandwidth ? stat.bytesUsed ?? stat.usage : stat.usage;
  const limit = isBandwidth ? stat.bytesLimit ?? stat.limit : stat.limit;
  const pct = limit > 0 ? Math.min(100, (usage / limit) * 100) : 100;

  const colors = {
    ok: "bg-emerald-500",
    warn: "bg-amber-500",
    critical: "bg-red-500",
  } as const;

  const badge = {
    ok: {
      text: "OK",
      icon: CheckCircle,
      cls: "bg-emerald-500/10 text-emerald-600",
    },
    warn: {
      text: "70%+",
      icon: Gauge,
      cls: "bg-amber-500/10 text-amber-600",
    },
    critical: {
      text: "90%+",
      icon: AlertTriangle,
      cls: "bg-red-500/10 text-red-600",
    },
  } as const;

  const b = badge[stat.color];
  const usageLabel = isBandwidth ? formatBytes(usage) : formatNumber(usage);
  const limitLabel = isBandwidth ? formatBytes(limit) : formatNumber(limit);

  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{stat.name}</h3>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", b.cls)}>
                <b.icon className="h-3 w-3" />
                {b.text}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{stat.description}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold text-foreground">
              {usageLabel}
              <span className="text-muted-foreground"> / {limitLabel}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">{pct.toFixed(1)}%</div>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", colors[stat.color])}
            style={{ width: `${Math.max(pct, 1)}%` }}
          />
        </div>
        {stat.realtime && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {stat.realtime.isFreeTier && <span>Free tier — ~50 req/day per key</span>}
            {stat.realtime.limit != null && (
              <span>
                Provider: {formatNumber(stat.realtime.usage)}/{formatNumber(stat.realtime.limit)}
                {stat.realtime.reset ? ` · resets ${new Date(stat.realtime.reset).toLocaleTimeString()}` : ""}
                {stat.realtime.remaining === 0 && (
                  <span className="font-semibold text-red-600"> · EXHAUSTED</span>
                )}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}