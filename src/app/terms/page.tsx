import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Schedly.",
};

const sections = [
  {
    h: "1. Acceptance of Terms",
    body: [
      "By registering for or using Schedly (the \"app\"), you agree to these Terms of Service. If you do not agree, please do not use the app.",
    ],
  },
  {
    h: "2. Using Schedly",
    body: [
      "Schedly is provided for your personal, non-commercial use to manage your class schedules, tasks, and reminders.",
      "You are responsible for the accuracy of the schedule information you submit and for keeping your account credentials secure.",
    ],
  },
  {
    h: "3. Content You Provide",
    body: [
      "You retain allownership of the schedules and images you upload.",
      "You grant Schedly a limited license to process your content to provide the service (for example, AI text extraction).",
      "You must not upload illegal, infringing, or malicious content.",
    ],
  },
  {
    h: "4. Acceptable Use",
    body: [
      "You agree not to abuse, overload, or attempt to bypass the app's security, rate limits, or access controls.",
      "We resolve the right to suspend accounts that violate these terms.",
    ],
  },
  {
    h: "5. Intellectual Property",
    body: [
      "The Schedly name, logo, design, and software are owned by Schedly and are protected by relevant laws.",
      "You may not copy, modify, or redistribute the app without permission.",
    ],
  },
  {
    h: "6. Termination",
    body: [
      "You can stop using the app at any time and request account deletion through Help & Feedback.",
      "We may suspend or terminate access for misuse, in which case we will try to notify you.",
    ],
  },
  {
    h: "7. Disclaimer & Limitation of Liability",
    body: [
      "Schedly is provided \"as is\" without warranties of any kind. We strive for high accuracy but do not guarantee that AI extraction or attendance is 100% correct.",
      "To the maximum extent permitted by law, we are not liable for direct or indirect damages arising from your use of the app.",
    ],
  },
  {
    h: "8. Changes to These Terms",
    body: [
      "We may update these Terms from time to time. Continued use of the app after changes means you accept the new Terms.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: February 2026</p>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Welcome to Schedly. These Terms of Service describe the rules and responsibilities for using the
        app for your schedule.
      </p>
      <div className="mt-8 space-y-8">
        {sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-semibold text-foreground">{s.h}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
      <div className="mt-10">
        <Link href="/" className="text-sm font-semibold text-violet-600 hover:underline dark:text-violet-400">
          ← Back to Schedly
        </Link>
      </div>
    </div>
  );
}