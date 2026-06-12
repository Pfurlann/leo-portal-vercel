# Security Audit A4 — CONFIG / INFRA / DEPLOYMENT

**Date:** 2026-06-11  
**Auditor:** Claude Code (automated, read-only)  
**Production URL:** https://leo-portal-vercel.vercel.app  
**Repo:** /Users/pedrofurlan/Desktop/Projetos GAS/LEO Portal Vercel  
**Status:** COMPLETE

---

## Executive Summary

The API has zero authentication enforcement (`verifyAuth` is defined but never called) — any unauthenticated caller can invoke every backend function. Three deployed `lib/` files hardcode the Supabase `service_role` key directly in source; `lib/portal_supabase.js` has no env-var fallback, so the key is always the hardcoded one. Together these two findings give an unauthenticated attacker full read/write/delete access to the entire Supabase database, bypassing all RLS policies. `xlsx` has a high-severity CVE with no available fix. Security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) are absent on all HTML pages. No rate limiting exists on any endpoint including login and password-recovery flows.

---

## Findings Table

| ID | Severity | Title | Evidence | Fix |
|----|----------|-------|----------|-----|
| C1 | **CRITICAL** | Supabase `service_role` key hardcoded in deployed source | `lib/portal_supabase.js:18` — hardcoded, **no env-var fallback**. `lib/rtma_supabase.js:9` — fallback but still committed. `lib/code.js:64,88,309,711,780,908` — multiple inline copies. JWT payload: `role=service_role`, expiry 2036-01-10, project `bqkttaflhtsdkamgscnf`. Key bypasses all RLS policies. | **Rotate key immediately in Supabase Dashboard → API → Roll service_role key.** Remove all hardcoded copies. Set `SUPABASE_SERVICE_ROLE_KEY` env var in Vercel. Never commit secrets to git. |
| C2 | **CRITICAL** | API gateway has no authentication enforcement | `api/index.js`: `verifyAuth()` defined at line 42 but **never called** in the handler (lines 61–100). Every exported function in all `lib/*.js` modules is callable by any unauthenticated `POST /api` request. No action allowlist. | Call `verifyAuth(req)` at the top of the handler; return `401` if null. Add an action allowlist for functions that require elevated privilege. |
| H1 | **HIGH** | CORS wildcard on `/api/*` permits cross-origin unauthenticated API calls | `vercel.json` headers + `api/index.js:62`: `Access-Control-Allow-Origin: *`. OPTIONS preflight confirms `200` from `https://evil.com`. Any website can POST to the API. Amplifies C2. | Replace `*` with the specific front-end origin. Set `ALLOWED_ORIGIN=https://leo-portal-vercel.vercel.app` in Vercel env vars. |
| H2 | **HIGH** | `xlsx` HIGH CVE — Prototype Pollution + ReDoS, no fix available | `npm audit`: `xlsx *` — GHSA-4r6h-8v6p-xvw6 (Prototype Pollution) + GHSA-5pgg-2g8v-p4x9 (ReDoS). No fix available; package abandoned. `package.json`: `"xlsx": "^0.18.5"`. xlsx is used only for export generation (not parsing user uploads), which reduces but does not eliminate the Prototype Pollution risk via crafted data paths. | Replace `xlsx` with `exceljs` (already a dependency) for all XLSX generation. Remove `xlsx` from `package.json`. |
| M1 | **MEDIUM** | Security headers absent on HTML pages | `curl -sI https://leo-portal-vercel.vercel.app/` response: no `Content-Security-Policy`, no `X-Frame-Options`, no `X-Content-Type-Options`, no `Referrer-Policy`. Only `Strict-Transport-Security` is present (Vercel platform default). Clickjacking and MIME-sniffing attacks are possible. | Add a `headers` block in `vercel.json` for `source: "/(.*)"` with `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Content-Security-Policy` restricting script/connect sources. |
| M2 | **MEDIUM** | No rate limiting on any API endpoint | `api/index.js` has no rate-limiting middleware. Login, password recovery, and all data-mutation actions can be called without limit. Login brute-force and recovery-email spam are unrestricted. | Add Vercel Edge Middleware or a lightweight in-process store (e.g. `lru-cache`) to rate-limit by IP: ≤5 login attempts/min, ≤3 recovery emails/hr. |
| M3 | **MEDIUM** | No `.vercelignore` — large source backups deployed to CDN | `.vercelignore` does not exist. Files `code - funcional.gs` (742 KB), `index - funcional.html` (1.6 MB), `rtma_pessoas_funcional.gs` (181 KB), `lib/`, `docs/`, `.specstory/` are all bundled into every Vercel deployment. Currently inaccessible as static files (HTTP 404 for all probed paths), but any future routing change could expose full backend source. Wastes deploy bandwidth/cold-start time. | Create `.vercelignore` (exact content below). |
| L1 | **LOW** | `.gitignore` inadequate — backup source files committed | `.gitignore` does not exclude `*.gs`, `index - funcional.html`, `.specstory/`, `.vscode/`, `.cursorindexingignore`. All committed. `code - funcional.gs` and `rtma_pessoas_funcional.gs` contain hardcoded service_role keys (see C1). Git history preserves them even after removal. | Extend `.gitignore` (content below). After removing secrets, run `git filter-repo` to purge from history. |
| L2 | **LOW** | `uuid` moderate CVE via `exceljs` | `npm audit`: `uuid <11.1.1` — GHSA-w5hq-g745-h8pq (missing buffer bounds check in v3/v5/v6). Fix available via `npm audit fix --force` (upgrades `exceljs` to 3.4.0 — breaking change). | Test and apply `npm install exceljs@^4.4.0` (check if upstream ships patched uuid first), or pin `uuid` resolutions in `package.json`. |

---

## Q1 — Source File Exposure on Production

All probed paths returned **HTTP 404**. No source files are publicly downloadable via static file serving.

| Path | HTTP Status | Risk |
|------|-------------|------|
| `/code%20-%20funcional.gs` | 404 | Not exposed |
| `/index%20-%20funcional.html` | 404 | Not exposed |
| `/rtma_pessoas_funcional.gs` | 404 | Not exposed |
| `/lib/code.js` | 404 | Not exposed (deployed as Node module only) |
| `/lib/portal_supabase.js` | 404 | Not exposed (deployed as Node module only) |
| `/package.json` | 404 | Not exposed |
| `/vercel.json` | 404 | Not exposed |
| `/docs/` | 404 | Not exposed |
| `/.specstory/` | 404 | Not exposed |
| `/.gitignore` | 404 | Not exposed |
| `/js/callGAS.js` | **200** | Intended — client-side helper |

Note: `lib/` files are deployed as Node.js serverless modules (required by `api/index.js`) and serve HTTP 404 as static assets. They are in the Vercel deployment bundle but not downloadable. Nonetheless, the service_role key in them is exposed in the git repo (C1).

Note 2: `public/rtma.html`, `public/index.html`, etc. are correctly accessible at `/rtma.html`, `/index.html` (Vercel strips the `public/` prefix for static serving). The rewrite rules for `/rtma`, `/scanner`, `/camisas` currently return 404 — a routing bug unrelated to security.

---

## Q2 — Secrets in Repo

**Supabase project:** `bqkttaflhtsdkamgscnf.supabase.co`

| Secret | Location | Status |
|--------|----------|--------|
| `service_role` JWT (hardcoded, no fallback) | `lib/portal_supabase.js:18` | CRITICAL — always active |
| `service_role` JWT (fallback) | `lib/rtma_supabase.js:9` | CRITICAL — active if env var unset |
| `service_role` JWT (inline) | `lib/code.js:64,88,309,711,780,908` | CRITICAL |
| `anon` JWT | `public/*.html` (multiple) | Acceptable — anon key is designed for client-side use |
| `.env` files ever committed | None found (`git log --diff-filter=A`) | OK |
| `.vercel/project.json` committed | Not tracked (`git ls-files .vercel/` empty) | OK |

---

## Q3 — Security Headers

Tested against `https://leo-portal-vercel.vercel.app/` and `/api/`.

| Header | Main page `/` | `/api/*` | Required |
|--------|--------------|---------|---------|
| `Strict-Transport-Security` | ✓ present (Vercel default) | ✓ | ✓ |
| `Content-Security-Policy` | ✗ absent | ✗ | ✓ |
| `X-Frame-Options` | ✗ absent | N/A | ✓ |
| `X-Content-Type-Options` | ✗ absent | ✗ | ✓ |
| `Referrer-Policy` | ✗ absent | ✗ | ✓ |
| `Access-Control-Allow-Origin` | `*` (inherited) | `*` | Should restrict |

OPTIONS preflight on `/api/` from `Origin: https://evil.com` → **200 + `Access-Control-Allow-Origin: *`**. Confirmed wildcard.

---

## Q4 — Rate Limiting / Brute Force

`api/index.js` has **zero rate limiting**. No middleware, no token bucket, no per-IP counter. The `verifyAuth` helper is defined but never invoked. Login attempts and password-recovery email dispatch can be made at unlimited speed from any origin.

---

## Q5 — Dependencies

```
xlsx  *        HIGH   Prototype Pollution (GHSA-4r6h-8v6p-xvw6)
               HIGH   ReDoS (GHSA-5pgg-2g8v-p4x9)
               No fix available — package abandoned

exceljs ≥3.5   MODERATE  via uuid <11.1.1 (GHSA-w5hq-g745-h8pq)
               Fix: npm audit fix --force (breaking change)
```

**xlsx usage pattern:** export-only (generating XLSX reports for download). No `xlsx.read()` or user-upload parsing found. Prototype Pollution risk is reduced but not zero — crafted object keys in data being serialised can still trigger it.

---

## Q6 — Hygiene

| Check | Status | Notes |
|-------|--------|-------|
| `.vercelignore` | ✗ Missing | All root files deployed to Vercel CDN |
| `.env` committed | ✓ Not committed | `.gitignore` correctly excludes `.env*.local` |
| `.vercel/` committed | ✓ Not tracked | `git ls-files .vercel/` returned empty |
| Backup `.gs` files in git | ✗ Present | `code - funcional.gs`, `rtma_pessoas_funcional.gs` committed with service_role keys embedded |
| `.gitignore` adequacy | ✗ Inadequate | Does not exclude `*.gs`, `index - funcional.html`, `.specstory/`, `.vscode/` |

---

## Fix Assets

### `.vercelignore` (create at repo root)

```
# Source backups — not part of the web app
code - funcional.gs
index - funcional.html
rtma_pessoas_funcional.gs

# Dev/tooling directories
.specstory/
.vscode/
.claude/
.superpowers/
.cursorindexingignore
docs/

# Node
node_modules/
```

### `.gitignore` additions

```
# Source backup files (contain hardcoded secrets)
*.gs
index - funcional.html

# Tooling/IDE
.specstory/
.vscode/
.cursorindexingignore
```

### `vercel.json` header addition (add to `headers` array)

```json
{
  "source": "/(.*)",
  "headers": [
    { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self' https://bqkttaflhtsdkamgscnf.supabase.co; img-src 'self' data: https:; font-src 'self' data:;" }
  ]
}
```

*(Tune CSP `unsafe-inline` / additional CDN sources after auditing actual script/style origins.)*

---

## Severity Count

| Severity | Count |
|----------|-------|
| CRITICAL | 2 (C1, C2) |
| HIGH | 2 (H1, H2) |
| MEDIUM | 3 (M1, M2, M3) |
| LOW | 2 (L1, L2) |
| **Total** | **9** |

## Immediate Actions (ordered by impact)

1. **Rotate the service_role key now** (Supabase Dashboard → Settings → API → Roll service_role). Old key in git history will be invalidated.
2. **Set `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` in Vercel env vars.** Remove all hardcoded values from `lib/` files.
3. **Add `verifyAuth` call at the top of the `api/index.js` handler.** Return 401 before loading backend.
4. **Restrict `ALLOWED_ORIGIN`** in Vercel env to the production domain.
5. Create `.vercelignore` and `.gitignore` additions (content above).
6. Add security headers to `vercel.json`.
7. Replace `xlsx` with `exceljs` for generation.
