export type Bindings = {
  DB: D1Database;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  TURNSTILE_SECRET_KEY?: string;
  WORKSPACE_NAME?: string;
  FILES?: R2Bucket;
};

export type FormRow = {
  id: string;
  name: string;
  redirect_url: string;
  notify_email: string;
  auto_reply: number;
  archived: number;
  created_at: number;
};

export type SubmissionRow = {
  id: number;
  form_id: string;
  data: string;
  ip: string;
  user_agent: string;
  referer: string;
  is_spam: number;
  created_at: number;
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
};

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
