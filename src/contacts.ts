import { validateEmail, validatePhone, isBusinessEmail } from "./validate-contact";

/**
 * Contacts and lead scoring.
 *
 * Repeat submissions from the same person are the same lead, not three leads. This module
 * decides identity and worth; `db.ts` owns storage.
 *
 * Identity is deterministic only. Fuzzy name matching is deliberately absent: merging two
 * different people because they share a common name is far worse than leaving two records
 * for one person, and it is not reversible once notes and assignments accumulate.
 */

/* ------------------------------------------------------------- identity */

export type ContactIdentity = {
  /** Stable key used for deduplication. Empty when the submission is unidentifiable. */
  key: string;
  email: string;
  phone: string;
  name: string;
  matchedOn: "email" | "phone" | "none";
};

/** Field names commonly used for each role, checked in order of confidence. */
const NAME_KEYS = ["name", "full_name", "fullname", "your_name", "contact_name", "first_name"];
const EMAIL_KEYS = ["email", "email_address", "your_email", "contact_email", "e_mail"];
const PHONE_KEYS = ["phone", "telephone", "mobile", "phone_number", "contact_phone", "tel"];
const COMPANY_KEYS = ["company", "organisation", "organization", "business", "company_name"];

function pick(values: Record<string, string>, keys: string[], labels: Record<string, string> = {}): string {
  // Exact id match first, then a label-based match, so a schema-v2 form whose block ids
  // are opaque still resolves via the human label.
  for (const key of keys) {
    const hit = Object.keys(values).find((k) => k.toLowerCase() === key);
    if (hit && String(values[hit] ?? "").trim()) return String(values[hit]).trim();
  }
  for (const [fieldId, label] of Object.entries(labels)) {
    const normalized = String(label).toLowerCase().replace(/[^a-z]/g, "_");
    if (keys.some((key) => normalized === key || normalized.includes(key))) {
      const value = String(values[fieldId] ?? "").trim();
      if (value) return value;
    }
  }
  return "";
}

export function extractIdentity(
  values: Record<string, string>,
  labels: Record<string, string> = {},
  defaultCallingCode = ""
): ContactIdentity {
  const rawEmail = pick(values, EMAIL_KEYS, labels);
  const rawPhone = pick(values, PHONE_KEYS, labels);
  const name = pick(values, NAME_KEYS, labels);

  const emailVerdict = rawEmail ? validateEmail(rawEmail) : null;
  const email = emailVerdict?.valid ? emailVerdict.normalized : "";

  const phoneVerdict = rawPhone ? validatePhone(rawPhone, defaultCallingCode) : null;
  const phone = phoneVerdict?.valid ? phoneVerdict.e164 : "";

  // Email is the stronger identifier: a shared office phone is common, a shared mailbox
  // is less so, and email normalisation is unambiguous.
  if (email) return { key: `email:${email}`, email, phone, name, matchedOn: "email" };
  if (phone) return { key: `phone:${phone}`, email, phone, name, matchedOn: "phone" };
  return { key: "", email, phone, name, matchedOn: "none" };
}

export function extractCompany(values: Record<string, string>, labels: Record<string, string> = {}): string {
  return pick(values, COMPANY_KEYS, labels);
}

/* --------------------------------------------------------- lead status */

export const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

/* -------------------------------------------------------- lead scoring */

/**
 * Deterministic, configurable lead scoring.
 *
 * Every point is traceable to a named rule, and the rule set version is stored with the
 * score, so a score computed last quarter can still be explained. No model, no opacity —
 * a sales team that cannot see why a lead scored 80 will not trust the number.
 */
export type ScoreRule =
  | { kind: "business_email"; points: number }
  | { kind: "has_phone"; points: number }
  | { kind: "country"; points: number; values: string[] }
  | { kind: "field_equals"; points: number; field: string; value: string }
  | { kind: "field_contains"; points: number; field: string; value: string }
  | { kind: "field_gt"; points: number; field: string; value: number }
  | { kind: "repeat_submission"; points: number }
  | { kind: "has_company"; points: number };

export type ScoreBreakdown = { rule: string; points: number; detail: string };

export type LeadScore = {
  score: number;
  breakdown: ScoreBreakdown[];
  rulesVersion: string;
};

export const DEFAULT_SCORE_RULES: ScoreRule[] = [
  { kind: "business_email", points: 20 },
  { kind: "has_phone", points: 10 },
  { kind: "has_company", points: 10 },
  { kind: "repeat_submission", points: 10 },
];

export function parseScoreRules(raw: string | null | undefined): ScoreRule[] {
  if (!raw) return DEFAULT_SCORE_RULES;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SCORE_RULES;
    return parsed.filter(
      (rule): rule is ScoreRule =>
        rule && typeof rule === "object" && typeof rule.kind === "string" && Number.isFinite(rule.points)
    );
  } catch {
    return DEFAULT_SCORE_RULES;
  }
}

/** Short digest of the rule set, stored with each score so old scores stay explainable. */
export function rulesVersion(rules: ScoreRule[]): string {
  let hash = 0;
  const text = JSON.stringify(rules);
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return `v${(hash >>> 0).toString(36)}`;
}

export type ScoreInput = {
  values: Record<string, string>;
  identity: ContactIdentity;
  company?: string;
  country?: string;
  isRepeat?: boolean;
  rules?: ScoreRule[];
};

function numeric(value: string): number | null {
  // Tolerates "£120,000" and "120000 USD" — budget fields are rarely clean.
  const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function scoreLead(input: ScoreInput): LeadScore {
  const rules = input.rules ?? DEFAULT_SCORE_RULES;
  const breakdown: ScoreBreakdown[] = [];
  const values = input.values;

  for (const rule of rules) {
    switch (rule.kind) {
      case "business_email": {
        if (input.identity.email && isBusinessEmail(validateEmail(input.identity.email))) {
          breakdown.push({ rule: "business_email", points: rule.points, detail: "not a free or disposable provider" });
        }
        break;
      }
      case "has_phone": {
        if (input.identity.phone) breakdown.push({ rule: "has_phone", points: rule.points, detail: input.identity.phone });
        break;
      }
      case "has_company": {
        if (input.company) breakdown.push({ rule: "has_company", points: rule.points, detail: input.company });
        break;
      }
      case "repeat_submission": {
        if (input.isRepeat) breakdown.push({ rule: "repeat_submission", points: rule.points, detail: "has submitted before" });
        break;
      }
      case "country": {
        const country = (input.country ?? "").toUpperCase();
        if (country && rule.values.map((v) => v.toUpperCase()).includes(country)) {
          breakdown.push({ rule: "country", points: rule.points, detail: country });
        }
        break;
      }
      case "field_equals": {
        if (String(values[rule.field] ?? "").trim().toLowerCase() === rule.value.trim().toLowerCase()) {
          breakdown.push({ rule: "field_equals", points: rule.points, detail: `${rule.field} = ${rule.value}` });
        }
        break;
      }
      case "field_contains": {
        if (String(values[rule.field] ?? "").toLowerCase().includes(rule.value.toLowerCase())) {
          breakdown.push({ rule: "field_contains", points: rule.points, detail: `${rule.field} contains ${rule.value}` });
        }
        break;
      }
      case "field_gt": {
        const actual = numeric(values[rule.field] ?? "");
        if (actual !== null && actual > rule.value) {
          breakdown.push({ rule: "field_gt", points: rule.points, detail: `${rule.field} = ${actual} (> ${rule.value})` });
        }
        break;
      }
    }
  }

  const total = breakdown.reduce((sum, entry) => sum + entry.points, 0);
  // Clamped so a misconfigured rule set cannot produce a meaningless number.
  return { score: Math.max(0, Math.min(100, total)), breakdown, rulesVersion: rulesVersion(rules) };
}

export function scoreBand(score: number): "hot" | "warm" | "cold" {
  if (score >= 60) return "hot";
  if (score >= 30) return "warm";
  return "cold";
}
