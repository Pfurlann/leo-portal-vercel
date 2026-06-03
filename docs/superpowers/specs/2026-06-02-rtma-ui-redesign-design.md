# LEO Portal — RTMA UI Redesign

**Data:** 2026-06-02  
**Escopo:** `public/rtma.html` + `public/index.html`  
**Restrição crítica:** apenas CSS e estrutura HTML dos componentes visuais — nenhuma lógica JS alterada  
**Abordagem:** CSS Variables Layer — tokens no `:root`, refatoração in place dos blocos CSS existentes

---

## 1. Design Tokens

Bloco `:root` adicionado no topo do `<style>` de **cada arquivo**. Todos os valores hardcoded dos componentes-alvo passam a usar variáveis.

### Border-radius

```css
:root {
  --radius-xs:  4px;    /* status badges, chips */
  --radius-sm:  6px;    /* tags, elementos de form */
  --radius-md:  8px;    /* botões, inputs, mini-blocos de stat */
  --radius-lg:  10px;   /* cards (pessoa-card, item-card) */
  --radius-xl:  12px;   /* containers internos */
  --radius-2xl: 16px;   /* modal-content principal */
}
```

Valor eliminado: `20px` (era badges) → substituído por `--radius-xs`. `50%` mantido só para dots circulares.

### Sombras

```css
:root {
  --shadow-xs: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-sm: 0 1px 4px rgba(0,0,0,0.08);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.10);
  --shadow-lg: 0 20px 56px rgba(0,0,0,0.18);
}
```

### Cores

Paleta existente mantida, só nomeada:

```css
:root {
  --color-text:       #212529;
  --color-text-2:     #495057;
  --color-text-muted: #6c757d;
  --color-text-faint: #adb5bd;
  --color-border:     #e9ecef;
  --color-border-2:   #dee2e6;
  --color-surface:    #f8f9fa;
  --color-white:      #ffffff;
}
```

Cores semânticas de badge (LEO amarelo, Pré-LEO rosa, etc.) **não mudam**.

---

## 2. Pessoa Card (`rtma.html`)

### Direção visual: Refined System
Hierarquia limpa, sem decoração. O dado fala, o card some.

### Mudanças de CSS

| Propriedade | Antes | Depois |
|---|---|---|
| `.tipo-badge` border-radius | `20px` | `var(--radius-xs)` |
| `.pessoa-card` border-radius | `12px` | `var(--radius-lg)` |
| `.pessoa-card` box-shadow | `0 1px 3px rgba(0,0,0,0.05)` | `var(--shadow-xs)` |
| `.pessoa-card:hover` box-shadow | `0 4px 12px rgba(0,0,0,0.1)` | `var(--shadow-md)` |
| `.btn-card` border-radius | `8px` | `var(--radius-md)` |

### Hierarquia refinada

- **Clube** (distrital/região): nova classe `.pessoa-clube` com `font-size: 10px; font-weight: 600; color: var(--color-text-faint); letter-spacing: 0.2px`. O `style=""` inline existente no JS é substituído por essa classe via mudança de `style.cssText` → `className`.
- **Ícones FA** do `.info-icon`: ganham `width: 12px; text-align: center` para alinhar a coluna verticalmente.
- **Info-icons**: `opacity: 0.6` → `color: var(--color-text-faint)`.

### Estado inativo

```css
.pessoa-card:has(.status-indicator.inativo) {
  opacity: 0.75;
}
```

Texto `(Inativo)` no nome permanece inserido pelo JS — sem alteração.

### Estado histórico

Badge `.tipo-badge.historico` mantém ícone `fa-clock` do JS. Remove o `::after` com emoji `🕒` (já substituído pelo ícone FA inline). Border `2px solid` mantido para diferenciação.

---

## 3. Galeria de Atividades/Campanhas (`index.html`)

### Direção visual: Compact Scan
Cards compactos, 4 por linha, stats em mini-blocos. Otimizado para varrer muitos itens.

### Grid

Classes reais no `index.html`: `.activities-grid` (atividades) e `.campaigns-grid` (campanhas).

```css
.activities-grid,
.campaigns-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;   /* era 20px — compact scan exige menos espaço entre cards */
}
```

### Item Card

| Propriedade | Antes | Depois |
|---|---|---|
| `.item-card` border-radius | `12px` | `var(--radius-lg)` |
| `.item-card` box-shadow | `0 1px 3px rgba(0,0,0,0.05)` | `var(--shadow-xs)` |
| `.item-card` min-height | `220px` | removido |
| `.item-card` max-height | `280px` | removido |
| Status badge border-radius | `20px` | `var(--radius-xs)` |

### Header do card

Data: `text-transform: uppercase; font-size: 10px; font-weight: 700; letter-spacing: 0.3px`

### Estados de status

| Estado | Visual |
|---|---|
| Corrigido | badge `#16a34a / #f0fdf4 / #bbf7d0` |
| Pendente/Alerta | borda do card `1.5px solid #fecaca` + header `background: #fef2f2` + badge vermelho |
| Enviado/Normal | badge neutro cinza |
| Passado | `.item-card.passado { opacity: 0.6; }` |

### Stats mini-blocos

```css
.item-stat {
  flex: 1;
  text-align: center;
  background: #f8fafc;
  border-radius: var(--radius-md);
  padding: 5px 3px;
}
.item-stat-value { font-size: 13px; font-weight: 700; color: var(--color-text); }
.item-stat-label { font-size: 9px; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: 0.3px; }
```

### Card "Nova Atividade"

O `.new-item-card` dentro dos containers de atividades/campanhas é ocultado — o CTA fica só no toolbar/header:

```css
#atividadesContainer .new-item-card,
#campanhasContainer .new-item-card,
#atividades-list-secretaria .new-item-card,
#campanhas-list-filtradas .new-item-card {
  display: none;
}
```

---

## 4. Modal de Atividade/Campanha (`index.html`)

### Direção visual: Sectioned
Stats em destaque no topo, seções com label de grupo. Fácil de varrer verticalmente.

### Dimensões

```css
.modal-content {
  max-width: 680px;   /* era 1400px */
  border-radius: var(--radius-2xl);
}
```

### Estrutura de seções

```
modal-header      → título + subtítulo (clube · data) + status badge + botão fechar
modal-stats-strip → Participantes | Duração | Trimestre (strip horizontal)
modal-body
  modal-section: Identificação   → grid de células (tipo, AL, início, fim, local)
  modal-section: Presença        → grid horizontal (LEO, Pré-LEO, LEO/Leão, Conselheiro, Outros)
  modal-section: Descrição       → parágrafo
  modal-section: Foto Oficial    → só se linkFotoOficial existir
  [comentários via gerarSecaoComentarios() — sem alteração JS]
modal-footer      → botão Fechar
```

### CSS das seções

```css
.modal-stats-strip {
  display: flex;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}
.modal-stat {
  flex: 1; text-align: center; padding: 12px 8px;
  border-right: 1px solid var(--color-border);
}
.modal-stat:last-child { border-right: none; }
.modal-stat-value { display: block; font-size: 18px; font-weight: 800; color: var(--color-text); }
.modal-stat-label { display: block; font-size: 10px; color: var(--color-text-faint);
  text-transform: uppercase; letter-spacing: 0.4px; margin-top: 2px; }

.modal-section { padding: 16px 24px; border-bottom: 1px solid var(--color-border); }
.modal-section:last-child { border-bottom: none; }
.modal-section-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.8px; color: var(--color-text-faint); margin: 0 0 10px 0;
}
.modal-info-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px;
}
.modal-info-cell {
  background: var(--color-surface); border-radius: var(--radius-md); padding: 8px 10px;
}
.modal-info-cell-label { font-size: 10px; color: var(--color-text-faint); margin-bottom: 2px; }
.modal-info-cell-value { font-size: 13px; font-weight: 600; color: var(--color-text); }

.modal-presence-grid { display: flex; gap: 8px; flex-wrap: wrap; }
.modal-presence-cell {
  flex: 1; min-width: 70px; background: var(--color-surface);
  border-radius: var(--radius-md); padding: 8px; text-align: center;
}
```

### Emojis substituídos por FA icons

`📸 Foto Oficial` → `<i class="fas fa-image"></i> Foto Oficial`  
Demais emojis em seções de modal seguem o mesmo padrão.

### Modal de campanha

Mesma estrutura de seções. Campos específicos de campanha (sem presença individual detalhada) preenchidos nas células do `modal-info-grid`. Sem alteração JS.

---

## 5. Ordem de Implementação

1. **Tokens** — bloco `:root` em `rtma.html` e `index.html`
2. **Pessoa Card** — CSS de `.pessoa-card` e subcomponentes em `rtma.html`
3. **Item Card + Grid** — CSS de `.item-card`, grid e estados em `index.html`
4. **Modal** — estrutura HTML + CSS do modal de atividade e campanha em `index.html`
5. **Ajustes residuais** — border-radius espalhados, new-item-card `display:none`, emojis

Cada etapa é um commit isolado. Nenhuma etapa altera lógica JS.

---

## 6. O que NÃO muda

- Toda lógica JS (renderização de cards, modais, filtros, exportação)
- Cores semânticas de badge por tipo de membro
- Stats cards do topo (`.stats-card`)
- Estrutura de abas e navegação
- Funcionalidades de exportação Excel e relatórios
- Comportamento de modais (abertura, fechamento, navegação por teclado)
- Filtros de movimentação, AL, Trimestre, Clube
