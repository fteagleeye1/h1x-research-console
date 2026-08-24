/**
 * Vulnerability-class normalization for the disclosed-reports library.
 *
 * HackerOne exposes weakness information in two inconsistent shapes:
 *  - hacktivity feed "cwe" attribute: free-text like "Path Traversal",
 *    "Improper Authorization", sometimes a CWE id like "CWE-79".
 *  - report bodies: prose.
 *
 * This layer maps whatever is present onto a small set of canonical
 * RESEARCH CLASSES so reports can be browsed by vulnerability type. The
 * original HackerOne weakness string is always preserved on the report
 * (originalWeakness) and displayed alongside the normalized class.
 *
 * Mapping order (deterministic):
 *   1. Exact/substring match of the weakness string against the table below.
 *   2. Keyword scan of title + body head (only when no weakness exists).
 *   3. "Unclassified" rather than guessing.
 */

export interface ResearchClass {
  key: string;
  label: string;
}

export const RESEARCH_CLASSES: ResearchClass[] = [
  { key: "xss", label: "Cross-Site Scripting" },
  { key: "sqli", label: "SQL Injection" },
  { key: "ssrf", label: "SSRF" },
  { key: "idor", label: "IDOR" },
  { key: "access-control", label: "Broken Access Control" },
  { key: "csrf", label: "CSRF" },
  { key: "authentication", label: "Authentication" },
  { key: "info-disclosure", label: "Information Disclosure" },
  { key: "open-redirect", label: "Open Redirect" },
  { key: "rce", label: "RCE / Code Injection" },
  { key: "command-injection", label: "Command Injection" },
  { key: "xxe", label: "XXE" },
  { key: "path-traversal", label: "Path Traversal" },
  { key: "file-upload", label: "File Upload" },
  { key: "prototype-pollution", label: "Prototype Pollution" },
  { key: "race-condition", label: "Race Conditions" },
  { key: "smuggling-cache", label: "HTTP Smuggling / Web Cache" },
  { key: "api", label: "API Vulnerability" },
  { key: "business-logic", label: "Business Logic" },
  { key: "memory-safety", label: "Memory Safety" },
  { key: "crypto", label: "Cryptography" },
  { key: "dos", label: "Denial of Service" },
];

export const UNCLASSIFIED = "unclassified";

/** Ordered: earlier entries win when several keywords match. */
const WEAKNESS_TABLE: { classKey: string; patterns: RegExp }[] = [
  {
    classKey: "xss",
    patterns:
      /cross[- ]?site scripting|\bxss\b|cwe-?79|improper neutralization.*web page|script injection|reflected xss|stored xss|dom[- ]xss/i,
  },
  {
    classKey: "sqli",
    patterns: /sql\s*injection|\bsqlib?\b|cwe-?89|blind sql|nosql injection|mongodb injection/i,
  },
  {
    classKey: "ssrf",
    patterns: /server[- ]side request forgery|\bssrf\b|cwe-?918|blind ssrf/i,
  },
  {
    classKey: "idor",
    patterns:
      /insecure direct object referenc|\bidor\b|cwe-?639|missing object[- ]level authorization|direct object reference/i,
  },
  {
    classKey: "csrf",
    patterns: /cross[- ]site request forgery|\bcsrf\b|cwe-?352|anti[- ]csrf/i,
  },
  {
    classKey: "xxe",
    patterns: /xml external entit|\bxxe\b|cwe-?611/i,
  },
  {
    classKey: "command-injection",
    patterns: /command injection|os command|cwe-?78\b|shell injection/i,
  },
  {
    classKey: "rce",
    patterns:
      /remote code execution|\brce\b|code injection|deserialization|unsafe deserialization|cwe-?502|cwe-?94\b|template injection|\bssti\b|expression language injection|untrusted control sphere/i,
  },
  {
    classKey: "path-traversal",
    patterns: /path traversal|directory traversal|local file inclusion|\blfi\b|cwe-?22|arbitrary file read/i,
  },
  {
    classKey: "file-upload",
    patterns: /file upload|unrestricted upload|cwe-?434/i,
  },
  {
    classKey: "prototype-pollution",
    patterns: /prototype pollution|cwe-?1321/i,
  },
  {
    classKey: "race-condition",
    patterns: /race condition|time[- ]of[- ]check|cwe-?362|cwe-?367|toctou/i,
  },
  {
    classKey: "smuggling-cache",
    patterns:
      /request smuggling|response splitting|crlf injection|web cache poisoning|web cache deception|cache poisoning|http smuggling|header injection|cwe-?444/i,
  },
  {
    classKey: "open-redirect",
    patterns: /open redirect|url redirection|improper.*redirect|cwe-?601/i,
  },
  {
    classKey: "info-disclosure",
    patterns:
      /information (exposure|disclosure)|information leak|data exposure|sensitive data|insecure storage of sensitive|cwe-?200|source code disclosure|stack trace|debug disclosure|private.*expos/i,
  },
  {
    classKey: "authentication",
    patterns:
      /authentication|auth bypass|brute force|password|session fixation|weak password recovery|cwe-?287|cwe-?384|login|2fa|otp|jwt/i,
  },
  {
    classKey: "access-control",
    patterns:
      /authorization|access control|privilege escalation|permission|cwe-?284|cwe-?285|cwe-?862|cwe-?863|broken access|untrusted inputs in a security decision|wrong session/i,
  },
  {
    classKey: "memory-safety",
    patterns:
      /use[- ]after[- ]free|double free|null pointer|buffer over(?:read|flow)|out[- ]of[- ]bounds|array index|memory (corruption|safety)|use of uninitialized|cwe-?416|cwe-?415|cwe-?476|cwe-?125|cwe-?787/i,
  },
  {
    classKey: "crypto",
    patterns:
      /cryptographic|certificate validation|\btls\b|\bssl\b|encryption|nonce|\bpgp\b|signature verification|cwe-?295|cwe-?327|cwe-?320/i,
  },
  {
    classKey: "dos",
    patterns:
      /denial of service|resource consumption|resource exhaustion|\bdos\b|\bamplification\b|uncontrolled resource|cwe-?400/i,
  },
  {
    classKey: "api",
    patterns:
      /\bapi\b.*(vulnerab|misconfig|abuse)|graphql|rest api|mass assignment|rate limit absent|no rate limit/i,
  },
  {
    classKey: "business-logic",
    patterns: /business logic|logic flaw|payment|coupon|price manipul|workflow bypass/i,
  },
];

const BODY_KEYWORDS: { classKey: string; patterns: RegExp }[] = [
  { classKey: "xss", patterns: /<script|alert\(document|onerror=|innerHTML|javascript:/i },
  { classKey: "sqli", patterns: /union select|'\s*or\s*'1'\s*=\s*'1|sleep\(|information_schema/i },
  { classKey: "ssrf", patterns: /burp collaborator|169\.254\.169\.254|internal metadata|requests? to http:\/\/(localhost|127\.0)/i },
  { classKey: "idor", patterns: /changed the (user_)?id|another user'?s (account|data|profile)|object reference/i },
  { classKey: "open-redirect", patterns: /redirect(s|ed)? to (an )?(external|attacker)/i },
  { classKey: "rce", patterns: /reverse shell|executed (arbitrary )?code|rce on/i },
  { classKey: "command-injection", patterns: /; *(cat|id|wget|curl) |`id`|\$\((id|whoami)\)/i },
  { classKey: "xxe", patterns: /<!ENTITY|SYSTEM "file:/i },
  { classKey: "path-traversal", patterns: /\.\.\/\.\.\/|etc\/passwd/i },
];

export interface ClassificationInput {
  weakness: string | null;
  title: string | null;
  body: string | null;
}

export function classifyVulnerability(input: ClassificationInput): string {
  const weakness = input.weakness?.trim();

  if (weakness) {
    for (const entry of WEAKNESS_TABLE) {
      if (entry.patterns.test(weakness)) return entry.classKey;
    }
    // Weakness exists but matches nothing known: keep it unclassified
    // instead of force-fitting it from prose.
    return UNCLASSIFIED;
  }

  // No weakness info at all -> conservative keyword pass over title/body head.
  const haystackTitle = input.title ?? "";
  const haystackBody = (input.body ?? "").slice(0, 4000);
  const combined = `${haystackTitle}\n${haystackBody}`;

  if (!combined.trim()) return UNCLASSIFIED;

  for (const entry of WEAKNESS_TABLE) {
    // Title-only pass with the full table (titles are short and curated).
    if (entry.patterns.test(haystackTitle)) return entry.classKey;
  }

  for (const entry of BODY_KEYWORDS) {
    if (entry.patterns.test(haystackBody)) return entry.classKey;
  }

  return UNCLASSIFIED;
}

export function classLabel(classKey: string): string {
  if (classKey === UNCLASSIFIED) return "Unclassified";

  return (
    RESEARCH_CLASSES.find((c) => c.key === classKey)?.label ?? classKey
  );
}
