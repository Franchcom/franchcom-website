// Tests fuer kanonische Zeichenkette, Endpunktpfad und Antwortklassifikation.
// Bewusst OHNE Schluesselerzeugung: Schluesselmaterial entsteht ausschliesslich
// beim Betreiber (siehe README) und hat in Tests nichts verloren.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  canonicalString, endpointUrl, classifyResponse,
  CANONICAL_PREFIX, CANONICAL_METHOD, CANONICAL_PATH,
} from "../lib/sign.mjs";
import { PAYMENT_CONTENT, AI_CONTENT, scan, PAYMENT_PATHS } from "../lib/activation.mjs";

// --- Kanonische Zeichenkette (Vertrag Abschnitt 7) ---------------------------

test("kanonische Zeichenkette hat exakt die acht Vertragsteile in Reihenfolge", () => {
  const bodyHash = createHash("sha256").update("{}", "utf8").digest("hex");
  const s = canonicalString({
    appId: "franchcom-website", keyVersion: "v1",
    timestamp: 1756171200, nonce: "a".repeat(32), bodyHash,
  });
  const teile = s.split("\n");
  assert.equal(teile.length, 8);
  assert.deepEqual(teile.slice(0, 3), [CANONICAL_PREFIX, CANONICAL_METHOD, CANONICAL_PATH]);
  assert.equal(teile[3], "franchcom-website");
  assert.equal(teile[4], "v1");
  assert.equal(teile[5], "1756171200");
  assert.equal(teile[6], "a".repeat(32));
  assert.equal(teile[7], bodyHash);
});

test("der Vertragspfad wird ergaenzt, wenn nur die Basis-URL gesetzt ist", () => {
  assert.equal(endpointUrl("https://sc.example"), "https://sc.example" + CANONICAL_PATH);
  assert.equal(endpointUrl("https://sc.example/"), "https://sc.example" + CANONICAL_PATH);
  assert.equal(endpointUrl("https://sc.example" + CANONICAL_PATH), "https://sc.example" + CANONICAL_PATH);
});

// --- Antwortklassifikation (Vertrag Abschnitt 8) -----------------------------

test("202 ist angenommen, 401/413/422 sind endgueltig", () => {
  assert.equal(classifyResponse(202), "ACCEPTED");
  for (const s of [401, 413, 422]) assert.equal(classifyResponse(s), "PERMANENT");
});

test("409 verlangt frische Nonce, 429 wartet, 5xx wiederholt", () => {
  assert.equal(classifyResponse(409), "RETRY_NEW_NONCE");
  assert.equal(classifyResponse(429), "RATE_LIMIT");
  assert.equal(classifyResponse(500), "RETRY");
  assert.equal(classifyResponse(503), "RETRY");
});

// --- Aktivierungsbedingungen -------------------------------------------------

test("Zahlungs- und AI-Muster treffen synthetische Beispiele", () => {
  assert.ok(PAYMENT_CONTENT.some((re) => re.test("wir nutzen jetzt Stripe Checkout")));
  assert.ok(PAYMENT_CONTENT.some((re) => re.test("payment_intent erzeugt")));
  assert.ok(AI_CONTENT.some((re) => re.test("Texterkennung via OCR")));
  assert.ok(AI_CONTENT.some((re) => re.test("openai client")));
});

test("Aktivierungs-Scan ignoriert Audit- und CI-Dateien", () => {
  const files = ["audit/lib/activation.mjs", ".github/workflows/audit.yml", "_planning/plan.md"];
  const hits = scan(files, PAYMENT_PATHS, PAYMENT_CONTENT, () => "stripe stripe stripe");
  assert.deepEqual(hits, []);
});

test("Aktivierungs-Scan meldet Zahlungsinhalte in ausgelieferten Dateien", () => {
  const hits = scan(["seite.html"], PAYMENT_PATHS, PAYMENT_CONTENT, () => "hier kommt paypal hin");
  assert.deepEqual(hits, ["seite.html"]);
});
