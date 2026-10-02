import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Schedly collects, uses, and protects your data.",
};

const sections = [
  {
    h: "1. Information We Collect",
    body: [
      "Account information — email address and name you provide when registering.",
      "Schedule data — class schedules you upload, along with the photos or images you submit for AI extraction.",
      "Usage data — anonymous analytics such as pages visited and app interactions to improve the product.",
    ],
  },
  {
    h: "2. How We Use Your Data",
    body: [
      "To power Schedly's core features: extracting schedules from images, generating timetables, reminders, and statistics.",
      "To keep your account secure and prevent abuse.",
      "To improve the app through aggregated, anonymized insights.",
      "We never sell your personal data to third parties.",
    ],
  },
  {
    h: "3. Schedule Images",
    body: [
      "Uploaded images are processed to extract your class schedule for the extracted, then deleted from our active processing pipeline.",
      "Images are never shared publicly or used for any purpose other than the extraction process.",
    ],
  },
  {
    h: "4. Data Security",
    body: [
      "We use industry-standard security measures including encryption in transit, secure authentication, and strict access controls.",
      "While we work hard to protect your data, no method of transmission or storage is 100% secure.",
    ],
  },
  {
    h: "5. Data Retention",
    body: [
      "Your schedule and account data remain stored while your account is active.",
      "You may request deletion of your account to delete all associated account — use Help & Feedback in the app to request this.",
    ],
  },
  {
    h: "6. Your Rights",
    body: [
      "You can access, correct, or delete your personal information at any time.",
      "You can contact us through the in-app Help & Feedback for any privacy requests.",
    ],
  },
  {
    h: "7. Changes to This Policy",
    body: [
      "We may update this policy from time to time. Significant changes will be notified within the app so you stay informed.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: February 2026</p>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Your privacy matters to us. This policy explains what Schedly collects, why we collect it, and how
        you can control it. By using Schedly, you agree to the practices described below.
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