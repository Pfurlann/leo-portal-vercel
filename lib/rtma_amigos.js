// === GESTÃO DE AMIGOS LEO E CONSELHEIROS - DISTRITO LEO LD-8 ===
const { logInfo, logWarn, logError, stringValida, arrayValido, emailValido, telefoneValido, cepValido, limparString, respostaSucesso, respostaErro, tratarExcecao } = require('./rtma_utils');
const { obterAmigosCache, armazenarAmigosCache, limparCacheAmigos } = require('./rtma_cache');
const { rtmaObterClubesDaRegiao, rtmaObterTodosClubes, RTMA_ABA_AMIGOS } = require('./rtma_config');
const { buscarAmigosDoSupabase, criarAmigoNoSupabase, editarAmigoNoSupabase, excluirAmigoNoSupabase } = require('./rtma_supabase');
const { formatarDataRTMA } = require('./rtma_utils');

const RTMA_USAR_SUPABASE = true;

async function buscarAmigosConselheiros(clube, tipo = null) {
  const funcao = 'buscarAmigosConselheiros';
  try {
    logInfo(funcao, 'Iniciando busca de amigos/conselheiros', { clube, tipo });
    if (!stringValida(clube)) {
      logError(funcao, 'Clube não informado');
      return [];
    }
    const amigosCache = obterAmigosCache(clube);
    if (amigosCache) {
      logInfo(funcao, 'Dados encontrados no cache', { clube, total: amigosCache.length });
      return aplicarFiltrosAmigos(amigosCache, tipo);
    }
    const amigosDados = await buscarAmigosDoSupabase(clube);
    if (arrayValido(amigosDados)) {
      armazenarAmigosCache(clube, amigosDados);
      logInfo(funcao, 'Dados salvos no cache', { clube, total: amigosDados.length });
      return aplicarFiltrosAmigos(amigosDados, tipo);
    }
    return [];
  } catch (error) {
    logError(funcao, 'Erro geral na busca de amigos', error.message);
    return [];
  }
}

function buscarAmigosDaPlanilha(clube) {
  const funcao = 'buscarAmigosDaPlanilha';
  logWarn(funcao, 'Função de planilha descontinuada - use Supabase', { clube });
  return [];
}

function processarLinhaAmigo(row, rowNum, clube) {
  try {
    if (!arrayValido(row) || row.length < 1) return null;
    const nome = limparString(row[0]);
    if (!stringValida(nome)) return null;
    const cargo = limparString(row[1]);
    const lionsClube = limparString(row[2]);
    let tipoFinal = cargo;
    if (!stringValida(cargo) || (cargo !== 'Conselheiro(a)' && cargo !== 'Amigo(a) LEO')) {
      tipoFinal = "Amigo(a) LEO";
      if (stringValida(lionsClube)) tipoFinal = "Conselheiro(a)";
    }
    return {
      id: rowNum, clube: clube, nome: nome, tipo: tipoFinal, cargo: cargo,
      lionsClube: lionsClube, dataNascimento: formatarDataRTMA(row[3]),
      telefone: limparString(row[4]), email: limparString(row[5]),
      logradouro: limparString(row[6]), cidade: limparString(row[7]), cep: limparString(row[8])
    };
  } catch (error) {
    logWarn('processarLinhaAmigo', `Erro na linha ${rowNum}`, error.message);
    return null;
  }
}

function aplicarFiltrosAmigos(amigos, tipo) {
  if (!arrayValido(amigos)) return [];
  if (!stringValida(tipo)) return amigos;
  return amigos.filter(amigo => amigo.tipo === tipo);
}

async function buscarAmigosDistrito(filtros) {
  const funcao = 'buscarAmigosDistrito';
  try {
    logInfo(funcao, 'Iniciando busca de amigos do distrito', filtros);
    const { clube, tipo, usuario, regiao } = filtros;
    const clubesParaBuscar = determinarClubesParaBuscarAmigos(usuario, clube, regiao);
    if (!arrayValido(clubesParaBuscar)) {
      logWarn(funcao, 'Nenhum clube para buscar');
      return [];
    }
    logInfo(funcao, 'Clubes a processar para amigos', { total: clubesParaBuscar.length });
    let todosAmigos = [];
    for (const nomeClube of clubesParaBuscar) {
      try {
        const amigos = await buscarAmigosConselheiros(nomeClube, tipo);
        if (arrayValido(amigos)) {
          const amigosComClube = amigos.map(a => ({ ...a, clube: nomeClube }));
          todosAmigos = todosAmigos.concat(amigosComClube);
        }
      } catch (error) {
        logWarn(funcao, `Erro ao processar amigos do clube ${nomeClube}`, error.message);
      }
    }
    logInfo(funcao, 'Busca de amigos do distrito concluída', {
      clubesProcessados: clubesParaBuscar.length, totalAmigos: todosAmigos.length
    });
    return todosAmigos;
  } catch (error) {
    logError(funcao, 'Erro na busca de amigos do distrito', error.message);
    return [];
  }
}

function determinarClubesParaBuscarAmigos(usuario, clube, regiao) {
  if (!usuario) return [];
  if (usuario.isRegiao && usuario.clubesPermitidos) {
    if (stringValida(clube) && usuario.clubesPermitidos.includes(clube)) return [clube];
    return usuario.clubesPermitidos;
  }
  if (usuario.isDistrito) {
    if (stringValida(regiao)) return rtmaObterClubesDaRegiao(regiao);
    if (stringValida(clube)) return [clube];
    return rtmaObterTodosClubes();
  }
  return [usuario.clube];
}

async function criarAmigoConselheiro(clube, dados) {
  const funcao = 'criarAmigoConselheiro';
  try {
    logInfo(funcao, 'Criando novo amigo/conselheiro', { clube, nome: dados.nome });
    const validacao = validarDadosAmigo(dados, false);
    if (!validacao.valido) return respostaErro(validacao.erro);
    return await criarAmigoNoSupabase(clube, dados);
  } catch (error) {
    return tratarExcecao(error, funcao);
  }
}

async function editarAmigoConselheiro(clube, amigoId, dados) {
  const funcao = 'editarAmigoConselheiro';
  try {
    logInfo(funcao, 'Editando amigo/conselheiro', { clube, amigoId, nome: dados.nome });
    const validacao = validarDadosAmigo(dados, true);
    if (!validacao.valido) return respostaErro(validacao.erro);
    return await editarAmigoNoSupabase(clube, amigoId, dados);
  } catch (error) {
    return tratarExcecao(error, funcao);
  }
}

async function excluirAmigoConselheiro(clube, amigoId) {
  const funcao = 'excluirAmigoConselheiro';
  try {
    logInfo(funcao, 'Excluindo amigo/conselheiro', { clube, amigoId });
    return await excluirAmigoNoSupabase(clube, amigoId);
  } catch (error) {
    return tratarExcecao(error, funcao);
  }
}

function obterOuCriarAbaAmigos(planilha) {
  return respostaErro('SpreadsheetApp não disponível no Vercel — usar Supabase');
}

function validarDadosAmigo(dados, isEdicao) {
  if (!dados || typeof dados !== 'object') return { valido: false, erro: 'Dados do amigo/conselheiro são obrigatórios' };
  if (!stringValida(dados.nome)) return { valido: false, erro: 'Nome é obrigatório' };
  if (stringValida(dados.tipo)) {
    const tiposValidos = ['Amigo(a) LEO', 'Conselheiro(a)'];
    if (!tiposValidos.includes(dados.tipo)) return { valido: false, erro: 'Tipo deve ser "Amigo(a) LEO" ou "Conselheiro(a)"' };
  }
  if (stringValida(dados.email) && !emailValido(dados.email)) return { valido: false, erro: 'Formato de email inválido' };
  if (stringValida(dados.telefone) && !telefoneValido(dados.telefone)) return { valido: false, erro: 'Formato de telefone inválido' };
  if (stringValida(dados.cep) && !cepValido(dados.cep)) return { valido: false, erro: 'Formato de CEP inválido' };
  return { valido: true };
}

function prepararDadosAmigoParaInsercao(dados) {
  return [
    dados.nome || '', dados.tipo || '', dados.lionsClube || '',
    dados.dataNascimento || '', dados.telefone || '', dados.email || '',
    dados.logradouro || '', dados.cidade || '', dados.cep || ''
  ];
}

function calcularEstatisticasAmigos(amigos) {
  if (!arrayValido(amigos)) return { totalConselheiros: 0, totalAmigosLEO: 0, total: 0 };
  const stats = { totalConselheiros: 0, totalAmigosLEO: 0, total: amigos.length };
  amigos.forEach(amigo => {
    if (amigo.tipo === 'Conselheiro(a)') stats.totalConselheiros++;
    else if (amigo.tipo === 'Amigo(a) LEO') stats.totalAmigosLEO++;
  });
  return stats;
}

async function gerarRelatorioAmigosClube(clube) {
  const funcao = 'gerarRelatorioAmigosClube';
  try {
    logInfo(funcao, 'Gerando relatório de amigos', { clube });
    const amigos = await buscarAmigosConselheiros(clube);
    const stats = calcularEstatisticasAmigos(amigos);
    const { obterRegiaoDoClube } = require('./rtma_config');
    return {
      clube: clube, regiao: obterRegiaoDoClube(clube), estatisticas: stats,
      ultimaAtualizacao: new Date().toISOString(),
      detalhes: {
        conselheiros: amigos.filter(a => a.tipo === 'Conselheiro(a)'),
        amigosLEO: amigos.filter(a => a.tipo === 'Amigo(a) LEO')
      }
    };
  } catch (error) {
    logError(funcao, 'Erro ao gerar relatório', error.message);
    return null;
  }
}

async function exportarAmigosClube(clube) {
  const funcao = 'exportarAmigosClube';
  try {
    const amigos = await buscarAmigosConselheiros(clube);
    if (!arrayValido(amigos)) return [];
    return amigos.map(amigo => ({
      clube: amigo.clube, nome: amigo.nome, tipo: amigo.tipo, lionsClube: amigo.lionsClube,
      dataNascimento: amigo.dataNascimento, telefone: amigo.telefone, email: amigo.email,
      endereco: { logradouro: amigo.logradouro, cidade: amigo.cidade, cep: amigo.cep },
      dataExportacao: new Date().toISOString()
    }));
  } catch (error) {
    logError(funcao, 'Erro na exportação', error.message);
    return [];
  }
}

async function gerarRelatorioExcelAmigosDistrito(usuario, dataReferencia = null, dataInicioPeriodo = null, dataFimPeriodo = null, incluirInativos = false) {
  const funcao = 'gerarRelatorioExcelAmigosDistrito';
  try {
    if (!usuario || !usuario.isDistrito) return respostaErro('Acesso negado. Apenas usuários do distrito podem gerar este relatório.');
    const { getRtmaConfig, rtmaObterListaClubesParaRelatorio } = require('./rtma_config');
    const { obterRegiaoDoClube } = require('./rtma_config');
    const config = getRtmaConfig();
    const clubes = rtmaObterListaClubesParaRelatorio(config);
    const dadosRelatorio = {
      titulo: 'Relatório de Amigos LEO e Conselheiros - Distrito LEO LD-8',
      dataGeracao: new Date().toLocaleDateString('pt-BR'),
      horaGeracao: new Date().toLocaleTimeString('pt-BR'),
      usuario: usuario.email, clubes: [],
      totais: { 'Amigo(a) LEO': 0, 'Conselheiro(a)': 0, 'Total': 0 }
    };
    for (let index = 0; index < clubes.length; index++) {
      const clube = clubes[index];
      try {
        logInfo(funcao, `Processando clube ${index + 1}/${clubes.length}: ${clube}`);
        const todosAmigos = await buscarAmigosConselheiros(clube);
        const amigosValidos = todosAmigos || [];
        const dadosClube = {
          clube: clube, regiao: obterRegiaoDoClube(clube) || 'N/A',
          'Amigo(a) LEO': 0, 'Conselheiro(a)': 0, 'Total': amigosValidos.length
        };
        amigosValidos.forEach(amigo => {
          const tipo = amigo.tipo || '';
          if (dadosClube.hasOwnProperty(tipo)) { dadosClube[tipo]++; dadosRelatorio.totais[tipo]++; }
        });
        dadosRelatorio.totais['Total'] += amigosValidos.length;
        dadosRelatorio.clubes.push(dadosClube);
      } catch (error) {
        logWarn(funcao, `Erro ao processar clube ${clube}`, error.message);
        dadosRelatorio.clubes.push({ clube, regiao: obterRegiaoDoClube(clube) || 'N/A', 'Amigo(a) LEO': 'ERRO', 'Conselheiro(a)': 'ERRO', 'Total': 'ERRO' });
      }
    }
    dadosRelatorio.clubes.sort((a, b) => {
      if (a.regiao !== b.regiao) return a.regiao.localeCompare(b.regiao);
      return a.clube.localeCompare(b.clube);
    });
    return respostaSucesso(dadosRelatorio, 'Relatório de amigos gerado com sucesso');
  } catch (error) {
    return tratarExcecao(error, funcao);
  }
}

function converterRelatorioAmigosParaCSV(dadosRelatorio) {
  const funcao = 'converterRelatorioAmigosParaCSV';
  try {
    let csv = [];
    csv.push(`"${dadosRelatorio.titulo}"`);
    csv.push(`"Gerado em: ${dadosRelatorio.dataGeracao} às ${dadosRelatorio.horaGeracao}"`);
    csv.push('');
    csv.push('"Clube","Região","Amigo(a) LEO","Conselheiro(a)","Total"');
    dadosRelatorio.clubes.forEach(clube => {
      csv.push([
        `"${clube.clube}"`, `"${clube.regiao}"`, `"${clube['Amigo(a) LEO']}"`,
        `"${clube['Conselheiro(a)']}"`, `"${clube['Total']}"`
      ].join(','));
    });
    csv.push('');
    csv.push(['"TOTAL GERAL"', '""',
      `"${dadosRelatorio.totais['Amigo(a) LEO']}"`,
      `"${dadosRelatorio.totais['Conselheiro(a)']}"`,
      `"${dadosRelatorio.totais['Total']}"`
    ].join(','));
    return csv.join('\n');
  } catch (error) {
    logError(funcao, 'Erro ao converter relatório para CSV', error.message);
    return 'Erro ao gerar CSV';
  }
}

async function verificarIntegridadeAmigos(clube) {
  const funcao = 'verificarIntegridadeAmigos';
  try {
    const amigos = await buscarAmigosConselheiros(clube);
    const problemas = [];
    const avisos = [];
    amigos.forEach(amigo => {
      if (!stringValida(amigo.nome)) problemas.push(`Linha ${amigo.id}: Nome não informado`);
      const temLionsClube = stringValida(amigo.lionsClube);
      const ehConselheiro = amigo.tipo === 'Conselheiro(a)';
      if (temLionsClube && !ehConselheiro) avisos.push(`${amigo.nome}: Tem Lions Clube mas não é marcado como Conselheiro`);
      if (!temLionsClube && ehConselheiro) avisos.push(`${amigo.nome}: Marcado como Conselheiro mas sem Lions Clube`);
      if (stringValida(amigo.email) && !emailValido(amigo.email)) problemas.push(`${amigo.nome}: Email com formato inválido`);
      if (stringValida(amigo.telefone) && !telefoneValido(amigo.telefone)) avisos.push(`${amigo.nome}: Telefone com formato suspeito`);
    });
    return {
      clube, totalRegistros: amigos.length, problemas, avisos,
      status: problemas.length === 0 ? 'OK' : 'PROBLEMAS_ENCONTRADOS',
      verificadoEm: new Date().toISOString()
    };
  } catch (error) {
    logError(funcao, 'Erro na verificação de integridade', error.message);
    return { clube, status: 'ERRO', erro: error.message, verificadoEm: new Date().toISOString() };
  }
}

module.exports = {
  buscarAmigosConselheiros, buscarAmigosDaPlanilha, processarLinhaAmigo,
  aplicarFiltrosAmigos, buscarAmigosDistrito, determinarClubesParaBuscarAmigos,
  criarAmigoConselheiro, editarAmigoConselheiro, excluirAmigoConselheiro,
  obterOuCriarAbaAmigos, validarDadosAmigo, prepararDadosAmigoParaInsercao,
  calcularEstatisticasAmigos, gerarRelatorioAmigosClube, exportarAmigosClube,
  gerarRelatorioExcelAmigosDistrito, converterRelatorioAmigosParaCSV, verificarIntegridadeAmigos,
};
