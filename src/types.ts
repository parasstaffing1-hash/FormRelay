export type Bindings = {
  DB: D1Database;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  TURNSTILE_SECRET_KEY?: string;
};

export type FormRow = {
  id: string;
  name: string;
  redirect_url: string;
  notify_email: string;
  auto_reply: number;
  created_at: number;
};

export type SubmissionRow = {
  id: number;
  form_id: string;
  data: string;
  ip: string;
  user_agent: string;
  is_spam: number;
  created_at: number;
};
