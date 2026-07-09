# Cadastro de Diretoria em Lote — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar cadastro de diretoria em lote (clube + Gabinete), ler os Anos Leonísticos das Configurações da secretaria (com normalização de formato) e alinhar a barra de filtros da tela de Diretoria.

**Architecture:** Frontend é um único `public/index.html` (HTML + JS, chamadas ao backend via shim `google.script.run`). Backend em `lib/code.js` exposto por `api/index.js` (`Object.assign(allFunctions, mod)` sobre `module.exports`). Reutiliza `salvarDirigente` (idempotência, upload de foto, lock) por item do lote e `provisionarAcessoPortalAposNominata` para acessos.

**Tech Stack:** Node 24, HTML/JS vanilla, Supabase REST (via `gasStyleFetch`), shim GAS (`Utilities`, `LockService`).

## Global Constraints

- **Sem framework de teste no projeto.** Verificação: `node --check <arquivo>` para sintaxe, harness Node standalone para o backend, e checagem manual no browser para o frontend. Seguir o padrão dos planos anteriores.
- **Formato canônico de AL = traço** (`2025-2026`). Config grava com barra (`2025/2026`); normalizar com `normalizarAL(x) = String(x).replace(/\//g,'-').trim()` em toda comparação/persistência. **Não** migrar dados existentes.
- **Cargo é texto livre** — não introduzir lista canônica.
- Seguir o padrão existente de construção de modais: string HTML + `insertAdjacentHTML('beforeend', ...)`, `escapeHtmlContent`/`escapeHtmlAttr` para conteúdo dinâmico, `event.stopPropagation()` no `.modal-content`.
- Vínculo enviado ao backend como **string JSON** (reusar `vinculoParaStringGAS`) — objetos perdem chaves no `google.script.run`.
- Cards de dirigente (`renderizarDirigentes`) **não** mudam.

---

## File Structure

- **`public/index.html`** — helpers de AL, substituição dos 4 selects de AL hardcoded, modal de lote (clube + Gabinete), salvamento do lote + provisionamento sequencial, polish da barra de filtros.
- **`lib/code.js`** — nova função backend `salvarDiretoriaLote` + registro em `module.exports`.
- **`scratchpad/harness-lote.js`** (temporário, não commitado) — smoke test Node do backend.

---

### Task 1: Helpers de AL no frontend (`normalizarAL`, `carregarAnosLeonisticos`, `construirOpcoesALSelect`)

**Files:**
- Modify: `public/index.html` (adicionar helpers perto das funções do módulo Diretoria, ~logo antes de `carregarModuloDiretoria` na linha ~11610)

**Interfaces:**
- Produces:
  - `normalizarAL(x) -> string` (troca `/` por `-`, trim)
  - `carregarAnosLeonisticos(callback)` — `callback(als)` onde `als = [{ valor, label, ativo }]` (valor normalizado com traço, ordenado desc). Cacheia em `window.__alsConfig`.
  - `construirOpcoesALSelect(selectEl, als, valorSelecionado)` — popula um `<select>` com `<option value=valor>label</option>`, marcando selecionado (ou o `ativo` se `valorSelecionado` vazio). Se `als` vazio, insere fallback via `obterAlAtual()` chamado no backend? Não — o fallback é feito por quem chama (ver Task 2). Aqui, se `als` vazio, deixa uma única opção placeholder e retorna.

- [ ] **Step 1: Adicionar os helpers**

Inserir imediatamente antes de `function carregarModuloDiretoria()` (linha ~11611):

```javascript
  // === HELPERS DE ANO LEONÍSTICO (fonte: Configurações da secretaria) ===
  // Config grava AL com barra (2025/2026); nominata usa traço (2025-2026).
  // Canonical = traço. Normalizamos em toda comparação/persistência.
  function normalizarAL(x) {
    return String(x == null ? '' : x).replace(/\//g, '-').trim();
  }

  // Carrega os ALs cadastrados em Configurações. callback([{valor,label,ativo}]).
  // valor = normalizado (traço); label = 'AL ' + valor original. Ordena desc.
  function carregarAnosLeonisticos(callback) {
    if (Array.isArray(window.__alsConfig) && window.__alsConfig.length) {
      callback(window.__alsConfig);
      return;
    }
    google.script.run
      .withSuccessHandler(function(res) {
        var configs = (res && res.sucesso && Array.isArray(res.configuracoes)) ? res.configuracoes : [];
        var als = configs
          .filter(function(c) { return c && c.al; })
          .map(function(c) {
            return { valor: normalizarAL(c.al), label: 'AL ' + String(c.al).trim(), ativo: !!c.ativo };
          });
        als.sort(function(a, b) { return b.valor.localeCompare(a.valor); });
        window.__alsConfig = als;
        callback(als);
      })
      .withFailureHandler(function() { callback([]); })
      .listarConfiguracoes();
  }

  // Popula um <select> com as opções de AL. Marca `valorSelecionado` (normalizado)
  // ou, se vazio, o AL ativo. Não faz fallback aqui — quem chama decide.
  function construirOpcoesALSelect(selectEl, als, valorSelecionado) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    var alvo = valorSelecionado ? normalizarAL(valorSelecionado) : '';
    var ativoValor = '';
    (als || []).forEach(function(a) { if (a.ativo && !ativoValor) ativoValor = a.valor; });
    if (!alvo) alvo = ativoValor;
    (als || []).forEach(function(a) {
      var opt = document.createElement('option');
      opt.value = a.valor;
      opt.textContent = a.label + (a.ativo ? ' (ativo)' : '');
      if (a.valor === alvo) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }
```

- [ ] **Step 2: Verificar sintaxe**

Run: `node --check public/index.html` — Espera: o arquivo é HTML, `node --check` falha por não ser JS. Em vez disso, extrair e checar o bloco JS mentalmente **ou** rodar um lint rápido do trecho:

```bash
node -e "new Function(require('fs').readFileSync('/dev/stdin','utf8'))" <<'EOF'
function normalizarAL(x){return String(x==null?'':x).replace(/\//g,'-').trim();}
function construirOpcoesALSelect(){}
console.log(normalizarAL('2025/2026'));
EOF
```
Espera: imprime `2025-2026` sem erro de sintaxe.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(diretoria): helpers de AL (normalizarAL, carregarAnosLeonisticos)"
```

---

### Task 2: Ligar os 4 selects de AL existentes às Configurações + normalizar o filtro

**Files:**
- Modify: `public/index.html`
  - Filtro de AL em `carregarModuloDiretoria` (~11678-11697)
  - `aplicarFiltrosDiretoria` (~11794-11802)
  - Form single clube em `mostrarModalFormularioDirigente` (~12446-12475)
  - Form single Gabinete em `mostrarModalFormularioDirigenteGabinete` (~12534-12563)
  - Form sem nomes `mostrarModalFormularioDirigenteSemNomes` (o `<select id="dirigente-al">` dele)

**Interfaces:**
- Consumes: `carregarAnosLeonisticos`, `construirOpcoesALSelect`, `normalizarAL` (Task 1)

- [ ] **Step 1: Filtro de AL do módulo — trocar array hardcoded por Config**

Em `carregarModuloDiretoria`, substituir o bloco que monta `optionsAL` (linhas ~11684-11696) por: criar o `<select>` vazio, anexá-lo, e popular assíncrono.

Trocar:
```javascript
    selectAL.onchange = aplicarFiltroALDiretoria;
    const optionsAL = [
      { value: '', text: 'Todos os AL' },
      { value: '2024-2025', text: 'AL 2024-2025' },
      { value: '2025-2026', text: 'AL 2025-2026', selected: true },
      { value: '2026-2027', text: 'AL 2026-2027' }
    ];
    optionsAL.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.text;
      if (opt.selected) option.selected = true;
      selectAL.appendChild(option);
    });
    controlsDiv.appendChild(selectAL);
```
Por:
```javascript
    selectAL.onchange = aplicarFiltroALDiretoria;
    // Opção "Todos" + ALs de Configurações (assíncrono). AL ativo pré-selecionado.
    var optTodos = document.createElement('option');
    optTodos.value = '';
    optTodos.textContent = 'Todos os AL';
    selectAL.appendChild(optTodos);
    controlsDiv.appendChild(selectAL);
    carregarAnosLeonisticos(function(als) {
      var ativoValor = '';
      (als || []).forEach(function(a) { if (a.ativo && !ativoValor) ativoValor = a.valor; });
      (als || []).forEach(function(a) {
        var opt = document.createElement('option');
        opt.value = a.valor;
        opt.textContent = a.label + (a.ativo ? ' (ativo)' : '');
        if (a.valor === ativoValor) opt.selected = true;
        selectAL.appendChild(opt);
      });
      // Recarrega a lista já filtrada pelo AL ativo, se houver
      if (ativoValor) { filtroALAtual = ativoValor; carregarDirigentes(); }
    });
```

- [ ] **Step 2: Normalizar comparação em `aplicarFiltrosDiretoria`**

Trocar (linhas ~11798-11802):
```javascript
    if (filtroALAtual) {
      filtrados = filtrados.filter(function(d) {
        return d.anoLeonistico === filtroALAtual || d.ano_leonistico === filtroALAtual;
      });
    }
```
Por:
```javascript
    if (filtroALAtual) {
      var alvoAL = normalizarAL(filtroALAtual);
      filtrados = filtrados.filter(function(d) {
        return normalizarAL(d.anoLeonistico || d.ano_leonistico) === alvoAL;
      });
    }
```

- [ ] **Step 3: Form single de clube — AL de Config**

Em `mostrarModalFormularioDirigente`, remover as 3 linhas `al2024Selected/al2025Selected/al2026Selected` (~12447-12449) e o `<select id="dirigente-al">` estático (~12469-12475). Trocar o `<select>` estático por um placeholder vazio:
```javascript
          '<div class="form-group">' +
          '<label>Ano Leoístico <span style="color: red;">*</span></label>' +
          '<select id="dirigente-al" required></select>' +
          '</div>' +
```
E, no bloco `try { ... insertAdjacentHTML ... }` (após inserir o modal, junto do `setTimeout`), popular:
```javascript
          var _alAtual = dirigente ? (dirigente.anoLeonistico || dirigente.ano_leonistico) : '';
          carregarAnosLeonisticos(function(als) {
            var rSel = obterRootModalDirigente();
            var selAlEl = rSel && rSel.querySelector('#dirigente-al');
            construirOpcoesALSelect(selAlEl, als, _alAtual);
          });
```

- [ ] **Step 4: Form Gabinete — AL de Config**

Em `mostrarModalFormularioDirigenteGabinete`, remover `al2024Selected/al2025Selected/al2026Selected` (~12534-12536) e trocar o `<select id="dirigente-al">` estático (~12559-12563) por `<select id="dirigente-al" required></select>`. Depois do `insertAdjacentHTML` (perto de `window.__dirigenteEditando = ...`, ~12575), adicionar:
```javascript
    var _alGab = dirigente ? (dirigente.anoLeonistico || dirigente.ano_leonistico) : '';
    carregarAnosLeonisticos(function(als) {
      var rG2 = obterRootModalDirigente();
      construirOpcoesALSelect(rG2 && rG2.querySelector('#dirigente-al'), als, _alGab);
    });
```

- [ ] **Step 5: Form sem nomes — AL de Config**

Em `mostrarModalFormularioDirigenteSemNomes`, localizar o `<select id="dirigente-al">` estático e trocá-lo por `<select id="dirigente-al" required></select>`; após o `insertAdjacentHTML` desse modal, popular igual ao Step 4 (usando o `dirigente` local). Se o form não tiver AL editável, aplicar o mesmo padrão de `carregarAnosLeonisticos` + `construirOpcoesALSelect`.

- [ ] **Step 6: Verificação manual no browser**

1. Abrir Diretoria → o filtro de AL lista os ALs de Configurações, AL ativo pré-selecionado, e a lista recarrega já filtrada.
2. Abrir "Novo Dirigente" (clube e Gabinete) → select de AL vem de Config; ao editar um dirigente existente, o AL dele vem pré-selecionado.
3. Console: `carregarAnosLeonisticos(console.log)` retorna array com `valor` em traço.

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "feat(diretoria): ler AL de Configurações nos filtros e formulários + normalizar comparação"
```

---

### Task 3: Backend `salvarDiretoriaLote` + export

**Files:**
- Modify: `lib/code.js` (nova função perto de `salvarDirigente`, ~após a linha 895; e registro no `module.exports` ~18908)
- Test: `scratchpad/harness-lote.js` (temporário)

**Interfaces:**
- Consumes: `salvarDirigente(clube, cargo, nome, fotoBase64, anoLeonistico, vinculo)` (existente, retorna `{sucesso, idempotente?, dados?, erro?}`)
- Produces: `salvarDiretoriaLote(clube, anoLeonistico, itensJson) -> { sucesso, resultados:[{cargo,nome,ok,idempotente,erro}], totalOk, totalIdem, totalErro }`

- [ ] **Step 1: Escrever o harness Node (teste que falha)**

Criar `scratchpad/harness-lote.js`:
```javascript
// Smoke test de salvarDiretoriaLote com salvarDirigente stubado.
const path = require('path');
const codePath = path.resolve(__dirname, '../lib/code.js');

// Carrega o módulo e injeta um stub de salvarDirigente via global (bridgeModuleExportsToGlobal
// expõe as funções em globalThis). Para testar de forma isolada, sobrescrevemos a global.
const code = require(codePath);

let chamadas = [];
globalThis.salvarDirigente = async function(clube, cargo, nome, foto, al, vinculo) {
  chamadas.push({ clube, cargo, nome, al, vinculo });
  if (cargo === 'ERRO') return { sucesso: false, erro: 'boom' };
  if (cargo === 'DUP') return { sucesso: true, idempotente: true, dados: [{ id: 'x' }] };
  return { sucesso: true, dados: [{ id: 'novo' }] };
};

(async () => {
  const itens = JSON.stringify([
    { cargo: 'Presidente', nome: 'Ana', vinculo: '{"pessoa_rtma_id":"1"}', fotoBase64: '' },
    { cargo: 'DUP', nome: 'Bia', vinculo: '', fotoBase64: '' },
    { cargo: 'ERRO', nome: 'Cid', vinculo: '', fotoBase64: '' },
    { cargo: '', nome: '', vinculo: '', fotoBase64: '' } // linha vazia -> ignorada
  ]);
  const r = await code.salvarDiretoriaLote('Clube X', '2025-2026', itens);
  console.log(JSON.stringify(r, null, 2));
  const ok = r.totalOk === 1 && r.totalIdem === 1 && r.totalErro === 1 && r.resultados.length === 3;
  console.log('RESULTADO:', ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
```

- [ ] **Step 2: Rodar o harness — deve falhar (função ainda não existe)**

Run: `node scratchpad/harness-lote.js`
Espera: erro `code.salvarDiretoriaLote is not a function`.

- [ ] **Step 3: Implementar `salvarDiretoriaLote`**

Inserir em `lib/code.js` após `salvarDirigente` (após linha ~895):
```javascript
/**
 * Cadastra vários dirigentes de uma vez (diretoria completa).
 * Reusa salvarDirigente por item (idempotência, upload de foto, lock).
 * Erros por item não abortam o lote. Provisionamento de acesso é feito
 * no cliente (2ª chamada) para manter este INSERT rápido — como no fluxo single.
 * @param {string} clube
 * @param {string} anoLeonistico - já normalizado (traço); trim defensivo aqui
 * @param {string} itensJson - JSON de [{cargo, nome, vinculo(string|obj), fotoBase64}]
 * @return {{sucesso:boolean, resultados:Array, totalOk:number, totalIdem:number, totalErro:number}}
 */
async function salvarDiretoriaLote(clube, anoLeonistico, itensJson) {
  var itens;
  try {
    itens = typeof itensJson === 'string' ? JSON.parse(itensJson || '[]') : (itensJson || []);
  } catch (e) {
    return { sucesso: false, erro: 'itensJson inválido: ' + e.message, resultados: [], totalOk: 0, totalIdem: 0, totalErro: 0 };
  }
  if (!Array.isArray(itens)) itens = [];
  var al = String(anoLeonistico || '').trim();
  var resultados = [];
  var totalOk = 0, totalIdem = 0, totalErro = 0;

  for (var i = 0; i < itens.length; i++) {
    var it = itens[i] || {};
    var cargo = String(it.cargo || '').trim();
    var nome = String(it.nome || '').trim();
    // Linha vazia (sem cargo e sem nome) é ignorada.
    if (!cargo && !nome) continue;
    if (!cargo || !nome) {
      totalErro++;
      resultados.push({ cargo: cargo, nome: nome, ok: false, idempotente: false, erro: 'Cargo e pessoa são obrigatórios' });
      continue;
    }
    try {
      var r = await salvarDirigente(clube, cargo, nome, it.fotoBase64 || '', al, it.vinculo || '');
      if (r && r.sucesso) {
        if (r.idempotente) { totalIdem++; } else { totalOk++; }
        resultados.push({ cargo: cargo, nome: nome, ok: true, idempotente: !!r.idempotente, erro: null });
      } else {
        totalErro++;
        resultados.push({ cargo: cargo, nome: nome, ok: false, idempotente: false, erro: (r && r.erro) || 'Erro desconhecido' });
      }
    } catch (err) {
      totalErro++;
      resultados.push({ cargo: cargo, nome: nome, ok: false, idempotente: false, erro: err.message });
    }
  }
  return { sucesso: true, resultados: resultados, totalOk: totalOk, totalIdem: totalIdem, totalErro: totalErro };
}
```

- [ ] **Step 4: Registrar no `module.exports`**

Em `lib/code.js` ~linha 18926 (onde está `salvarDirigente,`), adicionar logo abaixo:
```javascript
  salvarDiretoriaLote,
```

- [ ] **Step 5: Rodar o harness — deve passar**

Run: `node scratchpad/harness-lote.js`
Espera: JSON com `totalOk:1, totalIdem:1, totalErro:1`, `resultados.length:3`, e `RESULTADO: PASS`.

> Nota: se `require('../lib/code')` disparar efeitos de carga (bridge para global), o stub em `globalThis.salvarDirigente` deve ser definido **depois** do require e a função exportada deve referenciar `salvarDirigente` pelo escopo do módulo. Como `salvarDiretoriaLote` chama `salvarDirigente` diretamente (mesmo escopo), o stub global não intercepta. Ajuste o harness para testar apenas a lógica de agregação: renomeie temporariamente a chamada para `globalThis.salvarDirigente` **não** é possível sem editar a fonte. Portanto, valide a agregação injetando itens que exercitem os ramos de validação (cargo/nome vazios) — que não chamam `salvarDirigente` — e confirme o shape do retorno:
> ```javascript
> const r = await code.salvarDiretoriaLote('C', '2025-2026', JSON.stringify([
>   { cargo:'', nome:'' },            // ignorado
>   { cargo:'Presidente', nome:'' },  // erro validação
> ]));
> // Espera: totalErro:1, resultados.length:1, sucesso:true
> ```
> Use esta variante do harness se o stub global não for interceptável. A verificação real do caminho feliz (com `salvarDirigente` real) fica na verificação manual do browser (Task 6).

- [ ] **Step 6: Verificar sintaxe do módulo**

Run: `node --check lib/code.js`
Espera: sem erros.

- [ ] **Step 7: Commit**

```bash
git add lib/code.js
git commit -m "feat(diretoria): backend salvarDiretoriaLote reusando salvarDirigente por item"
```

---

### Task 4: Modal de lote — shell + tabela (clube normal)

**Files:**
- Modify: `public/index.html` — reescrever `mostrarModalCadastrarDiretoria` (~12974) e `fecharModalCadastrarDiretoria` (~12996); adicionar funções auxiliares do lote.

**Interfaces:**
- Consumes: `carregarAnosLeonisticos`, `construirOpcoesALSelect`, `escapeHtmlContent`, `escapeHtmlAttr`, `listarPessoasParaNominataClube` (backend), `usuarioLogado`
- Produces (globais/funções usadas nas Tasks 5-6):
  - `window.__loteEhGabinete` (bool), `window.__loteClube` (string), `window.__loteRtmaList` (array), `window.__loteRowSeq` (int)
  - `adicionarLinhaDiretoria()` — adiciona uma `<tr>` conforme o modo
  - `removerLinhaDiretoria(rowId)`
  - `construirOptionsPessoasLote(selectedIdx)` -> string de `<option>` (clube normal)

- [ ] **Step 1: Reescrever `mostrarModalCadastrarDiretoria` (modo clube)**

Substituir o corpo stub (linhas ~12974-12994) por:
```javascript
  function mostrarModalCadastrarDiretoria(clubeForcado) {
    clubeModalAtual = clubeForcado || null;
    var ehGabinete = clubeForcado === 'Gabinete Distrital';
    var clubeAlvo = clubeForcado || (usuarioLogado ? usuarioLogado.clube : '') || '';
    window.__loteEhGabinete = ehGabinete;
    window.__loteClube = clubeAlvo;
    window.__loteRowSeq = 0;
    window.__loteRtmaList = [];
    window.__loteGabClubes = [];
    window.__loteGabPessoasPorClube = {};

    var colClube = ehGabinete ? '<th style="text-align:left;padding:8px;">Clube origem</th>' : '';
    var modalHTML = '<div class="modal-overlay" id="modalCadastrarDiretoria" onclick="if(event.target.id===\'modalCadastrarDiretoria\')fecharModalCadastrarDiretoria()">' +
      '<div class="modal-content" onclick="event.stopPropagation()" style="max-width:900px;">' +
      '<div class="modal-header">' +
      '<h3 style="margin:0;">Cadastrar Diretoria Completa' + (ehGabinete ? ' — Gabinete Distrital' : '') + '</h3>' +
      '<button class="modal-close" onclick="fecharModalCadastrarDiretoria()"><i class="fas fa-xmark"></i></button>' +
      '</div>' +
      '<div class="modal-body">' +
      '<div class="form-group" style="max-width:220px;">' +
      '<label>Ano Leoístico <span style="color:red;">*</span></label>' +
      '<select id="diretoria-lote-al" required></select>' +
      '</div>' +
      '<div style="overflow-x:auto;">' +
      '<table style="width:100%;border-collapse:collapse;">' +
      '<thead><tr style="border-bottom:1px solid #dee2e6;">' +
      colClube +
      '<th style="text-align:left;padding:8px;">Cargo</th>' +
      '<th style="text-align:left;padding:8px;">Pessoa</th>' +
      '<th style="text-align:left;padding:8px;">Foto</th>' +
      '<th style="width:40px;"></th>' +
      '</tr></thead>' +
      '<tbody id="diretoria-lote-linhas"></tbody>' +
      '</table>' +
      '</div>' +
      '<button type="button" class="btn-secondary" style="margin-top:12px;" onclick="adicionarLinhaDiretoria()"><i class="fas fa-plus"></i> Adicionar cargo</button>' +
      '</div>' +
      '<div class="modal-footer">' +
      '<button class="btn-secondary" onclick="fecharModalCadastrarDiretoria()">Cancelar</button>' +
      '<button class="btn-primary" id="diretoria-lote-salvar" onclick="salvarDiretoriaLote()"><i class="fas fa-save"></i> Salvar Diretoria</button>' +
      '</div>' +
      '</div></div>';
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.style.overflow = 'hidden';

    // Popular AL
    carregarAnosLeonisticos(function(als) {
      construirOpcoesALSelect(document.getElementById('diretoria-lote-al'), als, '');
    });

    if (ehGabinete) {
      // Carrega clubes; linhas iniciais = 1 (ver Task 5)
      google.script.run
        .withSuccessHandler(function(res) {
          window.__loteGabClubes = (res && res.sucesso && res.clubes) ? res.clubes : [];
          adicionarLinhaDiretoria();
        })
        .withFailureHandler(function() { window.__loteGabClubes = []; adicionarLinhaDiretoria(); })
        .listarClubesParaDirigenteGabinete();
    } else {
      // Carrega pessoas do clube 1x; linhas iniciais = 3
      google.script.run
        .withSuccessHandler(function(pessoas) {
          window.__loteRtmaList = Array.isArray(pessoas) ? pessoas : [];
          adicionarLinhaDiretoria();
          adicionarLinhaDiretoria();
          adicionarLinhaDiretoria();
        })
        .withFailureHandler(function() {
          window.__loteRtmaList = [];
          adicionarLinhaDiretoria();
        })
        .listarPessoasParaNominataClube(clubeAlvo);
    }
  }

  function fecharModalCadastrarDiretoria() {
    var modal = document.getElementById('modalCadastrarDiretoria');
    if (modal) modal.remove();
    document.body.style.overflow = '';
    clubeModalAtual = null;
  }
```

- [ ] **Step 2: `construirOptionsPessoasLote` e `adicionarLinhaDiretoria` (modo clube; Gabinete na Task 5)**

Adicionar após `fecharModalCadastrarDiretoria`:
```javascript
  // <option>s de pessoa a partir de window.__loteRtmaList (clube normal).
  function construirOptionsPessoasLote(selectedIdx) {
    var html = '<option value="">Selecione a pessoa</option>';
    var lista = window.__loteRtmaList || [];
    lista.forEach(function(p, idx) {
      var sel = (String(selectedIdx) === String(idx)) ? ' selected' : '';
      html += '<option value="' + idx + '"' + sel + '>' + escapeHtmlContent((p.nome || '') + (p.tipo ? ' (' + p.tipo + ')' : '')) + '</option>';
    });
    return html;
  }

  function removerLinhaDiretoria(rowId) {
    var tr = document.getElementById('diretoria-lote-row-' + rowId);
    if (tr) tr.remove();
  }

  function adicionarLinhaDiretoria() {
    var tbody = document.getElementById('diretoria-lote-linhas');
    if (!tbody) return;
    var rowId = (window.__loteRowSeq = (window.__loteRowSeq || 0) + 1);
    var ehGab = window.__loteEhGabinete;
    var tr = document.createElement('tr');
    tr.id = 'diretoria-lote-row-' + rowId;
    tr.setAttribute('data-row-id', rowId);
    tr.style.borderBottom = '1px solid #f1f3f5';

    var celClube = '';
    if (ehGab) {
      var clubesOpts = '<option value="">Selecione o clube</option>';
      (window.__loteGabClubes || []).forEach(function(c) {
        var idStr = String(c.id || '').trim();
        var nomeStr = String(c.nome || '').trim();
        clubesOpts += '<option value="' + escapeHtmlAttr(idStr) + '" data-nome="' + escapeHtmlAttr(nomeStr) + '">' + escapeHtmlContent(nomeStr || '(sem nome)') + '</option>';
      });
      celClube = '<td style="padding:8px;"><select class="lote-clube" style="width:180px;" onchange="recarregarPessoasLinhaLote(' + rowId + ')">' + clubesOpts + '</select></td>';
    }

    var pessoaOpts = ehGab ? '<option value="">Selecione o clube primeiro</option>' : construirOptionsPessoasLote(null);
    tr.innerHTML =
      celClube +
      '<td style="padding:8px;"><input type="text" class="lote-cargo" placeholder="Ex: Presidente" style="width:160px;"></td>' +
      '<td style="padding:8px;"><select class="lote-pessoa" style="width:220px;">' + pessoaOpts + '</select></td>' +
      '<td style="padding:8px;"><input type="file" class="lote-foto" accept="image/png" style="width:150px;"></td>' +
      '<td style="padding:8px;text-align:center;"><button type="button" class="btn-icon" title="Remover" onclick="removerLinhaDiretoria(' + rowId + ')" style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:16px;"><i class="fas fa-xmark"></i></button></td>';
    tbody.appendChild(tr);
  }
```

- [ ] **Step 3: Verificação manual (modo clube)**

1. Abrir Diretoria como usuário de clube → botão "Cadastrar Diretoria" → modal abre com AL de Config e 3 linhas.
2. Cada linha tem Cargo (texto), Pessoa (select com associados do clube) e Foto.
3. "Adicionar cargo" cria nova linha; ✕ remove.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(diretoria): modal de cadastro em lote (modo clube) — tabela dinâmica"
```

---

### Task 5: Modal de lote — variante Gabinete (clube-origem por linha + pessoas dependentes)

**Files:**
- Modify: `public/index.html` — adicionar `recarregarPessoasLinhaLote`

**Interfaces:**
- Consumes: `window.__loteGabClubes`, `window.__loteGabPessoasPorClube`, `listarPessoasParaDirigenteGabinete` (backend), `escapeHtmlContent`
- Produces: `recarregarPessoasLinhaLote(rowId)` — ao trocar o clube da linha, popula o `.lote-pessoa` daquela linha (com cache por clube). Cada `<option>` de pessoa tem `value` = índice na lista daquele clube; a linha guarda `data-clube-nome` para o salvamento resolver o vínculo.

- [ ] **Step 1: Implementar `recarregarPessoasLinhaLote`**

Adicionar após `adicionarLinhaDiretoria`:
```javascript
  // Gabinete: recarrega a lista de pessoas da LINHA quando o clube muda.
  // Cache por clube em window.__loteGabPessoasPorClube. A linha guarda o nome
  // do clube em data-clube-nome para o salvamento resolver o vínculo pelo índice.
  function recarregarPessoasLinhaLote(rowId) {
    var tr = document.getElementById('diretoria-lote-row-' + rowId);
    if (!tr) return;
    var selClube = tr.querySelector('.lote-clube');
    var selPessoa = tr.querySelector('.lote-pessoa');
    if (!selClube || !selPessoa) return;
    var opt = selClube.options[selClube.selectedIndex];
    var clubeNome = opt && opt.getAttribute ? (opt.getAttribute('data-nome') || '') : '';
    tr.setAttribute('data-clube-nome', clubeNome);
    if (!clubeNome) {
      selPessoa.innerHTML = '<option value="">Selecione o clube primeiro</option>';
      return;
    }
    function render(lista) {
      var html = '<option value="">Selecione o associado</option>';
      (lista || []).forEach(function(p, idx) {
        html += '<option value="' + idx + '">' + escapeHtmlContent((p.nome || '') + (p.tipo ? ' (' + p.tipo + ')' : '')) + '</option>';
      });
      selPessoa.innerHTML = html;
    }
    var cache = window.__loteGabPessoasPorClube[clubeNome];
    if (cache) { render(cache); return; }
    selPessoa.innerHTML = '<option value="">Carregando...</option>';
    google.script.run
      .withSuccessHandler(function(pessoas) {
        var arr = Array.isArray(pessoas) ? pessoas : [];
        window.__loteGabPessoasPorClube[clubeNome] = arr;
        render(arr);
      })
      .withFailureHandler(function() { selPessoa.innerHTML = '<option value="">Erro ao carregar</option>'; })
      .listarPessoasParaDirigenteGabinete(clubeNome);
  }
```

- [ ] **Step 2: Verificação manual (modo Gabinete)**

1. Como acesso distrital/secretaria, abrir Diretorias de Clubes → botão de cadastro do Gabinete → modal abre com coluna "Clube origem", 1 linha inicial.
2. Escolher clube na linha → select de Pessoa carrega os associados daquele clube.
3. Trocar clube na mesma linha atualiza a lista; adicionar 2ª linha com outro clube funciona independente (cache não mistura).

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(diretoria): lote no Gabinete — clube-origem e pessoas dependentes por linha"
```

---

### Task 6: Salvar o lote — coleta, validação, fotos, envio, provisionamento e refresh

**Files:**
- Modify: `public/index.html` — adicionar `salvarDiretoriaLote` (frontend), `_lerFotoLinhaLote`, `_provisionarSequencialLote`

**Interfaces:**
- Consumes: `salvarDiretoriaLote` (backend, Task 3), `provisionarAcessoPortalAposNominata` (backend), `vinculoParaStringGAS`, `normalizarAL`, `window.__loteRtmaList`, `window.__loteGabPessoasPorClube`, `carregarDirigentes`, `carregarDirigentesGabinete`
- Produces: `salvarDiretoriaLote()` (frontend — mesmo nome do backend, mas no escopo do browser)

- [ ] **Step 1: Implementar leitura de foto por linha (Promise)**

Adicionar:
```javascript
  function _lerFotoLinhaLote(inputEl) {
    return new Promise(function(resolve) {
      if (!inputEl || !inputEl.files || inputEl.files.length === 0) { resolve(''); return; }
      var reader = new FileReader();
      reader.onload = function(e) { resolve(e.target.result || ''); };
      reader.onerror = function() { resolve(''); };
      reader.readAsDataURL(inputEl.files[0]);
    });
  }
```

- [ ] **Step 2: Implementar `salvarDiretoriaLote` (frontend)**

Adicionar:
```javascript
  function salvarDiretoriaLote() {
    var ehGab = window.__loteEhGabinete;
    var clube = ehGab ? 'Gabinete Distrital' : (window.__loteClube || '');
    var alEl = document.getElementById('diretoria-lote-al');
    var al = alEl ? normalizarAL(alEl.value) : '';
    if (!al) { alert('Selecione o Ano Leoístico.'); return; }

    var linhas = Array.prototype.slice.call(document.querySelectorAll('#diretoria-lote-linhas tr'));
    var itensProm = [];
    var pendencias = [];

    linhas.forEach(function(tr, i) {
      var cargo = (tr.querySelector('.lote-cargo') || {}).value;
      cargo = cargo ? String(cargo).trim() : '';
      var selPessoa = tr.querySelector('.lote-pessoa');
      var pessoaVal = selPessoa ? selPessoa.value : '';
      var fotoInput = tr.querySelector('.lote-foto');

      // Linha totalmente vazia é ignorada.
      var selClube = tr.querySelector('.lote-clube');
      var clubeVal = selClube ? selClube.value : '';
      var vazia = !cargo && !pessoaVal && (!ehGab || !clubeVal);
      if (vazia) return;

      if (!cargo || !pessoaVal || (ehGab && !clubeVal)) {
        pendencias.push('Linha ' + (i + 1));
        return;
      }

      // Resolver pessoa/vínculo
      var lista, vobj;
      if (ehGab) {
        var clubeNome = tr.getAttribute('data-clube-nome') || '';
        lista = window.__loteGabPessoasPorClube[clubeNome] || [];
      } else {
        lista = window.__loteRtmaList || [];
      }
      var idx = parseInt(pessoaVal, 10);
      if (isNaN(idx) || idx < 0 || idx >= lista.length) { pendencias.push('Linha ' + (i + 1) + ' (pessoa)'); return; }
      vobj = lista[idx];
      var nome = String(vobj.nome || '').trim();
      var vinculo = {
        clube_origem_id: vobj.clube_origem_id != null ? vobj.clube_origem_id : null,
        pessoa_rtma_id: vobj.origem === 'pessoas_rtma' ? vobj.id : null,
        pessoa_amigo_id: vobj.origem === 'amigos_conselheiros' ? vobj.id : null
      };
      itensProm.push(
        _lerFotoLinhaLote(fotoInput).then(function(fotoBase64) {
          return { cargo: cargo, nome: nome, vinculo: vinculoParaStringGAS(vinculo), fotoBase64: fotoBase64 };
        })
      );
    });

    if (pendencias.length) { alert('Preencha cargo, pessoa' + (ehGab ? ' e clube' : '') + ' em: ' + pendencias.join(', ') + '.'); return; }
    if (!itensProm.length) { alert('Adicione ao menos um cargo com pessoa.'); return; }

    var btn = document.getElementById('diretoria-lote-salvar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

    Promise.all(itensProm).then(function(itens) {
      google.script.run
        .withSuccessHandler(function(res) {
          if (!res || !res.sucesso) {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Salvar Diretoria'; }
            alert('Erro ao salvar diretoria: ' + ((res && res.erro) || 'desconhecido'));
            return;
          }
          // Provisiona acesso sequencialmente para os itens salvos (ok ou idempotente).
          var salvos = itens.filter(function(it, k) {
            var r = res.resultados[k];
            return r && r.ok;
          });
          _provisionarSequencialLote(clube, al, salvos, function() {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Salvar Diretoria'; }
            var msg = 'Diretoria salva: ' + res.totalOk + ' novo(s)';
            if (res.totalIdem) msg += ', ' + res.totalIdem + ' já existia(m)';
            if (res.totalErro) msg += ', ' + res.totalErro + ' com erro';
            alert(msg + '.');
            fecharModalCadastrarDiretoria();
            if (ehGab) { carregarDirigentesGabinete(); } else { carregarDirigentes(); }
          });
        })
        .withFailureHandler(function(erro) {
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Salvar Diretoria'; }
          alert('Erro ao salvar diretoria: ' + erro);
        })
        .salvarDiretoriaLote(clube, al, JSON.stringify(itens));
    });
  }
```

Nota de índice: `res.resultados[k]` alinha com `itens[k]` porque o backend **ignora linhas vazias sem cargo e sem nome**, mas aqui só enviamos itens já válidos (linhas vazias filtradas no front). Portanto, cada item enviado produz exatamente um resultado, na mesma ordem.

- [ ] **Step 3: Implementar provisionamento sequencial**

Adicionar:
```javascript
  // Chama provisionarAcessoPortalAposNominata um item por vez (evita rajada).
  // A função de backend ignora cargos fora de Secretário/Diretor de Campanhas.
  function _provisionarSequencialLote(clube, al, itens, done) {
    var i = 0;
    function proximo() {
      if (i >= itens.length) { done(); return; }
      var it = itens[i++];
      google.script.run
        .withSuccessHandler(function() { proximo(); })
        .withFailureHandler(function() { proximo(); })
        .provisionarAcessoPortalAposNominata(clube, it.cargo, it.nome, al, it.vinculo);
    }
    proximo();
  }
```

- [ ] **Step 4: Verificação manual (fluxo completo)**

1. **Clube:** preencher 3 linhas (ex.: Presidente, Secretário, Tesoureiro) com pessoas → Salvar → alerta "3 novo(s)"; lista de dirigentes atualiza; reenviar as mesmas → "3 já existia(m)" (idempotência).
2. **Acesso:** a linha "Secretário" gera acesso (e-mail); "Presidente/Tesoureiro" não geram e não dão erro.
3. **Gabinete:** cadastrar 2 linhas de clubes diferentes → salvam com clube "Gabinete Distrital" e vínculo correto.
4. **Validação:** linha com cargo mas sem pessoa → alerta de pendência; linha vazia → ignorada.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat(diretoria): salvar lote com fotos, validação, provisionamento sequencial e refresh"
```

---

### Task 7: Polimento da barra de filtros + empty state

**Files:**
- Modify: `public/index.html` — `carregarModuloDiretoria` (`controlsDiv` ~11645-11646, selects ~11682/11704) e o empty state do grid

**Interfaces:**
- Consumes: nada novo

- [ ] **Step 1: Alinhar a barra de controles**

Trocar o `cssText` de `controlsDiv` (linha ~11646):
```javascript
    controlsDiv.style.cssText = 'display: flex; gap: 12px; align-items: center; flex-wrap: nowrap;';
```
Por:
```javascript
    controlsDiv.style.cssText = 'display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: flex-end; margin-left: auto;';
```

- [ ] **Step 2: Selects responsivos (não estourar no mobile)**

No `cssText` do `selectAL` (~11682) e `selectClube` (~11704), trocar `width: 140px;`/`width: 200px;` por `min-width` + `max-width`:
- `selectAL`: trocar `width: 140px;` por `min-width: 140px; max-width: 100%;`
- `selectClube`: trocar `width: 200px;` por `min-width: 180px; max-width: 100%;`

- [ ] **Step 3: Melhorar empty state do grid**

Em `aplicarFiltrosDiretoria` (ou onde renderiza a lista vazia), garantir uma mensagem clara quando o filtro não retorna nada. Localizar o ponto onde `filtrados.length === 0` é tratado no `renderizarDirigentes`/render e usar:
```javascript
    if (!filtrados.length) {
      var alTxt = filtroALAtual ? (' para o AL ' + escapeHtmlContent(filtroALAtual)) : '';
      container.innerHTML = '<div class="empty-state">' +
        '<div class="empty-icon"><i class="fas fa-user-slash"></i></div>' +
        '<h3>Nenhum dirigente' + alTxt + '</h3>' +
        '<p>Cadastre a diretoria para começar.</p>' +
        '</div>';
      return;
    }
```
(Adaptar ao container real usado por `renderizarDirigentes`.)

- [ ] **Step 4: Verificação manual (UI)**

1. Desktop: filtros/botões alinhados à direita, mesma altura (40px), gap uniforme.
2. Estreitar a janela (mobile): barra quebra em linhas, selects não estouram a largura.
3. Filtrar por um AL sem dirigentes → empty state aparece com mensagem e CTA.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "style(diretoria): alinhar barra de filtros e melhorar empty state"
```

---

## Self-Review (feito)

- **Cobertura do spec:** Parte 1 (AL de Config + normalização) → Tasks 1-2; Parte 2 (modal lote clube+Gabinete) → Tasks 4-5; salvamento/validação/fotos/provisionamento → Task 6; Parte 3 (backend `salvarDiretoriaLote` + export) → Task 3; Parte 4 (polish) → Task 7. Fallback de AL vazio: filtro mostra só "Todos"; forms ficam sem opção — mitigado deixando "Todos" no filtro; se necessário, quem chama pode adicionar `obterAlAtual`. Registrado como aceitável (YAGNI).
- **Placeholders:** nenhum — todo passo tem código real e comando com saída esperada.
- **Consistência de tipos:** `salvarDiretoriaLote` retorna `{sucesso, resultados[{cargo,nome,ok,idempotente,erro}], totalOk, totalIdem, totalErro}` — consumido igual na Task 6. `carregarAnosLeonisticos` → `[{valor,label,ativo}]` usado nas Tasks 2/4. `window.__loteGabPessoasPorClube[clubeNome]` gravado na Task 5 e lido na Task 6. Índices `res.resultados[k]` alinhados com `itens[k]` (linhas vazias filtradas no front).
- **Nota de teste:** projeto sem test runner; caminho feliz do backend é verificado no browser (Task 6), agregação/validação via harness Node (Task 3). Remover `scratchpad/harness-lote.js` ao final (não commitar).
