import { FormRow } from "./types";
import { escapeHtml } from "./util";

/**
 * Email delivery.
 *
 * Two rules this module exists to enforce:
 *
 *  1. A send that failed must report that it failed. The previous implementation issued
 *     `await fetch(...)` and never inspected the response, so an expired key, an exhausted
 *     quota or a 5xx all resolved as success — and the submission timeline then recorded
 *     "notification delivered" for mail that was never accepted. A tool that is silently
 *     and confidently wrong is worse than one that visibly breaks.
 *
 *  2. Delivery is not one vendor. Providers sit behind `EmailProvider` so a deployment can
 *     use its own SMTP relay or switch vendors without touching the submission pipeline.
 */

export type EmailMessage = {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type EmailResult = {
  ok: boolean;
  provider: string;
  /** Provider message id when the send was accepted. */
  id?: string;
  status?: number;
  error?: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailResult>;
}

/** Thrown so callers (and the submission timeline) can distinguish failure from success. */
export class EmailDeliveryError extends Error {
  constructor(readonly result: EmailResult) {
    super(`${result.provider}: ${result.error ?? "delivery failed"}`);
    this.name = "EmailDeliveryError";
  }
}

/* ------------------------------------------------------------------ providers */

const SEND_TIMEOUT_MS = 10_000;

/** Reads an error out of a provider response without assuming the body is JSON. */
async function describeFailure(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  if (!body) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    const detail = parsed.message ?? parsed.error;
    if (detail) return `HTTP ${response.status}: ${String(detail).slice(0, 200)}`;
  } catch {
    // Not JSON; fall through to the raw text.
  }
  return `HTTP ${response.status}: ${body.slice(0, 200)}`;
}

export function resendProvider(apiKey: string): EmailProvider {
  return {
    name: "resend",
    async send(message) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            ...(message.text ? { text: message.text } : {}),
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        if (!response.ok) {
          return { ok: false, provider: "resend", status: response.status, error: await describeFailure(response) };
        }
        const payload = (await response.json().catch(() => ({}))) as { id?: string };
        return { ok: true, provider: "resend", status: response.status, id: payload.id };
      } catch (error) {
        return { ok: false, provider: "resend", error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/**
 * Any provider exposing a JSON HTTP send endpoint (Postmark, Mailgun, SendGrid, Brevo, or
 * a self-hosted relay) can be driven through this shape. Configured with EMAIL_API_URL and
 * EMAIL_API_KEY so a deployment is not obliged to use a vendor SDK.
 */
export function httpProvider(url: string, apiKey: string, name = "http"): EmailProvider {
  return {
    name,
    async send(message) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        if (!response.ok) {
          return { ok: false, provider: name, status: response.status, error: await describeFailure(response) };
        }
        return { ok: true, provider: name, status: response.status };
      } catch (error) {
        return { ok: false, provider: name, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

export type EmailEnv = {
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  EMAIL_API_URL?: string;
  EMAIL_API_KEY?: string;
  EMAIL_PROVIDER?: string;
};

/** Returns null when no provider is configured, which is a skip rather than a failure. */
export function selectProvider(env: EmailEnv): EmailProvider | null {
  const preferred = (env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  if (preferred === "http" || (!preferred && env.EMAIL_API_URL)) {
    return env.EMAIL_API_URL ? httpProvider(env.EMAIL_API_URL, env.EMAIL_API_KEY ?? "") : null;
  }
  return env.RESEND_API_KEY ? resendProvider(env.RESEND_API_KEY) : null;
}

export function senderAddress(env: EmailEnv): string {
  return env.MAIL_FROM || "FormRelay <onboarding@resend.dev>";
}

/* -------------------------------------------------------------------- content */

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

/** Plaintext alternative, so the message is not HTML-only. */
export function submissionEmailText(formName: string, data: Record<string, string>): string {
  const lines = Object.entries(data).map(([k, v]) => `${k}: ${v}`);
  return `New submission to ${formName}\n\n${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------- sending */

/** Skipped sends are reported distinctly from failures; neither is reported as success. */
export type SendOutcome = { sent: boolean; skipped?: string; result?: EmailResult };

export async function sendNotification(env: EmailEnv, form: FormRow, data: Record<string, string>): Promise<SendOutcome> {
  const provider = selectProvider(env);
  if (!provider) return { sent: false, skipped: "no email provider configured" };
  if (!form.notify_email) return { sent: false, skipped: "form has no notification recipient" };

  const replyTo = data._replyto || data.email || "";
  const result = await provider.send({
    to: form.notify_email,
    from: senderAddress(env),
    subject: `[${form.name}] ${data._subject || "New submission"}`,
    html: submissionEmailHtml(form.name, data),
    text: submissionEmailText(form.name, data),
    ...(/\S+@\S+\.\S+/.test(replyTo) ? { replyTo } : {}),
  });

  if (!result.ok) throw new EmailDeliveryError(result);
  return { sent: true, result };
}

export async function sendAutoReply(env: EmailEnv, form: FormRow, data: Record<string, string>): Promise<SendOutcome> {
  const provider = selectProvider(env);
  if (!provider) return { sent: false, skipped: "no email provider configured" };
  if (!form.auto_reply) return { sent: false, skipped: "autoresponder disabled" };

  const to = data._replyto || data.email || "";
  if (!/\S+@\S+\.\S+/.test(to)) return { sent: false, skipped: "no valid respondent address" };

  const result = await provider.send({
    to,
    from: senderAddress(env),
    subject: `Re: ${data._subject || `your submission to ${form.name}`}`,
    html: `<p>Thanks for reaching out — your message was received. We will get back to you soon.</p>`,
    text: "Thanks for reaching out - your message was received. We will get back to you soon.\n",
  });

  if (!result.ok) throw new EmailDeliveryError(result);
  return { sent: true, result };
}
