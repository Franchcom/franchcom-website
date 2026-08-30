// Aktivierungsbedingungen fuer Domains, die heute als NOT_APPLICABLE gefuehrt werden.
//
// Der Zweck: NOT_APPLICABLE darf keine stille Dauerausnahme werden. Sobald die
// Funktion tatsaechlich entsteht, muss die Domain automatisch aus der Ausnahme
// fallen und auf GRAY/NOT_CHECKED gehen -- nicht auf GREEN. Wer eine Zahlung
// einbaut, soll den Auditstatus nicht versehentlich gruen lassen, sondern
// ausdruecklich grau bekommen, bis die Zahlungspruefungen existieren.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** Dateien, die auf eine Zahlungsfunktion hindeuten. */
export const PAYMENT_PATHS = [
  /(^|\/)payments?\//i,
  /(^|\/)billing\//i,
  /(^|\/)checkout\//i,
  /stripe/i,
  /paypal/i,
  /webhook/i,
  /(^|\/)invoices?\//i,
];

/** Zeichenketten, die auf Zahlungscode oder Zugangsdaten hindeuten. */
export const PAYMENT_CONTENT = [
  /\bstripe\b/i,
  /\bpaypal\b/i,
  /sk_(live|test)_[A-Za-z0-9]/,
  /whsec_[A-Za-z0-9]/,
  /payment_intent/i,
  /checkout\.session/i,
];

/** Dateien und Inhalte, die auf AI oder OCR hindeuten. */
export const AI_PATHS = [/(^|\/)ai\//i, /(^|\/)ocr\//i, /tesseract/i];
export const AI_CONTENT = [
  /\bopenai\b/i, /\banthropic\b/i, /\btesseract\b/i,
  /\bocr\b/i, /\bvision\b.*\bapi\b/i,
];

/** Umgebungsvariablen, deren blosse Existenz die Domain aktiviert. */
const PAYMENT_ENV = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "PAYPAL_CLIENT_ID", "PAYMENT_PROVIDER"];
const AI_ENV = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OCR_PROVIDER"];

export function scan(files, pathPatterns, contentPatterns, readFile = (f) => readFileSync(f, "utf8")) {
  const hits = [];
  for (const f of files) {
    if (pathPatterns.some((re) => re.test(f))) { hits.push(f); continue; }
    if (/\.(woff2?|png|jpg|jpeg|gif|zip|pdf|ico|webp)$/i.test(f)) continue;
    // Der Audit-Runner und die Planungs-/CI-Unterlagen enthalten diese Begriffe
    // zwangslaeufig -- sie sind das Werkzeug, nicht der Gegenstand der Pruefung.
    if (f.startsWith("audit/") || f.startsWith("_planning/") || f.startsWith(".github/")) continue;
    let text = "";
    try { text = readFile(f); } catch { continue; }
    if (contentPatterns.some((re) => re.test(text))) hits.push(f);
  }
  return hits;
}

/**
 * Ermittelt, welche NOT_APPLICABLE-Ausnahmen aufzuheben sind.
 *
 * @returns {{domain: string, reason: string, evidence: number}[]}
 */
export function activationOverrides() {
  const files = trackedFiles();
  const out = [];

  const paymentFiles = scan(files, PAYMENT_PATHS, PAYMENT_CONTENT);
  const paymentEnv = PAYMENT_ENV.filter((k) => process.env[k]);
  if (paymentFiles.length || paymentEnv.length) {
    out.push({
      domain: "payment",
      reason: paymentEnv.length
        ? "Zahlungs-Zugangsdaten in der Umgebung gefunden"
        : "Zahlungscode oder Zahlungskonfiguration im Repository gefunden",
      evidence: paymentFiles.length + paymentEnv.length,
    });
  }

  const aiFiles = scan(files, AI_PATHS, AI_CONTENT);
  const aiEnv = AI_ENV.filter((k) => process.env[k]);
  if (aiFiles.length || aiEnv.length) {
    out.push({
      domain: "ai_ocr",
      reason: aiEnv.length
        ? "AI- oder OCR-Zugangsdaten in der Umgebung gefunden"
        : "AI- oder OCR-Funktion im Repository gefunden",
      evidence: aiFiles.length + aiEnv.length,
    });
  }

  return out;
}
