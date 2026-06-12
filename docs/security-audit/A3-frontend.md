# A3 — Frontend XSS & Client-Side Trust Audit

**Scope:** public/*.html, public/js/callGAS.js
**Date:** 2026-06-11
**Status:** COMPLETE (rewritten by controller after subagent hit session limit)

---

## Executive Summary

The app is HTML-string-driven: ~391 `innerHTML` + 48 `insertAdjacentHTML` sinks in index.html alone, 96 in rtma.html, plus scanner/camisas/form pages. Two escape helpers exist (`escapeHtmlAttr`, `escapeHtmlContent`) and are used ~270 times, but coverage is partial and one helper is unsafe in attribute context. User-controlled Supabase fields (nomes, descrições de campanha/atividade via Quill rich-text, justificativas, comentários, restrição alimentar) flow into templates, several without escaping → stored XSS that fires in other users'/admins' sessions. No CSP and no SRI on 8 external CDN scripts compound the impact. Combined with A1 (no API auth) an attacker can write malicious content to any club's records and have it execute in a district admin's browser.

---

## Sink Statistics

| File | innerHTML | insertAdjacentHTML | other |
|------|-----------|--------------------|-------|
| index.html | 391 | 48 | 1 document.write |
| rtma.html | ~96 (combined) | | |
| scanner_refeicoes.html | ~19 | | |
| camisas_enumeradas.html | ~7 | | |
| form_evento_convidados.html | ~5 | | |
| redefinir_senha.html / recuperar_senha.html | 0 | 0 | (safest pages) |

Escape-helper usage in index.html: `escapeHtmlAttr` ×153, `escapeHtmlContent` ×118. Of ~148 `innerHTML = \`...\`` template-literal assignments, many interpolate data without an escape call on the line.

---

## Findings Table

| ID | Severity | Title | File:Line | Evidence | Exploit | Fix |
|----|----------|-------|-----------|----------|---------|-----|
| A3-01 | HIGH | `escapeHtmlContent` does NOT escape quotes — unsafe in attribute context | index.html:7688 | Replaces only `& < >`, not `"` `'` | Any value passed through `escapeHtmlContent` but placed inside an HTML attribute (`title="${escapeHtmlContent(x)}"`) allows `"` breakout → `onmouseover=` injection | Make `escapeHtmlContent` escape quotes too, or audit every attribute interpolation to use `escapeHtmlAttr`. Unify into one correct helper. |
| A3-02 | HIGH | Stored XSS via Quill rich-text descriptions rendered unescaped | index.html:14180, 14263 | `${(campanha.descricaoTexto \|\| campanha.objetivo \|\| '').substring(0,150)}` injected into innerHTML, no escape | A user saves a campanha/atividade whose `descricaoTexto` contains `<img src=x onerror=...>`; renders in any viewer's dashboard | Escape at render, OR sanitize Quill HTML server-side (allowlist tags) and treat as trusted; never `.substring` raw HTML into innerHTML. |
| A3-03 | HIGH | Hundreds of unescaped template-literal interpolations into innerHTML | index.html (≈148 `innerHTML=\`` lines, subset unescaped) | grep shows interpolations of `evento.nome`, list rows, etc. without escape | Field-by-field stored XSS where any low-privilege user controls the value (nome de pessoa/clube/evento, restrição alimentar) | Adopt a single render-time escape helper and a lint pass; fix the worst data-bound lists first (relatórios de inscritos, listas de pessoas, campanhas/atividades). |
| A3-04 | HIGH | No CSP header — nothing contains an XSS once it fires | (no meta CSP in any page; see A4 for header) | No `Content-Security-Policy` meta or header | Any of the above XSS runs with full privilege, can call `/api` with the victim's (absent) token / exfiltrate localStorage | Add CSP (script-src self + pinned CDNs, no inline-eval ideally; at minimum frame-ancestors + object-src none). Defense-in-depth. |
| A3-05 | MEDIUM | 8 external CDN scripts without Subresource Integrity (SRI) | index.html `<head>` (supabase-js, chart.js, quill, cleave, xlsx-js-style, html5-qrcode, qrcode, datalabels) | `<script src="https://cdn.jsdelivr.net/...">` no `integrity=` | CDN compromise or MITM injects arbitrary JS into every session | Add `integrity` + `crossorigin` to each, or self-host pinned versions. |
| A3-06 | MEDIUM | `onclick="fn('${encodeURIComponent(x)}')"` pattern relies on encode for quote safety | index.html (Trocar buttons etc.) | Values encoded with encodeURIComponent inside single-quoted onclick | encodeURIComponent neutralizes quotes so generally safe, BUT any sibling attr built with `escapeHtmlContent` (A3-01) in same tag can break out | Prefer addEventListener + dataset over inline onclick; if keeping, ensure every attr in the tag uses a quote-escaping helper. |
| A3-07 | MEDIUM | Client-only permission gating (button hiding) | index.html `aplicarPermissoesPorTipoAcesso`, flags `isDistrital`/`isEventos`/`tipoAcesso` | UI hidden via JS flags an attacker flips in DevTools | Reveals/enables admin UI; real damage requires backend, but backend has NO authz (A1) → full escalation | Server-side authorization (A1 fix) is the real control; treat client flags as cosmetic only. |
| A3-08 | LOW | Token storage key mismatch leaves Bearer empty (also A1-14) | public/js/callGAS.js:8 | reads `localStorage['sb-session']` / `'supabase.auth.token'`; nothing writes `sb-session` | Not an XSS, but means the planned auth enforcement (A1) will reject all calls unless the frontend writes the token under the expected key — must fix together | When wiring auth, persist the GoTrue session under the key callGAS reads (or update callGAS to read supabase-js's actual storage key). |
| A3-09 | LOW | `document.write` present | index.html (1 occurrence) | legacy sink | Low risk if argument is static; verify it interpolates nothing user-controlled | Replace with DOM API. |

---

## Remediation Strategy (pragmatic for a 20k-line single-file SPA)

1. **One correct escape helper.** Fix `escapeHtmlContent` to also escape `"` and `'` (or route all content through `escapeHtmlAttr`-strength escaping). Single source of truth. Low effort, broad coverage.
2. **Quill content (A3-02) is the highest-value stored-XSS vector** — sanitize server-side on save (tag allowlist) so it's safe to render, and stop `.substring`-ing raw HTML.
3. **Targeted fixes** for the data-bound list renderers that show cross-club/cross-user content to admins (relatórios de inscritos, listas de pessoas, campanhas/atividades) — these are where a low-privilege attacker's input reaches a district admin.
4. **CSP + SRI** as defense-in-depth (A3-04/05): pin the 8 CDNs with integrity hashes, add a CSP that blocks inline event handlers eventually (note: current inline `onclick=` usage means a strict `script-src` needs migration first — stage it).
5. Depends on **A1** (server-side authz) to make client-flag tampering (A3-07) harmless.
