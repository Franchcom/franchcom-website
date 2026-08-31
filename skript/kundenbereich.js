const I18N = {
    hu: {
      secure: "Titkosított · bizalmas",
      eyebrow: "Franchcom Consulting · Ügyfélterület",
      h1: "Üdvözöljük a védett ügyfélterületen.",
      lead: "Jelentkezzen be a Franchcom Consultingtól kapott hozzáférési adatokkal. Személyes területén dokumentumokat tölthet fel, és megtalálja a jelentéseket, amelyeket megosztunk Önnel — titkosítva és bizalmasan.",
      login: "Bejelentkezés",
      agree_note: "Első alkalommal: kérjük, először tekintse meg és online erősítse meg a megállapodást és az adatvédelmet (AVV).",
      agree_btn: "Megállapodás megtekintése és megerősítése",
      hint: "A hozzáférési adatokat személyesen a Franchcomtól kapja. Kérdése van?"
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
    try { localStorage.setItem('fc_kb_lang', l); } catch (e) {}
  }
  document.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
  let start = 'de';
  try {
    const s = localStorage.getItem('fc_kb_lang');
    if (s) start = s;
    else { const n = (navigator.language || 'de').slice(0, 2); if (n === 'hu') start = 'hu'; }
  } catch (e) {}
  setLang(start);
