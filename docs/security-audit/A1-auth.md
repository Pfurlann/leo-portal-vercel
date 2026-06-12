# A1 — Authentication & Authorization Audit (LEO Portal Vercel)

Read-only defensive audit, authorized by owner. Scope: authn/authz of the `/api` dispatch layer and frontend auth flows.

## Executive summary

- `api/index.js` defines `verifyAuth(req)` (line 42) but **never calls it**. Every one of ~334 exported backend functions is invocable **unauthenticated** by anyone via `POST /api {action, args}`. (CRITICAL)
- There is **no server-side authorization** of any kind: no role/cargo/clube enforcement on data or admin actions. The only server-side gate (`validarAcessoPorCargo`) is reached solely inside the user-provisioning helper, not on data actions.
- Backend functions trust **client-supplied** `clube` / `email` / `tipoAcesso` args, so an attacker can dump all clubs' personal data, mutate records, delete clubs/people, create Supabase Auth accounts with a chosen password, and grant themselves district-level access.
- Login itself is fine (direct Supabase GoTrue `signInWithPassword` from browser; real JWT). Password reset uses Supabase Auth directly and never touches `/api`. The exposure is entirely the unauthenticated `/api` dispatcher.
- Minor: `callGAS.js` reads token from `localStorage['sb-session']`, a key nothing ever writes — so even the optional Bearer header is usually empty. Irrelevant while backend ignores auth, but means enabling enforcement needs the storageKey fixed too.

## Findings

| ID | Sev | Title | File:line | Evidence | Exploit | Fix |
|----|-----|-------|-----------|----------|---------|-----|
| A1-01 | Critical | `/api` dispatcher never authenticates | `api/index.js:42,85-95` | `verifyAuth` defined but handler calls `fn(...args)` with zero auth check; any `action` in `allFunctions` runs | `curl -XPOST /api -d '{"action":"getAssociadosLEO","args":["<clube>"]}'` returns members incl. email/phone | Call `verifyAuth` before dispatch; deny unless action is on public allowlist (see below) |
| A1-02 | Critical | Privilege escalation via `upsertUsuariosAcessosAposNominata` | `lib/code.js:2067` | Takes `(email, clubeNome, tipoAcesso, authUserId)` from client, writes `usuarios_acessos` with service-role key | Call with own email + `tipoAcesso:'distrito'` → grants self full district access; then log in normally | Enforce auth + restrict to presidente/admin role; never trust client `tipoAcesso` |
| A1-03 | Critical | Arbitrary Supabase Auth account creation w/ chosen password | `lib/code.js:1877` `criarUsuarioAuthComSenhaProvisoria` | Uses service-role `POST /auth/v1/admin/users` with `email_confirm:true` and client-supplied `password` | Create a confirmed account for any email + known password; if that email has a pending `usuarios_acessos` row → account takeover of that role | Auth + role gate; never accept client password; server-generate only |
| A1-04 | Critical | Unauthenticated bulk PII dump (emails/phones/dietary restrictions) | `lib/code.js:7172` `getAssociadosLEO`, `:7306` `getAmigosConselheiros`; `lib/rtma_pessoas.js:` `buscarPessoasRTMA`/`buscarPessoasDistrito` | All take `clube` arg, no identity check; RTMA people records include telefone, email, restrição alimentar | Loop over clubs → exfiltrate entire district personal database | Auth + clube-scope check against caller's `usuarios_acessos.clube_id` |
| A1-05 | High | Unauthenticated user deletion | `lib/code.js:2144` `excluirUsuarioAuthSupabase`, `:2495` revoke flow | DELETE `/auth/v1/admin/users/{id}` with service key, `userId` from client | Delete any auth user by id → lock legitimate users out | Auth + admin role |
| A1-06 | High | Unauthenticated club create/delete/edit | `lib/code.js:17551` `criarClubeComAcesso`, `:17519` `excluirClube`, `atualizarClubeSupabase`, `inserirClube` | Service-role writes driven by client args | Create rogue club w/ access, or delete a real club | Auth + admin role |
| A1-07 | High | Unauthenticated person create/edit/desligar | `lib/rtma_pessoas.js:651` `criarPessoaRTMA`, `:` `editarPessoaRTMA`, `:812` `desligarPessoaRTMA`; `rtma_supabase` `criarPessoaNoSupabase`/`editarPessoaNoSupabase`/`desligarPessoaNoSupabase` | `(clube, dados)` from client, no identity | Mass-create/edit/delete people in any club | Auth + clube-scope |
| A1-08 | High | Unauthenticated approval/rejection of change requests | `lib/code.js:18261` `aprovarSolicitacaoAlteracao`, `rejeitarSolicitacaoAlteracao`, `processarSolicitacaoAprovada` | `usuarioEmail` taken from client arg = forge approver identity | Self-approve own pending DM alterations | Auth + role; derive approver from token, not arg |
| A1-09 | High | Unauthenticated dirigente (nominata) mutation | `lib/code.js:772` `salvarDirigente`, `editarDirigente`, `removerDirigente` | Service-role writes from client args | Rewrite leadership roster of any club | Auth + role |
| A1-10 | High | Unauthenticated event inscription/credential tampering | `lib/code.js` `excluirInscricoesEventoPorEnvio`, `trocarInscricaoEvento`, `excluirEnvioEvento`, `credenciarPlenariaLote`, `consumirRefeicoesPassaporteLote` | All exposed, no identity | Delete/alter event registrations, burn meal passes, forge plenary credentials | Auth (these power scanner/camisas; gate by event-staff role) |
| A1-11 | Med | Admin tipo_acesso toggle exposed | `lib/code.js` `atualizarStatusAcesso`, `listarAcessos`, `provisionarAcessoPortalAposNominata`, `criarAcessoGerencial` | Service-role access-control mutations, no caller check | Activate/deactivate or escalate arbitrary access rows | Auth + admin role |
| A1-12 | Med | Diagnostics / data-structure mutation actions exposed | `lib/code.js` `migracaoEmergenciaEstruturaCampanhas`, `corrigirEstruturaCampanhasCompleta`, `limparColunasExtras`, `rtmaDiagnosticoSupabase`, `portalDiagnosticoSupabasePortal` | Destructive/maintenance fns callable by anyone | Trigger schema "migrations"/cleanup → data corruption / DoS | Auth + admin role; ideally remove from web-exposed surface |
| A1-13 | Med | Server-side authz logic is advisory only | `lib/sistema_permissoes_cargos.js` (whole file) | `validarAcessoPorCargo` checks nominata cargo, but is only invoked inside `criarUsuarioComSenhaProvisoria` (`code.js:2483`); no data action calls it. Frontend `aplicarPermissoesPorTipoAcesso` (`index.html:7941`) only hides buttons | All "permission" enforcement is client-side button-hiding; trivially bypassed by calling `/api` directly | Move enforcement server-side via per-action role map |
| A1-14 | Low | Token read from never-written localStorage key | `public/js/callGAS.js:8` | Reads `sb-session` / `supabase.auth.token`; supabase-js persists under default `sb-<ref>-auth-token`, and no code writes `sb-session` | Bearer header usually empty; harmless now, but blocks future enforcement | Set supabase-js `auth.storageKey:'sb-session'` or read the actual key |
| A1-15 | Low | Tokens in localStorage / session lifetime | `index.html:7890-7896` (`persistSession:true, autoRefreshToken:true`) | JWT stored in localStorage (XSS-exfiltratable); standard GoTrue expiry/refresh | XSS → token theft (note only) | Acceptable for SPA; mitigate via CSP/XSS hardening (other audit) |

## Login / session facts (verified)

- Auth = direct Supabase GoTrue from browser: `supabasePortal.auth.signInWithPassword({email,password})` at `public/index.html:8098`. `access_token` is a **real Supabase JWT**. Client created with **anon** key (`index.html:7890`; anon JWT inlined at `:5876/:7865` — expected public key, not service role).
- Session persisted by supabase-js itself (`persistSession:true`), default storageKey `sb-<ref>-auth-token`. Nothing writes `sb-session`; `callGAS.getToken()` therefore usually returns `''`.
- `verificarLogin(email,senha)` (`code.js:1453`) is deprecated/no-op. `verificarAutenticacao(token)` (`code.js:1346`) is a correct server-side validator (validates JWT against `/auth/v1/user`, loads `usuarios_acessos`, checks `ativo`) — **but it is never invoked by the dispatcher**. It's the building block for the fix.
- Password reset: `recuperar_senha.html:247` → `auth.resetPasswordForEmail`; `redefinir_senha.html:235` → `auth.updateUser`. Both use the Supabase client directly with anon key — **they never call `/api`**. So password reset is NOT exposed through the vulnerable dispatcher.

## Public-by-design allowlist (actions that MUST stay callable unauthenticated)

These are the ONLY actions the unauthenticated public surface needs. Everything else should require a valid token.

- **Login**: none — handled entirely by Supabase GoTrue, not `/api`.
- **Password recovery/reset** (`recuperar_senha.html`, `redefinir_senha.html`): none — Supabase GoTrue, not `/api`.
- **Guest event form** (`form_evento_convidados.html`):
  - `obterInfoFormularioConvidado`
  - `registrarInscricaoConvidadoExterno`
  - (likely also `isFormularioConvidadosAtivo` for the gate — verify before locking)
- **index.html pre-login bootstrap**: none required — the SPA only calls data actions after `configurarSessaoPortal`. Confirm no anonymous bootstrap action before enforcing.

> Scanner (`scanner_refeicoes.html`) and camisas (`camisas_enumeradas.html`) have **no login gate today** but call privileged actions (`consumirRefeicoesPassaporteLote`, `validarSaldoRefeicaoPassaporte`, `credenciarInscricoesModalidadeLote`, `credenciarPlenariaLote`, `listarCredenciadosModalidade/Plenaria`, `removerCredenciamento*`; `salvarCamisaEnumerada`, `listarCamisasEnumeradas`, `enviarComprovanteCamisa`). These should **require auth** (event-staff role), not be public. Add a login to those pages rather than allowlisting the actions.

**Final allowlist (exact action names):**
```
obterInfoFormularioConvidado
registrarInscricaoConvidadoExterno
isFormularioConvidadosAtivo   # include only if pre-load gate needs it
```

## Enforcement design for `api/index.js`

```js
// 1. Public allowlist — the ONLY actions runnable without a token.
const PUBLIC_ACTIONS = new Set([
  'obterInfoFormularioConvidado',
  'registrarInscricaoConvidadoExterno',
  'isFormularioConvidadosAtivo', // verify needed
]);

// 2. Optional per-action minimum role. Omitted action = any authenticated user.
//    Roles derived from usuarios_acessos.tipo_acesso (distrito|secretaria|campanhas|clube|evento...).
const ACTION_ROLES = {
  upsertUsuariosAcessosAposNominata: ['distrito'],
  criarUsuarioAuthComSenhaProvisoria: ['distrito'],
  criarUsuarioComSenhaProvisoria:     ['distrito'],
  excluirUsuarioAuthSupabase:         ['distrito'],
  provisionarAcessoPortalAposNominata:['distrito'],
  revogarAcessoPortalAposExcluirNominata:['distrito'],
  atualizarStatusAcesso:              ['distrito'],
  criarClubeComAcesso:                ['distrito'],
  excluirClube:                       ['distrito'],
  aprovarSolicitacaoAlteracao:        ['distrito','secretaria'],
  rejeitarSolicitacaoAlteracao:       ['distrito','secretaria'],
  salvarDirigente:                    ['distrito','secretaria'],
  editarDirigente:                    ['distrito','secretaria'],
  removerDirigente:                   ['distrito','secretaria'],
  // event-staff actions for scanner/camisas:
  consumirRefeicoesPassaporteLote:    ['distrito','evento'],
  credenciarInscricoesModalidadeLote: ['distrito','evento'],
  credenciarPlenariaLote:             ['distrito','evento'],
  // ...extend as needed; destructive migration fns => ['distrito'] or remove from surface
};

// In handler, after resolving `action`, before dispatch:
if (!PUBLIC_ACTIONS.has(action)) {
  const auth = await verifyAuthFull(req); // reuse code.js verificarAutenticacao logic
  if (!auth || !auth.sucesso) {
    return res.status(401).json({ sucesso:false, erro:'Não autenticado' });
  }
  const role = String(auth.usuario.tipoAcesso || '').toLowerCase();
  const allowed = ACTION_ROLES[action];
  if (allowed && !allowed.includes(role) && role !== 'distrito') { // distrito = full
    return res.status(403).json({ sucesso:false, erro:'Sem permissão' });
  }
  // Defense-in-depth: pass auth.usuario into fn or use it to override client-supplied
  // clube/email args so privileged fns can no longer trust attacker-controlled identity.
}
```

Notes:
- Reuse the already-correct `verificarAutenticacao(token)` (`code.js:1346`) as `verifyAuthFull` — it validates the JWT and returns `usuario.{clube,clubeId,tipoAcesso,email}`.
- Strongest fix also stops trusting client `clube`/`email`/`tipoAcesso`: scope queries to `auth.usuario.clubeId` server-side (closes A1-02, A1-04, A1-07, A1-08).
- Also fix the storageKey mismatch (A1-14) so the frontend actually sends the Bearer header once enforcement is on.
