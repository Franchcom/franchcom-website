// Seitenregister der franchcom-website.
//
// Zwei getrennte Ebenen im selben Deployment (SECAUDIT SCHRITT 1, Abschnitt 1):
//   - Marketing-Ebene: oeffentlich, indexiert, unkritisch.
//   - Mandats-Ebene:   noindex, aber technisch vollstaendig oeffentlich.
//
// Datenklassifikation (Implementation Plan, Kapitel 6): Pfade der Mandats-Ebene
// enthalten Personenbezug und duerfen in Reports, Findings und Logs NUR als
// opake Kennung erscheinen. Die Klartextpfade bleiben in diesem Modul und
// werden ausschliesslich fuer die HTTP-Pruefungen selbst verwendet; der
// Sanitizer (lib/sanitize.mjs) erzwingt das zusaetzlich.

import { createHash } from "node:crypto";

/** Produktive Basis: der Apex leitet per 308 auf www um (verifiziert 2026-08-26). */
export const BASE = "https://www.franchcom.at";
export const APEX = "https://franchcom.at";

/** Oeffentliche, indexierte Seiten (cleanUrls aktiv, daher ohne .html). */
export const MARKETING_PAGES = ["/", "/gruppe", "/impressum", "/datenschutz"];

/**
 * Mandats-Ebene: noindex, kein Zugriffsschutz (Soll-Zustand laut Plan: 401/403).
 * Diese Pfade duerfen den Runner nie in Richtung Report verlassen.
 */
export const MANDATE_PAGES = [
  "/vereinbarung",
  "/kundenbereich",
  "/upload-gabor",
  "/upload-kristijan",
  "/ansehen-greenmig",
];

/** hash8 wie im Integrationsvertrag fuer stabile Kennungen. */
export function hash8(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex").slice(0, 8);
}

/**
 * Opake, ueber Laeufe stabile Kennung einer Mandatsseite.
 * Deterministisch (Vertrag verlangt stabile finding_ids), aber ohne
 * rueckrechenbaren Personenbezug.
 */
export function opaqueId(path) {
  return `mandat-${hash8(path)}`;
}

/**
 * Namensbestandteile der Mandats-Ebene, die in keinem Report auftauchen
 * duerfen. Abgeleitet aus den Pfaden selbst: "upload-gabor" -> "gabor".
 * Generische Woerter ohne Personenbezug (vereinbarung, kundenbereich)
 * bleiben erlaubt -- sie werden fuer component_refs gebraucht.
 */
export function mandateForbiddenTerms() {
  const terms = [];
  for (const p of MANDATE_PAGES) {
    const stem = p.slice(1);
    const parts = stem.split("-");
    if (parts.length > 1) {
      terms.push(stem);                    // z. B. "upload-gabor"
      terms.push(parts.slice(1).join("-")); // z. B. "gabor"
    }
  }
  return terms;
}
