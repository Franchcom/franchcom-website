(function () {
  // Die Mandatsseiten und der Bereich, zu dem sie gehoeren. Dieselbe Tafel
  // steht in middleware.js; hier dient sie nur der Bequemlichkeit, damit das
  // Feld vorausgefuellt ist. Entschieden wird ausschliesslich auf dem Server.
  var BEREICH_JE_PFAD = {
    '/kundenbereich': 'mandant',
    '/vereinbarung': 'mandant',
    '/upload-gabor': 'gabor',
    '/upload-kristijan': 'kristijan',
    '/ansehen-greenmig': 'greenmig'
  };

  /**
   * Das Ziel darf ausschliesslich ein bekannter Mandatspfad dieser Seite sein.
   * Ohne diese Pruefung waere ?weiter=https://fremde.seite eine offene
   * Weiterleitung: ein Link, der aussieht, als fuehre er zu franchcom.at,
   * und woanders landet.
   */
  function sicheresZiel(roh) {
    if (typeof roh !== 'string' || roh.charAt(0) !== '/' || roh.charAt(1) === '/') return null;
    var ohneEndung = roh.replace(/\.html$/, '');
    return Object.prototype.hasOwnProperty.call(BEREICH_JE_PFAD, ohneEndung) ? roh : null;
  }

  var ziel = sicheresZiel(new URLSearchParams(location.search).get('weiter'));
  var bereichFeld = document.getElementById('e-bereich');
  if (ziel) {
    var vor = BEREICH_JE_PFAD[ziel.replace(/\.html$/, '')];
    if (vor) { bereichFeld.value = vor; bereichFeld.readOnly = true; }
  }

  var tabAn = document.getElementById('tab-anmelden');
  var tabEin = document.getElementById('tab-einrichten');
  var formAn = document.getElementById('form-anmelden');
  var formEin = document.getElementById('form-einrichten');

  function zeige(welcher) {
    var einrichten = welcher === 'einrichten';
    tabAn.setAttribute('aria-selected', String(!einrichten));
    tabEin.setAttribute('aria-selected', String(einrichten));
    formAn.hidden = einrichten;
    formEin.hidden = !einrichten;
  }
  tabAn.addEventListener('click', function () { zeige('anmelden'); });
  tabEin.addEventListener('click', function () { zeige('einrichten'); });

  function melde(feld, text, istFehler) {
    feld.textContent = text;
    feld.classList.toggle('fehler', Boolean(istFehler));
  }

  async function sende(nutzlast) {
    var antwort = await fetch('/api/zugang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nutzlast)
    });
    var daten = {};
    try { daten = await antwort.json(); } catch (e) { /* leere Antwort */ }
    return { status: antwort.status, ok: antwort.ok, daten: daten };
  }

  function textZuGrund(status, daten) {
    if (status === 503) return 'Der Zugang ist derzeit nicht konfiguriert. Bitte wenden Sie sich an Ihren Ansprechpartner.';
    if (status === 429) return 'Zu viele Fehlversuche. Bitte versuchen Sie es in etwa ' + (daten.minuten || 15) + ' Minuten erneut.';
    switch (daten.grund) {
      case 'kennwort-zu-kurz': return 'Das Kennwort braucht mindestens ' + (daten.mindestens || 12) + ' Zeichen.';
      case 'adresse': return 'Bitte geben Sie eine gültige E-Mail-Adresse an.';
      case 'einladung-ungueltig': return 'Bereich oder Einladungscode stimmt nicht.';
      case 'bereits-eingerichtet': return 'Für diese Adresse besteht in diesem Bereich bereits ein Zugang. Bitte melden Sie sich an.';
      case 'bereich-voll': return 'Für diesen Bereich sind bereits alle Zugänge vergeben. Bitte wenden Sie sich an Ihren Ansprechpartner.';
      default: return 'E-Mail-Adresse oder Kennwort stimmt nicht.';
    }
  }

  formAn.addEventListener('submit', async function (e) {
    e.preventDefault();
    var knopf = formAn.querySelector('.senden');
    var meldung = document.getElementById('a-meldung');
    melde(meldung, '', false);
    knopf.disabled = true;
    try {
      var r = await sende({
        aktion: 'anmelden',
        email: document.getElementById('a-email').value,
        kennwort: document.getElementById('a-kennwort').value
      });
      if (r.ok) { location.assign(ziel || '/kundenbereich'); return; }
      melde(meldung, textZuGrund(r.status, r.daten), true);
    } catch (fehler) {
      melde(meldung, 'Die Anmeldung war nicht möglich. Bitte versuchen Sie es noch einmal.', true);
    } finally {
      knopf.disabled = false;
    }
  });

  formEin.addEventListener('submit', async function (e) {
    e.preventDefault();
    var knopf = formEin.querySelector('.senden');
    var meldung = document.getElementById('e-meldung');
    var kw = document.getElementById('e-kennwort').value;
    var kw2 = document.getElementById('e-kennwort2').value;
    melde(meldung, '', false);

    if (kw !== kw2) { melde(meldung, 'Die beiden Kennwörter stimmen nicht überein.', true); return; }
    if (kw.length < 12) { melde(meldung, 'Das Kennwort braucht mindestens zwölf Zeichen.', true); return; }

    knopf.disabled = true;
    try {
      var r = await sende({
        aktion: 'einrichten',
        bereich: bereichFeld.value,
        einladung: document.getElementById('e-einladung').value,
        email: document.getElementById('e-email').value,
        kennwort: kw
      });
      if (r.ok) { location.assign(ziel || '/kundenbereich'); return; }
      melde(meldung, textZuGrund(r.status, r.daten), true);
    } catch (fehler) {
      melde(meldung, 'Die Einrichtung war nicht möglich. Bitte versuchen Sie es noch einmal.', true);
    } finally {
      knopf.disabled = false;
    }
  });
})();
