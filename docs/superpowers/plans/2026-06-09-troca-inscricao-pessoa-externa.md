# Plano: Troca de Inscrição com Pessoa Externa ao RTMA

**Data:** 2026-06-09  
**Branch:** worktree-feat-troca-inscricao-pessoa-externa  
**Objetivo:** No modal de troca de inscrição de eventos, adicionar opção de trocar com pessoa não cadastrada no RTMA (convidado externo), seguindo o mesmo padrão do formulário de convidados.

---

## Contexto

### Fluxo atual
`abrirModalTrocarInscricao` → modal com select de clube + select de pessoa → `confirmarTrocaInscricao` → `trocarInscricaoEvento` (GAS)

### Payload atual para `trocarInscricaoEvento`
```js
{
  eventoId, inscricaoId,
  clubeNome,   // nome do clube RTMA
  pessoaNome,  // nome da pessoa cadastrada
  pessoaTipo,  // tipo/cargo dela no RTMA
  usuarioEmail
}
```

### Padrão do formulário de convidados (form_evento_convidados.html)
Campos para pessoa externa:
- `pessoa_nome` (obrigatório)
- `pessoa_cargo` (opcional)
- Checkbox "Representa clube do D8?" → select de clube (lista D8)
- Campo `representacao` (se não for clube D8)

---

## Tasks

### Task 1 — Frontend: Adicionar seção de pessoa externa no modal de troca

**Arquivo:** `public/index.html`

**Função alvo:** `abrirModalTrocarInscricao` (linha ~19326)

#### 1.1 Carregar clubes D8 antes de renderizar o modal

Na função `carregarClubesParaTrocaInscricao`, os clubes já são carregados via `rtmaObterTodosClubes`. Guardar essa lista em variável de escopo do módulo (`eventoTrocaClubesD8Lista = []`) para reutilizar no select da pessoa externa.

Adicionar logo após o `select.innerHTML` ser preenchido com os clubes (dentro do `withSuccessHandler`):
```js
eventoTrocaClubesD8Lista = clubesNormalizados;
preencherSelectClubeD8TrocaExterna(clubesNormalizados);
```

#### 1.2 Adicionar variável de módulo

Junto às outras variáveis de estado de troca (~linha 7562):
```js
let eventoTrocaClubesD8Lista = [];
```

#### 1.3 Adicionar HTML da seção externa no modal

Dentro do `modalHTML` em `abrirModalTrocarInscricao`, após o `.form-group` da Pessoa, inserir:

```html
<!-- Divider -->
<div style="border-top:1px solid #dee2e6; margin: 14px 0 10px 0;"></div>

<!-- Checkbox flag -->
<div class="form-group" style="margin-bottom:10px;">
  <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:normal;">
    <input type="checkbox" id="troca-pessoa-externa-flag" onchange="toggleTrocaPessoaExterna(this.checked)">
    <span>Trocar com pessoa não cadastrada no RTMA</span>
  </label>
</div>

<!-- Seção externa (oculta por padrão) -->
<div id="troca-pessoa-externa-section" style="display:none;">
  <div class="form-group">
    <label>Nome <span style="color:#dc3545;">*</span></label>
    <input type="text" id="troca-externa-nome" placeholder="Nome completo">
  </div>
  <div class="form-group">
    <label>Cargo <small style="font-weight:normal; color:#6c757d;">(opcional)</small></label>
    <input type="text" id="troca-externa-cargo" placeholder="Ex: Presidente, Assessor">
  </div>
  <div class="form-group">
    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:normal;">
      <input type="checkbox" id="troca-externa-representa-clube" onchange="toggleTrocaExternaClube(this.checked)">
      <span>Representa clube do D8?</span>
    </label>
    <div id="troca-externa-clube-section" style="display:none; margin-top:8px; margin-left:20px;">
      <label>Clube do D8</label>
      <select id="troca-externa-clube-d8">
        <option value="">Selecione o clube</option>
      </select>
    </div>
  </div>
  <div class="form-group" id="troca-externa-representacao-group">
    <label>Representação <small style="font-weight:normal; color:#6c757d;">(se não for clube do D8)</small></label>
    <input type="text" id="troca-externa-representacao" placeholder="Ex: Empresa Y, Individual">
  </div>
</div>
```

#### 1.4 Adicionar funções auxiliares

Após `atualizarTipoPessoaTrocaInscricao` (~linha 19443), adicionar:

```js
function toggleTrocaPessoaExterna(ativo) {
  const section = document.getElementById('troca-pessoa-externa-section');
  const grupoClube = document.getElementById('troca-inscricao-clube')?.closest('.form-group');
  const grupoPessoa = document.getElementById('troca-inscricao-pessoa')?.closest('.form-group');
  if (section) section.style.display = ativo ? '' : 'none';
  if (grupoClube) grupoClube.style.display = ativo ? 'none' : '';
  if (grupoPessoa) grupoPessoa.style.display = ativo ? 'none' : '';
  if (!ativo) {
    // Limpar campos externos ao desmarcar
    const nome = document.getElementById('troca-externa-nome');
    const cargo = document.getElementById('troca-externa-cargo');
    const repClube = document.getElementById('troca-externa-representa-clube');
    const repSec = document.getElementById('troca-externa-clube-section');
    const rep = document.getElementById('troca-externa-representacao');
    if (nome) nome.value = '';
    if (cargo) cargo.value = '';
    if (repClube) repClube.checked = false;
    if (repSec) repSec.style.display = 'none';
    if (rep) rep.value = '';
  }
}

function toggleTrocaExternaClube(ativo) {
  const sec = document.getElementById('troca-externa-clube-section');
  const repGroup = document.getElementById('troca-externa-representacao-group');
  if (sec) sec.style.display = ativo ? '' : 'none';
  if (repGroup) repGroup.style.display = ativo ? 'none' : '';
  if (!ativo) {
    const sel = document.getElementById('troca-externa-clube-d8');
    if (sel) sel.value = '';
  }
}

function preencherSelectClubeD8TrocaExterna(clubes) {
  const sel = document.getElementById('troca-externa-clube-d8');
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecione o clube</option>';
  (clubes || []).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.text = c;
    sel.appendChild(opt);
  });
}
```

#### 1.5 Atualizar `confirmarTrocaInscricao`

Antes da validação atual (`const clubeNome = ...`), verificar se a flag externa está marcada:

```js
const flagExterna = document.getElementById('troca-pessoa-externa-flag');
const pessoaExterna = flagExterna && flagExterna.checked;

if (pessoaExterna) {
  const nomeExt = (document.getElementById('troca-externa-nome')?.value || '').trim();
  if (!nomeExt) {
    eventosNotificar('Informe o nome da pessoa externa.', 'error');
    return;
  }
  const cargoExt = (document.getElementById('troca-externa-cargo')?.value || '').trim();
  const representaClubeExt = !!(document.getElementById('troca-externa-representa-clube')?.checked);
  const clubeD8Ext = representaClubeExt ? (document.getElementById('troca-externa-clube-d8')?.value || '').trim() : '';
  const representacaoExt = !representaClubeExt ? (document.getElementById('troca-externa-representacao')?.value || '').trim() : '';

  // clubeNome para o backend: clube D8 (se tiver) ou representação ou "Externo"
  const clubeNomeExt = clubeD8Ext || representacaoExt || 'Externo';

  // Confirmar ação
  const mensagemExt = `Confirma trocar esta inscrição para pessoa externa?\n\nDe: ${eventoTrocaInscricaoAtual.pessoaAtual || '-'}\nPara: ${nomeExt}${cargoExt ? ` (${cargoExt})` : ''}`;
  const confirmar = (typeof confirmarModal === 'function')
    ? confirmarModal(mensagemExt, 'Confirmar troca', 'Confirmar', 'Cancelar', 'warning')
    : Promise.resolve(window.confirm(mensagemExt));

  confirmar.then(confirmado => {
    if (!confirmado) return;
    mostrarLoadingOverlay('Trocando inscrição...');
    google.script.run
      .withSuccessHandler(resultado => {
        esconderLoadingOverlay();
        if (!resultado || !resultado.sucesso) {
          const msg = (resultado && resultado.erro) ? resultado.erro : 'Erro ao trocar inscrição.';
          eventosNotificar(msg, 'error');
          if (typeof mostrarBoxEventos === 'function') mostrarBoxEventos('Erro', msg);
          return;
        }
        const modal = document.getElementById('modal-trocar-inscricao');
        if (modal) modal.remove();
        if (resultado.pendente) {
          const msgPendente = resultado.mensagem || 'Solicitação enviada para aprovação.';
          eventosNotificar(msgPendente, 'info');
          if (typeof mostrarBoxEventos === 'function') mostrarBoxEventos('Solicitação enviada', msgPendente);
          return;
        }
        eventosNotificar('Inscrição atualizada com sucesso.');
        if (typeof mostrarBoxEventos === 'function') mostrarBoxEventos('Sucesso', 'Troca realizada com sucesso.');
        carregarRelatorioInscritosEvento(true);
        carregarInscritosClubeEvento(true);
      })
      .withFailureHandler(err => {
        esconderLoadingOverlay();
        const msg = (err && err.message) ? err.message : 'Erro ao trocar inscrição.';
        eventosNotificar(msg, 'error');
        if (typeof mostrarBoxEventos === 'function') mostrarBoxEventos('Erro', msg);
      })
      .trocarInscricaoEvento({
        eventoId: eventoId,
        inscricaoId: eventoTrocaInscricaoAtual.inscricaoId,
        clubeNome: clubeNomeExt,
        pessoaNome: nomeExt,
        pessoaTipo: cargoExt || 'Convidado',
        pessoaExterna: true,
        pessoaCargo: cargoExt,
        pessoaRepresentaClube: representaClubeExt,
        pessoaClubeD8: clubeD8Ext,
        pessoaRepresentacao: representacaoExt,
        usuarioEmail: (usuarioLogado && usuarioLogado.email) ? usuarioLogado.email : ''
      });
  });
  return; // interromper fluxo normal
}
```

---

### Task 2 — Backend: Atualizar `trocarInscricaoEvento` para aceitar pessoas externas

**Arquivo principal:** `lib/code.js` (linha ~8984)  
**Arquivo secundário:** `code - funcional.gs` (linha ~8796) — espelhar as mesmas mudanças

#### 2.1 Relaxar validação quando `pessoaExterna === true`

Substituir o bloco de validação inicial:
```js
// ANTES:
if (!dados || !dados.eventoId || !dados.inscricaoId || !dados.clubeNome || !dados.pessoaNome) {
  return { sucesso: false, erro: 'Evento, inscrição, clube e pessoa são obrigatórios.' };
}
```

Por:
```js
// DEPOIS:
if (!dados || !dados.eventoId || !dados.inscricaoId || !dados.pessoaNome) {
  return { sucesso: false, erro: 'Evento, inscrição e pessoa são obrigatórios.' };
}
const pessoaExterna = !!dados.pessoaExterna;
if (!pessoaExterna && !dados.clubeNome) {
  return { sucesso: false, erro: 'Clube é obrigatório para pessoas cadastradas no RTMA.' };
}
```

E mais abaixo, onde `!clubeNome || !pessoaNome` é verificado (linha ~8994):
```js
// ANTES:
if (!eventoId || !inscricaoId || !clubeNome || !pessoaNome) {
  return { sucesso: false, erro: 'Dados obrigatórios inválidos.' };
}
// DEPOIS:
if (!eventoId || !inscricaoId || !pessoaNome || (!pessoaExterna && !clubeNome)) {
  return { sucesso: false, erro: 'Dados obrigatórios inválidos.' };
}
```

#### 2.2 Incluir dados extras em `dadosNovos` quando for pessoa externa

No bloco `dadosNovos` da solicitação (~linha 9046):
```js
dadosNovos: {
  clubeDestino: clubeNome,
  pessoaNome: pessoaNome,
  pessoaTipo: pessoaTipo || '',
  eventoId: eventoId,
  inscricaoId: inscricaoId,
  // Extra para pessoas externas:
  ...(pessoaExterna ? {
    pessoaExterna: true,
    pessoaCargo: String(dados.pessoaCargo || '').trim(),
    pessoaRepresentaClube: !!dados.pessoaRepresentaClube,
    pessoaClubeD8: String(dados.pessoaClubeD8 || '').trim(),
    pessoaRepresentacao: String(dados.pessoaRepresentacao || '').trim()
  } : {})
}
```

#### 2.3 Ajustar a mensagem de retorno para pessoa externa

Substituir a mensagem de retorno de sucesso:
```js
// ANTES:
mensagem: 'Solicitação enviada para aprovação do clube que receberá a inscrição.'
// DEPOIS:
mensagem: pessoaExterna
  ? 'Solicitação de troca para pessoa externa enviada para aprovação.'
  : 'Solicitação enviada para aprovação do clube que receberá a inscrição.'
```

---

## Critérios de aceitação

1. Checkbox "Trocar com pessoa não cadastrada no RTMA" aparece no modal de troca.
2. Ao marcar o checkbox: selects de clube e pessoa ficam ocultos; seção de pessoa externa fica visível.
3. Ao desmarcar: volta ao estado original, campos externos são limpos.
4. Campo "Nome" da pessoa externa é obrigatório — validação impede envio sem nome.
5. Campo "Cargo" é opcional.
6. Checkbox "Representa clube do D8?" funciona igual ao formulário de convidados:
   - Marcado → mostra select de clubes D8 (mesma lista carregada para a troca regular), oculta campo Representação.
   - Desmarcado → mostra campo Representação, oculta select de clubes.
7. `trocarInscricaoEvento` no backend aceita `pessoaExterna: true` sem exigir `clubeNome` de RTMA.
8. Backend salva todos os campos extras (`pessoaCargo`, `pessoaRepresentaClube`, `pessoaClubeD8`, `pessoaRepresentacao`) em `dadosNovos` da solicitação.
9. Mensagem de retorno diferenciada para pessoa externa.
10. Fluxo regular de troca (com pessoa do RTMA) permanece 100% intacto.
