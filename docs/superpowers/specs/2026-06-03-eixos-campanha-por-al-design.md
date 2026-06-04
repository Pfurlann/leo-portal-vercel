# Eixos de Campanha por AL — Design Spec

**Data:** 2026-06-03  
**Status:** Aprovado

## Problema

Os eixos de campanha (D8 e DM) são atualmente lidos de uma aba fixa no Google Sheets ("Eixos"), sem vínculo com nenhum Ano Leonístico (AL). Isso impede que eixos diferentes sejam configurados para ALs diferentes, e não há interface no portal para gerenciá-los.

## Solução

Criar uma seção de cadastro de eixos de campanha nas Configurações do sistema, atrelada ao registro de AL. O seletor de eixos no formulário de campanhas passa a exibir apenas os eixos do AL ativo.

---

## Banco de Dados

### Nova tabela: `eixos_campanha`

```sql
CREATE TABLE eixos_campanha (
  id         uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  al         text    NOT NULL,
  nome       text    NOT NULL,
  tipo       text    NOT NULL CHECK (tipo IN ('d8', 'dm')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_eixos_campanha_al_tipo ON eixos_campanha (al, tipo);
```

- `al`: string no formato "AAAA-AAAA" (ex: "2025-2026"), referencia o campo `al` da tabela `configuracoes`
- `tipo`: `'d8'` para eixos D8, `'dm'` para eixos DM
- Sem FK formal para `configuracoes` para evitar restrições de deploy

---

## Backend

### `lib/portal_supabase.js`

**Adicionar à constante `PORTAL_SUPABASE_TABLES`:**
```js
eixos_campanha: 'eixos_campanha'
```

**Novas funções:**

- `portalNormalizeEixoCampanhaRow(row)` — normaliza row snake_case → camelCase (`{id, al, nome, tipo, createdAt}`)
- `portalListarEixosCampanha(al)` — GET `eixos_campanha?al=eq.{al}&order=tipo.asc,nome.asc`
- `portalCriarEixoCampanha({al, nome, tipo})` — POST com `Prefer: return=representation`
- `portalExcluirEixoCampanha(id)` — DELETE `eixos_campanha?id=eq.{id}`

### `lib/code.js`

**Atualizar `getEixos()`:**
- Busca AL ativo via `portalBuscarConfiguracaoAtiva()`
- Retorna eixos de `eixos_campanha` filtrados por `al` e particionados por `tipo`
- Retorno: `{ eixo: string[], eixoDM: string[] }` (mantém contrato atual do frontend)
- Se AL ativo não encontrado ou tabela vazia: retorna `{ eixo: [], eixoDM: [] }` (abandona Google Sheets)

**Novas funções expostas:**
- `listarEixosCampanha(al)` → `{ sucesso, eixos: [{id, al, nome, tipo}], erro }`
- `salvarEixoCampanha({al, nome, tipo})` → `{ sucesso, eixo: {...}, erro }`
- `excluirEixoCampanha(id)` → `{ sucesso, erro }`

Exportar as três novas funções no objeto de exports do módulo.

---

## Frontend (`public/index.html`)

### Seção nova em `carregarModuloConfiguracoes()`

Visível apenas para `isSecretaria || isDistrital` (mesma condição da seção "Clubes" existente).

**Layout da seção:**
```
┌─ Eixos de Campanha ────────────────────────────────────────────┐
│  AL: [2025-2026 ▼]                                             │
│                                                                │
│  Eixos D8                              Eixos DM               │
│  ┌──────────────────────┐              ┌──────────────────────┐│
│  │ Saúde e Bem-Estar  ✕ │              │ Arrecadação        ✕ ││
│  │ Meio Ambiente      ✕ │              │ Voluntariado       ✕ ││
│  │ [+ Adicionar]        │              │ [+ Adicionar]        ││
│  └──────────────────────┘              └──────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

**Comportamento:**
- Seletor de AL: populado com ALs da tabela `configuracoes` (já carregados no módulo); default = AL ativo
- Ao trocar AL: recarrega lista de eixos via `listarEixosCampanha(al)`
- Adicionar eixo: campo de texto inline + botão confirmar → chama `salvarEixoCampanha({al, nome, tipo})`; atualiza lista sem reload
- Remover eixo: botão ✕ + `confirm()` → chama `excluirEixoCampanha(id)`; remove item da lista

**Funções JS novas:**
- `carregarEixosCampanhaConfig(al)` — carrega e renderiza listas D8 e DM para o AL selecionado
- `adicionarEixoCampanha(al, tipo)` — lê input inline, chama backend, atualiza DOM
- `removerEixoCampanha(id, al)` — confirma + chama backend + remove item do DOM

**Seletor de eixos no formulário de campanha:**  
Sem alteração no frontend de campanhas. `getEixos()` no backend agora retorna eixos do AL ativo.

---

## Fluxo de dados (seletor de campanha)

```
carregarEixos() [frontend]
  → getEixos() [backend]
    → portalBuscarConfiguracaoAtiva() → al = "2025-2026"
    → portalListarEixosCampanha("2025-2026")
    → return { eixo: ["Saúde e Bem-Estar", ...], eixoDM: ["Arrecadação", ...] }
  → _aplicarEixosAoDOM(obj)
```

---

## Permissões

| Ação | Perfis permitidos |
|------|------------------|
| Ver seção de eixos nas configurações | `isSecretaria`, `isDistrital` |
| Criar/excluir eixo | `isSecretaria`, `isDistrital` |
| Usar eixos no form de campanha | Todos os perfis com acesso a campanhas |

---

## Arquivos alterados

| Arquivo | Tipo de mudança |
|---------|----------------|
| `lib/portal_supabase.js` | Adicionar tabela + 4 funções novas |
| `lib/code.js` | Atualizar `getEixos()` + 3 funções novas |
| `public/index.html` | Adicionar seção de eixos no módulo de configurações + 3 funções JS |

---

## O que NÃO muda

- Contrato de `getEixos()` com o frontend (`{eixo: [], eixoDM: []}`)
- `carregarEixos()` no frontend de campanhas (sem mudança de assinatura)
- Tabela `configuracoes` (sem colunas novas)
- Fluxo de autenticação e permissões existentes
