'use strict';

const { UrlFetchApp, PropertiesService, CacheService, LockService, Utilities, Session, ScriptApp, Logger, MimeType, DriveApp } = require('./gas-compat');
const { gasStyleFetch } = require('./async-fetch-helper');


// === GESTÃO DE PESSOAS - DISTRITO LEO LD-8 ===

/**
 * Buscar pessoas da aba RTMA de um clube específico
 * @param {string} clube - Nome do clube
 * @param {string} tipo - Filtro por tipo (opcional)
 * @param {string} formacao - Filtro por formação (opcional)
 * @param {string} profissao - Filtro por profissão (opcional)
 * @return {Array} Array de pessoas
 */
function buscarPessoasRTMA(clube, tipo = null, formacao = null, profissao = null) {
  const funcao = 'buscarPessoasRTMA';
  
  try {
    logInfo(funcao, 'Iniciando busca de pessoas', { 
      clube, tipo, formacao, profissao 
    });
    
    // Validar parâmetros
    if (!stringValida(clube)) {
      logError(funcao, 'Clube não informado');
      return [];
    }
    
    // Para Supabase, não depender do mapeamento legado de planilhas
    if (!(typeof RTMA_USAR_SUPABASE !== 'undefined' && RTMA_USAR_SUPABASE === true)) {
      if (!rtmaClubeExiste(clube)) {
      logError(funcao, 'Clube não mapeado', { clube });
      return [];
      }
    }
    
    // Verificar cache primeiro
    const pessoasCache = obterPessoasCache(clube);
    if (pessoasCache) {
      logInfo(funcao, 'Dados encontrados no cache', { clube, total: pessoasCache.length });
      return aplicarFiltrosPessoas(pessoasCache, tipo, formacao, profissao);
    }
    
    // Buscar dados do Supabase ou planilha (conforme configuração)
    let pessoasDados = [];
    if (typeof RTMA_USAR_SUPABASE !== 'undefined' && RTMA_USAR_SUPABASE === true) {
      pessoasDados = buscarPessoasDoSupabase(clube);
    } else {
      pessoasDados = buscarPessoasDaPlanilha(clube);
    }
    
    if (arrayValido(pessoasDados)) {
      // Armazenar no cache
      armazenarPessoasCache(clube, pessoasDados);
      logInfo(funcao, 'Dados salvos no cache', { clube, total: pessoasDados.length });
      
      // Aplicar filtros e retornar
      return aplicarFiltrosPessoas(pessoasDados, tipo, formacao, profissao);
    }
    
    return [];
    
  } catch (error) {
    logError(funcao, 'Erro geral na busca de pessoas', error.message);
    return [];
  }
}

/**
 * Buscar pessoas diretamente da planilha
 * @param {string} clube - Nome do clube
 * @return {Array} Array de pessoas
 */
function buscarPessoasDaPlanilha(clube) {
  const funcao = 'buscarPessoasDaPlanilha';
  
  try {
    // Esta função não deve ser mais usada quando Supabase está ativo
    // Retornar array vazio para forçar uso do Supabase
    if (typeof RTMA_USAR_SUPABASE !== 'undefined' && RTMA_USAR_SUPABASE === true) {
      logWarn(funcao, 'Tentativa de usar planilha com Supabase ativo', { clube });
      return [];
    }
    
    // Fallback apenas se Supabase não estiver disponível
    logWarn(funcao, 'Função de planilha descontinuada - use Supabase', { clube });
      return [];
    
    // Código legado removido - não usar mais planilhas
    
  } catch (error) {
    logError(funcao, 'Erro ao buscar dados da planilha', error.message);
    return [];
  }
}

/**
 * Processar linha individual de pessoa
 * @param {Array} linha - Linha de dados da planilha
 * @param {number} rowNum - Número da linha
 * @param {string} clube - Nome do clube
 * @return {Object|null} Objeto pessoa ou null se inválido
 */
function processarLinhaPessoa(linha, rowNum, clube) {
  try {
    // Validar se linha tem dados mínimos
    if (!arrayValido(linha) || linha.length < 4) {
      return null;
    }
    
    const nome = limparString(linha[3]); // Coluna D - Nome
    if (!stringValida(nome)) {
      return null;
    }
    
    // Extrair e limpar todos os dados
    const pessoa = {
      id: String(rowNum),
      clube: clube,
      status: limparString(linha[0]) || "Ativo", // Coluna A
      tipo: limparString(linha[1]), // Coluna B
      numeroAssociado: limparString(linha[2]), // Coluna C
      nome: nome, // Coluna D
      cargo: limparString(linha[4]), // Coluna E
      formacao: limparString(linha[5]), // Coluna F
      profissao: limparString(linha[6]), // Coluna G
      dataInicioPreLeo: formatarDataRTMA(linha[7]), // Coluna H
      associadoDesde: formatarDataRTMA(linha[8]), // Coluna I
      dataDesligamento: formatarDataRTMA(linha[9]), // Coluna J
      dataPosseLions: formatarDataRTMA(linha[10]), // Coluna K
      dataNascimento: formatarDataRTMA(linha[11]), // Coluna L
      telefone: limparString(linha[12]), // Coluna M
      email: limparString(linha[13]), // Coluna N
      logradouro: limparString(linha[14]), // Coluna O
      cidade: limparString(linha[15]), // Coluna P
      cep: limparString(linha[16]), // Coluna Q
      acaoTrimestre: limparString(linha[17]), // Coluna R - Ação Trimestre
      foraneo: limparString(linha[18]) === 'Sim' || limparString(linha[18]) === 'TRUE' || limparString(linha[18]) === '1' // Coluna S
    };
    
    return pessoa;
    
  } catch (error) {
    logWarn('processarLinhaPessoa', `Erro na linha ${rowNum}`, error.message);
    return null;
  }
}

/**
 * Aplicar filtros às pessoas
 * @param {Array} pessoas - Array de pessoas
 * @param {string} tipo - Filtro por tipo
 * @param {string} formacao - Filtro por formação
 * @param {string} profissao - Filtro por profissão
 * @return {Array} Array filtrado
 */
function aplicarFiltrosPessoas(pessoas, tipo, formacao, profissao) {
  if (!arrayValido(pessoas)) return [];
  
  return pessoas.filter(pessoa => {
    // Filtro de tipo (suporta array ou string)
    if (tipo) {
      if (Array.isArray(tipo) && tipo.length > 0) {
        if (!tipo.includes(pessoa.tipo)) return false;
      } else if (stringValida(tipo) && pessoa.tipo !== tipo) {
        return false;
      }
    }
    
    // Filtro de formação (suporta array ou string)
    if (formacao) {
      if (Array.isArray(formacao) && formacao.length > 0) {
        if (!formacao.includes(pessoa.formacao)) return false;
      } else if (stringValida(formacao) && pessoa.formacao !== formacao) {
        return false;
      }
    }
    
    // Filtro de profissão (suporta array ou string)
    if (profissao) {
      if (Array.isArray(profissao) && profissao.length > 0) {
        if (!profissao.includes(pessoa.profissao)) return false;
      } else if (stringValida(profissao) && pessoa.profissao !== profissao) {
        return false;
      }
    }
    
    return true;
  });
}

/**
 * Buscar pessoas do distrito (múltiplos clubes)
 * @param {Object} filtros - Objeto com filtros
 * @return {Array} Array de pessoas de múltiplos clubes
 */
function buscarPessoasDistrito(filtros) {
  const funcao = 'buscarPessoasDistrito';
  
  try {
    console.log('🔍 [rtma_pessoas.js] buscarPessoasDistrito chamada com filtros:', JSON.stringify(filtros));
    logInfo(funcao, 'Iniciando busca do distrito', filtros);
    
    const { clube, tipo, formacao, profissao, usuario, regiao } = filtros;
    console.log('🔍 [rtma_pessoas.js] Filtros extraídos:', { 
      clube, 
      tipo, 
      formacao, 
      profissao, 
      regiao, 
      usuario: usuario ? {
        email: usuario.email,
        clube: usuario.clube,
        isDistrito: usuario.isDistrito,
        isRegiao: usuario.isRegiao,
        tipoAcesso: usuario.tipoAcesso
      } : 'não informado' 
    });
    
    // Verificar se usuario.isDistrito está definido
    if (!usuario) {
      console.error('❌ [rtma_pessoas.js] Usuário não definido nos filtros!');
      return [];
    }
    
    if (!usuario.isDistrito && !usuario.isRegiao) {
      console.warn('⚠️ [rtma_pessoas.js] Usuário não é distrital nem regional:', {
        isDistrito: usuario.isDistrito,
        isRegiao: usuario.isRegiao,
        tipoAcesso: usuario.tipoAcesso
      });
    }
    
    // Determinar clubes a buscar
    const clubesParaBuscar = determinarClubesParaBuscar(usuario, clube, regiao);
    
    if (!arrayValido(clubesParaBuscar)) {
      logWarn(funcao, 'Nenhum clube para buscar');
      return [];
    }
    
    logInfo(funcao, 'Clubes a processar', { total: clubesParaBuscar.length });
    
    let todasPessoas = [];
    
    // Se usar Supabase, buscar todos os clubes de uma vez (mais eficiente)
    if (typeof RTMA_USAR_SUPABASE !== 'undefined' && RTMA_USAR_SUPABASE === true && clubesParaBuscar.length > 1) {
      console.log('🔍 [rtma_pessoas.js] Usando Supabase para buscar múltiplos clubes');
      try {
        const pessoasBatch = buscarPessoasMultiplosClubesDoSupabase(clubesParaBuscar);
        console.log('🔍 [rtma_pessoas.js] Pessoas batch retornadas:', pessoasBatch ? pessoasBatch.length : 0);
        if (arrayValido(pessoasBatch)) {
          todasPessoas = pessoasBatch;
          // Filtrar apenas pessoas com status "Ativo"
          todasPessoas = todasPessoas.filter(p => p.status && String(p.status).toLowerCase() === 'ativo');
          console.log('🔍 [rtma_pessoas.js] Pessoas após filtrar por status Ativo:', todasPessoas.length);
          // Aplicar filtros se necessário
          if (tipo || formacao || profissao) {
            todasPessoas = aplicarFiltrosPessoas(todasPessoas, tipo, formacao, profissao);
          }
        } else {
          console.warn('⚠️ [rtma_pessoas.js] pessoasBatch não é um array válido');
        }
      } catch (error) {
        logWarn(funcao, `Erro ao processar lote de clubes, tentando individualmente`, error.message);
        // Fallback: processar individualmente
        clubesParaBuscar.forEach(nomeClube => {
          try {
            const pessoas = buscarPessoasRTMAOtimizado(nomeClube, tipo, formacao, profissao);
            if (arrayValido(pessoas)) {
              // Filtrar apenas pessoas com status "Ativo"
              const pessoasAtivas = pessoas.filter(p => p.status && String(p.status).toLowerCase() === 'ativo');
              const pessoasComClube = pessoasAtivas.map(p => ({ ...p, clube: nomeClube }));
              todasPessoas = todasPessoas.concat(pessoasComClube);
            }
          } catch (error) {
            logWarn(funcao, `Erro ao processar clube ${nomeClube}`, error.message);
          }
        });
      }
    } else {
      // Processar clubes em lotes para performance (planilhas ou Supabase com 1 clube)
      const batchSize = 5;
      for (let i = 0; i < clubesParaBuscar.length; i += batchSize) {
        const batch = clubesParaBuscar.slice(i, i + batchSize);
        
        batch.forEach(nomeClube => {
          try {
            const pessoas = buscarPessoasRTMAOtimizado(nomeClube, tipo, formacao, profissao);
            if (arrayValido(pessoas)) {
              // Filtrar apenas pessoas com status "Ativo"
              const pessoasAtivas = pessoas.filter(p => p.status && String(p.status).toLowerCase() === 'ativo');
              const pessoasComClube = pessoasAtivas.map(p => ({ ...p, clube: nomeClube }));
              todasPessoas = todasPessoas.concat(pessoasComClube);
            }
          } catch (error) {
            logWarn(funcao, `Erro ao processar clube ${nomeClube}`, error.message);
          }
        });
      }
    }
    
    console.log('✅ [rtma_pessoas.js] Busca do distrito concluída:', {
      clubesProcessados: clubesParaBuscar.length,
      totalPessoas: todasPessoas.length
    });
    logInfo(funcao, 'Busca do distrito concluída', { 
      clubesProcessados: clubesParaBuscar.length,
      totalPessoas: todasPessoas.length
    });
    
    return todasPessoas;
    
  } catch (error) {
    logError(funcao, 'Erro na busca do distrito', error.message);
    return [];
  }
}

/**
 * Determinar quais clubes buscar baseado no usuário
 * @param {Object} usuario - Dados do usuário
 * @param {string} clube - Clube específico (opcional)
 * @param {string} regiao - Região específica (opcional)
 * @return {Array} Lista de clubes para buscar
 */
function determinarClubesParaBuscar(usuario, clube, regiao) {
  console.log('🔍 [rtma_pessoas.js] determinarClubesParaBuscar chamada com:', {
    usuario: usuario ? {
      email: usuario.email,
      clube: usuario.clube,
      isDistrito: usuario.isDistrito,
      isRegiao: usuario.isRegiao,
      clubesPermitidos: usuario.clubesPermitidos ? usuario.clubesPermitidos.length : 0
    } : 'não definido',
    clube: clube,
    regiao: regiao
  });
  
  if (!usuario) {
    console.warn('⚠️ [rtma_pessoas.js] Usuário não definido em determinarClubesParaBuscar');
    return [];
  }
  
  if (usuario.isRegiao && usuario.clubesPermitidos) {
    // Coordenação de região
    if (Array.isArray(clube) && clube.length > 0) {
      // Filtro Power BI - múltiplos clubes
      return clube.filter(c => usuario.clubesPermitidos.includes(c));
    }
    if (stringValida(clube) && usuario.clubesPermitidos.includes(clube)) {
      return [clube];
    }
    return usuario.clubesPermitidos;
  }
  
  if (usuario.isDistrito) {
    console.log('🔍 [rtma_pessoas.js] Usuário é distrital');
    // Distrito
    if (Array.isArray(regiao) && regiao.length > 0) {
      // Filtro Power BI - múltiplas regiões
      let clubes = [];
      regiao.forEach(r => {
        clubes = clubes.concat(obterClubesDaRegiao(r));
      });
      console.log('🔍 [rtma_pessoas.js] Retornando clubes de múltiplas regiões:', clubes.length);
      return [...new Set(clubes)]; // Remove duplicatas
    }
    if (stringValida(regiao)) {
      const clubesRegiao = obterClubesDaRegiao(regiao);
      console.log('🔍 [rtma_pessoas.js] Retornando clubes da região', regiao, ':', clubesRegiao.length);
      return clubesRegiao;
    }
    
    if (Array.isArray(clube) && clube.length > 0) {
      // Filtro Power BI - múltiplos clubes
      console.log('🔍 [rtma_pessoas.js] Retornando múltiplos clubes:', clube.length);
      return clube;
    }
    if (stringValida(clube)) {
      console.log('🔍 [rtma_pessoas.js] Retornando clube específico:', clube);
      return [clube];
    }
    // Retornar todos os clubes das regiões
    console.log('🔍 [rtma_pessoas.js] Buscando todos os clubes...');
    if (typeof rtmaObterTodosClubes === 'function') {
      const todosClubes = rtmaObterTodosClubes();
      console.log('✅ [rtma_pessoas.js] rtmaObterTodosClubes retornou:', todosClubes ? todosClubes.length : 0, 'clubes');
      return todosClubes;
    }
    // Fallback: retornar clubes das regiões manualmente
    const todosClubes = [];
    if (typeof RTMA_REGIOES !== 'undefined') {
      Object.values(RTMA_REGIOES).forEach(clubes => {
        todosClubes.push(...clubes);
      });
      console.log('✅ [rtma_pessoas.js] Fallback retornou:', todosClubes.length, 'clubes');
    } else {
      console.warn('⚠️ [rtma_pessoas.js] RTMA_REGIOES não está definido');
    }
    return todosClubes;
  }
  
  // Clube comum
  if (Array.isArray(clube) && clube.length > 0) {
    return clube;
  }
  return stringValida(clube) ? [clube] : [usuario.clube];
}

/**
 * Versão otimizada para busca de pessoas (com cache inteligente)
 * @param {string} clube - Nome do clube
 * @param {string} tipo - Filtro por tipo
 * @param {string} formacao - Filtro por formação
 * @param {string} profissao - Filtro por profissão
 * @return {Array} Array de pessoas
 */
function buscarPessoasRTMAOtimizado(clube, tipo, formacao, profissao) {
  try {
    // Usar cache se disponível
    const pessoasCache = obterPessoasCache(clube);
    if (pessoasCache) {
      return aplicarFiltrosPessoas(pessoasCache, tipo, formacao, profissao);
    }

    // Com Supabase ativo, usar a função de busca do Supabase
    if (typeof RTMA_USAR_SUPABASE !== 'undefined' && RTMA_USAR_SUPABASE === true) {
      if (typeof buscarPessoasDoSupabase === 'function') {
        const pessoas = buscarPessoasDoSupabase(clube) || [];
        armazenarPessoasCache(clube, pessoas);
        return aplicarFiltrosPessoas(pessoas, tipo, formacao, profissao);
      }
      return [];
    }

    // Fallback legado: planilha (apenas quando Supabase não está ativo)
    if (!rtmaClubeExiste(clube)) return [];
    const pessoas = buscarPessoasDaPlanilha(clube);
    if (arrayValido(pessoas)) {
      armazenarPessoasCache(clube, pessoas);
      return aplicarFiltrosPessoas(pessoas, tipo, formacao, profissao);
    }

    return [];

  } catch (error) {
    logWarn('buscarPessoasRTMAOtimizado', `Erro para clube ${clube}`, error.message);
    return [];
  }
}

/**
 * Verificar e criar cabeçalho da coluna Forâneo se necessário
 * @param {Object} abaRTMA - Aba da planilha
 */
function verificarCabecalhoForaneo(abaRTMA) {
  try {
    // Verificar quantas colunas existem atualmente
    const lastColumn = abaRTMA.getLastColumn();
    logInfo('verificarCabecalhoForaneo', `Planilha tem ${lastColumn} colunas`);
    
    // Se tem menos de 19 colunas, expandir
    if (lastColumn < 19) {
      // Verificar se há dados na linha 1 (cabeçalhos)
      const cabecalhos = abaRTMA.getRange(1, 1, 1, Math.max(lastColumn, 18)).getValues()[0];
      
      // Expandir array de cabeçalhos até 19 colunas
      while (cabecalhos.length < 19) {
        cabecalhos.push('');
      }
      
      // Definir cabeçalho da coluna S se vazio
      if (!cabecalhos[18] || cabecalhos[18] === '') {
        cabecalhos[18] = 'Forâneo';
      }
      
      // Atualizar linha de cabeçalhos
      abaRTMA.getRange(1, 1, 1, 19).setValues([cabecalhos]);
      logInfo('verificarCabecalhoForaneo', 'Cabeçalhos expandidos até coluna S com "Forâneo"');
    } else {
      // Verificar se a coluna S (19) tem cabeçalho
      const cabecalhoS = abaRTMA.getRange(1, 19).getValue();
      
      if (!cabecalhoS || cabecalhoS === '') {
        // Adicionar cabeçalho "Forâneo" na coluna S
        abaRTMA.getRange(1, 19).setValue('Forâneo');
        logInfo('verificarCabecalhoForaneo', 'Cabeçalho "Forâneo" adicionado na coluna S');
      }
    }
    
    // IMPORTANTE: Limpar validações de dados da coluna S
    limparValidacoesColunaS(abaRTMA);
    
  } catch (error) {
    logError('verificarCabecalhoForaneo', 'Erro ao verificar/criar cabeçalho', error.message);
  }
}

/**
 * Limpar validações de dados da coluna S (Forâneo)
 * @param {Object} abaRTMA - Aba da planilha
 */
function limparValidacoesColunaS(abaRTMA) {
  try {
    // Obter o range da coluna S inteira
    const lastRow = abaRTMA.getLastRow();
    if (lastRow > 0) {
      const rangeColunaS = abaRTMA.getRange(1, 19, lastRow, 1);
      
      // Limpar todas as validações de dados da coluna S
      rangeColunaS.clearDataValidations();
      
      logInfo('limparValidacoesColunaS', 'Validações de dados removidas da coluna S');
    }
  } catch (error) {
    logWarn('limparValidacoesColunaS', 'Erro ao limpar validações', error.message);
  }
}

/**
 * Inicializar coluna Forâneo em todas as planilhas dos clubes
 * @return {Object} Resultado da operação
 */
function inicializarColunaForaneoTodosClubes() {
  const funcao = 'inicializarColunaForaneoTodosClubes';
  
  try {
    logInfo(funcao, 'Iniciando inicialização da coluna Forâneo em todos os clubes');
    
    const config = getRtmaConfig();
    // Obter todos os clubes das regiões ao invés de planilhas
    const clubes = (typeof rtmaObterTodosClubes === 'function') 
      ? rtmaObterTodosClubes() 
      : (() => {
          const todosClubes = [];
          if (config.regioes) {
            Object.values(config.regioes).forEach(clubesRegiao => {
              todosClubes.push(...clubesRegiao);
            });
          }
          return todosClubes;
        })();
    
    let sucessos = 0;
    let falhas = 0;
    const resultados = [];
    
    clubes.forEach(clube => {
      try {
        const sourceId = config.planilhasClubes[clube];
        const ss = SpreadsheetApp.openById(sourceId);
        const abaRTMA = ss.getSheetByName(RTMA_ABA_RTMA);
        
        if (abaRTMA) {
          verificarCabecalhoForaneo(abaRTMA);
          sucessos++;
          resultados.push({ clube, status: 'sucesso' });
          logInfo(funcao, `Coluna Forâneo inicializada para ${clube}`);
        } else {
          falhas++;
          resultados.push({ clube, status: 'erro', erro: 'Aba RTMA não encontrada' });
          logWarn(funcao, `Aba RTMA não encontrada para ${clube}`);
        }
      } catch (error) {
        falhas++;
        resultados.push({ clube, status: 'erro', erro: error.message });
        logError(funcao, `Erro ao processar ${clube}`, error.message);
      }
    });
    
    const resumo = {
      totalClubes: clubes.length,
      sucessos,
      falhas,
      percentualSucesso: ((sucessos / clubes.length) * 100).toFixed(1)
    };
    
    logInfo(funcao, 'Inicialização concluída', resumo);
    
    return respostaSucesso({
      resumo,
      resultados
    }, `Coluna Forâneo inicializada em ${sucessos}/${clubes.length} clubes`);
    
  } catch (error) {
    return tratarExcecao(error, funcao);
  }
}

/**
 * Criar nova pessoa na planilha
 * @param {string} clube - Nome do clube
 * @param {Object} dados - Dados da pessoa
 * @return {Object} Resultado da operação
 */
function rtmaHashRapidoIdempotencia(str) {
  let hash = 5381;
  const txt = String(str || '');
  for (let i = 0; i < txt.length; i++) {
    hash = ((hash << 5) + hash) + txt.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(36);
}

function rtmaMontarChaveIdempotenciaPessoa(clube, dados) {
  const chaveRaw = String((dados && (dados._idempotencyKey || dados.idempotencyKey)) || '').trim();
  if (chaveRaw) return `IDEMP:rtma_pessoa:${clube}:${chaveRaw}`;
  const fallback = [
    String(clube || '').trim(),
    String(dados && dados.nome || '').trim().toLowerCase(),
    String(dados && dados.tipo || '').trim(),
    String(dados && dados.associadoDesde || '').trim(),
    String(dados && dados.dataInicioPreLeo || '').trim(),
    String(dados && dados.email || '').trim().toLowerCase()
  ].join('|');
  return `IDEMP:rtma_pessoa:${rtmaHashRapidoIdempotencia(fallback)}`;
}

function rtmaLerRespostaIdempotente(cacheKey) {
  if (!cacheKey) return null;
  try {
    const cache = CacheService.getScriptCache();
    const bruto = cache.get(cacheKey);
    if (!bruto) return null;
    const obj = JSON.parse(bruto);
    if (obj && obj.sucesso) return obj;
  } catch (e) {
    logWarn('rtmaLerRespostaIdempotente', 'Falha ao ler cache de idempotência', e.message || e);
  }
  return null;
}

function rtmaSalvarRespostaIdempotente(cacheKey, resposta) {
  if (!cacheKey || !resposta || !resposta.sucesso) return;
  try {
    const cache = CacheService.getScriptCache();
    cache.put(cacheKey, JSON.stringify(resposta), 6 * 60 * 60); // 6h
  } catch (e) {
    logWarn('rtmaSalvarRespostaIdempotente', 'Falha ao gravar cache de idempotência', e.message || e);
  }
}

function criarPessoaRTMA(clube, dados) {
  const funcao = 'criarPessoaRTMA';
  let idemLock = null;
  
  try {
    logInfo(funcao, 'Criando nova pessoa', { clube, nome: dados.nome });
    
    // Validar parâmetros
    const validacao = validarDadosPessoa(dados, false);
    if (!validacao.valido) {
      return respostaErro(validacao.erro);
    }
    
    if (!rtmaClubeExiste(clube)) {
      return respostaErro('Clube não encontrado');
    }

    const cacheKey = rtmaMontarChaveIdempotenciaPessoa(clube, dados);
    idemLock = LockService.getScriptLock();
    idemLock.waitLock(10000);
    const cached = rtmaLerRespostaIdempotente(cacheKey);
    if (cached) {
      return Object.assign({}, cached, { idempotente: true });
    }
    
    // Usar Supabase ou planilha conforme configuração
    if (typeof RTMA_USAR_SUPABASE !== 'undefined' && RTMA_USAR_SUPABASE === true) {
      const resp = criarPessoaNoSupabase(clube, dados);
      rtmaSalvarRespostaIdempotente(cacheKey, resp);
      return resp;
    }
    
    // Código legado para planilhas
    const planilha = acessarPlanilhaClube(clube);
    if (!planilha.sucesso) {
      return planilha;
    }
    
    const abaRTMA = planilha.dados.getSheetByName(RTMA_ABA_RTMA);
    if (!abaRTMA) {
      return respostaErro('Aba RTMA não encontrada');
    }
    
    // Verificar e criar cabeçalho da coluna Forâneo se necessário
    verificarCabecalhoForaneo(abaRTMA);
    
    // Preparar dados para inserção
    const rowData = prepararDadosParaInsercao(dados);
    const newRow = abaRTMA.getLastRow() + 1;
    
    // Inserir dados
    abaRTMA.getRange(newRow, 1, 1, 19).setValues([rowData]);
    
    // Limpar cache
    limparCachePessoas(clube);
    
    logInfo(funcao, 'Pessoa criada com sucesso', { 
      clube, 
      nome: dados.nome, 
      linha: newRow 
    });
    
    const resp = respostaSucesso({ id: newRow }, 'Membro cadastrado com sucesso!');
    rtmaSalvarRespostaIdempotente(cacheKey, resp);
    return resp;
    
  } catch (error) {
    return tratarExcecao(error, funcao);
  } finally {
    if (idemLock) {
      try { idemLock.releaseLock(); } catch (e) {}
    }
  }
}

/**
 * Editar pessoa existente
 * @param {string} clube - Nome do clube
 * @param {string} pessoaId - ID da pessoa (número da linha)
 * @param {Object} dados - Novos dados da pessoa
 * @return {Object} Resultado da operação
 */
function editarPessoaRTMA(clube, pessoaId, dados) {
  const funcao = 'editarPessoaRTMA';
  
  try {
    logInfo(funcao, 'Editando pessoa', { clube, pessoaId, nome: dados.nome });
    
    // Validar parâmetros
    const validacao = validarDadosPessoa(dados, true);
    if (!validacao.valido) {
      return respostaErro(validacao.erro);
    }
    
    // Verificar se é UUID (Supabase) ou número de linha (planilha)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pessoaId);
    
    // Usar Supabase se configurado e se o ID for UUID
    if ((typeof RTMA_USAR_SUPABASE !== 'undefined' && RTMA_USAR_SUPABASE === true) || isUUID) {
      return editarPessoaNoSupabase(clube, pessoaId, dados);
    }
    
    // Código legado para planilhas
    const rowNum = parseInt(pessoaId);
    if (isNaN(rowNum) || rowNum < 2) {
      return respostaErro('ID da pessoa inválido');
    }
    
    // Acessar planilha
    const planilha = acessarPlanilhaClube(clube);
    if (!planilha.sucesso) {
      return planilha;
    }
    
    const abaRTMA = planilha.dados.getSheetByName(RTMA_ABA_RTMA);
    if (!abaRTMA) {
      return respostaErro('Aba RTMA não encontrada');
    }
    
    // Verificar e criar cabeçalho da coluna Forâneo se necessário
    verificarCabecalhoForaneo(abaRTMA);
    
    // Verificar se linha existe
    if (rowNum > abaRTMA.getLastRow()) {
      return respostaErro('Registro não encontrado');
    }
    
    // Obter dados atuais para preservar data de desligamento e ação trimestre
    const currentData = abaRTMA.getRange(rowNum, 1, 1, 19).getValues()[0];
    const dataDesligamentoAtual = currentData[9]; // Coluna J
    const acaoTrimestreAtual = currentData[17]; // Coluna R
    
    // Preparar dados para atualização
    const rowData = prepararDadosParaInsercao(dados, dataDesligamentoAtual, acaoTrimestreAtual);
    
    // Atualizar dados
    abaRTMA.getRange(rowNum, 1, 1, 19).setValues([rowData]);
    
    // Limpar cache
    limparCachePessoas(clube);
    
    logInfo(funcao, 'Pessoa editada com sucesso', { 
      clube, 
      pessoaId, 
      nome: dados.nome 
    });
    
    return respostaSucesso(null, 'Membro atualizado com sucesso!');
    
  } catch (error) {
    return tratarExcecao(error, funcao);
  }
}

/**
 * Desligar pessoa (marcar como inativo)
 * @param {string} clube - Nome do clube
 * @param {string} pessoaId - ID da pessoa
 * @param {string} dataDesligamento - Data do desligamento
 * @return {Object} Resultado da operação
 */
function desligarPessoaRTMA(clube, pessoaId, dataDesligamento) {
  const funcao = 'desligarPessoaRTMA';
  
  try {
    logInfo(funcao, 'Desligando pessoa', { clube, pessoaId, dataDesligamento });
    
    // Validar parâmetros
    if (!stringValida(dataDesligamento)) {
      return respostaErro('Data de desligamento é obrigatória');
    }
    
    // Verificar se é UUID (Supabase) ou número de linha (planilha)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pessoaId);
    
    // Usar Supabase se configurado e se o ID for UUID
    if ((typeof RTMA_USAR_SUPABASE !== 'undefined' && RTMA_USAR_SUPABASE === true) || isUUID) {
      return desligarPessoaNoSupabase(clube, pessoaId, dataDesligamento);
    }
    
    // Código legado para planilhas
    const rowNum = parseInt(pessoaId);
    if (isNaN(rowNum) || rowNum < 2) {
      return respostaErro('ID da pessoa inválido');
    }
    
    // Acessar planilha
    const planilha = acessarPlanilhaClube(clube);
    if (!planilha.sucesso) {
      return planilha;
    }
    
    const abaRTMA = planilha.dados.getSheetByName(RTMA_ABA_RTMA);
    if (!abaRTMA) {
      return respostaErro('Aba RTMA não encontrada');
    }
    
    // Verificar se linha existe
    if (rowNum > abaRTMA.getLastRow()) {
      return respostaErro('Registro não encontrado');
    }
    
    // Atualizar status e data de desligamento
    abaRTMA.getRange(rowNum, 1).setValue('Inativo'); // Coluna A - Status
    abaRTMA.getRange(rowNum, 10).setValue(dataDesligamento); // Coluna J - Data Desligamento
    
    // Limpar cache
    limparCachePessoas(clube);
    
    logInfo(funcao, 'Pessoa desligada com sucesso', { clube, pessoaId });
    
    return respostaSucesso(null, 'Membro marcado como inativo com sucesso!');
    
  } catch (error) {
    return tratarExcecao(error, funcao);
  }
}

/**
 * Buscar opções de filtros para um clube
 * @param {string} clube - Nome do clube
 * @return {Object} Opções de filtros
 */
// Função movida para code.js para garantir disponibilidade via google.script.run
// function buscarOpcoesFiltros(clube) {
function buscarOpcoesFiltros_rtma_pessoas(clube) {
  const funcao = 'buscarOpcoesFiltros';
  
  try {
    logInfo(funcao, 'Buscando opções de filtros', { clube });
    
    // Verificar cache primeiro
    const filtrosCache = obterFiltrosCache(clube);
    if (filtrosCache) {
      logInfo(funcao, 'Opções encontradas no cache', { clube });
      return filtrosCache;
    }
    
    // Buscar da planilha
    const opcoes = extrairOpcoesFiltrosDaPlanilha(clube);
    
    // Cachear resultado
    if (opcoes) {
      armazenarFiltrosCache(clube, opcoes);
    }
    
    return opcoes;
    
  } catch (error) {
    logError(funcao, 'Erro ao buscar opções de filtros', error.message);
    return { formacoes: [], profissoes: [] };
  }
}

/**
 * Buscar opções de filtros do distrito
 * @param {Object} usuario - Dados do usuário
 * @return {Object} Opções de filtros
 */
// Função movida para code.js para garantir disponibilidade via google.script.run
// function buscarOpcoesFiltrosDistritoPessoas(usuario) {
function buscarOpcoesFiltrosDistritoPessoas_rtma_pessoas(usuario) {
  const funcao = 'buscarOpcoesFiltrosDistritoPessoas';
  
  try {
    logInfo(funcao, 'Buscando opções de filtros do distrito');
    
    // Determinar tipo de cache baseado no usuário
    const tipoCache = usuario.isRegiao ? 'regiao' : 'distrito';
    const identificadorCache = usuario.isRegiao ? usuario.regiao : '';
    
    // Verificar cache
    const filtrosCache = obterFiltrosDistritoCache(tipoCache, identificadorCache);
    if (filtrosCache) {
      logInfo(funcao, 'Opções encontradas no cache');
      return filtrosCache;
    }
    
    // Determinar clubes a processar
    let clubesPermitidos = [];
    if (usuario.isRegiao && usuario.clubesPermitidos) {
      clubesPermitidos = usuario.clubesPermitidos;
    } else if (usuario.isDistrito) {
      // Obter todos os clubes das regiões
      clubesPermitidos = (typeof rtmaObterTodosClubes === 'function') 
        ? rtmaObterTodosClubes() 
        : (() => {
            const todosClubes = [];
            if (typeof RTMA_REGIOES !== 'undefined') {
              Object.values(RTMA_REGIOES).forEach(clubes => {
                todosClubes.push(...clubes);
              });
            }
            return todosClubes;
          })();
    }
    
    // Coletar opções de todos os clubes
    const opcoes = coletarOpcoesFiltrosMultiplosClubes(clubesPermitidos);
    
    // Adicionar regiões se for distrito
    if (usuario.isDistrito) {
      opcoes.regioes = ['A', 'B', 'D'];
    }
    
    // Cachear resultado
    armazenarFiltrosDistritoCache(tipoCache, opcoes, identificadorCache);
    
    return opcoes;
    
  } catch (error) {
    logError(funcao, 'Erro ao buscar opções do distrito', error.message);
    return { clubes: [], formacoes: [], profissoes: [], regioes: [] };
  }
}

/**
 * Funções auxiliares
 */

/**
 * Acessar planilha do clube
 * @param {string} clube - Nome do clube
 * @return {Object} Resultado da operação
 */
function acessarPlanilhaClube(clube) {
  // Função descontinuada - não usar mais planilhas
  // Retornar erro para forçar uso do Supabase
  return respostaErro('Função descontinuada - use Supabase para acessar dados do clube');
}

/**
 * Validar dados da pessoa
 * @param {Object} dados - Dados da pessoa
 * @param {boolean} isEdicao - Se é edição (true) ou criação (false)
 * @return {Object} Resultado da validação
 */
function validarDadosPessoa(dados, isEdicao) {
  if (!dados || typeof dados !== 'object') {
    return { valido: false, erro: 'Dados da pessoa são obrigatórios' };
  }
  
  if (!stringValida(dados.nome)) {
    return { valido: false, erro: 'Nome é obrigatório' };
  }
  
  if (!stringValida(dados.tipo)) {
    return { valido: false, erro: 'Tipo de associado é obrigatório' };
  }
  
  // Validar email se fornecido
  if (stringValida(dados.email) && !emailValido(dados.email)) {
    return { valido: false, erro: 'Formato de email inválido' };
  }
  
  // Validar telefone se fornecido
  if (stringValida(dados.telefone) && !telefoneValido(dados.telefone)) {
    return { valido: false, erro: 'Formato de telefone inválido' };
  }
  
  // Validar CEP se fornecido
  if (stringValida(dados.cep) && !cepValido(dados.cep)) {
    return { valido: false, erro: 'Formato de CEP inválido' };
  }
  
  return { valido: true };
}

/**
 * Preparar dados para inserção na planilha
 * @param {Object} dados - Dados da pessoa
 * @param {string} dataDesligamentoExistente - Data de desligamento existente (para edição)
 * @param {string} acaoTrimestreExistente - Ação trimestre existente (para edição)
 * @return {Array} Array com dados formatados para a planilha
 */
function prepararDadosParaInsercao(dados, dataDesligamentoExistente = '', acaoTrimestreExistente = '') {
  return [
    dados.status || 'Ativo',           // A - Status
    dados.tipo || '',                  // B - Tipo
    dados.numeroAssociado || '',       // C - Código
    dados.nome || '',                  // D - Nome
    '',                                // E - (vazio)
    dados.formacao || '',              // F - Formação
    dados.profissao || '',             // G - Profissão
    dados.dataInicioPreLeo || '',      // H - Data Início Pré-LEO
    dados.associadoDesde || '',        // I - Data Posse Clube
    dataDesligamentoExistente || '',   // J - Data Desligamento
    dados.dataPosseLions || '',        // K - Data Posse Lions
    dados.dataNascimento || '',        // L - Data Nascimento
    dados.telefone || '',              // M - Telefone
    dados.email || '',                 // N - Email
    dados.logradouro || '',            // O - Logradouro
    dados.cidade || '',                // P - Cidade
    dados.cep || '',                   // Q - CEP
    acaoTrimestreExistente || dados.acaoTrimestre || '', // R - Ação Trimestre
    dados.foraneo ? 'Sim' : ''         // S - Forâneo
  ];
}

/**
 * Extrair opções de filtros de uma planilha
 * @param {string} clube - Nome do clube
 * @return {Object} Opções de filtros
 */
function extrairOpcoesFiltrosDaPlanilha(clube) {
  // Função descontinuada - extrair opções do Supabase ao invés de planilha
  try {
    // Buscar pessoas do Supabase para extrair formacoes e profissoes
    const pessoas = buscarPessoasRTMA(clube);
    const formacoesSet = new Set();
    const profissoesSet = new Set();
    
    pessoas.forEach(pessoa => {
      if (pessoa && pessoa.nome) {
        if (pessoa.formacao && stringValida(pessoa.formacao)) {
          formacoesSet.add(pessoa.formacao);
        }
        if (pessoa.profissao && stringValida(pessoa.profissao)) {
          profissoesSet.add(pessoa.profissao);
        }
      }
    });
    
    return {
      formacoes: Array.from(formacoesSet).sort(),
      profissoes: Array.from(profissoesSet).sort()
    };
    
  } catch (error) {
    logError('extrairOpcoesFiltrosDaPlanilha', `Erro para clube ${clube}`, error.message);
    return { formacoes: [], profissoes: [] };
  }
}

/**
 * Coletar opções de filtros de múltiplos clubes
 * @param {Array} clubes - Lista de clubes
 * @return {Object} Opções agregadas
 */
function coletarOpcoesFiltrosMultiplosClubes(clubes) {
  const opcoes = {
    clubes: clubes.sort(),
    formacoes: new Set(),
    profissoes: new Set()
  };
  
  // Processar em lotes para performance
  const batchSize = 5;
  for (let i = 0; i < clubes.length; i += batchSize) {
    const batch = clubes.slice(i, i + batchSize);
    
    batch.forEach(clube => {
      try {
        const opcoesCLube = extrairOpcoesFiltrosDaPlanilha(clube);
        
        opcoesCLube.formacoes.forEach(f => opcoes.formacoes.add(f));
        opcoesCLube.profissoes.forEach(p => opcoes.profissoes.add(p));
        
      } catch (error) {
        logWarn('coletarOpcoesFiltrosMultiplosClubes', `Erro ao processar ${clube}`, error.message);
      }
    });
  }
  
  return {
    clubes: opcoes.clubes,
    formacoes: Array.from(opcoes.formacoes).sort(),
    profissoes: Array.from(opcoes.profissoes).sort(),
    regioes: []
  };
}

/**
 * Normaliza clube + nome para cruzar com nominata_dirigentes (mesma ideia de buscarCargoNaNominata).
 */
function normalizarChaveNomeNominataRelatorio(nome) {
  return String(nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function chaveClubeNomeNominataRelatorio(clube, nome) {
  return normalizarChaveNomeNominataRelatorio(clube) + '|' + normalizarChaveNomeNominataRelatorio(nome);
}

/**
 * Preenche cargoRelatorio: apenas nominata_dirigentes (AL de referência); se não houver, usa tipo (RTMA).
 * Ignora o campo cargo da tabela pessoas (RTMA/Supabase).
 * @param {Array<Object>} pessoas
 */
function aplicarCargoNominataNasPessoasRelatorio(pessoas) {
  if (!pessoas || !Array.isArray(pessoas) || pessoas.length === 0) return;
  var alNom = (typeof AL_NOMINATA_RELATORIO_EVENTOS !== 'undefined' && String(AL_NOMINATA_RELATORIO_EVENTOS).trim())
    ? String(AL_NOMINATA_RELATORIO_EVENTOS).trim()
    : ((typeof obterAlAtual === 'function') ? obterAlAtual() : '2025-2026');
  let linhas = [];
  try {
    linhas = typeof listarCargosNominataPorAL === 'function' ? listarCargosNominataPorAL(alNom) : [];
  } catch (e) {
    logWarn('aplicarCargoNominataNasPessoasRelatorio', 'Falha ao listar nominata', e && e.message);
    linhas = [];
  }
  var agg = {};
  (linhas || []).forEach(function (r) {
    if (!r) return;
    var cargo = String(r.cargo || '').trim();
    if (!cargo) return;
    var k = chaveClubeNomeNominataRelatorio(r.clube, r.nome);
    if (!k || k === '|') return;
    if (!agg[k]) agg[k] = [];
    if (agg[k].indexOf(cargo) < 0) agg[k].push(cargo);
  });
  var mapa = {};
  Object.keys(agg).forEach(function (k) {
    var joined = agg[k].join(' / ');
    mapa[k] = (typeof _unificarSeparadoresCargoExcel === 'function')
      ? _unificarSeparadoresCargoExcel(joined)
      : joined;
  });
  pessoas.forEach(function (p) {
    var tipoRtma = String(p.tipo || '').trim();
    var k = chaveClubeNomeNominataRelatorio(p.clube, p.nome);
    var cargoNom = mapa[k];
    p.cargoRelatorio = (cargoNom && String(cargoNom).trim()) ? String(cargoNom).trim() : tipoRtma;
    if ('cargo' in p) p.cargo = '';
  });
}

/**
 * Gerar relatório Excel com total de pessoas por clube para acesso distrital
 * @param {Object} usuario - Dados do usuário (deve ter isDistrito = true)
 * @param {string} dataReferencia - Data de referência para o relatório (opcional, formato DD/MM/AAAA)
 * @param {string} dataInicioPeriodo - Data de início do período (opcional, formato DD/MM/AAAA)
 * @param {string} dataFimPeriodo - Data de fim do período (opcional, formato DD/MM/AAAA)
 * @return {Object} Resultado da operação com dados do relatório
 */
function gerarRelatorioExcelDistrito(usuario, dataReferencia = null, dataInicioPeriodo = null, dataFimPeriodo = null, incluirInativos = false, dadosFiltrados = null, tipoRelatorioParam = null) {
  const funcao = 'gerarRelatorioExcelDistrito';
  
  try {
    logInfo(funcao, 'Iniciando geração de relatório Excel para distrito', { 
      dataReferencia, dataInicioPeriodo, dataFimPeriodo, temDadosFiltrados: !!dadosFiltrados
    });
    
    // Verificar se usuário tem permissão de distrito
    if (!usuario || !usuario.isDistrito) {
      return respostaErro('Acesso negado. Apenas usuários do distrito podem gerar este relatório.');
    }
    
    const config = getRtmaConfig();
    
    // Determinar tipo de relatório e validar datas
    let dataLimite = null;
    let dataInicioPeriodoObj = null;
    let dataFimPeriodoObj = null;
    let tipoRelatorio = tipoRelatorioParam || 'atual';
    
    console.log(`🔍 Backend - Tipo recebido: "${tipoRelatorio}"`);
    
    if (tipoRelatorio === 'associados_master_senior') {
      if (!dataReferencia || !stringValida(dataReferencia)) {
        return respostaErro('Informe a data de referência (DD/MM/AAAA) para calcular tempo de associação e classificação Master/Senior.');
      }
      dataLimite = converterDataBRParaJS(dataReferencia);
      if (!dataLimite) {
        return respostaErro('Data de referência inválida. Use o formato DD/MM/AAAA');
      }
    } else if (dataReferencia && stringValida(dataReferencia)) {
      dataLimite = converterDataBRParaJS(dataReferencia);
      if (!dataLimite) {
        return respostaErro('Data de referência inválida. Use o formato DD/MM/AAAA');
      }
      tipoRelatorio = 'data';
    } else if (dataInicioPeriodo && dataFimPeriodo && 
               stringValida(dataInicioPeriodo) && stringValida(dataFimPeriodo)) {
      dataInicioPeriodoObj = converterDataBRParaJS(dataInicioPeriodo);
      dataFimPeriodoObj = converterDataBRParaJS(dataFimPeriodo);
      
      if (!dataInicioPeriodoObj || !dataFimPeriodoObj) {
        return respostaErro('Datas do período inválidas. Use o formato DD/MM/AAAA');
      }
      
      if (dataInicioPeriodoObj > dataFimPeriodoObj) {
        return respostaErro('A data de início deve ser anterior ou igual à data de fim do período');
      }
      
      tipoRelatorio = 'periodo';
    }
    
    // Definir título baseado no tipo de relatório
    let tituloBase;
    switch (tipoRelatorio) {
      case 'data':
        tituloBase = `Relatório de Pessoas por Clube em ${dataReferencia} - Distrito LEO LD-8`;
        break;
      case 'periodo':
        tituloBase = `Relatório de Pessoas por Clube - Período ${dataInicioPeriodo} a ${dataFimPeriodo} - Distrito LEO LD-8`;
        break;
      case 'detalhado':
        tituloBase = `RTMA Detalhado - Distrito LEO LD-8 em ${dataReferencia}`;
        break;
      case 'rtma_detalhado':
        tituloBase = `RTMA Detalhado - Todas as Colunas - Distrito LEO LD-8`;
        break;
      case 'associados_master_senior':
        tituloBase = `Associados LEO ativos — classificação Master/Senior na data ${dataReferencia || ''} — Distrito LEO LD-8`;
        break;
      default:
        tituloBase = 'Relatório de Pessoas Ativas por Clube - Distrito LEO LD-8';
    }
    
    const dadosRelatorio = {
      titulo: tituloBase,
      dataGeracao: new Date().toLocaleDateString('pt-BR'),
      horaGeracao: new Date().toLocaleTimeString('pt-BR'),
      tipoRelatorio: tipoRelatorio,
      dataReferencia: dataReferencia,
      dataInicioPeriodo: dataInicioPeriodo,
      dataFimPeriodo: dataFimPeriodo,
      usuario: usuario.email,
      isDetalhado: tipoRelatorio === 'detalhados',
      isRTMADetalhado: tipoRelatorio === 'rtma_detalhado',
      isAssociadosMasterSenior: tipoRelatorio === 'associados_master_senior',
      isResumoDM: tipoRelatorio === 'resumo_dm',
      tipoDetalhado: tipoRelatorio, // para distinguir entre 'detalhado' e 'detalhados'
      clubes: [],
      pessoas: [], // Para relatório detalhado
      totais: tipoRelatorio === 'resumo_dm' ? {
        // Para relatório DM: apenas Associados (sem Amigos)
        'Associado LEO': 0,
        'Associado LEO e LEO/Leão': 0,
        'Total': 0
      } : {
        // Para outros relatórios: todos os tipos
        'Associado LEO': 0,
        'Associado LEO e LEO/Leão': 0,
        'Pré LEO': 0,
        'Associado LEO/Leão': 0,
        'Amigo LEO': 0,
        'Amigo LEO e LEO/Leão': 0,
        'Total': 0
      }
    };
    
    // Processar dados
    if (tipoRelatorio === 'resumo_dm') {
      // Para resumo_dm, não processar dados normais - apenas executar lógica específica no final
      console.log('✅ Resumo DM - pulando processamento normal de dados');
      
    } else if (dadosFiltrados && Array.isArray(dadosFiltrados) && dadosFiltrados.length > 0) {
      // Usar dados já filtrados do frontend (situação atual); array vazio ignora e busca por clube
      logInfo(funcao, `Usando dados já filtrados do frontend: ${dadosFiltrados.length} pessoas`);
      
      // Agrupar pessoas por clube
      const pessoasPorClube = {};
      dadosFiltrados.forEach(pessoa => {
        if (!pessoasPorClube[pessoa.clube]) {
          pessoasPorClube[pessoa.clube] = [];
        }
        pessoasPorClube[pessoa.clube].push(pessoa);
      });
      
      // Processar cada clube
      Object.keys(pessoasPorClube).forEach(clube => {
        const pessoasDoClube = pessoasPorClube[clube];
        
        const dadosClube = {
          clube: clube,
          regiao: obterRegiaoDoClube(clube) || 'N/A',
          'Associado LEO': 0,
          'Associado LEO e LEO/Leão': 0,
          'Pré LEO': 0,
          'Associado LEO/Leão': 0,
          'Amigo LEO': 0,
          'Amigo LEO e LEO/Leão': 0,
          'Total': pessoasDoClube.length
        };
        
        // Contar por tipo
        pessoasDoClube.forEach(pessoa => {
          const tipo = pessoa.tipo || '';
          if (dadosClube.hasOwnProperty(tipo)) {
            dadosClube[tipo]++;
            dadosRelatorio.totais[tipo]++;
          }
        });
        
        dadosRelatorio.totais['Total'] += pessoasDoClube.length;
        dadosRelatorio.clubes.push(dadosClube);
      });

      const pessoasUnificadas = dadosFiltrados.map(function (pessoa) {
        const clube = pessoa.clube || 'N/A';
        return {
          clube: clube,
          regiao: obterRegiaoDoClube(clube) || pessoa.regiao || 'N/A',
          nome: pessoa.nome || '',
          tipo: pessoa.tipo || 'N/A',
          status: pessoa.status || 'N/A',
          numeroAssociado: pessoa.numeroAssociado || '',
          dataNascimento: pessoa.dataNascimento || '',
          formacao: pessoa.formacao || '',
          profissao: pessoa.profissao || '',
          telefone: pessoa.telefone || '',
          email: pessoa.email || ''
        };
      });
      dadosRelatorio.pessoas = pessoasUnificadas;
      
    } else if (tipoRelatorio !== 'resumo_dm') {
      // Usar método original (buscar de cada clube) - EXCETO para resumo_dm
      const clubes = typeof rtmaObterListaClubesParaRelatorio === 'function'
        ? rtmaObterListaClubesParaRelatorio(config)
        : Object.keys(config.planilhasClubes || {});
      
      clubes.forEach((clube, index) => {
        try {
          logInfo(funcao, `Processando clube ${index + 1}/${clubes.length}: ${clube}`);
          
          const todasPessoas = buscarPessoasRTMA(clube);
          let pessoasValidas = [];
          
          // Aplicar filtro baseado no tipo de relatório
          if (tipoRelatorio === 'data') {
            // Para data específica: mostrar quem estava ativo naquele dia com tipos históricos corretos
            const pessoasComTipoHistorico = [];
            
            todasPessoas.forEach(pessoa => {
              const tipoHistorico = obterTipoHistoricoPessoa(pessoa, dataLimite, incluirInativos);
              if (tipoHistorico) {
                // Criar uma cópia da pessoa com o tipo histórico
                const pessoaHistorica = {
                  ...pessoa,
                  tipo: tipoHistorico,
                  _tipoOriginal: pessoa.tipo, // Manter referência do tipo original
                  _isHistorica: true
                };
                pessoasComTipoHistorico.push(pessoaHistorica);
              }
            });
            
            pessoasValidas = pessoasComTipoHistorico;
          } else if (tipoRelatorio === 'periodo') {
            // Para período: pessoa estava ativa durante o período com tipo histórico baseado na data final
            const pessoasComTipoHistorico = [];
            
            todasPessoas.forEach(pessoa => {
              if (!pessoa) return;
              
              // Verificar se estava ativa durante o período
              let dataInicio = null;
              if (pessoa.associadoDesde && stringValida(pessoa.associadoDesde)) {
                dataInicio = converterDataBRParaJS(pessoa.associadoDesde);
              } else if (pessoa.dataInicioPreLeo && stringValida(pessoa.dataInicioPreLeo)) {
                dataInicio = converterDataBRParaJS(pessoa.dataInicioPreLeo);
              }
              
              if (!dataInicio) return;
              
              // Data de desligamento
              let dataDesligamento = null;
              if (pessoa.dataDesligamento && stringValida(pessoa.dataDesligamento)) {
                dataDesligamento = converterDataBRParaJS(pessoa.dataDesligamento);
              }
              
              // Pessoa deve ter começado antes ou durante o período
              if (dataInicio > dataFimPeriodoObj) return;
              
              // Se tem desligamento, deve ter sido depois do início do período
              if (dataDesligamento && dataDesligamento < dataInicioPeriodoObj) return;
              
              // Determinar tipo histórico baseado na data final do período
              const tipoHistorico = obterTipoHistoricoPessoa(pessoa, dataFimPeriodoObj, incluirInativos);
              if (tipoHistorico) {
                const pessoaHistorica = {
                  ...pessoa,
                  tipo: tipoHistorico,
                  _tipoOriginal: pessoa.tipo,
                  _isHistorica: true
                };
                pessoasComTipoHistorico.push(pessoaHistorica);
              }
            });
            
            pessoasValidas = pessoasComTipoHistorico;
          } else if (tipoRelatorio === 'detalhados') {
            // Relatório detalhado: usar data de referência para determinar estado histórico
            const pessoasComDadosCompletos = [];
            
            todasPessoas.forEach(pessoa => {
              const tipoHistorico = obterTipoHistoricoPessoa(pessoa, dataLimite, incluirInativos);
              if (tipoHistorico) {
                // Criar uma cópia da pessoa com dados históricos
                const pessoaDetalhada = {
                  ...pessoa,
                  tipo: tipoHistorico,
                  _tipoOriginal: pessoa.tipo,
                  _isDetalhada: true,
                  _dataReferencia: dataLimite
                };
                pessoasComDadosCompletos.push(pessoaDetalhada);
              }
            });
            
            pessoasValidas = pessoasComDadosCompletos;
          } else {
            // Relatório atual: considerar filtro de inativos
            if (incluirInativos) {
              // Incluir todas as pessoas (ativas e inativas)
              pessoasValidas = todasPessoas.filter(pessoa => pessoa);
            } else {
              // Apenas pessoas ativas
              pessoasValidas = todasPessoas.filter(pessoa => 
                pessoa && pessoa.status === 'Ativo'
              );
            }
          }
          
          const dadosClube = {
            clube: clube,
            regiao: obterRegiaoDoClube(clube) || 'N/A',
            'Associado LEO': 0,
            'Associado LEO e LEO/Leão': 0,
            'Pré LEO': 0,
            'Associado LEO/Leão': 0,
            'Amigo LEO': 0,
            'Amigo LEO e LEO/Leão': 0,
            'Total': pessoasValidas.length
          };
          
          // Para relatório detalhado, adicionar cada pessoa individualmente
          if (tipoRelatorio === 'detalhados') {
            pessoasValidas.forEach(pessoa => {
              const pessoaDetalhada = {
                regiao: obterRegiaoDoClube(clube) || 'N/A',
                clube: clube,
                status: pessoa.status || 'N/A',
                tipo: pessoa.tipo || 'N/A',
                numeroAssociado: pessoa.numeroAssociado || '',
                nome: pessoa.nome || '',
                formacao: pessoa.formacao || '',
                profissao: pessoa.profissao || '',
                dataInicioPreLeo: pessoa.dataInicioPreLeo || '',
                associadoDesde: pessoa.associadoDesde || '',
                dataDesligamento: pessoa.dataDesligamento || '',
                dataPosseLions: pessoa.dataPosseLions || '',
                email: pessoa.email || '',
                telefone: pessoa.telefone || '',
                endereco: pessoa.endereco || '',
                cep: pessoa.cep || '',
                cidade: pessoa.cidade || '',
                estado: pessoa.estado || '',
                dataNascimento: pessoa.dataNascimento || '',
                rg: pessoa.rg || '',
                cpf: pessoa.cpf || '',
                nomeMae: pessoa.nomeMae || '',
                nomePai: pessoa.nomePai || '',
                estadoCivil: pessoa.estadoCivil || '',
                nomeConjuge: pessoa.nomeConjuge || '',
                profissaoConjuge: pessoa.profissaoConjuge || '',
                nomeEmpresa: pessoa.nomeEmpresa || '',
                cargoEmpresa: pessoa.cargoEmpresa || '',
                telefoneEmpresa: pessoa.telefoneEmpresa || '',
                enderecoEmpresa: pessoa.enderecoEmpresa || ''
              };
              dadosRelatorio.pessoas.push(pessoaDetalhada);
              
              // Contar tipos para totais
              const tipo = pessoa.tipo || '';
              if (dadosRelatorio.totais.hasOwnProperty(tipo)) {
                dadosRelatorio.totais[tipo]++;
              }
            });
          } else if (tipoRelatorio === 'rtma_detalhado') {
            // RTMA Detalhado: adicionar cada pessoa com todas as colunas
            pessoasValidas.forEach(pessoa => {
              const pessoaRTMADetalhada = {
                clube: clube,
                regiao: obterRegiaoDoClube(clube) || 'N/A',
                status: pessoa.status || '',
                tipo: pessoa.tipo || '',
                numeroAssociado: pessoa.numeroAssociado || '',
                nome: pessoa.nome || '',
                cargo: '',
                formacao: pessoa.formacao || '',
                profissao: pessoa.profissao || '',
                dataInicioPreLeo: pessoa.dataInicioPreLeo || '',
                associadoDesde: pessoa.associadoDesde || '',
                dataDesligamento: pessoa.dataDesligamento || '',
                dataPosseLions: pessoa.dataPosseLions || '',
                dataNascimento: pessoa.dataNascimento || '',
                telefone: pessoa.telefone || '',
                email: pessoa.email || '',
                logradouro: pessoa.logradouro || '',
                cidade: pessoa.cidade || '',
                cep: pessoa.cep || ''
              };
              dadosRelatorio.pessoas.push(pessoaRTMADetalhada);
              
              // Contar tipos para totais
              const tipo = pessoa.tipo || '';
              if (dadosRelatorio.totais.hasOwnProperty(tipo)) {
                dadosRelatorio.totais[tipo]++;
              }
            });
          } else if (tipoRelatorio === 'associados_master_senior') {
            const tiposAssociadoLeo = ['Associado LEO', 'Associado LEO e LEO/Leão'];
            let qtdClube = 0;
            todasPessoas.forEach(pessoa => {
              if (!pessoa) return;
              const st = String(pessoa.status || '').trim().toLowerCase();
              if (st !== 'ativo') return;
              const tipoP = String(pessoa.tipo || '').trim();
              if (tiposAssociadoLeo.indexOf(tipoP) === -1) return;
              const refAssoc = obterDataAssociacaoLeoParaClassificacaoMasterSenior(pessoa);
              if (!refAssoc.data || refAssoc.data > dataLimite) return;
              const anosNaData = calcularAnosAssociadoLeoNaData(refAssoc.data, dataLimite);
              if (anosNaData === null || anosNaData < 0) return;
              const classificacao = classificarMasterSeniorAssociadoNaData(anosNaData);
              let dataAssocBR = '';
              if (refAssoc.campoOrigem === 'associadoDesde') dataAssocBR = limparString(pessoa.associadoDesde || '');
              else if (refAssoc.campoOrigem === 'dataInicioPreLeo') dataAssocBR = limparString(pessoa.dataInicioPreLeo || '');
              else if (refAssoc.campoOrigem === 'dataPosseLions') dataAssocBR = limparString(pessoa.dataPosseLions || '');
              const pessoaLinha = {
                clube: clube,
                regiao: obterRegiaoDoClube(clube) || 'N/A',
                status: pessoa.status || '',
                tipo: tipoP,
                numeroAssociado: pessoa.numeroAssociado || '',
                nome: pessoa.nome || '',
                cargo: '',
                formacao: pessoa.formacao || '',
                profissao: pessoa.profissao || '',
                dataInicioPreLeo: pessoa.dataInicioPreLeo || '',
                associadoDesde: pessoa.associadoDesde || '',
                dataDesligamento: pessoa.dataDesligamento || '',
                dataPosseLions: pessoa.dataPosseLions || '',
                dataNascimento: pessoa.dataNascimento || '',
                telefone: pessoa.telefone || '',
                email: pessoa.email || '',
                logradouro: pessoa.logradouro || '',
                cidade: pessoa.cidade || '',
                cep: pessoa.cep || '',
                dataAssociacaoUsadaNoCalculo: dataAssocBR,
                origemDataAssociacaoCalculo: refAssoc.rotuloOrigem || '',
                anosAssociadoNaDataReferencia: anosNaData,
                classificacaoMasterSenior: classificacao
              };
              dadosRelatorio.pessoas.push(pessoaLinha);
              qtdClube++;
              if (dadosRelatorio.totais.hasOwnProperty(tipoP)) {
                dadosRelatorio.totais[tipoP]++;
              }
            });
            dadosRelatorio.totais['Total'] += qtdClube;
          } else if (tipoRelatorio === 'resumo_dm') {
            // Resumo DM: contar APENAS Associados LEO + Associado LEO e LEO/Leão (SEM Amigos)
            pessoasValidas.forEach(pessoa => {
              const tipo = pessoa.tipo || '';
              if (tipo === 'Associado LEO' || tipo === 'Associado LEO e LEO/Leão') {
                // Contar tipos para totais
                if (dadosRelatorio.totais.hasOwnProperty(tipo)) {
                  dadosRelatorio.totais[tipo]++;
                }
              }
            });
          } else {
            // Contar por tipo (relatórios resumidos)
            pessoasValidas.forEach(pessoa => {
              const tipo = pessoa.tipo || '';
              if (dadosClube.hasOwnProperty(tipo)) {
                dadosClube[tipo]++;
                dadosRelatorio.totais[tipo]++;
              }
            });
          }
          
          if (tipoRelatorio !== 'associados_master_senior') {
            dadosRelatorio.totais['Total'] += pessoasValidas.length;
          }
          
          // Adicionar dados do clube apenas para relatórios resumidos
          if (tipoRelatorio !== 'detalhado' && tipoRelatorio !== 'detalhados' && tipoRelatorio !== 'rtma_detalhado' && tipoRelatorio !== 'associados_master_senior') {
            dadosRelatorio.clubes.push(dadosClube);
          }
          
        } catch (error) {
          logWarn(funcao, `Erro ao processar clube ${clube}`, error.message);
          
          // Adicionar clube com erro
          dadosRelatorio.clubes.push({
            clube: clube,
            regiao: obterRegiaoDoClube(clube) || 'N/A',
            'Associado LEO': 'ERRO',
            'Associado LEO e LEO/Leão': 'ERRO',
            'Pré LEO': 'ERRO',
            'Associado LEO/Leão': 'ERRO',
            'Amigo LEO': 'ERRO',
            'Amigo LEO e LEO/Leão': 'ERRO',
            'Total': 'ERRO'
          });
        }
      });
    }
    
    // Ordenar clubes por região e depois por nome
    dadosRelatorio.clubes.sort((a, b) => {
      if (a.regiao !== b.regiao) {
        return a.regiao.localeCompare(b.regiao);
      }
      return a.clube.localeCompare(b.clube);
    });
    
    logInfo(funcao, 'Relatório gerado com sucesso', {
      totalClubes: dadosRelatorio.clubes.length,
      totalPessoas: dadosRelatorio.totais['Total'],
      dataReferencia: dataReferencia
    });
    
    console.log(`🔍 Debug - isDetalhado: ${dadosRelatorio.isDetalhado}, Pessoas array length: ${dadosRelatorio.pessoas ? dadosRelatorio.pessoas.length : 'undefined'}`);
    
    // Lógica específica para Resumo DM
    if (tipoRelatorio === 'resumo_dm') {
      logInfo(funcao, 'Processando Resumo Trimestral DM', {
        dataInicioPeriodo,
        dataFimPeriodo
      });
      
      // Calcular resumo trimestral
      const resumoDM = calcularResumoTrimestralDM(dataInicioPeriodo, dataFimPeriodo);
      
      // Adicionar dados específicos do resumo DM
      dadosRelatorio.dadosPorClube = resumoDM.dadosPorClube;
      dadosRelatorio.totalGeral = resumoDM.totalGeral;
      dadosRelatorio.periodo = resumoDM.periodo;
    }

    if (dadosRelatorio.pessoas && dadosRelatorio.pessoas.length > 0) {
      dadosRelatorio.anoLeonisticoRelatorio = typeof obterAlAtual === 'function' ? obterAlAtual() : '';
      aplicarCargoNominataNasPessoasRelatorio(dadosRelatorio.pessoas);
    }
    
    return respostaSucesso(dadosRelatorio, 'Relatório gerado com sucesso');
    
  } catch (error) {
    return tratarExcecao(error, funcao);
  }
}

/**
 * Gerar relatório detalhado linha a linha de todas as pessoas do período
 * @param {Object} usuario - Dados do usuário
 * @param {string} dataInicioPeriodo - Data de início do período (DD/MM/AAAA)
 * @param {string} dataFimPeriodo - Data de fim do período (DD/MM/AAAA)
 * @param {string} clubeFiltrado - Nome do clube para filtrar (opcional)
 * @return {Object} Dados do relatório detalhado
 */
function gerarExcelDetalhado(usuario, dataInicioPeriodo, dataFimPeriodo, clubeFiltrado = null) {
  const funcao = 'gerarExcelDetalhado';
  
  try {
    logInfo(funcao, 'Iniciando geração de relatório detalhado', { 
      dataInicioPeriodo, dataFimPeriodo, clubeFiltrado
    });
    
    // Verificar se usuário tem permissão de distrito ou secretaria
    if (!usuario || (!usuario.isDistrito && !usuario.isSecretaria)) {
      return respostaErro('Acesso negado. Apenas usuários do distrito ou secretaria podem gerar este relatório.');
    }
    
    // Validar datas
    const dataInicioPeriodoObj = converterDataBRParaJS(dataInicioPeriodo);
    const dataFimPeriodoObj = converterDataBRParaJS(dataFimPeriodo);
    
    if (!dataInicioPeriodoObj || !dataFimPeriodoObj) {
      return respostaErro('Datas do período inválidas. Use o formato DD/MM/AAAA');
    }
    
    if (dataInicioPeriodoObj > dataFimPeriodoObj) {
      return respostaErro('A data de início deve ser anterior ou igual à data de fim do período');
    }
    
    // Preparar dados do relatório
    const dadosRelatorio = {
      titulo: clubeFiltrado 
        ? `Relatório Detalhado - ${clubeFiltrado} - Período ${dataInicioPeriodo} a ${dataFimPeriodo}`
        : `Relatório Detalhado - Distrito LEO LD-8 - Período ${dataInicioPeriodo} a ${dataFimPeriodo}`,
      dataGeracao: new Date().toLocaleDateString('pt-BR'),
      horaGeracao: new Date().toLocaleTimeString('pt-BR'),
      dataInicioPeriodo: dataInicioPeriodo,
      dataFimPeriodo: dataFimPeriodo,
      clubeFiltrado: clubeFiltrado,
      usuario: usuario.email,
      pessoas: []
    };

    const statusClubePorNome = (typeof obterMapaStatusClubesSupabase === 'function')
      ? obterMapaStatusClubesSupabase()
      : {};
    
    // Determinar clubes para buscar
    let clubesParaBuscar = [];
    
    if (clubeFiltrado) {
      // Se há filtro de clube, buscar apenas esse clube
      clubesParaBuscar = [clubeFiltrado];
    } else if (usuario.isRegiao && usuario.clubesPermitidos) {
      // Se é acesso regional, buscar apenas clubes permitidos
      clubesParaBuscar = usuario.clubesPermitidos;
    } else {
      // Se é acesso distrital, buscar todos os clubes
      const config = getRtmaConfig();
      clubesParaBuscar = rtmaObterTodosClubes();
    }
    
    logInfo(funcao, 'Buscando pessoas para relatório detalhado', {
      totalClubes: clubesParaBuscar.length,
      clubeFiltrado: clubeFiltrado || 'Todos',
      dataInicioPeriodo,
      dataFimPeriodo
    });
    
    // Buscar pessoas de todos os clubes
    let todasPessoasRaw = [];
    
    // Se há múltiplos clubes, usar busca em batch (mais eficiente)
    if (clubesParaBuscar.length > 1 && typeof buscarPessoasMultiplosClubesDoSupabase === 'function') {
      try {
        todasPessoasRaw = buscarPessoasMultiplosClubesDoSupabase(clubesParaBuscar);
        logInfo(funcao, 'Pessoas buscadas em batch', { total: todasPessoasRaw.length });
      } catch (erroBatch) {
        logWarn(funcao, 'Erro ao buscar pessoas em batch, tentando individualmente', erroBatch);
        // Fallback: buscar individualmente
        for (const clube of clubesParaBuscar) {
          try {
            const pessoasClube = buscarPessoasDoSupabase(clube);
            if (pessoasClube && pessoasClube.length > 0) {
              todasPessoasRaw.push(...pessoasClube);
            }
          } catch (erroClube) {
            logWarn(funcao, `Erro ao buscar pessoas do clube ${clube}`, erroClube);
          }
        }
      }
    } else {
      // Se há apenas um clube, buscar individualmente
      for (const clube of clubesParaBuscar) {
        try {
          const pessoasClube = buscarPessoasDoSupabase(clube);
          if (pessoasClube && pessoasClube.length > 0) {
            todasPessoasRaw.push(...pessoasClube);
          }
        } catch (erroClube) {
          logWarn(funcao, `Erro ao buscar pessoas do clube ${clube}`, erroClube);
        }
      }
    }
    
    // Processar todas as pessoas e adicionar informações detalhadas
    // Usar status e tipo do período selecionado
    const todasPessoas = [];
    
    // Converter datas para objetos Date (mesma lógica do DM)
    const dataInicioObj = converterDataBRParaJS(dataInicioPeriodo);
    const dataFimObj = converterDataBRParaJS(dataFimPeriodo);
    
    if (!dataInicioObj || !dataFimObj) {
      return respostaErro('Erro ao converter datas do período');
    }
    
    // Ajustar data fim para fim do dia
    dataFimObj.setHours(23, 59, 59, 999);

    const ehAssociadoLeoParaDM = function(tipoHistorico) {
      return tipoHistorico === 'Associado LEO' || tipoHistorico === 'Associado LEO e LEO/Leão';
    };

    const obterDestaqueMovimentacaoDM = function(pessoa) {
      const dataPosseClube = obterDataPosseClube(pessoa);
      if (!dataPosseClube) return null;

      let dataDesligamentoObj = null;
      if (pessoa.dataDesligamento && stringValida(pessoa.dataDesligamento)) {
        dataDesligamentoObj = converterDataBRParaJS(pessoa.dataDesligamento);
      }

      const foiIncluidoNoPeriodo = dataPosseClube >= dataInicioObj && dataPosseClube <= dataFimObj;
      let inclusao = false;
      if (foiIncluidoNoPeriodo) {
        const tipoHistoricoInclusao = obterTipoHistoricoPessoa(pessoa, dataPosseClube, false);
        inclusao = ehAssociadoLeoParaDM(tipoHistoricoInclusao);
      }

      let exclusao = false;
      const foiDesligadoNoPeriodo = dataDesligamentoObj &&
        dataDesligamentoObj >= dataInicioObj &&
        dataDesligamentoObj <= dataFimObj;
      if (foiDesligadoNoPeriodo) {
        const dataAntesDesligamento = new Date(dataDesligamentoObj);
        dataAntesDesligamento.setDate(dataAntesDesligamento.getDate() - 1);
        const tipoHistoricoAntesDesligamento = obterTipoHistoricoPessoa(pessoa, dataAntesDesligamento, false);
        exclusao = ehAssociadoLeoParaDM(tipoHistoricoAntesDesligamento);
      }

      if (exclusao) return 'exclusao';
      if (inclusao) return 'inclusao';
      return null;
    };
    
    let totalProcessadas = 0;
    let totalIncluidas = 0;
    let totalPuladasSemPosse = 0;
    let totalPuladasNaoExistia = 0;
    
    todasPessoasRaw.forEach(pessoa => {
      totalProcessadas++;
      
      // Obter o nome do clube da pessoa
      const clubeNome = pessoa.clube || pessoa.clube_nome || '';
      
      // Obter data de posse no clube (para observação no relatório)
      const dataPosseClube = obterDataPosseClube(pessoa);
      if (!dataPosseClube) {
        totalPuladasSemPosse++;
      }
      
      // Verificar data de desligamento
      let dataDesligamento = null;
      if (pessoa.dataDesligamento && stringValida(pessoa.dataDesligamento)) {
        dataDesligamento = converterDataBRParaJS(pessoa.dataDesligamento);
      }
      
      const temDataInicio = !!(pessoa.dataInicioPreLeo || pessoa.associadoDesde || pessoa.dataPosseLions);
      const ehArquivadoPeriodoAnterior = !!(dataDesligamento && dataDesligamento < dataInicioObj);
      // Verificar se a pessoa existia no período (em qualquer status)
      if (!pessoaExistiaNaDataCompleta(pessoa, dataFimObj)) {
        if (temDataInicio && !ehArquivadoPeriodoAnterior) {
          totalPuladasNaoExistia++;
          return;
        }
        // Sem data de posse/início: incluir com status da época
      }
      
      // Verificar tipo histórico no INÍCIO e no FIM do período (incluindo inativos)
      const tipoHistoricoInicio = obterTipoHistoricoPessoa(pessoa, dataInicioObj, true);
      const tipoHistoricoFim = obterTipoHistoricoPessoa(pessoa, dataFimObj, true);
      
      totalIncluidas++;
      
      // Verificar se a pessoa estava ativa na data de FIM do período
      const estavaAtivaFim = estaVaAtivaNaData(pessoa, dataFimPeriodo);
      const possuiDataDesligamento = !!(pessoa.dataDesligamento && stringValida(pessoa.dataDesligamento));
      
      // Regra solicitada: qualquer data de desligamento registrada deve sair como Inativo
      let statusFinal = 'Inativo';
      if (ehArquivadoPeriodoAnterior) {
        statusFinal = 'Arquivado';
      } else if (!possuiDataDesligamento && estavaAtivaFim) {
        statusFinal = 'Ativo';
      }

      const destaqueMovimentacao = obterDestaqueMovimentacaoDM(pessoa);
      
      // Adicionar pessoa detalhada ao relatório
      const pessoaDetalhada = {
        regiao: rtmaObterRegiaoDoClube(clubeNome) || 'N/A',
        clube: clubeNome,
        status: statusFinal,
        tipo: tipoHistoricoFim || tipoHistoricoInicio || pessoa.tipo || 'N/A',
        numeroAssociado: pessoa.numeroAssociado || '',
        nome: pessoa.nome || '',
        cargo: '',
        formacao: pessoa.formacao || '',
        profissao: pessoa.profissao || '',
        dataInicioPreLeo: pessoa.dataInicioPreLeo || '',
        associadoDesde: pessoa.associadoDesde || '',
        dataDesligamento: pessoa.dataDesligamento || '',
        dataPosseLions: pessoa.dataPosseLions || '',
        dataNascimento: pessoa.dataNascimento || '',
        telefone: pessoa.telefone || '',
        email: pessoa.email || '',
        logradouro: pessoa.logradouro || pessoa.endereco || '',
        cidade: pessoa.cidade || '',
        estado: pessoa.estado || '',
        cep: pessoa.cep || '',
        observacao: dataPosseClube ? '' : 'Sem data de posse',
        destaqueMovimentacao: destaqueMovimentacao
      };
      
      todasPessoas.push(pessoaDetalhada);
    });
    
    const prioridadeTipoDetalhado = function(tipo) {
      const tipoNormalizado = (tipo || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

      if (tipoNormalizado.indexOf('pre leo') !== -1 || tipoNormalizado.indexOf('pre-leo') !== -1) {
        return 99; // Sempre por último
      }
      if (tipoNormalizado === 'associado leo') return 1;
      if (tipoNormalizado === 'associado leo e leo/leao') return 2;
      if (tipoNormalizado === 'associado leo/leao') return 3;
      if (tipoNormalizado === 'amigo leo') return 4;
      if (tipoNormalizado === 'amigo leo e leo/leao') return 5;
      if (tipoNormalizado === 'amigo leo/leao') return 6;

      return 50;
    };

    const compararPessoaDetalhado = function(a, b, considerarClube) {
      if (considerarClube) {
        const clubeCompare = (a.clube || '').localeCompare(b.clube || '', 'pt-BR');
        if (clubeCompare !== 0) return clubeCompare;
      }
      const ordemStatus = { 'Ativo': 0, 'Inativo': 1, 'Arquivado': 2 };
      const statusCompare = (ordemStatus[a.status] ?? 9) - (ordemStatus[b.status] ?? 9);
      if (statusCompare !== 0) return statusCompare;
      const tipoCompare = prioridadeTipoDetalhado(a.tipo) - prioridadeTipoDetalhado(b.tipo);
      if (tipoCompare !== 0) return tipoCompare;
      return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
    };

    // Ordenar pessoas por clube, tipo e nome (com Pré-LEO por último)
    todasPessoas.sort((a, b) => {
      return compararPessoaDetalhado(a, b, true);
    });

    if (typeof aplicarCargoNominataNasPessoasRelatorio === 'function') {
      aplicarCargoNominataNasPessoasRelatorio(todasPessoas);
    }
    
    dadosRelatorio.pessoas = todasPessoas;
    
    logInfo(funcao, 'Relatório detalhado gerado com sucesso', {
      totalPessoas: todasPessoas.length,
      totalClubes: clubesParaBuscar.length,
      totalProcessadas: totalProcessadas,
      totalIncluidas: totalIncluidas,
      totalPuladasSemPosse: totalPuladasSemPosse,
      totalPuladasNaoExistia: totalPuladasNaoExistia,
      totalPessoasRaw: todasPessoasRaw.length
    });

    // Montar mapa de pessoas por clube
    const pessoasPorClube = {};
    todasPessoas.forEach(pessoa => {
      const clube = pessoa.clube || 'Sem Clube';
      if (!pessoasPorClube[clube]) {
        pessoasPorClube[clube] = [];
      }
      pessoasPorClube[clube].push(pessoa);
    });

    Object.keys(pessoasPorClube).forEach(clube => {
      pessoasPorClube[clube].sort((a, b) => compararPessoaDetalhado(a, b, false));
    });

    // Montar resumo por clube usando a mesma lógica do DM
    const resumoDM = calcularResumoDMComFiltrosDashboard(dataInicioPeriodo, dataFimPeriodo);
    const resumoPorClube = {};
    if (resumoDM && Array.isArray(resumoDM.dadosPorClube)) {
      resumoDM.dadosPorClube.forEach(item => {
        if (!item || !item.clube) return;
        if (clubesParaBuscar.indexOf(item.clube) === -1) return;
        resumoPorClube[item.clube] = {
          clube: item.clube,
          regiao: item.regiao || 'N/A',
          totalInicio: Number(item.totalInicio) || 0,
          inclusoes: Number(item.inclusoes) || 0,
          exclusoes: Number(item.exclusoes) || 0,
          totalFim: Number(item.totalFim) || 0
        };
      });
    }

    dadosRelatorio.pessoasPorClube = pessoasPorClube;
    dadosRelatorio.resumoPorClube = resumoPorClube;
    dadosRelatorio.statusClubePorNome = statusClubePorNome;
    
    return respostaSucesso(dadosRelatorio, 'Relatório detalhado gerado com sucesso');
    
  } catch (error) {
    return tratarExcecao(error, funcao);
  }
}

/**
 * Gerar relatório específico de movimentação para DM
 * @param {Object} usuario - Dados do usuário
 * @param {string} dataInicioPeriodo - Data de início do período (DD/MM/AAAA)
 * @param {string} dataFimPeriodo - Data de fim do período (DD/MM/AAAA)
 * @return {Object} Dados do relatório de movimentação DM
 */
function gerarRelatorioMovimentacaoDM(usuario, dataInicioPeriodo, dataFimPeriodo) {
  const funcao = 'gerarRelatorioMovimentacaoDM';
  
  try {
    logInfo(funcao, 'Iniciando geração de relatório de movimentação DM', {
      dataInicioPeriodo,
      dataFimPeriodo
    });
    
    // Verificar se usuário tem permissão de distrito
    if (!usuario || !usuario.isDistrito) {
      return respostaErro('Acesso negado. Apenas usuários do distrito podem gerar este relatório.');
    }
    
    const config = getRtmaConfig();
    // Obter todos os clubes das regiões ao invés de planilhas
    const clubes = (typeof rtmaObterTodosClubes === 'function') 
      ? rtmaObterTodosClubes() 
      : (() => {
          const todosClubes = [];
          if (config.regioes) {
            Object.values(config.regioes).forEach(clubesRegiao => {
              todosClubes.push(...clubesRegiao);
            });
          }
          return todosClubes;
        })();
    
    const dadosPorClube = [];
    let totalGeral = {
      totalInicio: 0,
      inclusoes: 0,
      exclusoes: 0,
      totalFim: 0
    };
    
    // Converter datas para objetos Date
    const dataInicioObj = converterDataBRParaJS(dataInicioPeriodo);
    const dataFimObj = converterDataBRParaJS(dataFimPeriodo);
    
    if (!dataInicioObj || !dataFimObj) {
      return respostaErro('Datas inválidas para o período. Use o formato DD/MM/AAAA');
    }
    
    if (dataInicioObj > dataFimObj) {
      return respostaErro('A data de início deve ser anterior ou igual à data de fim do período');
    }
    
    // Processar cada clube
    clubes.forEach(clube => {
      try {
        const todasPessoas = buscarPessoasRTMA(clube);
        
        let dadosClube = {
          clube: clube,
          regiao: obterRegiaoDoClube(clube) || 'N/A',
          totalInicio: 0,
          inclusoes: 0,
          exclusoes: 0,
          totalFim: 0
        };
        let totalFimContagem = 0;
        
        todasPessoas.forEach(pessoa => {
          // Obter data de posse no clube
          const dataPosseClube = obterDataPosseClube(pessoa);
          if (!dataPosseClube) {
            return; // Sem data de posse, não pode ser contabilizado
          }
          
          // Verificar data de desligamento
          let dataDesligamento = null;
          if (pessoa.dataDesligamento && stringValida(pessoa.dataDesligamento)) {
            dataDesligamento = converterDataBRParaJS(pessoa.dataDesligamento);
          }
          
          // Verificar tipo histórico no INÍCIO do período
          const tipoHistoricoInicio = obterTipoHistoricoPessoa(pessoa, dataInicioObj, false);
          const eraAssociadoLEONoInicio = tipoHistoricoInicio === 'Associado LEO' || tipoHistoricoInicio === 'Associado LEO e LEO/Leão';
          
          // Verificar tipo histórico no FIM do período
          const tipoHistoricoFim = obterTipoHistoricoPessoa(pessoa, dataFimObj, false);
          const eraAssociadoLEONoFim = tipoHistoricoFim === 'Associado LEO' || tipoHistoricoFim === 'Associado LEO e LEO/Leão';
          if (eraAssociadoLEONoFim) {
            const tinhaPosseNoFim = dataPosseClube && dataPosseClube <= dataFimObj;
            const estavaAtivoNoFim = !dataDesligamento || dataDesligamento > dataFimObj;
            if (tinhaPosseNoFim && estavaAtivoNoFim) {
              totalFimContagem++;
            }
          }
          
          // TOTAL INÍCIO: Contar diretamente quantas pessoas estavam ATIVAS como Associado LEO no INÍCIO do período
          // Usar a mesma lógica do totalFim para garantir que totalInicio de um período = totalFim do período anterior
          if (eraAssociadoLEONoInicio) {
            const tinhaPosseNoInicio = dataPosseClube && dataPosseClube <= dataInicioObj;
            const estavaAtivoNoInicio = !dataDesligamento || dataDesligamento > dataInicioObj;
            
            if (tinhaPosseNoInicio && estavaAtivoNoInicio) {
              dadosClube.totalInicio++;
            }
          }
          
          // INCLUSÕES: Data de posse no clube DENTRO do período (entre início e fim)
          // E ERA "Associado LEO" ou "Associado LEO e LEO/Leão" no momento da inclusão
          // IMPORTANTE: Só contar como inclusão se NÃO estava no totalInicio (para evitar dupla contagem)
          // Uma pessoa está no totalInicio se tinha posse ANTES do período (dataPosseClube < dataInicioObj)
          // Uma pessoa é inclusão se teve posse DENTRO do período (dataPosseClube >= dataInicioObj && <= dataFimObj)
          const foiIncluidoNoPeriodo = dataPosseClube >= dataInicioObj && dataPosseClube <= dataFimObj;
          if (foiIncluidoNoPeriodo) {
            // Se a posse foi dentro do período, ela NÃO estava no totalInicio (que conta apenas posses antes do período)
            // Portanto, pode ser contada como inclusão
            // Verificar tipo histórico na data de inclusão
            const tipoHistoricoInclusao = obterTipoHistoricoPessoa(pessoa, dataPosseClube, false);
            const eraAssociadoLEONaInclusao = tipoHistoricoInclusao === 'Associado LEO' || tipoHistoricoInclusao === 'Associado LEO e LEO/Leão';
            
            if (eraAssociadoLEONaInclusao) {
              dadosClube.inclusoes++;
            }
          }
          
          // EXCLUSÕES: Data de desligamento DENTRO do período (entre início e fim)
          // E ERA "Associado LEO" ou "Associado LEO e LEO/Leão" antes do desligamento
          const foiDesligadoNoPeriodo = dataDesligamento && 
                                       dataDesligamento >= dataInicioObj && 
                                       dataDesligamento <= dataFimObj;
          if (foiDesligadoNoPeriodo) {
            // Verificar tipo histórico na data anterior ao desligamento
            const dataAntesDesligamento = new Date(dataDesligamento);
            dataAntesDesligamento.setDate(dataAntesDesligamento.getDate() - 1);
            const tipoHistoricoAntesDesligamento = obterTipoHistoricoPessoa(pessoa, dataAntesDesligamento, false);
            const eraAssociadoLEOAntesDesligamento = tipoHistoricoAntesDesligamento === 'Associado LEO' || tipoHistoricoAntesDesligamento === 'Associado LEO e LEO/Leão';
            
            if (eraAssociadoLEOAntesDesligamento) {
                dadosClube.exclusoes++;
              }
          }
        });
        
        // TOTAL FIM: contagem direta na data final do período
        dadosClube.totalFim = totalFimContagem;
        
        // Adicionar aos totais gerais
        totalGeral.totalInicio += dadosClube.totalInicio;
        totalGeral.inclusoes += dadosClube.inclusoes;
        totalGeral.exclusoes += dadosClube.exclusoes;
        totalGeral.totalFim += dadosClube.totalFim;
        
        dadosPorClube.push(dadosClube);
        
      } catch (error) {
        logWarn(funcao, `Erro ao processar clube ${clube}`, error.message);
        
        // Adicionar clube com erro
        dadosPorClube.push({
          clube: clube,
          regiao: obterRegiaoDoClube(clube) || 'N/A',
          totalInicio: 'ERRO',
          inclusoes: 'ERRO',
          exclusoes: 'ERRO',
          totalFim: 'ERRO'
        });
      }
    });
    
    // Ordenar clubes por região e depois por nome
    dadosPorClube.sort((a, b) => {
      if (a.regiao !== b.regiao) {
        return a.regiao.localeCompare(b.regiao);
      }
      return a.clube.localeCompare(b.clube);
    });
    
    const dadosRelatorio = {
      titulo: `Relatório de Movimentação DM - Período ${dataInicioPeriodo} a ${dataFimPeriodo}`,
      dataGeracao: new Date().toLocaleDateString('pt-BR'),
      horaGeracao: new Date().toLocaleTimeString('pt-BR'),
      tipoRelatorio: 'movimentacao_dm',
      dataInicioPeriodo: dataInicioPeriodo,
      dataFimPeriodo: dataFimPeriodo,
      usuario: usuario.email,
      isMovimentacaoDM: true,
      dadosPorClube: dadosPorClube,
      totalGeral: totalGeral,
      periodo: {
        inicio: dataInicioPeriodo,
        fim: dataFimPeriodo
      }
    };
    
    logInfo(funcao, 'Relatório de movimentação DM gerado com sucesso', {
      totalClubes: dadosPorClube.length,
      totalInicio: totalGeral.totalInicio,
      totalFim: totalGeral.totalFim,
      inclusoes: totalGeral.inclusoes,
      exclusoes: totalGeral.exclusoes
    });
    
    return respostaSucesso(dadosRelatorio, 'Relatório de movimentação DM gerado com sucesso');
    
  } catch (error) {
    return tratarExcecao(error, funcao);
  }
}

/**
 * Calcular resumo DM usando a mesma lógica do dashboard filtrado
 * @param {string} dataInicioPeriodo - Data de início do período (DD/MM/AAAA)
 * @param {string} dataFimPeriodo - Data de fim do período (DD/MM/AAAA)
 * @return {Object} Dados do resumo DM
 */
function calcularResumoDMComFiltrosDashboard(dataInicioPeriodo, dataFimPeriodo) {
  const funcao = 'calcularResumoDMComFiltrosDashboard';
  
  try {
    logInfo(funcao, 'Iniciando cálculo do resumo DM com filtros do dashboard', {
      dataInicioPeriodo,
      dataFimPeriodo
    });
    
    // Obter clubes usando múltiplas estratégias para garantir que funcione
    let clubes = [];
    
    // Estratégia 1: Usar rtmaObterTodosClubes se disponível
    if (typeof rtmaObterTodosClubes === 'function') {
      clubes = rtmaObterTodosClubes();
      logInfo(funcao, 'Clubes obtidos via rtmaObterTodosClubes', { total: clubes ? clubes.length : 0 });
    }
    
    // Estratégia 2: Se não obteve clubes, tentar via config
    if (!arrayValido(clubes) || clubes.length === 0) {
    const config = getRtmaConfig();
      if (config && config.regioes) {
        clubes = [];
            Object.values(config.regioes).forEach(clubesRegiao => {
          if (Array.isArray(clubesRegiao)) {
            clubes.push(...clubesRegiao);
          }
        });
        logInfo(funcao, 'Clubes obtidos via config.regioes', { total: clubes.length });
      }
    }
    
    // Estratégia 3: Fallback direto para RTMA_REGIOES
    if (!arrayValido(clubes) || clubes.length === 0) {
      if (typeof RTMA_REGIOES !== 'undefined' && RTMA_REGIOES) {
        clubes = [];
        Object.values(RTMA_REGIOES).forEach(clubesRegiao => {
          if (Array.isArray(clubesRegiao)) {
            clubes.push(...clubesRegiao);
          }
        });
        logInfo(funcao, 'Clubes obtidos via RTMA_REGIOES (fallback)', { total: clubes.length });
      }
    }
    
    // Validar que temos clubes para processar
    if (!arrayValido(clubes) || clubes.length === 0) {
      logError(funcao, 'Nenhum clube encontrado para processar', {
        temRtmaObterTodosClubes: typeof rtmaObterTodosClubes === 'function',
        temConfig: typeof getRtmaConfig === 'function',
        temRTMA_REGIOES: typeof RTMA_REGIOES !== 'undefined'
      });
      return {
        dadosPorClube: [],
        totalGeral: {
          totalInicio: 0,
          inclusoes: 0,
          exclusoes: 0,
          totalFim: 0
        },
        periodo: {
          inicio: dataInicioPeriodo,
          fim: dataFimPeriodo
        }
      };
    }
    
    logInfo(funcao, 'Clubes encontrados para processar', { total: clubes.length, primeiros: clubes.slice(0, 3) });
    
    const dadosPorClube = [];
    let totalGeral = {
      totalInicio: 0,
      inclusoes: 0,
      exclusoes: 0,
      totalFim: 0
    };
    
    const dataInicioObj = converterDataBRParaJS(dataInicioPeriodo);
    let dataFimObj = converterDataBRParaJS(dataFimPeriodo);
    
    if (!dataInicioObj || !dataFimObj) {
      throw new Error('Datas inválidas para o período');
    }
    
    // Ajustar data fim para o final do dia (23:59:59) para garantir que pessoas ativas no último dia sejam contadas
    // Isso garante consistência com o dashboard que usa periodoAnalise.fim que pode ser 23:59:59
    dataFimObj.setHours(23, 59, 59, 999);
    
    clubes.forEach(clube => {
      try {
        const todasPessoas = buscarPessoasRTMA(clube);
        
        // Obter região do clube usando função disponível
        let regiaoClube = 'N/A';
        if (typeof obterRegiaoDoClube === 'function') {
          regiaoClube = obterRegiaoDoClube(clube) || 'N/A';
        } else if (typeof rtmaObterRegiaoDoClube === 'function') {
          regiaoClube = rtmaObterRegiaoDoClube(clube) || 'N/A';
        }
        
        let dadosClube = {
          clube: clube,
          regiao: regiaoClube,
          totalInicio: 0,
          inclusoes: 0,
          exclusoes: 0,
          totalFim: 0
        };
        let totalFimContagem = 0;
        
        todasPessoas.forEach(pessoa => {
          // Obter data de posse no clube
          const dataPosseClube = obterDataPosseClube(pessoa);
          if (!dataPosseClube) {
            return; // Sem data de posse, não pode ser contabilizado
          }
          
          // Verificar data de desligamento
          let dataDesligamento = null;
          if (pessoa.dataDesligamento && stringValida(pessoa.dataDesligamento)) {
            dataDesligamento = converterDataBRParaJS(pessoa.dataDesligamento);
          }
          
          // Verificar tipo histórico no INÍCIO do período
          // IMPORTANTE: Usar a mesma lógica do totalFim para garantir consistência entre períodos
          // O totalInicio de um período deve ser igual ao totalFim do período anterior
          const tipoHistoricoInicio = obterTipoHistoricoPessoa(pessoa, dataInicioObj, false);
          const eraAssociadoLEONoInicio = tipoHistoricoInicio === 'Associado LEO' || tipoHistoricoInicio === 'Associado LEO e LEO/Leão';
          
          // Verificar tipo histórico no FIM do período
          const tipoHistoricoFim = obterTipoHistoricoPessoa(pessoa, dataFimObj, false);
          const eraAssociadoLEONoFim = tipoHistoricoFim === 'Associado LEO' || tipoHistoricoFim === 'Associado LEO e LEO/Leão';
          if (eraAssociadoLEONoFim) {
            const tinhaPosseNoFim = dataPosseClube && dataPosseClube <= dataFimObj;
            const estavaAtivoNoFim = !dataDesligamento || dataDesligamento > dataFimObj;
            if (tinhaPosseNoFim && estavaAtivoNoFim) {
              totalFimContagem++;
            }
          }
          
          // TOTAL INÍCIO: Contar diretamente quantas pessoas estavam ATIVAS como Associado LEO no INÍCIO do período
          // IMPORTANTE: obterTipoHistoricoPessoa já verifica TUDO:
          // - Se pessoa existia na data (pessoaExistiaNaDataCompleta)
          // - Se pessoa estava ativa na data (estavAtivoNaDataHistorica verifica dataDesligamento <= dataReferencia)
          // - Se pessoa tinha posse no clube na data (dataAssociadoDesde <= dataReferencia)
          // - Se pessoa não tinha completado 31 anos ou tinha posse no Lions
          // Se retornou 'Associado LEO' ou 'Associado LEO e LEO/Leão', significa que todas as condições foram atendidas
          // Usar a mesma lógica do totalFim para garantir que totalInicio de um período = totalFim do período anterior
          if (eraAssociadoLEONoInicio) {
            // Verificação adicional para garantir que a pessoa realmente deveria ser contada
            // (obterTipoHistoricoPessoa já verifica isso, mas vamos garantir)
            const tinhaPosseNoInicio = dataPosseClube && dataPosseClube <= dataInicioObj;
            const estavaAtivoNoInicio = !dataDesligamento || dataDesligamento > dataInicioObj;
            
            // Só contar se realmente tinha posse e estava ativa no início
            if (tinhaPosseNoInicio && estavaAtivoNoInicio) {
              dadosClube.totalInicio++;
            }
          }
          
          // INCLUSÕES: Data de posse no clube DENTRO do período (entre início e fim)
          // E ERA "Associado LEO" ou "Associado LEO e LEO/Leão" no momento da inclusão
          // IMPORTANTE: Só contar como inclusão se NÃO estava no totalInicio (para evitar dupla contagem)
          const foiIncluidoNoPeriodo = dataPosseClube >= dataInicioObj && dataPosseClube <= dataFimObj;
          if (foiIncluidoNoPeriodo) {
            // Verificar se a pessoa NÃO estava no totalInicio (não tinha posse antes do período)
            const estavaNoTotalInicio = dataPosseClube < dataInicioObj;
            
            // Só contar como inclusão se não estava no totalInicio
            if (!estavaNoTotalInicio) {
              // Verificar tipo histórico na data de inclusão
              const tipoHistoricoInclusao = obterTipoHistoricoPessoa(pessoa, dataPosseClube, false);
              const eraAssociadoLEONaInclusao = tipoHistoricoInclusao === 'Associado LEO' || tipoHistoricoInclusao === 'Associado LEO e LEO/Leão';
              
              if (eraAssociadoLEONaInclusao) {
                dadosClube.inclusoes++;
              }
            }
          }
          
          // EXCLUSÕES: Data de desligamento DENTRO do período (entre início e fim)
          // E ERA "Associado LEO" ou "Associado LEO e LEO/Leão" antes do desligamento
          const foiDesligadoNoPeriodo = dataDesligamento && 
                                       dataDesligamento >= dataInicioObj && 
                                       dataDesligamento <= dataFimObj;
          if (foiDesligadoNoPeriodo) {
            // Verificar tipo histórico na data anterior ao desligamento
            const dataAntesDesligamento = new Date(dataDesligamento);
            dataAntesDesligamento.setDate(dataAntesDesligamento.getDate() - 1);
            const tipoHistoricoAntesDesligamento = obterTipoHistoricoPessoa(pessoa, dataAntesDesligamento, false);
            const eraAssociadoLEOAntesDesligamento = tipoHistoricoAntesDesligamento === 'Associado LEO' || tipoHistoricoAntesDesligamento === 'Associado LEO e LEO/Leão';
            
            if (eraAssociadoLEOAntesDesligamento) {
            dadosClube.exclusoes++;
          }
          }
        });
        
        // TOTAL FIM: contagem direta na data final do período
        dadosClube.totalFim = totalFimContagem;
        
        totalGeral.totalInicio += dadosClube.totalInicio;
        totalGeral.inclusoes += dadosClube.inclusoes;
        totalGeral.exclusoes += dadosClube.exclusoes;
        totalGeral.totalFim += dadosClube.totalFim;
        
        dadosPorClube.push(dadosClube);
        
      } catch (error) {
        logWarn(funcao, `Erro ao processar clube ${clube}`, error.message);
        // Obter região do clube usando função disponível
        let regiaoClube = 'N/A';
        if (typeof obterRegiaoDoClube === 'function') {
          regiaoClube = obterRegiaoDoClube(clube) || 'N/A';
        } else if (typeof rtmaObterRegiaoDoClube === 'function') {
          regiaoClube = rtmaObterRegiaoDoClube(clube) || 'N/A';
        }
        
        dadosPorClube.push({
          clube: clube,
          regiao: regiaoClube,
          totalInicio: 0,
          inclusoes: 0,
          exclusoes: 0,
          totalFim: 0
        });
      }
    });
    
    // Ordenar clubes alfabeticamente por nome (ignorando maiúsculas/minúsculas e acentos)
    dadosPorClube.sort((a, b) => {
      const nomeA = (a.clube || '').toLowerCase().trim();
      const nomeB = (b.clube || '').toLowerCase().trim();
      // Usar localeCompare com opções para ignorar acentos e maiúsculas
      return nomeA.localeCompare(nomeB, 'pt-BR', { 
        sensitivity: 'base',
        ignorePunctuation: true,
        numeric: true
      });
    });
    
    logInfo(funcao, 'Resumo DM calculado com sucesso', {
      totalClubes: dadosPorClube.length,
      totalGeral: totalGeral,
      periodo: {
        inicio: dataInicioPeriodo,
        fim: dataFimPeriodo
      }
    });
    
    return {
      dadosPorClube,
      totalGeral,
      periodo: {
        inicio: dataInicioPeriodo,
        fim: dataFimPeriodo
      }
    };
    
  } catch (error) {
    logError(funcao, 'Erro ao calcular resumo DM com filtros do dashboard', error);
    return {
      dadosPorClube: [],
      totalGeral: {
        totalInicio: 0,
        inclusoes: 0,
        exclusoes: 0,
        totalFim: 0
      },
      periodo: {
        inicio: dataInicioPeriodo,
        fim: dataFimPeriodo
      }
    };
  }
}

/**
 * Calcular resumo trimestral para DM (função legada - manter para compatibilidade)
 * @param {string} dataInicioPeriodo - Data de início do período (DD/MM/AAAA)
 * @param {string} dataFimPeriodo - Data de fim do período (DD/MM/AAAA)
 * @return {Object} Dados do resumo trimestral
 */
function calcularResumoTrimestralDM(dataInicioPeriodo, dataFimPeriodo) {
  const funcao = 'calcularResumoTrimestralDM';
  
  try {
    logInfo(funcao, 'Iniciando cálculo do resumo trimestral DM', {
      dataInicioPeriodo,
      dataFimPeriodo
    });
    
    const config = getRtmaConfig();
    // Obter todos os clubes das regiões ao invés de planilhas
    const clubes = (typeof rtmaObterTodosClubes === 'function') 
      ? rtmaObterTodosClubes() 
      : (() => {
          const todosClubes = [];
          if (config.regioes) {
            Object.values(config.regioes).forEach(clubesRegiao => {
              todosClubes.push(...clubesRegiao);
            });
          }
          return todosClubes;
        })();
    
    const dadosPorClube = [];
    let totalGeral = {
      totalInicio: 0,
      inclusoes: 0,
      exclusoes: 0,
      totalFim: 0
    };
    
    // Converter datas para objetos Date
    const dataInicioObj = converterDataBRParaJS(dataInicioPeriodo);
    const dataFimObj = converterDataBRParaJS(dataFimPeriodo);
    
    if (!dataInicioObj || !dataFimObj) {
      throw new Error('Datas inválidas para o período');
    }
    
    // Processar cada clube
    clubes.forEach(clube => {
      try {
        const todasPessoas = buscarPessoasRTMA(clube);
        
        let dadosClube = {
          clube: clube,
          regiao: obterRegiaoDoClube(clube) || 'N/A',
          totalInicio: 0,
          inclusoes: 0,
          exclusoes: 0,
          totalFim: 0
        };
        
        todasPessoas.forEach(pessoa => {
          // Obter data de posse no clube
          const dataPosseClube = obterDataPosseClube(pessoa);
          if (!dataPosseClube) {
            return; // Sem data de posse, não pode ser contabilizado
          }
          
          // Verificar data de desligamento
          let dataDesligamento = null;
          if (pessoa.dataDesligamento && stringValida(pessoa.dataDesligamento)) {
            dataDesligamento = converterDataBRParaJS(pessoa.dataDesligamento);
          }
          
          // Verificar tipo histórico no INÍCIO do período
          const tipoHistoricoInicio = obterTipoHistoricoPessoa(pessoa, dataInicioObj, false);
          const eraAssociadoLEONoInicio = tipoHistoricoInicio === 'Associado LEO' || tipoHistoricoInicio === 'Associado LEO e LEO/Leão';
          
          // Verificar tipo histórico no FIM do período
          const tipoHistoricoFim = obterTipoHistoricoPessoa(pessoa, dataFimObj, false);
          const eraAssociadoLEONoFim = tipoHistoricoFim === 'Associado LEO' || tipoHistoricoFim === 'Associado LEO e LEO/Leão';
          
          // TOTAL INÍCIO: Contar diretamente quantas pessoas estavam ATIVAS como Associado LEO no INÍCIO do período
          // Usar a mesma lógica do totalFim para garantir que totalInicio de um período = totalFim do período anterior
          if (eraAssociadoLEONoInicio) {
            const tinhaPosseNoInicio = dataPosseClube && dataPosseClube <= dataInicioObj;
            const estavaAtivoNoInicio = !dataDesligamento || dataDesligamento > dataInicioObj;
            
            if (tinhaPosseNoInicio && estavaAtivoNoInicio) {
              dadosClube.totalInicio++;
            }
          }
          
          // INCLUSÕES: Data de posse no clube DENTRO do período (entre início e fim)
          // E ERA "Associado LEO" ou "Associado LEO e LEO/Leão" no momento da inclusão
          // IMPORTANTE: Só contar como inclusão se NÃO estava no totalInicio (para evitar dupla contagem)
          const foiIncluidoNoPeriodo = dataPosseClube >= dataInicioObj && dataPosseClube <= dataFimObj;
          if (foiIncluidoNoPeriodo) {
            // Verificar se a pessoa NÃO estava no totalInicio (não tinha posse antes do período)
            const estavaNoTotalInicio = dataPosseClube < dataInicioObj;
            
            // Só contar como inclusão se não estava no totalInicio
            if (!estavaNoTotalInicio) {
              // Verificar tipo histórico na data de inclusão
              const tipoHistoricoInclusao = obterTipoHistoricoPessoa(pessoa, dataPosseClube, false);
              const eraAssociadoLEONaInclusao = tipoHistoricoInclusao === 'Associado LEO' || tipoHistoricoInclusao === 'Associado LEO e LEO/Leão';
              
              if (eraAssociadoLEONaInclusao) {
                dadosClube.inclusoes++;
              }
            }
          }
          
          // EXCLUSÕES: Data de desligamento DENTRO do período (entre início e fim)
          // E ERA "Associado LEO" ou "Associado LEO e LEO/Leão" antes do desligamento
          const foiDesligadoNoPeriodo = dataDesligamento && 
                                       dataDesligamento >= dataInicioObj && 
                                       dataDesligamento <= dataFimObj;
          if (foiDesligadoNoPeriodo) {
            // Verificar tipo histórico na data anterior ao desligamento
            const dataAntesDesligamento = new Date(dataDesligamento);
            dataAntesDesligamento.setDate(dataAntesDesligamento.getDate() - 1);
            const tipoHistoricoAntesDesligamento = obterTipoHistoricoPessoa(pessoa, dataAntesDesligamento, false);
            const eraAssociadoLEOAntesDesligamento = tipoHistoricoAntesDesligamento === 'Associado LEO' || tipoHistoricoAntesDesligamento === 'Associado LEO e LEO/Leão';
            
            if (eraAssociadoLEOAntesDesligamento) {
                dadosClube.exclusoes++;
              }
          }
        });
        
        // TOTAL FIM: contagem direta na data final do período
        dadosClube.totalFim = totalFimContagem;
        
        // Adicionar aos totais gerais
        totalGeral.totalInicio += dadosClube.totalInicio;
        totalGeral.inclusoes += dadosClube.inclusoes;
        totalGeral.exclusoes += dadosClube.exclusoes;
        totalGeral.totalFim += dadosClube.totalFim;
        
        dadosPorClube.push(dadosClube);
        console.log(`[${funcao}] Clube ${clube} adicionado:`, dadosClube);
        
      } catch (error) {
        console.error(`[${funcao}] Erro ao processar clube ${clube}:`, error);
        logWarn(funcao, `Erro ao processar clube ${clube}`, error.message);
        
        // Adicionar clube com erro
        dadosPorClube.push({
          clube: clube,
          regiao: obterRegiaoDoClube(clube) || 'N/A',
          totalInicio: 'ERRO',
          inclusoes: 'ERRO',
          exclusoes: 'ERRO',
          totalFim: 'ERRO'
        });
      }
    });
    
    console.log(`[${funcao}] Total de clubes processados: ${dadosPorClube.length}`);
    console.log(`[${funcao}] Primeiros 3 clubes:`, dadosPorClube.slice(0, 3));
    
    const resultado = {
      dadosPorClube,
      totalGeral,
      periodo: {
        inicio: dataInicioPeriodo,
        fim: dataFimPeriodo
      }
    };
    
    logInfo(funcao, 'Resumo trimestral calculado', {
      totalClubes: dadosPorClube.length,
      totalGeral
    });
    
    return resultado;
    
  } catch (error) {
    logError(funcao, 'Erro ao calcular resumo trimestral', error.message);
    return {
      dadosPorClube: [],
      totalGeral: {
        totalInicio: 0,
        inclusoes: 0,
        exclusoes: 0,
        totalFim: 0
      },
      periodo: {
        inicio: dataInicioPeriodo,
        fim: dataFimPeriodo
      }
    };
  }
}

/**
 * Verificar se pessoa existia na data especificada
 * @param {Object} pessoa - Dados da pessoa
 * @param {Date} dataReferencia - Data de referência
 * @return {boolean} Se a pessoa existia na data
 */
function pessoaExistiaNaData(pessoa, dataReferencia) {
  // Verificar se pessoa tinha algum tipo de associação na data
  const dataPosseClube = obterDataPosseClube(pessoa);
  if (dataPosseClube && dataPosseClube <= dataReferencia) {
    // Verificar se não foi desligada antes da data
    if (pessoa.dataDesligamento) {
      const dataDesligamento = converterDataBRParaJS(pessoa.dataDesligamento);
      if (dataDesligamento && dataDesligamento <= dataReferencia) {
        return false; // Foi desligada antes da data
      }
    }
    return true; // Existia na data
  }
  return false;
}

/**
 * Verificar se uma pessoa ERA Associado LEO no período (nova lógica DM)
 * @param {Object} pessoa - Dados da pessoa
 * @param {Date} dataInicioPeriodo - Data de início do período
 * @param {Date} dataFimPeriodo - Data de fim do período
 * @return {boolean} True se era Associado LEO no período
 */
function eraAssociadoLEONoPeriodo(pessoa, dataInicioPeriodo, dataFimPeriodo) {
  try {
    // 1. Verificar se possui data de início como Pré LEO
    if (!pessoa.dataInicioPreLeo) {
      return false; // Pré LEO nunca terá data de posse no clube
    }
    
    // 2. Verificar se possui data de posse no clube
    const dataPosseClube = obterDataPosseClube(pessoa);
    if (!dataPosseClube) {
      return false; // Sem posse no clube
    }
    
    // 3. Verificar se não possui data de desligamento entre posse e fim do período
    if (pessoa.dataDesligamento) {
      const dataDesligamento = converterDataBRParaJS(pessoa.dataDesligamento);
      if (dataDesligamento && dataDesligamento <= dataFimPeriodo) {
        return false; // Foi desligada antes do fim do período
      }
    }
    
    // 4. Verificar se não completou 31 anos no AL da data de fim do período
    const dataNascimento = converterDataBRParaJS(pessoa.dataNascimento);
    if (!dataNascimento) {
      return false; // Sem data de nascimento
    }
    
    // Se completou 31 anos no AL da data de fim do período, não era mais Associado LEO
    if (verificarSeCompletou31AnosBackend(dataNascimento, dataFimPeriodo)) {
      return false;
    }
    
    // Se chegou até aqui, era Associado LEO no período
    return true;
    
  } catch (error) {
    logError('eraAssociadoLEONoPeriodo', 'Erro ao verificar se era Associado LEO', error);
    return false;
  }
}

/**
 * Calcular idade em uma data específica
 * @param {Date} dataNascimento - Data de nascimento
 * @param {Date} dataReferencia - Data de referência
 * @return {number} Idade na data de referência
 */
function calcularIdadeNaData(dataNascimento, dataReferencia) {
  let idade = dataReferencia.getFullYear() - dataNascimento.getFullYear();
  const mesReferencia = dataReferencia.getMonth();
  const mesNascimento = dataNascimento.getMonth();
  
  if (mesReferencia < mesNascimento || 
      (mesReferencia === mesNascimento && dataReferencia.getDate() < dataNascimento.getDate())) {
    idade--;
  }
  
  return idade;
}

/**
 * Anos completos na data de referência, contados a partir da data de associação informada.
 * @param {Date} dataInicioAssociacao - Início da contagem (posse como associado ou fallback definido em obterDataAssociacaoLeoParaClassificacaoMasterSenior)
 * @param {Date} dataReferencia
 * @return {number|null}
 */
function calcularAnosAssociadoLeoNaData(dataInicioAssociacao, dataReferencia) {
  if (!dataInicioAssociacao || !dataReferencia || dataInicioAssociacao > dataReferencia) {
    return null;
  }
  return calcularIdadeNaData(dataInicioAssociacao, dataReferencia);
}

/**
 * Classificação na data: Senior LEO (>10 anos), Master LEO (≥6 e ≤10 anos), demais como associado.
 * @param {number} anosCompletos
 * @return {string}
 */
function classificarMasterSeniorAssociadoNaData(anosCompletos) {
  if (anosCompletos === null || anosCompletos === undefined || anosCompletos < 0) {
    return '';
  }
  if (anosCompletos > 10) return 'Senior LEO';
  if (anosCompletos >= 6) return 'Master LEO';
  return 'Associado LEO (< 6 anos)';
}

/**
 * Obter Ano Leoístico de uma data
 * @param {Date} data - Data para calcular o AL
 * @return {number} Ano Leoístico
 */
function obterAnoLeoistico(data) {
  const ano = data.getFullYear();
  const mes = data.getMonth() + 1; // getMonth() retorna 0-11
  
  // AL vai de 01/07 a 30/06
  if (mes >= 7) {
    return ano; // Julho a dezembro pertencem ao AL do ano atual
  } else {
    return ano - 1; // Janeiro a junho pertencem ao AL do ano anterior
  }
}

/**
 * Data de associação para classificação Master/Senior: prioriza posse como associado LEO no clube,
 * depois Pré-LEO e, por último, posse no Lions (dados incompletos).
 * @param {Object} pessoa
 * @return {{ data: Date|null, campoOrigem: string, rotuloOrigem: string }}
 */
function obterDataAssociacaoLeoParaClassificacaoMasterSenior(pessoa) {
  if (!pessoa) {
    return { data: null, campoOrigem: '', rotuloOrigem: '' };
  }
  if (pessoa.associadoDesde && stringValida(pessoa.associadoDesde)) {
    const d = converterDataBRParaJS(pessoa.associadoDesde);
    if (d) {
      return {
        data: d,
        campoOrigem: 'associadoDesde',
        rotuloOrigem: 'Data de posse no clube (Associado desde)'
      };
    }
  }
  if (pessoa.dataInicioPreLeo && stringValida(pessoa.dataInicioPreLeo)) {
    const d = converterDataBRParaJS(pessoa.dataInicioPreLeo);
    if (d) {
      return {
        data: d,
        campoOrigem: 'dataInicioPreLeo',
        rotuloOrigem: 'Ingresso como Pré-LEO (sem data de posse como associado preenchida)'
      };
    }
  }
  if (pessoa.dataPosseLions && stringValida(pessoa.dataPosseLions)) {
    const d = converterDataBRParaJS(pessoa.dataPosseLions);
    if (d) {
      return {
        data: d,
        campoOrigem: 'dataPosseLions',
        rotuloOrigem: 'Data de posse no Lions (fallback)'
      };
    }
  }
  return { data: null, campoOrigem: '', rotuloOrigem: '' };
}

/**
 * Obter data de posse no clube (não no Lions)
 * @param {Object} pessoa - Dados da pessoa
 * @return {Date|null} Data de posse no clube
 */
function obterDataPosseClube(pessoa) {
  // Usar tipo original se disponível (para casos de dados históricos)
  const tipoParaVerificar = pessoa._tipoOriginal || pessoa.tipo;
  
  // Priorizar data de início como Pré LEO se for Pré LEO
  if (tipoParaVerificar === 'Pré LEO' && pessoa.dataInicioPreLeo) {
    const data = converterDataBRParaJS(pessoa.dataInicioPreLeo);
    if (data) return data;
  }
  
  // Usar data de associação para outros tipos
  if (pessoa.associadoDesde) {
    const data = converterDataBRParaJS(pessoa.associadoDesde);
    if (data) return data;
  }
  
  // Se não tem associadoDesde mas tem dataInicioPreLeo, usar essa
  if (pessoa.dataInicioPreLeo) {
    const data = converterDataBRParaJS(pessoa.dataInicioPreLeo);
    if (data) return data;
  }
  
  // Fallback: usar dataPosseLions se disponível (para pessoas que podem ter apenas essa data)
  if (pessoa.dataPosseLions) {
    const data = converterDataBRParaJS(pessoa.dataPosseLions);
    if (data) return data;
  }
  
  return null;
}

/**
 * Gerar relatório Excel do distrito - FORMATO UNIFICADO
 * @param {Object} usuario - Dados do usuário
 * @param {string} dataReferencia - Data de referência (DD/MM/AAAA)
 * @param {string} dataInicioPeriodo - Data início do período (DD/MM/AAAA)
 * @param {string} dataFimPeriodo - Data fim do período (DD/MM/AAAA)
 * @param {boolean} incluirInativos - Se deve incluir pessoas inativas
 * @param {Array} dadosFiltrados - Dados já filtrados do frontend
 * @param {string} tipoRelatorio - Tipo do relatório
 * @return {Object} Dados do relatório
 */

/**
 * Aplicar filtros históricos para uma data específica
 * @param {Array} pessoas - Array de pessoas
 * @param {string} dataReferencia - Data de referência (DD/MM/AAAA)
 * @param {boolean} incluirInativos - Se deve incluir inativos
 * @return {Array} Pessoas filtradas
 */
function aplicarFiltrosHistoricos(pessoas, dataReferencia, incluirInativos) {
  const funcao = 'aplicarFiltrosHistoricos';
  
  try {
    const dataRef = converterDataBRParaJS(dataReferencia);
    if (!dataRef) {
      logError(funcao, 'Data de referência inválida', dataReferencia);
      return [];
    }
    
    const pessoasFiltradas = [];
    
    pessoas.forEach(pessoa => {
      // Verificar se pessoa existia na data
      const tipoHistorico = obterTipoHistoricoPessoa(pessoa, dataRef);
      if (tipoHistorico) {
        // Verificar se estava ativa (se não deve incluir inativos)
        if (!incluirInativos) {
          const estavaAtiva = estaVaAtivaNaData(pessoa, dataRef);
          if (!estavaAtiva) return;
        }
        
        // Criar cópia com tipo histórico
        const pessoaHistorica = {
          ...pessoa,
          tipo: tipoHistorico,
          _tipoOriginal: pessoa.tipo,
          _isHistorica: true
        };
        
        pessoasFiltradas.push(pessoaHistorica);
      }
    });
    
    logInfo(funcao, 'Filtros históricos aplicados', {
      dataReferencia,
      totalOriginal: pessoas.length,
      totalFiltrado: pessoasFiltradas.length
    });
    
    return pessoasFiltradas;
    
  } catch (error) {
    logError(funcao, 'Erro ao aplicar filtros históricos', error.message);
    return [];
  }
}

/**
 * Aplicar filtros históricos para um período
 * @param {Array} pessoas - Array de pessoas
 * @param {string} dataInicio - Data início (DD/MM/AAAA)
 * @param {string} dataFim - Data fim (DD/MM/AAAA)
 * @param {boolean} incluirInativos - Se deve incluir inativos
 * @return {Array} Pessoas filtradas
 */
function aplicarFiltrosHistoricosPeriodo(pessoas, dataInicio, dataFim, incluirInativos) {
  const funcao = 'aplicarFiltrosHistoricosPeriodo';
  
  try {
    const dataInicioJS = converterDataBRParaJS(dataInicio);
    const dataFimJS = converterDataBRParaJS(dataFim);
    
    if (!dataInicioJS || !dataFimJS) {
      logError(funcao, 'Datas do período inválidas', { dataInicio, dataFim });
      return [];
    }
    
    // Usar a data fim como referência para determinar tipos
    return aplicarFiltrosHistoricos(pessoas, dataFim, incluirInativos);
    
  } catch (error) {
    logError(funcao, 'Erro ao aplicar filtros históricos por período', error.message);
    return [];
  }
}

/**
 * Determinar o Ano Leoístico (AL) baseado em uma data
 * @param {Date} data - Data de referência
 * @return {Object} Objeto com informações do AL
 */
function determinarAnoLeoistico(data) {
  try {
    if (!data || !(data instanceof Date)) {
      return null;
    }
    
    const ano = data.getFullYear();
    const mes = data.getMonth() + 1; // getMonth() retorna 0-11
    
    let alInicio, alFim, alNome;
    
    if (mes >= 7) {
      // Julho a Dezembro: AL atual até junho do próximo ano
      alInicio = ano;
      alFim = ano + 1;
      alNome = `${ano}-${ano + 1}`;
    } else {
      // Janeiro a Junho: AL anterior (julho do ano anterior até junho atual)
      alInicio = ano - 1;
      alFim = ano;
      alNome = `${ano - 1}-${ano}`;
    }
    
    return {
      nome: alNome,
      inicio: alInicio,
      fim: alFim,
      dataInicio: new Date(alInicio, 6, 1), // 1º de julho
      dataFim: new Date(alFim, 5, 30) // 30 de junho
    };
    
  } catch (error) {
    logError('determinarAnoLeoistico', 'Erro ao determinar AL', error.message);
    return null;
  }
}

/**
 * Verificar se uma pessoa completou 31 anos no mesmo AL
 * @param {Object} pessoa - Dados da pessoa
 * @param {Date} dataReferencia - Data de referência para determinar o AL
 * @return {boolean} true se completou 31 anos no mesmo AL
 */
function completou31AnosNoMesmoAL(pessoa, dataReferencia) {
  try {
    if (!pessoa || !dataReferencia) {
      return false;
    }
    
    // Verificar se tem data de nascimento
    if (!pessoa.dataNascimento || !stringValida(pessoa.dataNascimento)) {
      return true; // Se não tem data de nascimento, considerar válido
    }
    
    const dataNascimento = converterDataBRParaJS(pessoa.dataNascimento);
    if (!dataNascimento) {
      return true; // Se não conseguiu converter, considerar válido
    }
    
    // Calcular data de 31 anos
    const data31Anos = new Date(dataNascimento);
    data31Anos.setFullYear(dataNascimento.getFullYear() + 31);
    
    // Determinar AL da data de referência
    const alReferencia = determinarAnoLeoistico(dataReferencia);
    if (!alReferencia) {
      return false;
    }
    
    // Verificar se completou 31 anos no mesmo AL
    return data31Anos >= alReferencia.dataInicio && data31Anos <= alReferencia.dataFim;
    
  } catch (error) {
    logError('completou31AnosNoMesmoAL', 'Erro ao verificar 31 anos', error.message);
    return false;
  }
}

/**
 * Verificar se uma pessoa é Associado LEO válido para um período
 * @param {Object} pessoa - Dados da pessoa
 * @param {Date} dataCorte - Data de corte (fim do período)
 * @return {boolean} true se é Associado LEO válido
 */
function isAssociadoLEOValido(pessoa, dataCorte) {
  try {
    if (!pessoa || !dataCorte) {
      return false;
    }
    
    // 1. Verificar tipo: deve ser "Associado LEO" ou "Associado LEO e LEO/Leão"
    const tipoValido = pessoa.tipo === 'Associado LEO' || pessoa.tipo === 'Associado LEO e LEO/Leão';
    if (!tipoValido) {
      return false;
    }
    
    // 2. Verificar data de posse no clube: deve ser <= data de corte
    const dataPosseClube = obterDataPosseClube(pessoa);
    if (!dataPosseClube || dataPosseClube >= dataCorte) {
      return false;
    }
    
    // 3. Verificar se não foi desligado entre a posse e a data de corte
    if (pessoa.dataDesligamento && stringValida(pessoa.dataDesligamento)) {
      const dataDesligamento = converterDataBRParaJS(pessoa.dataDesligamento);
      if (dataDesligamento && dataDesligamento >= dataPosseClube && dataDesligamento <= dataCorte) {
        return false;
      }
    }
    
    // 4. Verificar se completou 31 anos no mesmo AL
    if (!completou31AnosNoMesmoAL(pessoa, dataCorte)) {
      return false;
    }
    
    return true;
    
  } catch (error) {
    logError('isAssociadoLEOValido', 'Erro ao verificar Associado LEO', error.message);
    return false;
  }
}

/**
 * Converter dados do relatório para formato CSV para download
 * @param {Object} dadosRelatorio - Dados do relatório
 * @return {string} Conteúdo CSV
 */
function converterRelatorioParaCSV(dadosRelatorio) {
  const funcao = 'converterRelatorioParaCSV';
  
  try {
    let csv = [];
    
    // Cabeçalho do relatório
    csv.push(`"${dadosRelatorio.titulo}"`);
    csv.push(`"Data: ${dadosRelatorio.dataGeracao} - ${dadosRelatorio.horaGeracao}"`);
    csv.push(`"Usuário: ${dadosRelatorio.usuario}"`);
    csv.push('');
    
    // Cabeçalho das colunas
    const colunas = [
      'Clube',
      'Região', 
      'Associado LEO',
      'Associado LEO e LEO/Leão',
      'Pré LEO',
      'Associado LEO/Leão',
      'Amigo LEO',
      'Amigo LEO e LEO/Leão',
      'Total'
    ];
    
    csv.push(colunas.map(col => `"${col}"`).join(','));
    
    // Dados dos clubes
    dadosRelatorio.clubes.forEach(clube => {
      const linha = [
        clube.clube,
        clube.regiao,
        clube['Associado LEO'],
        clube['Associado LEO e LEO/Leão'],
        clube['Pré LEO'],
        clube['Associado LEO/Leão'],
        clube['Amigo LEO'],
        clube['Amigo LEO e LEO/Leão'],
        clube['Total']
      ];
      
      csv.push(linha.map(valor => `"${valor}"`).join(','));
    });
    
    // Linha de totais
    csv.push('');
    const linhaTotais = [
      'TOTAL GERAL',
      '',
      dadosRelatorio.totais['Associado LEO'],
      dadosRelatorio.totais['Associado LEO e LEO/Leão'],
      dadosRelatorio.totais['Pré LEO'],
      dadosRelatorio.totais['Associado LEO/Leão'],
      dadosRelatorio.totais['Amigo LEO'],
      dadosRelatorio.totais['Amigo LEO e LEO/Leão'],
      dadosRelatorio.totais['Total']
    ];
    
    csv.push(linhaTotais.map(valor => `"${valor}"`).join(','));
    
    logInfo(funcao, 'CSV gerado com sucesso', { linhas: csv.length });
    
    return csv.join('\n');
    
  } catch (error) {
    logError(funcao, 'Erro ao converter relatório para CSV', error.message);
    return '';
  }
}

/**
 * Filtrar pessoas por data de referência
 * @param {Array} pessoas - Array de pessoas
 * @param {Date} dataLimite - Data limite para considerar pessoa ativa (null = apenas ativas atuais)
 * @return {Array} Array de pessoas filtradas
 */
function filtrarPessoasPorData(pessoas, dataLimite) {
  const funcao = 'filtrarPessoasPorData';
  
  try {
    if (!arrayValido(pessoas)) {
      return [];
    }
    
    return pessoas.filter(pessoa => {
      try {
        // Se não há data limite, filtrar apenas pessoas ativas
        if (!dataLimite) {
          return pessoa.status === 'Ativo';
        }
        
        // Com data limite, verificar se a pessoa estava ativa na data
        return estaVaAtivaNaData(pessoa, dataLimite);
        
      } catch (error) {
        logWarn(funcao, `Erro ao filtrar pessoa ${pessoa.nome || 'sem nome'}`, error.message);
        return false;
      }
    });
    
  } catch (error) {
    logError(funcao, 'Erro ao filtrar pessoas por data', error.message);
    return [];
  }
}

/**
 * Verificar se uma pessoa estava ativa em uma data específica (versão histórica)
 * Esta versão não verifica o status atual, apenas o histórico
 * @param {Object} pessoa - Dados da pessoa
 * @param {Date} dataReferencia - Data para verificar
 * @return {boolean} True se estava ativa naquela data, false caso contrário
 */
function estavAtivoNaDataHistorica(pessoa, dataReferencia) {
  try {
    // Data de início = a mais antiga entre início Pré-LEO e posse no clube (para incluir Pré LEOs que ainda não tomaram posse)
    let dataInicio = null;
    if (pessoa.dataInicioPreLeo && stringValida(pessoa.dataInicioPreLeo)) {
      dataInicio = converterDataBRParaJS(pessoa.dataInicioPreLeo);
    }
    if (pessoa.associadoDesde && stringValida(pessoa.associadoDesde)) {
      const dataPosse = converterDataBRParaJS(pessoa.associadoDesde);
      if (dataPosse && (!dataInicio || dataPosse < dataInicio)) {
        dataInicio = dataPosse;
      }
    }
    
    // Se não tem data de início, não pode determinar se estava ativa
    if (!dataInicio) {
      return false;
    }
    
    // Se começou depois da data de referência, não estava ativa ainda
    if (dataInicio > dataReferencia) {
      return false;
    }
    
    // Data de desligamento
    let dataDesligamento = null;
    if (pessoa.dataDesligamento && stringValida(pessoa.dataDesligamento)) {
      dataDesligamento = converterDataBRParaJS(pessoa.dataDesligamento);
    }
    
    // Se tem data de desligamento e foi antes ou igual à data de referência, não estava ativa
    // IMPORTANTE: Usar >= para ser consistente com o frontend (dataDesligamento >= dataRef)
    if (dataDesligamento && dataDesligamento <= dataReferencia) {
      return false;
    }
    
    // Se chegou até aqui, estava ativa na data (não verifica status atual)
    return true;
    
  } catch (error) {
    logWarn('estavAtivoNaDataHistorica', `Erro ao verificar status histórico da pessoa ${pessoa.nome || 'sem nome'}`, error.message);
    return false;
  }
}

/**
 * Verificar se uma pessoa existia (havia sido cadastrada) em uma data específica
 * @param {Object} pessoa - Dados da pessoa
 * @param {Date} dataReferencia - Data de referência
 * @return {boolean} True se já existia, false caso contrário
 */
function pessoaExistiaNaDataCompleta(pessoa, dataReferencia) {
  try {
    // Data de início (associado desde, início pré-LEO ou posse Lions) - a mais antiga
    let dataInicio = null;
    
    if (pessoa.dataInicioPreLeo && stringValida(pessoa.dataInicioPreLeo)) {
      dataInicio = converterDataBRParaJS(pessoa.dataInicioPreLeo);
    }
    
    if (pessoa.associadoDesde && stringValida(pessoa.associadoDesde)) {
      const dataAssociado = converterDataBRParaJS(pessoa.associadoDesde);
      if (!dataInicio || dataAssociado < dataInicio) {
        dataInicio = dataAssociado;
      }
    }
    
    // Considerar também data de posse Lions para pessoas "Associado LEO/Leão"
    if (pessoa.dataPosseLions && stringValida(pessoa.dataPosseLions)) {
      const dataPosseLions = converterDataBRParaJS(pessoa.dataPosseLions);
      if (dataPosseLions && (!dataInicio || dataPosseLions < dataInicio)) {
        dataInicio = dataPosseLions;
      }
    }
    
    // Se não tem nenhuma data de início, assumir que não existia
    if (!dataInicio) {
      return false;
    }
    
    // Pessoa existia se começou antes ou na data de referência
    return dataInicio <= dataReferencia;
    
  } catch (error) {
    logWarn('pessoaExistiaNaDataCompleta', `Erro ao verificar existência da pessoa ${pessoa.nome || 'sem nome'}`, error.message);
    return false;
  }
}

/**
 * Verificar se uma pessoa completou 31 anos no AL da data de referência E já passou de 01/07 do AL subsequente (Backend)
 * @param {Date} dataNascimento - Data de nascimento
 * @param {Date} dataReferencia - Data de referência
 * @return {boolean} True se completou 31 anos no AL da data de referência E já passou de 01/07 do AL subsequente
 */
function verificarSeCompletou31AnosBackend(dataNascimento, dataReferencia) {
  if (!dataNascimento) return false;
  
  try {
    // Obter AL da data de referência
    const anoLeoisticoReferencia = obterAnoLeoistico(dataReferencia);
    
    // Obter AL do nascimento
    const anoLeoisticoNascimento = obterAnoLeoistico(dataNascimento);
    
    // Calcular AL que completou 31 anos
    const anoLeoisticoCompletou31 = anoLeoisticoNascimento + 31;
    
    // Se o AL da data de referência < AL que completou 31 anos, ainda não completou
    if (anoLeoisticoReferencia < anoLeoisticoCompletou31) {
      return false;
    }
    
    // Se o AL da data de referência > AL que completou 31 anos, já completou e passou de 01/07
    if (anoLeoisticoReferencia > anoLeoisticoCompletou31) {
      return true;
    }
    
    // Se o AL da data de referência = AL que completou 31 anos, verificar se já passou de 01/07 do AL subsequente
    if (anoLeoisticoReferencia === anoLeoisticoCompletou31) {
      // Calcular data de 01/07 do AL subsequente
      const anoSubsequente = anoLeoisticoCompletou31 + 1;
      const data01JulhoSubsequente = new Date(anoSubsequente, 6, 1); // 01/07 do ano subsequente
      
      // Se já passou de 01/07 do AL subsequente, completou 31 anos
      return dataReferencia >= data01JulhoSubsequente;
    }
    
    return false;
    
  } catch (error) {
    logWarn('verificarSeCompletou31AnosBackend', 'Erro ao verificar se completou 31 anos', error.message);
    return false;
  }
}


/**
 * Determinar qual era o tipo da pessoa em uma data específica
 * @param {Object} pessoa - Dados da pessoa
 * @param {Date} dataReferencia - Data de referência
 * @param {boolean} incluirInativos - Se deve incluir pessoas que estavam inativas na data
 * @return {string|null} Tipo da pessoa naquela data ou null se não existia/não deve ser incluída
 */
function obterTipoHistoricoPessoa(pessoa, dataReferencia, incluirInativos = false) {
  try {
    // Verificar se a pessoa existia naquela data (independente de estar ativa)
    if (!pessoaExistiaNaDataCompleta(pessoa, dataReferencia)) {
      return null; // Não existia ainda
    }
    
    // Converter datas para determinar o tipo histórico
    let dataInicioPreLeo = null;
    let dataAssociadoDesde = null;
    let dataPosseLions = null;
    let dataNascimento = null;
    
    if (pessoa.dataInicioPreLeo && stringValida(pessoa.dataInicioPreLeo)) {
      dataInicioPreLeo = converterDataBRParaJS(pessoa.dataInicioPreLeo);
    }
    if (pessoa.associadoDesde && stringValida(pessoa.associadoDesde)) {
      dataAssociadoDesde = converterDataBRParaJS(pessoa.associadoDesde);
    }
    if (pessoa.dataPosseLions && stringValida(pessoa.dataPosseLions)) {
      dataPosseLions = converterDataBRParaJS(pessoa.dataPosseLions);
    }
    if (pessoa.dataNascimento && stringValida(pessoa.dataNascimento)) {
      dataNascimento = converterDataBRParaJS(pessoa.dataNascimento);
    }
    
    // Verificar se completou 31 anos no AL da data de referência
    const completou31Anos = verificarSeCompletou31AnosBackend(dataNascimento, dataReferencia);
    
    // Calcular tipo pelas datas (antes de verificar atividade)
    let tipoCalculado = null;
    
    // Primeiro: posse no Lions na data de referência
    if (dataPosseLions && dataReferencia >= dataPosseLions) {
      if (dataAssociadoDesde && dataReferencia >= dataAssociadoDesde) {
        tipoCalculado = completou31Anos ? 'Associado LEO/Leão' : 'Associado LEO e LEO/Leão';
      } else {
        tipoCalculado = 'Associado LEO/Leão';
      }
    }
    // Segundo: posse no Clube na data de referência
    else if (dataAssociadoDesde && dataReferencia >= dataAssociadoDesde) {
      tipoCalculado = completou31Anos ? 'Associado LEO/Leão' : 'Associado LEO';
    }
    // Terceiro: Pré-LEO
    else if (dataInicioPreLeo && dataReferencia >= dataInicioPreLeo) {
      if (!dataAssociadoDesde || dataReferencia < dataAssociadoDesde) {
        tipoCalculado = 'Pré LEO';
      }
    }
    
    // Pessoa não havia ingressado ainda na data de referência
    if (!tipoCalculado) return null;
    
    // "Associado LEO/Leão" sempre aparece independente de atividade:
    // essas pessoas transitaram para Lions e o check de atividade LEO não se aplica.
    // Também verifica o tipo armazenado (inclui variante 'Apenas LEO/Leão' do banco).
    const tipoStoredIsLeao = pessoa.tipo === 'Associado LEO/Leão' || pessoa.tipo === 'Apenas LEO/Leão';
    if (tipoCalculado === 'Associado LEO/Leão' || tipoStoredIsLeao) {
      return 'Associado LEO/Leão';
    }
    
    // Para os demais tipos, verificar atividade conforme flag
    if (!incluirInativos && !estavAtivoNaDataHistorica(pessoa, dataReferencia)) {
      return null;
    }
    
    return tipoCalculado;
    
  } catch (error) {
    logError('obterTipoHistoricoPessoa', `Erro ao determinar tipo histórico para ${pessoa.nome || 'sem nome'}`, error.message);
    return null;
  }
}

/**
 * Verificar se pessoa estava ativa em determinada data
 * @param {Object} pessoa - Dados da pessoa
 * @param {Date} dataReferencia - Data de referência
 * @return {boolean} True se estava ativa
 */
function estaVaAtivaNaData(pessoa, dataReferencia) {
  try {
    // Data de início = a mais antiga entre início Pré-LEO e posse no clube (para incluir Pré LEOs que ainda não tomaram posse)
    let dataInicio = null;
    if (pessoa.dataInicioPreLeo && stringValida(pessoa.dataInicioPreLeo)) {
      dataInicio = converterDataBRParaJS(pessoa.dataInicioPreLeo);
    }
    if (pessoa.associadoDesde && stringValida(pessoa.associadoDesde)) {
      const dataPosse = converterDataBRParaJS(pessoa.associadoDesde);
      if (dataPosse && (!dataInicio || dataPosse < dataInicio)) {
        dataInicio = dataPosse;
      }
    }
    
    // Se não tem data de início, não pode determinar se estava ativa
    if (!dataInicio) {
      return false;
    }
    
    // Se começou depois da data de referência, não estava ativa ainda
    if (dataInicio > dataReferencia) {
      return false;
    }
    
    // Data de desligamento
    let dataDesligamento = null;
    if (pessoa.dataDesligamento && stringValida(pessoa.dataDesligamento)) {
      dataDesligamento = converterDataBRParaJS(pessoa.dataDesligamento);
    }
    
    // Se tem data de desligamento e foi antes ou igual à data de referência, não estava ativa
    if (dataDesligamento && dataDesligamento <= dataReferencia) {
      return false;
    }
    
    // Se chegou até aqui, estava ativa na data de referência
    // (baseado apenas nas datas, não no status atual)
    return true;
    
  } catch (error) {
    logWarn('estaVaAtivaNaData', `Erro ao verificar status da pessoa ${pessoa.nome || 'sem nome'}`, error.message);
    return false;
  }
}

/**
 * Formatar data para formato brasileiro (DD/MM/AAAA)
 * @param {Date} data - Objeto Date
 * @return {string} Data formatada ou string vazia se inválida
 */
function formatarDataBR(data) {
  try {
    if (!data || !(data instanceof Date) || isNaN(data.getTime())) {
      return '';
    }
    
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const ano = data.getFullYear();
    
    return `${dia}/${mes}/${ano}`;
  } catch (error) {
    return '';
  }
}

/**
 * Formatar hora para formato brasileiro (HH:MM:SS)
 * @param {Date} data - Objeto Date
 * @return {string} Hora formatada ou string vazia se inválida
 */
function formatarHoraBR(data) {
  try {
    if (!data || !(data instanceof Date) || isNaN(data.getTime())) {
      return '';
    }
    
    const hora = String(data.getHours()).padStart(2, '0');
    const minuto = String(data.getMinutes()).padStart(2, '0');
    const segundo = String(data.getSeconds()).padStart(2, '0');
    
    return `${hora}:${minuto}:${segundo}`;
  } catch (error) {
    return '';
  }
}

/**
 * Converter data do formato brasileiro (DD/MM/AAAA) ou SQL (YYYY-MM-DD) para objeto Date
 * @param {string} dataBR - Data no formato DD/MM/AAAA ou YYYY-MM-DD
 * @return {Date|null} Objeto Date ou null se inválida
 */
function converterDataBRParaJS(dataBR) {
  try {
    if (!stringValida(dataBR)) {
      return null;
    }
    
    // Tentar formato YYYY-MM-DD (Supabase) primeiro
    if (dataBR.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const partes = dataBR.split('-');
      const ano = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1; // JavaScript usa mês base 0
      const dia = parseInt(partes[2], 10);
      
      const data = new Date(ano, mes, dia);
      
      // Validar se a data é válida
      if (data.getFullYear() !== ano || data.getMonth() !== mes || data.getDate() !== dia) {
        return null;
      }
      
      return data;
    }
    
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = dataBR.match(regex);
    
    if (!match) {
      return null;
    }
    
    const dia = parseInt(match[1], 10);
    const mes = parseInt(match[2], 10) - 1; // JavaScript usa mês base 0
    const ano = parseInt(match[3], 10);
    
    const data = new Date(ano, mes, dia);
    
    // Verificar se a data é válida (ex: 31/02 seria inválida)
    if (data.getFullYear() !== ano || data.getMonth() !== mes || data.getDate() !== dia) {
      return null;
    }
    
    return data;
    
  } catch (error) {
    logWarn('converterDataBRParaJS', `Erro ao converter data ${dataBR}`, error.message);
    return null;
  }
}

/**
 * Verificar se pessoa deve ser considerada associada baseada na regra dos 31 anos
 * @param {Object} pessoa - Dados da pessoa
 * @param {Date} dataRef - Data de referência
 * @return {boolean} true se deve ser considerada associada
 */
function deveSerConsideradaAssociadaBackend(pessoa, dataRef) {
  try {
    if (!pessoa.dataNascimento) return true; // Se não tem data de nascimento, considerar associada
    
    const dataNascimento = converterDataBRParaJS(pessoa.dataNascimento);
    if (!dataNascimento) return true; // Se não conseguiu converter, considerar associada
    
    // Se completou 31 anos no AL da data de referência, não é mais associada
    if (verificarSeCompletou31AnosBackend(dataNascimento, dataRef)) {
      return false;
    }
    
    // Se não completou 31 anos, é associada
    return true;
    
  } catch (error) {
    logError('deveSerConsideradaAssociadaBackend', 'Erro ao verificar se deve ser considerada associada', error.message);
    return true; // Em caso de erro, considerar associada
  }
}

/**
 * Calcular o início do AL subsequente baseado na data de referência
 * @param {Date} dataRef - Data de referência
 * @return {Date|null} Data de início do AL subsequente
 */
function calcularInicioALSubsequenteBackend(dataRef) {
  try {
    const ano = dataRef.getFullYear();
    const mes = dataRef.getMonth(); // 0-indexado (janeiro = 0)
    
    let anoALSubsequente;
    
    // Se estamos entre julho e dezembro, o AL subsequente é no ano seguinte
    if (mes >= 6) { // julho = 6
      anoALSubsequente = ano + 1;
    }
    // Se estamos entre janeiro e junho, o AL subsequente é no mesmo ano
    else {
      anoALSubsequente = ano;
    }
    
    // Retornar 01/07 do ano do AL subsequente
    return new Date(anoALSubsequente, 6, 1); // Mês 6 = julho (0-indexado)
    
  } catch (error) {
    logError('calcularInicioALSubsequenteBackend', 'Erro ao calcular início do AL subsequente', error.message);
    return null;
  }
}

/**
 * Função auxiliar para determinar apenas o tipo histórico de uma pessoa em uma data
 * (sem considerar status ativo/inativo)
 * @param {Object} pessoa - Dados da pessoa
 * @param {Date} dataRef - Data de referência como objeto Date
 * @return {string|null} Tipo da pessoa naquela data
 */
function determinarTipoHistoricoNaData(pessoa, dataRef) {
  try {
    
    // Converter datas da pessoa
    let dataInicioPreLeo = null;
    let dataPostseClube = null;
    let dataPosseLions = null;
    let dataNascimento = null;
    
    if (pessoa.dataInicioPreLeo && stringValida(pessoa.dataInicioPreLeo)) {
      dataInicioPreLeo = converterDataBRParaJS(pessoa.dataInicioPreLeo);
    }
    
    if (pessoa.associadoDesde && stringValida(pessoa.associadoDesde)) {
      dataPostseClube = converterDataBRParaJS(pessoa.associadoDesde);
    }
    
    if (pessoa.dataPosseLions && stringValida(pessoa.dataPosseLions)) {
      dataPosseLions = converterDataBRParaJS(pessoa.dataPosseLions);
    }
    
    if (pessoa.dataNascimento && stringValida(pessoa.dataNascimento)) {
      dataNascimento = converterDataBRParaJS(pessoa.dataNascimento);
    }
    
    // Verificar se completou 31 anos no AL da data de referência
    const completou31Anos = verificarSeCompletou31AnosBackend(dataNascimento, dataRef);
    
    // LÓGICA CORRIGIDA: Determinar tipo baseado nas regras fundamentais
    
    // Primeiro: Verificar se tinha posse no Clube na data de referência
    if (dataPostseClube && dataRef >= dataPostseClube) {
      // Tem posse no Clube
      
      // Verificar se também tinha posse no Lions na data de referência
      if (dataPosseLions && dataRef >= dataPosseLions) {
        // Tem ambas as posses (Clube e Lions)
        if (completou31Anos) {
          return 'Associado LEO/Leão';
        } else {
          return 'Associado LEO e LEO/Leão';
        }
      } else {
        // Tem apenas posse no Clube
        if (completou31Anos) {
          return 'Associado LEO/Leão';
        } else {
          return 'Associado LEO';
        }
      }
    }
    
    // Segundo: Verificar se tinha início como Pré-LEO na data de referência
    if (dataInicioPreLeo && dataRef >= dataInicioPreLeo) {
      // Se não tem associadoDesde ou se associadoDesde é posterior à data de referência
      if (!dataPostseClube || dataRef < dataPostseClube) {
        return 'Pré LEO';
      }
    }
    
    // Se chegou até aqui, pessoa não havia ingressado ainda na data de referência
    return null;
    
  } catch (error) {
    logError('determinarTipoHistoricoNaData', `Erro ao determinar tipo histórico para ${pessoa.nome || 'pessoa sem nome'}`, error.message);
    return null;
  }
}

/**
 * Determinar o status de uma pessoa em uma data específica baseado na nova lógica LEO
 * @param {Object} pessoa - Dados da pessoa
 * @param {Date|string} dataReferencia - Data de referência (Date ou string DD/MM/AAAA)
 * @param {boolean} mostrarInativos - Se deve incluir pessoas inativas
 * @return {Object|null} Objeto com status e tipo ou null se não deve aparecer
 */
function determinarStatusPessoaNaData(pessoa, dataReferencia, mostrarInativos = false) {
  const funcao = 'determinarStatusPessoaNaData';
  
  try {
    // Converter data de referência se necessário
    let dataRef = dataReferencia;
    if (typeof dataReferencia === 'string') {
      dataRef = converterDataBRParaJS(dataReferencia);
      if (!dataRef) {
        logWarn(funcao, 'Data de referência inválida', dataReferencia);
        return null;
      }
    }
    
    // NOVA LÓGICA LEO: Verificar se é Associado LEO válido
    if (isAssociadoLEOValido(pessoa, dataRef)) {
      return {
        status: 'Ativo',
        tipo: pessoa.tipo,
        observacao: 'Associado LEO válido para o período'
      };
    }
    
    // Para outros tipos (Pré LEO, Associado LEO/Leão, etc.), usar lógica anterior
    // Converter datas da pessoa
    let dataInicioPreLeo = null;
    let dataPostseClube = null;
    let dataPosseLions = null;
    let dataNascimento = null;
    let dataDesligamento = null;
    
    if (pessoa.dataInicioPreLeo && stringValida(pessoa.dataInicioPreLeo)) {
      dataInicioPreLeo = converterDataBRParaJS(pessoa.dataInicioPreLeo);
    }
    
    if (pessoa.associadoDesde && stringValida(pessoa.associadoDesde)) {
      dataPostseClube = converterDataBRParaJS(pessoa.associadoDesde);
    }
    
    if (pessoa.dataPosseLions && stringValida(pessoa.dataPosseLions)) {
      dataPosseLions = converterDataBRParaJS(pessoa.dataPosseLions);
    }
    
    if (pessoa.dataNascimento && stringValida(pessoa.dataNascimento)) {
      dataNascimento = converterDataBRParaJS(pessoa.dataNascimento);
    }
    
    if (pessoa.dataDesligamento && stringValida(pessoa.dataDesligamento)) {
      dataDesligamento = converterDataBRParaJS(pessoa.dataDesligamento);
    }
    
    // Verificar se pessoa estava desligada na data de referência
    if (dataDesligamento && dataRef >= dataDesligamento) {
      // Se estava desligada e não deve mostrar inativos, não incluir
      if (!mostrarInativos) {
        return null;
      }
      // Se deve mostrar inativos, determinar qual era o tipo histórico ANTES do desligamento
      // Usar a data anterior ao desligamento para determinar o tipo correto
      const dataAnteriorDesligamento = new Date(dataDesligamento);
      dataAnteriorDesligamento.setDate(dataAnteriorDesligamento.getDate() - 1);
      
      // Determinar tipo histórico na data anterior ao desligamento
      const tipoHistoricoAntes = determinarTipoHistoricoNaData(pessoa, dataAnteriorDesligamento);
      
      return {
        status: 'Inativa',
        tipo: tipoHistoricoAntes || pessoa.tipo || 'N/A',
        dataDesligamento: pessoa.dataDesligamento,
        observacao: 'Pessoa desligada - mostrando tipo anterior ao desligamento'
      };
    }
    
    // Calcular idade na data de referência (para regra dos 31 anos)
    let idadeNaData = null;
    if (dataNascimento) {
      const diffTime = dataRef - dataNascimento;
      idadeNaData = Math.floor(diffTime / (365.25 * 24 * 60 * 60 * 1000));
    }
    
    // Usar função auxiliar para determinar tipo histórico
    const tipoHistorico = determinarTipoHistoricoNaData(pessoa, dataRef);
    
    if (tipoHistorico) {
      return {
        status: 'Ativa',
        tipo: tipoHistorico
      };
    }
    
    // Se chegou até aqui, pessoa ainda não havia ingressado na data de referência
    return null;
    
  } catch (error) {
    logError(funcao, `Erro ao determinar status para ${pessoa.nome || 'pessoa sem nome'}`, error.message);
    return null;
  }
}

/**
 * Filtrar pessoas por data de referência com nova lógica de status
 * @param {Array} pessoas - Array de pessoas
 * @param {Date|string} dataReferencia - Data de referência
 * @param {boolean} mostrarInativos - Se deve incluir pessoas inativas
 * @return {Array} Array de pessoas filtradas com status correto
 */
function filtrarPessoasPorDataComNovaLogica(pessoas, dataReferencia, mostrarInativos = false) {
  const funcao = 'filtrarPessoasPorDataComNovaLogica';
  
  try {
    if (!arrayValido(pessoas)) {
      return [];
    }
    
    const pessoasFiltradas = [];
    
    pessoas.forEach(pessoa => {
      const statusNaData = determinarStatusPessoaNaData(pessoa, dataReferencia, mostrarInativos);
      
      if (statusNaData) {
        // Criar uma cópia da pessoa com o status correto para a data
        const pessoaComStatusHistorico = {
          ...pessoa,
          status: statusNaData.status,
          tipo: statusNaData.tipo,
          _statusOriginal: pessoa.status,
          _tipoOriginal: pessoa.tipo,
          _dataReferencia: dataReferencia,
          _observacao: statusNaData.observacao
        };
        
        pessoasFiltradas.push(pessoaComStatusHistorico);
      }
    });
    
    logInfo(funcao, 'Filtragem com nova lógica aplicada', {
      dataReferencia: typeof dataReferencia === 'string' ? dataReferencia : dataReferencia.toLocaleDateString('pt-BR'),
      totalOriginal: pessoas.length,
      totalFiltrado: pessoasFiltradas.length,
      mostrarInativos
    });
    
    return pessoasFiltradas;
    
  } catch (error) {
    logError(funcao, 'Erro ao filtrar pessoas por data', error.message);
    return [];
  }
}

/**
 * Buscar pessoas com filtro por data de referência (nova função principal)
 * @param {string} clube - Nome do clube
 * @param {string} dataReferencia - Data de referência (DD/MM/AAAA) - opcional
 * @param {boolean} mostrarInativos - Se deve incluir pessoas inativas
 * @param {string} tipo - Filtro por tipo (opcional)
 * @param {string} formacao - Filtro por formação (opcional)
 * @param {string} profissao - Filtro por profissão (opcional)
 * @return {Array} Array de pessoas filtradas
 */
function buscarPessoasComFiltroData(clube, dataReferencia = null, mostrarInativos = false, tipo = null, formacao = null, profissao = null) {
  const funcao = 'buscarPessoasComFiltroData';
  
  try {
    logInfo(funcao, 'Iniciando busca com filtro de data', { 
      clube, dataReferencia, mostrarInativos, tipo, formacao, profissao 
    });
    
    // Validar parâmetros
    if (!stringValida(clube)) {
      logError(funcao, 'Clube não informado');
      return [];
    }
    
    if (!rtmaClubeExiste(clube)) {
      logError(funcao, 'Clube não mapeado', { clube });
      return [];
    }
    
    // Buscar todas as pessoas do clube (sem filtros de data ainda)
    let pessoas = buscarPessoasRTMA(clube);
    
    if (!arrayValido(pessoas)) {
      logInfo(funcao, 'Nenhuma pessoa encontrada para o clube', { clube });
      return [];
    }
    
    // Se há data de referência, aplicar nova lógica de filtragem
    if (dataReferencia && stringValida(dataReferencia)) {
      pessoas = filtrarPessoasPorDataComNovaLogica(pessoas, dataReferencia, mostrarInativos);
    } else {
      // Se não há data de referência, usar lógica atual (apenas filtrar inativos se necessário)
      if (!mostrarInativos) {
        pessoas = pessoas.filter(pessoa => pessoa.status === 'Ativo');
      }
    }
    
    // Aplicar filtros adicionais (tipo, formação, profissão)
    pessoas = aplicarFiltrosPessoas(pessoas, tipo, formacao, profissao);
    
    logInfo(funcao, 'Busca concluída', {
      clube,
      dataReferencia,
      totalEncontrado: pessoas.length
    });
    
    return pessoas;
    
  } catch (error) {
    logError(funcao, 'Erro na busca com filtro de data', error.message);
    return [];
  }
}

/**
 * Buscar pessoas com filtro por período completo
 * @param {string} clube - Nome do clube
 * @param {string} dataInicioPeriodo - Data de início do período (DD/MM/AAAA)
 * @param {string} dataFimPeriodo - Data de fim do período (DD/MM/AAAA)
 * @param {boolean} mostrarInativos - Se deve incluir pessoas inativas
 * @param {string} tipo - Filtro por tipo (opcional)
 * @param {string} formacao - Filtro por formação (opcional)
 * @param {string} profissao - Filtro por profissão (opcional)
 * @return {Array} Array de pessoas filtradas
 */
function buscarPessoasComFiltroPeriodo(clube, dataInicioPeriodo, dataFimPeriodo, mostrarInativos = false, tipo = null, formacao = null, profissao = null) {
  const funcao = 'buscarPessoasComFiltroPeriodo';
  
  try {
    logInfo(funcao, 'Iniciando busca com filtro de período', { 
      clube, dataInicioPeriodo, dataFimPeriodo, mostrarInativos, tipo, formacao, profissao 
    });
    
    // Validar parâmetros
    if (!stringValida(clube)) {
      logError(funcao, 'Clube não informado');
      return [];
    }
    
    if (!rtmaClubeExiste(clube)) {
      logError(funcao, 'Clube não mapeado', { clube });
      return [];
    }
    
    // Validar datas do período
    if (!stringValida(dataInicioPeriodo) || !stringValida(dataFimPeriodo)) {
      logError(funcao, 'Datas do período inválidas', { dataInicioPeriodo, dataFimPeriodo });
      return [];
    }
    
    // Buscar todas as pessoas do clube (sem filtros de data ainda)
    let pessoas = buscarPessoasRTMA(clube);
    
    if (!arrayValido(pessoas)) {
      logInfo(funcao, 'Nenhuma pessoa encontrada para o clube', { clube });
      return [];
    }
    
    // Aplicar filtros históricos do período
    pessoas = aplicarFiltrosHistoricosPeriodo(pessoas, dataInicioPeriodo, dataFimPeriodo, mostrarInativos);
    
    // Aplicar filtros adicionais (tipo, formação, profissão)
    pessoas = aplicarFiltrosPessoas(pessoas, tipo, formacao, profissao);
    
    logInfo(funcao, 'Busca com período concluída', {
      clube,
      dataInicioPeriodo,
      dataFimPeriodo,
      totalEncontrado: pessoas.length
    });
    
    return pessoas;
    
  } catch (error) {
    logError(funcao, 'Erro na busca com filtro de período', error.message);
    return [];
  }
}

/**
 * Função de teste para validar a nova lógica de filtragem com exemplos práticos
 * @return {Object} Resultado dos testes
 */
function testarNovaLogicaFiltragem() {
  const funcao = 'testarNovaLogicaFiltragem';
  
  try {
    logInfo(funcao, 'Iniciando teste da nova lógica de filtragem');
    
    // Criar pessoa de exemplo baseada no caso fornecido
    const pessoaExemplo = {
      id: 'teste_001',
      nome: 'João Exemplo',
      status: 'Ativo',
      tipo: 'Associado LEO e LEO/Leão', // Tipo atual
      dataInicioPreLeo: '01/01/2025',    // Início como Pré-LEO
      associadoDesde: '01/03/2025',       // Posse no Clube
      dataPosseLions: '01/05/2025',       // Posse no Lions
      dataDesligamento: '01/09/2025',     // Desligamento
      dataNascimento: '15/06/1995',       // Nascimento (para ter ~30 anos em 2025)
      clube: 'Ômega Teste'
    };
    
    const resultadosTeste = {
      pessoaExemplo: pessoaExemplo,
      testes: [],
      resumo: {
        totalTestes: 0,
        sucessos: 0,
        falhas: 0
      }
    };
    
    // Teste 1: 01/01/2025 → deve aparecer como Pré-LEO
    const teste1 = {
      data: '01/01/2025',
      esperado: { status: 'Ativa', tipo: 'Pré LEO' },
      resultado: determinarStatusPessoaNaData(pessoaExemplo, '01/01/2025', false)
    };
    teste1.sucesso = teste1.resultado && 
                     teste1.resultado.status === teste1.esperado.status && 
                     teste1.resultado.tipo === teste1.esperado.tipo;
    resultadosTeste.testes.push(teste1);
    
    // Teste 2: 01/04/2025 → deve aparecer como Associado LEO
    const teste2 = {
      data: '01/04/2025',
      esperado: { status: 'Ativa', tipo: 'Associado LEO' },
      resultado: determinarStatusPessoaNaData(pessoaExemplo, '01/04/2025', false)
    };
    teste2.sucesso = teste2.resultado && 
                     teste2.resultado.status === teste2.esperado.status && 
                     teste2.resultado.tipo === teste2.esperado.tipo;
    resultadosTeste.testes.push(teste2);
    
    // Teste 3: 01/06/2025 → deve aparecer como Associado LEO + LEO Leão
    const teste3 = {
      data: '01/06/2025',
      esperado: { status: 'Ativa', tipo: 'Associado LEO e LEO/Leão' },
      resultado: determinarStatusPessoaNaData(pessoaExemplo, '01/06/2025', false)
    };
    teste3.sucesso = teste3.resultado && 
                     teste3.resultado.status === teste3.esperado.status && 
                     teste3.resultado.tipo === teste3.esperado.tipo;
    resultadosTeste.testes.push(teste3);
    
    // Teste 4a: 01/10/2025 → não deve aparecer (já desligado), a menos que mostrar inativos esteja marcado
    const teste4a = {
      data: '01/10/2025',
      mostrarInativos: false,
      esperado: null,
      resultado: determinarStatusPessoaNaData(pessoaExemplo, '01/10/2025', false)
    };
    teste4a.sucesso = teste4a.resultado === null;
    teste4a.descricao = 'Pessoa desligada sem mostrar inativos';
    resultadosTeste.testes.push(teste4a);
    
    // Teste 4b: 01/10/2025 com mostrar inativos → deve aparecer como Inativa com tipo histórico
    const teste4b = {
      data: '01/10/2025',
      mostrarInativos: true,
      esperado: { status: 'Inativa', tipo: 'Associado LEO e LEO/Leão' },
      resultado: determinarStatusPessoaNaData(pessoaExemplo, '01/10/2025', true)
    };
    teste4b.sucesso = teste4b.resultado && 
                     teste4b.resultado.status === 'Inativa' &&
                     teste4b.resultado.tipo === 'Associado LEO e LEO/Leão';
    teste4b.descricao = 'Pessoa desligada com mostrar inativos - deve mostrar tipo histórico';
    resultadosTeste.testes.push(teste4b);
    
    // Teste 4c: 01/08/2025 (antes do desligamento) → deve aparecer normalmente
    const teste4c = {
      data: '01/08/2025',
      mostrarInativos: false,
      esperado: { status: 'Ativa', tipo: 'Associado LEO e LEO/Leão' },
      resultado: determinarStatusPessoaNaData(pessoaExemplo, '01/08/2025', false)
    };
    teste4c.sucesso = teste4c.resultado && 
                     teste4c.resultado.status === 'Ativa' &&
                     teste4c.resultado.tipo === 'Associado LEO e LEO/Leão';
    teste4c.descricao = 'Data anterior ao desligamento - deve aparecer como ativa';
    resultadosTeste.testes.push(teste4c);
    
    // Teste 5: Pessoa com 31+ anos deve ser "Associado LEO/Leão"
    const pessoaIdosa = {
      ...pessoaExemplo,
      nome: 'Maria Exemplo Senior',
      dataNascimento: '15/06/1990', // Nasceu em 1990, terá 35 anos em 2025
      dataDesligamento: null // Sem desligamento
    };
    
    const teste5 = {
      data: '01/06/2025',
      pessoa: 'Maria (31+ anos)',
      esperado: { status: 'Ativa', tipo: 'Associado LEO/Leão' },
      resultado: determinarStatusPessoaNaData(pessoaIdosa, '01/06/2025', false)
    };
    teste5.sucesso = teste5.resultado && 
                     teste5.resultado.status === teste5.esperado.status && 
                     teste5.resultado.tipo === teste5.esperado.tipo;
    resultadosTeste.testes.push(teste5);
    
    // Teste 6: Pessoa Pré-LEO com "Mostrar Inativos" marcado deve aparecer
    const pessoaPreLeo = {
      id: 'teste_pre_leo',
      nome: 'Carlos Pré-LEO',
      status: 'Ativo',
      tipo: 'Pré LEO',
      dataInicioPreLeo: '15/12/2024',
      associadoDesde: null, // Ainda não tem posse no clube
      dataPosseLions: null,
      dataDesligamento: null,
      dataNascimento: '10/05/2000',
      clube: 'Ômega Teste'
    };
    
    const teste6 = {
      data: '01/01/2025',
      pessoa: 'Carlos (Pré-LEO)',
      mostrarInativos: true,
      esperado: { status: 'Ativa', tipo: 'Pré LEO' },
      resultado: determinarStatusPessoaNaData(pessoaPreLeo, '01/01/2025', true)
    };
    teste6.sucesso = teste6.resultado && 
                     teste6.resultado.status === teste6.esperado.status && 
                     teste6.resultado.tipo === teste6.esperado.tipo;
    teste6.descricao = 'Pré-LEO com mostrar inativos deve aparecer normalmente';
    resultadosTeste.testes.push(teste6);
    
    // Calcular resumo
    resultadosTeste.resumo.totalTestes = resultadosTeste.testes.length;
    resultadosTeste.resumo.sucessos = resultadosTeste.testes.filter(t => t.sucesso).length;
    resultadosTeste.resumo.falhas = resultadosTeste.resumo.totalTestes - resultadosTeste.resumo.sucessos;
    resultadosTeste.resumo.percentualSucesso = ((resultadosTeste.resumo.sucessos / resultadosTeste.resumo.totalTestes) * 100).toFixed(1);
    
    // Log dos resultados
    logInfo(funcao, 'Teste da nova lógica concluído', resultadosTeste.resumo);
    
    resultadosTeste.testes.forEach((teste, index) => {
      const status = teste.sucesso ? '✅ PASSOU' : '❌ FALHOU';
      const descricao = teste.descricao || `Teste ${index + 1} - ${teste.data}`;
      logInfo(funcao, `${status}: ${descricao}`, {
        esperado: teste.esperado,
        resultado: teste.resultado
      });
    });
    
    return respostaSucesso(resultadosTeste, 'Testes executados com sucesso');
    
  } catch (error) {
    return tratarExcecao(error, funcao);
  }
}

/**
 * Buscar pessoas do distrito com nova lógica de filtragem por data
 * @param {Object} filtros - Filtros incluindo dataReferencia e mostrarInativos
 * @return {Array} Array de pessoas de múltiplos clubes
 */
function buscarPessoasDistritoComFiltroData(filtros) {
  const funcao = 'buscarPessoasDistritoComFiltroData';
  
  try {
    logInfo(funcao, 'Iniciando busca do distrito com filtro de data', filtros);
    
    const { clube, tipo, formacao, profissao, usuario, regiao, dataReferencia, dataInicioPeriodo, dataFimPeriodo, mostrarInativos } = filtros;
    
    // Determinar clubes a buscar
    const clubesParaBuscar = determinarClubesParaBuscar(usuario, clube, regiao);
    
    if (!arrayValido(clubesParaBuscar)) {
      logWarn(funcao, 'Nenhum clube para buscar');
      return [];
    }
    
    logInfo(funcao, 'Clubes a processar', { total: clubesParaBuscar.length });
    
    let todasPessoas = [];
    
    // Se usar Supabase e há múltiplos clubes, buscar todos de uma vez (mais eficiente)
    if (typeof RTMA_USAR_SUPABASE !== 'undefined' && RTMA_USAR_SUPABASE === true && clubesParaBuscar.length > 1) {
      try {
        // Buscar todas as pessoas dos clubes de uma vez
        const pessoasBatch = buscarPessoasMultiplosClubesDoSupabase(clubesParaBuscar);
        
        if (arrayValido(pessoasBatch)) {
          // Aplicar filtro de período ou data se necessário
          if (dataInicioPeriodo && dataFimPeriodo && stringValida(dataInicioPeriodo) && stringValida(dataFimPeriodo)) {
            // Usar lógica de período completo
            todasPessoas = aplicarFiltrosHistoricosPeriodo(pessoasBatch, dataInicioPeriodo, dataFimPeriodo, mostrarInativos);
            logInfo(funcao, 'Filtro de período aplicado', { dataInicioPeriodo, dataFimPeriodo, total: todasPessoas.length });
          } else if (dataReferencia && stringValida(dataReferencia)) {
            // Usar lógica de data única
            todasPessoas = filtrarPessoasPorDataComNovaLogica(pessoasBatch, dataReferencia, mostrarInativos);
          } else {
            // Se não há data de referência, usar lógica atual (apenas filtrar inativos se necessário)
            todasPessoas = pessoasBatch;
            if (!mostrarInativos) {
              todasPessoas = todasPessoas.filter(pessoa => pessoa.status === 'Ativo');
            }
          }
          
          // Aplicar filtros adicionais (tipo, formação, profissão)
          todasPessoas = aplicarFiltrosPessoas(todasPessoas, tipo, formacao, profissao);
        }
      } catch (error) {
        logWarn(funcao, `Erro ao processar lote de clubes, tentando individualmente`, error.message);
        // Fallback: processar individualmente
        clubesParaBuscar.forEach(nomeClube => {
          try {
            // Se há período completo, usar função que aceita período
            let pessoas = [];
            if (dataInicioPeriodo && dataFimPeriodo && stringValida(dataInicioPeriodo) && stringValida(dataFimPeriodo)) {
              pessoas = buscarPessoasComFiltroPeriodo(
                nomeClube,
                dataInicioPeriodo,
                dataFimPeriodo,
                mostrarInativos,
                tipo,
                formacao,
                profissao
              );
            } else {
              pessoas = buscarPessoasComFiltroData(
                nomeClube, 
                dataReferencia, 
                mostrarInativos, 
                tipo, 
                formacao, 
                profissao
              );
            }
            
            if (arrayValido(pessoas)) {
              const pessoasComClube = pessoas.map(p => ({ ...p, clube: nomeClube }));
              todasPessoas = todasPessoas.concat(pessoasComClube);
            }
          } catch (error) {
            logWarn(funcao, `Erro ao processar clube ${nomeClube}`, error.message);
          }
        });
      }
    } else {
      // Processar clubes em lotes para performance (planilhas ou Supabase com 1 clube)
      const batchSize = 5;
      for (let i = 0; i < clubesParaBuscar.length; i += batchSize) {
        const batch = clubesParaBuscar.slice(i, i + batchSize);
        
        batch.forEach(nomeClube => {
          try {
            // Se há período completo, usar função que aceita período
            let pessoas = [];
            if (dataInicioPeriodo && dataFimPeriodo && stringValida(dataInicioPeriodo) && stringValida(dataFimPeriodo)) {
              pessoas = buscarPessoasComFiltroPeriodo(
                nomeClube,
                dataInicioPeriodo,
                dataFimPeriodo,
                mostrarInativos,
                tipo,
                formacao,
                profissao
              );
            } else {
              pessoas = buscarPessoasComFiltroData(
                nomeClube, 
                dataReferencia, 
                mostrarInativos, 
                tipo, 
                formacao, 
                profissao
              );
            }
            
            if (arrayValido(pessoas)) {
              const pessoasComClube = pessoas.map(p => ({ ...p, clube: nomeClube }));
              todasPessoas = todasPessoas.concat(pessoasComClube);
            }
          } catch (error) {
            logWarn(funcao, `Erro ao processar clube ${nomeClube}`, error.message);
          }
        });
      }
    }
    
    logInfo(funcao, 'Busca do distrito com filtro de data concluída', { 
      clubesProcessados: clubesParaBuscar.length,
      totalPessoas: todasPessoas.length,
      dataReferencia: dataReferencia,
      mostrarInativos: mostrarInativos
    });
    
    return todasPessoas;
    
  } catch (error) {
    logError(funcao, 'Erro na busca do distrito com filtro de data', error.message);
    return [];
  }
}

/**
 * Gerar dados do relatório em formato para tabela HTML - FORMATO UNIFICADO
 * @param {Object} dadosRelatorio - Dados do relatório
 * @return {Object} Dados formatados para HTML
 */
function formatarRelatorioParaHTML(dadosRelatorio) {
  const funcao = 'formatarRelatorioParaHTML';
  
  try {
    let subtitulo;
    if (dadosRelatorio.dataReferencia) {
      subtitulo = `Situação em ${dadosRelatorio.dataReferencia} - Gerado em ${dadosRelatorio.dataGeracao} às ${dadosRelatorio.horaGeracao}`;
    } else if (dadosRelatorio.dataInicioPeriodo && dadosRelatorio.dataFimPeriodo) {
      subtitulo = `Período de ${dadosRelatorio.dataInicioPeriodo} a ${dadosRelatorio.dataFimPeriodo} - Gerado em ${dadosRelatorio.dataGeracao} às ${dadosRelatorio.horaGeracao}`;
    } else {
      subtitulo = `Pessoas Ativas - Gerado em ${dadosRelatorio.dataGeracao} às ${dadosRelatorio.horaGeracao}`;
    }
    
    // Se temos pessoas individuais, criar tabela detalhada
    if (dadosRelatorio.pessoas && dadosRelatorio.pessoas.length > 0) {
      const htmlData = {
        titulo: dadosRelatorio.titulo,
        subtitulo: subtitulo,
        colunas: [
          'Clube',
          'Região', 
          'Nome',
          'Tipo',
          'Status',
          'N° de Associado',
          'Data de Nascimento',
          'Formação',
          'Profissão',
          'Telefone',
          'Email'
        ],
        linhas: dadosRelatorio.pessoas.map(pessoa => [
          pessoa.clube || 'N/A',
          pessoa.regiao || 'N/A',
          pessoa.nome || 'N/A',
          pessoa.tipo || 'N/A',
          pessoa.status || 'N/A',
          pessoa.numeroAssociado || 'N/A',
          pessoa.dataNascimento || 'N/A',
          pessoa.formacao || 'N/A',
          pessoa.profissao || 'N/A',
          pessoa.telefone || 'N/A',
          pessoa.email || 'N/A'
        ]),
        totais: [
          'TOTAL GERAL',
          '',
          `${dadosRelatorio.pessoas.length} pessoas`,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          ''
        ],
        resumo: {
          totalClubes: [...new Set(dadosRelatorio.pessoas.map(p => p.clube))].length,
          totalPessoas: dadosRelatorio.pessoas.length,
          totalRegioes: [...new Set(dadosRelatorio.pessoas.map(p => p.regiao))].length
        }
      };
      
      logInfo(funcao, 'Dados formatados para HTML detalhado com sucesso');
      return respostaSucesso(htmlData);
    }
    
    // Fallback para formato antigo (se ainda houver clubes)
    if (dadosRelatorio.clubes && dadosRelatorio.clubes.length > 0) {
      const htmlData = {
        titulo: dadosRelatorio.titulo,
        subtitulo: subtitulo,
        colunas: [
          'Clube',
          'Região',
          'Associado LEO',
          'Associado LEO e LEO/Leão',
          'Pré LEO',
          'Associado LEO/Leão',
          'Total'
        ],
        linhas: dadosRelatorio.clubes.map(clube => [
          clube.clube,
          clube.regiao,
          clube['Associado LEO'],
          clube['Associado LEO e LEO/Leão'],
          clube['Pré LEO'],
          clube['Associado LEO/Leão'],
          clube['Total']
        ]),
        totais: [
          'TOTAL GERAL',
          '',
          dadosRelatorio.totais['Associado LEO'],
          dadosRelatorio.totais['Associado LEO e LEO/Leão'],
          dadosRelatorio.totais['Pré LEO'],
          dadosRelatorio.totais['Associado LEO/Leão'],
          dadosRelatorio.totais['Total']
        ],
        resumo: {
          totalClubes: dadosRelatorio.clubes.length,
          totalPessoas: dadosRelatorio.totais['Total']
        }
      };
      
      logInfo(funcao, 'Dados formatados para HTML resumido com sucesso');
      return respostaSucesso(htmlData);
    }
    
    // Se não há dados
    return respostaErro('Nenhum dado encontrado para formatar');
    
  } catch (error) {
    return tratarExcecao(error, funcao);
  }
}

/**
 * Gerar Excel DM com dados específicos para DM
 * @param {Object} usuario - Dados do usuário logado
 * @param {string} dataInicioPeriodo - Data de início do período (DD/MM/AAAA)
 * @param {string} dataFimPeriodo - Data de fim do período (DD/MM/AAAA)
 * @return {Object} Resultado da operação
 */
function gerarExcelDM(usuario, dataInicioPeriodo, dataFimPeriodo) {
  const funcao = 'gerarExcelDM';
  
  try {
    logInfo(funcao, 'Iniciando geração de Excel DM', {
      usuario: usuario.email,
      dataInicioPeriodo,
      dataFimPeriodo
    });
    
    // Validar datas
    const dataInicioObj = converterDataBRParaJS(dataInicioPeriodo);
    const dataFimObj = converterDataBRParaJS(dataFimPeriodo);
    
    if (!dataInicioObj || !dataFimObj) {
      return respostaErro('Datas inválidas para o período');
    }
    
    if (dataInicioObj > dataFimObj) {
      return respostaErro('A data de início deve ser anterior ou igual à data de fim do período');
    }
    
    // Gerar dados do relatório DM usando a mesma lógica do dashboard
    const dadosRelatorio = calcularResumoDMComFiltrosDashboard(dataInicioPeriodo, dataFimPeriodo);
    
    console.log(`[${funcao}] Dados do relatório recebidos:`, {
      temDadosRelatorio: !!dadosRelatorio,
      temDadosPorClube: !!dadosRelatorio?.dadosPorClube,
      totalClubes: dadosRelatorio?.dadosPorClube?.length || 0,
      totalGeral: dadosRelatorio?.totalGeral
    });
    
    if (!dadosRelatorio || !dadosRelatorio.dadosPorClube) {
      logError(funcao, 'Erro ao calcular dados do relatório DM - dadosRelatorio inválido', {
        dadosRelatorio: dadosRelatorio
      });
      return respostaErro('Erro ao calcular dados do relatório DM. Verifique os logs para mais detalhes.');
    }
    
    // Validar estrutura dos dados
    if (!Array.isArray(dadosRelatorio.dadosPorClube)) {
      logError(funcao, 'dadosPorClube não é um array', {
        tipo: typeof dadosRelatorio.dadosPorClube
      });
      return respostaErro('Erro na estrutura dos dados do relatório DM');
    }
    
    // Se não há clubes, retornar erro explicativo com debug
    if (dadosRelatorio.dadosPorClube.length === 0) {
      const debugInfo = {
        temDadosRelatorio: !!dadosRelatorio,
        temDadosPorClube: !!dadosRelatorio.dadosPorClube,
        totalClubes: dadosRelatorio.dadosPorClube ? dadosRelatorio.dadosPorClube.length : 0,
        temTotalGeral: !!dadosRelatorio.totalGeral,
        periodo: dadosRelatorio.periodo
      };
      logError(funcao, 'Nenhum clube encontrado no relatório DM', debugInfo);
      return respostaErro(`Nenhum clube encontrado para processar. Debug: ${JSON.stringify(debugInfo)}`);
    }
    
    // Adicionar informações adicionais
    const agora = new Date();
    dadosRelatorio.dataGeracao = formatarDataBR(agora);
    dadosRelatorio.horaGeracao = formatarHoraBR(agora);
    dadosRelatorio.dataInicioPeriodo = dataInicioPeriodo;
    dadosRelatorio.dataFimPeriodo = dataFimPeriodo;
    dadosRelatorio.titulo = `Relatório DM - Período ${dataInicioPeriodo} a ${dataFimPeriodo}`;
    dadosRelatorio.tipoRelatorio = 'excel_dm';
    dadosRelatorio.usuario = usuario.email;
    
    // Garantir que totalGeral existe e tem valores numéricos
    if (!dadosRelatorio.totalGeral) {
      dadosRelatorio.totalGeral = {
        totalInicio: 0,
        inclusoes: 0,
        exclusoes: 0,
        totalFim: 0
      };
    }
    
    // Validar e corrigir valores numéricos
    dadosRelatorio.totalGeral.totalInicio = Number(dadosRelatorio.totalGeral.totalInicio) || 0;
    dadosRelatorio.totalGeral.inclusoes = Number(dadosRelatorio.totalGeral.inclusoes) || 0;
    dadosRelatorio.totalGeral.exclusoes = Number(dadosRelatorio.totalGeral.exclusoes) || 0;
    dadosRelatorio.totalGeral.totalFim = Number(dadosRelatorio.totalGeral.totalFim) || 0;
    
    // Validar e corrigir dados por clube
    dadosRelatorio.dadosPorClube = dadosRelatorio.dadosPorClube.map(clube => {
      return {
        clube: clube.clube || 'N/A',
        regiao: clube.regiao || 'N/A',
        totalInicio: Number(clube.totalInicio) || 0,
        inclusoes: Number(clube.inclusoes) || 0,
        exclusoes: Number(clube.exclusoes) || 0,
        totalFim: Number(clube.totalFim) || 0
      };
    });
    
    // Garantir ordenação alfabética após validação
    dadosRelatorio.dadosPorClube.sort((a, b) => {
      const nomeA = (a.clube || '').toLowerCase().trim();
      const nomeB = (b.clube || '').toLowerCase().trim();
      return nomeA.localeCompare(nomeB, 'pt-BR', { 
        sensitivity: 'base',
        ignorePunctuation: true,
        numeric: true
      });
    });

    // Montar mapa de resumo por clube (para uso no Excel)
    const resumoPorClube = {};
    dadosRelatorio.dadosPorClube.forEach(clube => {
      if (!clube || !clube.clube) return;
      resumoPorClube[clube.clube] = {
        clube: clube.clube,
        regiao: clube.regiao || 'N/A',
        totalInicio: Number(clube.totalInicio) || 0,
        inclusoes: Number(clube.inclusoes) || 0,
        exclusoes: Number(clube.exclusoes) || 0,
        totalFim: Number(clube.totalFim) || 0
      };
    });

    // Buscar pessoas e organizar por clube, respeitando o status do período
    dataFimObj.setHours(23, 59, 59, 999);

    const clubesParaBuscar = dadosRelatorio.dadosPorClube.map(item => item.clube).filter(Boolean);
    let pessoasRaw = [];

    if (clubesParaBuscar.length > 1 && typeof buscarPessoasMultiplosClubesDoSupabase === 'function') {
      try {
        pessoasRaw = buscarPessoasMultiplosClubesDoSupabase(clubesParaBuscar);
      } catch (erroBatch) {
        logWarn(funcao, 'Erro ao buscar pessoas em batch, tentando individualmente', erroBatch);
        clubesParaBuscar.forEach(clube => {
          try {
            const pessoasClube = buscarPessoasRTMA(clube);
            if (Array.isArray(pessoasClube) && pessoasClube.length > 0) {
              pessoasRaw.push(...pessoasClube.map(p => ({ ...p, clube })));
            }
          } catch (erroClube) {
            logWarn(funcao, `Erro ao buscar pessoas do clube ${clube}`, erroClube);
          }
        });
      }
    } else {
      clubesParaBuscar.forEach(clube => {
        try {
          const pessoasClube = buscarPessoasRTMA(clube);
          if (Array.isArray(pessoasClube) && pessoasClube.length > 0) {
            pessoasRaw.push(...pessoasClube.map(p => ({ ...p, clube })));
          }
        } catch (erroClube) {
          logWarn(funcao, `Erro ao buscar pessoas do clube ${clube}`, erroClube);
        }
      });
    }

    const pessoasPorClube = {};
    clubesParaBuscar.forEach(clube => {
      pessoasPorClube[clube] = [];
    });

    pessoasRaw.forEach(pessoa => {
      const clubeNome = pessoa.clube || pessoa.clube_nome || '';
      if (!clubeNome) return;

      const dataPosseClube = obterDataPosseClube(pessoa);
      const dataDesligamento = pessoa.dataDesligamento && stringValida(pessoa.dataDesligamento)
        ? converterDataBRParaJS(pessoa.dataDesligamento)
        : null;

      // Se tem data de posse e ela é após o período, não existia ainda
      if (dataPosseClube && dataPosseClube > dataFimObj) {
        return;
      }

      // Se foi desligado antes do período, não existia no período
      if (dataDesligamento && dataDesligamento < dataInicioObj) {
        return;
      }

      let statusPeriodo = 'Ativo';
      if (dataDesligamento && dataDesligamento <= dataFimObj) {
        statusPeriodo = 'Inativo';
        if (dataDesligamento >= dataInicioObj && dataDesligamento <= dataFimObj) {
          statusPeriodo = 'Desligado no período';
        }
      }

      const tipoHistoricoFim = obterTipoHistoricoPessoa(pessoa, dataFimObj, true);
      const tipoPeriodo = tipoHistoricoFim || pessoa.tipo || 'N/A';

      const pessoaDetalhada = {
        regiao: rtmaObterRegiaoDoClube(clubeNome) || 'N/A',
        clube: clubeNome,
        status: statusPeriodo,
        tipo: tipoPeriodo,
        numeroAssociado: pessoa.numeroAssociado || '',
        nome: pessoa.nome || '',
        cargo: '',
        formacao: pessoa.formacao || '',
        profissao: pessoa.profissao || '',
        dataInicioPreLeo: pessoa.dataInicioPreLeo || '',
        associadoDesde: pessoa.associadoDesde || '',
        dataDesligamento: pessoa.dataDesligamento || '',
        dataPosseLions: pessoa.dataPosseLions || '',
        dataNascimento: pessoa.dataNascimento || '',
        telefone: pessoa.telefone || '',
        email: pessoa.email || '',
        logradouro: pessoa.logradouro || pessoa.endereco || '',
        cidade: pessoa.cidade || '',
        estado: pessoa.estado || '',
        cep: pessoa.cep || '',
        observacao: dataPosseClube ? '' : 'Sem data de posse'
      };

      if (!pessoasPorClube[clubeNome]) {
        pessoasPorClube[clubeNome] = [];
      }
      pessoasPorClube[clubeNome].push(pessoaDetalhada);
    });

    // Ordenar pessoas por nome dentro de cada clube
    Object.keys(pessoasPorClube).forEach(clube => {
      pessoasPorClube[clube].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
    });

    var todasPessoasDm = [];
    Object.keys(pessoasPorClube).forEach(function (c) {
      (pessoasPorClube[c] || []).forEach(function (p) { todasPessoasDm.push(p); });
    });
    if (typeof aplicarCargoNominataNasPessoasRelatorio === 'function') {
      aplicarCargoNominataNasPessoasRelatorio(todasPessoasDm);
    }

    dadosRelatorio.pessoasPorClube = pessoasPorClube;
    dadosRelatorio.resumoPorClube = resumoPorClube;
    
    logInfo(funcao, 'Excel DM gerado com sucesso', {
      totalClubes: dadosRelatorio.dadosPorClube.length,
      totalGeral: dadosRelatorio.totalGeral,
      periodo: dadosRelatorio.periodo
    });
    
    // Tentar salvar no Supabase (opcional, não bloqueia o retorno)
    try {
      salvarRelatorioDMNoSupabase(dadosRelatorio, usuario);
    } catch (errorSupabase) {
      logWarn(funcao, 'Erro ao salvar relatório DM no Supabase (não crítico)', errorSupabase.message);
    }
    
    return respostaSucesso(dadosRelatorio, 'Excel DM gerado com sucesso');
    
  } catch (error) {
    logError(funcao, 'Erro ao gerar Excel DM', error);
    return tratarExcecao(error, funcao);
  }
}

/**
 * Salvar relatório DM no Supabase
 * @param {Object} dadosRelatorio - Dados do relatório DM
 * @param {Object} usuario - Dados do usuário
 * @return {boolean} True se salvou com sucesso
 */
async function salvarRelatorioDMNoSupabase(dadosRelatorio, usuario) {
  const funcao = 'salvarRelatorioDMNoSupabase';
  
  try {
    // Verificar se Supabase está habilitado
    if (typeof RTMA_USAR_SUPABASE === 'undefined' || RTMA_USAR_SUPABASE !== true) {
      logInfo(funcao, 'Supabase não está habilitado, pulando salvamento');
      return false;
    }
    
    if (typeof RTMA_SUPABASE_CONFIG === 'undefined' || !RTMA_SUPABASE_CONFIG || !RTMA_SUPABASE_CONFIG.url) {
      logWarn(funcao, 'Configuração do Supabase não encontrada');
      return false;
    }
    
    // Preparar dados para inserção
    const dadosParaSalvar = {
      tipo_relatorio: 'excel_dm',
      data_inicio_periodo: converterDataBRParaSQL(dadosRelatorio.dataInicioPeriodo),
      data_fim_periodo: converterDataBRParaSQL(dadosRelatorio.dataFimPeriodo),
      data_geracao: new Date().toISOString(),
      usuario_email: usuario.email || null,
      titulo: dadosRelatorio.titulo || null,
      dados_por_clube: JSON.stringify(dadosRelatorio.dadosPorClube || []),
      total_geral: JSON.stringify(dadosRelatorio.totalGeral || {}),
      periodo: JSON.stringify(dadosRelatorio.periodo || {})
    };
    
    // Tentar inserir na tabela relatorios_dm (se existir)
    // Se a tabela não existir, apenas logar o aviso
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/relatorios_dm`;
    
    const response = await gasStyleFetch(url, {
      method: 'POST',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      payload: JSON.stringify(dadosParaSalvar),
      muteHttpExceptions: true
    });
    
    const statusCode = response.getResponseCode();
    
    if (statusCode >= 200 && statusCode < 300) {
      logInfo(funcao, 'Relatório DM salvo no Supabase com sucesso');
      return true;
    } else if (statusCode === 404 || statusCode === 400) {
      // Tabela não existe ou estrutura diferente - não é crítico
      logWarn(funcao, `Tabela relatorios_dm não encontrada ou estrutura inválida (${statusCode}). Relatório não será salvo no Supabase.`);
      return false;
    } else {
      logWarn(funcao, `Erro ao salvar relatório DM no Supabase (${statusCode}): ${response.getContentText()}`);
      return false;
    }
    
  } catch (error) {
    logWarn(funcao, 'Erro ao salvar relatório DM no Supabase (não crítico)', error.message);
    return false;
  }
}

/**
 * Converter data BR para formato SQL (YYYY-MM-DD)
 * @param {string} dataBR - Data no formato DD/MM/AAAA
 * @return {string|null} Data no formato SQL ou null
 */
function converterDataBRParaSQL(dataBR) {
  if (!dataBR || typeof dataBR !== 'string') {
    return null;
  }
  
  try {
    const partes = dataBR.split('/');
    if (partes.length !== 3) {
      return null;
    }
    
    const dia = partes[0].padStart(2, '0');
    const mes = partes[1].padStart(2, '0');
    const ano = partes[2];
    
    return `${ano}-${mes}-${dia}`;
  } catch (error) {
    return null;
  }
}


module.exports = {
  buscarPessoasRTMA,
  buscarPessoasDaPlanilha,
  processarLinhaPessoa,
  aplicarFiltrosPessoas,
  buscarPessoasDistrito,
  determinarClubesParaBuscar,
  buscarPessoasRTMAOtimizado,
  verificarCabecalhoForaneo,
  limparValidacoesColunaS,
  inicializarColunaForaneoTodosClubes,
  rtmaHashRapidoIdempotencia,
  rtmaMontarChaveIdempotenciaPessoa,
  rtmaLerRespostaIdempotente,
  rtmaSalvarRespostaIdempotente,
  criarPessoaRTMA,
  editarPessoaRTMA,
  desligarPessoaRTMA,
  buscarOpcoesFiltros_rtma_pessoas,
  buscarOpcoesFiltrosDistritoPessoas_rtma_pessoas,
  acessarPlanilhaClube,
  validarDadosPessoa,
  prepararDadosParaInsercao,
  extrairOpcoesFiltrosDaPlanilha,
  coletarOpcoesFiltrosMultiplosClubes,
  normalizarChaveNomeNominataRelatorio,
  chaveClubeNomeNominataRelatorio,
  aplicarCargoNominataNasPessoasRelatorio,
  gerarRelatorioExcelDistrito,
  gerarExcelDetalhado,
  gerarRelatorioMovimentacaoDM,
  calcularResumoDMComFiltrosDashboard,
  calcularResumoTrimestralDM,
  pessoaExistiaNaData,
  eraAssociadoLEONoPeriodo,
  calcularIdadeNaData,
  calcularAnosAssociadoLeoNaData,
  classificarMasterSeniorAssociadoNaData,
  obterAnoLeoistico,
  obterDataAssociacaoLeoParaClassificacaoMasterSenior,
  obterDataPosseClube,
  aplicarFiltrosHistoricos,
  aplicarFiltrosHistoricosPeriodo,
  determinarAnoLeoistico,
  completou31AnosNoMesmoAL,
  isAssociadoLEOValido,
  converterRelatorioParaCSV,
  filtrarPessoasPorData,
  estavAtivoNaDataHistorica,
  pessoaExistiaNaDataCompleta,
  verificarSeCompletou31AnosBackend,
  obterTipoHistoricoPessoa,
  estaVaAtivaNaData,
  formatarDataBR,
  formatarHoraBR,
  converterDataBRParaJS,
  deveSerConsideradaAssociadaBackend,
  calcularInicioALSubsequenteBackend,
  determinarTipoHistoricoNaData,
  determinarStatusPessoaNaData,
  filtrarPessoasPorDataComNovaLogica,
  buscarPessoasComFiltroData,
  buscarPessoasComFiltroPeriodo,
  testarNovaLogicaFiltragem,
  buscarPessoasDistritoComFiltroData,
  formatarRelatorioParaHTML,
  gerarExcelDM,
  salvarRelatorioDMNoSupabase,
  converterDataBRParaSQL,
};
