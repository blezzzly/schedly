import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db/client";
import { sendEmail } from "@/server/lib/email";
import { isGuestEmail } from "@/server/lib/guest-identity";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  user: {
    additionalFields: {
      username: {
        type: "string",
        required: false,
        unique: true,
      },
      firstName: {
        type: "string",
        required: true,
      },
      lastName: {
        type: "string",
        required: true,
      },
      birthdate: {
        type: "date",
        required: false,
      },
      sex: {
        type: "string",
        required: false,
      },
      isAdmin: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      // Server-managed. Declaring it here is what puts it on the session user —
      // the client reads it to render the guest banner, and without this the
      // field exists in the DB but arrives as undefined. `input: false` keeps
      // it out of updateUser so a client can't flag its own account as a guest.
      isAnonymous: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      avatarUrl: {
        type: "string",
        required: false,
      },
      city: {
        type: "string",
        required: false,
      },
      school: {
        type: "string",
        required: false,
      },
      course: {
        type: "string",
        required: false,
      },
      year: {
        type: "number",
        required: false,
      },
      failedAttempts: {
        type: "number",
        required: false,
        defaultValue: 0,
        input: false,
      },
      lockedUntil: {
        type: "date",
        required: false,
        input: false,
      },
      onboardingCompleted: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
      defaultReminderMinutes: {
        type: "number",
        required: false,
        defaultValue: 15,
      },
      reminderStartDate: {
        type: "string",
        required: false,
      },
      notificationsEnabled: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
      timezone: {
        type: "string",
        required: false,
        defaultValue: "Asia/Manila",
      },
      theme: {
        type: "string",
        required: false,
        defaultValue: "system",
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    ...(process.env.RESEND_API_KEY
      ? {
          requireEmailVerification: true,
        }
      : {}),
    sendResetPassword: async ({ user, token }) => {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const resetCallbackUrl = `${appUrl}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent(`${appUrl}/reset-password?token=${token}`)}`;
      await sendEmail({
        to: user.email,
        subject: "Reset your Schedly password",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="margin-bottom: 16px;">Reset your password</h2>
            <p style="margin-bottom: 24px; color: #555;">
              Hi ${user.name || "there"},<br/><br/>
              We received a request to reset your password. Click below to set a new one:
            </p>
            <a href="${resetCallbackUrl}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
              Reset Password
            </a>
            <p style="margin-top: 24px; color: #999; font-size: 13px;">
              If you didn't request this, you can safely ignore this email. Link expires in 1 hour.
            </p>
          </div>
        `,
      });
    },
    password: {
      hash: async (password) => {
        const bcrypt = await import("bcryptjs");
        return bcrypt.hash(password, 12);
      },
      verify: async ({ password, hash }) => {
        const bcrypt = await import("bcryptjs");
        return bcrypt.compare(password, hash);
      },
    },
  },
  ...(process.env.RESEND_API_KEY
    ? {
        emailVerification: {
          sendOnSignUp: true,
          sendOnSignIn: true,
          autoSignInAfterVerification: true,
          sendVerificationEmail: async ({ user, url }) => {
            // Guest accounts are created with a throwaway address in a domain
            // we don't control, so the mail would bounce. Their email is
            // marked verified server-side right after sign-up instead.
            if (isGuestEmail(user.email)) return;
            try {
              await sendEmail({
                to: user.email,
                subject: "Verify your Schedly account",
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                    <h1 style="color: #e11d48; font-size: 24px; margin-bottom: 8px;">Welcome to Schedly!</h1>
                    <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                      Thanks for signing up. Please verify your email address by clicking the button below.
                    </p>
                    <a href="${url}" style="display: inline-block; background-color: #e11d48; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">
                      Verify Email Address
                    </a>
                    <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
                      If the button doesn't work, copy and paste this link into your browser:<br/>
                      <a href="${url}" style="color: #e11d48;">${url}</a>
                    </p>
                    <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
                      If you didn't create an account, you can safely ignore this email.
                    </p>
                  </div>
                `,
              });
            } catch (err) {
              console.error("[Auth] Failed to send verification email:", err);
            }
          },
        },
      }
    : {}),
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/api/auth/sign-in/email": {
        window: 10,
        max: 5,
      },
      "/api/auth/sign-up/email": {
        window: 60,
        max: 3,
      },
      "/api/auth/sign-in/social": {
        window: 10,
        max: 20,
      },
    },
  },
  socialProviders: {},
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Social sign-up (Google/GitHub) doesn't send our required fields, so
          // derive them from the provider profile. Sign-ups that DO carry them
          // (email, and guests) are left alone — this hook used to overwrite
          // unconditionally, which discarded a guest's deliberately blank last
          // name.
          const name = (user.name ?? "").trim();
          const email = (user.email ?? "").trim();
          const nameParts = name.split(/\s+/);
          const raw = user as Record<string, unknown>;
          const providedFirst = typeof raw.firstName === "string" ? raw.firstName.trim() : "";
          const providedLast = typeof raw.lastName === "string" ? raw.lastName.trim() : "";
          const providedUsername = raw.username;

          const firstName =
            providedFirst || nameParts[0] || email.split("@")[0] || "User";
          // Deliberately NOT `|| firstName`. A single-word name — "Cher", or a
          // guest's picked "Nikolai" — has no last part, and copying the first
          // name into it made the profile header render "Nikolai Nikolai".
          // Leaving it empty is fine: every display site already falls back to
          // the first name on its own (`lastName ? a + b : a`).
          const lastName = providedLast || nameParts.slice(1).join(" ");

          return {
            data: {
              ...user,
              firstName,
              lastName,
              // Only derive a username when the sign-up didn't provide one
              // (social providers). Email sign-ups keep the username the user chose.
              username: typeof providedUsername === "string" && providedUsername.trim()
                ? providedUsername.trim()
                : encodeURIComponent(email.split("@")[0] ?? "user").replace(/[^a-zA-Z0-9_.]/g, "") ||
                  `user${Math.random().toString(36).slice(2, 8)}`,
            },
          };
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7,
    },
  },
  advanced: {
    cookies: {
      sessionToken: {
        name: process.env.NODE_ENV === "production" ? "__Host-schedly-session" : "schedly-session",
        attributes: {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        },
      },
    },
    ipAddress: {
      ipv6Subnet: 64,
    },
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ],
  plugins: [nextCookies()],
});
