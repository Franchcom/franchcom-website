// Baut den Report nach Schema V1 des Integrationsvertrags
// (FranchSecurityCenter/_audit/APP-INTEGRATION-GUIDE-V1.md).
//
// Wichtig: Der Status wird deterministisch aus den Kontrollergebnissen abgeleitet.
// Kein Sprachmodell setzt hier etwas. Fehlende Nachweise ergeben GRAY, nie GREEN.

import { randomUUID } from "node:crypto";
import { hash8 } from "./pages.mjs";

export const SCHEMA_VERSION = "1.0";

/**
 * BESTAETIGT am 2026-08-26: `franchcom-website` ist die festgelegte,
 * unveraenderliche app_id dieser App. Die Registrierung im FranchLabs
 * Security Center erfolgt zentral am 2026-08-26; die Kennung wandert
 * ab dann in jede Signatur und darf nicht mehr geaendert werden.
 */
export const APP_ID = "franchcom-website";
export const APP_ID_CONFIRMED = true;

/**
 * BESTAETIGT am 2026-08-26: environment = "production". Die Seite ist unter
 * www.franchcom.at oeffentlich erreichbar (HTTP 200, HSTS, Vercel); fuer die
 * Sicherheitsueberwachung zaehlt die tatsaechliche Exposition.
 */
export const ENVIRONMENT = "production";
export const ENVIRONMENT_CONFIRMED = true;

export const RUNNER = { name: "franchcom-website-audit-runner", version: "0.1.0" };

/** Die acht Domains des Vertrags. Fehlt eine, wird die App grau statt gruen. */
export const DOMAINS = [
  "security", "privacy", "data_integrity", "payment",
  "ai_ocr", "backup", "ux", "availability",
];

/**
 * Domains, die fuer die franchcom-website nicht zutreffen
 * (SECAUDIT SCHRITT 1, Abschnitte 7, 11, 12: kein Payment, kein OCR, kein AI).
 * NOT_APPLICABLE braucht laut Vertrag immer einen reason_code.
 *
 * WICHTIG: Diese Einstufung gilt nur, solange die jeweilige Funktion nachweislich
 * fehlt. Die Aktivierungsbedingung in `activationOverrides()` hebt sie automatisch
 * auf, sobald entsprechender Code, Konfiguration oder Zugangsdaten auftauchen.
 * NOT_APPLICABLE darf nie zu einer stillen Dauerausnahme werden.
 */
export const NOT_APPLICABLE = {
  payment: "NO_PAYMENT_FEATURE",
  ai_ocr: "NO_AI_FEATURE",
};

/**
 * Domains ohne jede Kontrolle bleiben grau -- nicht gruen.
 * backup ist bewusst grau: Code-Backup existiert (Git + Remote), aber fuer
 * Supabase- und Portal-Daten ist weder ein Backup noch je eine
 * Wiederherstellung nachgewiesen (SECAUDIT SCHRITT 1, Abschnitt 17).
 */
export const FORCED_GRAY = ["backup"];

/** finding_id = app_id:module:code:hash8(component_ref) -- stabil ueber Laeufe. */
export function findingId(module, code, componentRef) {
  return `${APP_ID}:${module}:${code}:${hash8(componentRef)}`;
}

/**
 * Deterministische Ableitung des Domainstatus, severity-gewichtet:
 * - fehlgeschlagene Kontrolle mit CRITICAL/HIGH  -> RED
 * - mindestens eine uebersprungene Kontrolle     -> GRAY (fehlender Nachweis)
 * - fehlgeschlagene Kontrolle mit MEDIUM/LOW     -> YELLOW
 * - alle Kontrollen bestanden                    -> GREEN
 * - keine Kontrollen vorhanden                   -> GRAY
 *
 * Abweichung vom GuideBooking-Runner (dort: jeder Fehlschlag -> RED), bewusst:
 * diese App hat laut SECAUDIT dokumentierte MEDIUM/LOW-Befunde (fehlende CSP,
 * Google Fonts); die gehoeren gemeldet, ohne HIGH-Befunde zu verwaessern.
 */
export function domainStatus(checks) {
  if (checks.length === 0) return "GRAY";
  const failedHigh = checks.some(
    (c) => c.ok === false && (c.severity === "CRITICAL" || c.severity === "HIGH"),
  );
  if (failedHigh) return "RED";
  if (checks.some((c) => c.skipped)) return "GRAY";
  if (checks.some((c) => c.ok === false)) return "YELLOW";
  return "GREEN";
}

/**
 * Gesamtstatus = Minimum, nicht Durchschnitt.
 * RED verschwindet nicht durch Mittelwertbildung; eine graue Pflichtdomain
 * begrenzt auf hoechstens GRAY. NOT_APPLICABLE zaehlt nicht mit.
 */
export function overallStatus(domains) {
  const relevant = Object.values(domains)
    .map((d) => d.status)
    .filter((s) => s !== "NOT_APPLICABLE");
  if (relevant.includes("RED")) return "RED";
  if (relevant.includes("GRAY")) return "GRAY";
  if (relevant.includes("YELLOW")) return "YELLOW";
  return relevant.length ? "GREEN" : "GRAY";
}

/** Status einer einzelnen Kontrolle in Modulfarbe. */
function checkColor(c) {
  if (c.ok === false) {
    return c.severity === "CRITICAL" || c.severity === "HIGH" ? "RED" : "YELLOW";
  }
  return c.skipped ? "GRAY" : "GREEN";
}

/**
 * Erzeugt aus Kontrollergebnissen den vollstaendigen Report.
 *
 * opts.activated: Liste von Domains, deren NOT_APPLICABLE-Ausnahme aufgehoben ist
 * (siehe activation.mjs). Eine aktivierte Domain wird GRAY, niemals GREEN --
 * die zugehoerigen Pruefungen existieren zu diesem Zeitpunkt ja noch nicht.
 */
export function buildReport(checks, opts = {}) {
  const now = opts.now ?? new Date().toISOString();
  const environment = opts.environment ?? ENVIRONMENT;
  const activated = new Set((opts.activated ?? []).map((a) => a.domain ?? a));

  const domains = {};
  const modules = {};
  const findings = [];

  for (const name of DOMAINS) {
    if (NOT_APPLICABLE[name] && !activated.has(name)) {
      domains[name] = { status: "NOT_APPLICABLE", reason_code: NOT_APPLICABLE[name] };
      continue;
    }
    if (NOT_APPLICABLE[name] && activated.has(name)) {
      // Aktivierungsbedingung ausgeloest: die Funktion existiert jetzt,
      // aber ihre Pruefungen noch nicht -> GRAY/NOT_CHECKED, verpflichtend.
      domains[name] = { status: "GRAY", checks_total: 0, checks_failed: 0 };
      continue;
    }
    if (FORCED_GRAY.includes(name)) {
      domains[name] = { status: "GRAY", checks_total: 0, checks_failed: 0 };
      continue;
    }
    const own = checks.filter((c) => c.domain === name);
    domains[name] = {
      status: domainStatus(own),
      checks_total: own.length,
      checks_failed: own.filter((c) => c.ok === false).length,
    };
  }

  const rank = { RED: 0, GRAY: 1, YELLOW: 2, GREEN: 3 };
  for (const c of checks) {
    const prev = modules[c.module]?.status;
    const s = checkColor(c);
    if (prev === undefined || rank[s] < rank[prev]) {
      modules[c.module] = { status: s, domain: c.domain };
    }
  }

  for (const c of checks) {
    if (c.ok !== false) continue;
    findings.push({
      finding_id: findingId(c.module, c.code, c.ref),
      module: c.module,
      domain: c.domain,
      severity: c.severity ?? "LOW",
      status: "OPEN",
      code: c.code,
      title: `Kontrolle ${c.id} nicht bestanden`,
      description: c.note ?? "Keine weitere Angabe.",
      component_ref: c.ref ?? c.module,
      first_seen: now,
      last_seen: now,
      retest_status: "NOT_RETESTED",
      // Kompaktes Datum ohne Trennzeichen: eine Kennung der Form 2026-08-26-...
      // wuerde von der Telefonheuristik des Sanitizers als Rufnummer gewertet.
      evidence_ref: `FC-AUDIT-${now.slice(0, 10).replaceAll("-", "")}-${c.id}`.slice(0, 64),
      remediation_hint_code: c.code,
    });
  }

  const skippedModules = [...new Set(checks.filter((c) => c.skipped).map((c) => c.module))];
  const sev = (s) => findings.filter((f) => f.severity === s).length;

  return {
    schema_version: SCHEMA_VERSION,
    report_id: randomUUID(),
    app_id: APP_ID,
    environment,
    audit_version: opts.auditVersion ?? "2026.08.1",
    runner: RUNNER,
    generated_at: now,
    reported_overall: overallStatus(domains),
    domains,
    audit_meta: {
      last_successful_audit: now,
      expected_interval_seconds: 86400,
      coverage: skippedModules.length ? "PARTIAL" : "FULL",
      skipped_modules: skippedModules,
      duration_ms: opts.durationMs ?? 0,
      critical_findings: sev("CRITICAL"),
      high_findings: sev("HIGH"),
      medium_findings: sev("MEDIUM"),
      low_findings: sev("LOW"),
    },
    modules,
    findings,
    heartbeat: { sent_at: now, runner_healthy: opts.runnerHealthy ?? true },
  };
}

/**
 * Heartbeat-only-Report.
 *
 * Zwei klar getrennte Faelle:
 * - healthy=true:  regulaeres Lebenszeichen. Der Runner selbst ist in Ordnung,
 *   nur der volle Audit-Lauf hat (noch) nicht stattgefunden.
 * - healthy=false: ausdruecklicher Fehler-/Fallback-Heartbeat. Nur senden, wenn
 *   der vollstaendige Lauf fehlgeschlagen oder der Runner beeintraechtigt ist.
 *   Das unterscheidet laut Vertrag "Runner kaputt" von "App still".
 */
export function buildHeartbeatOnly(healthy, now = new Date().toISOString()) {
  if (typeof healthy !== "boolean") {
    throw new TypeError("buildHeartbeatOnly verlangt eine ausdrueckliche Angabe: healthy true oder false");
  }
  const domains = {};
  for (const name of DOMAINS) {
    domains[name] = NOT_APPLICABLE[name]
      ? { status: "NOT_APPLICABLE", reason_code: NOT_APPLICABLE[name] }
      : { status: "GRAY", checks_total: 0, checks_failed: 0 };
  }
  return {
    schema_version: SCHEMA_VERSION,
    report_id: randomUUID(),
    app_id: APP_ID,
    environment: ENVIRONMENT,
    audit_version: "2026.08.1",
    runner: RUNNER,
    generated_at: now,
    reported_overall: "GRAY",
    domains,
    audit_meta: {
      last_successful_audit: now,
      expected_interval_seconds: 86400,
      coverage: "PARTIAL",
      skipped_modules: ["all"],
      duration_ms: 0,
      critical_findings: 0, high_findings: 0, medium_findings: 0, low_findings: 0,
    },
    modules: {},
    findings: [],
    heartbeat: { sent_at: now, runner_healthy: healthy },
  };
}

/** Freshness: ein Report gilt nach dem doppelten Intervall als veraltet. */
export function isStale(generatedAt, intervalSeconds = 86400, now = Date.now()) {
  return now - Date.parse(generatedAt) > intervalSeconds * 2 * 1000;
}
