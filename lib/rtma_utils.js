// === FUNÇÕES UTILITÁRIAS - DISTRITO LEO LD-8 ===
const { Utilities, Session } = require('./gas-compat');

function formatarDataRTMA(data) {
  try {
    if (!data) return "";
    if (typeof data === 'string') return data;
    if (data instanceof Date) {
      return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
    }
    const dateObj = new Date(data);
    if (!isNaN(dateObj.getTime())) {
      return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "dd/MM/yyyy");
    }
    return String(data);
  } catch (error) {
    console.warn('Erro ao formatar data:', error);
    return "";
  }
}

function converterStringParaData(dataString) {
  if (!dataString || typeof dataString !== 'string') return null;
  const partes = dataString.split('/');
  if (partes.length !== 3) return null;
  const dia = parseInt(partes[0]);
  const mes = parseInt(partes[1]) - 1;
  const ano = parseInt(partes[2]);
  if (isNaN(dia) || isNaN(mes) || isNaN(ano)) return null;
  const data = new Date(ano, mes, dia);
  if (isNaN(data.getTime())) return null;
  return data;
}

function stringValida(valor) {
  return valor && typeof valor === 'string' && valor.trim().length > 0;
}

function emailValido(email) {
  if (!stringValida(email)) return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim());
}

function telefoneValido(telefone) {
  if (!stringValida(telefone)) return false;
  const numeros = telefone.replace(/\D/g, '');
  return numeros.length >= 8 && numeros.length <= 11;
}

function cepValido(cep) {
  if (!stringValida(cep)) return false;
  const numeros = cep.replace(/\D/g, '');
  return numeros.length === 8;
}

function limparString(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function capitalizarTexto(texto) {
  if (!stringValida(texto)) return "";
  return texto.toLowerCase().replace(/\b\w/g, function(letra) {
    return letra.toUpperCase();
  });
}

function removerAcentos(texto) {
  if (!stringValida(texto)) return "";
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function arrayValido(array) {
  return Array.isArray(array) && array.length > 0;
}

function removerDuplicatas(array) {
  if (!Array.isArray(array)) return [];
  return [...new Set(array)];
}

function ordenarPorPropriedade(array, propriedade, crescente = true) {
  if (!Array.isArray(array)) return [];
  return array.sort((a, b) => {
    const valorA = a[propriedade] || "";
    const valorB = b[propriedade] || "";
    if (crescente) {
      return valorA.localeCompare(valorB);
    } else {
      return valorB.localeCompare(valorA);
    }
  });
}

function logFormatado(nivel, funcao, mensagem, dados = null) {
  const timestamp = new Date().toLocaleString('pt-BR');
  let logMsg = `[${timestamp}] ${nivel} - ${funcao}: ${mensagem}`;
  if (dados !== null) {
    logMsg += ` | Dados: ${JSON.stringify(dados)}`;
  }
  console.log(logMsg);
}

function logInfo(funcao, mensagem, dados = null) {
  logFormatado('INFO', funcao, mensagem, dados);
}

function logWarn(funcao, mensagem, dados = null) {
  logFormatado('WARN', funcao, mensagem, dados);
}

function logError(funcao, mensagem, dados = null) {
  logFormatado('ERROR', funcao, mensagem, dados);
}

function medirTempo(funcao, nome) {
  const inicio = new Date().getTime();
  try {
    const resultado = funcao();
    const fim = new Date().getTime();
    logInfo('medirTempo', `${nome} executada em ${fim - inicio}ms`);
    return resultado;
  } catch (error) {
    const fim = new Date().getTime();
    logError('medirTempo', `${nome} falhou após ${fim - inicio}ms`, error.message);
    throw error;
  }
}

function respostaSucesso(dados = null, mensagem = "Operação realizada com sucesso") {
  return {
    sucesso: true,
    dados: dados,
    mensagem: mensagem,
    timestamp: new Date().toISOString()
  };
}

function respostaErro(erro, detalhes = null) {
  return {
    sucesso: false,
    erro: erro,
    detalhes: detalhes,
    timestamp: new Date().toISOString()
  };
}

function tratarExcecao(error, funcao) {
  const mensagemErro = error.message || 'Erro desconhecido';
  const stack = error.stack || 'Stack trace não disponível';
  logError(funcao, mensagemErro, { stack: stack });
  return respostaErro(`Erro em ${funcao}: ${mensagemErro}`, {
    funcao: funcao,
    stack: stack
  });
}

module.exports = {
  formatarDataRTMA, converterStringParaData, stringValida, emailValido,
  telefoneValido, cepValido, limparString, capitalizarTexto, removerAcentos,
  arrayValido, removerDuplicatas, ordenarPorPropriedade,
  logFormatado, logInfo, logWarn, logError, medirTempo,
  respostaSucesso, respostaErro, tratarExcecao,
};
