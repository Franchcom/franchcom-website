// Zugangsschutz fuer die Mandatsseiten.
//
// Vorbild ist die Middleware des Franchcom-Datenraums: eine signierte Sitzung,
// vor jeder Auslieferung geprueft, und ohne Konfiguration schliesst sie zu
// statt zu oeffnen. Zwei Dinge sind hier anders, und beide mit Absicht.
//
// ERSTENS: SIE GREIFT NUR AUF DEN MANDATSSEITEN
// Der Datenraum schuetzt alles ausser Anmeldung und Registrierung. Diese Seite
// ist zum groessten Teil oeffentlich - Startseite, Gruppe, Impressum,
// Datenschutz sollen erreichbar bleiben. Der Matcher nennt deshalb die
// geschuetzten Pfade EINZELN, statt alles zu greifen und Ausnahmen zu pflegen.
// Eine vergessene Ausnahme waere hier eine oeffentliche Seite hinter dem Tor;
// ein vergessener Eintrag ist eine Mandatsseite davor. Beides faellt auf -
// das Zweite meldet der Audit-Runner taeglich.
//
// ZWEITENS: ES GIBT BEREICHE, NICHT EIN GEMEINSAMES TOR
// upload-gabor und upload-kristijan tragen die Namen zweier verschiedener
// Menschen. Ein gemeinsames Kennwort haette bedeutet, dass jeder von beiden
// die Seite des anderen sieht. Jede Mandatsseite gehoert deshalb zu einem
// Bereich, und eine Sitzung traegt genau die Bereiche, fuer die jemand sich
// ausgewiesen hat.
//
// WAS DAS NICHT IST
// Kein Benutzerkonto, kein Passwortspeicher, kein zweiter Faktor. Die
// Kennwoerter stehen ausschliesslich in der Vercel-Projektkonfiguration, nie
// im Repository. Fuer eine Handvoll Mandatsseiten ist das die angemessene
// Groesse; wird daraus ein Kundenportal, ist der Datenraum das naechste
// Vorbild, nicht diese Datei.

export const config = {
  matcher: [
    "/kundenbereich",
    "/kundenbereich.html",
    "/vereinbarung",
    "/vereinbarung.html",
    "/upload-gabor",
    "/upload-gabor.html",
    "/upload-kristijan",
    "/upload-kristijan.html",
    "/ansehen-greenmig",
    "/ansehen-greenmig.html",
  ],
};

/** Pfad -> Bereich. Wer den Bereich hat, sieht die Seite. */
const BEREICH_JE_PFAD = {
  "/kundenbereich": "mandant",
  "/vereinbarung": "mandant",
  "/upload-gabor": "gabor",
  "/upload-kristijan": "kristijan",
  "/ansehen-greenmig": "greenmig",
};

const enc = new TextEncoder();

function pfadOhneEndung(pfad) {
  return pfad.endsWith(".html") ? pfad.slice(0, -5) : pfad;
}

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Vergleich in konstanter Zeit.
 *
 * Der Datenraum vergleicht seine Signatur heute mit === - das steht dort als
 * offener Befund im Report. Hier von vornherein anders: gleiche Laenge
 * erzwingen, dann alle Zeichen durchlaufen, ohne bei der ersten Abweichung
 * abzubrechen.
 */
function gleichKonstant(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return unterschied === 0;
}

/**
 * Liest die Sitzung und gibt die freigegebenen Bereiche zurueck.
 * Bei jedem Zweifel: leere Liste.
 */
async function bereicheAusSitzung(req, secret) {
  const cookie = req.headers.get("cookie") || "";
  const treffer = cookie.match(/(?:^|;\s*)fc_sess=([^;]+)/);
  if (!treffer) return [];

  const teile = decodeURIComponent(treffer[1]).split(".");
  if (teile.length !== 3) return [];

  const [bereicheB64, ablauf, signatur] = teile;
  const ablaufZahl = Number.parseInt(ablauf, 10);
  if (!Number.isFinite(ablaufZahl) || Date.now() > ablaufZahl) return [];

  const erwartet = await hmacHex(secret, "sess:" + bereicheB64 + "|" + ablauf);
  if (!gleichKonstant(signatur, erwartet)) return [];

  try {
    return atob(bereicheB64).split(",").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export default async function middleware(req) {
  const SECRET = process.env.SESSION_SECRET || "";
  const url = new URL(req.url);
  const pfad = pfadOhneEndung(url.pathname);

  // Ohne Geheimnis wird NICHTS ausgeliefert. Das ist der wichtigste Zweig
  // dieser Datei: Ein `return;` an dieser Stelle waere eine Zeile im Diff,
  // im Browser unsichtbar, und saemtliche Mandatsseiten waeren offen.
  if (!SECRET) {
    return new Response(
      "Der Zugang ist derzeit nicht konfiguriert. Bitte wenden Sie sich an Ihren Ansprechpartner.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } },
    );
  }

  const noetig = BEREICH_JE_PFAD[pfad];
  // Ein Pfad im Matcher ohne Eintrag in der Bereichstafel waere ein
  // Konfigurationsfehler. Dann gilt: zu, nicht auf.
  if (!noetig) {
    return new Response("Kein Zugang.", {
      status: 403, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const freigegeben = await bereicheAusSitzung(req, SECRET);
  if (freigegeben.includes(noetig)) return;

  // Kein Zugang: zur Anmeldung, mit dem Ziel im Gepaeck. Das Ziel ist ein
  // eigener Pfad dieser Seite - die Anmeldeseite prueft das noch einmal,
  // damit daraus keine offene Weiterleitung wird.
  const ziel = new URL("/anmelden.html", url.origin);
  ziel.searchParams.set("weiter", url.pathname);
  return Response.redirect(ziel, 302);
}
