'use strict';

/**
 * Tipo efetivo de associação para rankings de atividades/campanhas.
 * Espelha a regra do RTMA (`obterTipoHistoricoFrontend`): o tipo vem das
 * datas (Pré-LEO, posse no clube, posse no Lions, desligamento, 31 anos),
 * não do campo `tipo` gravado no banco — que pode estar desatualizado ou
 * ser de um cadastro duplicado.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.RankingAssociacao = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function stringValida(valor) {
    return valor != null && String(valor).trim() !== '';
  }

  function campo(pessoa, camel, snake) {
    if (!pessoa) return null;
    if (stringValida(pessoa[camel])) return pessoa[camel];
    if (stringValida(pessoa[snake])) return pessoa[snake];
    return null;
  }

  function converterDataParaJS(dataString) {
    if (!dataString) return null;
    if (dataString instanceof Date) {
      return isNaN(dataString.getTime()) ? null : dataString;
    }
    if (typeof dataString !== 'string' || dataString.trim() === '') return null;

    const iso = dataString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      const ano = parseInt(iso[1], 10);
      const mes = parseInt(iso[2], 10) - 1;
      const dia = parseInt(iso[3], 10);
      const data = new Date(ano, mes, dia);
      if (data.getFullYear() !== ano || data.getMonth() !== mes || data.getDate() !== dia) return null;
      return data;
    }

    const partes = dataString.split('/');
    if (partes.length !== 3) return null;
    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1;
    const ano = parseInt(partes[2], 10);
    if (!ano || isNaN(dia) || isNaN(mes)) return null;
    const data = new Date(ano, mes, dia);
    if (data.getFullYear() !== ano || data.getMonth() !== mes || data.getDate() !== dia) return null;
    return data;
  }

  function obterAnoLeoistico(data) {
    const ano = data.getFullYear();
    const mes = data.getMonth() + 1;
    return mes >= 7 ? ano : ano - 1;
  }

  function verificarSeCompletou31Anos(dataNascimento, dataReferencia) {
    if (!dataNascimento) return false;
    const anoLeoisticoReferencia = obterAnoLeoistico(dataReferencia);
    const anoLeoisticoNascimento = obterAnoLeoistico(dataNascimento);
    const anoLeoisticoCompletou31 = anoLeoisticoNascimento + 31;
    if (anoLeoisticoReferencia < anoLeoisticoCompletou31) return false;
    if (anoLeoisticoReferencia > anoLeoisticoCompletou31) return true;
    const data01JulhoSubsequente = new Date(anoLeoisticoCompletou31 + 1, 6, 1);
    return dataReferencia >= data01JulhoSubsequente;
  }

  function tipoEfetivo(pessoa, dataReferencia) {
    if (!pessoa) return null;
    const dataRef = dataReferencia ? new Date(dataReferencia) : new Date();
    if (isNaN(dataRef.getTime())) return null;

    const dataInicioPreLeo = converterDataParaJS(campo(pessoa, 'dataInicioPreLeo', 'data_inicio_pre_leo'));
    const dataAssociadoDesde = converterDataParaJS(campo(pessoa, 'associadoDesde', 'associado_desde'));
    const dataPosseLions = converterDataParaJS(campo(pessoa, 'dataPosseLions', 'data_posse_lions'));
    const dataDesligamento = converterDataParaJS(campo(pessoa, 'dataDesligamento', 'data_desligamento'));
    const dataNascimento = converterDataParaJS(campo(pessoa, 'dataNascimento', 'data_nascimento'));

    if (dataDesligamento && dataRef >= dataDesligamento) return null;

    const completou31Anos = verificarSeCompletou31Anos(dataNascimento, dataRef);

    if (dataPosseLions && dataRef >= dataPosseLions) {
      if (dataAssociadoDesde && dataRef >= dataAssociadoDesde) {
        return completou31Anos ? 'Associado LEO/Leão' : 'Associado LEO e LEO/Leão';
      }
      return 'Associado LEO/Leão';
    }

    if (dataAssociadoDesde && dataRef >= dataAssociadoDesde) {
      if (completou31Anos) return null;
      return 'Associado LEO';
    }

    if (dataInicioPreLeo && dataRef >= dataInicioPreLeo) {
      if (!dataAssociadoDesde || dataRef < dataAssociadoDesde) {
        if (completou31Anos) return null;
        return 'Pré LEO';
      }
    }

    return null;
  }

  function estaAtiva(pessoa) {
    const status = String((pessoa && pessoa.status) || 'Ativo').trim().toLowerCase();
    return status === 'ativo';
  }

  function normalizarNome(nome) {
    if (!nome) return '';
    return String(nome).trim().toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function pontuarRegistro(pessoa, dataReferencia) {
    let score = 0;
    if (tipoEfetivo(pessoa, dataReferencia)) score += 100;
    if (estaAtiva(pessoa)) score += 50;
    if (campo(pessoa, 'associadoDesde', 'associado_desde')) score += 10;
    if (campo(pessoa, 'dataPosseLions', 'data_posse_lions')) score += 5;
    if (campo(pessoa, 'numeroAssociado', 'numero_associado')) score += 3;
    const atualizado = pessoa.updated_at || pessoa.updatedAt || pessoa.created_at || pessoa.createdAt || '';
    return { score, atualizado: String(atualizado) };
  }

  function escolherRegistro(atual, candidato, dataReferencia) {
    const a = pontuarRegistro(atual, dataReferencia);
    const b = pontuarRegistro(candidato, dataReferencia);
    if (b.score !== a.score) return b.score > a.score ? candidato : atual;
    if (b.atualizado !== a.atualizado) return b.atualizado > a.atualizado ? candidato : atual;
    return atual;
  }

  function resolverPessoas(pessoas, dataReferencia) {
    const mapa = {};
    (pessoas || []).forEach(function (pessoa) {
      if (!pessoa || !estaAtiva(pessoa)) return;
      const tipo = tipoEfetivo(pessoa, dataReferencia);
      if (!tipo) return;
      const chave = normalizarNome(pessoa.nome);
      if (!chave) return;
      const resolvida = Object.assign({}, pessoa, { tipo: tipo });
      if (!mapa[chave]) {
        mapa[chave] = resolvida;
        return;
      }
      mapa[chave] = escolherRegistro(mapa[chave], resolvida, dataReferencia);
    });
    return Object.keys(mapa).map(function (chave) { return mapa[chave]; });
  }

  function filtrarPorTipo(pessoas, tipoAssociacao) {
    const desejado = String(tipoAssociacao || '').trim();
    if (!desejado) return pessoas || [];
    return (pessoas || []).filter(function (pessoa) {
      return pessoa && String(pessoa.tipo || '').trim() === desejado;
    });
  }

  return {
    tipoEfetivo: tipoEfetivo,
    estaAtiva: estaAtiva,
    normalizarNome: normalizarNome,
    escolherRegistro: escolherRegistro,
    resolverPessoas: resolverPessoas,
    filtrarPorTipo: filtrarPorTipo
  };
});
