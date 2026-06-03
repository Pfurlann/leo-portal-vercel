# RTMA UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refinar o design de cards de pessoas, galeria de atividades/campanhas e modais via CSS Variables Layer — zero alteração em lógica JS.

**Architecture:** Bloco `:root` com tokens CSS adicionado no topo do `<style>` de cada arquivo. Cada componente-alvo tem seus valores hardcoded substituídos pelos tokens in place. A estrutura HTML do modal de atividade/campanha é refatorada dentro da string JS que o gera, usando as novas classes CSS.

**Tech Stack:** HTML/CSS puro, Font Awesome 6.5.1, sistema monolítico (`public/rtma.html` ~13k linhas, `public/index.html` ~40k linhas)

---

## Mapa de arquivos

| Arquivo | O que muda |
|---|---|
| `public/rtma.html` | `:root` tokens (L17), CSS `.pessoa-card` (L1457–1651), classe `.pessoa-clube` nova, `.tipo-badge.historico::after` removido |
| `public/index.html` | `:root` tokens (~L216), CSS `.activities-grid`/`.campaigns-grid` (L1971–1982), `.item-card` (L1122–1134 e L1983–1996), `.item-date` (L1572), `.item-stat*` (L1601–1625), `.modal-content` (L2680), CSS modal sections novo, HTML template em `visualizarAtividadeModal` (L32996–33091) e equivalente de campanha |

---

## Task 1: Tokens CSS — `rtma.html`

**Files:**
- Modify: `public/rtma.html:17` (logo após `<style>`)

- [ ] **Inserir bloco `:root` no início do `<style>` de `rtma.html`**

Localizar a linha `* { box-sizing: border-box; }` (L18) e inserir antes dela:

```css
    :root {
      --radius-xs:  4px;
      --radius-sm:  6px;
      --radius-md:  8px;
      --radius-lg:  10px;
      --radius-xl:  12px;
      --radius-2xl: 16px;

      --shadow-xs: 0 1px 2px rgba(0,0,0,0.05);
      --shadow-sm: 0 1px 4px rgba(0,0,0,0.08);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.10);
      --shadow-lg: 0 20px 56px rgba(0,0,0,0.18);

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

- [ ] **Verificar que o arquivo abre sem erro de sintaxe**

Abrir `http://localhost:3000` (ou o servidor local) e conferir que a página carrega normalmente.

- [ ] **Commit**

```bash
git add public/rtma.html
git commit -m "style: adicionar CSS tokens :root em rtma.html"
```

---

## Task 2: Tokens CSS — `index.html`

**Files:**
- Modify: `public/index.html:216` (após comentário `/* === NAV DROPDOWN */`)

- [ ] **Inserir bloco `:root` no início do `<style>` de `index.html`**

Localizar `* { box-sizing: border-box; }` (próximo de L210) e inserir antes:

```css
    :root {
      --radius-xs:  4px;
      --radius-sm:  6px;
      --radius-md:  8px;
      --radius-lg:  10px;
      --radius-xl:  12px;
      --radius-2xl: 16px;

      --shadow-xs: 0 1px 2px rgba(0,0,0,0.05);
      --shadow-sm: 0 1px 4px rgba(0,0,0,0.08);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.10);
      --shadow-lg: 0 20px 56px rgba(0,0,0,0.18);

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

- [ ] **Verificar que o portal carrega sem erro**

Abrir `index.html` no browser e navegar até módulo Atividades — conferir que cards aparecem normalmente.

- [ ] **Commit**

```bash
git add public/index.html
git commit -m "style: adicionar CSS tokens :root em index.html"
```

---

## Task 3: Pessoa Card — CSS (`rtma.html`)

**Files:**
- Modify: `public/rtma.html:1457–1651`

- [ ] **Substituir o bloco `.pessoa-card` até `.btn-card.danger:hover`**

Localizar L1457 (`.pessoa-card {`) até L1651 (fechamento de `.btn-card.danger:hover`) e substituir pelo bloco completo abaixo:

```css
    .pessoas-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
    }

    @media (min-width: 1400px) {
      .pessoas-grid {
        grid-template-columns: repeat(5, 1fr);
      }
    }

    .pessoa-card {
      background: var(--color-white);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      transition: all 0.2s ease;
      box-shadow: var(--shadow-xs);
      display: flex;
      flex-direction: column;
    }

    .pessoa-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }

    .pessoa-card:has(.status-indicator.inativo) {
      opacity: 0.75;
    }

    .pessoa-card-header {
      background: var(--color-surface);
      padding: 9px 13px;
      border-bottom: 1px solid #f1f5f9;
      display: flex;
      justify-content: space-between;
      align-items: center;
      min-height: 36px;
    }

    .tipo-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: var(--radius-xs);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: var(--color-white);
      border: 1px solid var(--color-border-2);
    }

    .tipo-badge.leo {
      background: #fff3cd;
      border-color: #ffc107;
      color: #856404;
    }

    .tipo-badge.leo-leao {
      background: #e9d8fd;
      border-color: #6f42c1;
      color: #44278b;
    }

    .tipo-badge.pre-leo {
      background: #fce4ec;
      border-color: #e91e63;
      color: #880e4f;
    }

    .tipo-badge.apenas-leao {
      background: #e3f2fd;
      border-color: #1976d2;
      color: #0d47a1;
    }

    .tipo-badge.conselheiro {
      background: #f3e5f5;
      border-color: #9c27b0;
      color: #6a1b9a;
    }

    .tipo-badge.amigo-leo {
      background: #e8f5e9;
      border-color: #4caf50;
      color: #2e7d32;
    }

    .tipo-badge.historico {
      background: linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%);
      border: 2px solid #ff9800;
      color: #e65100;
    }

    .status-indicator {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #198754;
      flex-shrink: 0;
    }

    .status-indicator.inativo {
      background: #dc3545;
    }

    .pessoa-card-body {
      padding: 12px 13px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .pessoa-clube {
      font-size: 10px;
      font-weight: 600;
      color: var(--color-text-faint);
      letter-spacing: 0.2px;
      margin-bottom: 2px;
    }

    .pessoa-nome {
      font-size: 14px;
      font-weight: 700;
      color: var(--color-text);
      margin: 0;
      line-height: 1.25;
    }

    .pessoa-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      color: var(--color-text-muted);
    }

    .info-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .info-icon {
      font-size: 10px;
      color: var(--color-text-faint);
      width: 12px;
      text-align: center;
      flex-shrink: 0;
    }

    .pessoa-card-actions {
      display: flex;
      gap: 6px;
      padding: 8px 13px;
      border-top: 1px solid #f1f5f9;
      background: var(--color-surface);
    }

    .btn-card {
      flex: 1;
      padding: 5px 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      background: transparent;
      color: var(--color-text-2);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      white-space: nowrap;
    }

    .btn-card:hover {
      background: var(--color-surface);
      border-color: var(--color-border-2);
      transform: translateY(-1px);
    }

    .btn-card.primary {
      background: transparent;
      color: var(--color-text-2);
      border-color: var(--color-border);
    }

    .btn-card.primary:hover {
      background: #eef2f7;
      border-color: #d0d7de;
    }

    .btn-card.danger {
      background: transparent;
      color: #b02a37;
      border-color: rgba(176, 42, 55, 0.25);
    }

    .btn-card.danger:hover {
      background: rgba(176, 42, 55, 0.08);
      border-color: rgba(176, 42, 55, 0.35);
    }
```

- [ ] **Remover o `::after` com emoji do badge histórico**

Localizar e apagar o bloco (por volta de L1537 no arquivo original, antes da edição):

```css
    .tipo-badge.historico::after {
      content: "🕒";
      position: absolute;
      top: -8px;
      right: -8px;
      font-size: 10px;
      background: #ff9800;
      border-radius: 50%;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
```

- [ ] **Atualizar o estilo inline do clube no JS**

Localizar em `rtma.html` (~L6742):

```js
      clubeDiv.style.cssText = 'font-size: 12px; color: #6b7280; font-weight: 600; margin-bottom: 5px;';
```

Substituir por:

```js
      clubeDiv.className = 'pessoa-clube';
```

- [ ] **Verificar visualmente**

Abrir rtma.html no browser, carregar lista de pessoas. Conferir:
- Cards com badge em pill retangular (4px radius)
- Cards inativos com opacity 0.75
- Nome do clube em cinza claro acima do nome (visão distrital)
- Ícones FA alinhados verticalmente

- [ ] **Commit**

```bash
git add public/rtma.html
git commit -m "style: refinar pessoa-card com tokens e hierarquia Refined System"
```

---

## Task 4: Item Card + Grid — CSS (`index.html`)

**Files:**
- Modify: `public/index.html:1122–1213` (`.item-card` principal)
- Modify: `public/index.html:1971–1996` (`.campaigns-grid` e `.activities-grid`)
- Modify: `public/index.html:1572–1625` (`.item-date`, `.item-stats`, `.item-stat*`)
- Modify: `public/index.html:1983–1996` (segundo bloco `.item-card` dentro de media query)

- [ ] **Substituir `.item-card` principal (L1122–1134)**

```css
    .item-card {
      background: var(--color-white);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      transition: all 0.2s ease;
      box-shadow: var(--shadow-xs);
      cursor: pointer;
      position: relative;
      display: flex;
      flex-direction: column;
    }
```

- [ ] **Substituir `.item-card:hover` (L1194)**

```css
    .item-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }
```

- [ ] **Substituir grid (L1971–1982)**

```css
    .campaigns-grid,
    .activities-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }
```

- [ ] **Atualizar `.item-card-header` (L1199)**

```css
    .item-card-header {
      background: var(--color-surface);
      padding: 8px 11px;
      border-bottom: 1px solid #f1f5f9;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
```

- [ ] **Atualizar `.item-date` (L1572)**

```css
    .item-date {
      font-size: 10px;
      font-weight: 700;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
```

- [ ] **Substituir `.item-stats` e `.item-stat*` (L1592–1625)**

```css
    .item-stats {
      display: flex;
      gap: 6px;
      margin-top: auto;
      padding-top: 10px;
    }

    .item-stat {
      flex: 1;
      text-align: center;
      background: #f8fafc;
      border-radius: var(--radius-md);
      padding: 5px 3px;
    }

    .item-stat-value {
      font-size: 13px;
      font-weight: 700;
      color: var(--color-text);
      display: block;
    }

    .item-stat-label {
      font-size: 9px;
      color: var(--color-text-faint);
      text-transform: uppercase;
      letter-spacing: 0.3px;
      display: block;
    }
```

- [ ] **Adicionar estado pendente/alerta e passado após `.item-card.corrigido` (próximo L2435)**

```css
    .item-card.alerta {
      border: 1.5px solid #fecaca;
    }

    .item-card.alerta .item-card-header {
      background: #fef2f2;
      border-bottom-color: #fecaca;
    }

    .item-card.passado {
      opacity: 0.6;
    }
```

- [ ] **Ocultar new-item-card duplicado nos containers de atividades/campanhas**

Adicionar após o bloco `.new-item-card-subtitle`:

```css
    #atividadesContainer .new-item-card,
    #campanhasContainer .new-item-card,
    #atividades-list-secretaria .new-item-card,
    #campanhas-list-filtradas .new-item-card {
      display: none;
    }
```

- [ ] **Atualizar segundo bloco `.item-card` dentro de media query (L1983)**

```css
    .item-card {
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-xs);
    }
```

- [ ] **Verificar visualmente**

Abrir `index.html`, ir ao módulo Atividades:
- Grid com 4 colunas e gap menor
- Cards sem min/max-height forçados
- Data em uppercase no header
- Stats em mini-blocos com fundo cinza suave
- Sem card dashed duplicando o botão "Nova Atividade"

- [ ] **Commit**

```bash
git add public/index.html
git commit -m "style: refinar item-card, grid compact scan e estados em index.html"
```

---

## Task 5: Modal Sectioned — CSS + HTML (`index.html`)

**Files:**
- Modify: `public/index.html:2680–2833` (CSS do modal)
- Modify: `public/index.html:32996–33091` (HTML template `visualizarAtividadeModal`)
- Modify: HTML template do modal de campanha (localizar via `visualizarCampanhaModal` ou similar)

- [ ] **Atualizar `.modal-content` (L2680)**

```css
    .modal-content {
      background: var(--color-white);
      border-radius: var(--radius-2xl);
      max-width: 680px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: var(--shadow-lg);
      animation: slideIn 0.3s ease;
    }
```

- [ ] **Adicionar CSS das novas classes de seção após `.modal-footer`**

```css
    .modal-title-group {
      flex: 1;
      min-width: 0;
    }

    .modal-subtitle {
      font-size: 12px;
      color: var(--color-text-muted);
      margin: 2px 0 0;
    }

    .modal-status-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: var(--radius-xs);
      flex-shrink: 0;
    }

    .modal-status-badge.corrigido {
      color: #16a34a;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
    }

    .modal-status-badge.pendente {
      color: #dc2626;
      background: #fef2f2;
      border: 1px solid #fecaca;
    }

    .modal-stats-strip {
      display: flex;
      border-top: 1px solid var(--color-border);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
    }

    .modal-stat {
      flex: 1;
      text-align: center;
      padding: 12px 8px;
      border-right: 1px solid var(--color-border);
    }

    .modal-stat:last-child {
      border-right: none;
    }

    .modal-stat-value {
      display: block;
      font-size: 18px;
      font-weight: 800;
      color: var(--color-text);
    }

    .modal-stat-label {
      display: block;
      font-size: 10px;
      color: var(--color-text-faint);
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-top: 2px;
    }

    .modal-section {
      padding: 16px 24px;
      border-bottom: 1px solid var(--color-border);
    }

    .modal-section:last-child {
      border-bottom: none;
    }

    .modal-section-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--color-text-faint);
      margin: 0 0 10px 0;
    }

    .modal-info-cells {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 8px;
    }

    .modal-info-cell {
      background: var(--color-surface);
      border-radius: var(--radius-md);
      padding: 8px 10px;
    }

    .modal-info-cell-label {
      font-size: 10px;
      color: var(--color-text-faint);
      margin-bottom: 2px;
    }

    .modal-info-cell-value {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text);
    }

    .modal-presence-grid {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .modal-presence-cell {
      flex: 1;
      min-width: 70px;
      background: var(--color-surface);
      border-radius: var(--radius-md);
      padding: 8px;
      text-align: center;
    }

    .modal-presence-cell-value {
      display: block;
      font-size: 16px;
      font-weight: 800;
      color: var(--color-text);
    }

    .modal-presence-cell-label {
      display: block;
      font-size: 10px;
      color: var(--color-text-faint);
      margin-top: 2px;
    }

    .modal-description-text {
      font-size: 13px;
      color: var(--color-text-2);
      line-height: 1.6;
      margin: 0;
    }
```

- [ ] **Substituir o `modalHtml` em `visualizarAtividadeModal` (L32996–33091)**

Localizar a linha `const modalHtml = \`` (~L32996) e substituir todo o template até o fechamento do backtick por:

```js
     const totalParticipantes = (parseInt(atividade.qtdPresentes) || 0)
       + (parseInt(atividade.qtdPreLeos) || 0)
       + (parseInt(atividade.qtdLeoLeao) || 0)
       + (parseInt(atividade.qtdAmigosConselheiros) || 0)
       + (parseInt(atividade.outrosLions) || 0);

     const statusClass = atividade.marcadoCorrigido ? 'corrigido' : 'pendente';
     const statusLabel = atividade.marcadoCorrigido ? '✓ Corrigido' : '⚠ Pendente';

     const modalHtml = `
       <div class="modal-overlay" onclick="fecharModal(event)">
         <div class="modal-content ${atividadesAtuais.length > 1 ? 'with-nav' : ''}" onclick="event.stopPropagation()" style="position: relative;">
           ${atividadesAtuais.length > 1 ? `
             <button class="modal-nav-btn modal-nav-prev" onclick="navegarAtividade(-1)" title="Atividade anterior">&#8249;</button>
             <button class="modal-nav-btn modal-nav-next" onclick="navegarAtividade(1)" title="Próxima atividade">&#8250;</button>
           ` : ''}

           <div class="modal-header">
             <div class="modal-title-group">
               <h2 class="modal-title">${atividade.titulo}</h2>
               <p class="modal-subtitle">${atividade.clube} · ${formatarDataBrasilia(atividade.dataInicio)}</p>
             </div>
             <span class="modal-status-badge ${statusClass}">${statusLabel}</span>
             <button class="modal-close" onclick="fecharModal()">&times;</button>
           </div>

           <div class="modal-stats-strip">
             <div class="modal-stat">
               <span class="modal-stat-value">${totalParticipantes}</span>
               <span class="modal-stat-label">Participantes</span>
             </div>
             <div class="modal-stat">
               <span class="modal-stat-value">${duracaoFormatada}</span>
               <span class="modal-stat-label">Duração</span>
             </div>
             <div class="modal-stat">
               <span class="modal-stat-value">T${atividade.trimestre}</span>
               <span class="modal-stat-label">Trimestre</span>
             </div>
           </div>

           <div class="modal-body">
             <div class="modal-section">
               <h4 class="modal-section-label">Identificação</h4>
               <div class="modal-info-cells">
                 <div class="modal-info-cell">
                   <div class="modal-info-cell-label">Tipo</div>
                   <div class="modal-info-cell-value">${atividade.tipoAtividade}</div>
                 </div>
                 <div class="modal-info-cell">
                   <div class="modal-info-cell-label">AL</div>
                   <div class="modal-info-cell-value">${atividade.al}</div>
                 </div>
                 <div class="modal-info-cell">
                   <div class="modal-info-cell-label">Início</div>
                   <div class="modal-info-cell-value">${dataInicio}</div>
                 </div>
                 <div class="modal-info-cell">
                   <div class="modal-info-cell-label">Fim</div>
                   <div class="modal-info-cell-value">${dataFim}</div>
                 </div>
                 <div class="modal-info-cell">
                   <div class="modal-info-cell-label">Local</div>
                   <div class="modal-info-cell-value">${atividade.localAtividade}</div>
                 </div>
               </div>
             </div>

             <div class="modal-section">
               <h4 class="modal-section-label">Presença detalhada</h4>
               <div class="modal-presence-grid">
                 <div class="modal-presence-cell">
                   <span class="modal-presence-cell-value">${parseInt(atividade.qtdPresentes) || 0}</span>
                   <span class="modal-presence-cell-label">LEO</span>
                 </div>
                 <div class="modal-presence-cell">
                   <span class="modal-presence-cell-value">${parseInt(atividade.qtdPreLeos) || 0}</span>
                   <span class="modal-presence-cell-label">Pré-LEO</span>
                 </div>
                 <div class="modal-presence-cell">
                   <span class="modal-presence-cell-value">${parseInt(atividade.qtdLeoLeao) || 0}</span>
                   <span class="modal-presence-cell-label">LEO/Leão</span>
                 </div>
                 <div class="modal-presence-cell">
                   <span class="modal-presence-cell-value">${parseInt(atividade.qtdAmigosConselheiros) || 0}</span>
                   <span class="modal-presence-cell-label">Conselheiro</span>
                 </div>
                 <div class="modal-presence-cell">
                   <span class="modal-presence-cell-value">${parseInt(atividade.outrosLions) || 0}</span>
                   <span class="modal-presence-cell-label">Outros</span>
                 </div>
               </div>
             </div>

             <div class="modal-section">
               <h4 class="modal-section-label">Descrição</h4>
               <p class="modal-description-text">${atividade.descricaoTexto}</p>
             </div>

             ${atividade.linkFotoOficial ? `
             <div class="modal-section">
               <h4 class="modal-section-label"><i class="fas fa-image"></i> Foto Oficial</h4>
               <div class="modal-image-container">
                 <img id="modal-atividade-img"
                      src="${atividade.linkFotoOficial}"
                      alt="Foto Oficial"
                      style="width: 100%; max-height: 400px; object-fit: contain; border-radius: var(--radius-md); cursor: pointer;"
                      data-url="${atividade.linkFotoOficial}" onclick="abrirImagemFullscreen(this.dataset.url)"
                      onerror='this.style.display="none"; this.parentElement.innerHTML="<div style=&apos;padding: 20px; color: #999; text-align: center;&apos;>Erro ao carregar imagem</div>"'>
               </div>
             </div>
             ` : ''}

             ${gerarSecaoComentarios(atividade, 'atividade')}
           </div>

           <div class="modal-footer">
             <button onclick="fecharModal()">Fechar</button>
           </div>
         </div>
       </div>
     `;
```

- [ ] **Localizar e atualizar modal de campanha com a mesma estrutura**

Buscar a função que gera o modal de campanha (`visualizarCampanhaModal` ou similar) e aplicar a mesma estrutura de seções. Os campos específicos de campanha vão nas células do `modal-info-cells`. A seção "Presença detalhada" é omitida se a campanha não tiver campos de presença individual.

- [ ] **Verificar modal de atividade**

Clicar em uma atividade. Conferir:
- Modal com `max-width: 680px`
- Stats strip com total, duração, trimestre
- Seções Identificação / Presença / Descrição com label uppercase
- Foto Oficial com ícone FA (sem emoji)
- Navegação por setas mantida

- [ ] **Commit**

```bash
git add public/index.html
git commit -m "style: modal atividade/campanha sectioned com stats strip e seções agrupadas"
```

---

## Task 6: Ajustes residuais e limpeza

**Files:**
- Modify: `public/rtma.html` — border-radius residuais
- Modify: `public/index.html` — border-radius residuais, segundo bloco `.item-card`

- [ ] **Auditar border-radius hardcoded restantes em `rtma.html`**

```bash
grep -n "border-radius:" public/rtma.html | grep -v "var(--radius\|50%\|0px\|0 "
```

Para cada ocorrência nos componentes-alvo (não tocar em `.stats-card`, `.modal-filtros`, filtros), substituir pelo token correspondente seguindo a escala definida.

- [ ] **Auditar border-radius hardcoded restantes em `index.html`**

```bash
grep -n "border-radius:" public/index.html | grep -v "var(--radius\|50%\|0px\|0 " | grep -v "modal-filtros\|stats-card\|ranking\|eventos-galeria"
```

Substituir pelos tokens nos componentes-alvo.

- [ ] **Verificar que o segundo bloco `.item-card` (L1983) não conflita**

```bash
grep -n "\.item-card" public/index.html | grep -v "//\|function\|querySelector\|getElementById" | head -20
```

Confirmar que `border-radius` e `box-shadow` do segundo bloco apontam para variáveis.

- [ ] **Smoke test final**

1. Abrir `rtma.html` — carregar pessoas (visão clube e visão distrital)
2. Abrir `index.html` — navegar para Atividades, clicar em card, abrir modal
3. Navegar para Campanhas, repetir
4. Abrir modal de pessoa via "Detalhes"
5. Confirmar zero JS errors no console do browser

- [ ] **Commit final**

```bash
git add public/rtma.html public/index.html
git commit -m "style: ajustes residuais de border-radius e tokens uniformizados"
```

---

## Self-Review do Plano

**Spec coverage:**
- ✅ Design tokens `:root` — Tasks 1 e 2
- ✅ Pessoa card Refined System — Task 3
- ✅ `.pessoa-clube` classe e alinhamento de ícones — Task 3
- ✅ Estado inativo com opacity — Task 3
- ✅ Badge histórico sem `::after` emoji — Task 3
- ✅ Grid compact scan 4 colunas / 10px gap — Task 4
- ✅ Item card sem min/max-height — Task 4
- ✅ Estados corrigido/pendente/passado — Task 4
- ✅ new-item-card ocultado nos containers — Task 4
- ✅ Modal max-width 680px — Task 5
- ✅ Modal stats strip — Task 5
- ✅ Modal sections (Identificação, Presença, Descrição, Foto) — Task 5
- ✅ Emoji → FA icon — Task 5
- ✅ Modal de campanha — Task 5
- ✅ Ajustes residuais — Task 6
