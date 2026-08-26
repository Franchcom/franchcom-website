// Versionierte Code-Liste fuer Findings der franchcom-website.
// Vertrag: code muss ^[A-Z][A-Z0-9_]{3,60}$ erfuellen und aus dieser Liste stammen.
// Aenderungen nur mit Erhoehung von CODES_VERSION.

export const CODES_VERSION = "1.0.0";

export const CODES = Object.freeze({
  // --- security: Repository ---
  ENV_FILE_TRACKED: "Eine Umgebungsdatei ist versioniert oder die Ignore-Abdeckung fehlt",
  SECRET_PATTERN_IN_REPO: "Muster eines Geheimnisses in versionierten Dateien gefunden",
  BRANCH_PROTECTION_MISSING: "Branch Protection auf dem Standardbranch fehlt oder ist unvollstaendig",

  // --- security: Auslieferung ---
  SECURITY_HEADER_MISSING: "Ein verpflichtender Sicherheitsheader fehlt",
  CSP_MISSING: "Es wird keine Content-Security-Policy ausgeliefert",
  CSP_DIRECTIVE_MISSING: "Eine verpflichtende CSP-Direktive fehlt",
  CSP_UNSAFE_INLINE: "Die CSP erlaubt unsafe-inline oder unsafe-eval",
  CORS_WILDCARD_ORIGIN: "Access-Control-Allow-Origin ist auf * gesetzt",
  TLS_VERSION_TOO_LOW: "Der Server handelt eine TLS-Version unter 1.2 aus",
  HSTS_MISSING_OR_WEAK: "Strict-Transport-Security fehlt oder die max-age ist zu kurz",

  // --- security: Mandats-Ebene ---
  SHARE_TOKEN_IN_PUBLIC_HTML: "Oeffentliche Portal-Share-Links stehen im Klartext in ausgeliefertem HTML",
  MANDATE_PAGE_WITHOUT_ACCESS_CONTROL: "Eine Mandatsseite ist ohne Authentifizierung erreichbar",

  // --- privacy ---
  EXTERNAL_RESOURCE_REFERENCED: "Eine ausgelieferte Seite laedt Ressourcen von fremder Herkunft",
  NOINDEX_MISSING_ON_MANDATE_PAGE: "Einer Mandatsseite fehlt die noindex-Anweisung",
  SITEMAP_LISTS_MANDATE_PAGE: "Die Sitemap fuehrt eine Mandatsseite auf",
  SANITIZER_LEAK: "Der Sanitizer hat ein verbotenes Feld durchgelassen",

  // --- data_integrity ---
  CONFIRMATION_CONFIG_INCONSISTENT: "Die Backend-Konfiguration der Bestaetigungsseite ist inkonsistent",
  CONFIRMATION_ENDPOINT_UNREACHABLE: "Der Bestaetigungs-Endpunkt ist nicht erreichbar",
  CONFIRMATION_ENDPOINT_UNPROTECTED: "Der Bestaetigungs-Endpunkt antwortet ohne API-Schluessel mit Erfolg",

  // --- availability / ux ---
  PAGE_UNEXPECTED_STATUS: "Eine Seite antwortet mit unerwartetem Status",
  REDIRECT_TARGET_UNEXPECTED: "Eine Weiterleitung fehlt oder zeigt auf ein unerwartetes Ziel",
  ROBOTS_OR_SITEMAP_UNREACHABLE: "robots.txt oder sitemap.xml fehlen oder sind unvollstaendig",
  PAGE_SKELETON_INCOMPLETE: "Das Dokumentgeruest einer Seite ist unvollstaendig",

  // --- runner ---
  RUNNER_CHECK_ERROR: "Eine Pruefung konnte nicht ausgefuehrt werden",
});

export function isValidCode(code) {
  return /^[A-Z][A-Z0-9_]{3,60}$/.test(code) && Object.hasOwn(CODES, code);
}
