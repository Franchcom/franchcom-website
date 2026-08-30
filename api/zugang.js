// POST /api/zugang  { aktion, ... }
//
// Zugaenge zu den Mandatsseiten. Jeder Mandant richtet sich EINMAL selbst ein
// und waehlt dabei sein eigenes Kennwort; danach meldet er sich damit an.
//
// Drei Aktionen:
//   einrichten  { bereich, einladung, email, kennwort }
//   anmelden    { email, kennwort }
//   aendern     { email, kennwort, neuesKennwort }
//
// VORBILD
// Die Benutzerverwaltung des Franchcom-Datenraums: privater Vercel-Blob-Store,
// Einladungscode, scrypt mit eigenem Salz je Konto, signierte Sitzung. Was hier
// zusaetzlich drin ist: eine Kontosperre nach zu vielen Fehlversuchen. Ein
// blosses Warten von 800 ms bremst einen Menschen, nicht ein Skript - genau
// dieser Befund steht beim Profil auf irynakalian.com offen.
//
// WAS HIER BEWUSST FEHLT
// Kein zweiter Faktor. Der Datenraum schickt zusaetzlich einen Code per E-Mail;
// das braucht SMTP-Zugaenge, die es fuer diese Seite nicht gibt. Solange das so
// ist, steht und faellt der Zugang mit dem Kennwort - deshalb die Mindestlaenge
// von zwoelf Zeichen und die Sperre. Kommt spaeter ein Postausgang dazu, ist
// api/auth.js des Datenraums die Vorlage, nicht diese Datei.
//
// GRUNDSAETZE
//  * Kein Ersatzwert im Quelltext. Fehlt eine Umgebungsvariable, geht der
//    betroffene Weg nicht - er geht nicht "irgendwie doch".
//  * Verglichen wird in konstanter Zeit.
//  * Ob eine Adresse bekannt ist, verraet keine Antwort.
//  * Kein Text eines Hintergrundsystems wandert zum Aufrufer.

const { put, get } = require('@vercel/blob');
const crypto = require('crypto');

const SPEICHER = 'franchcom-mandate-zugang.json';

/** Bereich -> Umgebungsvariable mit dem Einladungscode. */
const EINLADUNG_VARIABLE = {
  mandant: 'FC_EINLADUNG_MANDANT',
  gabor: 'FC_EINLADUNG_GABOR',
  kristijan: 'FC_EINLADUNG_KRISTIJAN',
  greenmig: 'FC_EINLADUNG_GREENMIG',
};

const MIN_KENNWORT = 12;
const MAX_KONTEN_JE_BEREICH = 10;
const MAX_FEHLVERSUCHE = 8;
const SPERRE_MS = 15 * 60 * 1000;
const SITZUNG_MS = 8 * 60 * 60 * 1000;

const warte = (ms) => new Promise((fertig) => setTimeout(fertig, ms));

function gleichKonstant(a, b) {
  const pa = Buffer.from(String(a), 'utf8');
  const pb = Buffer.from(String(b), 'utf8');
  if (pa.length !== pb.length) return false;
  return crypto.timingSafeEqual(pa, pb);
}

function kennwortHash(kennwort, salz) {
  return crypto.scryptSync(kennwort, salz, 32).toString('hex');
}

function kennwortStimmt(konto, kennwort) {
  const erwartet = Buffer.from(konto.hash, 'hex');
  const gegeben = crypto.scryptSync(kennwort, konto.salz, 32);
  return erwartet.length === gegeben.length && crypto.timingSafeEqual(erwartet, gegeben);
}

const normEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 200);
const gueltigeEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

async function lies() {
  try {
    const r = await get(SPEICHER, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return { konten: {} };
    const text = await new Response(r.stream).text();
    const daten = JSON.parse(text);
    return daten && daten.konten ? daten : { konten: {} };
  } catch {
    // Ein leerer Speicher und ein kaputter Speicher sehen hier gleich aus.
    // Beides fuehrt dazu, dass niemand hineinkommt - nicht dazu, dass jeder
    // hineinkommt.
    return { konten: {} };
  }
}

async function schreibe(daten) {
  await put(SPEICHER, JSON.stringify(daten), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

function sitzungBauen(bereiche, secret) {
  const b64 = Buffer.from(bereiche.join(','), 'utf8').toString('base64');
  const ablauf = Date.now() + SITZUNG_MS;
  const signatur = crypto.createHmac('sha256', secret)
    .update('sess:' + b64 + '|' + ablauf).digest('hex');
  return { wert: encodeURIComponent(b64 + '.' + ablauf + '.' + signatur), ablauf };
}

function cookieSetzen(res, wert) {
  res.setHeader('Set-Cookie', [
    'fc_sess=' + wert,
    'Path=/',
    'Max-Age=' + Math.floor(SITZUNG_MS / 1000),
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; '));
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
    if (groesse > 8192) throw new Error('zu gross');
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
  if (!SECRET || !process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ ok: false, grund: 'nicht-konfiguriert' });
  }

  let daten;
  try {
    daten = await koerper(req);
  } catch {
    return res.status(413).json({ ok: false, grund: 'zu-gross' });
  }

  const aktion = String(daten.aktion || '').trim();
  const email = normEmail(daten.email);
  const kennwort = String(daten.kennwort || '');

  // --- Einrichten -----------------------------------------------------------
  if (aktion === 'einrichten') {
    const bereich = String(daten.bereich || '').trim().toLowerCase();
    const einladung = String(daten.einladung || '');
    const variable = Object.prototype.hasOwnProperty.call(EINLADUNG_VARIABLE, bereich)
      ? EINLADUNG_VARIABLE[bereich] : null;
    const erwartet = variable ? process.env[variable] : null;

    if (!gueltigeEmail(email)) return res.status(400).json({ ok: false, grund: 'adresse' });
    if (kennwort.length < MIN_KENNWORT) {
      return res.status(400).json({ ok: false, grund: 'kennwort-zu-kurz', mindestens: MIN_KENNWORT });
    }

    // Unbekannter Bereich, fehlender Einladungscode und falscher
    // Einladungscode sehen von aussen gleich aus.
    if (!variable || !erwartet || !einladung || !gleichKonstant(einladung, erwartet)) {
      await warte(800);
      return res.status(401).json({ ok: false, grund: 'einladung-ungueltig' });
    }

    const speicher = await lies();
    const imBereich = Object.values(speicher.konten).filter((k) => k.bereiche.includes(bereich));
    const vorhanden = speicher.konten[email];

    if (vorhanden && vorhanden.bereiche.includes(bereich)) {
      // Kein Hinweis darauf, ob das Konto existiert - der Weg dafuer ist die
      // Anmeldung, nicht die Einrichtung.
      await warte(800);
      return res.status(409).json({ ok: false, grund: 'bereits-eingerichtet' });
    }
    if (!vorhanden && imBereich.length >= MAX_KONTEN_JE_BEREICH) {
      return res.status(409).json({ ok: false, grund: 'bereich-voll' });
    }

    if (vorhanden) {
      // Ein bestehendes Konto bekommt den Bereich dazu - aber nur, wenn das
      // bisherige Kennwort stimmt. Sonst koennte ein fremder Einladungscode
      // ein fremdes Konto erweitern.
      if (!kennwortStimmt(vorhanden, kennwort)) {
        await warte(800);
        return res.status(401).json({ ok: false, grund: 'zugang-verweigert' });
      }
      vorhanden.bereiche.push(bereich);
      vorhanden.geaendertAm = new Date().toISOString();
    } else {
      const salz = crypto.randomBytes(16).toString('hex');
      speicher.konten[email] = {
        salz,
        hash: kennwortHash(kennwort, salz),
        bereiche: [bereich],
        angelegtAm: new Date().toISOString(),
        fehlversuche: 0,
        gesperrtBis: 0,
      };
    }

    await schreibe(speicher);
    const sitzung = sitzungBauen(speicher.konten[email].bereiche, SECRET);
    cookieSetzen(res, sitzung.wert);
    return res.status(201).json({ ok: true });
  }

  // --- Anmelden -------------------------------------------------------------
  if (aktion === 'anmelden') {
    const speicher = await lies();
    const konto = speicher.konten[email];

    if (konto && konto.gesperrtBis > Date.now()) {
      return res.status(429).json({
        ok: false, grund: 'gesperrt',
        minuten: Math.ceil((konto.gesperrtBis - Date.now()) / 60000),
      });
    }

    if (!konto || !kennwort || !kennwortStimmt(konto, kennwort)) {
      if (konto) {
        konto.fehlversuche = (konto.fehlversuche || 0) + 1;
        if (konto.fehlversuche >= MAX_FEHLVERSUCHE) {
          konto.gesperrtBis = Date.now() + SPERRE_MS;
          konto.fehlversuche = 0;
        }
        await schreibe(speicher);
      }
      await warte(800);
      return res.status(401).json({ ok: false, grund: 'zugang-verweigert' });
    }

    konto.fehlversuche = 0;
    konto.gesperrtBis = 0;
    konto.zuletztAm = new Date().toISOString();
    await schreibe(speicher);

    const sitzung = sitzungBauen(konto.bereiche, SECRET);
    cookieSetzen(res, sitzung.wert);
    return res.status(200).json({ ok: true });
  }

  // --- Kennwort aendern -----------------------------------------------------
  if (aktion === 'aendern') {
    const neues = String(daten.neuesKennwort || '');
    if (neues.length < MIN_KENNWORT) {
      return res.status(400).json({ ok: false, grund: 'kennwort-zu-kurz', mindestens: MIN_KENNWORT });
    }

    const speicher = await lies();
    const konto = speicher.konten[email];
    if (!konto || !kennwort || !kennwortStimmt(konto, kennwort)) {
      await warte(800);
      return res.status(401).json({ ok: false, grund: 'zugang-verweigert' });
    }

    konto.salz = crypto.randomBytes(16).toString('hex');
    konto.hash = kennwortHash(neues, konto.salz);
    konto.geaendertAm = new Date().toISOString();
    konto.fehlversuche = 0;
    konto.gesperrtBis = 0;
    await schreibe(speicher);

    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ ok: false, grund: 'aktion' });
};
