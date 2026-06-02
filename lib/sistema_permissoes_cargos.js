'use strict';

const { UrlFetchApp, PropertiesService, CacheService, LockService, Utilities, Session, ScriptApp, Logger, MimeType, DriveApp } = require('./gas-compat');
const { gasStyleFetch } = require('./async-fetch-helper');

/**
 * Sistema de Permissões Baseado em Cargos da Nominata
 *
 * Este sistema valida acesso baseado em:
 * 1. Cargo na nominata (Presidente, Secretária, Diretor de Campanhas)
 * 2. Ano Leonístico (AL) ativo
 * 3. Clube do usuário
 *
 * Permissões:
 * - Presidente: Acesso total
 * - Secretária/Secretário: Apenas Secretaria
 * - Diretor/Diretora de Campanhas: Apenas Campanhas
 */

/**
 * Obter AL atual baseado na data
 * @return {string} AL no formato "AAAA-AAAA" (ex: "2025-2026")
 */
function obterAlAtual() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1; // 1-12

  if (mes >= 7) {
    // Julho a Dezembro: AL atual até junho do próximo ano
    return `${ano}-${ano + 1}`;
  } else {
    // Janeiro a Junho: AL anterior (julho do ano anterior até junho atual)
    return `${ano - 1}-${ano}`;
  }
}

/**
 * Buscar cargo na nominata para um usuário
 * @param {string} email - Email do usuário
 * @param {string} clubeNome - Nome do clube
 * @param {string} alAtual - AL atual no formato "AAAA-AAAA"
 * @return {Object|null} { cargo: string, nome: string, al: string } ou null se não encontrar
 */
async function buscarCargoNaNominata(email, clubeNome, alAtual) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = 'https://bqkttaflhtsdkamgscnf.supabase.co';

    if (!serviceRoleKey) {
      console.error('Service Role Key não configurada');
      return null;
    }

    // Buscar na nominata_dirigentes
    // Primeiro, precisamos buscar o nome da pessoa pelo email na tabela de pessoas
    // Ou podemos buscar diretamente na nominata se tiver email lá

    // Buscar pessoa pelo email para obter o nome
    const urlPessoa = `${supabaseUrl}/rest/v1/pessoas?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=nome,clube_nome&limit=1`;
    const responsePessoa = await gasStyleFetch(urlPessoa, {
      method: 'GET',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });

    let nomePessoa = null;
    if (responsePessoa.getResponseCode() === 200) {
      const pessoas = JSON.parse(responsePessoa.getContentText() || '[]');
      if (pessoas && pessoas.length > 0) {
        nomePessoa = (pessoas[0].nome || '').trim();
      }
    }

    if (!nomePessoa) {
      console.log(`Pessoa não encontrada pelo email: ${email}`);
      return null;
    }

    // Buscar cargo na nominata
    const urlNominata = `${supabaseUrl}/rest/v1/nominata_dirigentes?clube=eq.${encodeURIComponent(clubeNome)}&ano_leonistico=eq.${encodeURIComponent(alAtual)}&select=nome,cargo,ano_leonistico`;
    const responseNominata = await gasStyleFetch(urlNominata, {
      method: 'GET',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });

    if (responseNominata.getResponseCode() !== 200) {
      console.error('Erro ao buscar nominata:', responseNominata.getResponseCode());
      return null;
    }

    const dirigentes = JSON.parse(responseNominata.getContentText() || '[]');

    // Normalizar nome para comparação (remover acentos, espaços extras, etc)
    const normalizarNome = function(nome) {
      return String(nome || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // Remove acentos
        .replace(/[^\w\s]/g, '') // Remove caracteres especiais
        .replace(/\s+/g, ' ') // Normaliza espaços
        .trim();
    };

    const nomeNormalizado = normalizarNome(nomePessoa);

    // Procurar cargo correspondente
    for (const dirigente of dirigentes) {
      const nomeDirigenteNormalizado = normalizarNome(dirigente.nome);

      if (nomeDirigenteNormalizado === nomeNormalizado) {
        return {
          cargo: (dirigente.cargo || '').trim(),
          nome: dirigente.nome,
          al: dirigente.ano_leonistico || alAtual
        };
      }
    }

    return null;

  } catch (error) {
    console.error('Erro ao buscar cargo na nominata:', error);
    return null;
  }
}

/**
 * Determinar tipo de acesso baseado no cargo
 * @param {string} cargo - Cargo na nominata
 * @return {string} Tipo de acesso: 'presidente', 'secretaria', 'campanhas', ou null
 */
function determinarTipoAcessoPorCargo(cargo) {
  if (!cargo) return null;

  const cargoLower = String(cargo).toLowerCase().trim();

  // Presidente - acesso total
  if (cargoLower.includes('presidente') && !cargoLower.includes('vice')) {
    return 'presidente';
  }

  // Secretária/Secretário - apenas Secretaria
  if (cargoLower.includes('secretari') || cargoLower.includes('secretária') || cargoLower.includes('secretário')) {
    return 'secretaria';
  }

  // Diretor/Diretora de Campanhas - apenas Campanhas
  if (cargoLower.includes('diretor') && cargoLower.includes('campanha')) {
    return 'campanhas';
  }
  if (cargoLower.includes('diretora') && cargoLower.includes('campanha')) {
    return 'campanhas';
  }

  return null;
}

/**
 * Validar acesso do usuário baseado em cargo e AL
 * @param {string} email - Email do usuário
 * @param {string} clubeNome - Nome do clube
 * @return {Object} { valido: boolean, tipoAcesso: string, cargo: string, erro: string }
 */
async function validarAcessoPorCargo(email, clubeNome) {
  try {
    const alAtual = obterAlAtual();

    // Buscar cargo na nominata
    const cargoInfo = await buscarCargoNaNominata(email, clubeNome, alAtual);

    if (!cargoInfo) {
      return {
        valido: false,
        tipoAcesso: null,
        cargo: null,
        erro: 'Usuário não encontrado na nominata do AL atual ou cargo não configurado.'
      };
    }

    // Determinar tipo de acesso
    const tipoAcesso = determinarTipoAcessoPorCargo(cargoInfo.cargo);

    if (!tipoAcesso) {
      return {
        valido: false,
        tipoAcesso: null,
        cargo: cargoInfo.cargo,
        erro: `Cargo "${cargoInfo.cargo}" não tem permissão de acesso configurada. Apenas Presidente, Secretária/Secretário e Diretor/Diretora de Campanhas têm acesso.`
      };
    }

    // Verificar se o AL corresponde
    if (cargoInfo.al !== alAtual) {
      return {
        valido: false,
        tipoAcesso: tipoAcesso,
        cargo: cargoInfo.cargo,
        erro: `Acesso válido apenas para o AL ${cargoInfo.al}. AL atual é ${alAtual}.`
      };
    }

    return {
      valido: true,
      tipoAcesso: tipoAcesso,
      cargo: cargoInfo.cargo,
      al: cargoInfo.al,
      erro: null
    };

  } catch (error) {
    console.error('Erro ao validar acesso por cargo:', error);
    return {
      valido: false,
      tipoAcesso: null,
      cargo: null,
      erro: 'Erro ao validar acesso: ' + (error.message || 'Erro desconhecido')
    };
  }
}

/**
 * Atualizar tipo de acesso na tabela usuarios_acessos baseado no cargo
 * @param {string} email - Email do usuário
 * @param {string} clubeNome - Nome do clube
 * @return {Object} { sucesso: boolean, tipoAcesso: string, erro: string }
 */
async function atualizarTipoAcessoPorCargo(email, clubeNome) {
  try {
    const validacao = await validarAcessoPorCargo(email, clubeNome);

    if (!validacao.valido) {
      return {
        sucesso: false,
        tipoAcesso: null,
        erro: validacao.erro
      };
    }

    // Atualizar na tabela usuarios_acessos
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = 'https://bqkttaflhtsdkamgscnf.supabase.co';

    if (!serviceRoleKey) {
      return { sucesso: false, erro: 'Service Role Key não configurada' };
    }

    // Mapear tipo de acesso para o formato da tabela
    const tipoAcessoMap = {
      'presidente': 'distrito', // Presidente tem acesso distrital (total)
      'secretaria': 'secretaria',
      'campanhas': 'campanhas'
    };

    const tipoAcessoTabela = tipoAcessoMap[validacao.tipoAcesso] || validacao.tipoAcesso;

    // Atualizar
    const urlUpdate = `${supabaseUrl}/rest/v1/usuarios_acessos?email=eq.${encodeURIComponent(email.toLowerCase().trim())}`;
    const responseUpdate = await gasStyleFetch(urlUpdate, {
      method: 'PATCH',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      payload: JSON.stringify({
        tipo_acesso: tipoAcessoTabela
      }),
      muteHttpExceptions: true
    });

    if (responseUpdate.getResponseCode() === 200 || responseUpdate.getResponseCode() === 204) {
      return {
        sucesso: true,
        tipoAcesso: tipoAcessoTabela,
        cargo: validacao.cargo,
        erro: null
      };
    } else {
      return {
        sucesso: false,
        tipoAcesso: null,
        erro: 'Erro ao atualizar tipo de acesso na tabela'
      };
    }

  } catch (error) {
    console.error('Erro ao atualizar tipo de acesso:', error);
    return {
      sucesso: false,
      tipoAcesso: null,
      erro: error.toString()
    };
  }
}

module.exports = {
  obterAlAtual,
  buscarCargoNaNominata,
  determinarTipoAcessoPorCargo,
  validarAcessoPorCargo,
  atualizarTipoAcessoPorCargo
};
