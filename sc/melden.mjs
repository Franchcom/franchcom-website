/**
 * Referenz-Sender fuer das FranchLabs Security Center (Schema V1).
 * Ausschliesslich node:crypto und fetch - keine Abhaengigkeiten, kopierbar in
 * jedes Projekt (auch solche mit "keine package.json"-Regel).
 *
 * Vertrag: _audit/APP-INTEGRATION-GUIDE-V1.md (Abschnitte 7 und 8).
 *
 *   import { sendeReport } from "./melden.mjs";
 *   const ergebnis = await sendeReport(report, {
 *     url: process.env.SC_URL,                 // https://…/api/security-center/report
 *     appId: "meine-app",
 *     keyVersion: "v1",
 *     privateKeyPem: process.env.SC_PRIVATE_KEY,
 *   });
 */

import { createHash, createPrivateKey, randomBytes, sign } from "node:crypto";

const PFAD = "/api/security-center/report";

function signiere({ appId, keyVersion, timestamp, nonce, body, privateKeyPem }) {
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  const kanonisch = ["SCv1", "POST", PFAD, appId, keyVersion, String(timestamp), nonce, bodyHash].join(
    "\n",
  );
  const key = createPrivateKey(privateKeyPem);
  return sign(null, Buffer.from(kanonisch, "utf8"), key).toString("base64");
}

async function einmalSenden(body, { url, appId, keyVersion, privateKeyPem }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const signature = signiere({ appId, keyVersion, timestamp, nonce, body, privateKeyPem });

  const antwort = await fetch(url.endsWith(PFAD) ? url : url.replace(/\/$/, "") + PFAD, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-sc-app-id": appId,
      "x-sc-key-version": keyVersion,
      "x-sc-timestamp": String(timestamp),
      "x-sc-nonce": nonce,
      "x-sc-signature": signature,
      "x-sc-algo": "ed25519",
    },
    body,
  });
  let daten = {};
  try {
    daten = await antwort.json();
  } catch {
    /* 5xx ohne JSON */
  }
  return { status: antwort.status, daten, retryAfter: Number(antwort.headers.get("retry-after") ?? 0) };
}

/**
 * Sendet mit dem Wiederholungsverhalten aus Leitfaden Abschnitt 8:
 * 202 fertig; 401/422 NICHT wiederholen (Konfigurations-/Inhaltsfehler);
 * 409 einmal mit frischer Nonce; 429 nach Retry-After; 5xx mit wachsendem
 * Abstand. Jede Wiederholung nutzt eine NEUE Nonce, aber dieselbe report_id -
 * der Server dedupliziert.
 */
export async function sendeReport(report, optionen) {
  const body = JSON.stringify(report); // exakt diese Bytes werden signiert
  const pausen = [0, 2000, 8000];
  let letzte;

  for (let versuch = 0; versuch < pausen.length; versuch++) {
    if (pausen[versuch]) await new Promise((r) => setTimeout(r, pausen[versuch]));
    letzte = await einmalSenden(body, optionen);

    if (letzte.status === 202) return letzte;
    if (letzte.status === 401 || letzte.status === 422 || letzte.status === 413) return letzte;
    if (letzte.status === 409) continue; // frische Nonce beim naechsten Durchlauf
    if (letzte.status === 429) {
      await new Promise((r) => setTimeout(r, Math.min(letzte.retryAfter, 60) * 1000));
      continue;
    }
    // 5xx: naechster Durchlauf mit Backoff
  }
  return letzte;
}
