# Resumo Consolidado — Auditoria de Segurança LEO Portal

**Data:** 2026-06-11 · Repo privado (chave service_role NÃO vazou ao público, mas está no bundle + histórico git).

Quatro auditorias paralelas (A1 auth, A2 backend, A3 frontend, A4 infra). Total: ~10 Critical/High que se reforçam.

## Os 2 problemas-raiz (tudo deriva deles)

1. **API sem autenticação** — `api/index.js` define `verifyAuth` mas nunca chama. Qualquer um, sem login, executa as ~334 funções via `POST /api {action,args}`. (A1-01 / C2)
2. **service_role key hardcoded** em `lib/portal_supabase.js:18` (sem fallback de env), `lib/rtma_supabase.js:9`, `lib/code.js` (×6). Bypassa toda RLS. (A2-01 / C1)

Juntos = acesso total de leitura/escrita/delete ao banco, sem login, sem RLS.

## Críticos / Altos acionáveis

| # | Sev | O quê | Onde | Ação |
|---|-----|-------|------|------|
| C2/A1-01 | Crit | API sem auth | api/index.js | Chamar verifyAuth + allowlist público + role-map |
| C1/A2-01 | Crit | service_role hardcoded | lib/*.js | **Owner: rotacionar no Supabase + env var**; remover literais |
| A2-02 | Crit | Senhas em texto puro em `usuarios_acessos.senha` | rtma_supabase.js:421 | Reconciliar (ver nota) → hash/bcrypt ou descontinuar |
| A1-02 | Crit | Auto-promoção a `distrito` (upsertUsuariosAcessos) | code.js:2067 | Auth + role; não confiar em `tipoAcesso` do cliente |
| A1-03 | Crit | Criar conta Auth com senha escolhida | code.js:1877 | Auth + role; senha só server-gen |
| A1-04 | Crit | Dump de PII sem auth (email/tel/restrição) | code.js:7172+ | Auth + escopo por clube do token |
| A2-04 | High | Injection PostgREST via `querySuffix` livre | portal_supabase.js:413 | Rejeitar/whitelist querySuffix |
| A2-05/06 | High | Injection em or-filter / id sem encode | rtma_supabase.js:259, funcao_match:199 | Validar clubes contra whitelist; encodeURIComponent em ids |
| A1-05..10 | High | Delete usuário/clube/pessoa, auto-aprovar, adulterar evento — tudo sem auth | vários | Auth + role-map |
| H1 | High | CORS `*` em /api | vercel.json + api/index.js | ALLOWED_ORIGIN específico |
| H2 | High | `xlsx` CVE (só export) | package.json | Migrar p/ exceljs (já é dep) |
| A3-01/02/03 | High | XSS (escapeHtmlContent não escapa aspas; Quill rich-text; ~centenas de innerHTML) | index.html | Helper único correto + sanitizar Quill + CSP |

## Médios/Baixos
Erros vazam schema (A2-12), endpoints sem escopo (A2-08/13/17), LockService no-op → inscrições duplicadas (A2-14), `Utilities.getUuid` não shimado → provisionamento quebra (A2-15), sem rate limit (M2), sem headers/CSP (M1/A3-04), sem `.vercelignore` (M3), `.gitignore` deixou .gs com a chave no histórico (L1), sem SRI nos 8 CDNs (A3-05).

## Notas que afetam o "manter tudo funcionando"
- **storageKey mismatch (A1-14):** `callGAS` lê `localStorage['sb-session']` que ninguém escreve → Bearer vai vazio hoje. Se ligar auth sem corrigir isso, **app inteiro retorna 401**. Tem que ser no mesmo deploy.
- **Reconciliar A1 vs A2 sobre senha:** A1 diz login = Supabase GoTrue (JWT real). A2 achou `buscarUsuarioNoSupabase` comparando `usuarios_acessos.senha` em texto puro. Precisa confirmar se esse caminho custom ainda é usado por alguma página (scanner/camisas?) antes de mexer — não quebrar login.
- **Bug funcional achado (A4):** rewrites `/rtma`, `/scanner`, `/camisas` retornam 404 em produção.
- **A2-15:** `Utilities.getUuid` não existe no shim → `provisionarAcessoPortalAposNominata` pode estar quebrado em runtime hoje.

## Ordem segura recomendada
1. **Owner:** rotacionar service_role no Supabase + setar env vars (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_ORIGIN`) na Vercel. (Sem isso, remover hardcode quebra o backend.)
2. Remover literais da chave → só `process.env` (depende do passo 1).
3. Fix auth API **+ storageKey juntos** (allowlist + verifyAuth + role-map), validado para não quebrar login/convidados/scanner.
4. Injection + escopo por clube + querySuffix.
5. XSS (helper + Quill + CSP) + headers + CORS.
6. Hash de senha (se caminho custom ativo) + rate limit + .vercelignore/.gitignore + exceljs.

## Progresso da implementação (branch security/hardening)
- [x] **Bug 1 (seletor vazio) — causa raiz real** (bridge cross-module global). JÁ EM PRODUÇÃO.
- [x] **C1/A2-01** service_role key → process.env (literal removido). *Falta owner rotacionar no Supabase.*
- [x] **C2/A1-01** auth obrigatória no /api + storageKey do token corrigido.
- [x] **Scanner/camisas** acesso por token de evento HMAC (não quebram com auth ligada).
  - Limitação v1 conhecida (Médio): token de um evento pode operar em outro evento (não amarra x-event-id ao eventoId do payload). Risco só de insider com link válido. Fix futuro: bindar header ao arg eventoId por ação.
- [ ] Pendente (Task 6, em sequência): injection PostgREST (querySuffix/or-filter/id encode), escopo por clube, CORS específico (ALLOWED_ORIGIN), headers/CSP, hash de senha (A2-02), rate limit, .vercelignore/.gitignore, migrar xlsx→exceljs.
- [ ] Frontend design (depois da segurança).

## Ação do OWNER (não automatizável por mim)
1. Rotacionar service_role key no painel Supabase (a antiga segue válida no histórico git até revogar).
2. Validar o preview antes de merge à produção (login muda de chave → todos relogam 1x).
