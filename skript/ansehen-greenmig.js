var DICT = {
    en: {
      lock: "Secure data room",
      eyebrow: "GreenMIG project · Case access",
      h1: "View documents",
      lead: "Use the tiles below to open the secure data room directly. On your first click you log in once with your access details. You can view and download everything — changing or deleting is not possible.",
      c1_h3: "Documents Gabor Simon",
      c1_p: "All documents uploaded by Gabor Simon — WhatsApp, emails, authorities, documents and photos.",
      c2_h3: "Documents Kristijan Nika",
      c2_p: "All documents uploaded by Kristijan Nika — WhatsApp, emails, authorities, documents and photos.",
      c3_h3: "Reports & analysis",
      c3_p: "Summaries, assessments and the complete case preparation by Franchcom (incl. all working folders).",
      open: "Open →",
      note_b: "Note:",
      note_p: "This page is a quick access — the files themselves are stored securely in the portal (portal.franchcom.at). Access is limited to authorised persons and is logged. Questions?"
    },
    uk: {
      lock: "Захищена область даних",
      eyebrow: "Проєкт GreenMIG · Доступ до справи",
      h1: "Переглянути документи",
      lead: "За допомогою плиток нижче ви одразу відкриваєте захищену область даних. Під час першого натискання ви один раз входите зі своїми даними доступу. Ви можете все переглядати та завантажувати — змінювати чи видаляти неможливо.",
      c1_h3: "Документи Gabor Simon",
      c1_p: "Усі документи, завантажені Gabor Simon — WhatsApp, електронні листи, органи влади, документи та фото.",
      c2_h3: "Документи Kristijan Nika",
      c2_p: "Усі документи, завантажені Kristijan Nika — WhatsApp, електронні листи, органи влади, документи та фото.",
      c3_h3: "Звіти та аналіз",
      c3_p: "Резюме, оцінки та повна підготовка справи від Franchcom (включно з усіма робочими папками).",
      open: "Відкрити →",
      note_b: "Примітка:",
      note_p: "Ця сторінка — швидкий доступ; самі файли надійно зберігаються в порталі (portal.franchcom.at). Доступ обмежений уповноваженими особами та протоколюється. Питання?"
    },
    hu: {
      lock: "Védett adatszoba",
      eyebrow: "GreenMIG projekt · Ügybetekintés",
      h1: "Dokumentumok megtekintése",
      lead: "Az alábbi csempékkel közvetlenül megnyithatja a védett adatszobát. Az első kattintáskor egyszer bejelentkezik a hozzáférési adataival. Mindent megtekinthet és letölthet — módosítani vagy törölni nem lehet.",
      c1_h3: "Dokumentumok Gabor Simon",
      c1_p: "Gabor Simon által feltöltött összes dokumentum — WhatsApp, e-mailek, hatóságok, dokumentumok és fényképek.",
      c2_h3: "Dokumentumok Kristijan Nika",
      c2_p: "Kristijan Nika által feltöltött összes dokumentum — WhatsApp, e-mailek, hatóságok, dokumentumok és fényképek.",
      c3_h3: "Jelentések és elemzés",
      c3_p: "Összefoglalók, értékelések és a teljes ügy-előkészítés a Franchcomtól (az összes munkamappával együtt).",
      open: "Megnyitás →",
      note_b: "Megjegyzés:",
      note_p: "Ez az oldal gyors hozzáférés — maguk a fájlok biztonságosan a portálon tárolódnak (portal.franchcom.at). A hozzáférés jogosult személyekre korlátozott és naplózásra kerül. Kérdése van?"
    }
  };
  var DE = {};
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    DE[el.getAttribute('data-i18n')] = el.textContent.trim();
  });
  DICT.de = DE;
  function setLang(l) {
    if (!DICT[l]) l = 'de';
    document.documentElement.lang = l;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (DICT[l][k] !== undefined) el.textContent = DICT[l][k];
    });
    document.querySelectorAll('.lang-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.lang === l);
    });
    try { localStorage.setItem('fc_ansehen_lang', l); } catch (e) {}
  }
  document.querySelectorAll('.lang-btn').forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.dataset.lang); });
  });
  var start = 'de';
  try {
    var s = localStorage.getItem('fc_ansehen_lang');
    if (s) start = s;
    else { var n = (navigator.language || 'de').slice(0, 2); if (DICT[n]) start = n; }
  } catch (e) {}
  setLang(start);
