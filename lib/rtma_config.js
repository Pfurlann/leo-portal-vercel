// === CONFIGURAÇÕES E CONSTANTES - DISTRITO LEO LD-8 ===

const RTMA_PLANILHA_ACESSO_ID_FALLBACK = "1hZ0mpzgIbN0MRmZaYlb4LnNYWL22WYOJO3R8_8JwfR4";
const RTMA_ABA_ACESSOS_FALLBACK = "Acessos Clubes";
const RTMA_ABA_RTMA_FALLBACK = "RTMA";
const RTMA_ABA_AMIGOS_FALLBACK = "Amigos LEO e Conselheiros";

const RTMA_ABA_RTMA = RTMA_ABA_RTMA_FALLBACK;
const RTMA_ABA_AMIGOS = RTMA_ABA_AMIGOS_FALLBACK;

const RTMA_REGIOES = {
  "A": [
    "Alpha Iraceminha",
    "Alpha Modelo",
    "Alpha Pinhalzinho",
    "Ômega Cunha Porã",
    "Ômega Guaraciaba",
    "Ômega Iraceminha",
    "Ômega Itapiranga",
    "Ômega Maravilha",
    "Ômega Modelo",
    "Ômega Mondaí",
    "Ômega Pinhalzinho",
    "Ômega São José do Cedro",
    "Ômega São Miguel do Oeste Universidade",
    "Ômega Saudades"
  ],
  "B": [
    "Alpha Faxinal dos Guedes",
    "Ômega Abelardo Luz",
    "Ômega Campo Erê",
    "Ômega Chapecó Integração",
    "Ômega Concórdia Vila São Miguel Renovação",
    "Ômega Faxinal dos Guedes",
    "Ômega São Lourenço do Oeste",
    "Ômega Seara Centenário",
    "Ômega Xanxerê",
    "Ômega Xaxim Coração Verde"
  ],
  "D": [
    "Alpha Videira Perdizes",
    "Ômega Caçador",
    "Ômega Fraiburgo",
    "Ômega Monte Carlo",
    "Ômega Porto União Villagrann",
    "Ômega Videira Cinquentenário"
  ]
};

// On Vercel, obterMapaClubesSupabase is defined in rtma_supabase.js
// We resolve it lazily to avoid circular deps
function getRtmaConfig() {
  return {
    planilhaAcessoId: RTMA_PLANILHA_ACESSO_ID_FALLBACK,
    abas: {
      acessos: RTMA_ABA_ACESSOS_FALLBACK,
      rtma: RTMA_ABA_RTMA,
      amigos: RTMA_ABA_AMIGOS
    },
    regioes: RTMA_REGIOES,
    planilhasClubes: {}
  };
}

function rtmaClubeExiste(clube) {
  for (const [regiao, clubes] of Object.entries(RTMA_REGIOES)) {
    if (clubes.includes(clube)) return true;
  }
  return false;
}

function rtmaObterRegiaoDoClube(clube) {
  for (const [regiao, clubes] of Object.entries(RTMA_REGIOES)) {
    if (clubes.includes(clube)) return regiao;
  }
  return null;
}

function obterRegiaoDoClube(clube) {
  return rtmaObterRegiaoDoClube(clube);
}

function rtmaObterClubesDaRegiao(regiao) {
  return RTMA_REGIOES[regiao] || [];
}

function rtmaObterTodosClubes() {
  const todosClubes = [];
  Object.values(RTMA_REGIOES).forEach(clubes => {
    todosClubes.push(...clubes);
  });
  return todosClubes;
}

function rtmaObterListaClubesParaRelatorio(config) {
  const c = config || getRtmaConfig();
  const keys = Object.keys(c.planilhasClubes || {});
  if (keys.length > 0) return keys;
  return rtmaObterTodosClubes();
}

module.exports = {
  RTMA_PLANILHA_ACESSO_ID_FALLBACK,
  RTMA_ABA_ACESSOS_FALLBACK,
  RTMA_ABA_RTMA_FALLBACK,
  RTMA_ABA_AMIGOS_FALLBACK,
  RTMA_ABA_RTMA,
  RTMA_ABA_AMIGOS,
  RTMA_REGIOES,
  getRtmaConfig,
  rtmaClubeExiste,
  rtmaObterRegiaoDoClube,
  obterRegiaoDoClube,
  rtmaObterClubesDaRegiao,
  rtmaObterTodosClubes,
  rtmaObterListaClubesParaRelatorio,
};
