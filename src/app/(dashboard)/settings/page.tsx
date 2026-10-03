"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { authClient } from "@/lib/auth-client";
import { cacheRemove } from "@/lib/offline-cache";
import { deleteAccount } from "./actions";
import { useThemeConfig, THEME_PRESETS } from "@/features/theme";
import { cn } from "@/lib/utils";
import { ShieldCheck, LifeBuoy, Gauge } from "lucide-react";
import { HeaderBack } from "@/components/header-back";
import { NotificationBell } from "@/components/notification-bell";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Skeleton as BoneSkeleton } from "boneyard-js/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SupportSchedly } from "@/features/support/components/support-schedly";

type UserWithExtras = {
  firstName?: string;
  lastName?: string;
  email?: string;
  emailVerified?: boolean;
  username?: string;
  createdAt?: string;
  birthdate?: string;
  sex?: string;
  image?: string;
  avatarUrl?: string;
  isAdmin?: boolean;
} & Record<string, unknown>;

import { friendlyError } from "@/server/lib/friendly-error";
export default function SettingsPage() {
  const { user, isLoading } = useAuth();
  const u = user as UserWithExtras | null;
  const searchParams = useSearchParams();
  const initialTab =
    searchParams.get("tab") === "support" ||
    searchParams.get("tab") === "theme" ||
    searchParams.get("tab") === "security"
      ? (searchParams.get("tab") as string)
      : "account";
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div className="mx-auto max-w-4xl pt-4 md:pt-0">
      <BoneSkeleton
        name="settings-page"
        loading={isLoading}
        fallback={
          <div className="space-y-6">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
              <div className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div>
                  <Skeleton className="h-7 w-32" />
                  <Skeleton className="h-4 w-64 mt-1.5" />
                </div>
              </div>
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            <div className="flex flex-col gap-6 md:flex-row md:items-start">
              <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col md:overflow-visible md:rounded-2xl md:border md:border-border/60 md:bg-card/80 md:p-2 md:backdrop-blur-sm">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-xl" />
                ))}
              </nav>
              <div className="min-w-0 flex-1 space-y-4">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center gap-4 sm:flex-row">
                      <Skeleton className="h-20 w-20 rounded-full shrink-0" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-24" />
                        <div className="flex gap-2 pt-1">
                          <Skeleton className="h-8 w-16 rounded-lg" />
                          <Skeleton className="h-8 w-20 rounded-lg" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <Skeleton className="h-5 w-32" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-border/40">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        }
      >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderBack to="/dashboard" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Settings
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Manage your account, security, theme, and more.
            </p>
          </div>
        </div>
        <NotificationBell variant="inline" className="hidden md:flex" />
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        {/* Left nav */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col md:overflow-visible md:rounded-2xl md:border md:border-border/60 md:bg-card/80 md:p-2 md:backdrop-blur-sm md:sticky md:top-6">
          {[
            { id: "account", label: "Account" },
            { id: "security", label: "Security" },
            { id: "theme", label: "Theme" },
            { id: "support", label: "Support" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {activeTab === "account" && <AccountTab u={u} />}
          {activeTab === "security" && <SecurityTab />}
          {activeTab === "theme" && <ThemeCard />}
          {activeTab === "support" && (
            <div className="space-y-3">
              {u?.isAdmin && (
                <div className="space-y-3">
                  <SettingsLinkCard href="/admin" icon={<ShieldCheck className="h-4 w-4 text-primary" />} title="Admin Dashboard" description="Manage the Schedly admin panel." />
                  <SettingsLinkCard href="/admin/limits" icon={<Gauge className="h-4 w-4 text-primary" />} title="Service Limits" description="Check daily usage caps for processing, QStash & B2." />
                </div>
              )}
              <SettingsLinkCard href="/feedback" icon={<LifeBuoy className="h-4 w-4 text-primary" />} title="Help & Feedback" description="Report issues or share your thoughts." />
              <SupportSchedly />
            </div>
          )}
        </div>
      </div>
      </BoneSkeleton>
    </div>
  );
}

function SettingsLinkCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="transition-shadow hover:shadow-none">
        <CardContent className="flex items-center gap-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/15">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <svg
            className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </CardContent>
      </Card>
    </Link>
  );
}

function ThemeCard() {
  const { activeId, setTheme } = useThemeConfig();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Theme</CardTitle>
        <CardDescription>Pick the accent color of your app.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setTheme(preset.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                activeId === preset.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <span
                className="h-6 w-6 shrink-0 rounded-full ring-1 ring-black/5 transition-transform"
                style={{ backgroundColor: preset.swatch }}
              />
              <span className="flex-1">{preset.name}</span>
              {activeId === preset.id && (
                <svg
                  className="h-4 w-4 shrink-0 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AccountTab({ u }: { u: UserWithExtras | null }) {
  const { refetchSession } = useAuth();
  const [form, setForm] = useState({
    firstName: u?.firstName || "",
    lastName: u?.lastName || "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setError("");
    setSuccess(false);

    setLoading(true);
    try {
      const result = await authClient.updateUser({
        name: form.lastName ? `${form.firstName} ${form.lastName}` : form.firstName,
        firstName: form.firstName,
        lastName: form.lastName,
      } as Parameters<typeof authClient.updateUser>[0]);

      if (result.error) {
        setError(friendlyError(result.error, "save"));
      } else {
        setSuccess(true);
        refetchSession();
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Personal Information</CardTitle>
          <CardDescription>Update your name and profile details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="First name"
              value={form.firstName}
              onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
            />
            <TextField
              label="Last name"
              value={form.lastName}
              onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
            />
          </div>

          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center dark:border-green-800 dark:bg-green-950">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Profile updated!</p>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <Button onClick={handleSave} disabled={loading} className="h-10 font-medium">
            {loading ? "Saving..." : "Save changes"}
          </Button>
        </CardContent>
      </Card>

      <DeleteAccountCard username={u?.username || ""} />
    </div>
  );
}

function DeleteAccountCard({ username }: { username: string }) {
  const [phrase, setPhrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // The field shows a decorative "@", so people naturally type it. Accept it
  // rather than failing with "doesn't match" while they look at the very hint
  // we put there.
  const typed = phrase.trim().replace(/^@+/, "");
  const matches = typed === username;

  async function handleDelete() {
    if (!matches) return;
    setLoading(true);
    setError("");
    try {
      const result = await deleteAccount(username);
      if ("error" in result) {
        setError(result.error);
        setLoading(false);
        return;
      }
      // Clear the session cookie before leaving the app.
      await authClient.signOut();
      // Drop the cached session so it can't resurrect the deleted account
      // offline.
      await cacheRemove("session:user").catch(() => {});
      router.push("/");
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-base text-destructive">Delete account</CardTitle>
        <CardDescription>
          Permanently deletes your account and all your data &mdash; schedules, notes,
          to-dos, and reminders. This action cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <TextField
            label="Type your username to confirm"
            leading="@"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={username}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            // `inputClassName`, not `className`: `className` lands on TextField's
            // wrapper div, so the green "matched" border this card has always
            // tried to show was being applied to an element with no border.
            inputClassName={matches ? "border-green-500" : undefined}
          />
          {matches && (
            <p className="text-xs font-medium text-green-600 dark:text-green-400">
              Match &mdash; the button is now enabled.
            </p>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          variant="destructive"
          disabled={!matches || loading}
          onClick={handleDelete}
          className="h-10 font-medium"
        >
          {loading ? "Deleting..." : "Delete this account"}
        </Button>
      </CardContent>
    </Card>
  );
}

function SecurityTab() {
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleChangePassword() {
    setError("");
    setSuccess(false);

    if (passwordForm.newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.changePassword({
        newPassword: passwordForm.newPassword,
        currentPassword: passwordForm.currentPassword,
      });

      if (result.error) {
        setError(friendlyError(result.error, "save"));
      } else {
        setSuccess(true);
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Change Password</CardTitle>
        <CardDescription>Make sure your account stays secure.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TextField
          label="Current password"
          type="password"
          value={passwordForm.currentPassword}
          onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
          autoComplete="current-password"
        />
        <TextField
          label="New password"
          type="password"
          value={passwordForm.newPassword}
          onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
          autoComplete="new-password"
        />
        <TextField
          label="Confirm new password"
          type="password"
          value={passwordForm.confirmPassword}
          onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
          autoComplete="new-password"
        />

        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center dark:border-green-800 dark:bg-green-950">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">Password updated!</p>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <Button onClick={handleChangePassword} disabled={loading} className="h-10 font-medium">
          {loading ? "Updating..." : "Update password"}
        </Button>
      </CardContent>
    </Card>
  );
}

