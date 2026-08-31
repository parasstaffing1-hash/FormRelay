import { validateEmail, EmailVerdict } from "./validate-contact";

/**
 * Explainable spam scoring.
 *
 * The existing `spam.ts` answers a yes/no question (honeypot tripped, rate limit hit,
 * Turnstile failed). This scores the *content* of a submission and, critically, says why.
 * An operator who sees a lead in the spam folder has to be able to disagree with the
 * decision, and an unexplained probability is not something anyone can disagree with.
 *
 * Pure and synchronous: no database, no network. Rules and their weights are data, so a
 * deployment can tune them without touching the engine.
 */

export type SpamSignal = {
  rule: string;
  weight: number;
  detail: string;
};

export type SpamAssessment = {
  /** 0-100. Not a probability — a weighted score with a documented threshold. */
  score: number;
  spam: boolean;
  signals: SpamSignal[];
};

export type SpamRules = {
  blockedWords: string[];
  blockedEmails: string[];
  blockedDomains: string[];
  /** Score at or above which a submission is filed as spam. */
  threshold: number;
  /** More links than this in one submission is unusual for a human. */
  maxLinks: number;
  /** Faster than this to fill the whole form suggests automation. */
  minSeconds: number;
};

export const DEFAULT_SPAM_RULES: SpamRules = {
  blockedWords: [],
  blockedEmails: [],
  blockedDomains: [],
  threshold: 70,
  maxLinks: 3,
  minSeconds: 2,
};

export function parseSpamRules(raw: string | null | undefined): SpamRules {
  if (!raw) return { ...DEFAULT_SPAM_RULES };
  try {
    const parsed = JSON.parse(raw) as Partial<SpamRules>;
    const list = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [];
    return {
      blockedWords: list(parsed.blockedWords),
      blockedEmails: list(parsed.blockedEmails),
      blockedDomains: list(parsed.blockedDomains),
      threshold: Number.isFinite(parsed.threshold) ? Math.max(1, Math.min(100, Number(parsed.threshold))) : DEFAULT_SPAM_RULES.threshold,
      maxLinks: Number.isFinite(parsed.maxLinks) ? Math.max(0, Number(parsed.maxLinks)) : DEFAULT_SPAM_RULES.maxLinks,
      minSeconds: Number.isFinite(parsed.minSeconds) ? Math.max(0, Number(parsed.minSeconds)) : DEFAULT_SPAM_RULES.minSeconds,
    };
  } catch {
    return { ...DEFAULT_SPAM_RULES };
  }
}

export type SpamInput = {
  values: Record<string, string>;
  /** Email field value, if the form has one. */
  email?: string;
  /** Milliseconds between form render and submit, from the signed start token. */
  elapsedMs?: number | null;
  /** Completed submissions from this IP in the recent window. */
  recentFromIp?: number;
  /** True when an identical payload was already stored for this form. */
  duplicate?: boolean;
  rules?: SpamRules;
};

const LINK_RE = /\bhttps?:\/\/|\bwww\./gi;
const CYRILLIC_RE = /[Ѐ-ӿ]/;

function textOf(values: Record<string, string>): string {
  return Object.entries(values)
    .filter(([key]) => !key.startsWith("_"))
    .map(([, value]) => String(value ?? ""))
    .join(" ");
}

export function assessSpam(input: SpamInput): SpamAssessment {
  const rules = input.rules ?? DEFAULT_SPAM_RULES;
  const signals: SpamSignal[] = [];
  const text = textOf(input.values);
  const lower = text.toLowerCase();

  // --- content ---------------------------------------------------------
  const links = (text.match(LINK_RE) ?? []).length;
  if (links > rules.maxLinks) {
    signals.push({ rule: "link_count", weight: 30, detail: `${links} links (limit ${rules.maxLinks})` });
  }

  const hitWords = rules.blockedWords.filter((word) => word && lower.includes(word));
  if (hitWords.length) {
    signals.push({ rule: "blocked_word", weight: 45, detail: `matched: ${hitWords.slice(0, 3).join(", ")}` });
  }

  if (CYRILLIC_RE.test(text) && !/[а-яё]{20,}/i.test(text)) {
    // Isolated Cyrillic inside otherwise-Latin text is a common injection pattern; a
    // genuinely Russian-language submission has long runs and is not flagged.
    signals.push({ rule: "mixed_script", weight: 15, detail: "isolated Cyrillic in Latin text" });
  }

  if (text.length > 0 && text === text.toUpperCase() && text.replace(/[^a-z]/gi, "").length > 20) {
    signals.push({ rule: "all_caps", weight: 10, detail: "message is entirely upper case" });
  }

  // --- sender ----------------------------------------------------------
  let emailVerdict: EmailVerdict | null = null;
  if (input.email) {
    emailVerdict = validateEmail(input.email);
    if (!emailVerdict.valid) {
      signals.push({ rule: "email_syntax", weight: 40, detail: "email address is not deliverable syntax" });
    }
    if (emailVerdict.findings.includes("disposable")) {
      signals.push({ rule: "disposable_email", weight: 45, detail: `${emailVerdict.domain} is a disposable provider` });
    }
    if (emailVerdict.findings.includes("obvious_fake")) {
      signals.push({ rule: "fake_email", weight: 25, detail: "placeholder-looking local part" });
    }
    if (rules.blockedEmails.includes(emailVerdict.normalized)) {
      signals.push({ rule: "blocked_email", weight: 100, detail: "address is on the block list" });
    }
    if (rules.blockedDomains.includes(emailVerdict.domain)) {
      signals.push({ rule: "blocked_domain", weight: 100, detail: `${emailVerdict.domain} is on the block list` });
    }
  }

  // --- behaviour -------------------------------------------------------
  if (input.elapsedMs != null && input.elapsedMs < rules.minSeconds * 1000) {
    signals.push({
      rule: "submit_speed",
      weight: 35,
      detail: `submitted in ${(input.elapsedMs / 1000).toFixed(1)}s (under ${rules.minSeconds}s)`,
    });
  }

  if (input.duplicate) {
    signals.push({ rule: "duplicate", weight: 40, detail: "identical submission already recorded" });
  }

  if ((input.recentFromIp ?? 0) >= 5) {
    signals.push({ rule: "velocity", weight: 30, detail: `${input.recentFromIp} submissions from this address recently` });
  }

  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));
  return { score, spam: score >= rules.threshold, signals };
}

/** One-line summary for an inbox row. */
export function spamSummary(assessment: SpamAssessment): string {
  if (assessment.signals.length === 0) return "No spam signals";
  return assessment.signals.map((s) => s.detail).join(" · ");
}
