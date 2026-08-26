// Ed25519-Signatur und Versand nach Abschnitt 7 und 8 des Integrationsvertrags.
// Uebernommen aus dem Referenz-Client des Security Centers (runner/melden.mjs):
// ausschliesslich node:crypto und fetch, keine Abhaengigkeiten.
//
// Der private Schluessel kommt ausschliesslich aus der Umgebung
// (SC_PRIVATE_KEY) und verlaesst sie nie -- weder ins Repository noch in Logs.

import { createHash, createPrivateKey, randomBytes, sign } from "node:crypto";

export const CANONICAL_PREFIX = "SCv1";
export const CANONICAL_METHOD = "POST";
export const CANONICAL_PATH = "/api/security-center/report";

/**
 * Baut die kanonische Zeichenkette. Signiert wird nicht das Objekt,
 * sondern genau diese Kette ueber den SHA-256-Hash des rohen Bodys.
 */
export function canonicalString({ appId, keyVersion, timestamp, nonce, bodyHash }) {
  return [
    CANONICAL_PREFIX, CANONICAL_METHOD, CANONICAL_PATH,
    appId, keyVersion, String(timestamp), nonce, bodyHash,
  ].join("\n");
}

/** Endpunkt-URL: der Vertragspfad wird ergaenzt, falls nur die Basis gesetzt ist. */
export function endpointUrl(url) {
  return url.endsWith(CANONICAL_PATH) ? url : url.replace(/\/$/, "") + CANONICAL_PATH;
}

/**
 * Klassifiziert eine Antwort nach Vertrag Abschnitt 8 (rein, testbar):
 * 202 fertig; 401/413/422 endgueltig (nie wiederholen); 409 frische Nonce;
 * 429 nach Retry-After; alles andere Backoff.
 */
export function classifyResponse(status) {
  if (status === 202) return "ACCEPTED";
  if (status === 401 || status === 413 || status === 422) return "PERMANENT";
  if (status === 409) return "RETRY_NEW_NONCE";
  if (status === 429) return "RATE_LIMIT";
  return "RETRY";
}

/**
 * Erzeugt Body, Header und Signatur. Der Body wird genau einmal serialisiert --
 * jede Umformatierung danach macht die Signatur ungueltig.
 */
export function prepareRequest(report, { appId, keyVersion = "v1", privateKeyPem, now = Date.now(), body }) {
  const rawBody = body ?? JSON.stringify(report);
  const timestamp = Math.floor(now / 1000);
  const nonce = randomBytes(16).toString("hex");
  const bodyHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const canonical = canonicalString({ appId, keyVersion, timestamp, nonce, bodyHash });

  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(canonical, "utf8"), key);

  return {
    body: rawBody,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-sc-app-id": appId,
      "x-sc-key-version": keyVersion,
      "x-sc-timestamp": String(timestamp),
      "x-sc-nonce": nonce,
      "x-sc-signature": signature.toString("base64"),
      "x-sc-algo": "ed25519",
    },
  };
}

/**
 * Sendet den Report mit dem Wiederholungsverhalten aus Vertrag Abschnitt 8.
 * Idempotenz ueber die unveraenderte report_id; jede Wiederholung nutzt eine
 * NEUE Nonce und einen neuen Zeitstempel -- der Server dedupliziert.
 */
export async function sendReport(report, { url, appId, keyVersion = "v1", privateKeyPem }) {
  if (!url) return { sent: false, reason: "NO_ENDPOINT_CONFIGURED" };

  const body = JSON.stringify(report); // exakt diese Bytes werden je Versuch signiert
  const ziel = endpointUrl(url);
  const pausen = [0, 2000, 8000];
  let letzte = { status: 0 };

  for (let versuch = 0; versuch < pausen.length; versuch++) {
    if (pausen[versuch]) await new Promise((r) => setTimeout(r, pausen[versuch]));

    let res;
    try {
      const { headers } = prepareRequest(report, { appId, keyVersion, privateKeyPem, body });
      res = await fetch(ziel, { method: "POST", headers, body });
    } catch {
      letzte = { status: 0 };
      continue; // Netzwerkfehler -> Backoff, neue Nonce
    }
    letzte = { status: res.status };

    const einordnung = classifyResponse(res.status);
    if (einordnung === "ACCEPTED") return { sent: true, status: 202 };
    if (einordnung === "PERMANENT") return { sent: false, status: res.status, reason: "PERMANENT_REJECT" };
    if (einordnung === "RATE_LIMIT") {
      const retryAfter = Math.min(Number(res.headers.get("retry-after")) || 2, 60);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
    }
    // RETRY_NEW_NONCE und RETRY: naechster Durchlauf signiert neu
  }
  return { sent: false, status: letzte.status, reason: "RETRIES_EXHAUSTED" };
}
