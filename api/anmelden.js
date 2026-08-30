// POST /api/anmelden  { bereich, kennwort }
//
// Prueft das Kennwort eines Bereichs und setzt die signierte Sitzung, die
// middleware.js anschliessend liest.
//
// GRUNDSAETZE
//  * Die Kennwoerter stehen ausschliesslich in der Vercel-Projektkonfiguration.
//    Es gibt KEINEN Ersatzwert im Quelltext - fehlt die Variable, laesst sich
//    der Bereich nicht betreten. Ein `|| 'irgendwas'` waere genau der Befund,
//    den der Runner auf irynakalian.com meldet.
//  * Verglichen wird in konstanter Zeit und zeichengenau. Kein toLowerCase:
//    Gross- und Kleinschreibung einzuebnen verkleinert den Suchraum, ohne
//    irgendetwas zu gewinnen.
//  * Bei falschem Kennwort wird verzoegert geantwortet und nicht verraten,
//    ob der Bereich existiert.
//  * Die Antwort enthaelt nie das Kennwort, nie den Bereichsnamen eines
//    fremden Bereichs und keinen Text eines Hintergrundsystems.

const crypto = require('crypto');

/** Bereich -> Name der Umgebungsvariablen mit dem Kennwort. */
const KENNWORT_VARIABLE = {
  mandant: 'FC_PW_MANDANT',
  gabor: 'FC_PW_GABOR',
  kristijan: 'FC_PW_KRISTIJAN',
  greenmig: 'FC_PW_GREENMIG',
};

/** Acht Stunden. Lang genug fuer einen Arbeitstag, kurz genug fuer ein fremdes Geraet. */
const GUELTIG_MS = 8 * 60 * 60 * 1000;

function warte(ms) {
  return new Promise(function (fertig) { setTimeout(fertig, ms); });
}

function gleichKonstant(a, b) {
  const pa = Buffer.from(String(a), 'utf8');
  const pb = Buffer.from(String(b), 'utf8');
  // timingSafeEqual verlangt gleiche Laenge und wuerde sonst werfen. Die
  // Laenge selbst ist kein Geheimnis, das es zu schuetzen lohnt.
  if (pa.length !== pb.length) return false;
  return crypto.timingSafeEqual(pa, pb);
}

function signiere(secret, nachricht) {
  return crypto.createHmac('sha256', secret).update(nachricht).digest('hex');
}

async function koerper(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const teile = [];
  let groesse = 0;
  for await (const stueck of req) {
    groesse += stueck.length;
    if (groesse > 4096) throw new Error('zu gross');
    teile.push(stueck);
  }
  if (!teile.length) return {};
  try { return JSON.parse(Buffer.concat(teile).toString('utf8')); } catch { return {}; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, grund: 'methode' });
  }

  const SECRET = process.env.SESSION_SECRET;
  if (!SECRET) {
    // Dieselbe Haltung wie in der Middleware: ohne Geheimnis kein Zugang.
    return res.status(503).json({ ok: false, grund: 'nicht-konfiguriert' });
  }

  let daten;
  try {
    daten = await koerper(req);
  } catch {
    return res.status(413).json({ ok: false, grund: 'zu-gross' });
  }

  const bereich = String(daten.bereich || '').trim().toLowerCase();
  const kennwort = String(daten.kennwort || '');
  const variable = Object.prototype.hasOwnProperty.call(KENNWORT_VARIABLE, bereich)
    ? KENNWORT_VARIABLE[bereich]
    : null;
  const erwartet = variable ? process.env[variable] : null;

  // Ein unbekannter Bereich und ein falsches Kennwort sehen von aussen gleich
  // aus - inklusive der Verzoegerung. Sonst liesse sich die Bereichstafel
  // durchprobieren.
  if (!variable || !erwartet || !kennwort || !gleichKonstant(kennwort, erwartet)) {
    await warte(800);
    return res.status(401).json({ ok: false, grund: 'zugang-verweigert' });
  }

  const ablauf = Date.now() + GUELTIG_MS;
  const bereicheB64 = Buffer.from(bereich, 'utf8').toString('base64');
  const signatur = signiere(SECRET, 'sess:' + bereicheB64 + '|' + ablauf);
  const wert = encodeURIComponent(bereicheB64 + '.' + ablauf + '.' + signatur);

  res.setHeader('Set-Cookie', [
    'fc_sess=' + wert,
    'Path=/',
    'Max-Age=' + Math.floor(GUELTIG_MS / 1000),
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; '));

  return res.status(200).json({ ok: true });
};
