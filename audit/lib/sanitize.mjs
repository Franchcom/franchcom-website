// Strikt allowlist-basierter Sanitizer.
//
// Grundsatz aus dem Integrationsvertrag, Abschnitt 6: Der Sanitizer ist die erste
// Verteidigungslinie. Das Security Center prueft nach und lehnt ab -- jede Ablehnung
// ist ein Vorfall. Deshalb: alles verwerfen, was nicht ausdruecklich erlaubt ist.
//
// Zusaetzlich fuer diese App: Die Mandats-Ebene traegt Personenbezug in den
// Pfaden selbst. Namensbestandteile, Portal-Host und Share-Token-Muster sind
// hier ausdruecklich verboten -- im Report existieren nur opake Kennungen.

import { mandateForbiddenTerms } from "./pages.mjs";

/** Erlaubte Felder je Ebene. Alles andere wird entfernt. */
const ALLOW = {
  root: [
    "schema_version", "report_id", "app_id", "environment", "audit_version",
    "runner", "generated_at", "reported_overall", "domains", "audit_meta",
    "modules", "findings", "heartbeat",
  ],
  runner: ["name", "version"],
  domain: ["status", "checks_total", "checks_failed", "reason_code"],
  audit_meta: [
    "last_successful_audit", "expected_interval_seconds", "coverage",
    "skipped_modules", "duration_ms",
    "critical_findings", "high_findings", "medium_findings", "low_findings",
  ],
  module: ["status", "domain", "reason_code"],
  finding: [
    "finding_id", "module", "domain", "severity", "status", "code", "title",
    "description", "component_ref", "first_seen", "last_seen", "retest_status",
    "evidence_ref", "remediation_hint_code",
  ],
  heartbeat: ["sent_at", "runner_healthy"],
};

/**
 * Werte, die strukturell keine personenbezogenen Daten sein koennen und deshalb
 * nicht gegen die Muster geprueft werden (sonst wertet die Telefonheuristik
 * jeden ISO-Zeitstempel als Rufnummer und blockiert jeden Report).
 */
const STRUCTURAL = [
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/,                 // ISO-Zeitstempel
  /^\d{4}-\d{2}-\d{2}$/,                                              // ISO-Datum
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Muster, die niemals in einem Report vorkommen duerfen. */
const FORBIDDEN = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, "E-Mail-Adresse"],
  [/(?:\+\d{1,3}[\s/-]?)?(?:\(?\d{2,5}\)?[\s/-]){2,}\d{2,}|\+\d{6,}/, "Telefonnummer"],
  [/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/, "IBAN"],
  [/\b\d{1,3}(\.\d{1,3}){3}\b/, "IPv4-Adresse"],
  [/\b[A-Za-z]:\\|\/(?:home|Users)\//, "absoluter Dateipfad"],
  [/\b(sk_live|sk_test|ghp_|github_pat_|AKIA[0-9A-Z]{16}|xox[abps]-)/, "Token oder API-Key"],
  [/\beyJ[A-Za-z0-9_-]{8,}\./, "JWT"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "privater Schluessel"],
  [/\bBearer\s+[A-Za-z0-9._-]{10,}/, "Bearer-Token"],
  [/\bpostgres(ql)?:\/\//, "Datenbank-URL"],
  [/\bat\s+\w+\s+\(.*:\d+:\d+\)/, "Stacktrace"],
  // Mandats-Ebene dieser App:
  [/portal\.franchcom\.at/i, "Portal-Host"],
  [/\/s\/[A-Za-z0-9]{6,}\b/, "Share-Token-Muster"],
  ...mandateForbiddenTerms().map((t) => [new RegExp(`\\b${escapeRe(t)}\\b`, "i"), "Mandatskennung"]),
];

const STATUS = ["GREEN", "YELLOW", "RED", "GRAY", "NOT_APPLICABLE"];
const SEVERITY = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const FINDING_STATUS = ["NEW", "OPEN", "FIXED_PENDING_RETEST", "FIXED_VERIFIED", "ACCEPTED_RISK"];
const REASON_CODES = [
  "NO_PAYMENT_FEATURE", "NO_AI_FEATURE", "NO_OCR_FEATURE", "NO_FILE_UPLOAD",
  "NO_MULTI_TENANCY", "NO_PERSONAL_DATA", "NO_HEALTH_DATA", "NO_EXTERNAL_API",
  "NO_BACKUP_REQUIRED", "SINGLE_USER_APP", "OTHER_DOCUMENTED",
];

function pick(obj, allowed) {
  const out = {};
  for (const k of allowed) if (obj != null && Object.hasOwn(obj, k)) out[k] = obj[k];
  return out;
}

/** Einzeiler erzwingen und auf Laenge kuerzen. */
function line(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
}

/**
 * Durchsucht den fertigen Report auf verbotene Muster.
 * @returns {{field: string, kind: string}[]}
 */
export function scanForbidden(value, path = "") {
  const hits = [];
  if (typeof value === "string") {
    if (STRUCTURAL.some((re) => re.test(value))) return hits;
    for (const [re, kind] of FORBIDDEN) {
      if (re.test(value)) hits.push({ field: path || "(root)", kind });
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...scanForbidden(v, `${path}[${i}]`)));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      hits.push(...scanForbidden(v, path ? `${path}.${k}` : k));
    }
  }
  return hits;
}

/** Baut aus einem Rohreport einen Report, der ausschliesslich erlaubte Felder enthaelt. */
export function sanitizeReport(raw) {
  const r = pick(raw, ALLOW.root);

  r.runner = pick(raw.runner ?? {}, ALLOW.runner);

  r.domains = {};
  for (const [name, d] of Object.entries(raw.domains ?? {})) {
    const clean = pick(d, ALLOW.domain);
    if (!STATUS.includes(clean.status)) clean.status = "GRAY";
    if (clean.status === "NOT_APPLICABLE" && !REASON_CODES.includes(clean.reason_code)) {
      // Ohne gueltigen Grund zaehlt NOT_APPLICABLE als unbekannt.
      clean.status = "GRAY";
      delete clean.reason_code;
    }
    if (clean.status !== "NOT_APPLICABLE") delete clean.reason_code;
    r.domains[name] = clean;
  }

  r.audit_meta = pick(raw.audit_meta ?? {}, ALLOW.audit_meta);
  if (r.audit_meta.coverage === "PARTIAL" && !Array.isArray(r.audit_meta.skipped_modules)) {
    r.audit_meta.skipped_modules = [];
  }

  r.modules = {};
  for (const [name, m] of Object.entries(raw.modules ?? {})) {
    const clean = pick(m, ALLOW.module);
    if (!STATUS.includes(clean.status)) clean.status = "GRAY";
    r.modules[name] = clean;
  }

  r.findings = (raw.findings ?? []).slice(0, 200).map((f) => {
    const c = pick(f, ALLOW.finding);
    c.title = line(c.title, 120);
    c.description = line(c.description, 300);
    c.component_ref = line(c.component_ref, 80);
    c.evidence_ref = line(c.evidence_ref, 64);
    if (!SEVERITY.includes(c.severity)) c.severity = "LOW";
    if (!FINDING_STATUS.includes(c.status)) c.status = "OPEN";
    return c;
  });

  r.heartbeat = pick(raw.heartbeat ?? {}, ALLOW.heartbeat);
  return r;
}

/**
 * Sanitisiert und prueft anschliessend auf verbotene Muster.
 * Findet der Scan etwas, wird der Report NICHT gesendet.
 */
export function sanitizeAndVerify(raw) {
  const report = sanitizeReport(raw);
  const leaks = scanForbidden(report);
  return { report, leaks, safe: leaks.length === 0 };
}
