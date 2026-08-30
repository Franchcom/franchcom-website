// Tests fuer den Sanitizer -- ausschliesslich synthetische Daten.
// Kein Wert in dieser Datei stammt aus Produktionsdaten.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeReport, scanForbidden, sanitizeAndVerify } from "../lib/sanitize.mjs";
import { buildReport } from "../lib/report.mjs";
import { opaqueId, mandateForbiddenTerms, MANDATE_PAGES } from "../lib/pages.mjs";

const check = (o) => ({
  id: "c", module: "m", domain: "security", ok: true, skipped: false,
  severity: "MEDIUM", code: "PAGE_UNEXPECTED_STATUS", ref: "public/x", note: "synthetisch",
  ...o,
});

// --- Allowlist ---------------------------------------------------------------

test("unbekannte Wurzelfelder werden entfernt", () => {
  const r = sanitizeReport({ ...buildReport([check()]), kundendaten: "x", debug: {} });
  assert.equal(Object.hasOwn(r, "kundendaten"), false);
  assert.equal(Object.hasOwn(r, "debug"), false);
});

test("unbekannte Finding-Felder werden entfernt, Grenzen erzwungen", () => {
  const raw = buildReport([check({ ok: false })]);
  raw.findings[0].stacktrace = "geheim";
  raw.findings[0].title = "T".repeat(500) + "\nzweite Zeile";
  const r = sanitizeReport(raw);
  assert.equal(Object.hasOwn(r.findings[0], "stacktrace"), false);
  assert.equal(r.findings[0].title.length <= 120, true);
  assert.equal(r.findings[0].title.includes("\n"), false);
});

test("NOT_APPLICABLE ohne gueltigen reason_code wird zu GRAY", () => {
  const raw = buildReport([check()]);
  raw.domains.payment = { status: "NOT_APPLICABLE", reason_code: "WEIL_HALT" };
  const r = sanitizeReport(raw);
  assert.equal(r.domains.payment.status, "GRAY");
  assert.equal(Object.hasOwn(r.domains.payment, "reason_code"), false);
});

test("mehr als 200 Findings werden gekappt", () => {
  const raw = buildReport(
    Array.from({ length: 250 }, (_, i) => check({ id: `c${i}`, ok: false, ref: `public/${i}` })),
  );
  assert.equal(sanitizeReport(raw).findings.length, 200);
});

// --- Verbotene Muster --------------------------------------------------------

test("E-Mail-Adresse wird erkannt", () => {
  assert.ok(scanForbidden({ note: "kontakt beispiel@example.org bitte" }).length > 0);
});

test("Tokens, Schluessel und Datenbank-URLs werden erkannt", () => {
  for (const s of [
    "sk_live_0000000000abc", "ghp_" + "a".repeat(24), "Bearer abcdefghij.klmnop",
    "postgres://x", "-----BEGIN X PRIVATE KEY-----",
    "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig",
  ]) {
    assert.ok(scanForbidden({ v: s }).length > 0, `nicht erkannt: ${s}`);
  }
});

test("absolute Dateipfade und IPv4-Adressen werden erkannt", () => {
  assert.ok(scanForbidden({ v: "C:\\projekt\\datei.txt" }).length > 0);
  assert.ok(scanForbidden({ v: "/Users/jemand/x" }).length > 0);
  assert.ok(scanForbidden({ v: "erreichbar unter 203.0.113.7 port 443" }).length > 0);
});

test("Portal-Host und Share-Token-Muster werden erkannt", () => {
  assert.ok(scanForbidden({ v: "https://portal.franchcom.at/s/AbCdEf123456" }).length > 0);
  assert.ok(scanForbidden({ v: "siehe /s/QrStUv987654 dort" }).length > 0);
});

test("Mandatskennungen aus den Seitenpfaden sind verboten", () => {
  const terms = mandateForbiddenTerms();
  assert.ok(terms.length >= 2);
  for (const t of terms) {
    assert.ok(scanForbidden({ v: `Befund auf Seite ${t} gefunden` }).length > 0, `nicht erkannt: ${t}`);
  }
});

test("opake Mandatskennungen passieren den Scan", () => {
  for (const p of MANDATE_PAGES) {
    assert.equal(scanForbidden({ v: `Status der Seite ${opaqueId(p)}` }).length, 0);
  }
});

test("ISO-Zeitstempel und UUIDs schlagen nicht als Telefonnummer an", () => {
  assert.equal(scanForbidden({
    t: "2026-08-26T02:20:00.000Z",
    d: "2026-08-26",
    u: "0f8fad5b-d9cb-469f-a165-70867728950e",
  }).length, 0);
});

test("evidence_ref im Kompaktformat passiert den Scan", () => {
  assert.equal(scanForbidden({ e: "FC-AUDIT-20260826-security_headers" }).length, 0);
});

// --- Ende-zu-Ende ------------------------------------------------------------

test("ein regulaerer Report ist nach Sanitisierung leckfrei", () => {
  const raw = buildReport([
    check(),
    check({ id: "f", ok: false, severity: "HIGH", code: "SHARE_TOKEN_IN_PUBLIC_HTML", module: "mandate_pages", ref: "mandate-pages", note: "3 Links in 2 Seiten" }),
  ]);
  const { safe, leaks } = sanitizeAndVerify(raw);
  assert.equal(safe, true, JSON.stringify(leaks));
});

test("ein Report mit eingeschleustem Personenbezug wird blockiert", () => {
  const raw = buildReport([
    check({ id: "f", ok: false, note: `Seite ${mandateForbiddenTerms()[0]} betroffen` }),
  ]);
  const { safe, leaks } = sanitizeAndVerify(raw);
  assert.equal(safe, false);
  assert.ok(leaks.some((l) => l.kind === "Mandatskennung"));
});
