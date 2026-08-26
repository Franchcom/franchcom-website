# franchcom-website Audit-Runner

| | |
|---|---|
| **Version** | 0.1.0 |
| **Stand** | 2026-08-26 |
| **Status** | Anbindung an das FranchLabs Security Center, Basisumfang |
| **Bezug** | `_planning/SECAUDIT-SCHRITT1.md` · `_planning/IMPLEMENTATION-PLAN-V1.md` · Integrationsvertrag des Security Centers V1 (`FranchSecurityCenter/_audit/APP-INTEGRATION-GUIDE-V1.md`) |
| **Vorbild** | `FranchGuideBooking/audit/` (Struktur und Grundsaetze uebernommen) |

## Festgelegte Kennungen

* **`app_id = "franchcom-website"`** — BESTAETIGT am 2026-08-26, unveraenderlich.
* **`environment = "production"`** — BESTAETIGT am 2026-08-26 (Seite ist oeffentlich live).
* Die **Registrierung im Security Center erfolgt zentral am 2026-08-26** durch den
  Owner; erst danach werden Endpunkt und Schluessel in der CI hinterlegt.

## Was das ist — und was nicht

Ein **minimales, taeglich laufendes Monitoring** entlang des Integrationsvertrags —
nicht die Umsetzung der 19 Module des Implementation Plan V1. Geprueft wird die
ehrliche Basis: Erreichbarkeit, TLS, Sicherheitsheader, Repo-Hygiene, die beiden
Seitenebenen und der Bestaetigungs-Endpunkt. Der Plan bleibt die Zielarchitektur;
dieses Verzeichnis ist der erste, sofort lauffaehige Schritt dorthin.

## Grundsaetze

1. **Deterministisch.** Jeder Status entsteht aus einer Pruefung. Kein Sprachmodell
   setzt einen Status.
2. **Read-only und nicht destruktiv.** Der Runner veraendert nichts und liest
   ausschliesslich Statuscodes, Header und oeffentlich ausgeliefertes HTML —
   niemals Dateninhalte. Der Bestaetigungs-Endpunkt wird per HEAD **ohne**
   API-Schluessel geprueft; erwartet ist 401.
3. **Ohne Fremdpakete.** Nur Node-Bordmittel (`node:*`), keine `package.json` —
   das Projekt bleibt dependency-frei, die Aussagekraft des kuenftigen
   Drift-Detektors (Plan, Modul 19) bleibt erhalten.
4. **Fehlt der Nachweis, ist der Status grau.** Nicht gruen, nicht gelb.
5. **Mandats-Ebene nur opak.** Pfade der Mandatsseiten tragen Personenbezug und
   erscheinen in Reports und Findings ausschliesslich als opake Kennung
   (`mandat-<hash8>`); der Sanitizer erzwingt das zusaetzlich mit Verbotsmustern.

## Verwendung

```bash
node audit/run.mjs --dry-run              # pruefen, ausgeben, nichts senden (Standard)
node audit/run.mjs --send                 # zusaetzlich senden, sofern konfiguriert
node audit/run.mjs --heartbeat            # regulaeres Lebenszeichen, runner_healthy=true
node audit/run.mjs --heartbeat-failure    # Fehler-Heartbeat, runner_healthy=false --
                                          # NUR wenn der volle Lauf fehlgeschlagen ist
node audit/run.mjs --dry-run --out r.json # Report zusaetzlich als Datei
node --test "audit/tests/*.test.mjs"      # Tests (ausschliesslich synthetische Daten)
```

**Rueckgabewerte:** `0` Lauf vollstaendig (der Status — auch RED — steht im Report) ·
`1` unerwarteter Runnerfehler · `2` Sanitizer hat verbotene Muster gefunden ·
`3` Report dauerhaft abgelehnt.

**Bewusste Abweichung vom GuideBooking-Runner** (dort beendet RED den Lauf mit
Exit 1): Fuer diese App ist RED laut SECAUDIT SCHRITT 1 der **ab Tag 1 erwartete,
korrekte Befund** — die Mandats-Ebene ist ohne Zugriffsschutz erreichbar und
Share-Links stehen im ausgelieferten HTML. Wuerde der Befund den CI-Lauf rot
faerben, waere jede Nacht ein Fehlschlag zu sehen und der Fehler-Heartbeat
(`runner_healthy=false`) wuerde faelschlich ausgeloest, obwohl der Runner
einwandfrei arbeitet. Der Befund wird stattdessen gemeldet (Report, Findings,
CI-Warnannotation); ein CI-Fehlschlag bedeutet hier wirklich „Runner kaputt".

## Aufbau

| Datei | Zweck |
|---|---|
| `run.mjs` | Einstiegspunkt, Modi, Ausgabe |
| `lib/pages.mjs` | Seitenregister beider Ebenen, opake Mandatskennungen |
| `lib/checks.mjs` | die tatsaechlich ausfuehrbaren Kontrollen |
| `lib/report.mjs` | Schema V1, deterministische Statusableitung, Freshness |
| `lib/sanitize.mjs` | strikt allowlist-basierter Sanitizer + Musterscanner |
| `lib/sign.mjs` | Ed25519-Signatur, Versand, Wiederholungslogik (nach `runner/melden.mjs`) |
| `lib/codes.mjs` | versionierte Code-Liste fuer Findings |
| `lib/activation.mjs` | Aktivierungsbedingungen fuer `NOT_APPLICABLE`-Domains |
| `tests/` | 44 Tests, ausschliesslich synthetische Daten |

## Heutige Kontrollen

| Kontrolle | Domain | Erwartung heute |
|---|---|---|
| Branch Protection auf `main` (nur mit Token) | security | CI: aktiv |
| Repository-Hygiene, Ignore-Abdeckung | security | bestanden |
| Geheimnisscan (Supabase-anon-Key ist dokumentiert oeffentlich; jeder JWT mit anderer Rolle ist ein Treffer) | security | bestanden |
| Share-Links im ausgelieferten HTML | security | **FAIL, HIGH — bekannter Kernbefund** |
| Mandatsseiten ohne Authentifizierung erreichbar | security | **FAIL, HIGH — bekannter Kernbefund** |
| Basisheader (nosniff, X-Frame-Options, Referrer-, Permissions-Policy) | security | FAIL (Permissions-Policy fehlt) |
| Content-Security-Policy | security | FAIL (keine CSP) |
| CORS-Wildcard | security | FAIL, LOW |
| TLS-Version (>= 1.2) und HSTS | security | bestanden |
| Keine fremden Ressourcen auf Marketing-Seiten | privacy | FAIL auf Seiten mit Google Fonts |
| noindex auf allen Mandatsseiten | privacy | bestanden |
| Sitemap fuehrt keine Mandatsseite | privacy | bestanden |
| Backend-Konfiguration der Bestaetigungsseite konsistent | data_integrity | bestanden |
| Bestaetigungs-Endpunkt erreichbar, verlangt Schluessel (HEAD, ohne Key, nur Status) | data_integrity | bestanden |
| Erreichbarkeit Marketing- und Mandatsseiten, Apex- und Consulting-Redirect, robots/sitemap | availability | bestanden |
| Dokumentgeruest der Startseite | ux | bestanden |

**Gekoppelte Kontrollen:** `mandate_access_control` (Soll kuenftig 401/403) und
`mandate_reachable` beruhen auf demselben Abruf. Sobald der geplante
Zugriffsschutz kommt (Plan, Modul 01), gelten 401/403 als „antwortet wie
vorgesehen" — beide Kontrollen drehen dann gemeinsam auf gruen.

**Bewusst grau:** `backup` — Code-Backup existiert (Git + GitHub), aber fuer
Supabase- und Portal-Daten ist weder ein Backup noch je eine Wiederherstellung
nachgewiesen (SECAUDIT, Abschnitt 17). Grau bleibt grau, bis der Nachweis existiert.

**Begruendet nicht anwendbar:** `payment` (`NO_PAYMENT_FEATURE`),
`ai_ocr` (`NO_AI_FEATURE`) — SECAUDIT, Abschnitte 7, 11, 12.

**Aktivierungsbedingung — `NOT_APPLICABLE` ist keine Dauerausnahme.** Vor jedem
Lauf prueft `lib/activation.mjs`, ob Zahlungs- oder AI/OCR-Funktionalitaet
aufgetaucht ist (Dateipfade, Dateiinhalte, Umgebungsvariablen). Sobald ja,
verlaesst die Domain die Ausnahme und wird **`GRAY`** — niemals gruen —, bis
echte Pruefungen existieren.

## Anbindung an das Security Center

Vertrag: **Schema V1**, **Ed25519**, kanonische Zeichenkette `SCv1`, Nonce,
Zeitstempelfenster ±300 s, Idempotenz ueber `report_id`, Wiederholungen nach
Abschnitt 8 (401/413/422 nie wiederholen, 409 mit frischer Nonce, 429 nach
Retry-After, 5xx mit Backoff).

Umgebungsvariablen (nur fuer `--send`, ausschliesslich als CI-Secrets):

| Variable | Inhalt |
|---|---|
| `SC_REPORT_URL` | Endpunkt des Security Centers (Basis-URL genuegt, der Vertragspfad wird ergaenzt) |
| `SC_PRIVATE_KEY` | privater Ed25519-Schluessel (PKCS8-PEM) |
| `SC_KEY_VERSION` | Schluesselversion, Standard `v1` |

Ohne `SC_REPORT_URL` und `SC_PRIVATE_KEY` erzeugt der Runner den Report,
sendet nichts und beendet sich mit Exit 0 (`KEIN VERSAND`).

**Der private Schluessel gehoert ausschliesslich in die Umgebung**, niemals ins
Repository und niemals in Logs. Erzeugt wird das Schluesselpaar **vom Owner**
mit `FranchSecurityCenter/runner/schluessel-erzeugen.mjs`; nur der oeffentliche
32-Byte-Teil geht an das Security Center (Schluesselversion `v1`).

## CI

`.github/workflows/audit.yml` — Tests + Dry Run bei Pull Requests, Lauf bei Push
auf `main`, **taeglich um 02:20 UTC** (`cron "20 2 * * *"`), jederzeit manuell
(`workflow_dispatch`, Versand nur auf ausdrueckliches `send=true` oder im
Zeitplan). Berechtigung: `contents: read`. Secrets werden nur referenziert.
Der Fehler-Heartbeat (`runner_healthy=false`) wird ausschliesslich gesendet,
wenn der Lauf selbst fehlschlaegt — nicht bei rotem Befund.

**Auslieferungsschutz:** `audit/`, `.github/` und `audit-report.json` stehen in
`.vercelignore`. Ohne diese Eintraege wuerde Vercel den Runner unter
`franchcom.at/audit/` oeffentlich ausliefern — exakt die Fehlerklasse, die der
Implementation Plan (Kapitel 8.1) fuer `_audit/` beschreibt.

## Offen

- Zentrale Registrierung am 2026-08-26 abschliessen: App im Security Center
  anlegen, oeffentlichen Schluessel als `v1` hinterlegen, danach CI-Secrets setzen
- Erster `--send`-Lauf erst nach Freigabe durch den Owner
- Ausbau Richtung Implementation Plan V1 (Share-Link-Governance Stufe 1,
  Supabase-RLS-Pruefung Stufe A, Host-Drift) in einer Folgephase
