#!/usr/bin/env node
// franchcom-website Audit-Runner (Anbindung an das FranchLabs Security Center).
//
//   node audit/run.mjs --dry-run             Report erzeugen und ausgeben, nichts senden (Standard)
//   node audit/run.mjs --send                zusaetzlich an das Security Center senden
//   node audit/run.mjs --heartbeat           regulaeres Lebenszeichen, runner_healthy=true
//   node audit/run.mjs --heartbeat-failure   Fehler-Heartbeat, runner_healthy=false --
//                                            NUR wenn der volle Lauf fehlgeschlagen ist
//   node audit/run.mjs --out <datei>         Report zusaetzlich als Datei ablegen
//
// Umgebungsvariablen (nur fuer --send):
//   SC_REPORT_URL    Endpunkt des Security Centers
//   SC_PRIVATE_KEY   privater Ed25519-Schluessel (PKCS8-PEM) -- NIE im Repository
//   SC_KEY_VERSION   Schluesselversion, Standard "v1"
//
// Exit-Codes -- bewusste Abweichung vom GuideBooking-Runner:
//   0  Lauf vollstaendig; der Status (auch RED) steht im Report
//   1  unerwarteter Runnerfehler
//   2  Sanitizer hat verbotene Muster gefunden, nichts gesendet
//   3  Report dauerhaft abgelehnt (401/413/422)
// Begruendung: Fuer diese App ist RED laut SECAUDIT SCHRITT 1 der ab Tag 1
// erwartete, korrekte Befund (offene Mandats-Ebene). Ein roter Befund darf
// den CI-Lauf nicht als "Runner kaputt" erscheinen lassen -- sonst wuerde
// jede Nacht ein falscher Fehler-Heartbeat (runner_healthy=false) ausgeloest.
//
// Grundsaetze: read-only, nicht destruktiv, ohne Fremdpakete, ausschliesslich
// Statuscodes, Header und oeffentlich ausgeliefertes HTML. Keine Dateninhalte.

import { writeFileSync } from "node:fs";
import { runAllChecks } from "./lib/checks.mjs";
import { buildReport, buildHeartbeatOnly, isStale, APP_ID } from "./lib/report.mjs";
import { activationOverrides } from "./lib/activation.mjs";
import { sanitizeAndVerify } from "./lib/sanitize.mjs";
import { sendReport } from "./lib/sign.mjs";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

const MODE_SEND = has("--send");
const MODE_HEARTBEAT = has("--heartbeat");
const MODE_HEARTBEAT_FAILURE = has("--heartbeat-failure");
const OUT = val("--out");

function log(...m) { process.stderr.write(m.join(" ") + "\n"); }

const started = Date.now();

let raw;
if (MODE_HEARTBEAT_FAILURE) {
  raw = buildHeartbeatOnly(false);
  log("Modus: Fehler-Heartbeat -- runner_healthy=false");
} else if (MODE_HEARTBEAT) {
  raw = buildHeartbeatOnly(true);
  log("Modus: Heartbeat -- runner_healthy=true");
} else {
  log("Modus:", MODE_SEND ? "Audit + Versand" : "Audit (Dry Run)");
  const checks = await runAllChecks();
  const passed = checks.filter((c) => c.ok === true).length;
  const failed = checks.filter((c) => c.ok === false).length;
  const skip = checks.filter((c) => c.skipped).length;
  log(`Kontrollen: ${checks.length} gesamt, ${passed} bestanden, ${failed} fehlgeschlagen, ${skip} uebersprungen`);
  for (const c of checks) {
    const mark = c.ok === true ? "OK  " : c.ok === false ? "FAIL" : "SKIP";
    log(`  ${mark}  ${c.id.padEnd(36)} ${c.note}`);
  }
  // Aktivierungsbedingung: taucht Zahlungs- oder AI/OCR-Funktionalitaet auf,
  // faellt die betroffene Domain aus NOT_APPLICABLE heraus und wird GRAY.
  const activated = activationOverrides();
  for (const a of activated) {
    log(`  AKTIVIERT  Domain ${a.domain} verlaesst NOT_APPLICABLE: ${a.reason} (${a.evidence} Nachweise)`);
  }
  raw = buildReport(checks, { durationMs: Date.now() - started, activated });
}

// --- Sanitizer: die erste Verteidigungslinie -------------------------------
const { report, leaks, safe } = sanitizeAndVerify(raw);

if (!safe) {
  log("");
  log("ABBRUCH: Der Sanitizer hat verbotene Muster gefunden. Es wird nichts gesendet.");
  for (const l of leaks) log(`  ${l.kind} in Feld ${l.field}`);
  process.exit(2);
}

// --- Freshness -------------------------------------------------------------
const stale = isStale(report.generated_at, report.audit_meta.expected_interval_seconds);

log("");
log(`App:              ${APP_ID}`);
log(`Umgebung:         ${report.environment}`);
log(`Gesamtstatus:     ${report.reported_overall}`);
log(`Abdeckung:        ${report.audit_meta.coverage}`);
log(`Findings:         ${report.findings.length}`);
log(`Heartbeat:        runner_healthy=${report.heartbeat.runner_healthy}`);
log(`Freshness:        ${stale ? "STALE" : "frisch"}`);
log(`Sanitizer:        sauber, ${Object.keys(report).length} Wurzelfelder`);

const json = JSON.stringify(report, null, 2);
process.stdout.write(json + "\n");
if (OUT) { writeFileSync(OUT, json + "\n", "utf8"); log(`Report abgelegt:  ${OUT}`); }

// --- Versand ---------------------------------------------------------------
if (MODE_SEND) {
  const url = process.env.SC_REPORT_URL;
  const privateKeyPem = process.env.SC_PRIVATE_KEY;
  const keyVersion = process.env.SC_KEY_VERSION || "v1";
  if (!url || !privateKeyPem) {
    log("");
    log("KEIN VERSAND: SC_REPORT_URL oder SC_PRIVATE_KEY nicht gesetzt.");
    log("Die Freigabe des Versands erfolgt erst nach der zentralen Registrierung der App.");
    process.exit(0);
  }
  const res = await sendReport(report, { url, appId: APP_ID, keyVersion, privateKeyPem });
  log("");
  log(`Versand: ${res.sent ? "angenommen (202)" : `nicht gesendet (${res.reason})`}`);
  if (!res.sent && res.reason === "PERMANENT_REJECT") process.exit(3);
}

// Ein roter Befund ist fuer diese App der erwartete, korrekte Zustand bis zur
// Behebung der Mandats-Ebene -- er wird gemeldet, bricht den Lauf aber nicht.
// Schweigen ist laut Vertrag die schlechteste Variante.
if (report.reported_overall === "RED") {
  log("");
  log("Gesamtstatus RED -- Befund steht im Report; der Lauf selbst ist vollstaendig.");
  if (process.env.GITHUB_ACTIONS) {
    // Sichtbarkeit im CI ohne den Lauf als Fehler zu markieren.
    process.stdout.write(`::warning title=Security Audit::Gesamtstatus RED, ${report.findings.length} offene Findings\n`);
  }
}
