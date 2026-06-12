# Proposta de Modernização Visual — LEO Portal LD-8

> Read-only. Direção de design + tokens concretos. Implementação após o merge de segurança (evita editar `index.html` em duas frentes).

## Diagnóstico do estado atual

| Aspecto | Hoje | Problema |
|---|---|---|
| Tipografia | system-ui / Segoe UI / "Google Sans"/Roboto | Sem fonte de display; cara de template genérico |
| Cor | Bootstrap 5 default (#6c757d, #212529, #dc3545, #28a745, #0d6efd) | Paleta de admin padrão, sem identidade |
| Marca | navy #002060 subusado; dourado #ffc107 esparso | Identidade LEO/Lions (azul+dourado) desperdiçada |
| Gradientes | 12+ desconexos, incl. clichê roxo `#667eea→#764ba2` | Inconsistência visual, "cara de IA" |
| Base | já existe sistema de tokens `--color-*`, `--radius-*`, `--shadow-*` | **Ótima notícia**: facelift = retunar tokens, não reescrever |

**Conclusão-chave:** o portal já tem uma base de design tokens em CSS variables. 70% da modernização é **trocar os valores desses tokens + tipografia**, não reescrever componentes. Baixo risco pro "manter tudo funcionando".

## Direção: "Civic Modern" — institucional refinado

O LEO é o braço jovem do Lions Clubs (serviço comunitário). É um portal **oficial de distrito**, usado por dirigentes de clube. O tom certo não é playful nem brutalist — é **cívico, confiável, com um toque de prestígio**: pense em govtech bem-feito ou portal de associação séria. Identidade **azul-tinta + dourado Lions**, estrutura editorial, respiro generoso.

A coisa memorável: a identidade **navy + dourado** consistente (hoje ausente) + um detalhe de assinatura (filete dourado fino no topo de cards-chave e no header da sidebar com monograma "LD-8").

## Tipografia

Par distinto e profissional (via Google Fonts, com `font-display: swap`):
- **Display/títulos:** `Fraunces` — serifa variável com gravitas e calor, "optical sizing". Dá ar editorial/institucional sem ser engessado. (alternativa: `Newsreader`)
- **Corpo/UI:** `Public Sans` — grotesca aberta, neutra, desenhada para uso cívico (gov US). Não é Inter/Roboto. Legível em densidade de dados.
- **Números/tabelas:** ativar `font-variant-numeric: tabular-nums` (o portal é data-heavy).

## Paleta (novos valores dos tokens existentes)

```css
/* Marca */
--brand-ink:        #0A2342;  /* navy profundo (substitui #002060) */
--brand-ink-2:      #08203E;  /* navy mais escuro p/ gradiente assinatura */
--brand-gold:       #E8B431;  /* dourado Lions (ações-chave, indicadores ativos) */
--brand-gold-soft:  #F4D58D;

/* Neutros — leve calor (papel), mais premium que cinza Bootstrap */
--color-bg:         #FAF9F6;  /* fundo papel quente */
--color-surface:    #FFFFFF;
--color-border:     #E7E3DA;  /* hairline quente */
--color-text:       #1A1F2B;  /* tinta, não preto puro */
--color-text-muted: #5B6472;

/* Semânticos — dessaturar do Bootstrap p/ harmonizar */
--ok:    #2E7D5B;  --warn: #C9971C;  --danger: #C0473E;  --info: #2D6E8E;

/* Sombras tingidas de navy (em vez de preto puro) */
--shadow-sm: 0 1px 2px rgba(10,35,66,.06);
--shadow-md: 0 6px 18px rgba(10,35,66,.10);
--shadow-lg: 0 24px 56px rgba(10,35,66,.16);
```

**Regra de ouro:** dourado é **acento escasso** (CTA principal, item de nav ativo, filete de assinatura), nunca preenchimento grande. Navy domina; dourado pontua.

## Gradientes

Matar os 12 gradientes aleatórios (incl. o roxo). **Um** gradiente de assinatura só: `linear-gradient(135deg, var(--brand-ink), var(--brand-ink-2))` para sidebar/hero/login. Botões = cor sólida + estado hover, sem gradiente.

## Componentes (refinos sobre as classes existentes)

- **btn-primary:** navy sólido, texto branco, raio 8px, foco com anel dourado (`box-shadow: 0 0 0 3px var(--brand-gold-soft)`). Hover: leve escurecer + elevação sombra-sm.
- **btn-secondary:** outline hairline + texto tinta; hover preenche superfície.
- **Cards:** borda hairline + `--shadow-sm`, padding maior (20–24px), raio 12px. Cards-chave (KPIs) ganham filete dourado de 3px no topo.
- **Sidebar/nav:** fundo navy, item ativo com barra dourada à esquerda + peso. Ícones consistentes.
- **Tabs:** indicador de sublinhado dourado que desliza (transição 180ms).
- **Tabelas (prioridade — app é data-heavy):** sem zebra; bordas hairline; cabeçalho sticky em navy claro; `tabular-nums`; linhas com hover suave.
- **Login (primeira impressão):** fundo gradiente navy de assinatura, card branco centrado, monograma LD-8 dourado, tipografia Fraunces no título. Define o tom do portal inteiro.

## Espaçamento & escala

- Grid base 8px. Escala de tipo clara (ex.: 12/14/16/20/28/40). Consolidar raio para 3 níveis (6/10/14) em vez de 6 atuais. Respiro maior entre seções.

## Movimento (contido)

- Load do dashboard: fade-up escalonado dos cards (`animation-delay` 40ms incremental). Transições 150–200ms. Sublinhado dourado deslizando em nav/tabs. Nada de bounce/toy.

## Plano de implementação (pós-merge de segurança)

1. **Fase 1 — Tokens + tipografia (maior impacto, menor risco):** trocar valores das CSS variables existentes + adicionar links de fonte + `tabular-nums`. ~80% do efeito visual. Não mexe em estrutura/JS.
2. **Fase 2 — Componentes-chave:** botões, cards, sidebar, tabs, tabelas (refino de classes existentes).
3. **Fase 3 — Login + detalhes de assinatura:** tela de login, filetes dourados, monograma, micro-motion.
4. **Fase 4 — Consistência nas outras páginas** (rtma.html, scanner, camisas, recuperar/redefinir senha) reusando os mesmos tokens.

Cada fase é incremental e validável isoladamente. Como o portal já usa tokens, a Fase 1 sozinha já transforma a percepção sem tocar funcionalidade.

## Riscos / notas

- O `index.html` tem ~20k linhas com CSS inline; a troca de tokens é segura, mas há estilos inline soltos que podem precisar de ajuste pontual.
- Conflito de edição: implementar só depois do merge de `security/hardening` (e da reconciliação com as mudanças concorrentes do Cursor em `lib/`).
- Acessibilidade: garantir contraste AA do dourado sobre branco (usar dourado só em navy ou em texto grande/ícones, nunca texto pequeno dourado sobre branco).
