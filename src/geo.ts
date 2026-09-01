/**
 * Country attribution for analytics.
 *
 * Cloudflare resolves the visitor's country on every request and hands it to the Worker as
 * `request.cf.country`, so this costs no lookup, no third-party service, and no extra
 * latency. It is also why country is the right granularity here: it is already available,
 * and it is coarse enough not to identify anyone.
 *
 * Deliberately country-only. `request.cf` also exposes city, postal code and coordinates,
 * which would make the events table a location log for individual respondents -- a serious
 * change in what this product stores about people, and not one worth making for a bar chart.
 *
 * Pure functions with no I/O, so the ranking and formatting are testable directly.
 */

/**
 * Turns an ISO 3166-1 alpha-2 code into its flag emoji.
 *
 * Flags are a pair of regional indicator symbols, which are the letters A-Z offset to
 * U+1F1E6. No image assets, no sprite sheet, and it renders in every modern client.
 */
export function countryFlag(code: string): string {
  const upper = (code ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "🏳";
  return String.fromCodePoint(...[...upper].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/**
 * Cloudflare returns "T1" for Tor exit nodes and "XX" when it cannot resolve a country.
 * Both are real answers worth showing rather than silently dropping -- a spike in
 * unresolved traffic is itself a signal.
 */
const SPECIAL: Record<string, string> = {
  T1: "Tor network",
  XX: "Unknown",
  "": "Unknown",
};

const NAMES: Record<string, string> = {
  AE: "United Arab Emirates", AR: "Argentina", AT: "Austria", AU: "Australia", BD: "Bangladesh",
  BE: "Belgium", BG: "Bulgaria", BR: "Brazil", CA: "Canada", CH: "Switzerland", CL: "Chile",
  CN: "China", CO: "Colombia", CZ: "Czechia", DE: "Germany", DK: "Denmark", EE: "Estonia",
  EG: "Egypt", ES: "Spain", FI: "Finland", FR: "France", GB: "United Kingdom", GR: "Greece",
  HK: "Hong Kong", HR: "Croatia", HU: "Hungary", ID: "Indonesia", IE: "Ireland", IL: "Israel",
  IN: "India", IQ: "Iraq", IR: "Iran", IS: "Iceland", IT: "Italy", JP: "Japan", KE: "Kenya",
  KR: "South Korea", KW: "Kuwait", LK: "Sri Lanka", LT: "Lithuania", LU: "Luxembourg",
  LV: "Latvia", MA: "Morocco", MX: "Mexico", MY: "Malaysia", NG: "Nigeria", NL: "Netherlands",
  NO: "Norway", NP: "Nepal", NZ: "New Zealand", PE: "Peru", PH: "Philippines", PK: "Pakistan",
  PL: "Poland", PT: "Portugal", QA: "Qatar", RO: "Romania", RS: "Serbia", RU: "Russia",
  SA: "Saudi Arabia", SE: "Sweden", SG: "Singapore", SI: "Slovenia", SK: "Slovakia",
  TH: "Thailand", TR: "Türkiye", TW: "Taiwan", UA: "Ukraine", US: "United States",
  VN: "Vietnam", ZA: "South Africa",
};

/** The display name for a code, falling back to the code itself rather than to "Unknown". */
export function countryName(code: string): string {
  const upper = (code ?? "").toUpperCase();
  if (upper in SPECIAL) return SPECIAL[upper]!;
  // An unlisted but well-formed code is shown as-is: better a bare "MT" than a wrong guess
  // or a row silently folded into "Unknown".
  return NAMES[upper] ?? (/^[A-Z]{2}$/.test(upper) ? upper : "Unknown");
}

export type CountryRow = { code: string; count: number };
export type CountrySlice = { code: string; name: string; flag: string; count: number; share: number };

/**
 * Ranks countries and computes each one's share.
 *
 * Share is of the total passed in, not of the rows shown, so a truncated top-10 still
 * reports honest percentages -- five countries at 12% each should not add up to 100%.
 */
export function rankCountries(rows: CountryRow[], total?: number): CountrySlice[] {
  const denominator = total ?? rows.reduce((sum, row) => sum + row.count, 0);
  return rows
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || countryName(a.code).localeCompare(countryName(b.code)))
    .map((row) => ({
      code: (row.code ?? "").toUpperCase() || "XX",
      name: countryName(row.code),
      flag: countryFlag(row.code),
      count: row.count,
      share: denominator > 0 ? Math.round((row.count / denominator) * 1000) / 10 : 0,
    }));
}

/**
 * Reads the country from the Cloudflare request properties.
 *
 * `cf` is absent in local development and in unit tests, so this returns "" there and the
 * caller simply records no country -- an absent field rather than a fabricated one.
 */
export function countryFromRequest(cf: unknown): string {
  const country = (cf as { country?: unknown } | undefined)?.country;
  return typeof country === "string" && /^[A-Za-z0-9]{2}$/.test(country) ? country.toUpperCase() : "";
}
