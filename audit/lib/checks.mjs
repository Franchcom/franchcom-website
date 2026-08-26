// Die tatsaechlich heute ausfuehrbaren Kontrollen der franchcom-website.
//
// Grundsaetze: deterministisch, read-only, nicht destruktiv, ohne Fremdpakete.
// Was nicht existiert oder nicht belegbar ist, wird NICHT gruen gerechnet,
// sondern bleibt GRAY. Es werden ausschliesslich Statuscodes, Header und
// oeffentlich ausgeliefertes HTML bewertet -- niemals Dateninhalte.
//
// Mandats-Ebene: Klartextpfade nur fuer die HTTP-Aufrufe; in Ergebnissen,
// Notizen und Referenzen ausschliesslich opake Kennungen (lib/pages.mjs).

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { connect as tlsConnect } from "node:tls";
import {
  BASE, APEX, MARKETING_PAGES, MANDATE_PAGES, opaqueId,
} from "./pages.mjs";

/** Header, die vercel.json fuer alle Routen setzen soll (CSP separat geprueft). */
const REQUIRED_HEADERS = [
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
];

const REQUIRED_CSP = [
  "default-src", "script-src", "style-src", "frame-ancestors",
  "base-uri", "object-src", "form-action", "connect-src",
];

// Muster fuer Geheimnisse in versionierten Dateien. Die Muster sind so
// geschrieben, dass sie ihren eigenen Quelltext nicht treffen.
const SECRET_PATTERNS = [
  /\bsk_(live|test)_[A-Za-z0-9]{10,}/,
  /\bghp_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bpostgres(ql)?:\/\/[^\s"']+/,
  /\bwhsec_[A-Za-z0-9]{8,}/,
];

// JWTs werden gesondert behandelt: der Supabase-anon-Key ist konstruktions-
// bedingt oeffentlich und KEIN Leak (SECAUDIT SCHRITT 1, Abschnitt 14).
// Jeder JWT mit einer anderen Rolle (insbesondere service_role) ist einer.
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;

const BINARY_EXT = /\.(woff2?|png|jpg|jpeg|gif|zip|pdf|ico|webp|mp4)$/i;

/** Ergebnisobjekt einer Kontrolle. */
function result(id, module, domain, ok, note, opts = {}) {
  return { id, module, domain, ok, note, skipped: false, ...opts };
}
function skipped(id, module, domain, note) {
  return { id, module, domain, ok: null, note, skipped: true };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

/** Ein Abruf je Seite; Redirects sind selbst Pruefgegenstand. */
async function fetchPage(url) {
  const res = await fetch(url, { redirect: "manual" });
  const headers = {};
  for (const [k, v] of res.headers) headers[k.toLowerCase()] = v;
  return { status: res.status, headers, body: await res.text() };
}

/**
 * Genau ein Abruf-Durchlauf ueber beide Seitenebenen; alle Kontrollen teilen
 * sich die Ergebnisse. null = Netzwerkfehler (fuehrt zu SKIP, nie zu GREEN).
 */
export async function fetchAllPages() {
  const one = async (path) => {
    try { return await fetchPage(BASE + path); } catch { return null; }
  };
  const marketing = new Map();
  for (const p of MARKETING_PAGES) marketing.set(p, await one(p));
  const mandate = new Map();
  for (const p of MANDATE_PAGES) mandate.set(p, await one(p));
  return { marketing, mandate };
}

// ---------------------------------------------------------------- security

export async function checkBranchProtection() {
  const id = "branch_protection";
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY || "Franchcom/franchcom-website";
  if (!token) {
    return skipped(id, "repo_governance", "security",
      "Kein Token verfuegbar - Pruefung uebersprungen, Status bleibt grau");
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/rules/branches/main`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
    });
    if (!res.ok) return skipped(id, "repo_governance", "security", `API-Status ${res.status}`);
    const rules = (await res.json()).map((r) => r.type);
    const need = ["deletion", "non_fast_forward", "pull_request"];
    const missing = need.filter((n) => !rules.includes(n));
    return result(id, "repo_governance", "security", missing.length === 0,
      missing.length ? `Fehlende Schutzregeln auf main: ${missing.length}` : "Schutzregeln auf main aktiv",
      { code: "BRANCH_PROTECTION_MISSING", severity: "HIGH", ref: "repo/main" });
  } catch {
    return skipped(id, "repo_governance", "security", "Netzwerkfehler");
  }
}

export function checkRepoHygiene() {
  const id = "repo_hygiene";
  const tracked = git(["ls-files"]).split("\n").filter(Boolean);
  const envTracked = tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f));
  const gitignore = existsSync(".gitignore") ? readFileSync(".gitignore", "utf8") : "";
  const covers = [".env", "*.pem", "*.key"].filter((p) => gitignore.includes(p));
  const ok = envTracked.length === 0 && covers.length === 3;
  return result(id, "repo_governance", "security", ok,
    ok ? `${tracked.length} Dateien versioniert, keine Umgebungsdatei, Ignore-Abdeckung vorhanden`
       : "Umgebungsdatei versioniert oder Ignore-Abdeckung unvollstaendig",
    { code: "ENV_FILE_TRACKED", severity: "CRITICAL", ref: "repo/tracked-files" });
}

export function checkSecretsInRepo() {
  const id = "secret_scan";
  const tracked = git(["ls-files"]).split("\n").filter((f) => f && !BINARY_EXT.test(f));
  let patternHits = 0;
  let foreignJwt = 0;
  for (const f of tracked) {
    let text = "";
    try { text = readFileSync(f, "utf8"); } catch { continue; }
    if (SECRET_PATTERNS.some((re) => re.test(text))) patternHits++;
    for (const m of text.matchAll(JWT_PATTERN)) {
      try {
        const payload = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"));
        if (payload.role !== "anon") foreignJwt++;
      } catch { /* kein JWT-Payload -> zaehlt nicht */ }
    }
  }
  const ok = patternHits === 0 && foreignJwt === 0;
  return result(id, "repo_governance", "security", ok,
    ok ? `${tracked.length} Textdateien geprueft, kein Treffer (anon-Key ist dokumentiert oeffentlich)`
       : `Treffer: ${patternHits} Datei(en) mit Geheimnismuster, ${foreignJwt} JWT ohne anon-Rolle`,
    { code: "SECRET_PATTERN_IN_REPO", severity: "CRITICAL", ref: "repo/tracked-files" });
}

export function checkSecurityHeaders(marketing) {
  const id = "security_headers";
  const pages = [...marketing.entries()].filter(([, r]) => r !== null);
  if (pages.length === 0) return skipped(id, "public_site", "security", "Keine Seite erreichbar");
  const missing = new Set();
  let incomplete = 0;
  for (const [, r] of pages) {
    const gone = REQUIRED_HEADERS.filter((h) => !r.headers[h]);
    if (gone.length) { incomplete++; gone.forEach((h) => missing.add(h)); }
  }
  return result(id, "public_site", "security", incomplete === 0,
    incomplete === 0
      ? `Alle ${REQUIRED_HEADERS.length} Basisheader auf ${pages.length} Seiten vorhanden`
      : `${incomplete} von ${pages.length} Seiten ohne vollstaendige Basisheader; es fehlen: ${[...missing].join(", ")}`,
    { code: "SECURITY_HEADER_MISSING", severity: "MEDIUM", ref: "public/*" });
}

export function checkCsp(marketing) {
  const id = "csp_policy";
  const r = marketing.get("/");
  if (!r) return skipped(id, "public_site", "security", "Startseite nicht erreichbar");
  const csp = r.headers["content-security-policy"] || "";
  if (!csp) {
    return result(id, "public_site", "security", false,
      "Es wird keine Content-Security-Policy ausgeliefert; jedes kuenftige XSS wirkt ungebremst",
      { code: "CSP_MISSING", severity: "MEDIUM", ref: "public/*" });
  }
  const missing = REQUIRED_CSP.filter((d) => !csp.includes(d));
  const unsafe = /unsafe-inline|unsafe-eval/.test(csp);
  const ok = missing.length === 0 && !unsafe;
  const note = unsafe ? "CSP erlaubt unsafe-inline oder unsafe-eval"
    : missing.length ? `${missing.length} CSP-Direktiven fehlen`
    : "CSP vollstaendig, kein unsafe-inline";
  return result(id, "public_site", "security", ok, note,
    { code: unsafe ? "CSP_UNSAFE_INLINE" : "CSP_DIRECTIVE_MISSING", severity: "MEDIUM", ref: "public/*" });
}

export function checkCors(marketing) {
  const id = "cors_policy";
  const r = marketing.get("/");
  if (!r) return skipped(id, "public_site", "security", "Startseite nicht erreichbar");
  const acao = r.headers["access-control-allow-origin"];
  return result(id, "public_site", "security", acao !== "*",
    acao === "*"
      ? "Access-Control-Allow-Origin ist auf * gesetzt; bei rein statischen Inhalten unkritisch, aber unnoetig weit"
      : "Kein Wildcard-CORS-Header",
    { code: "CORS_WILDCARD_ORIGIN", severity: "LOW", ref: "public/*" });
}

export function checkHsts(marketing) {
  const id = "hsts";
  const r = marketing.get("/");
  if (!r) return skipped(id, "transport_security", "security", "Startseite nicht erreichbar");
  const hsts = r.headers["strict-transport-security"] || "";
  const age = Number((hsts.match(/max-age=(\d+)/) || [])[1] || 0);
  return result(id, "transport_security", "security", age >= 31536000,
    age >= 31536000 ? `HSTS aktiv, max-age ${age}` : "HSTS fehlt oder max-age unter einem Jahr",
    { code: "HSTS_MISSING_OR_WEAK", severity: "MEDIUM", ref: "public/*" });
}

export function checkTlsVersion() {
  const id = "tls_version";
  const host = new URL(BASE).hostname;
  return new Promise((resolve) => {
    const done = (v) => { resolve(v); };
    try {
      const socket = tlsConnect({ host, port: 443, servername: host }, () => {
        const proto = socket.getProtocol() || "unbekannt";
        socket.end();
        const ok = proto === "TLSv1.2" || proto === "TLSv1.3";
        done(result(id, "transport_security", "security", ok,
          ok ? `Ausgehandelt: ${proto}` : `Unerwartetes Protokoll ausgehandelt`,
          { code: "TLS_VERSION_TOO_LOW", severity: "HIGH", ref: "public/tls" }));
      });
      socket.setTimeout(8000, () => { socket.destroy(); done(skipped(id, "transport_security", "security", "Zeitueberschreitung")); });
      socket.on("error", () => done(skipped(id, "transport_security", "security", "Verbindungsfehler")));
    } catch {
      done(skipped(id, "transport_security", "security", "Verbindungsfehler"));
    }
  });
}

export function checkShareTokenExposure() {
  const id = "share_token_exposure";
  const tracked = git(["ls-files"]).split("\n").filter((f) => f.endsWith(".html"));
  let links = 0;
  let files = 0;
  for (const f of tracked) {
    let text = "";
    try { text = readFileSync(f, "utf8"); } catch { continue; }
    const hits = text.match(/portal\.franchcom\.at\/s\/[A-Za-z0-9]+/g) || [];
    if (hits.length) { files++; links += hits.length; }
  }
  return result(id, "mandate_pages", "security", links === 0,
    links === 0
      ? "Keine Portal-Share-Links in ausgeliefertem HTML"
      : `${links} oeffentliche Portal-Share-Links in ${files} ausgelieferten Seiten; Zugriffsumfang der Shares unbelegt, Links zusaetzlich dauerhaft in der Git-History`,
    { code: "SHARE_TOKEN_IN_PUBLIC_HTML", severity: "HIGH", ref: "mandate-pages" });
}

// -------------------------------------------------- Mandats-Ebene (gemeinsam)

/**
 * Bewertet die Mandats-Ebene aus einem gemeinsamen Abruf-Durchlauf:
 * - security:      Seiten sind ohne Authentifizierung erreichbar (Soll: 401/403)
 * - privacy:       noindex-Anweisung vorhanden
 * - availability:  der fuer die Mandanten vorgesehene Zugang funktioniert
 *
 * ACHTUNG, gekoppelte Kontrollen: Sobald der geplante Zugriffsschutz kommt
 * (Implementation Plan, Modul 01), muessen access_control UND reachability
 * gemeinsam auf den neuen Soll-Zustand umgestellt werden.
 */
export function checkMandatePages(mandate) {
  const out = [];
  const entries = [...mandate.entries()];
  const reachable = entries.filter(([, r]) => r !== null);

  if (reachable.length === 0) {
    out.push(skipped("mandate_access_control", "mandate_pages", "security", "Keine Mandatsseite abrufbar"));
    out.push(skipped("mandate_noindex", "mandate_pages", "privacy", "Keine Mandatsseite abrufbar"));
    out.push(skipped("mandate_reachable", "mandate_pages", "availability", "Keine Mandatsseite abrufbar"));
    return out;
  }

  const open = reachable.filter(([, r]) => r.status === 200);
  out.push(result("mandate_access_control", "mandate_pages", "security", open.length === 0,
    open.length === 0
      ? "Keine Mandatsseite ohne Authentifizierung erreichbar"
      : `${open.length} von ${entries.length} Mandatsseiten ohne Authentifizierung erreichbar; einziger Schutz ist die Unkenntnis der URL`,
    { code: "MANDATE_PAGE_WITHOUT_ACCESS_CONTROL", severity: "HIGH", ref: "mandate-pages" }));

  const noindexMissing = open.filter(([, r]) =>
    !/<meta\s+name="robots"\s+content="noindex/i.test(r.body));
  out.push(result("mandate_noindex", "mandate_pages", "privacy", noindexMissing.length === 0,
    noindexMissing.length === 0
      ? `noindex auf allen ${open.length} erreichbaren Mandatsseiten gesetzt`
      : `${noindexMissing.length} Mandatsseiten ohne noindex (${noindexMissing.map(([p]) => opaqueId(p)).join(", ")})`,
    { code: "NOINDEX_MISSING_ON_MANDATE_PAGE", severity: "MEDIUM", ref: "mandate-pages" }));

  const broken = entries.filter(([, r]) => r === null || (r.status !== 200 && r.status !== 401 && r.status !== 403));
  out.push(result("mandate_reachable", "mandate_pages", "availability", broken.length === 0,
    broken.length === 0
      ? `${entries.length} Mandatsseiten antworten wie vorgesehen`
      : `${broken.length} Mandatsseiten mit unerwartetem Status (${broken.map(([p]) => opaqueId(p)).join(", ")})`,
    { code: "PAGE_UNEXPECTED_STATUS", severity: "HIGH", ref: "mandate-pages" }));

  return out;
}

// ---------------------------------------------------------------- privacy

/** Nur Attribute, die den Browser zum Nachladen veranlassen; rel="canonical"
 *  und <a href> sind Navigation bzw. Metadaten, kein Ressourcenabruf. */
const RESOURCE_REL = /stylesheet|icon|preload|prefetch|preconnect|dns-prefetch|manifest|mask-icon|apple-touch/i;

function foreignResources(body) {
  const refs = [];
  for (const re of [
    /<script[^>]+src="([^"]+)"/gi,
    /<img[^>]+src="([^"]+)"/gi,
    /<iframe[^>]+src="([^"]+)"/gi,
    /<source[^>]+src="([^"]+)"/gi,
    /url\((https?:\/\/[^)]+)\)/gi,
  ]) refs.push(...[...body.matchAll(re)].map((m) => m[1]));
  for (const m of body.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (tag.match(/rel="([^"]*)"/i) || [])[1] || "";
    const href = (tag.match(/href="([^"]*)"/i) || [])[1] || "";
    if (RESOURCE_REL.test(rel) && href) refs.push(href);
  }
  const own = (u) => u.startsWith(BASE) || u.startsWith(APEX);
  return {
    total: refs.length,
    foreign: refs.filter((u) => /^https?:\/\//i.test(u) && !own(u)),
  };
}

export function checkNoExternalResources(marketing) {
  const out = [];
  for (const [p, r] of marketing) {
    const id = `no_external_resources${p === "/" ? ":index" : ":" + p.slice(1)}`;
    if (!r) { out.push(skipped(id, "public_site", "privacy", "Seite nicht erreichbar")); continue; }
    const { total, foreign } = foreignResources(r.body);
    out.push(result(id, "public_site", "privacy", foreign.length === 0,
      foreign.length === 0
        ? `${total} Ressourcen, alle vom eigenen Ursprung`
        : `${foreign.length} fremde Ressourcen; IP-Uebermittlung an Dritte ohne Einwilligung`,
      { code: "EXTERNAL_RESOURCE_REFERENCED", severity: "MEDIUM", ref: `public${p}` }));
  }
  return out;
}

export async function checkSitemapExclusion() {
  const id = "sitemap_exclusion";
  try {
    const { status, body } = await fetchPage(BASE + "/sitemap.xml");
    if (status !== 200) return skipped(id, "mandate_pages", "privacy", `Sitemap HTTP ${status}`);
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const listed = locs.filter((u) => MANDATE_PAGES.some((p) => new URL(u).pathname === p));
    return result(id, "mandate_pages", "privacy", listed.length === 0,
      listed.length === 0
        ? `${locs.length} Sitemap-Eintraege, keine Mandatsseite darunter`
        : `${listed.length} Mandatsseiten in der Sitemap aufgefuehrt`,
      { code: "SITEMAP_LISTS_MANDATE_PAGE", severity: "MEDIUM", ref: "public/sitemap.xml" });
  } catch {
    return skipped(id, "mandate_pages", "privacy", "Sitemap nicht erreichbar");
  }
}

// --------------------------------------------------------- data_integrity

/** Liest die Backend-Konfiguration aus der versionierten Bestaetigungsseite. */
export function confirmationConfig() {
  const file = "vereinbarung.html";
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const urls = [...new Set([...text.matchAll(/https:\/\/[a-z0-9]+\.supabase\.co/g)].map((m) => m[0]))];
  return {
    urls,
    hasRestCall: text.includes("/rest/v1/bestaetigungen"),
    hasHoneypot: /botcheck/i.test(text),
  };
}

export function checkConfirmationConfig() {
  const id = "confirmation_config";
  const cfg = confirmationConfig();
  if (!cfg) {
    return result(id, "confirmation_backend", "data_integrity", false,
      "Bestaetigungsseite fehlt im Repository",
      { code: "CONFIRMATION_CONFIG_INCONSISTENT", severity: "MEDIUM", ref: "public/vereinbarung" });
  }
  const ok = cfg.urls.length === 1 && cfg.hasRestCall && cfg.hasHoneypot;
  return result(id, "confirmation_backend", "data_integrity", ok,
    ok ? "Genau ein Backend-Projekt, REST-Aufruf und Honeypot vorhanden"
       : `Konfiguration inkonsistent: ${cfg.urls.length} Backend-URLs, REST-Aufruf ${cfg.hasRestCall ? "vorhanden" : "fehlt"}, Honeypot ${cfg.hasHoneypot ? "vorhanden" : "fehlt"}`,
    { code: "CONFIRMATION_CONFIG_INCONSISTENT", severity: "MEDIUM", ref: "public/vereinbarung" });
}

/**
 * Erreichbarkeit des Bestaetigungs-Endpunkts -- NUR Status, niemals Daten:
 * HEAD ohne API-Schluessel. Erwartet ist 401/400 (erreichbar, Schluessel
 * verlangt). 2xx ohne Schluessel waere ein offener Endpunkt. Es wird kein
 * Schluessel mitgesendet und kein Response-Body gelesen.
 */
export async function checkConfirmationEndpoint() {
  const id = "confirmation_endpoint";
  const cfg = confirmationConfig();
  if (!cfg || cfg.urls.length !== 1) {
    return skipped(id, "confirmation_backend", "data_integrity", "Backend-URL nicht eindeutig bestimmbar");
  }
  try {
    const res = await fetch(`${cfg.urls[0]}/rest/v1/bestaetigungen`, { method: "HEAD", redirect: "manual" });
    if (res.status === 401 || res.status === 400) {
      return result(id, "confirmation_backend", "data_integrity", true,
        `Endpunkt erreichbar, verlangt API-Schluessel (HTTP ${res.status})`,
        { code: "CONFIRMATION_ENDPOINT_UNREACHABLE", severity: "HIGH", ref: "backend/rest/bestaetigungen" });
    }
    if (res.status >= 200 && res.status < 300) {
      return result(id, "confirmation_backend", "data_integrity", false,
        `Endpunkt antwortet ohne API-Schluessel mit HTTP ${res.status}`,
        { code: "CONFIRMATION_ENDPOINT_UNPROTECTED", severity: "HIGH", ref: "backend/rest/bestaetigungen" });
    }
    return result(id, "confirmation_backend", "data_integrity", false,
      `Endpunkt antwortet mit HTTP ${res.status}; das Bestaetigungsformular wuerde Eingaben verlieren`,
      { code: "CONFIRMATION_ENDPOINT_UNREACHABLE", severity: "HIGH", ref: "backend/rest/bestaetigungen" });
  } catch {
    return skipped(id, "confirmation_backend", "data_integrity", "Netzwerkfehler");
  }
}

// ------------------------------------------------------- ux / availability

export function checkMarketingReachable(marketing) {
  const out = [];
  for (const [p, r] of marketing) {
    const id = `page_reachable${p === "/" ? ":index" : ":" + p.slice(1)}`;
    if (!r) { out.push(skipped(id, "public_site", "availability", "Nicht erreichbar")); continue; }
    out.push(result(id, "public_site", "availability", r.status === 200, `HTTP ${r.status}`,
      { code: "PAGE_UNEXPECTED_STATUS", severity: "HIGH", ref: `public${p}` }));
  }
  return out;
}

export async function checkApexRedirect() {
  const id = "apex_redirect";
  try {
    const { status, headers } = await fetchPage(APEX + "/");
    const ok = status >= 301 && status <= 308 && (headers.location || "").startsWith(BASE);
    return result(id, "public_site", "availability", ok,
      ok ? `Apex leitet mit HTTP ${status} auf www um` : `Apex antwortet mit HTTP ${status} ohne www-Ziel`,
      { code: "REDIRECT_TARGET_UNEXPECTED", severity: "MEDIUM", ref: "public/apex" });
  } catch {
    return skipped(id, "public_site", "availability", "Apex nicht erreichbar");
  }
}

export async function checkConsultingRedirect() {
  const id = "consulting_redirect";
  try {
    const { status, headers } = await fetchPage(BASE + "/consulting");
    const ok = status >= 301 && status <= 308
      && (headers.location || "").startsWith("https://consulting.franchcom.at");
    return result(id, "public_site", "availability", ok,
      ok ? `Weiterleitung aktiv (HTTP ${status})` : `Unerwartete Antwort HTTP ${status}`,
      { code: "REDIRECT_TARGET_UNEXPECTED", severity: "MEDIUM", ref: "public/consulting" });
  } catch {
    return skipped(id, "public_site", "availability", "Nicht erreichbar");
  }
}

export async function checkRobotsSitemap() {
  const id = "robots_sitemap";
  try {
    const robots = await fetchPage(BASE + "/robots.txt");
    const sitemap = await fetchPage(BASE + "/sitemap.xml");
    const ok = robots.status === 200 && /sitemap:/i.test(robots.body)
      && sitemap.status === 200 && sitemap.body.includes("<urlset");
    return result(id, "public_site", "availability", ok,
      ok ? "robots.txt und sitemap.xml vorhanden und konsistent"
         : `robots.txt HTTP ${robots.status}, sitemap.xml HTTP ${sitemap.status}`,
      { code: "ROBOTS_OR_SITEMAP_UNREACHABLE", severity: "MEDIUM", ref: "public/robots.txt" });
  } catch {
    return skipped(id, "public_site", "availability", "Nicht erreichbar");
  }
}

export function checkPageSkeleton(marketing) {
  const id = "page_skeleton";
  const r = marketing.get("/");
  if (!r) return skipped(id, "public_site", "ux", "Startseite nicht erreichbar");
  const ok = r.body.includes("<title>") && r.body.includes("viewport")
    && /<html[^>]+lang=/.test(r.body) && r.body.includes("</html>");
  return result(id, "public_site", "ux", ok,
    ok ? "Titel, Viewport, Sprachattribut und Dokumentende vorhanden" : "Dokumentgeruest unvollstaendig",
    { code: "PAGE_SKELETON_INCOMPLETE", severity: "MEDIUM", ref: "public/" });
}

/** Fuehrt alle Kontrollen aus. Ein Fehler in einer Kontrolle stoppt den Lauf nicht. */
export async function runAllChecks() {
  const parts = [];
  const add = (v) => (Array.isArray(v) ? parts.push(...v) : parts.push(v));
  const safe = async (fn, id) => {
    try { add(await fn()); }
    catch (e) { parts.push(skipped(id, "runner", "security", `Fehler: ${e.name}`)); }
  };

  let pagesResult = { marketing: new Map(), mandate: new Map() };
  try { pagesResult = await fetchAllPages(); } catch { /* einzelne Checks skippen selbst */ }
  const { marketing, mandate } = pagesResult;

  await safe(checkBranchProtection, "branch_protection");
  await safe(checkRepoHygiene, "repo_hygiene");
  await safe(checkSecretsInRepo, "secret_scan");
  await safe(checkShareTokenExposure, "share_token_exposure");
  await safe(() => checkSecurityHeaders(marketing), "security_headers");
  await safe(() => checkCsp(marketing), "csp_policy");
  await safe(() => checkCors(marketing), "cors_policy");
  await safe(() => checkHsts(marketing), "hsts");
  await safe(checkTlsVersion, "tls_version");
  await safe(() => checkMandatePages(mandate), "mandate_pages");
  await safe(() => checkNoExternalResources(marketing), "no_external_resources");
  await safe(checkSitemapExclusion, "sitemap_exclusion");
  await safe(checkConfirmationConfig, "confirmation_config");
  await safe(checkConfirmationEndpoint, "confirmation_endpoint");
  await safe(() => checkMarketingReachable(marketing), "page_reachable");
  await safe(checkApexRedirect, "apex_redirect");
  await safe(checkConsultingRedirect, "consulting_redirect");
  await safe(checkRobotsSitemap, "robots_sitemap");
  await safe(() => checkPageSkeleton(marketing), "page_skeleton");
  return parts;
}
