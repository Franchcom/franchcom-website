const I18N={
    en:{back:"← Back to homepage",h1:"Legal Notice",sub:"Disclosure pursuant to §5 E-Commerce Act (ECG) and §25 Media Act (MedienG)",
      l_owner:"Media owner & publisher",l_addr:"Address",v_addr:"Waaggasse 5/21, 1040 Vienna, Austria",l_phone:"Phone",l_email:"Email",
      h_company:"Company details",l_form:"Legal form",v_form:"Limited partnership (Ltd & Co KG)",l_uid:"VAT ID",l_fn:"Company register no.",
      l_court:"Register court",v_court:"Vienna Commercial Court",l_purpose:"Business purpose",v_purpose:"IT services, direct sales",l_gp:"General partner",l_mgmt:"Management",
      h_chamber:"Chamber, professional law & supervision",l_member:"Chamber membership",l_auth:"Supervisory authority",v_auth:"Municipal District Office for the 4th District, Vienna",l_law:"Professional law",v_law:"Austrian Trade Regulation Act",
      h_content:"Liability for the content of this website",p_content:"The contents of this website were created with the greatest possible care. However, we cannot guarantee the accuracy, completeness or timeliness of the content. As a service provider, we are responsible for our own content on these pages in accordance with general law.",
      h_links:"Liability for links",p_links:"Our website may contain links to external third-party websites over whose content we have no influence. The respective provider or operator of the linked pages is always responsible for their content. If we become aware of any legal violations, we will remove such links immediately.",
      h_copy:"Copyright",p_copy:"The content and works created by the operators on these pages are subject to Austrian copyright law. Reproduction, editing, distribution and any kind of use outside the limits of copyright law require the written consent of the respective author or creator.",
      foot_copy:"© 2026 Franchcom Ltd & Co KG · IT & Security Solutions",foot_home:"Home",foot_impressum:"Legal notice",foot_datenschutz:"Privacy"},
    uk:{back:"← На головну",h1:"Вихідні дані",sub:"Розкриття інформації згідно з §5 Закону про електронну комерцію (ECG) та §25 Закону про ЗМІ (MedienG)",
      l_owner:"Власник та видавець",l_addr:"Адреса",v_addr:"Waaggasse 5/21, 1040 Відень, Австрія",l_phone:"Телефон",l_email:"Ел. пошта",
      h_company:"Дані компанії",l_form:"Правова форма",v_form:"Командитне товариство (Ltd & Co KG)",l_uid:"ПДВ-номер",l_fn:"Реєстраційний номер",
      l_court:"Реєстраційний суд",v_court:"Комерційний суд Відня",l_purpose:"Предмет діяльності",v_purpose:"ІТ-послуги, прямий продаж",l_gp:"Повний партнер",l_mgmt:"Керівництво",
      h_chamber:"Палата, професійне право та нагляд",l_member:"Членство в палаті",l_auth:"Наглядовий орган",v_auth:"Магістратське окружне управління 4-го району, Відень",l_law:"Професійне право",v_law:"Закон про регулювання підприємницької діяльності",
      h_content:"Відповідальність за вміст цього вебсайту",p_content:"Вміст цього вебсайту створено з максимальною ретельністю. Проте ми не можемо гарантувати точність, повноту й актуальність вмісту. Як постачальник послуг ми несемо відповідальність за власний вміст на цих сторінках згідно із загальним законодавством.",
      h_links:"Відповідальність за посилання",p_links:"Наш вебсайт може містити посилання на зовнішні сторонні сайти, на вміст яких ми не маємо впливу. За вміст сторінок, на які ведуть посилання, завжди відповідає відповідний постачальник або оператор. У разі виявлення правопорушень ми негайно видалимо такі посилання.",
      h_copy:"Авторське право",p_copy:"Вміст і твори, створені операторами на цих сторінках, охороняються австрійським авторським правом. Відтворення, редагування, поширення та будь-яке використання за межами авторського права потребують письмової згоди відповідного автора чи створювача.",
      foot_copy:"© 2026 Franchcom Ltd & Co KG · ІТ- та безпекові рішення",foot_home:"Головна",foot_impressum:"Вихідні дані",foot_datenschutz:"Конфіденційність"}
  };
  const DE={};document.querySelectorAll('[data-i18n]').forEach(el=>DE[el.getAttribute('data-i18n')]=el.textContent);I18N.de=DE;
  function setLang(l){if(!I18N[l])l='de';document.documentElement.lang=l;
    document.querySelectorAll('[data-i18n]').forEach(el=>{const k=el.getAttribute('data-i18n');if(I18N[l][k]!==undefined)el.textContent=I18N[l][k];});
    document.querySelectorAll('.lang-btn').forEach(b=>b.classList.toggle('active',b.dataset.lang===l));
    try{localStorage.setItem('fc_lang',l)}catch(e){}}
  document.querySelectorAll('.lang-btn').forEach(b=>b.addEventListener('click',()=>setLang(b.dataset.lang)));
  let s='de';try{const x=localStorage.getItem('fc_lang');if(x)s=x;else{const n=(navigator.language||'de').slice(0,2);if(['de','en','uk'].includes(n))s=n;}}catch(e){}
  setLang(s);
