#!/usr/bin/env node
/**
 * Meldet den Sicherheitsstand dieser Website an das FranchLabs Security Center.
 *
 *   node sc/senden.mjs             sendet
 *   node sc/senden.mjs --trocken   prüft nur und zeigt den Report
 *
 * Adresse und Schlüssel stehen in `.env.local` und werden von hier gelesen.
 * Diese Datei gehört nicht ins Repository — sie steht in `.gitignore`, und die
 * Prüfung `geheimnisse` schlägt Alarm, falls sie doch je hineingerät.
 *
 * Der private Schlüssel verlässt diese App nicht: nicht ins Security Center,
 * nicht in eine Ausgabe dieses Skripts, nicht in einen Chat.
 */
import { existsSync } from "node:fs";
import { sendeReport } from "./melden.mjs";
import { selbstpruefung, APP_ID, ADRESSE } from "./selbstpruefung.mjs";

const hier = new URL(".", import.meta.url).pathname;
for (const datei of [".env.local", `${hier}../.env.local`]) {
  if (existsSync(datei)) {
    try {
      process.loadEnvFile(datei);
      break;
    } catch {
      /* aeltere Node-Fassung: dann eben ueber die Umgebung */
    }
  }
}

const trocken = process.argv.includes("--trocken");
const url = process.env.SC_URL?.trim() ?? "";
const privateKeyPem = process.env.SC_PRIVATE_KEY ?? "";
const keyVersion = process.env.SC_KEY_VERSION ?? "v1";

if (!trocken && (!url || !privateKeyPem)) {
  console.error("SC_URL und SC_PRIVATE_KEY fehlen. Zum blossen Ansehen: node sc/senden.mjs --trocken");
  process.exit(1);
}

console.error(`Pruefe ${APP_ID} an ${ADRESSE} …`);
const report = await selbstpruefung();

console.error(`Gesamt: ${report.reported_overall}`);
for (const [name, modul] of Object.entries(report.modules)) {
  const funde = report.findings.filter((f) => f.module === name);
  console.error(`  ${name.padEnd(15)} ${modul.status.padEnd(6)} ${funde.length} Funde`);
  for (const f of funde) console.error(`      ${f.severity.padEnd(8)} ${f.title}`);
}
console.error(
  `Nicht geprueft: ${report.audit_meta.skipped_modules.join(", ")} (Abdeckung ${report.audit_meta.coverage})`,
);

if (trocken) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const ergebnis = await sendeReport(report, { url, appId: APP_ID, keyVersion, privateKeyPem });
if (ergebnis.status === 202) {
  console.error("Angenommen.");
  process.exit(0);
}

const grund =
  ergebnis.status === 401
    ? "Signatur oder Schluessel stimmt nicht — SC_PRIVATE_KEY und Schluesselversion pruefen."
    : ergebnis.status === 422
      ? "Der Report passt nicht zum Schema."
      : ergebnis.status === 413
        ? "Der Report ist zu gross."
        : "Das Security Center war nicht erreichbar oder hat abgelehnt.";
console.error(`Nicht angenommen (HTTP ${ergebnis.status}). ${grund}`);
process.exit(1);
