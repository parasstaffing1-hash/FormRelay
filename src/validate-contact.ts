/**
 * Contact-field validation: email and phone.
 *
 * Both are deliberately structured as pure classifiers returning *reasons*, not just a
 * boolean, because the ingestion pipeline needs to explain itself — an operator looking
 * at a rejected or low-scored lead has to see why.
 *
 * Neither ever throws and neither performs network I/O, so they are safe to run inline on
 * the submission hot path. Anything requiring a lookup (MX, provider verification) is
 * modelled as a separate async step behind an interface, so the core never depends on it.
 */

/* ------------------------------------------------------------------ email */

export type EmailFinding =
  | "syntax"
  | "disposable"
  | "role_account"
  | "free_provider"
  | "obvious_fake"
  | "no_tld";

export type EmailVerdict = {
  valid: boolean;
  normalized: string;
  domain: string;
  findings: EmailFinding[];
};

/**
 * Deliberately not RFC 5322. That grammar admits addresses no mail system accepts and
 * rejecting on it causes more false negatives than it prevents. This is the pragmatic
 * subset every provider actually delivers to.
 */
const EMAIL_RE = /^[^\s@,;:<>()[\]\\"]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Sample of the long tail. A real deployment should sync a maintained list. */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "throwawaymail.com", "yopmail.com", "trashmail.com",
  "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc",
  "fakeinbox.com", "mailnesia.com", "mintemail.com", "spamgourmet.com",
  "tempinbox.com", "emailondeck.com", "moakt.com", "mohmal.com",
]);

const FREE_PROVIDERS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "live.com", "aol.com", "icloud.com", "me.com", "proton.me", "protonmail.com",
  "gmx.com", "mail.com", "yandex.com", "zoho.com",
]);

/** Shared mailboxes rather than a person — useful signal, not a rejection. */
const ROLE_LOCALS = new Set([
  "admin", "administrator", "info", "support", "sales", "contact", "help",
  "billing", "office", "hello", "team", "noreply", "no-reply", "donotreply",
  "postmaster", "webmaster", "abuse", "marketing", "hr", "jobs", "careers",
]);

const FAKE_LOCALS = new Set([
  "test", "testing", "asdf", "asdfasdf", "qwerty", "abc", "aaa", "xxx",
  "fake", "nobody", "none", "null", "undefined", "example", "foo", "bar",
]);

export function validateEmail(raw: string): EmailVerdict {
  const normalized = String(raw ?? "").trim().toLowerCase();
  const findings: EmailFinding[] = [];

  if (!EMAIL_RE.test(normalized)) {
    return { valid: false, normalized, domain: "", findings: ["syntax"] };
  }

  const atIndex = normalized.lastIndexOf("@");
  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);

  // A bare TLD-less domain passes the regex only via a dot, so this catches `a@b.c`
  // style domains whose final label is implausibly short.
  const lastLabel = domain.slice(domain.lastIndexOf(".") + 1);
  if (lastLabel.length < 2) findings.push("no_tld");

  if (DISPOSABLE_DOMAINS.has(domain)) findings.push("disposable");
  if (FREE_PROVIDERS.has(domain)) findings.push("free_provider");

  // Gmail-style tags and dots are stripped only for the role/fake comparison, never
  // for storage: the address the respondent typed is the address we keep.
  const bareLocal = local.split("+")[0].replace(/\./g, "");
  if (ROLE_LOCALS.has(bareLocal)) findings.push("role_account");
  if (FAKE_LOCALS.has(bareLocal) || /^(.)\1{2,}$/.test(bareLocal)) findings.push("obvious_fake");

  return {
    valid: !findings.includes("no_tld"),
    normalized,
    domain,
    findings,
  };
}

export function isBusinessEmail(verdict: EmailVerdict): boolean {
  return verdict.valid && !verdict.findings.includes("free_provider") && !verdict.findings.includes("disposable");
}

/**
 * Deeper verification (MX lookup, mailbox probing, provider APIs) belongs behind this
 * interface so the core never gains a hard dependency on a paid service. An unconfigured
 * verifier simply means the extra findings are absent.
 */
export interface EmailVerifier {
  verify(email: string): Promise<{ deliverable: boolean | null; reason?: string }>;
}

/* ------------------------------------------------------------------ phone */

/**
 * Phone normalisation to E.164.
 *
 * This handles country-code detection and the length bounds E.164 itself defines. It
 * does NOT implement per-country national numbering plans — those are a large, frequently
 * changing dataset, and hand-maintaining them is how phone validation goes quietly wrong.
 *
 * For full national validation, drop `libphonenumber-js` in behind `PhoneValidator`. It
 * was left out here because it adds roughly 145 KB to a Worker bundle that currently ships
 * one runtime dependency, and the normalisation below is what the lead pipeline actually
 * needs. The trade-off is recorded rather than hidden: numbers that are well-formed E.164
 * but invalid for their country will pass.
 */
export type PhoneVerdict = {
  valid: boolean;
  e164: string;
  countryCode: string;
  reason?: string;
};

/** Longest-match wins, so +1 does not shadow +1242. Covers the common calling codes. */
const CALLING_CODES = [
  "1", "7", "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44",
  "45", "46", "47", "48", "49", "51", "52", "53", "54", "55", "56", "57", "58", "60", "61",
  "62", "63", "64", "65", "66", "81", "82", "84", "86", "90", "91", "92", "93", "94", "95",
  "98", "212", "213", "216", "218", "220", "221", "233", "234", "235", "237", "240", "244",
  "249", "250", "251", "254", "255", "256", "260", "263", "264", "265", "266", "267", "268",
  "351", "352", "353", "354", "355", "356", "357", "358", "359", "370", "371", "372", "373",
  "374", "375", "376", "377", "378", "380", "381", "382", "385", "386", "387", "389", "420",
  "421", "423", "500", "501", "502", "503", "504", "505", "506", "507", "509", "590", "591",
  "593", "595", "598", "670", "673", "674", "675", "676", "677", "679", "680", "682", "685",
  "852", "853", "855", "856", "880", "886", "960", "961", "962", "963", "964", "965", "966",
  "967", "968", "970", "971", "972", "973", "974", "975", "976", "977", "992", "993", "994",
  "995", "996", "998",
].sort((a, b) => b.length - a.length);

/**
 * @param raw          what the respondent typed
 * @param defaultCode  calling code to assume when the number has no `+` prefix, e.g. "1"
 */
export function validatePhone(raw: string, defaultCode = ""): PhoneVerdict {
  const input = String(raw ?? "").trim();
  if (!input) return { valid: false, e164: "", countryCode: "", reason: "empty" };

  // Strip formatting; keep a leading + as the only meaningful punctuation.
  const hasPlus = input.startsWith("+") || input.startsWith("00");
  let digits = input.replace(/^00/, "").replace(/[^\d]/g, "");
  if (!digits) return { valid: false, e164: "", countryCode: "", reason: "no digits" };

  let countryCode = "";
  if (hasPlus) {
    countryCode = CALLING_CODES.find((code) => digits.startsWith(code)) ?? "";
    if (!countryCode) return { valid: false, e164: "", countryCode: "", reason: "unrecognised country code" };
    digits = digits.slice(countryCode.length);
  } else if (defaultCode) {
    countryCode = defaultCode.replace(/[^\d]/g, "");
    // A national number may carry a trunk prefix; a single leading zero is the common case.
    digits = digits.replace(/^0/, "");
  } else {
    return { valid: false, e164: "", countryCode: "", reason: "no country code and no default" };
  }

  const national = digits;
  // E.164 caps the whole number at 15 digits; below 4 national digits is not a real line.
  if (national.length < 4) return { valid: false, e164: "", countryCode, reason: "too short" };
  if (countryCode.length + national.length > 15) {
    return { valid: false, e164: "", countryCode, reason: "too long for E.164" };
  }

  return { valid: true, e164: `+${countryCode}${national}`, countryCode };
}

/** Swap in libphonenumber-js here for full national-plan validation. */
export interface PhoneValidator {
  parse(raw: string, defaultCountry?: string): PhoneVerdict;
}

export const builtinPhoneValidator: PhoneValidator = {
  parse: (raw, defaultCountry) => validatePhone(raw, defaultCountry),
};
