import { FormRow } from "./types";
import { escapeHtml } from "./util";

async function resendSend(apiKey: string, from: string, to: string, subject: string, html: string): Promise<void> {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
}

export function submissionEmailHtml(formName: string, data: Record<string, string>): string {
  const rows = Object.entries(data)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #eee">${escapeHtml(v)}</td></tr>`
    )
    .join("");
  return `<div style="font-family:system-ui,sans-serif;max-width:560px">
<h2 style="font-size:16px">New submission to <code>${escapeHtml(formName)}</code></h2>
<table style="border-collapse:collapse;width:100%;font-size:14px">${rows}</table>
</div>`;
}

export async function sendNotification(env: {
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
}, form: FormRow, data: Record<string, string>): Promise<void> {
  if (!env.RESEND_API_KEY || !form.notify_email) return;
  const subject = `[${form.name}] ${data._subject || "New submission"}`;
  await resendSend(
    env.RESEND_API_KEY,
    env.MAIL_FROM || "FormRelay <onboarding@resend.dev>",
    form.notify_email,
    subject,
    submissionEmailHtml(form.name, data)
  );
}

export async function sendAutoReply(env: {
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
}, form: FormRow, data: Record<string, string>): Promise<void> {
  if (!env.RESEND_API_KEY || !form.auto_reply) return;
  const to = data._replyto || data.email || "";
  if (!/\S+@\S+\.\S+/.test(to)) return;
  await resendSend(
    env.RESEND_API_KEY,
    env.MAIL_FROM || "FormRelay <onboarding@resend.dev>",
    to,
    `Re: ${data._subject || `your submission to ${form.name}`}`,
    `<p>Thanks for reaching out — your message was received. We will get back to you soon.</p>`
  );
}
