# Cadastro de Diretoria — lote + AL de Configurações + polimento da tela

**Data:** 2026-07-08
**Escopo:** módulo Diretoria (Nominata) — `public/index.html` + `lib/code.js`

## Problema

1. O botão **"Cadastrar Diretoria"** abre um modal stub ("Em breve...") — cadastro em lote nunca foi implementado (`mostrarModalCadastrarDiretoria`, index.html:12974).
2. A lista de **Ano Leonístico (AL)** está hardcoded em 4 lugares do front (`['2024-2025','2025-2026','2026-2027']`), enquanto Configurações (secretaria) já mantém um cadastro real de ALs (tabela `configuracoes`, campo `al`, flag `ativo`) via `listarConfiguracoes()`. Pior: Configurações grava AL com barra (`2025/2026`) e a nominata usa traço (`2025-2026`) — formatos divergentes.
3. A **barra de filtros** da tela de Diretoria está desalinhada (`controlsDiv` com `flex-wrap: nowrap`, alturas/gaps inconsistentes) e pouco usável, sobretudo no mobile.

## Objetivo

- Implementar cadastro de diretoria **em lote** (múltiplos dirigentes de uma vez) para clube normal **e** Gabinete Distrital.
- Passar a ler os ALs de **Configurações**, com normalização de formato que não quebre registros existentes.
- Alinhar e polir a **barra de filtros** da tela (sem redesenhar os cards de dirigente).

## Não-objetivos (YAGNI)

- Redesign dos cards de dirigente.
- Lista canônica de cargos (cargo permanece texto livre).
- Migração do formato de AL nos dados já salvos em `nominata_dirigentes`.

---

## Parte 1 — AL a partir de Configurações

### Helper de carregamento (frontend)

Novo helper em `public/index.html`:

```
function carregarAnosLeonisticos(callback) {
  // usa cache se já carregado
  if (Array.isArray(window.__alsConfig) && window.__alsConfig.length) {
    callback(window.__alsConfig); return;
  }
  google.script.run
    .withSuccessHandler(function(res) {
      var configs = (res && res.sucesso && res.configuracoes) ? res.configuracoes : [];
      var als = configs.map(function(c) {
        return { valor: normalizarAL(c.al), label: 'AL ' + c.al, ativo: !!c.ativo };
      });
      // ordena desc por valor
      als.sort(function(a, b) { return b.valor.localeCompare(a.valor); });
      window.__alsConfig = als;
      callback(als);
    })
    .withFailureHandler(function() { callback([]); })
    .listarConfiguracoes();
}
```

### Normalização de formato

```
function normalizarAL(x) {
  return String(x == null ? '' : x).replace(/\//g, '-').trim();
}
```

Regra: **traço é o formato canônico** (compatível com os registros legados). Em toda opção de `<select>` de AL:
- `option.value = normalizarAL(config.al)` → traço, bate com o que está salvo.
- `option.textContent` → mantém o label legível (com o valor original de Config).
- opção do AL `ativo` vem pré-selecionada.

### Comparação no filtro

`aplicarFiltrosDiretoria` passa a comparar via `normalizarAL` nos dois lados:

```
if (filtroALAtual) {
  var alvo = normalizarAL(filtroALAtual);
  filtrados = filtrados.filter(function(d) {
    return normalizarAL(d.anoLeonistico || d.ano_leonistico) === alvo;
  });
}
```

Assim registros antigos (traço) continuam aparecendo quando o filtro vier de Config (barra normalizada para traço).

### Pontos que passam a usar o helper (substituem arrays hardcoded)

1. Filtro de AL em `carregarModuloDiretoria` (index.html ~11684) — construção do `<select id="diretoria-filtro-al">`.
2. Form single de clube — `mostrarModalFormularioDirigente` (index.html ~12471-12473).
3. Form single de Gabinete — `mostrarModalFormularioDirigenteGabinete` (index.html ~12561-12563).
4. Form single sem nomes — `mostrarModalFormularioDirigenteSemNomes`.
5. Modal de lote (Parte 2).

Fallback: se Config vier vazio (`als.length === 0`), usar `obterAlAtual()` do backend como única opção, para a tela nunca ficar sem AL.

---

## Parte 2 — Modal de cadastro em lote

`mostrarModalCadastrarDiretoria(clubeForcado)` substitui o stub. Ramifica por:

```
var ehGabinete = clubeForcado === 'Gabinete Distrital';
var clubeAlvo = clubeForcado || (usuarioLogado ? usuarioLogado.clube : '');
```

### Estrutura do modal

- Cabeçalho: "Cadastrar Diretoria Completa".
- **AL único no topo** (`<select id="diretoria-lote-al">`, populado por `carregarAnosLeonisticos`).
- **Tabela de linhas** (`<tbody id="diretoria-lote-linhas">`), colunas:
  - **Clube normal:** Cargo (texto) · Pessoa (select) · Foto (file, opcional) · remover (✕).
  - **Gabinete:** Clube origem (select) · Pessoa (select dependente) · Cargo (texto) · Foto (opcional) · remover (✕).
- Botão `[+ Adicionar cargo]` (`adicionarLinhaDiretoria()`).
- Rodapé: `Cancelar` · `Salvar Diretoria` (`salvarDiretoriaLote()` no front → chama backend).

Linhas iniciais: **3** (clube) / **1** (gabinete).

### Carregamento de pessoas

- **Clube normal:** carrega 1x `listarPessoasParaNominataClube(clubeAlvo)` ao abrir o modal; guarda em `window.__loteRtmaList`; cada `<select>` de pessoa é renderizado a partir dessa lista (value = índice na lista).
- **Gabinete:** carrega clubes 1x (`listarClubesParaDirigenteGabinete`). Cada linha tem select de clube; `onchange` chama `recarregarPessoasLinhaGabinete(linhaEl)` que busca `listarPessoasParaDirigenteGabinete(clubeNome)`. Cache por clube em `window.__loteGabPessoasPorClube[clubeNome]` para não refazer fetch entre linhas.

### Gerenciamento de estado das linhas

Cada `<tr>` recebe um `data-row-id` incremental. Na hora de salvar, o estado é lido do DOM (não de um array paralelo), evitando dessincronização. Cada linha resolve seu `vinculo` a partir do índice selecionado na lista de pessoas correspondente (RTMA do clube, ou lista do Gabinete daquela linha).

### Validação (no `salvarDiretoriaLote` do front)

- AL obrigatório.
- Para cada linha **não vazia**: `cargo` e `pessoa` obrigatórios (e `clube origem` no Gabinete). Linha totalmente vazia é ignorada.
- Se nenhuma linha válida → alerta "Adicione ao menos um cargo com pessoa".
- Erros de validação listam quais linhas estão pendentes.

### Montagem do payload e envio

- Para cada linha válida, lê a foto (se houver) via `FileReader` → base64. Como `FileReader` é assíncrono, agregar com `Promise.all` (ou contador de callbacks) antes de enviar.
- `vinculo` de cada item é serializado como string JSON (reusar `vinculoParaStringGAS`), pelo mesmo motivo do fluxo single (objetos perdem chaves no `google.script.run`).
- Envia **uma** chamada `salvarDiretoriaLote(clube, alNormalizado, itensJson)` ao backend.

### Provisionamento de acesso (client-side, pós-salvar)

Após o retorno de sucesso do lote, o front itera as linhas salvas chamando `provisionarAcessoPortalAposNominata(clube, cargo, nome, al, vinculoStr)` **sequencialmente** (uma por vez). A função já ignora cargos fora de Secretário/Diretor de Campanhas (retorna `ignorado`), então não há trabalho extra para os demais. Isso espelha o fluxo single e mantém o INSERT do lote rápido (sem risco de timeout por provisionar N acessos no servidor).

### Fechamento e refresh

Ao concluir, fecha o modal e recarrega a lista correta: `carregarDirigentesGabinete()` se Gabinete, senão `carregarDirigentes()`. Mostra resumo: "X dirigentes cadastrados, Y já existiam, Z com erro" a partir de `resultados`.

---

## Parte 3 — Backend: `salvarDiretoriaLote`

Novo em `lib/code.js`:

```
async function salvarDiretoriaLote(clube, anoLeonistico, itensJson) {
  // itensJson: JSON string de [{ cargo, nome, vinculo (string|obj), fotoBase64 }]
  // parse defensivo
  // para cada item: chama salvarDirigente(clube, cargo, nome, fotoBase64, anoLeonistico, vinculo)
  //   (reusa idempotência, upload de foto, lock — sem duplicar lógica)
  // coleta resultado por item
  // retorna { sucesso, resultados: [{cargo, nome, ok, idempotente, erro}], totalOk, totalErro, totalIdem }
}
```

- **Exposição:** adicionar `salvarDiretoriaLote` ao `module.exports` de `lib/code.js` (~linha 18908, junto de `salvarDirigente`). É o registro que torna a função callable via `google.script.run` (o dispatcher em `api/index.js` faz `Object.assign(allFunctions, mod)` sobre o que os módulos exportam).
- Reusa **integralmente** `salvarDirigente` por item — nada de reimplementar upload/idempotência.
- `anoLeonistico` chega já normalizado (traço) do front; ainda assim aplica `String(...).trim()` defensivo.
- Erros por item não abortam o lote — cada item é independente; o erro fica no `resultados[i].erro`.
- `sucesso: true` se a rotina rodou (mesmo com alguns itens em erro); os totais informam o desfecho.

---

## Parte 4 — Polimento da barra de filtros

Em `carregarModuloDiretoria` (`public/index.html`):

- `controlsDiv`: trocar `flex-wrap: nowrap` por `flex-wrap: wrap`, `align-items: center`, `gap` consistente, e alinhar o grupo à direita do header (`margin-left: auto` no grupo ou `justify-content` no header já existente).
- Padronizar **altura 40px** e raio/borda entre botões (`Novo Dirigente`, `Cadastrar Diretoria`) e selects (AL, Clube) — já estão perto disso; unificar via uma classe utilitária inline compartilhada.
- Garantir que no mobile a barra quebre em múltiplas linhas sem estourar largura (os selects têm `width` fixo — trocar para `min-width` + `max-width: 100%`).
- Melhorar o **empty state** do `#diretoria-grid-container` quando não há dirigentes no AL/clube filtrado (mensagem + CTA para cadastrar).

Cards de dirigente (`renderizarDirigentes`) **não** são alterados.

---

## Estratégia de testes / verificação

Projeto é HTML+GAS-shim sobre Vercel/Supabase, sem suíte de testes automatizada no front. Verificação manual guiada:

1. **AL de Config:** abrir Diretoria → filtro lista os ALs de Configurações; AL ativo pré-selecionado; registros antigos (traço) aparecem sob o AL correspondente.
2. **Filtro/normalização:** cadastrar um dirigente e conferir que ele aparece no filtro do AL selecionado, independentemente de barra/traço.
3. **Lote clube:** cadastrar 3 cargos de uma vez; conferir na lista; reenviar os mesmos → idempotência (não duplica).
4. **Lote Gabinete:** clube origem por linha carrega pessoas certas; salva com `clube='Gabinete Distrital'`.
5. **Provisionamento:** linha com cargo "Secretário" gera acesso; cargo comum é ignorado sem erro.
6. **UI:** barra alinhada em desktop e mobile (redimensionar janela); empty state aparece quando filtro não retorna nada.

Backend `salvarDiretoriaLote` pode ser exercitado por chamada direta (Node) com um `itensJson` de 2 itens, validando o shape de `resultados`.

## Arquivos afetados

- `public/index.html` — helper AL, 4 selects de AL, modal de lote (clube+gabinete), `salvarDiretoriaLote` (front), provisionamento sequencial, polish da barra.
- `lib/code.js` — `salvarDiretoriaLote` (backend).
