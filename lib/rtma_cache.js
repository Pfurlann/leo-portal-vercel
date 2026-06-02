// === GESTÃO DE CACHE - DISTRITO LEO LD-8 ===
const { CacheService } = require('./gas-compat');
const { logInfo, logWarn, logError } = require('./rtma_utils');
const { RTMA_REGIOES, rtmaObterTodosClubes } = require('./rtma_config');

const CACHE_CONFIG = {
  PESSOAS: 1800,
  AMIGOS: 1800,
  FILTROS: 3600,
  FILTROS_DISTRITO: 3600,
  PREFIXOS: {
    PESSOAS: 'pessoas_',
    AMIGOS: 'amigos_',
    FILTROS: 'filtros_',
    FILTROS_DISTRITO: 'filtros_distrito_',
    FILTROS_REGIAO: 'filtros_regiao_'
  },
  VERSOES: {
    PESSOAS: 'v2',
    AMIGOS: 'v1',
    FILTROS: 'v2'
  }
};

class CacheManager {
  constructor() {
    this.cache = CacheService.getScriptCache();
  }

  gerarChave(prefixo, identificador, versao) {
    return `${prefixo}${identificador}_${versao}`;
  }

  obter(chave) {
    try {
      const dados = this.cache.get(chave);
      if (dados) {
        logInfo('CacheManager.obter', `Cache hit para: ${chave}`);
        return JSON.parse(dados);
      }
      logInfo('CacheManager.obter', `Cache miss para: ${chave}`);
      return null;
    } catch (error) {
      logError('CacheManager.obter', `Erro ao obter cache: ${chave}`, error.message);
      return null;
    }
  }

  armazenar(chave, dados, expiracao) {
    try {
      const dadosSerializados = JSON.stringify(dados);
      this.cache.put(chave, dadosSerializados, expiracao);
      logInfo('CacheManager.armazenar', `Cache armazenado: ${chave}`, {
        tamanho: dadosSerializados.length,
        expiracao: expiracao
      });
      return true;
    } catch (error) {
      logError('CacheManager.armazenar', `Erro ao armazenar cache: ${chave}`, error.message);
      return false;
    }
  }

  remover(chave) {
    try {
      this.cache.remove(chave);
      logInfo('CacheManager.remover', `Cache removido: ${chave}`);
      return true;
    } catch (error) {
      logError('CacheManager.remover', `Erro ao remover cache: ${chave}`, error.message);
      return false;
    }
  }

  limparPorPrefixo(prefixo) {
    try {
      logWarn('CacheManager.limparPorPrefixo', `Limpeza por prefixo não totalmente suportada: ${prefixo}`);
    } catch (error) {
      logError('CacheManager.limparPorPrefixo', `Erro ao limpar cache por prefixo: ${prefixo}`, error.message);
    }
  }
}

const cacheManager = new CacheManager();

function obterPessoasCache(clube) {
  const chave = cacheManager.gerarChave(CACHE_CONFIG.PREFIXOS.PESSOAS, clube, CACHE_CONFIG.VERSOES.PESSOAS);
  return cacheManager.obter(chave);
}

function armazenarPessoasCache(clube, pessoas) {
  const chave = cacheManager.gerarChave(CACHE_CONFIG.PREFIXOS.PESSOAS, clube, CACHE_CONFIG.VERSOES.PESSOAS);
  return cacheManager.armazenar(chave, pessoas, CACHE_CONFIG.PESSOAS);
}

function limparCachePessoas(clube) {
  const chave = cacheManager.gerarChave(CACHE_CONFIG.PREFIXOS.PESSOAS, clube, CACHE_CONFIG.VERSOES.PESSOAS);
  return cacheManager.remover(chave);
}

function obterAmigosCache(clube) {
  const chave = cacheManager.gerarChave(CACHE_CONFIG.PREFIXOS.AMIGOS, clube, CACHE_CONFIG.VERSOES.AMIGOS);
  return cacheManager.obter(chave);
}

function armazenarAmigosCache(clube, amigos) {
  const chave = cacheManager.gerarChave(CACHE_CONFIG.PREFIXOS.AMIGOS, clube, CACHE_CONFIG.VERSOES.AMIGOS);
  return cacheManager.armazenar(chave, amigos, CACHE_CONFIG.AMIGOS);
}

function limparCacheAmigos(clube) {
  const chave = cacheManager.gerarChave(CACHE_CONFIG.PREFIXOS.AMIGOS, clube, CACHE_CONFIG.VERSOES.AMIGOS);
  return cacheManager.remover(chave);
}

function obterFiltrosCache(clube) {
  const chave = cacheManager.gerarChave(CACHE_CONFIG.PREFIXOS.FILTROS, clube, CACHE_CONFIG.VERSOES.FILTROS);
  return cacheManager.obter(chave);
}

function armazenarFiltrosCache(clube, filtros) {
  const chave = cacheManager.gerarChave(CACHE_CONFIG.PREFIXOS.FILTROS, clube, CACHE_CONFIG.VERSOES.FILTROS);
  return cacheManager.armazenar(chave, filtros, CACHE_CONFIG.FILTROS);
}

function obterFiltrosDistritoCache(tipo, identificador = '') {
  const sufixo = identificador ? `_${identificador}` : '';
  const chave = cacheManager.gerarChave(CACHE_CONFIG.PREFIXOS.FILTROS_DISTRITO, `${tipo}${sufixo}`, CACHE_CONFIG.VERSOES.FILTROS);
  return cacheManager.obter(chave);
}

function armazenarFiltrosDistritoCache(tipo, filtros, identificador = '') {
  const sufixo = identificador ? `_${identificador}` : '';
  const chave = cacheManager.gerarChave(CACHE_CONFIG.PREFIXOS.FILTROS_DISTRITO, `${tipo}${sufixo}`, CACHE_CONFIG.VERSOES.FILTROS);
  return cacheManager.armazenar(chave, filtros, CACHE_CONFIG.FILTROS_DISTRITO);
}

function limparCacheClube(clube) {
  logInfo('limparCacheClube', `Limpando cache completo do clube: ${clube}`);
  limparCachePessoas(clube);
  limparCacheAmigos(clube);
  const chaveFiltros = cacheManager.gerarChave(CACHE_CONFIG.PREFIXOS.FILTROS, clube, CACHE_CONFIG.VERSOES.FILTROS);
  cacheManager.remover(chaveFiltros);
}

function limparCacheFiltrosDistrito() {
  logInfo('limparCacheFiltrosDistrito', 'Limpando cache de filtros do distrito');
  const tiposCache = ['distrito'];
  Object.keys(RTMA_REGIOES).forEach(r => tiposCache.push('regiao_' + r));
  tiposCache.forEach(tipo => {
    const chave = cacheManager.gerarChave(CACHE_CONFIG.PREFIXOS.FILTROS_DISTRITO, tipo, CACHE_CONFIG.VERSOES.FILTROS);
    cacheManager.remover(chave);
  });
}

function statusCacheClube(clube) {
  const status = {
    clube: clube,
    pessoas: obterPessoasCache(clube) !== null,
    amigos: obterAmigosCache(clube) !== null,
    filtros: obterFiltrosCache(clube) !== null
  };
  logInfo('statusCacheClube', `Status do cache para ${clube}`, status);
  return status;
}

function invalidarCachePessoas() {
  logInfo('invalidarCachePessoas', 'Invalidando cache de pessoas para todos os clubes');
  try {
    const todosClubes = rtmaObterTodosClubes();
    todosClubes.forEach(clube => {
      const chave = cacheManager.gerarChave(CACHE_CONFIG.PREFIXOS.PESSOAS, clube, CACHE_CONFIG.VERSOES.PESSOAS);
      cacheManager.remover(chave);
    });
    logInfo('invalidarCachePessoas', `Cache de pessoas removido para ${todosClubes.length} clubes`);
  } catch (e) {
    logWarn('invalidarCachePessoas', 'Erro ao invalidar cache de pessoas', e.message);
  }
}

function invalidarCacheAmigos() {
  logInfo('invalidarCacheAmigos', 'Invalidando cache de amigos para todos os clubes');
  try {
    const todosClubes = rtmaObterTodosClubes();
    todosClubes.forEach(clube => {
      const chave = cacheManager.gerarChave(CACHE_CONFIG.PREFIXOS.AMIGOS, clube, CACHE_CONFIG.VERSOES.AMIGOS);
      cacheManager.remover(chave);
    });
    logInfo('invalidarCacheAmigos', `Cache de amigos removido para ${todosClubes.length} clubes`);
  } catch (e) {
    logWarn('invalidarCacheAmigos', 'Erro ao invalidar cache de amigos', e.message);
  }
}

function limparTodosCachesRTMA() {
  const funcao = 'limparTodosCachesRTMA';
  try {
    logInfo(funcao, 'Iniciando limpeza geral de caches RTMA');
    const todosClubes = rtmaObterTodosClubes();
    let cachesLimpos = 0;
    let erros = 0;
    todosClubes.forEach(clube => {
      try {
        limparCacheClube(clube);
        cachesLimpos++;
      } catch (error) {
        logWarn(funcao, `Erro ao limpar cache do clube ${clube}`, error.message);
        erros++;
      }
    });
    try {
      limparCacheFiltrosDistrito();
    } catch (error) {
      logWarn(funcao, 'Erro ao limpar cache de filtros do distrito', error.message);
    }
    const resultado = {
      sucesso: true,
      mensagem: `Cache limpo com sucesso! ${cachesLimpos} clubes processados${erros > 0 ? `, ${erros} erros` : ''}`,
      detalhes: { clubesProcessados: cachesLimpos, totalClubes: todosClubes.length, erros: erros }
    };
    logInfo(funcao, 'Limpeza de caches concluída', resultado.detalhes);
    return resultado;
  } catch (error) {
    logError(funcao, 'Erro ao limpar todos os caches', error.message);
    return { sucesso: false, mensagem: `Erro ao limpar cache: ${error.message}`, erro: error.message };
  }
}

module.exports = {
  CACHE_CONFIG, cacheManager,
  obterPessoasCache, armazenarPessoasCache, limparCachePessoas,
  obterAmigosCache, armazenarAmigosCache, limparCacheAmigos,
  obterFiltrosCache, armazenarFiltrosCache,
  obterFiltrosDistritoCache, armazenarFiltrosDistritoCache,
  limparCacheClube, limparCacheFiltrosDistrito, statusCacheClube,
  invalidarCachePessoas, invalidarCacheAmigos, limparTodosCachesRTMA,
};
