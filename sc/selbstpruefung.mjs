/**
 * Was Franchcom Website über sich selbst an das Security Center meldet.
 *
 * Diese App ist eine ausgelieferte Website, kein Node-Projekt: Es gibt keine
 * Paketverwaltung, keine Typen und keine Testläufe. Geprüft wird deshalb, was
 * bei einer Website tatsächlich zählt und tatsächlich messbar ist — an der
 * laufenden Seite, nicht an einer Absichtserklärung.
 *
 * Jedes Modul hier ist eine wirklich ausgeführte Prüfung. Eine Selbstmeldung,
 * die nur behauptet, wäre schlimmer als keine: Sie färbt eine Ampel grün, ohne
 * dass jemand hingesehen hat.
 *
 * Was nicht gemessen wird, meldet GRAU — „keine Auskunft“ — und steht in
 * `skipped_modules`. Das Schema verlangt das ausdrücklich: eine Teilabdeckung
 * ohne Angabe, *was* fehlte, wäre wertlos.
 *
 * Maßgeblich ist FranchSecurityCenter/src/lib/ingest/schemaV1.ts.
 */
import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const lauf = promisify(exec);

export const APP_ID = "franchcom-website";
export const ADRESSE = "https://www.franchcom.at";

const jetzt = () => new Date().toISOString();

/** Das Schema lässt in einer Fundkennung nur `[a-z0-9:_-]` zu. */
function kennung(roh) {
  const sauber = roh.toLowerCase().replace(/[^a-z0-9:_-]/g, "-").replace(/-+/g, "-").slice(0, 160);
  return sauber.length >= 3 ? sauber : `${sauber}-fund`;
}

/** Titel sind einzeilig und höchstens 120 Zeichen lang. */
function titel(roh) {
  return roh.replace(/[\r\n]+/g, " ").trim().slice(0, 120);
}

/**
 * Liegt ein Geheimnis im Bestand?
 *
 * Geprüft wird, was Git wirklich führt — nicht, was im Ordner liegt. Eine
 * `.env.local` auf der Platte ist richtig; dieselbe Datei im Repository wäre
 * ein Vorfall.
 */
async function geheimnisse() {
  let ausgabe;
  try {
    ({ stdout: ausgabe } = await lauf("git ls-files", { timeout: 30_000 }));
  } catch {
    return { status: "GRAY", funde: [] };
  }

  const verdaechtig = ausgabe
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter(Boolean)
    .filter((z) => /(^|\/)\.env($|\.)|\.pem$|\.p12$|privatschluessel|id_rsa/i.test(z))
    .filter((z) => !/\.env\.(example|sample|template)$/i.test(z));

  return {
    status: verdaechtig.length === 0 ? "GREEN" : "RED",
    funde: verdaechtig.slice(0, 20).map((datei, i) => ({
      finding_id: kennung(`geheimnis-${i + 1}`),
      module: "geheimnisse",
      domain: "security",
      severity: "CRITICAL",
      status: "OPEN",
      code: "SECRET_IN_REPOSITORY",
      // Der Dateiname, nicht sein Inhalt: Ein Fund darf nicht das Geheimnis
      // weitertragen, das er meldet.
      title: titel(`Datei mit Geheimnisverdacht im Bestand: ${datei}`),
      first_seen: jetzt(),
      last_seen: jetzt(),
    })),
  };
}

/**
 * Holt eine Adresse — mit Wiederholungen.
 *
 * Ohne sie hat ein einziger misslungener Abruf einen echten Befund in „keine
 * Auskunft“ verwandelt: Die Seite meldete GRAU statt ROT, obwohl ihr die
 * Content-Security-Policy fehlte. Genau beobachtet, genau einmal passiert —
 * und dann steht die Ampel falsch, ohne dass jemand es merkt.
 *
 * Erst wenn alle Versuche scheitern, ist „nicht geprueft“ die Wahrheit.
 */
async function holen(adresse, optionen = {}) {
  const pausen = [0, 800, 2500];
  for (const pause of pausen) {
    if (pause) await new Promise((r) => setTimeout(r, pause));
    try {
      return await fetch(adresse, { ...optionen, signal: AbortSignal.timeout(15_000) });
    } catch {
      /* naechster Versuch */
    }
  }
  return null;
}

/**
 * Die Schutzkopfzeilen der ausgelieferten Seite.
 *
 * Bei einer statischen Website ist das der Kern: Was der Browser an Regeln
 * mitbekommt, entscheidet, was eine eingeschleuste Zeile anrichten kann.
 * Gemessen wird an der echten Antwort, nicht an der Konfigurationsdatei —
 * zwischen beiden liegt die Auslieferung, und genau dort gehen Kopfzeilen
 * verloren.
 */
const KOPFZEILEN = [
  {
    name: "content-security-policy",
    severity: "HIGH",
    code: "MISSING_CSP",
    text: "Keine Content-Security-Policy: eingeschleustes Skript wird nicht gebremst",
  },
  {
    name: "strict-transport-security",
    severity: "HIGH",
    code: "MISSING_HSTS",
    text: "Kein Strict-Transport-Security: der erste Aufruf kann unverschluesselt umgeleitet werden",
  },
  {
    name: "x-content-type-options",
    severity: "MEDIUM",
    code: "MISSING_NOSNIFF",
    text: "Kein X-Content-Type-Options: der Browser darf den Inhaltstyp raten",
  },
  {
    name: "referrer-policy",
    severity: "LOW",
    code: "MISSING_REFERRER_POLICY",
    text: "Keine Referrer-Policy: die aufgerufene Adresse wandert an fremde Seiten mit",
  },
  {
    name: "permissions-policy",
    severity: "LOW",
    code: "MISSING_PERMISSIONS_POLICY",
    text: "Keine Permissions-Policy: Kamera, Mikrofon und Ort bleiben unbeschraenkt",
  },
];

async function kopfzeilen() {
  const antwort = await holen(ADRESSE, { redirect: "follow" });
  // Nicht erreichbar heisst nicht „keine Kopfzeilen“, sondern „nicht geprueft“.
  if (!antwort) return { status: "GRAY", funde: [] };

  const fehlend = KOPFZEILEN.filter((k) => !antwort.headers.get(k.name));
  const rahmen =
    antwort.headers.get("x-frame-options") ??
    (/frame-ancestors/i.test(antwort.headers.get("content-security-policy") ?? "") ? "csp" : null);
  if (!rahmen) {
    fehlend.push({
      name: "x-frame-options",
      severity: "MEDIUM",
      code: "MISSING_FRAME_PROTECTION",
      text: "Kein Schutz gegen Einbettung in eine fremde Seite",
    });
  }

  const schwer = fehlend.some((f) => f.severity === "HIGH");
  return {
    status: fehlend.length === 0 ? "GREEN" : schwer ? "RED" : "YELLOW",
    funde: fehlend.map((f) => ({
      finding_id: kennung(`kopfzeile-${f.name}`),
      module: "kopfzeilen",
      domain: "security",
      severity: f.severity,
      status: "OPEN",
      code: f.code,
      title: titel(f.text),
      first_seen: jetzt(),
      last_seen: jetzt(),
    })),
  };
}

/**
 * Ist die Seite erreichbar, und zwingt sie zu HTTPS?
 *
 * Eine Website, die auf http antwortet statt umzuleiten, gibt jeden Besucher
 * im selben Netz preis, bevor irgendeine Kopfzeile greifen kann.
 */
async function erreichbarkeit() {
  const funde = [];
  let status = "GREEN";

  {
    const antwort = await holen(ADRESSE);
    if (!antwort) return { status: "GRAY", funde: [] };
    if (!antwort.ok) {
      status = "RED";
      funde.push({
        finding_id: "seite-antwortet-nicht",
        module: "erreichbarkeit",
        domain: "availability",
        severity: "HIGH",
        status: "OPEN",
        code: "SITE_UNHEALTHY",
        title: titel(`Die Seite antwortet mit HTTP ${antwort.status}`),
        first_seen: jetzt(),
        last_seen: jetzt(),
      });
    }
  }

  {
    const unverschluesselt = await holen(ADRESSE.replace(/^https:/, "http:"), { redirect: "manual" });
    // Kein http-Dienst erreichbar ist kein Mangel — dann gibt es nichts umzuleiten.
    const zielt = unverschluesselt?.headers.get("location") ?? "";
    const umgeleitet =
      unverschluesselt !== null &&
      unverschluesselt.status >= 300 &&
      unverschluesselt.status < 400 &&
      zielt.startsWith("https:");
    if (unverschluesselt !== null && !umgeleitet) {
      status = status === "RED" ? "RED" : "YELLOW";
      funde.push({
        finding_id: "kein-https-zwang",
        module: "erreichbarkeit",
        domain: "availability",
        severity: "MEDIUM",
        status: "OPEN",
        code: "NO_HTTPS_REDIRECT",
        title: "Ein Aufruf ueber http wird nicht auf https umgeleitet",
        first_seen: jetzt(),
        last_seen: jetzt(),
      });
    }
  }

  return { status, funde };
}

const SCHLIMMER = { GREEN: 0, GRAY: 1, YELLOW: 2, RED: 3 };
const NACH_RANG = ["GREEN", "GRAY", "YELLOW", "RED"];

const BEREICH = {
  geheimnisse: "security",
  kopfzeilen: "security",
  erreichbarkeit: "availability",
};

/**
 * Bereiche, die diese App nicht misst — auf GRAU, nicht auf Grün.
 *
 * `data_integrity` steht hier, weil es ohne Testlauf nichts zu messen gibt;
 * `privacy` und `backup`, weil beides eine Aussage über den Betrieb wäre, die
 * eine Selbstprüfung nicht belegen kann.
 */
const UNGEPRUEFT = {
  privacy: "datenschutz",
  data_integrity: "datenpruefung",
  ai_ocr: "spracherkennung",
  backup: "sicherung",
  ux: "bedienbarkeit",
};

/** Führt die Prüfungen aus und baut den Report. */
export async function selbstpruefung(appId = APP_ID) {
  const begonnen = Date.now();
  return bauReport(
    appId,
    {
      geheimnisse: await geheimnisse(),
      kopfzeilen: await kopfzeilen(),
      erreichbarkeit: await erreichbarkeit(),
    },
    Date.now() - begonnen,
  );
}

/** Baut den vollständigen Report — genau die Felder aus Schema V1, keine anderen. */
export function bauReport(appId, ergebnisse, dauerMs) {
  const alleFunde = Object.values(ergebnisse).flatMap((m) => m.funde);
  const schlimmster = Math.max(...Object.values(ergebnisse).map((m) => SCHLIMMER[m.status]));
  const zeit = jetzt();
  const zaehle = (stufe) => alleFunde.filter((f) => f.severity === stufe).length;

  const bereich = (name) => {
    const meine = Object.entries(ergebnisse).filter(([modul]) => BEREICH[modul] === name);
    return {
      status: NACH_RANG[Math.max(...meine.map(([, m]) => SCHLIMMER[m.status]))],
      checks_total: meine.length,
      checks_failed: meine.filter(([, m]) => m.status !== "GREEN").length,
    };
  };

  return {
    schema_version: "1.0",
    report_id: randomUUID().replace(/-/g, ""),
    app_id: appId,
    environment: "production",
    audit_version: "1.0",
    runner: { name: "franchlabs-website-pruefung", version: "1.0" },
    generated_at: zeit,
    reported_overall: NACH_RANG[schlimmster],
    domains: {
      security: bereich("security"),
      availability: bereich("availability"),
      payment: { status: "NOT_APPLICABLE", reason_code: "NO_PAYMENT_FEATURE" },
      ...Object.fromEntries(
        Object.keys(UNGEPRUEFT).map((n) => [n, { status: "GRAY", checks_total: 0, checks_failed: 0 }]),
      ),
    },
    audit_meta: {
      last_successful_audit: zeit,
      expected_interval_seconds: 86_400,
      coverage: "PARTIAL",
      skipped_modules: Object.values(UNGEPRUEFT),
      duration_ms: Math.min(86_400_000, Math.max(0, dauerMs)),
      critical_findings: zaehle("CRITICAL"),
      high_findings: zaehle("HIGH"),
      medium_findings: zaehle("MEDIUM"),
      low_findings: zaehle("LOW"),
    },
    modules: Object.fromEntries(
      Object.entries(ergebnisse).map(([n, m]) => [n, { status: m.status, domain: BEREICH[n] }]),
    ),
    findings: alleFunde.slice(0, 200),
  };
}
