// Tests fuer Statusableitung und Schema V1 -- ausschliesslich synthetische Daten.
// Der wichtigste Test steht am Ende: ein leerer Kontrollsatz darf nie GREEN ergeben.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReport, buildHeartbeatOnly, domainStatus, overallStatus, findingId,
  isStale, DOMAINS, NOT_APPLICABLE, APP_ID, APP_ID_CONFIRMED,
  ENVIRONMENT, ENVIRONMENT_CONFIRMED,
} from "../lib/report.mjs";
import { isValidCode, CODES } from "../lib/codes.mjs";

const check = (o) => ({
  id: "c", module: "m", domain: "security", ok: true, skipped: false,
  severity: "MEDIUM", code: "PAGE_UNEXPECTED_STATUS", ref: "public/x", note: "synthetisch",
  ...o,
});

// --- Festgelegte Kennungen -------------------------------------------------

test("app_id und environment sind bestaetigt und unveraenderlich", () => {
  assert.equal(APP_ID, "franchcom-website");
  assert.equal(APP_ID_CONFIRMED, true);
  assert.equal(ENVIRONMENT, "production");
  assert.equal(ENVIRONMENT_CONFIRMED, true);
  assert.match(APP_ID, /^[a-z][a-z0-9-]{2,48}$/);
});

// --- Statusableitung -------------------------------------------------------

test("leerer Kontrollsatz ergibt GRAY, niemals GREEN", () => {
  assert.equal(domainStatus([]), "GRAY");
});

test("fehlgeschlagene HIGH-Kontrolle ergibt RED", () => {
  assert.equal(domainStatus([check(), check({ ok: false, severity: "HIGH" })]), "RED");
});

test("fehlgeschlagene MEDIUM-Kontrolle ergibt YELLOW, nicht RED", () => {
  assert.equal(domainStatus([check(), check({ ok: false, severity: "MEDIUM" })]), "YELLOW");
});

test("uebersprungene Kontrolle ergibt GRAY, nicht GREEN", () => {
  assert.equal(domainStatus([check(), check({ ok: null, skipped: true })]), "GRAY");
});

test("fehlender Nachweis wiegt schwerer als ein gelber Befund", () => {
  const checks = [check({ ok: false, severity: "LOW" }), check({ ok: null, skipped: true })];
  assert.equal(domainStatus(checks), "GRAY");
});

test("nur bestandene Kontrollen ergeben GREEN", () => {
  assert.equal(domainStatus([check(), check()]), "GREEN");
});

test("RED verschwindet nicht durch Mittelwertbildung", () => {
  const d = {
    a: { status: "GREEN" }, b: { status: "GREEN" }, c: { status: "GREEN" },
    d: { status: "GREEN" }, e: { status: "RED" },
  };
  assert.equal(overallStatus(d), "RED");
});

test("eine graue Pflichtdomain begrenzt den Gesamtstatus auf GRAY", () => {
  assert.equal(overallStatus({ a: { status: "GREEN" }, b: { status: "GRAY" } }), "GRAY");
});

test("NOT_APPLICABLE zaehlt nicht in den Gesamtstatus", () => {
  const d = { a: { status: "GREEN" }, b: { status: "NOT_APPLICABLE", reason_code: "NO_AI_FEATURE" } };
  assert.equal(overallStatus(d), "GREEN");
});

// --- Schema ----------------------------------------------------------------

test("alle acht Domains kommen im Report vor", () => {
  const r = buildReport([check()]);
  assert.deepEqual(Object.keys(r.domains).sort(), [...DOMAINS].sort());
});

test("jede NOT_APPLICABLE-Domain hat einen reason_code aus dem Katalog", () => {
  const r = buildReport([check()]);
  for (const [name, d] of Object.entries(r.domains)) {
    if (d.status === "NOT_APPLICABLE") {
      assert.equal(d.reason_code, NOT_APPLICABLE[name], `${name} ohne reason_code`);
    }
  }
});

test("backup bleibt grau, solange Wiederherstellung unbelegt ist", () => {
  const r = buildReport([check()]);
  assert.equal(r.domains.backup.status, "GRAY");
});

test("uebersprungene Kontrollen erzwingen coverage PARTIAL mit skipped_modules", () => {
  const r = buildReport([check({ ok: null, skipped: true, module: "repo_governance" })]);
  assert.equal(r.audit_meta.coverage, "PARTIAL");
  assert.ok(r.audit_meta.skipped_modules.includes("repo_governance"));
});

test("ohne uebersprungene Kontrollen ist coverage FULL", () => {
  const r = buildReport([check()]);
  assert.equal(r.audit_meta.coverage, "FULL");
  assert.deepEqual(r.audit_meta.skipped_modules, []);
});

test("finding_id ist deterministisch und ueber Laeufe stabil", () => {
  const a = findingId("public_site", "CSP_MISSING", "public/*");
  const b = findingId("public_site", "CSP_MISSING", "public/*");
  assert.equal(a, b);
  assert.match(a, /^franchcom-website:public_site:CSP_MISSING:[0-9a-f]{8}$/);
});

test("nur fehlgeschlagene Kontrollen erzeugen Findings, Severity wird gezaehlt", () => {
  const r = buildReport([
    check(),
    check({ id: "f1", ok: false, severity: "HIGH", code: "SHARE_TOKEN_IN_PUBLIC_HTML", module: "mandate_pages", ref: "mandate-pages" }),
    check({ id: "f2", ok: false, severity: "MEDIUM", code: "CSP_MISSING" }),
  ]);
  assert.equal(r.findings.length, 2);
  assert.equal(r.audit_meta.high_findings, 1);
  assert.equal(r.audit_meta.medium_findings, 1);
  for (const f of r.findings) {
    assert.ok(isValidCode(f.code), `unbekannter Code ${f.code}`);
    assert.ok(f.title.length <= 120);
    assert.ok(f.description.length <= 300);
    assert.ok(f.component_ref.length <= 80);
    assert.ok(f.evidence_ref.length <= 64);
    assert.equal(f.retest_status, "NOT_RETESTED");
  }
});

test("aktivierte Domain verlaesst NOT_APPLICABLE und wird GRAY, nie GREEN", () => {
  const r = buildReport([check()], { activated: [{ domain: "payment" }] });
  assert.equal(r.domains.payment.status, "GRAY");
  assert.equal(r.domains.payment.reason_code, undefined);
  assert.equal(r.reported_overall, "GRAY");
});

test("Modulstatus folgt der schlechtesten Kontrolle", () => {
  const r = buildReport([
    check({ module: "public_site" }),
    check({ module: "public_site", ok: false, severity: "MEDIUM" }),
    check({ module: "mandate_pages", ok: false, severity: "HIGH" }),
  ]);
  assert.equal(r.modules.public_site.status, "YELLOW");
  assert.equal(r.modules.mandate_pages.status, "RED");
});

// --- Heartbeat ---------------------------------------------------------------

test("Heartbeat verlangt eine ausdrueckliche Angabe", () => {
  assert.throws(() => buildHeartbeatOnly(), TypeError);
});

test("Heartbeat-Report ist schema-vollstaendig und nutzt das bestaetigte Environment", () => {
  const r = buildHeartbeatOnly(false);
  assert.deepEqual(Object.keys(r.domains).sort(), [...DOMAINS].sort());
  assert.equal(r.environment, ENVIRONMENT);
  assert.equal(r.heartbeat.runner_healthy, false);
  assert.equal(r.audit_meta.coverage, "PARTIAL");
  assert.ok(r.audit_meta.skipped_modules.length > 0);
});

// --- Freshness / Codes -------------------------------------------------------

test("ein Report gilt nach dem doppelten Intervall als veraltet", () => {
  const now = Date.parse("2026-08-26T00:00:00.000Z");
  assert.equal(isStale("2026-08-25T00:00:00.000Z", 86400, now), false);
  assert.equal(isStale("2026-08-23T00:00:00.000Z", 86400, now), true);
});

test("alle Codes der Liste erfuellen das Vertragsmuster", () => {
  for (const code of Object.keys(CODES)) {
    assert.match(code, /^[A-Z][A-Z0-9_]{3,60}$/);
    assert.ok(isValidCode(code));
  }
  assert.equal(isValidCode("nicht_gross"), false);
  assert.equal(isValidCode("UNBEKANNTER_CODE"), false);
});
