# Eixos de Campanha por AL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar seção de cadastro de eixos de campanha (D8 e DM) nas Configurações do sistema, atrelada por AL, com seletor de campanhas exibindo somente os eixos do AL ativo.

**Architecture:** Nova tabela Supabase `eixos_campanha`. `lib/portal_supabase.js` ganha funções CRUD. `lib/code.js` atualiza `getEixos()` para ler do Supabase (AL ativo) em vez do Google Sheets, e expõe 3 funções novas. `public/index.html` adiciona seção de gerenciamento na tela de Configurações (visível só para secretaria/distrital), usando as novas funções via `google.script.run` (que é um shim para `/api`).

**Tech Stack:** Node.js, Supabase REST API, HTML/CSS/JS vanilla (projeto monolítico sem bundler nem test runner)

---

## Mapa de arquivos

| Arquivo | O que muda |
|---|---|
| `lib/portal_supabase.js` | L35: add `eixos_campanha` à `PORTAL_SUPABASE_TABLES`; novo bloco `=== EIXOS DE CAMPANHA ===` antes de `module.exports` (L3235); adicionar 4 funções ao `module.exports` |
| `lib/code.js` | L11580–11594: substituir `getEixos()` inteira; novo bloco antes de `module.exports` (L18811) com 3 funções; adicionar 3 itens ao `module.exports` próximo a `getEixos` (L19003) |
| `public/index.html` | Dentro de `carregarModuloConfiguracoes()` (L23982), adicionar template HTML da seção eixos no bloco `${(isSecretaria \|\| isDistrital) ? ...}` que já existe; adicionar 3 funções JS novas antes de `carregarModuloAprovacoes()` (L24787) |

---

## Task 1: Supabase — criar tabela `eixos_campanha`

**Files:**
- No filesystem change needed — migration executada diretamente via Supabase MCP

**Contexto:** A tabela `eixos_campanha` não existe ainda. O projeto usa Supabase via REST API (service role key). A tabela `configuracoes` já existe e tem campo `al` (ex: "2025-2026").

- [ ] **Step 1: Executar migration via Supabase MCP**

Chamar `mcp__claude_ai_Supabase__execute_sql` (ou `apply_migration`) com o SQL:

```sql
CREATE TABLE IF NOT EXISTS eixos_campanha (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  al         text        NOT NULL,
  nome       text        NOT NULL,
  tipo       text        NOT NULL CHECK (tipo IN ('d8', 'dm')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eixos_campanha_al_tipo
  ON eixos_campanha (al, tipo);
```

- [ ] **Step 2: Verificar que a tabela existe**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'eixos_campanha'
ORDER BY ordinal_position;
```

Esperado: 5 linhas (id, al, nome, tipo, created_at).

- [ ] **Step 3: Inserir linha de teste e deletar**

```sql
INSERT INTO eixos_campanha (al, nome, tipo) VALUES ('2025-2026', 'Teste D8', 'd8');
SELECT * FROM eixos_campanha;
DELETE FROM eixos_campanha WHERE nome = 'Teste D8';
```

Confirmar que insert + select + delete funcionam sem erros.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: criar tabela eixos_campanha no Supabase"
```

---

## Task 2: `lib/portal_supabase.js` — funções CRUD para `eixos_campanha`

**Files:**
- Modify: `lib/portal_supabase.js:35` (PORTAL_SUPABASE_TABLES)
- Modify: `lib/portal_supabase.js:3235` (antes do module.exports — inserir bloco novo)
- Modify: `lib/portal_supabase.js:3369` (module.exports — adicionar 4 entradas)

**Contexto:** `portal_supabase.js` usa o padrão `portalSupabaseFetch(path, options)`. Respostas têm `getResponseCode()` e `getContentText()`. Funções de normalização mapeiam snake_case → camelCase via `portalToCamelFromSnake(row, snakeToCamel)`. Ver `portalNormalizeConfiguracaoRow` (L2968) e `portalListarConfiguracoes` (L2991) como referência exata de padrão.

- [ ] **Step 1: Adicionar `eixos_campanha` a `PORTAL_SUPABASE_TABLES`**

Localizar `lib/portal_supabase.js` linha 35 (`past_presidentes: 'past_presidentes'`). Inserir após essa linha:

```js
  past_presidentes: 'past_presidentes',
  eixos_campanha: 'eixos_campanha'
```

(Adicionar vírgula na linha `past_presidentes` e inserir a nova linha.)

- [ ] **Step 2: Verificar sintaxe**

```bash
node -e "require('./lib/portal_supabase.js'); console.log('OK')"
```

Esperado: `OK` sem erros.

- [ ] **Step 3: Adicionar bloco de funções EIXOS DE CAMPANHA**

Localizar a linha `// === CONFIGURAÇÕES (SUPABASE) ===` (próxima ao L2967). Inserir um novo bloco **após** a função `portalExcluirConfiguracao` (procurar pela função — está após `portalAtivarConfiguracao`). O novo bloco deve ser inserido logo antes do comentário `// === SOLICITAÇÕES DE ALTERAÇÃO` ou da linha que começa `async function portalListarSolicitacoesAlteracao`.

Inserir antes de `module.exports = {` (L3236):

```js
// === EIXOS DE CAMPANHA (SUPABASE) ===
function portalNormalizeEixoCampanhaRow(row) {
  if (!row) return null;
  const snakeToCamel = {
    id: 'id',
    al: 'al',
    nome: 'nome',
    tipo: 'tipo',
    created_at: 'createdAt'
  };
  return portalToCamelFromSnake(row, snakeToCamel);
}

async function portalListarEixosCampanha(al) {
  const table = PORTAL_SUPABASE_TABLES.eixos_campanha;
  const path = `${table}?al=eq.${encodeURIComponent(String(al))}&order=tipo.asc,nome.asc&select=*`;
  const resp = await portalSupabaseFetch(path, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalListarEixosCampanha erro:', resp.getResponseCode(), resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(portalNormalizeEixoCampanhaRow).filter(Boolean);
}

async function portalCriarEixoCampanha(dados) {
  const table = PORTAL_SUPABASE_TABLES.eixos_campanha;
  const payload = {
    al: dados.al,
    nome: dados.nome,
    tipo: dados.tipo
  };
  const resp = await portalSupabaseFetch(table, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    payload: JSON.stringify([payload])
  });
  const code = resp.getResponseCode();
  if (code !== 201 && code !== 200) {
    throw new Error(`portalCriarEixoCampanha falhou: ${code} ${resp.getContentText()}`);
  }
  const arr = JSON.parse(resp.getContentText() || '[]');
  return arr && arr[0] ? portalNormalizeEixoCampanhaRow(arr[0]) : portalNormalizeEixoCampanhaRow(payload);
}

async function portalExcluirEixoCampanha(id) {
  const table = PORTAL_SUPABASE_TABLES.eixos_campanha;
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`portalExcluirEixoCampanha falhou: ${code} ${resp.getContentText()}`);
  }
  return { sucesso: true };
}
```

- [ ] **Step 4: Adicionar as 4 funções ao `module.exports`**

Localizar `lib/portal_supabase.js` — a última linha antes de `};` no `module.exports` é `portalAtualizarConfiguracao,` (L3368). Inserir após ela:

```js
  portalAtualizarConfiguracao,
  portalNormalizeEixoCampanhaRow,
  portalListarEixosCampanha,
  portalCriarEixoCampanha,
  portalExcluirEixoCampanha,
```

- [ ] **Step 5: Verificar sintaxe**

```bash
node -e "require('./lib/portal_supabase.js'); console.log('OK')"
```

Esperado: `OK`.

- [ ] **Step 6: Commit**

```bash
git add lib/portal_supabase.js
git commit -m "feat: adicionar funções CRUD eixos_campanha em portal_supabase.js"
```

---

## Task 3: `lib/code.js` — atualizar `getEixos()` e funções wrapper

**Files:**
- Modify: `lib/code.js:11580-11594` (função `getEixos`)
- Modify: `lib/code.js` — inserir 3 funções novas antes de `module.exports` (L18811)
- Modify: `lib/code.js:19003` — adicionar 3 exports próximo a `getEixos`

**Contexto:** `getEixos()` atual lê do Google Sheets (L11580–11594). A função `portalBuscarConfiguracaoAtiva()` existe em `portal_supabase.js` e está disponível no escopo via `require('../lib/portal_supabase')` em `api/index.js`. Em `code.js`, funções de `portal_supabase.js` são chamadas diretamente por nome (sem `require`) porque ambos os módulos são carregados juntos em `api/index.js` e mesclados em `allFunctions`. Verificar: `listarConfiguracoes` chama `portalListarConfiguracoes()` diretamente (L16931) — seguir esse mesmo padrão.

- [ ] **Step 1: Substituir `getEixos()` em `lib/code.js`**

Localizar `lib/code.js` linhas 11580–11594:

```js
function getEixos() {
  try {
    const ss = SpreadsheetApp.openById(CAMPANHAS_SHEET_ID);
    const sheet = ss.getSheetByName(EIXOS_TAB);
    if (!sheet) return { eixo: [], eixoDM: [] };

    const eixo = sheet.getRange("A2:A").getValues().flat().filter(e => e);
    const eixoDM = sheet.getRange("B2:B").getValues().flat().filter(e => e);

    return { eixo, eixoDM };
  } catch (error) {
    console.error("Erro ao buscar eixos:", error);
    return { eixo: [], eixoDM: [] };
  }
}
```

Substituir por:

```js
async function getEixos() {
  try {
    const configAtiva = await portalBuscarConfiguracaoAtiva();
    if (!configAtiva || !configAtiva.al) return { eixo: [], eixoDM: [] };
    const todos = await portalListarEixosCampanha(configAtiva.al);
    const eixo = todos.filter(e => e.tipo === 'd8').map(e => e.nome);
    const eixoDM = todos.filter(e => e.tipo === 'dm').map(e => e.nome);
    return { eixo, eixoDM };
  } catch (error) {
    console.error('Erro ao buscar eixos:', error);
    return { eixo: [], eixoDM: [] };
  }
}
```

- [ ] **Step 2: Verificar sintaxe**

```bash
node -e "require('./lib/code.js'); console.log('OK')"
```

Esperado: `OK`.

- [ ] **Step 3: Adicionar 3 funções wrapper novas antes de `module.exports`**

Localizar a linha `// === FUNÇÕES DE GERENCIAMENTO DE ACESSOS ===` (L17021 aproximadamente). Inserir o bloco abaixo **imediatamente antes** dessa linha:

```js
// === EIXOS DE CAMPANHA ===

async function listarEixosCampanha(al) {
  try {
    const eixos = await portalListarEixosCampanha(al);
    return { sucesso: true, eixos };
  } catch (error) {
    console.error('Erro ao listar eixos de campanha:', error);
    return { sucesso: false, eixos: [], erro: error.message };
  }
}

async function salvarEixoCampanha(dados) {
  try {
    const eixo = await portalCriarEixoCampanha(dados);
    return { sucesso: true, eixo };
  } catch (error) {
    console.error('Erro ao salvar eixo de campanha:', error);
    return { sucesso: false, erro: error.message };
  }
}

async function excluirEixoCampanha(id) {
  try {
    await portalExcluirEixoCampanha(id);
    return { sucesso: true };
  } catch (error) {
    console.error('Erro ao excluir eixo de campanha:', error);
    return { sucesso: false, erro: error.message };
  }
}
```

- [ ] **Step 4: Adicionar 3 funções ao `module.exports`**

Localizar `lib/code.js` linha com `getEixos,` (L19003). Após ela, inserir:

```js
  getEixos,
  listarEixosCampanha,
  salvarEixoCampanha,
  excluirEixoCampanha,
```

(Certificar que `getEixos,` já estava lá — não duplicar.)

- [ ] **Step 5: Verificar sintaxe**

```bash
node -e "require('./lib/code.js'); console.log('OK')"
```

Esperado: `OK`.

- [ ] **Step 6: Commit**

```bash
git add lib/code.js
git commit -m "feat: atualizar getEixos() para Supabase e adicionar funções CRUD eixos"
```

---

## Task 4: `public/index.html` — seção de eixos nas Configurações

**Files:**
- Modify: `public/index.html` — dentro de `carregarModuloConfiguracoes()`, no bloco condicional `${(isSecretaria || isDistrital) ? ...}` que já contém a seção "Clubes"
- Modify: `public/index.html` — adicionar 3 funções JS novas antes de `carregarModuloAprovacoes()` (L24787)

**Contexto:** A função `carregarModuloConfiguracoes()` está em L23973. O HTML que ela injeta está em L23982. O bloco condicional para secretaria/distrital começa em L24041 com `${(isSecretaria || isDistrital) ? \``. Esse bloco inclui a seção "Clubes" e termina com uma backtick + `: ''}`. Variáveis disponíveis no escopo: `configuracoesAtuais` (array de configs já carregado ao abrir o módulo, cada item tem `.al` e `.ativo`). O padrão de chamada backend é `google.script.run.withSuccessHandler(fn).withFailureHandler(fn).nomeFuncao(args)`.

- [ ] **Step 1: Localizar ponto de inserção do template HTML**

Abrir `public/index.html`. Procurar por `<!-- Seção de Clubes -->` (L24042). A nova seção de Eixos de Campanha deve ser inserida **antes** do comentário `<!-- Seção de Clubes -->`, ainda dentro do bloco `${(isSecretaria || isDistrital) ? \``.

- [ ] **Step 2: Inserir HTML da seção Eixos de Campanha**

Imediatamente antes de `<!-- Seção de Clubes -->` (L24042), inserir:

```html
        <!-- Seção de Eixos de Campanha -->
        <div class="config-section" style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h3 style="margin: 0 0 8px 0; color: #212529;">Eixos de Campanha</h3>
          <p style="color: #6c757d; margin: 0 0 20px 0;">Gerencie os eixos de campanha D8 e DM para cada Ano Leonístico.</p>
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
            <label style="font-weight: 600; white-space: nowrap;">Ano Leonístico:</label>
            <select id="eixos-al-selector" style="padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 6px; font-size: 14px; min-width: 160px;"
              onchange="carregarEixosCampanhaConfig(this.value)">
            </select>
          </div>
          <div id="eixos-campanha-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
            <div class="loading"><div class="loading-spinner"></div><div>Carregando eixos...</div></div>
          </div>
        </div>
```

- [ ] **Step 3: Popular o seletor de AL ao carregar o módulo**

Dentro de `carregarModuloConfiguracoes()`, após a chamada `carregarConfiguracoes()` (que existe e carrega `configuracoesAtuais`), adicionar chamada para popular o seletor. Localizar a linha `carregarConfiguracoes();` dentro de `carregarModuloConfiguracoes()` e inserir logo após:

```js
     if (isSecretaria || isDistrital) {
       carregarConfiguracoes();
       // Popular seletor de AL assim que configurações estiverem prontas
       // O seletor é populado em renderizarConfiguracoes() — ver step 4
     }
```

Na verdade, o padrão mais simples é popular o seletor dentro da função `renderizarConfiguracoes()` que já existe (L24196), após renderizar os cards. Localizar `renderizarConfiguracoes`:

```js
function renderizarConfiguracoes(configuracoes) {
  const container = document.getElementById("configuracoes-container");
  // ...
```

Ao final dessa função, antes do `}` de fechamento, inserir:

```js
     // Popular seletor de AL para seção de eixos
     const alSel = document.getElementById('eixos-al-selector');
     if (alSel && configuracoes && configuracoes.length > 0) {
       alSel.innerHTML = configuracoes.map(c =>
         `<option value="${escapeHtmlAttr(c.al)}">${escapeHtmlAttr(c.al)}${c.ativo ? ' (ativo)' : ''}</option>`
       ).join('');
       const ativo = configuracoes.find(c => c.ativo);
       alSel.value = ativo ? ativo.al : configuracoes[0].al;
       carregarEixosCampanhaConfig(alSel.value);
     }
```

- [ ] **Step 4: Adicionar 3 funções JS novas**

Localizar a linha `function carregarModuloAprovacoes()` (L24787). Inserir o bloco abaixo **imediatamente antes** dessa função:

```js
   // === EIXOS DE CAMPANHA — CONFIGURAÇÕES ===

   function carregarEixosCampanhaConfig(al) {
     const container = document.getElementById('eixos-campanha-container');
     if (!container) return;
     container.innerHTML = `<div class="loading"><div class="loading-spinner"></div><div>Carregando eixos...</div></div>`;
     google.script.run
       .withSuccessHandler(function(resultado) {
         if (!resultado.sucesso) {
           container.innerHTML = `<div style="color:#dc3545;">Erro: ${resultado.erro || 'desconhecido'}</div>`;
           return;
         }
         const eixos = resultado.eixos || [];
         const d8 = eixos.filter(e => e.tipo === 'd8');
         const dm = eixos.filter(e => e.tipo === 'dm');
         function renderLista(tipo, lista) {
           const itens = lista.map(e =>
             `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:#f8f9fa; border-radius:6px; margin-bottom:6px;">
               <span style="font-size:14px;">${escapeHtmlContent(e.nome)}</span>
               <button type="button" onclick="removerEixoCampanha('${escapeHtmlAttr(e.id)}','${escapeHtmlAttr(al)}')"
                 style="background:none; border:none; color:#dc3545; cursor:pointer; font-size:16px; padding:0 4px; line-height:1;" title="Remover">✕</button>
             </div>`
           ).join('');
           return `
             <div>
               <h4 style="margin:0 0 12px 0; color:#495057; font-size:14px; font-weight:600; text-transform:uppercase; letter-spacing:.5px;">
                 Eixos ${tipo === 'd8' ? 'D8' : 'DM'}
               </h4>
               ${itens || '<p style="color:#adb5bd; font-size:13px; margin:0 0 8px 0;">Nenhum eixo cadastrado.</p>'}
               <div style="display:flex; gap:8px; margin-top:8px;">
                 <input type="text" id="novo-eixo-${tipo}" placeholder="Nome do eixo"
                   style="flex:1; padding:8px 10px; border:1px solid #dee2e6; border-radius:6px; font-size:13px;"
                   onkeydown="if(event.key==='Enter') adicionarEixoCampanha('${escapeHtmlAttr(al)}','${tipo}')">
                 <button type="button" class="btn-primary" onclick="adicionarEixoCampanha('${escapeHtmlAttr(al)}','${tipo}')"
                   style="padding:8px 14px; font-size:13px; white-space:nowrap;">+ Adicionar</button>
               </div>
             </div>`;
         }
         container.innerHTML = renderLista('d8', d8) + renderLista('dm', dm);
       })
       .withFailureHandler(function(err) {
         const c = document.getElementById('eixos-campanha-container');
         if (c) c.innerHTML = `<div style="color:#dc3545;">Erro ao carregar eixos.</div>`;
       })
       .listarEixosCampanha(al);
   }

   function adicionarEixoCampanha(al, tipo) {
     const input = document.getElementById(`novo-eixo-${tipo}`);
     if (!input) return;
     const nome = (input.value || '').trim();
     if (!nome) { input.focus(); return; }
     input.disabled = true;
     google.script.run
       .withSuccessHandler(function(resultado) {
         input.disabled = false;
         if (!resultado.sucesso) {
           alert('Erro ao adicionar eixo: ' + (resultado.erro || 'desconhecido'));
           return;
         }
         input.value = '';
         carregarEixosCampanhaConfig(al);
       })
       .withFailureHandler(function(err) {
         input.disabled = false;
         alert('Erro ao adicionar eixo.');
       })
       .salvarEixoCampanha({ al: al, nome: nome, tipo: tipo });
   }

   function removerEixoCampanha(id, al) {
     if (!confirm('Remover este eixo?')) return;
     google.script.run
       .withSuccessHandler(function(resultado) {
         if (!resultado.sucesso) {
           alert('Erro ao remover eixo: ' + (resultado.erro || 'desconhecido'));
           return;
         }
         carregarEixosCampanhaConfig(al);
       })
       .withFailureHandler(function() {
         alert('Erro ao remover eixo.');
       })
       .excluirEixoCampanha(id);
   }
```

- [ ] **Step 5: Verificar HTML válido**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const open = (html.match(/\${/g) || []).length;
const close = (html.match(/}/g) || []).length;
console.log('Template literals abertas:', open);
// Verificação simples: garantir que as funções novas existem
['carregarEixosCampanhaConfig', 'adicionarEixoCampanha', 'removerEixoCampanha', 'eixos-al-selector', 'eixos-campanha-container'].forEach(k => {
  if (html.includes(k)) console.log('OK:', k);
  else console.error('MISSING:', k);
});
"
```

Esperado: `OK` para todos os 5 identificadores.

- [ ] **Step 6: Verificar que API responde a `listarEixosCampanha`**

Iniciar servidor local:

```bash
npx vercel dev &
sleep 3
```

Fazer chamada de teste:

```bash
curl -s -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -d '{"action":"listarEixosCampanha","args":["2025-2026"]}' | node -e "
    let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
      const r=JSON.parse(d);
      if(r.sucesso!==undefined) console.log('OK sucesso:', r.sucesso, 'eixos:', (r.eixos||[]).length);
      else console.error('ERRO:', JSON.stringify(r));
    });
  "
```

Esperado: `OK sucesso: true eixos: 0` (tabela vazia por enquanto).

Derrubar o servidor: `pkill -f "vercel dev"` ou `fg` + `Ctrl+C`.

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "feat: seção de eixos de campanha por AL nas configurações"
```

---

## Self-Review (executar antes de fechar)

Checklist de cobertura do spec:

| Requisito do spec | Implementado em |
|---|---|
| Nova tabela `eixos_campanha` com id, al, nome, tipo, created_at | Task 1 |
| `PORTAL_SUPABASE_TABLES.eixos_campanha` | Task 2, Step 1 |
| `portalNormalizeEixoCampanhaRow` | Task 2, Step 3 |
| `portalListarEixosCampanha(al)` | Task 2, Step 3 |
| `portalCriarEixoCampanha({al, nome, tipo})` | Task 2, Step 3 |
| `portalExcluirEixoCampanha(id)` | Task 2, Step 3 |
| `getEixos()` usa Supabase + AL ativo | Task 3, Step 1 |
| `listarEixosCampanha` / `salvarEixoCampanha` / `excluirEixoCampanha` | Task 3, Step 3 |
| Exports dos 3 wrappers | Task 3, Step 4 |
| Seção eixos visível só para secretaria/distrital | Task 4, Step 2 (dentro do bloco condicional) |
| Seletor de AL com default = AL ativo | Task 4, Step 3 |
| Lista D8 e DM separadas com botão remover | Task 4, Step 4 (`carregarEixosCampanhaConfig`) |
| Adicionar eixo inline por tipo | Task 4, Step 4 (`adicionarEixoCampanha`) |
| Remover eixo com confirmação | Task 4, Step 4 (`removerEixoCampanha`) |
| Seletor de campanhas sem mudança frontend | N/A — `getEixos()` backend já retorna eixos do AL ativo |
