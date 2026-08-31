const I18N = {
    hu: {
      secure: "Titkosított · bizalmas",
      eyebrow: "GreenMIG projekt · Biztonságos feltöltés",
      hi: "Üdvözöljük,",
      hi_end: "!",
      intro: "Itt biztonságosan feltöltheti a dokumentumait — válassza ki a megfelelő kategóriát, és húzza be a fájlokat (PDF, képek, chat-exportok, bármi). A feltöltések közvetlenül és titkosítva érkeznek a Franchcom Consultinghoz. Rajtunk kívül senki nem láthatja őket, és a feltöltött fájlok változatlanul megmaradnak.",
      wa_h: "WhatsApp beszélgetések",
      wa_p: "Chat-export (szövegfájl + média). A WhatsAppban: Beszélgetés → Exportálás.",
      mail_h: "E-mailek",
      mail_p: "E-mailek PDF vagy .eml formátumban — kérjük, feladóval, címzettel és dátummal.",
      amt_h: "Hatóságok / hivatalok",
      amt_p: "Határozatok, hivatalos levelek, hatósági posta.",
      doc_h: "Szerződések és dokumentumok",
      doc_p: "Szerződések, számlák, megállapodások, egyéb dokumentumok.",
      foto_h: "Fényképek és egyéb",
      foto_p: "Képek, képernyőképek és minden, ami más kategóriába nem illik.",
      upload: "Feltöltés →",
      agree_eyebrow: "Formális előzetesen",
      agree_h: "Ajánlat és adatvédelem (AVV)",
      agree_p: "Itt találja ajánlatunkat és az adatfeldolgozási megállapodást (AVV) — nyugodtan tekintse meg, és egy kattintással online erősítse meg. A feldolgozás csak ezután kezdődik.",
      agree_btn: "Megtekintés és online megerősítés",
      note_b: "Röviden és fontos:",
      note_p: "Inkább többet töltsön fel, mint keveset — a szűrést mi végezzük. Kérjük, eredeti fájlokat (semmit ne vágjon le). Kérdés esetén forduljon hozzánk bizalommal."
    }
  };
  const DE = {};
  document.querySelectorAll('[data-i18n]').forEach(el => { DE[el.getAttribute('data-i18n')] = el.textContent; });
  I18N.de = DE;
  function setLang(l) {
    if (!I18N[l]) l = 'de';
    document.documentElement.lang = l;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if (I18N[l][k] !== undefined) el.textContent = I18N[l][k];
    });
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === l));
    try { localStorage.setItem('gm_lang', l); } catch (e) {}
  }
  document.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
  let start = 'de';
  try {
    const s = localStorage.getItem('gm_lang');
    if (s) start = s;
    else { const n = (navigator.language || 'de').slice(0, 2); if (n === 'hu') start = 'hu'; }
  } catch (e) {}
  setLang(start);
