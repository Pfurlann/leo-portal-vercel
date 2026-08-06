# Lista de Presença — Amigos LEO e Conselheiros

**Data:** 2026-08-06
**Arquivo afetado:** `public/rtma.html` (bloco `// === LISTA DE PRESENÇA (Word / ABNT) ===`)

## Problema

A lista de presença gerada na aba Pessoas do RTMA inclui apenas associados ativos
(Associado LEO, Associado LEO e LEO/Leão, Associado LEO/Leão, Pré LEO). Amigos LEO e
Conselheiros — cadastrados em aba própria, tabela `amigos_conselheiros` — ficam de fora,
obrigando quem conduz a reunião a acrescentá-los à mão no Word.

## Diferenças de modelo de dados

| campo | Pessoas | Amigos/Conselheiros |
|---|---|---|
| `tipo` | Associado LEO, Associado LEO e LEO/Leão, Associado LEO/Leão, Pré LEO | `Amigo(a) LEO`, `Conselheiro(a)` |
| `status` | `ativo` / `inativo` | **não existe** |
| `numeroAssociado` | sim | **não existe** |
| `lionsClube` | não | sim (preenchido só para conselheiros) |
| backend | `buscarPessoasRTMA(clube)` | `buscarAmigosConselheiros(clube, tipo)` |

Consequências: não há filtro de status a aplicar sobre amigos, e a coluna "Nº Associado"
não faz sentido para eles — daí a segunda tabela com colunas próprias.

## Design

### 1. Busca

`confirmarGerarListaPresenca()` passa a buscar pessoas e amigos em paralelo com
`Promise.allSettled`, de modo que a falha de um não derruba o outro.

Nova `obterAmigosListaPresencaDoServidor(clube)` espelha
`obterPessoasListaPresencaDoServidor`: chama `google.script.run.buscarAmigosConselheiros(clube, null)`,
normaliza a resposta (array direto, `.dados` ou `.amigos`) e rejeita em falha.

Fallback por fonte, mantendo o padrão já existente:

- pessoas falharam → `coletarPessoasListaPresenca(clube)` (usa `pessoasAtuais`)
- amigos falharam → `coletarAmigosListaPresenca(clube)` (usa `amigosAtuais`)

Se o fallback de amigos também vier vazio, o documento sai só com associados e o usuário
recebe notificação `aviso`. A geração nunca é abortada por falha na busca de amigos.

### 2. Filtro e ordenação

`prioridadeAmigoListaPresenca(tipo)` reaproveita `normalizarTipoListaPresenca` (remove
acentos, minúsculas):

- `Conselheiro(a)` → 1
- `Amigo(a) LEO` → 2
- qualquer outro → 99 (descartado por `tipoEhAmigoListaPresenca`)

`filtrarOrdenarAmigosListaPresenca(fonte, clube)` mantém só os tipos válidos, filtra por
clube quando `clube` for informado (usado apenas no fallback local — os dados vindos do
servidor já vêm filtrados, mesmo tratamento dado às pessoas para evitar mismatch de
acentuação) e ordena por prioridade e depois por nome (`localeCompare` pt-BR).

### 3. Documento Word

`gerarDocumentoListaPresenca()` ganha o parâmetro `amigos`. Quando `amigos.length > 0`,
acrescenta após a tabela de associados:

- parágrafo **AMIGOS LEO E CONSELHEIROS** — Times New Roman 12 pt bold, centralizado,
  `keepNext: true` para não ficar órfão no fim da página
- segunda tabela reusando `criarCelulaListaPresenca` (mesmas bordas, margens e altura
  mínima de linha de 1134 twips ≈ 2 cm para assinatura manuscrita)

Colunas da segunda tabela, somando os mesmos 9072 DXA (16 cm úteis do A4 com margens ABNT):

| coluna | largura (DXA) | conteúdo |
|---|---|---|
| Nome | 2600 | `a.nome` |
| Categoria | 2000 | `a.tipo` |
| Lions Clube | 1600 | `a.lionsClube` (vazio para Amigos LEO) |
| Assinatura | 2872 | vazio |

### 4. Rodapé

```
Total de associados ativos na lista: N
Total de Amigos LEO e Conselheiros: M
```

A segunda linha só é emitida quando `M > 0`.

### 5. Casos de borda

- clube sem amigos → subtítulo e segunda tabela omitidos por completo
- zero associados **e** zero amigos → mantém o erro atual, com texto ampliado para citar
  Amigos LEO e Conselheiros
- zero associados mas com amigos → documento sai só com a segunda seção
- notificação de sucesso: `Lista de presença gerada com N associado(s) e M convidado(s)`

## Fora de escopo

- Nenhuma alteração no modal (sem campos ou checkboxes novos) — as categorias entram sempre
- Nenhuma alteração no backend — `buscarAmigosConselheiros` já é exposta via `api/index.js`
