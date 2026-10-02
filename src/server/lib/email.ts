import { Resend } from "resend";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[Email] RESEND_API_KEY not set — skipping email");
    return;
  }

  const resend = new Resend(apiKey);
  const data = await resend.emails.send({
    from: `Schedly <${process.env.RESEND_FROM || process.env.EMAIL_FROM || "noreply@schedly.shop"}>`,
    to,
    subject,
    html,
  });
  return data;
}
