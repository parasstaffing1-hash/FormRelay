export type Bindings = {
  /**
   * Reassigned per request by the `/*` middleware in index.tsx when Postgres is configured,
   * so every downstream `env.DB` call site is engine-agnostic. See `dbconnect.ts`.
   */
  DB: D1Database;
  /** Cloudflare Hyperdrive binding pooling connections to Postgres. Preferred over DATABASE_URL. */
  HYPERDRIVE?: { connectionString: string };
  /** Direct Postgres connection string. Local development, or deployments without Hyperdrive. */
  DATABASE_URL?: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  /** Resend API key. Optional — only one email provider needs configuring. */
  RESEND_API_KEY?: string;
  /** Full SendLayer POST endpoint, normally https://api.example.com/v1/emails. */
  SENDLAYER_API_URL?: string;
  /** Server-side SendLayer project API key. Never expose this in browser code. */
  SENDLAYER_API_KEY?: string;
  /**
   * Generic JSON email endpoint, used by any provider that is not Resend (SendLayer,
   * Postmark, Mailgun, a self-hosted relay). Takes precedence over RESEND_API_KEY.
   * See `httpProvider` in email.ts for the request shape.
   */
  EMAIL_API_URL?: string;
  /** Bearer token for EMAIL_API_URL. */
  EMAIL_API_KEY?: string;
  /** Force a provider ("http" | "resend") instead of inferring from what is configured. */
  EMAIL_PROVIDER?: string;
  /**
   * Sender identity, e.g. `FormRelay <forms@yourdomain.com>`. Required for every provider
   * except Resend, which has a sandbox sender to fall back on.
   */
  MAIL_FROM?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Public Turnstile site key rendered into visitor-facing forms. */
  TURNSTILE_SITE_KEY?: string;
  /** Comma-separated production/local hostnames accepted from Siteverify. */
  TURNSTILE_HOSTNAMES?: string;
  WORKSPACE_NAME?: string;
  FILES?: R2Bucket;
  PREFILL_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
};

export type FormRow = {
  id: string;
  name: string;
  redirect_url: string;
  notify_email: string;
  auto_reply: number;
  archived: number;
  schema_json: string | null;
  published_json: string | null;
  status: string;
  views: number;
  created_at: number;
  slug?: string | null;
  theme_json?: string | null;
  open_at?: number | null;
  close_at?: number | null;
  submission_limit?: number | null;
  closed_message?: string | null;
  one_per_respondent?: number;
  prefill_signed_only?: number;
  pow_bits?: number;
  unique_mode?: string;
  unique_field?: string;
  consent_text?: string;
  field_acl_json?: string;
  recurrence?: string;
  unlock_at?: number | null;
  spam_rules_json?: string;
  score_rules_json?: string;
  workspace_id?: string;
};

export type SubmissionStatus = "in_progress" | "partial" | "completed" | "abandoned" | "spam" | "deleted";

export type SubmissionRow = {
  id: number;
  form_id: string;
  data: string;
  ip: string;
  user_agent: string;
  referer: string;
  is_spam: number;
  created_at: number;
  status?: SubmissionStatus | string;
  resume_token_hash?: string | null;
  resume_expires_at?: number | null;
  resume_revoked?: number;
  completed_at?: number | null;
  updated_at?: number;
  tags_json?: string;
  note?: string;
  prev_hash?: string;
  row_hash?: string;
  receipt_token_hash?: string | null;
  erased_at?: number | null;
  quality_json?: string;
  consent_json?: string;
  respondent_key?: string | null;
  cohort?: string;
  idempotency_key?: string | null;
  fingerprint?: string | null;
  spam_score?: number;
  spam_signals?: string;
  contact_id?: string | null;
  lead_score?: number;
  score_breakdown?: string;
  lead_status?: string;
};

export type WebhookRow = {
  id: string;
  form_id: string;
  url: string;
  secret: string;
  active: number;
  created_at: number;
};

export type WebhookWithContext = WebhookRow & { form_name: string | null };

export type DeliveryRow = {
  id: number;
  webhook_id: string;
  event: string;
  status_code: number | null;
  ok: number;
  detail: string;
  created_at: number;
  attempts: number;
  /** Non-null while a retry is still owed. */
  next_attempt_at: number | null;
};

export type FormVersionRow = { id: number; form_id: string; schema_json: string; published_json?: string | null; created_at: number; created_by: string };

export type FormWithStats = FormRow & {
  submission_count: number;
  last_submission_at: number | null;
};

export type SubmissionWithContext = SubmissionRow & {
  form_name: string;
};

export type DashboardStats = {
  form_count: number;
  submission_count: number;
  month_count: number;
};

export type FileRow = {
  id: string;
  form_id: string;
  submission_id: number | null;
  filename: string;
  content_type: string;
  size: number;
  r2_key: string;
  field_name: string;
  created_at: number;
};

export type FileWithContext = FileRow & { form_name: string | null };

export type ApiKeyRow = { id:string; name:string; prefix:string; hash:string; last4:string; scope?: "read" | "write" | "read_write" | string; expires_at?: number | null; last_used_at:number|null; created_at:number };
export type AuditRow = { id:number; action:string; target_id:string; detail:string; created_at:number };

export type WorkflowAction = { type: "email" | "webhook" | "notify" | "add_tag" | "wait" | "integration"; url?: string; value?: string; delayMs?: number; provider?: string; mapping?: Record<string, string> };
export type WorkflowCondition = { field: string; operator: "equals" | "not_equals" | "contains" | "gt" | "lt" | "is_not_empty"; value?: string };
export type WorkflowRow = { id: string; form_id: string | null; name: string; trigger: "submission.completed" | "submission.partial" | "score.threshold" | "response.updated" | string; condition_json: string; actions_json: string; active: number; created_at: number; updated_at: number };
export type WorkflowRunRow = { id: string; workflow_id: string; submission_id: number | null; status: "running" | "succeeded" | "failed" | string; started_at: number; finished_at: number | null; error: string };
export type WorkflowStepRow = { id: number; run_id: string; step_index: number; action_type: string; status: string; detail: string; started_at: number; finished_at: number | null; retry_count: number };
export type NotificationRow = { id: number; kind: string; title: string; detail: string; read_at: number | null; created_at: number };
export type UserRow = { id: string; email: string; name: string; password_hash: string; created_at: number };
export type MembershipRow = { user_id: string; workspace_id: string; role: "owner" | "editor" | "viewer" | string; created_at: number };
export type InvitationRow = { id: string; workspace_id: string; email: string; role: "editor" | "viewer" | string; token_hash: string; expires_at: number; accepted_at: number | null; created_at: number };

export type ContactRow = {
  id: string;
  workspace_id: string;
  dedupe_key: string;
  email: string;
  phone: string;
  name: string;
  company: string;
  first_seen: number;
  last_seen: number;
  submission_count: number;
  status: string;
  assigned_to: string;
  tags_json: string;
  note: string;
  lead_score: number;
  score_breakdown: string;
  score_version: string;
  source_form: string;
  utm_json: string;
  created_at: number;
};
