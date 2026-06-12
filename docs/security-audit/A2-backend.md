# A2 — Backend Security Audit: Injection, Secrets, Data Exposure

> **Status:** COMPLETE

## Executive Summary

All backend logic runs under a hardcoded `service_role` key that bypasses every Supabase RLS policy — this key appears in source in 4 separate places. User input flows from `POST /api {action,args}` directly to any exported lib function with no auth middleware (A1 scope). These two facts amplify every other finding: a filter injection has full-table blast radius, a mass-dump call has no row-level guard, and the cleartext password system is fully accessible. Three areas need urgent remediation: rotate the leaked service_role key, hash passwords in `usuarios_acessos`, and add auth/scoping before all data endpoints.

---

## Findings Table

| ID | Severity | Title | File:Line | Evidence Snippet | Exploit Scenario | Fix |
|----|----------|-------|-----------|-----------------|-----------------|-----|
| A2-01 | CRITICAL | Hardcoded `service_role` JWT in source (4 occurrences) | `lib/portal_supabase.js:18`, `lib/rtma_supabase.js:9`, `lib/code.js:64`, `lib/code.js:88` | `serviceRoleKey: 'eyJhbGci...'` literal — same key in all four locations | Any git history reader, CI log, public GitHub push exposes the key permanently. Key grants full-admin DB access, bypasses all RLS. | Rotate key immediately. Use `process.env.SUPABASE_SERVICE_ROLE_KEY` exclusively; remove all hardcoded fallback literals. |
| A2-02 | CRITICAL | Cleartext passwords in `usuarios_acessos.senha` — custom auth | `lib/rtma_supabase.js:421` | `if (usuario.senha !== senha) return respostaErro(...)` — plain string comparison | Any DB read (via injection, misconfigured RLS, or direct Supabase dashboard) exposes all passwords in plaintext. No rate-limiting or lockout exists. | Hash with bcrypt. Migrate custom auth to Supabase Auth. |
| A2-03 | HIGH | `buscarUsuarioNoSupabase` returns full row including `senha` | `lib/rtma_supabase.js:401-431` | `usuarios_acessos?email=eq.X&select=*` — returns all columns; normalization at line 422 does not strip `senha` before success return | Successful login call returns `usuarioNormalizado` without `senha`, but if combined with injection to enumerate emails the full row (with password) leaks. More critically, `select=*` means any new sensitive column is auto-exposed. | Use `select=id,clube_nome,email,tipo_acesso,ativo` — never `select=*` on auth tables. |
| A2-04 | HIGH | PostgREST filter injection — `portalFetchAllRows` accepts free-form `querySuffix` | `lib/portal_supabase.js:413` | `` const suffix = opts.querySuffix ? `&${String(opts.querySuffix)...}` : '' `` — only strips leading `&`, passes raw string into URL | `action=portalBuscarTodasAtividades&args=[false,false,{"querySuffix":"order=id.asc&select=senha,*"}]` — attacker appends arbitrary PostgREST params including `select=`, `or=()`, join syntax | Reject `querySuffix` from external callers entirely; or accept only a whitelist of safe sort columns. |
| A2-05 | HIGH | PostgREST injection — `buscarPessoasMultiplosClubesDoSupabase` or-filter with attacker-controlled club names | `lib/rtma_supabase.js:259-260` | `` `or=(${filtros})` `` where `filtros = clubesNomes.map(n => \`clube_nome.eq.${encodeURIComponent(n)}\`).join(',')` — inner values are encoded but the outer `or=(` is raw, and a club name like `x),or(1.eq.1` would break out | If the clubs array contains adversarial strings, the `or=(...)` filter can be escaped to become `or=(clube_nome.eq.x),or(1.eq.1` which returns all rows | Validate each club name against the known-clubs whitelist before building the filter; reject any name not in the map. |
| A2-06 | HIGH | PostgREST injection — `buscarAtividadePorId` uses unencoded `id` | `lib/funcao_match_storage.js:199` | `` `atividades?id=eq.${id}&select=*&limit=1` `` — `id` from `record.registro_id` in the backup table, no `encodeURIComponent` | If backup table is attacker-influenced, inject `fake-id&select=*,usuarios_acessos!inner(senha)` to join sensitive tables | Wrap all ID values with `encodeURIComponent(String(id))`. |
| A2-07 | HIGH | Mass PII dump — `buscarPessoasMultiplosClubesDoSupabase` with empty array | `lib/rtma_supabase.js:255-260` | When `ids=[]`, fallback uses `or=(clube_nome.eq.x,...)` with empty list → PostgREST may match zero or all rows; also `select=id,...,telefone,email,restricao_alimentar` for every member in all clubs | Pass empty club array → get entire `pessoas_rtma` table including names, phones, emails, dietary restrictions | Require non-empty, validated club list. |
| A2-08 | HIGH | Mass data dump — `portalBuscarTodasAtividades` / `portalBuscarTodasCampanhas` — no club filter | `lib/portal_supabase.js:446,462` | `portalFetchAllRows(table, options)` with no WHERE clause — returns every row in the table for all clubs | Any caller can request all activities/campaigns of all clubs with no scope restriction | Require caller-scoped `clube_id` filter; enforce via RLS or server-side scope check. |
| A2-09 | HIGH | No MIME type validation on file uploads | `lib/portal_supabase.js:2826,2934` | `const mimeType = blob.getContentType() \|\| 'application/octet-stream'` — caller sets MIME freely; no whitelist check | Upload `text/html` or `application/javascript` to public bucket; if bucket lacks forced content-type headers, browser executes file as stored XSS | Whitelist: `['image/jpeg','image/png','image/gif','application/pdf']`; reject others before upload. |
| A2-10 | HIGH | No file size limit on uploads | `lib/portal_supabase.js:2813-2900` | `blob.getBytes()` passed directly with no size check | DoS via large file; storage cost exhaustion | Check `blob.getBytes().length <= 10_000_000` before upload; return error if exceeded. |
| A2-11 | HIGH | `buscarTodosDirigentes` has inline hardcoded `service_role` key (additional A2-01 instance) | `lib/code.js:88` | `serviceRoleKey: 'eyJhbGci...'` literal inside the function body, not using the unified helper | Same blast radius as A2-01; appears to be a copy-paste leftover never replaced with `obterServiceRoleKeySupabaseUnificado()` | Replace with `obterServiceRoleKeySupabaseUnificado()`. |
| A2-12 | MEDIUM | Raw error messages echo internal Supabase details to client | `api/index.js:98` | `` return res.status(500).json({ sucesso: false, erro: err.message }) `` — `err.message` for upsert failures includes `"Supabase upsert atividade falhou: 400 {...column names, constraints...}"` | Reveals internal DB schema (column names, constraint names, table structure) to any caller | Log full error server-side; return generic `"Erro interno"` to client. |
| A2-13 | MEDIUM | `portalListarSolicitacoesAlteracao` returns all modification requests — no scope | `lib/portal_supabase.js:3058-3071` | `${table}?select=*&order=created_at.desc` with optional `status=eq.X` — no club filter; returns all requests from all clubs | Admin-only endpoint leaks all pending/approved changes across all clubs to any caller | Add mandatory `clube_nome` filter scoped to authenticated user's club. |
| A2-14 | MEDIUM | `LockService` is a no-op shim — race conditions in inscription creation | `lib/gas-compat.js:80-91` | `waitLock: () => {}` — lock always succeeds immediately with no actual locking | Two concurrent inscription requests for the same person/event can both pass the duplicate check (lines 1319-1328) and create duplicate inscriptions | Use Supabase unique constraint on `(evento_id, pessoa_nome)` as the real guard; or use DB-level advisory lock. |
| A2-15 | MEDIUM | `Utilities.getUuid()` not shimmed — `gerarSenhaProvisoria` throws at runtime | `lib/gas-compat.js:94-127`, `lib/code.js:1861` | `Utilities` shim has no `getUuid` method; `gerarSenhaProvisoria()` calls `Utilities.getUuid()` → `TypeError: Utilities.getUuid is not a function` | All calls to `provisionarAcessoPortalAposNominata` and `criarUsuarioComSenhaProvisoria` fail silently; auth provisioning broken | Add `getUuid: () => require('crypto').randomUUID()` to Utilities shim. (Secondary: use `crypto.randomBytes` directly.) |
| A2-16 | MEDIUM | Auth admin endpoints trust caller-supplied email without secondary validation | `lib/code.js:1882-1903` | `criarUsuarioAuthComSenhaProvisoria(email, senha)` — email comes from RTMA person record, but the record itself was written by a user action; no format validation before passing to `POST /auth/v1/admin/users` | Malformed or crafted email in RTMA person record → Supabase Auth admin call with bad input; error text reflected back to caller | Validate email format with a strict regex before calling auth admin. |
| A2-17 | MEDIUM | `portalListarPastPresidentes` returns full table with no scope | `lib/portal_supabase.js:2479` | `${table}?select=*&order=...` — no event or club filter | Any caller gets complete historical past-president list | Scope by event when used in event context; rate-limit if public. |
| A2-18 | LOW | `buscarPessoasDoSupabase` ilike fallback uses `select=*` | `lib/rtma_supabase.js:192` | `pessoas_rtma?clube_nome=ilike.${...}&select=*` — broader than primary query's explicit column list | Returns all columns including any sensitive fields added later | Match column list to primary query. |
| A2-19 | INFO | `substituirPlaceholders` builds `new RegExp` from static keys — no user input | `lib/code.js:16474` | Placeholders keys are literals (`<nome>`, `<clube>` etc.) | No risk — static strings only | N/A |
| A2-20 | INFO | `portalNormalizarNomeParaPath` prevents `../` traversal in upload paths | `lib/portal_supabase.js:2751-2761` | Strip to `[a-zA-Z0-9_\-]` — `../` becomes empty string | Traversal attempt sanitized | N/A — already safe |

---

## Detailed Notes

### service_role Key — Blast Radius

Because all queries use the `service_role` JWT, Supabase RLS is **entirely bypassed**. The key appears in git history at `lib/portal_supabase.js:18`, `lib/rtma_supabase.js:9`, `lib/code.js:64`, and `lib/code.js:88`. Rotation is the immediate priority — a new key must be set in Vercel environment variables and the old key invalidated in the Supabase dashboard.

### querySuffix Injection (A2-04) — Concrete Exploit

```
POST /api
{"action":"portalBuscarTodasCampanhas","args":[false,false,{"querySuffix":"order=id.asc&select=id,senha,email"}]}
```
This appends `&select=id,senha,email` to the campanhas query. Even if `campanhas` has no `senha` column, the same mechanism works against `usuarios_acessos` via a PostgREST resource embedding syntax if FK relationships exist.

### Cleartext Password (A2-02) — Concrete Exploit

```
POST /api
{"action":"buscarUsuarioNoSupabase","args":["victim@clube.com","wrong"]}
```
Returns `Credenciais inválidas` — but with a filter injection the attacker can enumerate the `usuarios_acessos` table and read the `senha` column directly, yielding plaintext passwords for all users.

### MIME Validation Gap (A2-09) — Stored XSS via Storage

```
POST /api
{"action":"portalUploadComprovanteEvento","args":[{blob.getContentType()="text/html", bytes=<html><script>...</script>},...]}
```
File lands at a public Supabase storage URL. If the user navigates to the URL directly (e.g., from a link in the portal), the browser may execute it. Risk depends on Supabase bucket content-type enforcement — validate before upload regardless.

### LockService No-Op (A2-14) — Race Condition

`portalCriarInscricaoEvento` uses `LockService.getScriptLock().waitLock(30000)` thinking it's mutually exclusive. In Node it is a no-op. Two simultaneous POST requests with the same `pessoaNome`/`eventoId` both pass the duplicate check at line 1319-1328 and insert two rows. The real guard must be a `UNIQUE(evento_id, pessoa_nome)` constraint in the DB.

---

## Summary by Severity

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 2 | A2-01, A2-02 |
| HIGH | 9 | A2-03 – A2-11 |
| MEDIUM | 6 | A2-12 – A2-17 |
| LOW | 1 | A2-18 |
| INFO | 2 | A2-19, A2-20 |

## Top 3 Urgent

1. **A2-01 — Rotate service_role key NOW.** It is committed in plaintext in at least 4 source locations. Any git history access = full DB compromise.
2. **A2-02 — Hash passwords in `usuarios_acessos`.** Passwords are stored and compared as plaintext strings. One DB read leaks all credentials.
3. **A2-04 — Remove/whitelist `querySuffix` parameter.** A single API call with a crafted `querySuffix` can project arbitrary columns from the campanhas/atividades tables, amplified by service_role to bypass RLS.
