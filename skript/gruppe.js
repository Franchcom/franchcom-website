(function () {
    var root = document.documentElement, KEY = 'fc_theme';
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    function apply(t) {
      if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
      else root.removeAttribute('data-theme');
    }
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    if (saved) apply(saved);
    function current() {
      return root.getAttribute('data-theme') || (mq.matches ? 'dark' : 'light');
    }
    var btn = document.getElementById('themeToggle');
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
    });
  })();

  // --- Sprache DE / EN / UA / HU ---
  (function () {
    var DICT = {
      en: {
        nav_felder: "Business areas", nav_unternehmen: "Company", nav_kontakt: "Contact",
        hero_eyebrow: "Corporate group · Austria",
        hero_h1: "One company, several disciplines.",
        hero_lead: "Franchcom is an Austrian corporate group. What began as an IT service provider today spans several independent business areas — each with its own brand, its own clients and the same commitment to reliability.",
        m1: "Business areas", m2: "Active", m3: "Grown from IT",
        s1_h2: "Business areas", s1_count: "Five areas, one house",
        tier1_label: "Under the Franchcom roof",
        tier1_note: "The foundation of the group — directly on franchcom.at, each area with its own address.",
        it_core: "Core business",
        it_tag: "IT services, infrastructure and ongoing support for companies.",
        con_tag: "Research, assessment and strategic consulting for companies, owners and investors.",
        agro_tag: "Agricultural projects and land.",
        tier2_label: "Independent brands",
        tier2_note: "Grown beyond IT — with their own presence and their own domain.",
        bb_tag: "Mobile video surveillance and security technology — born from the IT business, today its own brand.",
        cap_tag: "Confidential off-market investments, trophy assets and development projects.",
        status_on: "Active", status_soon: "In preparation",
        s2_h2: "Company",
        credo: "Grown, not founded. Each area emerged from a concrete demand — not from a business plan.",
        col1_k: "Origin",
        col1_p: "Franchcom began as a classic IT service provider. This core business still carries the group today.",
        col2_k: "Own brands",
        col2_p: "When a business area grows beyond IT, it gets its own brand and its own presence — like BlackBoxer and Franchcom Capital.",
        col3_k: "Standard",
        col3_p: "Different industries, the same standard: reliability, discretion and long-term relationships.",
        k_h2: "Contact", k_who: "For enquiries about individual business areas or the group.",
        ci_ansprech: "Contact person", ci_email: "Email", ci_tel: "Phone",
        foot_start: "Home", foot_login: "Client login", foot_impressum: "Imprint", foot_datenschutz: "Privacy"
      },
      uk: {
        nav_felder: "Напрями діяльності", nav_unternehmen: "Компанія", nav_kontakt: "Контакт",
        hero_eyebrow: "Група компаній · Австрія",
        hero_h1: "Одна компанія, кілька напрямів.",
        hero_lead: "Franchcom — це австрійська група компаній. Те, що починалося як ІТ-послуги, сьогодні охоплює кілька самостійних напрямів — кожен зі своїм брендом, своїми клієнтами й однаковою відданістю надійності.",
        m1: "Напрями діяльності", m2: "Активні", m3: "Виросло з ІТ",
        s1_h2: "Напрями діяльності", s1_count: "П'ять напрямів, один дім",
        tier1_label: "Під дахом Franchcom",
        tier1_note: "Основа групи — безпосередньо на franchcom.at, кожен напрям зі своєю адресою.",
        it_core: "Основний бізнес",
        it_tag: "ІТ-послуги, інфраструктура та постійна підтримка для компаній.",
        con_tag: "Дослідження, оцінка та стратегічне консультування для компаній, власників та інвесторів.",
        agro_tag: "Сільськогосподарські проєкти та угіддя.",
        tier2_label: "Самостійні бренди",
        tier2_note: "Виросли за межі ІТ — з власним іміджем і власним доменом.",
        bb_tag: "Мобільне відеоспостереження та охоронна техніка — виникло з ІТ-бізнесу, сьогодні власний бренд.",
        cap_tag: "Конфіденційні позаринкові інвестиції, трофейні активи та девелоперські проєкти.",
        status_on: "Активно", status_soon: "У підготовці",
        s2_h2: "Компанія",
        credo: "Виросло, а не засновано. Кожен напрям виник із конкретного попиту — а не з бізнес-плану.",
        col1_k: "Походження",
        col1_p: "Franchcom починався як класичний постачальник ІТ-послуг. Цей основний бізнес тримає групу донині.",
        col2_k: "Власні бренди",
        col2_p: "Коли напрям виростає за межі ІТ, він отримує власний бренд і власний імідж — як BlackBoxer і Franchcom Capital.",
        col3_k: "Стандарт",
        col3_p: "Різні галузі, однаковий стандарт: надійність, конфіденційність і довгострокові відносини.",
        k_h2: "Контакт", k_who: "Для запитів щодо окремих напрямів або групи загалом.",
        ci_ansprech: "Контактна особа", ci_email: "Ел. пошта", ci_tel: "Телефон",
        foot_start: "Головна", foot_login: "Вхід для клієнтів", foot_impressum: "Вихідні дані", foot_datenschutz: "Конфіденційність"
      },
      hu: {
        nav_felder: "Üzletágak", nav_unternehmen: "Vállalat", nav_kontakt: "Kapcsolat",
        hero_eyebrow: "Vállalatcsoport · Ausztria",
        hero_h1: "Egy vállalat, több szakterület.",
        hero_lead: "A Franchcom egy osztrák vállalatcsoport. Ami IT-szolgáltatóként indult, ma több önálló üzletágat foglal magában — mindegyik saját márkával, saját ügyfelekkel és ugyanazzal a megbízhatóság iránti igénnyel.",
        m1: "Üzletágak", m2: "Aktív", m3: "IT-ből nőtt ki",
        s1_h2: "Üzletágak", s1_count: "Öt terület, egy ház",
        tier1_label: "A Franchcom tető alatt",
        tier1_note: "A csoport alapja — közvetlenül a franchcom.at oldalon, minden terület saját címmel.",
        it_core: "Alaptevékenység",
        it_tag: "IT-szolgáltatások, infrastruktúra és folyamatos támogatás vállalatok számára.",
        con_tag: "Kutatás, értékelés és stratégiai tanácsadás vállalatoknak, tulajdonosoknak és befektetőknek.",
        agro_tag: "Mezőgazdasági projektek és területek.",
        tier2_label: "Önálló márkák",
        tier2_note: "Az IT-n túlnőve — saját megjelenéssel és saját domainnel.",
        bb_tag: "Mobil videómegfigyelés és biztonságtechnika — az IT-üzletágból született, ma önálló márka.",
        cap_tag: "Bizalmas, piacon kívüli befektetések, trófea-eszközök és fejlesztési projektek.",
        status_on: "Aktív", status_soon: "Előkészületben",
        s2_h2: "Vállalat",
        credo: "Kinőtt, nem alapított. Minden terület konkrét igényből született — nem üzleti tervből.",
        col1_k: "Eredet",
        col1_p: "A Franchcom klasszikus IT-szolgáltatóként indult. Ez az alaptevékenység máig hordozza a csoportot.",
        col2_k: "Saját márkák",
        col2_p: "Ha egy üzletág túlnő az IT-n, saját márkát és saját megjelenést kap — mint a BlackBoxer és a Franchcom Capital.",
        col3_k: "Igényesség",
        col3_p: "Különböző iparágak, azonos mérce: megbízhatóság, diszkréció és hosszú távú kapcsolatok.",
        k_h2: "Kapcsolat", k_who: "Az egyes üzletágakkal vagy a csoporttal kapcsolatos megkeresésekhez.",
        ci_ansprech: "Kapcsolattartó", ci_email: "E-mail", ci_tel: "Telefon",
        foot_start: "Főoldal", foot_login: "Ügyfélbejelentkezés", foot_impressum: "Impresszum", foot_datenschutz: "Adatvédelem"
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
      try { localStorage.setItem('fc_gruppe_lang', l); } catch (e) {}
    }
    document.querySelectorAll('.lang-btn').forEach(function (b) {
      b.addEventListener('click', function () { setLang(b.dataset.lang); });
    });
    var start = 'de';
    try {
      var s = localStorage.getItem('fc_gruppe_lang');
      if (s) start = s;
      else { var n = (navigator.language || 'de').slice(0, 2); if (DICT[n]) start = n; }
    } catch (e) {}
    setLang(start);
  })();
