'use strict';

const { UrlFetchApp, PropertiesService, CacheService, LockService, Utilities, Session, ScriptApp, Logger, MimeType, DriveApp } = require('./gas-compat');
const { gasStyleFetch } = require('./async-fetch-helper');

// === SUPABASE (LEO PORTAL - CAMPANHAS/ATIVIDADES) ===
// Objetivo: remover dependência de planilhas para leitura/gravação de Campanhas/Atividades.
// Usa serviceRoleKey no backend do Apps Script.

const PORTAL_USAR_SUPABASE = true;

// Reutiliza a config já existente do RTMA (mesmo projeto Supabase)
const PORTAL_SUPABASE_CONFIG = (typeof RTMA_SUPABASE_CONFIG !== 'undefined' && RTMA_SUPABASE_CONFIG && RTMA_SUPABASE_CONFIG.url)
  ? RTMA_SUPABASE_CONFIG
  : {
      url: 'https://bqkttaflhtsdkamgscnf.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxa3R0YWZsaHRzZGthbWdzY25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTA4MjEsImV4cCI6MjA4Mjc2NjgyMX0.yGxyrn2nMTEbl6w8Lk8HwsblgqNzGS36ckZBGXAIitQ',
      serviceRoleKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxa3R0YWZsaHRzZGthbWdzY25mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzE5MDgyMSwiZXhwIjoyMDgyNzY2ODIxfQ.v5Eh3DgTDPnkaptB0wBR_pnafF-j9cX5snv8NdF8q6s'
    };

const PORTAL_SUPABASE_TABLES = {
  campanhas: 'campanhas',
  atividades: 'atividades',
  configuracoes: 'configuracoes',
  solicitacoes_alteracao: 'solicitacoes_alteracao',
  eventos: 'eventos',
  eventos_lotes: 'eventos_lotes',
  eventos_inscricoes: 'eventos_inscricoes',
  eventos_envios: 'eventos_envios',
  eventos_envios_comprovantes: 'eventos_envios_comprovantes',
  modalidades: 'modalidades',
  eventos_modalidades: 'eventos_modalidades',
  modalidades_bloqueio: 'modalidades_bloqueio',
  eventos_credenciamento_modalidade: 'eventos_credenciamento_modalidade',
  past_presidentes: 'past_presidentes',
  eixos_campanha: 'eixos_campanha'
};

const __portalSupabaseStyleCache = {}; // { tableName: 'snake'|'camel'|'unknown' }

async function portalSupabaseFetch(path, options = {}) {
  if (!PORTAL_SUPABASE_CONFIG || !PORTAL_SUPABASE_CONFIG.url || !PORTAL_SUPABASE_CONFIG.serviceRoleKey) {
    console.error('portalSupabaseFetch: Configuração do Supabase inválida', PORTAL_SUPABASE_CONFIG);
    const mockResp = {
      getResponseCode: () => 500,
      getContentText: () => JSON.stringify({ error: 'Configuração do Supabase inválida' }),
      getHeaders: () => ({})
    };
    return mockResp;
  }
  const url = `${PORTAL_SUPABASE_CONFIG.url}/rest/v1/${path}`;
  const headers = Object.assign(
    {
      'apikey': PORTAL_SUPABASE_CONFIG.serviceRoleKey,
      'Authorization': `Bearer ${PORTAL_SUPABASE_CONFIG.serviceRoleKey}`,
      'Content-Type': 'application/json'
    },
    options.headers || {}
  );

  const resp = await gasStyleFetch(url, {
    method: options.method || 'GET',
    headers,
    payload: options.payload,
    muteHttpExceptions: true
  });

  return resp;
}

async function portalDetectTableStyle(table) {
  const funcao = 'portalDetectTableStyle';
  const tableName = String(table || '').trim();
  if (!tableName) return 'unknown';
  if (__portalSupabaseStyleCache[tableName]) return __portalSupabaseStyleCache[tableName];

  try {
    const resp = await portalSupabaseFetch(`${encodeURIComponent(tableName)}?select=*&limit=1`, { method: 'GET' });
    if (resp.getResponseCode() !== 200) {
      __portalSupabaseStyleCache[tableName] = 'unknown';
      return 'unknown';
    }
    const arr = JSON.parse(resp.getContentText() || '[]');
    const row = arr && arr[0] ? arr[0] : null;
    if (!row || typeof row !== 'object') {
      __portalSupabaseStyleCache[tableName] = 'unknown';
      return 'unknown';
    }
    const keys = Object.keys(row);
    const hasSnake = keys.some(k => k.includes('_'));
    __portalSupabaseStyleCache[tableName] = hasSnake ? 'snake' : 'camel';
    return __portalSupabaseStyleCache[tableName];
  } catch (e) {
    console.error(`${funcao}: erro`, e);
    __portalSupabaseStyleCache[tableName] = 'unknown';
    return 'unknown';
  }
}

function portalToCamelFromSnake(obj, mapping) {
  const out = {};
  Object.keys(obj || {}).forEach(k => {
    const kk = mapping[k] || k;
    out[kk] = obj[k];
  });
  return out;
}

function portalToSnakeFromCamel(obj, mapping) {
  const out = {};
  Object.keys(obj || {}).forEach(k => {
    const kk = mapping[k] || k;
    out[kk] = obj[k];
  });
  return out;
}

function portalNormalizeAtividadeRow(row) {
  if (!row) return null;
  const snakeToCamel = {
    id: 'id',
    clube_nome: 'clube',
    clube: 'clube',
    al: 'al',
    trimestre: 'trimestre',
    data_registro: 'dataRegistro',
    dataRegistro: 'dataRegistro',
    titulo: 'titulo',
    tipo_atividade: 'tipoAtividade',
    tipoAtividade: 'tipoAtividade',
    data_inicio: 'dataInicio',
    dataInicio: 'dataInicio',
    hora_inicio: 'horaInicio',
    horaInicio: 'horaInicio',
    data_fim: 'dataFim',
    dataFim: 'dataFim',
    hora_fim: 'horaFim',
    horaFim: 'horaFim',
    local_atividade: 'localAtividade',
    localAtividade: 'localAtividade',
    associados_presentes: 'presentes',
    qtd_associados_presentes: 'qtdPresentes',
    pre_leos_presentes: 'preLeos',
    qtd_pre_leos_presentes: 'qtdPreLeos',
    leo_leao_presentes: 'leoLeao',
    qtd_leo_leao_presentes: 'qtdLeoLeao',
    amigos_conselheiros_presentes: 'amigosConselheiros',
    qtd_amigos_conselheiros_presentes: 'qtdAmigosConselheiros',
    presentes: 'presentes',
    qtd_presentes: 'qtdPresentes',
    qtdPresentes: 'qtdPresentes',
    pre_leos: 'preLeos',
    preLeos: 'preLeos',
    qtd_pre_leos: 'qtdPreLeos',
    qtdPreLeos: 'qtdPreLeos',
    leo_leao: 'leoLeao',
    leoLeao: 'leoLeao',
    qtd_leo_leao: 'qtdLeoLeao',
    qtdLeoLeao: 'qtdLeoLeao',
    amigos_conselheiros: 'amigosConselheiros',
    amigosConselheiros: 'amigosConselheiros',
    qtd_amigos_conselheiros: 'qtdAmigosConselheiros',
    qtdAmigosConselheiros: 'qtdAmigosConselheiros',
    outros_lions: 'outrosLions',
    outrosLions: 'outrosLions',
    descricao_atividade: 'descricaoTexto',
    descricao_texto: 'descricaoTexto',
    descricaoTexto: 'descricaoTexto',
    foto_oficial_url: 'linkFotoOficial',
    link_foto_oficial: 'linkFotoOficial',
    linkFotoOficial: 'linkFotoOficial',
    duracao_total_minutos: 'duracaoTotal',
    duracao_total: 'duracaoTotal',
    duracaoTotal: 'duracaoTotal',
    comentario_distrital: 'comentarioDistrital',
    comentarioDistrital: 'comentarioDistrital',
    marcado_corrigido: 'marcadoCorrigido',
    marcadoCorrigido: 'marcadoCorrigido',
    quem_corrigiu: 'quemCorrigiu',
    quemCorrigiu: 'quemCorrigiu'
  };

  const obj = portalToCamelFromSnake(row, snakeToCamel);
  // Normalizações leves
  if (obj.dataRegistro && typeof obj.dataRegistro === 'string' && !obj.dataRegistro.includes('T')) {
    try { obj.dataRegistro = new Date(obj.dataRegistro).toISOString(); } catch (e) {}
  }
  if (obj.dataInicio && typeof obj.dataInicio === 'string' && !obj.dataInicio.includes('T')) {
    try { obj.dataInicio = new Date(obj.dataInicio).toISOString(); } catch (e) {}
  }
  if (obj.dataFim && typeof obj.dataFim === 'string' && !obj.dataFim.includes('T')) {
    try { obj.dataFim = new Date(obj.dataFim).toISOString(); } catch (e) {}
  }
  obj.qtdPresentes = parseInt(obj.qtdPresentes) || 0;
  obj.qtdPreLeos = parseInt(obj.qtdPreLeos) || 0;
  obj.qtdLeoLeao = parseInt(obj.qtdLeoLeao) || 0;
  obj.qtdAmigosConselheiros = parseInt(obj.qtdAmigosConselheiros) || 0;
  obj.outrosLions = parseInt(obj.outrosLions) || 0;
  obj.duracaoTotal = parseFloat(obj.duracaoTotal) || 0;
  obj.marcadoCorrigido = (obj.marcadoCorrigido === true) || (obj.marcadoCorrigido === 'Sim');

  const contarLista = (valor) => {
    if (!valor) return 0;
    if (Array.isArray(valor)) return valor.filter(v => String(v || '').trim()).length;
    if (typeof valor === 'string') {
      return valor.split(',').map(v => v.trim()).filter(Boolean).length;
    }
    return 0;
  };

  if (!obj.qtdPresentes && obj.presentes) obj.qtdPresentes = contarLista(obj.presentes);
  if (!obj.qtdPreLeos && obj.preLeos) obj.qtdPreLeos = contarLista(obj.preLeos);
  if (!obj.qtdLeoLeao && obj.leoLeao) obj.qtdLeoLeao = contarLista(obj.leoLeao);
  if (!obj.qtdAmigosConselheiros && obj.amigosConselheiros) {
    obj.qtdAmigosConselheiros = contarLista(obj.amigosConselheiros);
  }

  obj.associadosPresentes = obj.presentes || obj.associadosPresentes || '';
  obj.preLeosPresentes = obj.preLeos || obj.preLeosPresentes || '';
  obj.leoLeaoPresentes = obj.leoLeao || obj.leoLeaoPresentes || '';
  obj.amigosConselheirosPresentes = obj.amigosConselheiros || obj.amigosConselheirosPresentes || '';
  return obj;
}

function portalNormalizeCampanhaRow(row) {
  if (!row) return null;
  const snakeToCamel = {
    id: 'id',
    clube_nome: 'clube',
    clube: 'clube',
    al: 'al',
    trimestre: 'trimestre',
    data_registro: 'dataRegistro',
    dataRegistro: 'dataRegistro',
    titulo: 'titulo',
    objetivo: 'objetivo',
    data_inicio: 'dataInicio',
    dataInicio: 'dataInicio',
    data_fim: 'dataFim',
    dataFim: 'dataFim',
    coordenador: 'coordenador',
    comissao: 'comissao',
    membros_comissao: 'membrosComissao',
    membrosComissao: 'membrosComissao',
    associados_presentes: 'associadosPresentes',
    qtd_associados_presentes: 'qtdPresentes',
    pre_leo_presentes: 'preLeoPresentes',
    qtd_pre_leo_presentes: 'qtdPreLeos',
    amigos_conselheiros_presentes: 'amigosConselheiros',
    qtd_amigos_conselheiros_presentes: 'qtdAmigosConselheiros',
    associadosPresentes: 'associadosPresentes',
    qtd_presentes: 'qtdPresentes',
    qtdPresentes: 'qtdPresentes',
    pre_leo_presentes: 'preLeoPresentes',
    preLeoPresentes: 'preLeoPresentes',
    qtd_pre_leos: 'qtdPreLeos',
    qtdPreLeos: 'qtdPreLeos',
    amigos_conselheiros: 'amigosConselheiros',
    qtd_amigos_conselheiros: 'qtdAmigosConselheiros',
    pessoas_impactadas: 'pessoasImpactadas',
    pessoasImpactadas: 'pessoasImpactadas',
    custo_campanha: 'custoCampanha',
    custoCampanha: 'custoCampanha',
    companheiros_leoes_presentes: 'qtdLeoesParticipantes',
    qtd_leoes_participantes: 'qtdLeoesParticipantes',
    qtdLeoesParticipantes: 'qtdLeoesParticipantes',
    horas_trabalhadas_por_pessoa: 'horasPorPessoa',
    horas_por_pessoa: 'horasPorPessoa',
    horasPorPessoa: 'horasPorPessoa',
    horas_totais_trabalhadas: 'horasTotais',
    horas_totais: 'horasTotais',
    horasTotais: 'horasTotais',
    descricao_campanha: 'descricaoTexto',
    descricao_texto: 'descricaoTexto',
    descricaoTexto: 'descricaoTexto',
    eixo: 'eixo',
    eixo_d8: 'eixoD8',
    eixo_dm: 'eixoDM',
    eixoDM: 'eixoDM',
    foto_oficial_url: 'linkFotoOficial',
    link_foto_oficial: 'linkFotoOficial',
    linkFotoOficial: 'linkFotoOficial',
    video_url: 'linkVideo',
    link_video: 'linkVideo',
    linkVideo: 'linkVideo',
    outras_fotos_url: 'linkOutrasFotos',
    link_outras_fotos: 'linkOutrasFotos',
    linkOutrasFotos: 'linkOutrasFotos',
    descricao_html: 'descricaoHTML',
    descricaoHTML: 'descricaoHTML',
    tem_parceria: 'temParceria',
    temParceria: 'temParceria',
    entidade_parceira: 'entidadeParceira',
    entidadeParceira: 'entidadeParceira',
    tipo_parceria: 'tipoParceria',
    tipoParceria: 'tipoParceria',
    descricao_parceria: 'descricaoParceria',
    descricaoParceria: 'descricaoParceria',
    comentario_distrital: 'comentarioDistrital',
    comentarioDistrital: 'comentarioDistrital',
    marcado_corrigido: 'marcadoCorrigido',
    marcadoCorrigido: 'marcadoCorrigido',
    quem_corrigiu: 'quemCorrigiu',
    quemCorrigiu: 'quemCorrigiu',
    divulgacao: 'divulgacao',
    pontos_melhorar: 'pontosMelhorar',
    pontosMelhorar: 'pontosMelhorar',
    feedback: 'feedback'
  };

  const obj = portalToCamelFromSnake(row, snakeToCamel);
  if (obj.dataRegistro && typeof obj.dataRegistro === 'string' && !obj.dataRegistro.includes('T')) {
    try { obj.dataRegistro = new Date(obj.dataRegistro).toISOString(); } catch (e) {}
  }
  if (obj.dataInicio && typeof obj.dataInicio === 'string' && !obj.dataInicio.includes('T')) {
    try { obj.dataInicio = new Date(obj.dataInicio).toISOString(); } catch (e) {}
  }
  if (obj.dataFim && typeof obj.dataFim === 'string' && !obj.dataFim.includes('T')) {
    try { obj.dataFim = new Date(obj.dataFim).toISOString(); } catch (e) {}
  }
  obj.qtdPresentes = parseInt(obj.qtdPresentes) || 0;
  obj.qtdPreLeos = parseInt(obj.qtdPreLeos) || 0;
  obj.qtdAmigosConselheiros = parseInt(obj.qtdAmigosConselheiros) || 0;
  obj.pessoasImpactadas = parseInt(obj.pessoasImpactadas) || 0;
  obj.custoCampanha = Number(obj.custoCampanha) || 0;
  obj.qtdLeoesParticipantes = parseInt(obj.qtdLeoesParticipantes) || 0;
  obj.horasPorPessoa = parseFloat(obj.horasPorPessoa) || 0;
  obj.horasTotais = parseFloat(obj.horasTotais) || 0;
  if (!obj.eixo && obj.eixoD8) obj.eixo = obj.eixoD8;
  if (!obj.eixo && obj.eixoDM) obj.eixo = obj.eixoDM;
  if (!obj.qtdLeoesParticipantes && obj.qtdPresentes) obj.qtdLeoesParticipantes = obj.qtdPresentes;
  obj.marcadoCorrigido = (obj.marcadoCorrigido === true) || (obj.marcadoCorrigido === 'Sim');
  obj.temParceria = (obj.temParceria === true) || (obj.temParceria === 'Sim');
  return obj;
}

async function portalBuscarAtividades(clubeNome) {
  const table = PORTAL_SUPABASE_TABLES.atividades;
  const clubeNomeLimpo = String(clubeNome || '').trim();
  if (!clubeNomeLimpo) return [];

  // Preferência por clube_id se existir na tabela `clubes`
  const clubesMap = (typeof obterMapaClubesSupabase === 'function') ? obterMapaClubesSupabase() : null;
  const clubeId = clubesMap ? clubesMap[clubeNomeLimpo] : null;

  let path = '';
  if (clubeId) {
    path = `${table}?clube_id=eq.${encodeURIComponent(clubeId)}&select=*&order=data_inicio.desc.nullslast,created_at.desc.nullslast`;
  } else {
    path = `${table}?clube_nome=eq.${encodeURIComponent(clubeNomeLimpo)}&select=*&order=data_inicio.desc.nullslast,created_at.desc.nullslast`;
  }

  const resp = await portalSupabaseFetch(path, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalBuscarAtividades erro:', resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  const atividades = (rows || []).map(portalNormalizeAtividadeRow).filter(Boolean);
  atividades.forEach(function(a) {
    if (!a.linkFotoOficial && a.id && a.clube && typeof obterUrlFotoPorRegistroId === 'function') {
      const url = obterUrlFotoPorRegistroId(a.id, a.clube, 'FOTOS_OFICIAIS_ATIVIDADES');
      if (url) a.linkFotoOficial = url;
    }
  });
  return atividades;
}

async function portalBuscarCampanhas(clubeNome) {
  const table = PORTAL_SUPABASE_TABLES.campanhas;
  const clubeNomeLimpo = String(clubeNome || '').trim();
  if (!clubeNomeLimpo) return [];

  const clubesMap = (typeof obterMapaClubesSupabase === 'function') ? obterMapaClubesSupabase() : null;
  const clubeId = clubesMap ? clubesMap[clubeNomeLimpo] : null;

  let path = '';
  if (clubeId) {
    path = `${table}?clube_id=eq.${encodeURIComponent(clubeId)}&select=*&order=data_inicio.desc.nullslast,created_at.desc.nullslast`;
  } else {
    path = `${table}?clube_nome=eq.${encodeURIComponent(clubeNomeLimpo)}&select=*&order=data_inicio.desc.nullslast,created_at.desc.nullslast`;
  }

  const resp = await portalSupabaseFetch(path, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalBuscarCampanhas erro:', resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  const campanhas = (rows || []).map(portalNormalizeCampanhaRow).filter(Boolean);
  campanhas.forEach(function(c) {
    if (!c.linkFotoOficial && c.id && c.clube && typeof obterUrlFotoPorRegistroId === 'function') {
      const url = obterUrlFotoPorRegistroId(c.id, c.clube, 'FOTOS_OFICIAIS');
      if (url) c.linkFotoOficial = url;
    }
  });
  return campanhas;
}

/**
 * Busca todas as linhas da tabela com paginação.
 * @param {string} table - Nome da tabela
 * @param {string|object} querySuffixOrOptions - Sufixo de query (ex: "order=id.asc") ou opções { querySuffix, selectColumns }.
 *   selectColumns: array de colunas (ex: ['id','titulo','clube_nome']) reduz payload e melhora desempenho.
 */
async function portalFetchAllRows(table, querySuffixOrOptions = '') {
  const pageSize = 1000;
  let offset = 0;
  let all = [];
  const opts = typeof querySuffixOrOptions === 'object' && querySuffixOrOptions !== null
    ? querySuffixOrOptions
    : { querySuffix: String(querySuffixOrOptions || '') };
  const suffix = opts.querySuffix ? `&${String(opts.querySuffix).replace(/^&/, '')}` : '';
  const selectClause = Array.isArray(opts.selectColumns) && opts.selectColumns.length > 0
    ? opts.selectColumns.map(function(c) { return encodeURIComponent(c); }).join(',')
    : '*';
  while (true) {
    const rangeStart = offset;
    const rangeEnd = offset + pageSize - 1;
    const resp = await portalSupabaseFetch(`${table}?select=${selectClause}${suffix}`, {
      method: 'GET',
      headers: {
        'Range-Unit': 'items',
        'Range': `${rangeStart}-${rangeEnd}`
      }
    });
    const code = resp.getResponseCode();
    if (code !== 200 && code !== 206) {
      console.error('portalFetchAllRows erro (' + table + '):', code, resp.getContentText());
      break;
    }
    const rows = JSON.parse(resp.getContentText() || '[]');
    all = all.concat(rows || []);
    if (!rows || rows.length < pageSize) {
      break;
    }
    offset += pageSize;
  }
  return all;
}

// Colunas mínimas para resumo/dashboard (menos payload, mais rápido). Tabela campanhas usa eixo_d8/eixo_dm, não "eixo".
var PORTAL_CAMPANHAS_SELECT_RESUMO = ['id', 'titulo', 'data_inicio', 'data_registro', 'eixo_d8', 'eixo_dm', 'pessoas_impactadas', 'clube_nome'];
var PORTAL_ATIVIDADES_SELECT_RESUMO = ['id', 'titulo', 'data_inicio', 'data_registro', 'tipo_atividade', 'qtd_associados_presentes', 'qtd_pre_leos_presentes', 'qtd_leo_leao_presentes', 'qtd_amigos_conselheiros_presentes', 'outros_lions', 'clube_nome'];

async function portalBuscarTodasAtividades(skipFotoResolution, minimalColumns) {
  const table = PORTAL_SUPABASE_TABLES.atividades;
  const options = minimalColumns ? { selectColumns: PORTAL_ATIVIDADES_SELECT_RESUMO } : {};
  const rows = await portalFetchAllRows(table, options);
  const atividades = (rows || []).map(portalNormalizeAtividadeRow).filter(Boolean);
  if (!skipFotoResolution) {
    atividades.forEach(function(a) {
      if (!a.linkFotoOficial && a.id && a.clube && typeof obterUrlFotoPorRegistroId === 'function') {
        const url = obterUrlFotoPorRegistroId(a.id, a.clube, 'FOTOS_OFICIAIS_ATIVIDADES');
        if (url) a.linkFotoOficial = url;
      }
    });
  }
  return atividades;
}

async function portalBuscarTodasCampanhas(skipFotoResolution, minimalColumns) {
  const table = PORTAL_SUPABASE_TABLES.campanhas;
  const options = minimalColumns ? { selectColumns: PORTAL_CAMPANHAS_SELECT_RESUMO } : {};
  const rows = await portalFetchAllRows(table, options);
  const campanhas = (rows || []).map(portalNormalizeCampanhaRow).filter(Boolean);
  if (!skipFotoResolution) {
    campanhas.forEach(function(c) {
      if (!c.linkFotoOficial && c.id && c.clube && typeof obterUrlFotoPorRegistroId === 'function') {
        const url = obterUrlFotoPorRegistroId(c.id, c.clube, 'FOTOS_OFICIAIS');
        if (url) c.linkFotoOficial = url;
      }
    });
  }
  return campanhas;
}

async function portalUpsertAtividade(atividade) {
  const table = PORTAL_SUPABASE_TABLES.atividades;
  const camelToSnake = {
    id: 'id',
    al: 'al',
    trimestre: 'trimestre',
    dataRegistro: 'data_registro',
    dataInicio: 'data_inicio',
    horaInicio: 'hora_inicio',
    dataFim: 'data_fim',
    horaFim: 'hora_fim',
    titulo: 'titulo',
    tipoAtividade: 'tipo_atividade',
    localAtividade: 'local_atividade',
    presentes: 'associados_presentes',
    qtdPresentes: 'qtd_associados_presentes',
    preLeos: 'pre_leos_presentes',
    qtdPreLeos: 'qtd_pre_leos_presentes',
    leoLeao: 'leo_leao_presentes',
    qtdLeoLeao: 'qtd_leo_leao_presentes',
    amigosConselheiros: 'amigos_conselheiros_presentes',
    qtdAmigosConselheiros: 'qtd_amigos_conselheiros_presentes',
    // Aliases se algum caller enviar nomes *Presentes (evita PGRST204)
    associadosPresentes: 'associados_presentes',
    preLeosPresentes: 'pre_leos_presentes',
    leoLeaoPresentes: 'leo_leao_presentes',
    amigosConselheirosPresentes: 'amigos_conselheiros_presentes',
    descricaoAtividade: 'descricao_atividade',
    outrosLions: 'outros_lions',
    descricaoTexto: 'descricao_atividade',
    linkFotoOficial: 'foto_oficial_url',
    duracaoTotal: 'duracao_total_minutos',
    comentarioDistrital: 'comentario_distrital',
    marcadoCorrigido: 'marcado_corrigido',
    quemCorrigiu: 'quem_corrigiu',
    clube: 'clube_nome',
    clubeId: 'clube_id'
  };

  // Sempre normalizar para colunas snake do PostgREST; chaves camel não mapeadas quebram o upsert (PGRST204).
  const payloadObj = portalToSnakeFromCamel(atividade, camelToSnake);
  delete payloadObj._idempotencyKey;
  delete payloadObj.idempotencyKey;

  if (!payloadObj.clube_id && typeof obterMapaClubesSupabase === 'function') {
    const clubesMap = obterMapaClubesSupabase();
    const nomeClube = atividade.clube || atividade.clubeNome || payloadObj.clube_nome || payloadObj.clubeNome;
    if (nomeClube) {
      const clubeId = clubesMap[String(nomeClube).trim()];
      if (clubeId) payloadObj.clube_id = clubeId;
    }
  }

  // garantir id
  if (!payloadObj.id) payloadObj.id = atividade.id;

  const resp = await portalSupabaseFetch(`${table}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    payload: JSON.stringify([payloadObj])
  });
  if (resp.getResponseCode() !== 201 && resp.getResponseCode() !== 200) {
    throw new Error(`Supabase upsert atividade falhou: ${resp.getResponseCode()} ${resp.getContentText()}`);
  }
  const arr = JSON.parse(resp.getContentText() || '[]');
  return arr && arr[0] ? portalNormalizeAtividadeRow(arr[0]) : portalNormalizeAtividadeRow(payloadObj);
}

async function portalDeleteAtividade(id) {
  const table = PORTAL_SUPABASE_TABLES.atividades;
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(id))}`, { method: 'DELETE' });
  if (resp.getResponseCode() !== 204 && resp.getResponseCode() !== 200) {
    throw new Error(`Supabase delete atividade falhou: ${resp.getResponseCode()} ${resp.getContentText()}`);
  }
  return true;
}

async function portalUpsertCampanha(campanha) {
  const table = PORTAL_SUPABASE_TABLES.campanhas;
  const style = await portalDetectTableStyle(table);
  const camelToSnake = {
    dataRegistro: 'data_registro',
    dataInicio: 'data_inicio',
    dataFim: 'data_fim',
    membrosComissao: 'membros_comissao',
    associadosPresentes: 'associados_presentes',
    qtdPresentes: 'qtd_associados_presentes',
    preLeoPresentes: 'pre_leo_presentes',
    qtdPreLeos: 'qtd_pre_leo_presentes',
    amigosConselheiros: 'amigos_conselheiros_presentes',
    amigosConselheirosPresentes: 'amigos_conselheiros_presentes',
    qtdAmigosConselheiros: 'qtd_amigos_conselheiros_presentes',
    pessoasImpactadas: 'pessoas_impactadas',
    custoCampanha: 'custo_campanha',
    qtdLeoesParticipantes: 'companheiros_leoes_presentes',
    companheirosLeoesParticipantes: 'companheiros_leoes_presentes',
    companheirosLeoesPresentes: 'companheiros_leoes_presentes',
    horasPorPessoa: 'horas_trabalhadas_por_pessoa',
    horasTotais: 'horas_totais_trabalhadas',
    descricaoTexto: 'descricao_campanha',
    eixo: 'eixo_d8',
    eixoDM: 'eixo_dm',
    linkFotoOficial: 'foto_oficial_url',
    linkVideo: 'video_url',
    linkOutrasFotos: 'outras_fotos_url',
    descricaoHTML: 'descricao_html',
    temParceria: 'tem_parceria',
    entidadeParceira: 'entidade_parceira',
    tipoParceria: 'tipo_parceria',
    descricaoParceria: 'descricao_parceria',
    comentarioDistrital: 'comentario_distrital',
    marcadoCorrigido: 'marcado_corrigido',
    quemCorrigiu: 'quem_corrigiu',
    pontosMelhorar: 'pontos_melhorar',
    clube: 'clube_nome',
    clubeId: 'clube_id',
    localRealizacao: 'localRealizacao',
    divulgacao: 'divulgacao',
    feedback: 'feedback',
    coordenador: 'coordenador',
    objetivo: 'objetivo',
    comissao: 'comissao',
    idUnicoOriginal: 'id_unico_original',
    linhaOriginal: 'linha_original'
  };

  const payloadObj = (style === 'snake')
    ? portalToSnakeFromCamel(campanha, camelToSnake)
    : Object.assign({}, campanha);

  // Chaves só para lock/idempotência no GAS (code.js) — não existem na tabela campanhas
  delete payloadObj._idempotencyKey;
  delete payloadObj.idempotencyKey;

  if (!payloadObj.id) payloadObj.id = campanha.id;

  // Garantir clube_id para o dashboard do clube (igual ao upsert de atividades)
  if (!payloadObj.clube_id && typeof obterMapaClubesSupabase === 'function') {
    var clubesMapCampanha = obterMapaClubesSupabase();
    var nomeClubeCampanha = campanha.clube || campanha.clubeNome || payloadObj.clube_nome || payloadObj.clubeNome;
    if (nomeClubeCampanha) {
      var clubeIdResolvido = clubesMapCampanha[String(nomeClubeCampanha).trim()];
      if (clubeIdResolvido) payloadObj.clube_id = clubeIdResolvido;
    }
  }
  if (!payloadObj.clube_id && (payloadObj.clube_nome || campanha.clube) && typeof portalResolverClubeIdPorNome === 'function') {
    var nomeParaResolver = payloadObj.clube_nome || campanha.clube || '';
    var clubeIdFallback = await portalResolverClubeIdPorNome(nomeParaResolver);
    if (clubeIdFallback) payloadObj.clube_id = clubeIdFallback;
  }

  const resp = await portalSupabaseFetch(`${table}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    payload: JSON.stringify([payloadObj])
  });
  if (resp.getResponseCode() !== 201 && resp.getResponseCode() !== 200) {
    throw new Error(`Supabase upsert campanha falhou: ${resp.getResponseCode()} ${resp.getContentText()}`);
  }
  const arr = JSON.parse(resp.getContentText() || '[]');
  return arr && arr[0] ? portalNormalizeCampanhaRow(arr[0]) : portalNormalizeCampanhaRow(payloadObj);
}

/**
 * Lê outras_fotos_url direto do Supabase (evita cache desatualizado de getCampanhasDoClube).
 */
async function portalFetchCampanhaOutrasFotosUrl(campanhaId) {
  try {
    const table = PORTAL_SUPABASE_TABLES.campanhas;
    const id = String(campanhaId || '').trim();
    if (!id) return '';
    const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(id)}&select=outras_fotos_url`, { method: 'GET' });
    if (resp.getResponseCode() !== 200) return '';
    const rows = JSON.parse(resp.getContentText() || '[]');
    const row = rows && rows[0];
    if (!row) return '';
    return String(row.outras_fotos_url || '').trim();
  } catch (e) {
    console.error('portalFetchCampanhaOutrasFotosUrl:', e);
    return '';
  }
}

/**
 * Atualiza só a coluna outras_fotos_url (PATCH). Mais confiável que upsert parcial para múltiplas URLs.
 */
async function portalPatchCampanhaOutrasFotosUrl(campanhaId, outrasFotosCsv) {
  const table = PORTAL_SUPABASE_TABLES.campanhas;
  const id = String(campanhaId || '').trim();
  if (!id) throw new Error('ID da campanha ausente para gravar outras fotos.');
  const body = { outras_fotos_url: outrasFotosCsv == null ? '' : String(outrasFotosCsv) };
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    payload: JSON.stringify(body)
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`Atualizar outras fotos no banco falhou (${code}): ${resp.getContentText()}`);
  }
}

/**
 * PATCH só em foto_oficial_url — evita upsert parcial que zera titulo (NOT NULL).
 */
async function portalPatchCampanhaFotoOficialUrl(campanhaId, fotoUrl) {
  const table = PORTAL_SUPABASE_TABLES.campanhas;
  const id = String(campanhaId || '').trim();
  if (!id) throw new Error('ID da campanha ausente para gravar foto oficial.');
  const body = { foto_oficial_url: fotoUrl == null ? '' : String(fotoUrl) };
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    payload: JSON.stringify(body)
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`Atualizar foto oficial no banco falhou (${code}): ${resp.getContentText()}`);
  }
}

/**
 * PATCH só em video_url na campanha.
 */
async function portalPatchCampanhaVideoUrl(campanhaId, videoUrl) {
  const table = PORTAL_SUPABASE_TABLES.campanhas;
  const id = String(campanhaId || '').trim();
  if (!id) throw new Error('ID da campanha ausente para gravar vídeo.');
  const body = { video_url: videoUrl == null ? '' : String(videoUrl) };
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    payload: JSON.stringify(body)
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`Atualizar vídeo no banco falhou (${code}): ${resp.getContentText()}`);
  }
}

/**
 * PATCH só em foto_oficial_url na atividade (mesmo motivo: NOT NULL em outros campos).
 */
async function portalPatchAtividadeFotoOficialUrl(atividadeId, fotoUrl) {
  const table = PORTAL_SUPABASE_TABLES.atividades;
  const id = String(atividadeId || '').trim();
  if (!id) throw new Error('ID da atividade ausente para gravar foto oficial.');
  const body = { foto_oficial_url: fotoUrl == null ? '' : String(fotoUrl) };
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    payload: JSON.stringify(body)
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`Atualizar foto da atividade no banco falhou (${code}): ${resp.getContentText()}`);
  }
}

async function portalDeleteCampanha(id) {
  const table = PORTAL_SUPABASE_TABLES.campanhas;
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(id))}`, { method: 'DELETE' });
  if (resp.getResponseCode() !== 204 && resp.getResponseCode() !== 200) {
    throw new Error(`Supabase delete campanha falhou: ${resp.getResponseCode()} ${resp.getContentText()}`);
  }
  return true;
}

async function portalDiagnosticoSupabasePortal() {
  const fetchCount = async (path) => {
    const resp = await portalSupabaseFetch(`${path}`, { method: 'GET', headers: { Prefer: 'count=exact' } });
    return {
      code: resp.getResponseCode(),
      count: Number(resp.getHeaders()['Content-Range'] ? String(resp.getHeaders()['Content-Range']).split('/')[1] : 0) || null,
      bodySample: (() => { try { return JSON.parse(resp.getContentText() || '[]')[0] || null; } catch (e) { return null; } })()
    };
  };
  const [clubes, campanhas, atividades, styleCampanhas, styleAtividades] = await Promise.all([
    fetchCount('clubes?select=id'),
    fetchCount(`${PORTAL_SUPABASE_TABLES.campanhas}?select=id`),
    fetchCount(`${PORTAL_SUPABASE_TABLES.atividades}?select=id`),
    portalDetectTableStyle(PORTAL_SUPABASE_TABLES.campanhas),
    portalDetectTableStyle(PORTAL_SUPABASE_TABLES.atividades)
  ]);
  return {
    ok: true,
    clubes,
    campanhas,
    atividades,
    tableStyle: { campanhas: styleCampanhas, atividades: styleAtividades }
  };
}

// === EVENTOS (SUPABASE) ===
function portalNormalizeEventoRow(row) {
  if (!row) return null;
  const snakeToCamel = {
    id: 'id',
    nome: 'nome',
    clube_sede_id: 'clubeSedeId',
    clubeSedeId: 'clubeSedeId',
    clube_sede_nome: 'clubeSedeNome',
    clubeSedeNome: 'clubeSedeNome',
    data_evento: 'dataEvento',
    dataEvento: 'dataEvento',
    data_inicio: 'dataInicio',
    dataInicio: 'dataInicio',
    data_fim: 'dataFim',
    dataFim: 'dataFim',
    pix_key: 'pixKey',
    pixKey: 'pixKey',
    beneficiario: 'beneficiario',
    banco: 'banco',
    conta_corrente: 'contaCorrente',
    contaCorrente: 'contaCorrente',
    agencia: 'agencia',
    aceitar_trocas: 'aceitarTrocas',
    aceitarTrocas: 'aceitarTrocas',
    formulario_convidados_habilitado: 'formularioConvidadosHabilitado',
    formularioConvidadosHabilitado: 'formularioConvidadosHabilitado',
    evento_tera_passaportes: 'eventoTeraPassaportes',
    eventoTeraPassaportes: 'eventoTeraPassaportes',
    enviar_passaporte_por_email: 'enviarPassaportePorEmail',
    enviarPassaportePorEmail: 'enviarPassaportePorEmail',
    descricao: 'descricao',
    foto_url: 'fotoUrl',
    fotoUrl: 'fotoUrl',
    data_corte_competidores: 'dataCorteCompetidores',
    dataCorteCompetidores: 'dataCorteCompetidores',
    created_at: 'createdAt',
    updated_at: 'updatedAt'
  };
  const obj = portalToCamelFromSnake(row, snakeToCamel);
  if (obj.dataCorteCompetidores && typeof obj.dataCorteCompetidores === 'string') {
    try { obj.dataCorteCompetidores = obj.dataCorteCompetidores.split('T')[0]; } catch (e) {}
  }
  if (obj.dataEvento && typeof obj.dataEvento === 'string' && !obj.dataEvento.includes('T')) {
    try { obj.dataEvento = new Date(obj.dataEvento).toISOString(); } catch (e) {}
  }
  if (obj.dataInicio && typeof obj.dataInicio === 'string' && !obj.dataInicio.includes('T')) {
    try { obj.dataInicio = new Date(obj.dataInicio).toISOString(); } catch (e) {}
  }
  if (obj.dataFim && typeof obj.dataFim === 'string' && !obj.dataFim.includes('T')) {
    try { obj.dataFim = new Date(obj.dataFim).toISOString(); } catch (e) {}
  }
  if (!obj.nome) obj.nome = '';
  if (!obj.clubeSedeNome) obj.clubeSedeNome = '';
  if (!obj.descricao) obj.descricao = '';
  if (!obj.pixKey) obj.pixKey = '';
  if (!obj.beneficiario) obj.beneficiario = '';
  if (!obj.banco) obj.banco = '';
  if (!obj.contaCorrente) obj.contaCorrente = '';
  if (!obj.agencia) obj.agencia = '';
  if (!obj.fotoUrl) obj.fotoUrl = '';
  obj.aceitarTrocas = (obj.aceitarTrocas === true) || (obj.aceitarTrocas === 'true') || (obj.aceitarTrocas === 'Sim');
  obj.formularioConvidadosHabilitado = (obj.formularioConvidadosHabilitado === true) || (obj.formularioConvidadosHabilitado === 'true');
  obj.eventoTeraPassaportes = (obj.eventoTeraPassaportes === true) || (obj.eventoTeraPassaportes === 'true') || (obj.eventoTeraPassaportes === 'Sim');
  obj.enviarPassaportePorEmail = (obj.enviarPassaportePorEmail === true) || (obj.enviarPassaportePorEmail === 'true') || (obj.enviarPassaportePorEmail === 'Sim');
  return obj;
}

/** Instantâneo do lote (timestamptz) parseado para ms, ou null. */
function portalParseLoteInstanteMs(val) {
  if (val === null || val === undefined || val === '') return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.getTime();
}

/**
 * Lote dentro da janela [data_inicio, data_fim] nos instantes gravados (timestamptz).
 * Limites inclusivos. null em dataInicio/dataFim = sem limite naquele lado.
 */
function portalLoteDentroVigencia(lote, instanteMs) {
  if (!lote) return false;
  const t = instanteMs != null && instanteMs !== undefined ? instanteMs : Date.now();
  const ini = portalParseLoteInstanteMs(lote.dataInicio);
  const fim = portalParseLoteInstanteMs(lote.dataFim);
  if (ini != null && t < ini) return false;
  if (fim != null && t > fim) return false;
  return true;
}

function portalNormalizeEventoLoteRow(row) {
  if (!row) return null;
  const snakeToCamel = {
    id: 'id',
    evento_id: 'eventoId',
    eventoId: 'eventoId',
    nome_lote: 'nomeLote',
    nomeLote: 'nomeLote',
    ordem: 'ordem',
    quantidade_total: 'quantidadeTotal',
    quantidadeTotal: 'quantidadeTotal',
    quantidade_usada: 'quantidadeUsada',
    quantidadeUsada: 'quantidadeUsada',
    valor: 'valor',
    ativo: 'ativo',
    data_inicio: 'dataInicio',
    dataInicio: 'dataInicio',
    data_fim: 'dataFim',
    dataFim: 'dataFim',
    created_at: 'createdAt',
    updated_at: 'updatedAt'
  };
  const obj = portalToCamelFromSnake(row, snakeToCamel);
  obj.quantidadeTotal = (obj.quantidadeTotal !== null && obj.quantidadeTotal !== undefined) ? parseInt(obj.quantidadeTotal) || 0 : 0;
  obj.quantidadeUsada = (obj.quantidadeUsada !== null && obj.quantidadeUsada !== undefined) ? parseInt(obj.quantidadeUsada) || 0 : 0;
  obj.valor = (obj.valor !== null && obj.valor !== undefined) ? Number(obj.valor) || 0 : 0;
  obj.ordem = (obj.ordem !== null && obj.ordem !== undefined) ? parseInt(obj.ordem) || 0 : 0;
  obj.ativo = (obj.ativo === true) || (obj.ativo === 'true') || (obj.ativo === 'Sim');
  if (!obj.nomeLote) obj.nomeLote = '';
  if (obj.dataInicio === undefined) obj.dataInicio = null;
  if (obj.dataFim === undefined) obj.dataFim = null;
  return obj;
}

function portalNormalizeEventoInscricaoRow(row) {
  if (!row) return null;
  const snakeToCamel = {
    id: 'id',
    evento_id: 'eventoId',
    eventoId: 'eventoId',
    clube_id: 'clubeId',
    clubeId: 'clubeId',
    clube_nome: 'clubeNome',
    clubeNome: 'clubeNome',
    clube_origem_nome: 'clubeOrigemNome',
    clubeOrigemNome: 'clubeOrigemNome',
    envio_id: 'envioId',
    envioId: 'envioId',
    pessoa_nome: 'pessoaNome',
    pessoaNome: 'pessoaNome',
    pessoa_tipo: 'pessoaTipo',
    pessoaTipo: 'pessoaTipo',
    tipo_inscricao: 'tipoInscricao',
    tipoInscricao: 'tipoInscricao',
    lote_id: 'loteId',
    loteId: 'loteId',
    lote_nome: 'loteNome',
    loteNome: 'loteNome',
    valor_lote: 'valorLote',
    valorLote: 'valorLote',
    restricao_alimentar: 'restricaoAlimentar',
    restricaoAlimentar: 'restricaoAlimentar',
    restricao_descricao: 'restricaoDescricao',
    restricaoDescricao: 'restricaoDescricao',
    comprovante_url: 'comprovanteUrl',
    comprovanteUrl: 'comprovanteUrl',
    comprovante_nome: 'comprovanteNome',
    comprovanteNome: 'comprovanteNome',
    comprovante_mime: 'comprovanteMime',
    comprovanteMime: 'comprovanteMime',
    comprovante_tamanho: 'comprovanteTamanho',
    comprovanteTamanho: 'comprovanteTamanho',
    status: 'status',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
    refeicoes_carga: 'refeicoesCarga',
    refeicoesCarga: 'refeicoesCarga',
    refeicoes_usado: 'refeicoesUsado',
    refeicoesUsado: 'refeicoesUsado'
  };
  const obj = portalToCamelFromSnake(row, snakeToCamel);
  obj.valorLote = (obj.valorLote !== null && obj.valorLote !== undefined) ? Number(obj.valorLote) || 0 : 0;
  obj.restricaoAlimentar = (obj.restricaoAlimentar === true) || (obj.restricaoAlimentar === 'true') || (obj.restricaoAlimentar === 'Sim');
  if (!obj.pessoaNome) obj.pessoaNome = '';
  if (!obj.clubeNome) obj.clubeNome = '';
  if (!obj.clubeOrigemNome) obj.clubeOrigemNome = '';
  if (!obj.tipoInscricao) obj.tipoInscricao = '';
  if (!obj.restricaoDescricao) obj.restricaoDescricao = '';
  if (!obj.loteNome) obj.loteNome = '';
  if (!obj.comprovanteUrl) obj.comprovanteUrl = '';
  if (!obj.comprovanteNome) obj.comprovanteNome = '';
  if (!obj.comprovanteMime) obj.comprovanteMime = '';
  obj.comprovanteTamanho = (obj.comprovanteTamanho !== null && obj.comprovanteTamanho !== undefined) ? parseInt(obj.comprovanteTamanho) || 0 : 0;
  // Passaporte refeições: garantir objeto
  try {
    obj.refeicoesCarga = (typeof obj.refeicoesCarga === 'object' && obj.refeicoesCarga !== null) ? obj.refeicoesCarga : (typeof obj.refeicoesCarga === 'string' && obj.refeicoesCarga ? JSON.parse(obj.refeicoesCarga) : {});
  } catch (e) { obj.refeicoesCarga = {}; }
  try {
    obj.refeicoesUsado = (typeof obj.refeicoesUsado === 'object' && obj.refeicoesUsado !== null) ? obj.refeicoesUsado : (typeof obj.refeicoesUsado === 'string' && obj.refeicoesUsado ? JSON.parse(obj.refeicoesUsado) : {});
  } catch (e) { obj.refeicoesUsado = {}; }
  obj.status = (row.status || row.Status || obj.status || 'realizada');
  return obj;
}

function portalNormalizeEventoEnvioRow(row) {
  if (!row) return null;
  const snakeToCamel = {
    id: 'id',
    evento_id: 'eventoId',
    eventoId: 'eventoId',
    clube_id: 'clubeId',
    clubeId: 'clubeId',
    clube_nome: 'clubeNome',
    clubeNome: 'clubeNome',
    created_at: 'createdAt',
    updated_at: 'updatedAt'
  };
  const obj = portalToCamelFromSnake(row, snakeToCamel);
  if (!obj.clubeNome) obj.clubeNome = '';
  return obj;
}

function portalNormalizeEventoComprovanteRow(row) {
  if (!row) return null;
  const snakeToCamel = {
    id: 'id',
    envio_id: 'envioId',
    envioId: 'envioId',
    comprovante_url: 'comprovanteUrl',
    comprovanteUrl: 'comprovanteUrl',
    comprovante_nome: 'comprovanteNome',
    comprovanteNome: 'comprovanteNome',
    comprovante_mime: 'comprovanteMime',
    comprovanteMime: 'comprovanteMime',
    comprovante_tamanho: 'comprovanteTamanho',
    comprovanteTamanho: 'comprovanteTamanho',
    valor: 'valor',
    created_at: 'createdAt'
  };
  const obj = portalToCamelFromSnake(row, snakeToCamel);
  if (!obj.comprovanteUrl) obj.comprovanteUrl = '';
  if (!obj.comprovanteNome) obj.comprovanteNome = '';
  if (!obj.comprovanteMime) obj.comprovanteMime = '';
  obj.comprovanteTamanho = (obj.comprovanteTamanho !== null && obj.comprovanteTamanho !== undefined) ? parseInt(obj.comprovanteTamanho) || 0 : 0;
  obj.valor = (obj.valor !== null && obj.valor !== undefined) ? Number(obj.valor) || 0 : 0;
  return obj;
}

async function portalListarEventos() {
  const table = PORTAL_SUPABASE_TABLES.eventos;
  const resp = await portalSupabaseFetch(`${table}?select=*&order=data_inicio.asc.nullslast,data_evento.asc.nullslast,created_at.desc`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalListarEventos erro:', resp.getResponseCode(), resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(portalNormalizeEventoRow).filter(Boolean);
}

async function portalCriarEvento(evento) {
  const table = PORTAL_SUPABASE_TABLES.eventos;
  const style = await portalDetectTableStyle(table);
  const camelToSnake = {
    clubeSedeId: 'clube_sede_id',
    clubeSedeNome: 'clube_sede_nome',
    dataEvento: 'data_evento',
    dataInicio: 'data_inicio',
    dataFim: 'data_fim',
    pixKey: 'pix_key',
    contaCorrente: 'conta_corrente',
    aceitarTrocas: 'aceitar_trocas',
    formularioConvidadosHabilitado: 'formulario_convidados_habilitado',
    eventoTeraPassaportes: 'evento_tera_passaportes',
    enviarPassaportePorEmail: 'enviar_passaporte_por_email',
    fotoUrl: 'foto_url',
    dataCorteCompetidores: 'data_corte_competidores'
  };
  const payloadObj = (style === 'snake' || style === 'unknown')
    ? portalToSnakeFromCamel(evento, camelToSnake)
    : Object.assign({}, evento);
  if (!payloadObj.id) payloadObj.id = evento.id;
  if (!payloadObj.data_inicio && (payloadObj.data_evento || evento.dataEvento)) {
    payloadObj.data_inicio = payloadObj.data_evento || evento.dataEvento;
  }
  const clubeNome = payloadObj.clube_sede_nome || evento.clubeSedeNome || '';
  if (clubeNome && typeof obterMapaClubesSupabase === 'function') {
    const clubesMap = obterMapaClubesSupabase();
    const clubeId = clubesMap[clubeNome.trim()];
    if (clubeId) payloadObj.clube_sede_id = clubeId;
  }
  const resp = await portalSupabaseFetch(`${table}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    payload: JSON.stringify([payloadObj])
  });
  if (resp.getResponseCode() !== 201 && resp.getResponseCode() !== 200) {
    throw new Error(`Supabase criar evento falhou: ${resp.getResponseCode()} ${resp.getContentText()}`);
  }
  const arr = JSON.parse(resp.getContentText() || '[]');
  return arr && arr[0] ? portalNormalizeEventoRow(arr[0]) : portalNormalizeEventoRow(payloadObj);
}

async function portalAtualizarEvento(eventoId, dados) {
  const table = PORTAL_SUPABASE_TABLES.eventos;
  if (!eventoId) throw new Error('Evento não informado');
  const style = await portalDetectTableStyle(table);
  const camelToSnake = {
    clubeSedeId: 'clube_sede_id',
    clubeSedeNome: 'clube_sede_nome',
    dataEvento: 'data_evento',
    dataInicio: 'data_inicio',
    dataFim: 'data_fim',
    pixKey: 'pix_key',
    contaCorrente: 'conta_corrente',
    aceitarTrocas: 'aceitar_trocas',
    formularioConvidadosHabilitado: 'formulario_convidados_habilitado',
    eventoTeraPassaportes: 'evento_tera_passaportes',
    enviarPassaportePorEmail: 'enviar_passaporte_por_email',
    fotoUrl: 'foto_url',
    dataCorteCompetidores: 'data_corte_competidores'
  };
  const payloadObj = (style === 'snake' || style === 'unknown')
    ? portalToSnakeFromCamel(dados || {}, camelToSnake)
    : Object.assign({}, dados || {});
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(eventoId))}`, {
    method: 'PATCH',
    payload: JSON.stringify(payloadObj)
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`Supabase atualizar evento falhou: ${code} ${resp.getContentText()}`);
  }
  return true;
}

async function portalListarLotesEvento(eventoId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_lotes;
  const resp = await portalSupabaseFetch(`${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}&select=*&order=ordem.asc.nullslast,created_at.asc`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalListarLotesEvento erro:', resp.getResponseCode(), resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(portalNormalizeEventoLoteRow).filter(Boolean);
}

async function portalCriarLoteEvento(dados) {
  const table = PORTAL_SUPABASE_TABLES.eventos_lotes;
  const style = await portalDetectTableStyle(table);
  const camelToSnake = {
    eventoId: 'evento_id',
    nomeLote: 'nome_lote',
    quantidadeTotal: 'quantidade_total',
    quantidadeUsada: 'quantidade_usada',
    dataInicio: 'data_inicio',
    dataFim: 'data_fim'
  };
  const payloadObj = (style === 'snake' || style === 'unknown')
    ? portalToSnakeFromCamel(dados, camelToSnake)
    : Object.assign({}, dados);
  if (!payloadObj.evento_id && dados.eventoId) payloadObj.evento_id = dados.eventoId;
  if (dados.dataInicio !== undefined) payloadObj.data_inicio = dados.dataInicio;
  if (dados.dataFim !== undefined) payloadObj.data_fim = dados.dataFim;
  if (!payloadObj.ordem) {
    const lotes = await portalListarLotesEvento(payloadObj.evento_id);
    const maxOrdem = lotes.reduce((acc, lote) => Math.max(acc, lote.ordem || 0), 0);
    payloadObj.ordem = maxOrdem + 1;
  }
  if (payloadObj.quantidade_usada === undefined || payloadObj.quantidade_usada === null) {
    payloadObj.quantidade_usada = 0;
  }
  const iniVal = payloadObj.data_inicio !== undefined ? payloadObj.data_inicio : dados.dataInicio;
  const fimVal = payloadObj.data_fim !== undefined ? payloadObj.data_fim : dados.dataFim;
  const iniM = portalParseLoteInstanteMs(iniVal);
  const fimM = portalParseLoteInstanteMs(fimVal);
  if (iniM != null && fimM != null && iniM > fimM) {
    throw new Error('Data início da vigência não pode ser posterior à data fim.');
  }
  const resp = await portalSupabaseFetch(`${table}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    payload: JSON.stringify([payloadObj])
  });
  if (resp.getResponseCode() !== 201 && resp.getResponseCode() !== 200) {
    throw new Error(`Supabase criar lote falhou: ${resp.getResponseCode()} ${resp.getContentText()}`);
  }
  const arr = JSON.parse(resp.getContentText() || '[]');
  return arr && arr[0] ? portalNormalizeEventoLoteRow(arr[0]) : portalNormalizeEventoLoteRow(payloadObj);
}

async function portalAtualizarLoteEvento(loteId, dados) {
  const table = PORTAL_SUPABASE_TABLES.eventos_lotes;
  const updateData = {};
  if (dados.nomeLote !== undefined) updateData.nome_lote = dados.nomeLote;
  if (dados.ordem !== undefined) updateData.ordem = dados.ordem;
  if (dados.quantidadeTotal !== undefined) updateData.quantidade_total = dados.quantidadeTotal;
  if (dados.quantidadeUsada !== undefined) updateData.quantidade_usada = dados.quantidadeUsada;
  if (dados.valor !== undefined) updateData.valor = dados.valor;
  if (dados.ativo !== undefined) updateData.ativo = dados.ativo;
  if (Object.prototype.hasOwnProperty.call(dados, 'dataInicio')) updateData.data_inicio = dados.dataInicio;
  if (Object.prototype.hasOwnProperty.call(dados, 'dataFim')) updateData.data_fim = dados.dataFim;
  const loteAntes = await portalBuscarLoteEventoPorId(loteId);
  if (loteAntes) {
    const iniEf = Object.prototype.hasOwnProperty.call(dados, 'dataInicio') ? dados.dataInicio : loteAntes.dataInicio;
    const fimEf = Object.prototype.hasOwnProperty.call(dados, 'dataFim') ? dados.dataFim : loteAntes.dataFim;
    const iM = portalParseLoteInstanteMs(iniEf);
    const fM = portalParseLoteInstanteMs(fimEf);
    if (iM != null && fM != null && iM > fM) {
      throw new Error('Data início da vigência não pode ser posterior à data fim.');
    }
  }
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(loteId))}`, {
    method: 'PATCH',
    payload: JSON.stringify(updateData)
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`Supabase atualizar lote falhou: ${code} ${resp.getContentText()}`);
  }
  return true;
}

async function portalExcluirLoteEvento(loteId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_lotes;
  if (!loteId) {
    throw new Error('ID do lote não informado.');
  }
  const inscricoesNoLote = await portalContarInscricoesPorLote(loteId);
  if (inscricoesNoLote > 0) {
    throw new Error('Não é possível excluir lote com inscrições. Este lote possui ' + inscricoesNoLote + ' inscrição(ões). Transfira ou cancele as inscrições antes de excluir.');
  }
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(loteId))}`, { method: 'DELETE' });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error('Falha ao excluir lote: ' + (resp.getContentText() || code));
  }
  return true;
}

async function portalObterLoteAtualEvento(eventoId) {
  const agora = Date.now();
  const lotes = await portalListarLotesEvento(eventoId);
  const loteAtual = lotes.find(lote => {
    const restantes = (lote.quantidadeTotal || 0) - (lote.quantidadeUsada || 0);
    return (lote.ativo !== false) && restantes > 0 && portalLoteDentroVigencia(lote, agora);
  });
  return loteAtual || null;
}

async function portalObterLoteAtualEventoReal(eventoId) {
  const agora = Date.now();
  const lotes = await portalListarLotesEvento(eventoId) || [];
  for (const lote of lotes) {
    if (lote.ativo === false) continue;
    if (!portalLoteDentroVigencia(lote, agora)) continue;
    const usados = await portalContarInscricoesPorLote(lote.id);
    const restantes = (lote.quantidadeTotal || 0) - usados;
    if (restantes > 0) {
      const loteAtualizado = Object.assign({}, lote, { quantidadeUsada: usados });
      return loteAtualizado;
    }
  }
  return null;
}

async function portalBuscarLoteEventoPorId(loteId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_lotes;
  if (!loteId) return null;
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(loteId))}&select=*`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalBuscarLoteEventoPorId erro:', resp.getResponseCode(), resp.getContentText());
    return null;
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  const row = rows && rows[0] ? rows[0] : null;
  return row ? portalNormalizeEventoLoteRow(row) : null;
}

async function portalContarInscricoesPorLote(loteId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  if (!loteId) return 0;
  // Contar apenas inscrições realizadas (status realizada ou null); pendentes/canceladas não consomem vaga
  const resp = await portalSupabaseFetch(`${table}?lote_id=eq.${encodeURIComponent(String(loteId))}&or=(status.eq.realizada,status.is.null)&select=id`, {
    method: 'GET',
    headers: { Prefer: 'count=exact', Range: '0-0' }
  });
  if (resp.getResponseCode() !== 200 && resp.getResponseCode() !== 206) {
    console.error('portalContarInscricoesPorLote erro:', resp.getResponseCode(), resp.getContentText());
    return 0;
  }
  const contentRange = resp.getHeaders() && resp.getHeaders()['Content-Range'];
  if (contentRange && String(contentRange).indexOf('/') >= 0) {
    const total = parseInt(String(contentRange).split('/')[1], 10);
    if (!isNaN(total) && total >= 0) return total;
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * Retorna mapa de contagem de inscrições por lote em uma única requisição.
 * @param {string[]} loteIds - Array de IDs de lotes
 * @returns {Object.<string,number>} Mapa { loteId: quantidade }
 */
async function portalContarInscricoesMultiplosLotes(loteIds) {
  var resultado = {};
  (loteIds || []).forEach(function(id) { resultado[String(id)] = 0; });
  if (!loteIds || loteIds.length === 0) return resultado;
  await Promise.all((loteIds || []).map(async function(lid) {
    resultado[String(lid)] = await portalContarInscricoesPorLote(lid);
  }));
  return resultado;
}

async function portalRecalcularQuantidadeUsadaLote(loteId) {
  if (!loteId) return null;
  const [quantidadeUsada, loteAtual] = await Promise.all([
    await portalContarInscricoesPorLote(loteId),
    await portalBuscarLoteEventoPorId(loteId)
  ]);
  const update = { quantidadeUsada: quantidadeUsada };
  if (loteAtual && loteAtual.quantidadeTotal !== null && loteAtual.quantidadeTotal !== undefined) {
    const restantes = (loteAtual.quantidadeTotal || 0) - quantidadeUsada;
    if (restantes <= 0) {
      update.ativo = false;
    }
  }
  await portalAtualizarLoteEvento(loteId, update);
  return update;
}

async function portalCriarInscricaoEvento(dados) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  if (!dados || !dados.eventoId || !dados.pessoaNome || !dados.clubeNome) {
    throw new Error('Dados obrigatórios não informados para inscrição');
  }
  const pessoaNomeLimpo = String(dados.pessoaNome || '').trim();
  const eventoId = String(dados.eventoId || '').trim();
  if (!pessoaNomeLimpo || !eventoId) {
    throw new Error('Evento e pessoa são obrigatórios');
  }
  if (!dados.envioId) {
    const envioCriado = await portalCriarEnvioEvento({
      eventoId: dados.eventoId,
      clubeNome: dados.clubeNome,
      clubeId: dados.clubeId || null
    });
    if (envioCriado && envioCriado.id) {
      dados.envioId = envioCriado.id;
    }
  }
  if (!dados.envioId) {
    throw new Error('Envio não foi criado para a inscrição.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Evitar inscrições duplicadas da mesma pessoa no mesmo evento
    const dupResp = await portalSupabaseFetch(
      `${table}?select=id&evento_id=eq.${encodeURIComponent(eventoId)}&pessoa_nome=eq.${encodeURIComponent(pessoaNomeLimpo)}`,
      { method: 'GET' }
    );
    if (dupResp.getResponseCode() === 200) {
      const dupRows = JSON.parse(dupResp.getContentText() || '[]');
      if (dupRows && dupRows.length > 0) {
        throw new Error('Essa pessoa já está inscrita neste evento.');
      }
    }

    const ehPendente = dados.status === 'pendente';
    let loteAtual = null;
    if (ehPendente && dados.loteId) {
      loteAtual = await portalBuscarLoteEventoPorId(dados.loteId);
      if (!loteAtual) loteAtual = { id: dados.loteId, nomeLote: dados.tipoInscricao || '', valor: 0 };
    } else if (!ehPendente) {
      if (dados.loteId) {
        const lotes = await portalListarLotesEvento(dados.eventoId);
        loteAtual = lotes.find(l => String(l.id) === String(dados.loteId)) || null;
        if (!loteAtual) {
          throw new Error('Lote selecionado não encontrado');
        }
        const usadosReais = await portalContarInscricoesPorLote(loteAtual.id);
        loteAtual.quantidadeUsada = usadosReais;
        const restantes = (loteAtual.quantidadeTotal || 0) - usadosReais;
        if (loteAtual.ativo === false || restantes <= 0) {
          throw new Error('Lote selecionado indisponível');
        }
        if (!portalLoteDentroVigencia(loteAtual)) {
          throw new Error('Lote fora do período de vigência (horário de Brasília)');
        }
      } else {
        loteAtual = portalObterLoteAtualEventoReal(dados.eventoId);
        if (!loteAtual) {
          throw new Error('Nenhum lote disponível para inscrição');
        }
      }
    }

    const ehGabinete = String(dados.clubeNome || '').toLowerCase().indexOf('gabinete distrital') >= 0;
    const rawId = dados.clubeId || (ehGabinete && dados.clubeOrigemId ? dados.clubeOrigemId : null);
    const clubeIdInicial = (rawId && String(rawId).trim()) ? String(rawId).trim() : null;
    const statusInscricao = ehPendente ? 'pendente' : (dados.status || 'realizada');
    const payloadObj = {
      evento_id: dados.eventoId,
      clube_id: clubeIdInicial,
      clube_nome: dados.clubeNome,
      envio_id: dados.envioId || null,
      pessoa_nome: dados.pessoaNome,
      pessoa_tipo: dados.pessoaTipo || '',
      tipo_inscricao: dados.tipoInscricao || (loteAtual && loteAtual.nomeLote) || '',
      lote_id: (loteAtual && loteAtual.id) || dados.loteId || null,
      lote_nome: (loteAtual && loteAtual.nomeLote) || '',
      valor_lote: (loteAtual && loteAtual.valor) != null ? loteAtual.valor : 0,
      restricao_alimentar: !!dados.restricaoAlimentar,
      restricao_descricao: dados.restricaoDescricao || '',
      comprovante_url: dados.comprovanteUrl || null,
      comprovante_nome: dados.comprovanteNome || null,
      comprovante_mime: dados.comprovanteMime || null,
      comprovante_tamanho: (dados.comprovanteTamanho !== undefined && dados.comprovanteTamanho !== null) ? dados.comprovanteTamanho : null,
      status: statusInscricao
    };
    if (!payloadObj.clube_id && typeof obterMapaClubesSupabase === 'function') {
      const clubesMap = obterMapaClubesSupabase();
      const ehGabinete = String(payloadObj.clube_nome || '').toLowerCase().indexOf('gabinete distrital') >= 0;
      const nomeParaResolve = (ehGabinete && dados.clubeOrigemNome) ? dados.clubeOrigemNome.trim() : (payloadObj.clube_nome || '').trim();
      if (nomeParaResolve) {
        const idResolvido = clubesMap[nomeParaResolve];
        if (idResolvido) payloadObj.clube_id = idResolvido;
      }
    }
    if (!payloadObj.clube_id && dados.clubeOrigemId && String(dados.clubeOrigemId).trim()) {
      payloadObj.clube_id = String(dados.clubeOrigemId).trim();
    }
    if (dados.clubeOrigemNome) {
      payloadObj.clube_origem_nome = dados.clubeOrigemNome;
    }

    const resp = await portalSupabaseFetch(`${table}?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      payload: JSON.stringify([payloadObj])
    });
    if (resp.getResponseCode() !== 201 && resp.getResponseCode() !== 200) {
      throw new Error(`Supabase criar inscrição falhou: ${resp.getResponseCode()} ${resp.getContentText()}`);
    }

    if (!ehPendente && loteAtual && loteAtual.id) {
      await portalRecalcularQuantidadeUsadaLote(loteAtual.id);
    }
    const arr = JSON.parse(resp.getContentText() || '[]');
    return arr && arr[0] ? portalNormalizeEventoInscricaoRow(arr[0]) : portalNormalizeEventoInscricaoRow(payloadObj);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

async function portalListarInscricoesEvento(eventoId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  const resp = await portalSupabaseFetch(`${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}&select=*&order=created_at.asc`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalListarInscricoesEvento erro:', resp.getResponseCode(), resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(portalNormalizeEventoInscricaoRow).filter(Boolean);
}

async function portalContarInscricoesPorEvento(eventoId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  if (!eventoId) return 0;
  var filtroStatus = 'or=(status.eq.realizada,status.is.null)';
  const resp = await portalSupabaseFetch(`${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}&${filtroStatus}&select=id`, {
    method: 'GET',
    headers: { Prefer: 'count=exact', Range: '0-0' }
  });
  if (resp.getResponseCode() !== 200 && resp.getResponseCode() !== 206) {
    console.error('portalContarInscricoesPorEvento erro:', resp.getResponseCode(), resp.getContentText());
    return 0;
  }
  try {
    var contentRange = resp.getHeaders() && (resp.getHeaders()['Content-Range'] || resp.getHeaders()['content-range']);
    if (contentRange && String(contentRange).indexOf('/') >= 0) {
      var total = parseInt(String(contentRange).split('/')[1], 10);
      if (!isNaN(total) && total >= 0) return total;
    }
    var rows = JSON.parse(resp.getContentText() || '[]');
    return Array.isArray(rows) ? rows.length : 0;
  } catch (e) {
    console.error('portalContarInscricoesPorEvento parse erro:', e);
    return 0;
  }
}

async function portalContarInscricoesEventos(eventoIds) {
  const resultado = {};
  if (!Array.isArray(eventoIds) || eventoIds.length === 0) return resultado;
  await Promise.all(eventoIds.map(async id => {
    resultado[id] = await portalContarInscricoesPorEvento(id);
  }));
  return resultado;
}

/**
 * Retorna mapa { eventoId: true } para eventos que têm pelo menos um lote ativo com vagas.
 */
async function portalEventosComLotesAtivos(eventoIds) {
  const resultado = {};
  if (!Array.isArray(eventoIds) || eventoIds.length === 0) return resultado;
  const agora = Date.now();
  await Promise.all(eventoIds.map(async id => {
    const lotes = (await portalListarLotesEvento(id)) || [];
    const temLoteAtivo = lotes.some(function(l) {
      const ativo = l.ativo !== false && l.ativo !== 'false';
      const total = Number(l.quantidadeTotal) || 0;
      const usada = Number(l.quantidadeUsada) || 0;
      const restantes = total - usada;
      return ativo && restantes > 0 && portalLoteDentroVigencia(l, agora);
    });
    resultado[id] = !!temLoteAtivo;
  }));
  return resultado;
}

async function portalListarInscricoesEventoRaw(eventoId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  const resp = await portalSupabaseFetch(`${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}&select=*&order=created_at.asc`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalListarInscricoesEventoRaw erro:', resp.getResponseCode(), resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return Array.isArray(rows) ? rows : [];
}

// Pendentes: inscrições com status 'pendente' na própria tabela eventos_inscricoes (sem vaga no lote).
// Listar: portalListarInscricoesPendentesEvento(eventoId). Cancelar: portalAtualizarInscricaoEvento(id, { status: 'cancelada' }).

async function portalListarInscricoesPendentesEvento(eventoId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  if (!eventoId) return [];
  const resp = await portalSupabaseFetch(`${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}&status=eq.pendente&select=*&order=created_at.asc`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalListarInscricoesPendentesEvento erro:', resp.getResponseCode(), resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(portalNormalizeEventoInscricaoRow).filter(Boolean);
}

async function portalListarPendentesEnvio(envioId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  if (!envioId) return [];
  const resp = await portalSupabaseFetch(`${table}?envio_id=eq.${encodeURIComponent(String(envioId))}&status=eq.pendente&select=*&order=created_at.asc`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalListarPendentesEnvio erro:', resp.getResponseCode(), resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(portalNormalizeEventoInscricaoRow).filter(Boolean);
}

/**
 * Resolve clube_id a partir do nome do clube (usa mapa com match exato, normalizado e fallback por query).
 * @param {string} clubeNome
 * @return {string|null} clube_id ou null se não encontrado
 */
async function portalResolverClubeIdPorNome(clubeNome) {
  if (!clubeNome || typeof clubeNome !== 'string') return null;
  const nome = String(clubeNome).trim();
  if (!nome) return null;
  // 1. Mapa em cache (exato + normalizado)
  if (typeof obterMapaClubesSupabase === 'function') {
    const clubesMap = obterMapaClubesSupabase();
    let clubeId = clubesMap[nome];
    if (clubeId) return clubeId;
    if (typeof normalizarNomeClubeParaBusca === 'function') {
      clubeId = clubesMap[normalizarNomeClubeParaBusca(nome)];
      if (clubeId) return clubeId;
    }
  }
  // 2. Fallback: consulta direta no Supabase (eq exato primeiro, depois ilike)
  try {
    const config = (typeof PORTAL_SUPABASE_CONFIG !== 'undefined' && PORTAL_SUPABASE_CONFIG) || (typeof RTMA_SUPABASE_CONFIG !== 'undefined' && RTMA_SUPABASE_CONFIG);
    if (!config || !config.url || !config.serviceRoleKey) return null;
    let path = `clubes?nome=eq.${encodeURIComponent(nome)}&select=id&limit=1`;
    let resp = await portalSupabaseFetch(path, { method: 'GET' });
    if (resp.getResponseCode() === 200) {
      const rows = JSON.parse(resp.getContentText() || '[]');
      if (Array.isArray(rows) && rows.length > 0 && rows[0].id) return rows[0].id;
    }
    const pattern = encodeURIComponent('*' + nome + '*'); // * = % em PostgREST ilike
    path = `clubes?nome=ilike.${pattern}&select=id&limit=1`;
    resp = await portalSupabaseFetch(path, { method: 'GET' });
    if (resp.getResponseCode() !== 200) return null;
    const rows = JSON.parse(resp.getContentText() || '[]');
    if (Array.isArray(rows) && rows.length > 0 && rows[0].id) return rows[0].id;
  } catch (e) {
    console.warn('portalResolverClubeIdPorNome: fallback query falhou', e && e.message);
  }
  return null;
}

async function portalCriarEnvioEvento(dados) {
  const table = PORTAL_SUPABASE_TABLES.eventos_envios;
  if (!dados || !dados.eventoId || !dados.clubeNome) {
    throw new Error('Evento e clube são obrigatórios para criar envio.');
  }
  const payload = {
    evento_id: dados.eventoId,
    clube_id: dados.clubeId || null,
    clube_nome: dados.clubeNome
  };
  if (!payload.clube_id && payload.clube_nome) {
    const clubeId = await portalResolverClubeIdPorNome(payload.clube_nome);
    if (clubeId) payload.clube_id = clubeId;
  }
  const resp = await portalSupabaseFetch(`${table}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    payload: JSON.stringify([payload])
  });
  if (resp.getResponseCode() !== 201 && resp.getResponseCode() !== 200) {
    throw new Error(`Supabase criar envio falhou: ${resp.getResponseCode()} ${resp.getContentText()}`);
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return rows && rows[0] ? portalNormalizeEventoEnvioRow(rows[0]) : portalNormalizeEventoEnvioRow(payload);
}

async function portalCriarComprovanteEnvio(dados) {
  const table = PORTAL_SUPABASE_TABLES.eventos_envios_comprovantes;
  if (!dados || !dados.envioId || !dados.comprovanteUrl) {
    throw new Error('Envio e comprovante são obrigatórios.');
  }
  const payload = {
    envio_id: dados.envioId,
    comprovante_url: dados.comprovanteUrl,
    comprovante_nome: dados.comprovanteNome || null,
    comprovante_mime: dados.comprovanteMime || null,
    comprovante_tamanho: (dados.comprovanteTamanho !== undefined && dados.comprovanteTamanho !== null) ? dados.comprovanteTamanho : null,
    valor: (dados.valor !== undefined && dados.valor !== null) ? dados.valor : null
  };
  const resp = await portalSupabaseFetch(`${table}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    payload: JSON.stringify([payload])
  });
  if (resp.getResponseCode() !== 201 && resp.getResponseCode() !== 200) {
    throw new Error(`Supabase criar comprovante falhou: ${resp.getResponseCode()} ${resp.getContentText()}`);
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return rows && rows[0] ? portalNormalizeEventoComprovanteRow(rows[0]) : portalNormalizeEventoComprovanteRow(payload);
}

async function portalListarEnviosEvento(eventoId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_envios;
  const resp = await portalSupabaseFetch(`${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}&select=*&order=created_at.asc`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalListarEnviosEvento erro:', resp.getResponseCode(), resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(portalNormalizeEventoEnvioRow).filter(Boolean);
}

async function portalBuscarEnvioEvento(envioId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_envios;
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(envioId))}&select=*&limit=1`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalBuscarEnvioEvento erro:', resp.getResponseCode(), resp.getContentText());
    return null;
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  const row = rows && rows[0] ? rows[0] : null;
  return row ? portalNormalizeEventoEnvioRow(row) : null;
}

async function portalAtualizarEnvioEvento(envioId, dados) {
  const table = PORTAL_SUPABASE_TABLES.eventos_envios;
  if (!envioId) {
    throw new Error('Envio não informado.');
  }
  const payload = {};
  if (dados && Object.prototype.hasOwnProperty.call(dados, 'clubeNome')) {
    payload.clube_nome = String(dados.clubeNome || '').trim();
  }
  if (dados && Object.prototype.hasOwnProperty.call(dados, 'clubeId')) {
    payload.clube_id = dados.clubeId ? String(dados.clubeId).trim() : null;
  }
  if (!payload.clube_id && payload.clube_nome) {
    const clubeId = await portalResolverClubeIdPorNome(payload.clube_nome);
    if (clubeId) payload.clube_id = clubeId;
  }
  if (Object.keys(payload).length === 0) {
    return await portalBuscarEnvioEvento(envioId);
  }
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(envioId))}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    payload: JSON.stringify(payload)
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`Supabase atualizar envio falhou: ${code} ${resp.getContentText()}`);
  }
  if (code === 204) return null;
  const rows = JSON.parse(resp.getContentText() || '[]');
  return rows && rows[0] ? portalNormalizeEventoEnvioRow(rows[0]) : null;
}

async function portalListarInscricoesEnvio(envioId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  const resp = await portalSupabaseFetch(`${table}?envio_id=eq.${encodeURIComponent(String(envioId))}&select=*&order=created_at.asc`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalListarInscricoesEnvio erro:', resp.getResponseCode(), resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(portalNormalizeEventoInscricaoRow).filter(Boolean);
}

async function portalListarComprovantesEnvio(envioId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_envios_comprovantes;
  const resp = await portalSupabaseFetch(`${table}?envio_id=eq.${encodeURIComponent(String(envioId))}&select=*&order=created_at.asc`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalListarComprovantesEnvio erro:', resp.getResponseCode(), resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(portalNormalizeEventoComprovanteRow).filter(Boolean);
}

function portalExtrairCaminhoComprovanteStorage(url) {
  if (!url || !PORTAL_SUPABASE_CONFIG || !PORTAL_SUPABASE_CONFIG.url) return null;
  const base = `${PORTAL_SUPABASE_CONFIG.url}/storage/v1/object/public/`;
  if (!String(url).startsWith(base)) return null;
  const resto = String(url).substring(base.length);
  const partes = resto.split('/');
  if (partes.length < 2) return null;
  const bucket = partes.shift();
  const caminho = partes.join('/');
  if (!bucket || !caminho) return null;
  return { bucket: bucket, caminho: caminho };
}

async function portalExcluirArquivoStorage(url) {
  const info = portalExtrairCaminhoComprovanteStorage(url);
  if (!info) return false;
  const delUrl = `${PORTAL_SUPABASE_CONFIG.url}/storage/v1/object/${info.bucket}/${info.caminho}`;
  try {
    const resp = await gasStyleFetch(delUrl, {
      method: 'DELETE',
      headers: {
        'apikey': PORTAL_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${PORTAL_SUPABASE_CONFIG.serviceRoleKey}`
      },
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    return code === 200 || code === 204 || code === 404;
  } catch (e) {
    console.error('portalExcluirArquivoStorage erro:', e);
    return false;
  }
}

async function portalExcluirComprovanteEnvio(comprovanteId, comprovanteUrl) {
  const table = PORTAL_SUPABASE_TABLES.eventos_envios_comprovantes;
  const idLimpo = String(comprovanteId || '').trim();
  const urlLimpa = String(comprovanteUrl || '').trim();
  if (!idLimpo && !urlLimpa) {
    throw new Error('Comprovante não informado.');
  }
  const filtro = idLimpo
    ? `id=eq.${encodeURIComponent(idLimpo)}`
    : `comprovante_url=eq.${encodeURIComponent(urlLimpa)}`;
  const resp = await portalSupabaseFetch(`${table}?${filtro}`, { method: 'DELETE' });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`Supabase excluir comprovante falhou: ${code} ${resp.getContentText()}`);
  }
  if (urlLimpa) {
    await portalExcluirArquivoStorage(urlLimpa);
  }
  return true;
}

async function portalListarComprovantesEnvioPorEvento(eventoId) {
  const envios = await portalListarEnviosEvento(eventoId) || [];
  const envioIds = envios.map(item => item.id).filter(Boolean);
  if (envioIds.length === 0) return [];
  const table = PORTAL_SUPABASE_TABLES.eventos_envios_comprovantes;
  const resultados = [];
  const chunkSize = 10;
  for (let i = 0; i < envioIds.length; i += chunkSize) {
    const chunk = envioIds.slice(i, i + chunkSize);
    const inList = chunk.map(id => encodeURIComponent(String(id).replace(/"/g, ''))).join(',');
    const path = `${table}?envio_id=in.(${inList})&select=*&order=created_at.asc`;
    const resp = await portalSupabaseFetch(path, { method: 'GET' });
    if (resp.getResponseCode() !== 200) {
      console.error('portalListarComprovantesEnvioPorEvento erro:', resp.getResponseCode(), resp.getContentText());
      continue;
    }
    const rows = JSON.parse(resp.getContentText() || '[]');
    (rows || []).forEach(row => resultados.push(portalNormalizeEventoComprovanteRow(row)));
  }
  return resultados.filter(Boolean);
}

async function portalExcluirEnvioEvento(envioId) {
  if (!envioId) {
    throw new Error('Envio não informado.');
  }
  const inscricoesTable = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  const comprovantesTable = PORTAL_SUPABASE_TABLES.eventos_envios_comprovantes;
  const enviosTable = PORTAL_SUPABASE_TABLES.eventos_envios;

  const respInscricoes = await portalSupabaseFetch(`${inscricoesTable}?envio_id=eq.${encodeURIComponent(String(envioId))}`, { method: 'DELETE' });
  const codeInscricoes = respInscricoes.getResponseCode();
  if (codeInscricoes !== 200 && codeInscricoes !== 204) {
    throw new Error(`Supabase excluir inscrições do envio falhou: ${codeInscricoes} ${respInscricoes.getContentText()}`);
  }

  const respComprovantes = await portalSupabaseFetch(`${comprovantesTable}?envio_id=eq.${encodeURIComponent(String(envioId))}`, { method: 'DELETE' });
  const codeComprovantes = respComprovantes.getResponseCode();
  if (codeComprovantes !== 200 && codeComprovantes !== 204) {
    throw new Error(`Supabase excluir comprovantes do envio falhou: ${codeComprovantes} ${respComprovantes.getContentText()}`);
  }

  const respEnvio = await portalSupabaseFetch(`${enviosTable}?id=eq.${encodeURIComponent(String(envioId))}`, { method: 'DELETE' });
  const codeEnvio = respEnvio.getResponseCode();
  if (codeEnvio !== 200 && codeEnvio !== 204) {
    throw new Error(`Supabase excluir envio falhou: ${codeEnvio} ${respEnvio.getContentText()}`);
  }
  return true;
}

async function portalAtualizarInscricaoEvento(inscricaoId, dados) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  if (!inscricaoId) {
    throw new Error('Inscrição não informada.');
  }
  const mapping = {
    pessoaNome: 'pessoa_nome',
    pessoaTipo: 'pessoa_tipo',
    clubeNome: 'clube_nome',
    clubeId: 'clube_id',
    loteId: 'lote_id',
    loteNome: 'lote_nome',
    tipoInscricao: 'tipo_inscricao',
    valorLote: 'valor_lote',
    envioId: 'envio_id',
    refeicoesCarga: 'refeicoes_carga',
    refeicoesUsado: 'refeicoes_usado',
    status: 'status',
    restricaoAlimentar: 'restricao_alimentar',
    restricaoDescricao: 'restricao_descricao'
  };
  const style = await portalDetectTableStyle(table);
  const payload = (style === 'snake' || style === 'unknown')
    ? portalToSnakeFromCamel(dados || {}, mapping)
    : Object.assign({}, dados || {});
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(inscricaoId))}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    payload: JSON.stringify(payload)
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`Supabase atualizar inscrição falhou: ${code} ${resp.getContentText()}`);
  }
  if (code === 204) return null;
  const rows = JSON.parse(resp.getContentText() || '[]');
  return rows && rows[0] ? portalNormalizeEventoInscricaoRow(rows[0]) : null;
}

/**
 * Atualiza a carga de refeições de uma inscrição (passaporte).
 * @param {string} inscricaoId - UUID da inscrição
 * @param {Object} carga - Ex.: { cafe: 3, almoco: 2, jantar: 2 }
 * @param {boolean} zerarUsado - Se true, reseta refeicoes_usado para {}
 * @returns {Object|null} Inscrição normalizada ou null
 */
async function portalAtualizarCargaRefeicoesInscricao(inscricaoId, carga, zerarUsado) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  if (!inscricaoId) throw new Error('Inscrição não informada.');
  const cargaObj = (carga && typeof carga === 'object') ? carga : {};
  const payload = { refeicoes_carga: cargaObj };
  if (zerarUsado === true) payload.refeicoes_usado = {};
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(inscricaoId))}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    payload: JSON.stringify(payload)
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) throw new Error(`Atualizar carga refeições falhou: ${code} ${resp.getContentText()}`);
  if (code === 204) return null;
  const rows = JSON.parse(resp.getContentText() || '[]');
  return rows && rows[0] ? portalNormalizeEventoInscricaoRow(rows[0]) : null;
}

/**
 * Valida se a inscrição tem saldo para o tipo de refeição (somente leitura, não consome).
 * Usado pelo scanner para feedback imediato antes de adicionar à fila.
 * @param {string} inscricaoId - UUID da inscrição
 * @param {string} eventoId - UUID do evento
 * @param {string} tipoRefeicao - Ex.: 'cafe', 'almoco', 'jantar'
 * @returns {Object} { ok: boolean, pessoaNome?: string, saldoRestante?: Object, erro?: string }
 */
async function portalValidarSaldoRefeicaoInscricao(inscricaoId, eventoId, tipoRefeicao) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  if (!inscricaoId || !eventoId || !tipoRefeicao) {
    return { ok: false, erro: 'Dados incompletos.' };
  }
  const tipo = String(tipoRefeicao).trim().toLowerCase();
  if (!tipo) return { ok: false, erro: 'Tipo de refeição inválido.' };

  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(inscricaoId))}&select=*`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    return { ok: false, erro: 'Inscrição não encontrada. Verifique se o passaporte é deste evento e foi gerado pelo Portal.' };
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  const row = rows && rows[0] ? rows[0] : null;
  if (!row) return { ok: false, erro: 'Inscrição não encontrada. Verifique se o passaporte é deste evento e foi gerado pelo Portal.' };

  if (String(row.evento_id) !== String(eventoId)) {
    return { ok: false, erro: 'Inscrição não pertence a este evento.' };
  }

  const carga = (typeof row.refeicoes_carga === 'object' && row.refeicoes_carga !== null) ? row.refeicoes_carga : {};
  const usado = (typeof row.refeicoes_usado === 'object' && row.refeicoes_usado !== null) ? row.refeicoes_usado : {};
  const total = (typeof carga[tipo] === 'number' ? carga[tipo] : parseInt(carga[tipo], 10) || 0);
  const consumido = (typeof usado[tipo] === 'number' ? usado[tipo] : parseInt(usado[tipo], 10) || 0);
  const saldo = total - consumido;

  if (saldo < 1) {
    return { ok: false, erro: 'Sem saldo para ' + tipo + '.', pessoaNome: row.pessoa_nome || '' };
  }

  const saldoRestante = {};
  Object.keys(carga).forEach(function (k) {
    const t = (typeof carga[k] === 'number' ? carga[k] : parseInt(carga[k], 10) || 0);
    const u = (typeof usado[k] === 'number' ? usado[k] : parseInt(usado[k], 10) || 0);
    saldoRestante[k] = Math.max(0, t - u);
  });

  return {
    ok: true,
    pessoaNome: row.pessoa_nome || '',
    saldoRestante: saldoRestante
  };
}

/**
 * Consome uma refeição do tipo indicado para a inscrição (chamado pelo scanner QR).
 * Valida evento, saldo e incrementa refeicoes_usado.
 * @param {string} inscricaoId - UUID da inscrição (lido do QR)
 * @param {string} eventoId - UUID do evento (validação)
 * @param {string} tipoRefeicao - Ex.: 'cafe', 'almoco', 'jantar'
 * @returns {Object} { ok: boolean, pessoaNome?: string, saldoRestante?: Object, erro?: string }
 */
async function portalConsumirRefeicaoInscricao(inscricaoId, eventoId, tipoRefeicao) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  if (!inscricaoId || !eventoId || !tipoRefeicao) {
    return { ok: false, erro: 'Dados incompletos (inscrição, evento ou tipo de refeição).' };
  }
  const id = String(inscricaoId).trim();
  if (!id || !_UUID_REGEX.test(id)) return { ok: false, erro: 'Código do passaporte inválido. Use o passaporte gerado pelo Portal.' };
  const tipo = String(tipoRefeicao).trim().toLowerCase();
  if (!tipo) return { ok: false, erro: 'Tipo de refeição inválido.' };

  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(id)}&select=*`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    return { ok: false, erro: 'Inscrição não encontrada. Verifique se o passaporte é deste evento e foi gerado pelo Portal.' };
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  const row = rows && rows[0] ? rows[0] : null;
  if (!row) return { ok: false, erro: 'Inscrição não encontrada. Verifique se o passaporte é deste evento e foi gerado pelo Portal.' };

  if (String(row.evento_id) !== String(eventoId)) {
    return { ok: false, erro: 'Inscrição não pertence a este evento.' };
  }

  const carga = (typeof row.refeicoes_carga === 'object' && row.refeicoes_carga !== null) ? row.refeicoes_carga : {};
  const usado = (typeof row.refeicoes_usado === 'object' && row.refeicoes_usado !== null) ? row.refeicoes_usado : {};
  const total = (typeof carga[tipo] === 'number' ? carga[tipo] : parseInt(carga[tipo], 10) || 0);
  const consumido = (typeof usado[tipo] === 'number' ? usado[tipo] : parseInt(usado[tipo], 10) || 0);
  const saldo = total - consumido;

  if (saldo < 1) {
    return { ok: false, erro: 'Sem saldo para este tipo de refeição.', pessoaNome: row.pessoa_nome || '' };
  }

  const novoUsado = Object.assign({}, usado);
  novoUsado[tipo] = consumido + 1;

  const patchResp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    payload: JSON.stringify({ refeicoes_usado: novoUsado })
  });
  if (patchResp.getResponseCode() !== 200 && patchResp.getResponseCode() !== 204) {
    return { ok: false, erro: 'Falha ao registrar consumo.', pessoaNome: row.pessoa_nome || '' };
  }

  const saldoRestante = {};
  Object.keys(carga).forEach(function (k) {
    const t = (typeof carga[k] === 'number' ? carga[k] : parseInt(carga[k], 10) || 0);
    const u = (typeof novoUsado[k] === 'number' ? novoUsado[k] : parseInt(novoUsado[k], 10) || 0);
    saldoRestante[k] = Math.max(0, t - u);
  });

  return {
    ok: true,
    pessoaNome: row.pessoa_nome || '',
    saldoRestante: saldoRestante
  };
}

/**
 * Consome refeições em lote (para scanner com fila local).
 * @param {string} eventoId - UUID do evento
 * @param {Array<{inscricaoId:string,tipoRefeicao:string}>} itens - Lista de { inscricaoId, tipoRefeicao }
 * @returns {Object} { processados, sucesso, erros: [{inscricaoId,tipoRefeicao,erro}] }
 */
async function portalConsumirRefeicoesInscricaoLote(eventoId, itens) {
  if (!eventoId || !Array.isArray(itens) || itens.length === 0) {
    return { processados: 0, sucesso: 0, erros: [] };
  }
  let sucesso = 0;
  const erros = [];
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const inscricaoId = item && item.inscricaoId ? String(item.inscricaoId).trim() : '';
    const tipoRefeicao = item && item.tipoRefeicao ? String(item.tipoRefeicao).trim().toLowerCase() : '';
    if (!inscricaoId || !tipoRefeicao) {
      erros.push({ inscricaoId: inscricaoId || '?', tipoRefeicao: tipoRefeicao || '?', erro: 'Dados incompletos' });
      continue;
    }
    try {
      const res = await portalConsumirRefeicaoInscricao(inscricaoId, eventoId, tipoRefeicao);
      if (res && res.ok) sucesso++;
      else erros.push({ inscricaoId: inscricaoId, tipoRefeicao: tipoRefeicao, erro: res && res.erro ? res.erro : 'Falha' });
    } catch (e) {
      erros.push({ inscricaoId: inscricaoId, tipoRefeicao: tipoRefeicao, erro: (e && e.message) ? e.message : 'Erro' });
    }
  }
  return { processados: itens.length, sucesso: sucesso, erros: erros };
}

/**
 * Credencia inscrições em modalidades em lote (para scanner com fila local).
 * @param {string} eventoId - UUID do evento
 * @param {Array<{inscricaoId:string,modalidadeId:string}>} itens - Lista de { inscricaoId, modalidadeId }
 * @returns {Object} { processados, sucesso, erros: [{inscricaoId,modalidadeId,erro}] }
 */
async function portalCredenciarInscricoesModalidadeLote(eventoId, itens) {
  if (!eventoId || !Array.isArray(itens) || itens.length === 0) {
    return { processados: 0, sucesso: 0, erros: [] };
  }
  let sucesso = 0;
  const erros = [];
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const inscricaoId = (item && (item.inscricaoId || item.inscricao_id)) ? String(item.inscricaoId || item.inscricao_id).trim() : '';
    const modalidadeId = (item && (item.modalidadeId || item.modalidade_id)) ? String(item.modalidadeId || item.modalidade_id).trim() : '';
    if (!inscricaoId || !modalidadeId) {
      erros.push({ inscricaoId: inscricaoId || '?', modalidadeId: modalidadeId || '?', erro: 'Dados incompletos' });
      continue;
    }
    try {
      const res = await portalCredenciarInscricaoModalidade(inscricaoId, eventoId, modalidadeId);
      if (res && res.ok) sucesso++;
      else erros.push({ inscricaoId: inscricaoId, modalidadeId: modalidadeId, erro: res && res.erro ? res.erro : 'Não pode credenciar' });
    } catch (e) {
      erros.push({ inscricaoId: inscricaoId, modalidadeId: modalidadeId, erro: (e && e.message) ? e.message : 'Erro' });
    }
  }
  return { processados: itens.length, sucesso: sucesso, erros: erros };
}

/**
 * Aplica a mesma carga de refeições a todos os inscritos do evento (um único PATCH em massa).
 * @param {string} eventoId - UUID do evento
 * @param {Object} carga - Ex.: { cafe: 3, almoco: 2, jantar: 2 }
 * @param {boolean} zerarUsado - Se true, zera refeicoes_usado em cada inscrição
 * @returns {Object} { atualizados: number, erros: string[] }
 */
async function portalAtualizarCargaRefeicoesLote(eventoId, carga, zerarUsado) {
  if (!eventoId) throw new Error('Evento não informado.');
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  const cargaObj = (carga && typeof carga === 'object') ? carga : {};
  const usadoObj = zerarUsado === true ? {} : null;
  const payload = { refeicoes_carga: cargaObj };
  if (usadoObj !== null) payload.refeicoes_usado = usadoObj;
  const path = `${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}`;
  const resp = await portalSupabaseFetch(path, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    payload: JSON.stringify(payload)
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error('Falha ao atualizar carga em lote: ' + (resp.getContentText() || code));
  }
  const rows = code === 204 ? [] : JSON.parse(resp.getContentText() || '[]');
  const atualizados = Array.isArray(rows) ? rows.length : 0;
  return { atualizados: atualizados, erros: [] };
}

// === MODALIDADES E CREDENCIAMENTO (COMPETIÇÃO) ===
async function portalListarModalidades() {
  const table = PORTAL_SUPABASE_TABLES.modalidades;
  const resp = await portalSupabaseFetch(`${table}?select=*&order=nome.asc`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) return [];
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(r => ({
    id: r.id,
    nome: r.nome || '',
    categoria: r.categoria || 'Misto'
  }));
}

async function portalCriarModalidade(dados) {
  const table = PORTAL_SUPABASE_TABLES.modalidades;
  const payload = {
    nome: String(dados.nome || '').trim(),
    categoria: (dados.categoria === 'Feminino' || dados.categoria === 'Masculino') ? dados.categoria : 'Misto'
  };
  if (!payload.nome) throw new Error('Nome da modalidade é obrigatório.');
  const resp = await portalSupabaseFetch(`${table}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    payload: JSON.stringify(payload)
  });
  if (resp.getResponseCode() !== 201) throw new Error('Falha ao criar modalidade: ' + resp.getContentText());
  const arr = JSON.parse(resp.getContentText() || '[]');
  return arr && arr[0] ? arr[0] : payload;
}

async function portalAtualizarModalidade(id, dados) {
  const table = PORTAL_SUPABASE_TABLES.modalidades;
  const payload = {};
  if (dados.nome !== undefined) payload.nome = String(dados.nome).trim();
  if (dados.categoria !== undefined) payload.categoria = (dados.categoria === 'Feminino' || dados.categoria === 'Masculino') ? dados.categoria : 'Misto';
  if (Object.keys(payload).length === 0) return null;
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(id))}`, { method: 'PATCH', payload: JSON.stringify(payload) });
  if (resp.getResponseCode() !== 200 && resp.getResponseCode() !== 204) throw new Error('Falha ao atualizar modalidade.');
  return true;
}

async function portalExcluirModalidade(id) {
  const table = PORTAL_SUPABASE_TABLES.modalidades;
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(id))}`, { method: 'DELETE' });
  if (resp.getResponseCode() !== 200 && resp.getResponseCode() !== 204) throw new Error('Falha ao excluir modalidade.');
  return true;
}

/**
 * Obtém uma modalidade por ID (para regra coletiva vs individual no credenciamento).
 * @param {string} modalidadeId
 * @returns {{ id: string, nome: string, coletiva: boolean }|null}
 */
async function portalObterModalidade(modalidadeId) {
  if (!modalidadeId) return null;
  const table = PORTAL_SUPABASE_TABLES.modalidades;
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(modalidadeId))}&select=*`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) return null;
  const rows = JSON.parse(resp.getContentText() || '[]');
  const r = rows && rows[0] ? rows[0] : null;
  if (!r) return null;
  return {
    id: r.id,
    nome: r.nome || '',
    coletiva: r.coletiva === true
  };
}

async function portalListarModalidadesEvento(eventoId) {
  const em = PORTAL_SUPABASE_TABLES.eventos_modalidades;
  const m = PORTAL_SUPABASE_TABLES.modalidades;
  const path = `${em}?evento_id=eq.${encodeURIComponent(String(eventoId))}&select=*,modalidades(*)`;
  const resp = await portalSupabaseFetch(path, { method: 'GET' });
  if (resp.getResponseCode() !== 200) return [];
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(r => ({
    id: r.id,
    eventoId: r.evento_id,
    modalidadeId: r.modalidade_id,
    limiteParticipantes: r.limite_participantes != null ? Number(r.limite_participantes) : null,
    ordem: r.ordem != null ? Number(r.ordem) : 0,
    modalidade: r.modalidades ? { id: r.modalidades.id, nome: r.modalidades.nome || '', categoria: r.modalidades.categoria || 'Misto', coletiva: r.modalidades.coletiva === true } : null
  }));
}

async function portalVincularModalidadeEvento(eventoId, modalidadeId, limiteParticipantes) {
  const table = PORTAL_SUPABASE_TABLES.eventos_modalidades;
  const payload = {
    evento_id: String(eventoId),
    modalidade_id: String(modalidadeId),
    limite_participantes: limiteParticipantes != null && limiteParticipantes !== '' ? parseInt(limiteParticipantes, 10) : null
  };
  const resp = await portalSupabaseFetch(`${table}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    payload: JSON.stringify(payload)
  });
  if (resp.getResponseCode() !== 201) {
    const txt = resp.getContentText() || '';
    if (txt.indexOf('duplicate') >= 0 || txt.indexOf('unique') >= 0) throw new Error('Esta modalidade já está vinculada ao evento.');
    throw new Error('Falha ao vincular: ' + txt);
  }
  return true;
}

async function portalRemoverModalidadeEvento(eventoId, modalidadeId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_modalidades;
  const resp = await portalSupabaseFetch(`${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}&modalidade_id=eq.${encodeURIComponent(String(modalidadeId))}`, { method: 'DELETE' });
  if (resp.getResponseCode() !== 200 && resp.getResponseCode() !== 204) throw new Error('Falha ao remover vínculo.');
  return true;
}

async function portalListarBloqueiosModalidade(modalidadeIdOrigem) {
  const table = PORTAL_SUPABASE_TABLES.modalidades_bloqueio;
  const resp = await portalSupabaseFetch(`${table}?modalidade_id_origem=eq.${encodeURIComponent(String(modalidadeIdOrigem))}&select=*`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) return [];
  return JSON.parse(resp.getContentText() || '[]');
}

async function portalCriarBloqueioModalidade(modalidadeIdOrigem, modalidadeIdBloqueada) {
  const table = PORTAL_SUPABASE_TABLES.modalidades_bloqueio;
  const payload = { modalidade_id_origem: String(modalidadeIdOrigem), modalidade_id_bloqueada: String(modalidadeIdBloqueada) };
  const resp = await portalSupabaseFetch(`${table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, payload: JSON.stringify(payload) });
  if (resp.getResponseCode() !== 201) throw new Error('Falha ao criar regra de bloqueio.');
  return true;
}

async function portalRemoverBloqueioModalidade(id) {
  const table = PORTAL_SUPABASE_TABLES.modalidades_bloqueio;
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(id))}`, { method: 'DELETE' });
  if (resp.getResponseCode() !== 200 && resp.getResponseCode() !== 204) throw new Error('Falha ao remover bloqueio.');
  return true;
}

async function portalContarCredenciadosModalidade(eventoId, modalidadeId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_credenciamento_modalidade;
  const resp = await portalSupabaseFetch(`${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}&modalidade_id=eq.${encodeURIComponent(String(modalidadeId))}&select=id`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) return 0;
  const rows = JSON.parse(resp.getContentText() || '[]');
  return Array.isArray(rows) ? rows.length : 0;
}

/** Conta quantos já credenciados na modalidade **por clube** (limite é por clube). Inclui inscrições do Gabinete Distrital quando clube_origem_nome = clubeNome. */
async function portalContarCredenciadosModalidadePorClube(eventoId, modalidadeId, clubeNome) {
  const inscTable = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  const credTable = PORTAL_SUPABASE_TABLES.eventos_credenciamento_modalidade;
  const clube = String(clubeNome || '').trim();
  if (!clube) return 0;
  var ids = [];
  const respInsc = await portalSupabaseFetch(`${inscTable}?evento_id=eq.${encodeURIComponent(String(eventoId))}&clube_nome=eq.${encodeURIComponent(clube)}&select=id`, { method: 'GET' });
  if (respInsc.getResponseCode() === 200) {
    const inscRows = JSON.parse(respInsc.getContentText() || '[]');
    ids = (inscRows || []).map(r => r.id).filter(Boolean);
  }
  const respGabinete = await portalSupabaseFetch(`${inscTable}?evento_id=eq.${encodeURIComponent(String(eventoId))}&clube_nome=eq.${encodeURIComponent('Gabinete Distrital')}&clube_origem_nome=eq.${encodeURIComponent(clube)}&select=id`, { method: 'GET' });
  if (respGabinete.getResponseCode() === 200) {
    const rowsGabinete = JSON.parse(respGabinete.getContentText() || '[]');
    (rowsGabinete || []).forEach(r => { if (r.id && ids.indexOf(r.id) === -1) ids.push(r.id); });
  }
  if (ids.length === 0) return 0;
  const idsList = ids.map(id => encodeURIComponent(id)).join(',');
  const respCred = await portalSupabaseFetch(`${credTable}?evento_id=eq.${encodeURIComponent(String(eventoId))}&modalidade_id=eq.${encodeURIComponent(String(modalidadeId))}&inscricao_id=in.(${idsList})&select=id`, { method: 'GET' });
  if (respCred.getResponseCode() !== 200) return 0;
  const credRows = JSON.parse(respCred.getContentText() || '[]');
  return Array.isArray(credRows) ? credRows.length : 0;
}

async function portalInscricaoJaCredenciadaModalidade(inscricaoId, eventoId, modalidadeId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_credenciamento_modalidade;
  const path = `${table}?inscricao_id=eq.${encodeURIComponent(String(inscricaoId))}&evento_id=eq.${encodeURIComponent(String(eventoId))}&modalidade_id=eq.${encodeURIComponent(String(modalidadeId))}&select=id`;
  const resp = await portalSupabaseFetch(path, { method: 'GET' });
  if (resp.getResponseCode() !== 200) return false;
  const rows = JSON.parse(resp.getContentText() || '[]');
  return Array.isArray(rows) && rows.length > 0;
}

async function portalListarModalidadesQueInscricaoParticipou(eventoId, inscricaoId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_credenciamento_modalidade;
  const path = `${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}&inscricao_id=eq.${encodeURIComponent(String(inscricaoId))}&select=modalidade_id`;
  const resp = await portalSupabaseFetch(path, { method: 'GET' });
  if (resp.getResponseCode() !== 200) return [];
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(r => r.modalidade_id).filter(Boolean);
}

async function portalListarModalidadesBloqueadasPor(modalidadeIdParticipou) {
  const table = PORTAL_SUPABASE_TABLES.modalidades_bloqueio;
  const resp = await portalSupabaseFetch(`${table}?modalidade_id_origem=eq.${encodeURIComponent(String(modalidadeIdParticipou))}&select=modalidade_id_bloqueada`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) return [];
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(r => r.modalidade_id_bloqueada).filter(Boolean);
}

async function portalListarCredenciamentosEvento(eventoId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_credenciamento_modalidade;
  const resp = await portalSupabaseFetch(`${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}&select=inscricao_id,modalidade_id`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) return [];
  return JSON.parse(resp.getContentText() || '[]') || [];
}

/**
 * Lista credenciados de uma modalidade com detalhes (pessoa, clube).
 * @param {string} eventoId
 * @param {string} modalidadeId
 * @returns {Array} [{ id, inscricaoId, pessoaNome, clubeNome }]
 */
async function portalListarCredenciadosModalidadeDetalhado(eventoId, modalidadeId) {
  const credTable = PORTAL_SUPABASE_TABLES.eventos_credenciamento_modalidade;
  const inscTable = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  const resp = await portalSupabaseFetch(`${credTable}?evento_id=eq.${encodeURIComponent(String(eventoId))}&modalidade_id=eq.${encodeURIComponent(String(modalidadeId))}&select=id,inscricao_id`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) return [];
  const creds = JSON.parse(resp.getContentText() || '[]') || [];
  if (creds.length === 0) return [];
  const inscricoes = await portalListarInscricoesEvento(eventoId);
  const mapaInsc = {};
  (inscricoes || []).forEach(function(i) {
    const id = i.id || i.inscricaoId;
    if (id) mapaInsc[String(id).toLowerCase().trim()] = i;
  });
  return creds.map(function(c) {
    const iid = String(c.inscricao_id || c.inscricaoId || '').trim();
    const insc = mapaInsc[iid.toLowerCase()] || null;
    var clubeNome = insc ? (insc.clubeNome || insc.clube_nome || '') : '';
    if (insc && String(clubeNome).toLowerCase().indexOf('gabinete distrital') >= 0 && (insc.clubeOrigemNome || insc.clube_origem_nome)) {
      clubeNome = insc.clubeOrigemNome || insc.clube_origem_nome;
    }
    return {
      id: c.id,
      inscricaoId: iid,
      pessoaNome: insc ? (insc.pessoaNome || insc.pessoa_nome || '') : '',
      clubeNome: clubeNome || 'Sem clube'
    };
  });
}

/**
 * Remove um credenciamento (permite refazer).
 * @param {string} inscricaoId
 * @param {string} eventoId
 * @param {string} modalidadeId
 * @returns {Object} { ok, erro? }
 */
async function portalRemoverCredenciamentoModalidade(inscricaoId, eventoId, modalidadeId) {
  const table = PORTAL_SUPABASE_TABLES.eventos_credenciamento_modalidade;
  const path = `${table}?inscricao_id=eq.${encodeURIComponent(String(inscricaoId))}&evento_id=eq.${encodeURIComponent(String(eventoId))}&modalidade_id=eq.${encodeURIComponent(String(modalidadeId))}`;
  const resp = await portalSupabaseFetch(path, { method: 'DELETE' });
  if (resp.getResponseCode() !== 200 && resp.getResponseCode() !== 204) {
    return { ok: false, erro: 'Falha ao remover credenciamento.' };
  }
  return { ok: true };
}

async function portalListarTodosBloqueiosModalidade() {
  const table = PORTAL_SUPABASE_TABLES.modalidades_bloqueio;
  const resp = await portalSupabaseFetch(`${table}?select=modalidade_id_origem,modalidade_id_bloqueada`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) return [];
  return JSON.parse(resp.getContentText() || '[]') || [];
}

/**
 * Valida se a inscrição pode ser credenciada na modalidade (sem gravar).
 * @returns {Object} { ok, erro?, pessoaNome?, jaCredenciado?, bloqueadoPor?, lotado? }
 */
const _UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function portalValidarCredenciamentoModalidade(inscricaoId, eventoId, modalidadeId) {
  const id = String(inscricaoId || '').trim();
  if (!id || !_UUID_REGEX.test(id)) return { ok: false, erro: 'Código do passaporte inválido. Use o passaporte gerado pelo Portal.' };
  if (!eventoId) return { ok: false, erro: 'Evento não informado.' };
  const inscricoes = await portalListarInscricoesEvento(eventoId);
  const idNorm = String(id).toLowerCase().trim();
  const insc = (inscricoes || []).find(function(r) {
    var rid = r && (r.id || r.inscricaoId);
    return rid && String(rid).toLowerCase().trim() === idNorm;
  }) || null;
  if (!insc) return { ok: false, erro: 'Inscrição não encontrada. Verifique se o passaporte é deste evento e foi gerado pelo Portal.' };
  var clubeNome = insc.clubeNome || insc.clube_nome || '';
  if (String(clubeNome).toLowerCase().indexOf('gabinete distrital') >= 0 && (insc.clubeOrigemNome || insc.clube_origem_nome)) {
    clubeNome = insc.clubeOrigemNome || insc.clube_origem_nome;
  }
  const pessoaNome = insc.pessoaNome || insc.pessoa_nome || '';
  const emTable = PORTAL_SUPABASE_TABLES.eventos_modalidades;
  const emResp = await portalSupabaseFetch(`${emTable}?evento_id=eq.${encodeURIComponent(String(eventoId))}&modalidade_id=eq.${encodeURIComponent(String(modalidadeId))}&select=limite_participantes`, { method: 'GET' });
  if (emResp.getResponseCode() !== 200) return { ok: false, erro: 'Modalidade não vinculada a este evento.', pessoaNome: pessoaNome };
  const emRows = JSON.parse(emResp.getContentText() || '[]');
  const evMod = emRows && emRows[0] ? emRows[0] : null;
  if (!evMod) return { ok: false, erro: 'Modalidade não vinculada a este evento.', pessoaNome: pessoaNome };
  if (portalInscricaoJaCredenciadaModalidade(inscricaoId, eventoId, modalidadeId)) return { ok: false, jaCredenciado: true, erro: 'Já credenciado nesta modalidade.', pessoaNome: pessoaNome };
  const participou = await portalListarModalidadesQueInscricaoParticipou(eventoId, inscricaoId);
  const bloqueadas = [];
  for (const mid of (participou || [])) {
    const bl = await portalListarModalidadesBloqueadasPor(mid);
    (bl || []).forEach(b => { if (String(b) === String(modalidadeId)) bloqueadas.push(mid); });
  }
  if (bloqueadas.length > 0) return { ok: false, bloqueadoPor: true, erro: 'Não pode: participou de modalidade que bloqueia esta.', pessoaNome: pessoaNome };
  const limite = evMod.limite_participantes != null ? parseInt(evMod.limite_participantes, 10) : null;
  if (limite != null && limite > 0) {
    const count = await portalContarCredenciadosModalidadePorClube(eventoId, modalidadeId, clubeNome);
    if (count >= limite) return { ok: false, lotado: true, erro: 'Limite do clube nesta modalidade atingido.', pessoaNome: pessoaNome };
  }
  return { ok: true, pessoaNome: pessoaNome };
}

/**
 * Credencia a inscrição na modalidade (competição). Valida antes.
 * @returns {Object} { ok, erro?, pessoaNome? }
 */
async function portalCredenciarInscricaoModalidade(inscricaoId, eventoId, modalidadeId) {
  const validacao = await portalValidarCredenciamentoModalidade(inscricaoId, eventoId, modalidadeId);
  if (!validacao.ok) return { ok: false, erro: validacao.erro || 'Não pode credenciar.', pessoaNome: validacao.pessoaNome || '' };
  const table = PORTAL_SUPABASE_TABLES.eventos_credenciamento_modalidade;
  const payload = { evento_id: eventoId, inscricao_id: inscricaoId, modalidade_id: modalidadeId };
  const resp = await portalSupabaseFetch(`${table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, payload: JSON.stringify(payload) });
  if (resp.getResponseCode() !== 201) return { ok: false, erro: 'Falha ao registrar credenciamento.', pessoaNome: validacao.pessoaNome || '' };
  return { ok: true, pessoaNome: validacao.pessoaNome || '' };
}

// === Plenária (delegados) – usa eventos_credenciamento_modalidade com modalidade "Plenária" ===
const NOME_MODALIDADE_PLENARIA = 'Plenária';

async function portalObterModalidadePlenariaId() {
  const table = PORTAL_SUPABASE_TABLES.modalidades;
  const resp = await portalSupabaseFetch(`${table}?nome=ilike.${encodeURIComponent(NOME_MODALIDADE_PLENARIA)}&select=id`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) return null;
  const rows = JSON.parse(resp.getContentText() || '[]');
  if (rows && rows[0] && rows[0].id) return rows[0].id;
  const createResp = await portalSupabaseFetch(`${table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, payload: JSON.stringify({ nome: NOME_MODALIDADE_PLENARIA, categoria: 'Misto' }) });
  if (createResp.getResponseCode() !== 201) return null;
  const created = JSON.parse(createResp.getContentText() || '[]');
  return (created && created[0] && created[0].id) ? created[0].id : null;
}

async function portalContarCredenciadosPlenariaPorClube(eventoId, clubeNome) {
  const modalidadePlenariaId = await portalObterModalidadePlenariaId();
  if (!modalidadePlenariaId || !eventoId || !clubeNome) return 0;
  const credTable = PORTAL_SUPABASE_TABLES.eventos_credenciamento_modalidade;
  const path = `${credTable}?evento_id=eq.${encodeURIComponent(String(eventoId))}&modalidade_id=eq.${encodeURIComponent(modalidadePlenariaId)}&or=(delegado_nato.eq.false,delegado_nato.is.null)&select=inscricao_id`;
  let resp = await portalSupabaseFetch(path, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    resp = await portalSupabaseFetch(`${credTable}?evento_id=eq.${encodeURIComponent(String(eventoId))}&modalidade_id=eq.${encodeURIComponent(modalidadePlenariaId)}&select=inscricao_id`, { method: 'GET' });
    if (resp.getResponseCode() !== 200) return 0;
  }
  const creds = JSON.parse(resp.getContentText() || '[]') || [];
  if (creds.length === 0) return 0;
  const inscricoes = await portalListarInscricoesEvento(eventoId);
  const clubeNorm = String(clubeNome).trim().toLowerCase();
  let count = 0;
  const mapaInsc = {};
  (inscricoes || []).forEach(function(i) {
    const id = String(i.id || i.inscricaoId || '').trim().toLowerCase();
    var c = (i.clubeNome || i.clube_nome || '').trim();
    if (String(c).toLowerCase().indexOf('gabinete distrital') >= 0 && (i.clubeOrigemNome || i.clube_origem_nome)) c = (i.clubeOrigemNome || i.clube_origem_nome).trim();
    if (id) mapaInsc[id] = String(c).trim().toLowerCase();
  });
  creds.forEach(function(c) {
    const iid = String(c.inscricao_id || c.inscricaoId || '').trim().toLowerCase();
    if (mapaInsc[iid] === clubeNorm) count++;
  });
  return count;
}

async function portalInscricaoJaCredenciadaPlenaria(inscricaoId, eventoId) {
  const modalidadePlenariaId = await portalObterModalidadePlenariaId();
  if (!modalidadePlenariaId) return false;
  return await portalInscricaoJaCredenciadaModalidade(inscricaoId, eventoId, modalidadePlenariaId);
}

async function portalCredenciarPlenaria(inscricaoId, eventoId, clubeNome, delegadoNato) {
  const modalidadePlenariaId = await portalObterModalidadePlenariaId();
  if (!modalidadePlenariaId || !inscricaoId || !eventoId) return { ok: false, erro: 'Dados incompletos ou modalidade Plenária não disponível.' };
  const table = PORTAL_SUPABASE_TABLES.eventos_credenciamento_modalidade;
  const payload = { evento_id: eventoId, inscricao_id: inscricaoId, modalidade_id: modalidadePlenariaId };
  if (typeof delegadoNato === 'boolean') payload.delegado_nato = delegadoNato;
  const resp = await portalSupabaseFetch(`${table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, payload: JSON.stringify(payload) });
  const code = resp.getResponseCode();
  const body = resp.getContentText() || '';
  if (code === 201) return { ok: true };
  if (code === 409) return { ok: true, jaExistia: true };
  let msg = 'Falha ao registrar credenciamento na plenária.';
  try {
    const err = body ? JSON.parse(body) : null;
    if (err && (err.message || err.details || err.hint)) msg += ' ' + (err.message || err.details || err.hint || '');
    else if (body && body.length < 200) msg += ' Resposta: ' + body;
  } catch (e) {}
  return { ok: false, erro: msg };
}

async function portalListarCredenciadosPlenaria(eventoId) {
  const modalidadePlenariaId = await portalObterModalidadePlenariaId();
  if (!modalidadePlenariaId || !eventoId) return [];
  const creds = await portalListarCredenciadosModalidadeDetalhado(eventoId, modalidadePlenariaId);
  const credTable = PORTAL_SUPABASE_TABLES.eventos_credenciamento_modalidade;
  const resp = await portalSupabaseFetch(`${credTable}?evento_id=eq.${encodeURIComponent(String(eventoId))}&modalidade_id=eq.${encodeURIComponent(modalidadePlenariaId)}&select=inscricao_id,delegado_nato`, { method: 'GET' });
  const mapaDelegadoNato = {};
  if (resp.getResponseCode() === 200) {
    const rows = JSON.parse(resp.getContentText() || '[]') || [];
    rows.forEach(function(r) {
      const iid = String(r.inscricao_id || r.inscricaoId || '').trim();
      mapaDelegadoNato[iid.toLowerCase()] = r.delegado_nato === true;
    });
  }
  return (creds || []).map(function(c) {
    const iid = String(c.inscricaoId || c.inscricao_id || '').trim();
    return { inscricaoId: iid, clubeNome: c.clubeNome || '', pessoaNome: c.pessoaNome || '—', delegado_nato: mapaDelegadoNato[iid.toLowerCase()] === true, delegadoNato: mapaDelegadoNato[iid.toLowerCase()] === true };
  });
}

// === Past-Presidentes (Delegado Nato) ===
async function portalListarPastPresidentes() {
  const table = PORTAL_SUPABASE_TABLES.past_presidentes;
  const resp = await portalSupabaseFetch(`${table}?select=*&order=ano_leonistico.desc,clube_nome.asc,pessoa_nome.asc`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) return [];
  const rows = JSON.parse(resp.getContentText() || '[]');
  return Array.isArray(rows) ? rows : [];
}

async function portalInserirPastPresidente(clubeNome, pessoaNome, anoLeonistico) {
  const table = PORTAL_SUPABASE_TABLES.past_presidentes;
  if (!clubeNome || !pessoaNome) return { ok: false, erro: 'Clube e pessoa são obrigatórios.' };
  const payload = { clube_nome: String(clubeNome).trim(), pessoa_nome: String(pessoaNome).trim() };
  if (anoLeonistico && String(anoLeonistico).trim()) payload.ano_leonistico = String(anoLeonistico).trim();
  const resp = await portalSupabaseFetch(`${table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, payload: JSON.stringify(payload) });
  if (resp.getResponseCode() !== 201) return { ok: false, erro: 'Falha ao cadastrar.' };
  return { ok: true };
}

async function portalRemoverPastPresidente(id) {
  const table = PORTAL_SUPABASE_TABLES.past_presidentes;
  if (!id) return { ok: false, erro: 'ID inválido.' };
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(id))}`, { method: 'DELETE' });
  if (resp.getResponseCode() !== 200 && resp.getResponseCode() !== 204) return { ok: false, erro: 'Falha ao remover.' };
  return { ok: true };
}

async function portalAtualizarPastPresidente(id, dados) {
  const table = PORTAL_SUPABASE_TABLES.past_presidentes;
  if (!id) return { ok: false, erro: 'ID inválido.' };
  var payload = {};
  var al = dados && (dados.ano_leonistico !== undefined ? dados.ano_leonistico : dados.anoLeonistico);
  if (al !== undefined) payload.ano_leonistico = String(al).trim() || null;
  if (Object.keys(payload).length === 0) return { ok: true };
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(id))}`, { method: 'PATCH', payload: JSON.stringify(payload) });
  if (resp.getResponseCode() !== 200 && resp.getResponseCode() !== 204) return { ok: false, erro: 'Falha ao atualizar.' };
  return { ok: true };
}

async function portalEhPastPresidente(clubeNome, pessoaNome) {
  const list = await portalListarPastPresidentes();
  const clube = String(clubeNome || '').trim().toLowerCase();
  const pessoa = String(pessoaNome || '').trim().toLowerCase();
  return list.some(function (r) {
    return String(r.clube_nome || '').trim().toLowerCase() === clube && String(r.pessoa_nome || '').trim().toLowerCase() === pessoa;
  });
}

async function portalRemoverCredenciamentoPlenaria(inscricaoId, eventoId) {
  const modalidadePlenariaId = await portalObterModalidadePlenariaId();
  if (!modalidadePlenariaId) return { ok: false, erro: 'Modalidade Plenária não disponível.' };
  return await portalRemoverCredenciamentoModalidade(inscricaoId, eventoId, modalidadePlenariaId);
}

async function portalRelatorioInscritosPorClube(eventoId) {
  const inscricoes = await portalListarInscricoesEvento(eventoId);
  const mapa = {};
  inscricoes.forEach(inscricao => {
    const clube = inscricao.clubeNome || 'Sem clube';
    if (!mapa[clube]) mapa[clube] = [];
    mapa[clube].push(inscricao);
  });
  const relatorio = Object.keys(mapa).sort().map(clube => ({
    clubeNome: clube,
    total: mapa[clube].length,
    inscritos: mapa[clube]
  }));
  const comprovantes = await portalListarComprovantesEnvioPorEvento(eventoId) || [];
  const comprovantesPorEnvio = {};
  comprovantes.forEach(item => {
    const envioId = item.envioId || '';
    if (!envioId) return;
    if (!comprovantesPorEnvio[envioId]) comprovantesPorEnvio[envioId] = [];
    comprovantesPorEnvio[envioId].push(item);
  });
  return { relatorio: relatorio, comprovantesPorEnvio: comprovantesPorEnvio };
}

async function portalExcluirInscricoesEventoPorEnvio(eventoId, clubeNome, comprovanteUrl) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  if (!eventoId || !clubeNome || !comprovanteUrl) {
    throw new Error('Evento, clube e comprovante são obrigatórios para exclusão.');
  }
  const path = `${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}` +
    `&clube_nome=eq.${encodeURIComponent(String(clubeNome))}` +
    `&comprovante_url=eq.${encodeURIComponent(String(comprovanteUrl))}`;
  const resp = await portalSupabaseFetch(path, { method: 'DELETE' });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`Supabase excluir inscrições falhou: ${code} ${resp.getContentText()}`);
  }
  return true;
}

async function portalBuscarPrimeiraInscricaoEnvio(eventoId, clubeNome, comprovanteUrl) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  if (!eventoId || !clubeNome || !comprovanteUrl) return null;
  const path = `${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}` +
    `&clube_nome=eq.${encodeURIComponent(String(clubeNome))}` +
    `&comprovante_url=eq.${encodeURIComponent(String(comprovanteUrl))}` +
    `&select=*&order=created_at.asc&limit=1`;
  const resp = await portalSupabaseFetch(path, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalBuscarPrimeiraInscricaoEnvio erro:', resp.getResponseCode(), resp.getContentText());
    return null;
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  const row = rows && rows[0] ? rows[0] : null;
  return row ? portalNormalizeEventoInscricaoRow(row) : null;
}

async function portalContarInscricoesPorEnvio(eventoId, clubeNome, comprovanteUrl) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  if (!eventoId || !clubeNome || !comprovanteUrl) return 0;
  const path = `${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}` +
    `&clube_nome=eq.${encodeURIComponent(String(clubeNome))}` +
    `&comprovante_url=eq.${encodeURIComponent(String(comprovanteUrl))}` +
    `&select=id`;
  const resp = await portalSupabaseFetch(path, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalContarInscricoesPorEnvio erro:', resp.getResponseCode(), resp.getContentText());
    return 0;
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return Array.isArray(rows) ? rows.length : 0;
}

async function portalAtualizarInscricoesEnvioLote(eventoId, clubeNome, comprovanteUrl, comprovanteNome, comprovanteTamanho, novoLoteId, permitirExceder) {
  const table = PORTAL_SUPABASE_TABLES.eventos_inscricoes;
  if (!eventoId || !clubeNome || !novoLoteId) {
    throw new Error('Evento, clube, comprovante e lote são obrigatórios.');
  }
  console.log('portalAtualizarInscricoesEnvioLote: inicio', {
    eventoId: eventoId,
    clubeNome: clubeNome,
    comprovanteUrl: comprovanteUrl,
    comprovanteNome: comprovanteNome,
    comprovanteTamanho: comprovanteTamanho,
    novoLoteId: novoLoteId
  });
  const comprovanteNomeLimpo = String(comprovanteNome || '').trim();
  const comprovanteTamanhoNum = (comprovanteTamanho !== undefined && comprovanteTamanho !== null)
    ? Number(comprovanteTamanho) || 0
    : 0;
  const comprovanteUrlLimpo = String(comprovanteUrl || '').trim();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    let filtro = null;
    let qtdEnvio = 0;
    let primeira = null;
    if (comprovanteUrlLimpo) {
      qtdEnvio = await portalContarInscricoesPorEnvio(eventoId, clubeNome, comprovanteUrlLimpo);
      if (qtdEnvio > 0) {
        filtro = `&comprovante_url=eq.${encodeURIComponent(String(comprovanteUrlLimpo))}`;
        primeira = await portalBuscarPrimeiraInscricaoEnvio(eventoId, clubeNome, comprovanteUrlLimpo);
      }
    }
    if ((!qtdEnvio || qtdEnvio <= 0) && comprovanteNomeLimpo) {
      const pathCount = `${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}` +
        `&clube_nome=eq.${encodeURIComponent(String(clubeNome))}` +
        `&comprovante_nome=eq.${encodeURIComponent(comprovanteNomeLimpo)}` +
        `&select=id` +
        (comprovanteTamanhoNum ? `&comprovante_tamanho=eq.${encodeURIComponent(String(comprovanteTamanhoNum))}` : '');
      const respCount = await portalSupabaseFetch(pathCount, { method: 'GET' });
      if (respCount.getResponseCode() === 200) {
        const rows = JSON.parse(respCount.getContentText() || '[]');
        qtdEnvio = Array.isArray(rows) ? rows.length : 0;
        if (qtdEnvio > 0) {
          filtro = `&comprovante_nome=eq.${encodeURIComponent(comprovanteNomeLimpo)}` +
            (comprovanteTamanhoNum ? `&comprovante_tamanho=eq.${encodeURIComponent(String(comprovanteTamanhoNum))}` : '');
          const pathPrimeira = `${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}` +
            `&clube_nome=eq.${encodeURIComponent(String(clubeNome))}` +
            `${filtro}&select=*&order=created_at.asc&limit=1`;
          const respPrimeira = await portalSupabaseFetch(pathPrimeira, { method: 'GET' });
          if (respPrimeira.getResponseCode() === 200) {
            const rowsPrimeira = JSON.parse(respPrimeira.getContentText() || '[]');
            primeira = rowsPrimeira && rowsPrimeira[0] ? portalNormalizeEventoInscricaoRow(rowsPrimeira[0]) : null;
          }
        }
      }
    }
    if (!qtdEnvio || qtdEnvio <= 0 || !filtro) {
      console.warn('portalAtualizarInscricoesEnvioLote: envio não encontrado', {
        eventoId: eventoId,
        clubeNome: clubeNome,
        comprovanteUrl: comprovanteUrlLimpo,
        comprovanteNome: comprovanteNomeLimpo,
        comprovanteTamanho: comprovanteTamanhoNum
      });
      try {
        const pathDebug = `${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}` +
          `&clube_nome=eq.${encodeURIComponent(String(clubeNome))}` +
          `&select=id,comprovante_url,comprovante_nome,comprovante_tamanho,created_at&order=created_at.asc&limit=5`;
        const respDebug = await portalSupabaseFetch(pathDebug, { method: 'GET' });
        console.warn('portalAtualizarInscricoesEnvioLote: amostra envios', {
          code: respDebug.getResponseCode(),
          body: respDebug.getContentText()
        });
      } catch (e) {
        console.warn('portalAtualizarInscricoesEnvioLote: falha debug', e);
      }
      throw new Error('Envio não encontrado.');
    }
    const loteAntigoId = primeira ? primeira.loteId : null;
    if (loteAntigoId && String(loteAntigoId) === String(novoLoteId)) {
      return { sucesso: true, alterado: false };
    }

    const loteNovo = await portalBuscarLoteEventoPorId(novoLoteId);
    if (!loteNovo) {
      throw new Error('Lote selecionado não encontrado.');
    }
    if (!portalLoteDentroVigencia(loteNovo)) {
      throw new Error('Lote selecionado fora do período de vigência (horário de Brasília).');
    }
    if (!permitirExceder && loteNovo.quantidadeTotal !== null && loteNovo.quantidadeTotal !== undefined) {
      const usadosReais = await portalContarInscricoesPorLote(loteNovo.id);
      const restantes = (loteNovo.quantidadeTotal || 0) - usadosReais;
      if (restantes < qtdEnvio) {
        throw new Error('Lote selecionado sem vagas suficientes para este envio.');
      }
    }

    const payload = {
      lote_id: loteNovo.id,
      lote_nome: loteNovo.nomeLote || '',
      tipo_inscricao: loteNovo.nomeLote || '',
      valor_lote: loteNovo.valor || 0
    };
    const path = `${table}?evento_id=eq.${encodeURIComponent(String(eventoId))}` +
      `&clube_nome=eq.${encodeURIComponent(String(clubeNome))}` +
      `${filtro}`;
    console.log('portalAtualizarInscricoesEnvioLote: atualizando com filtro', { path: path, payload: payload });
    const resp = await portalSupabaseFetch(path, { method: 'PATCH', payload: JSON.stringify(payload) });
    const code = resp.getResponseCode();
    if (code !== 200 && code !== 204) {
      throw new Error(`Supabase atualizar inscrições falhou: ${code} ${resp.getContentText()}`);
    }

    if (loteAntigoId) portalRecalcularQuantidadeUsadaLote(loteAntigoId);
    await portalRecalcularQuantidadeUsadaLote(loteNovo.id);
    return { sucesso: true, alterado: true };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// === Upload de comprovantes ===
function portalNormalizarNomeArquivo(nomeArquivo) {
  if (!nomeArquivo) return 'arquivo';
  const partes = nomeArquivo.split('.');
  const extensaoRaw = partes.length > 1 ? partes[partes.length - 1] : '';
  const extensaoLimpa = extensaoRaw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '');
  const extensao = (extensaoLimpa && extensaoLimpa.length <= 5) ? ('.' + extensaoLimpa.toLowerCase()) : '';
  const nomeSemExtensao = partes.length > 1 ? partes.slice(0, -1).join('.') : nomeArquivo;
  let nomeNormalizado = nomeSemExtensao
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-\.]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!nomeNormalizado || nomeNormalizado.trim() === '') {
    nomeNormalizado = 'arquivo';
  }
  if (nomeNormalizado.length > 100) {
    nomeNormalizado = nomeNormalizado.substring(0, 100);
  }
  return nomeNormalizado + extensao;
}

function portalNormalizarNomeParaPath(texto) {
  if (!texto) return 'nao_informado';
  return String(texto)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'nao_informado';
}

/**
 * Normalização LEGACY para path de bucket - acentos viram underscore (_).
 * São → S_o, Porã → Por_, Ômega X → mega_X. Compatível com mega_Cunha_Por.
 */
function portalNormalizarNomeClubeParaBucketUnificado(clubeNome) {
  if (!clubeNome) return 'sem_clube';
  let s = String(clubeNome).trim();
  // Cada acento/caracter especial → _ (o caractere inteiro é substituído por _)
  const acentos = 'ãõáàâäéèêëíìîïóòôöúùûüçñÃÕÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÇÑ';
  for (let i = 0; i < acentos.length; i++) {
    s = s.split(acentos[i]).join('_');
  }
  // Demais caracteres especiais → _
  s = s.replace(/[^a-zA-Z0-9\s\-]/g, '_');
  s = s.replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  // Ômega no início → mega
  s = s.replace(/^[Oo]mega_/i, 'mega_');
  return s || 'sem_clube';
}

function portalNormalizarNomeClubeParaBucket(clubeNome) {
  if (!clubeNome) return 'sem_clube';
  return portalNormalizarNomeClubeParaBucketUnificado(clubeNome);
}

/**
 * Formato LEGACY dos buckets - usa mesma normalização unificada.
 */
function portalNormalizarNomeClubeParaBucketLegacy(clubeNome) {
  return portalNormalizarNomeClubeParaBucketUnificado(clubeNome);
}

/**
 * Retorna [pathLegacy, pathNovo] para buscar em ambos os formatos de bucket.
 * Legacy primeiro pois é onde estão os arquivos existentes.
 */
function portalObterVariantesPathClubeBucket(clubeNome) {
  const novo = portalNormalizarNomeClubeParaBucket(clubeNome);
  const legacy = portalNormalizarNomeClubeParaBucketLegacy(clubeNome);
  return novo !== legacy ? [legacy, novo] : [novo];
}

/**
 * Path para UPLOAD: usa legacy (mega_*) para não criar pastas duplicadas.
 * Assim novos arquivos vão para as pastas já utilizadas.
 */
function portalNormalizarNomeClubeParaBucketUpload(clubeNome) {
  return portalNormalizarNomeClubeParaBucketLegacy(clubeNome);
}

async function portalUploadComprovanteEvento(blob, nomeArquivo, eventoId, clubeNome, pessoaNome) {
  try {
    if (!blob || !nomeArquivo || !eventoId) {
      throw new Error('Parâmetros obrigatórios faltando');
    }
    const bucket = 'eventos-comprovantes';
    const nomeArquivoNormalizado = portalNormalizarNomeArquivo(nomeArquivo);
    const clubeNormalizado = (typeof portalNormalizarNomeClubeParaBucketUpload === 'function')
      ? portalNormalizarNomeClubeParaBucketUpload(clubeNome || 'sem_clube')
      : portalNormalizarNomeClubeParaBucket(clubeNome || 'sem_clube');
    const pessoaNormalizada = portalNormalizarNomeParaPath(pessoaNome || 'sem_pessoa');
    const eventoNormalizado = portalNormalizarNomeParaPath(eventoId);
    const caminhoArquivo = `eventos/${eventoNormalizado}/${clubeNormalizado}/${pessoaNormalizada}/${nomeArquivoNormalizado}`;
    const mimeType = blob.getContentType() || 'application/octet-stream';
    const url = `${PORTAL_SUPABASE_CONFIG.url}/storage/v1/object/${bucket}/${caminhoArquivo}`;
    const response = await gasStyleFetch(url, {
      method: 'POST',
      headers: {
        'apikey': PORTAL_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${PORTAL_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'true'
      },
      payload: blob.getBytes(),
      muteHttpExceptions: true
    });
    const statusCode = response.getResponseCode();
    if (statusCode >= 200 && statusCode < 300) {
      const urlPublica = `${PORTAL_SUPABASE_CONFIG.url}/storage/v1/object/public/${bucket}/${caminhoArquivo}`;
      return {
        sucesso: true,
        url: urlPublica,
        nomeArquivo: nomeArquivo,
        tamanho: blob.getBytes().length,
        tipo: mimeType
      };
    }
      const errorText = response.getContentText();
      throw new Error(`Erro ao fazer upload: ${statusCode} - ${errorText}`);
  } catch (error) {
    console.error('❌ Erro em portalUploadComprovanteEvento:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Upload da foto de capa do evento para o bucket eventos-fotos.
 * Retorna { sucesso, url, nomeArquivo, tamanho, tipo } ou { sucesso: false, erro }.
 */
async function portalUploadFotoEvento(blob, nomeArquivo, eventoId) {
  try {
    if (!blob || !nomeArquivo || !eventoId) {
      throw new Error('Parâmetros obrigatórios faltando (blob, nomeArquivo, eventoId)');
    }
    const bucket = 'eventos-fotos';
    const nomeArquivoNormalizado = portalNormalizarNomeArquivo(nomeArquivo);
    const eventoNormalizado = portalNormalizarNomeParaPath(eventoId);
    const caminhoArquivo = `eventos/${eventoNormalizado}/foto_${Date.now()}_${nomeArquivoNormalizado}`;
    const mimeType = blob.getContentType() || 'application/octet-stream';
    const url = `${PORTAL_SUPABASE_CONFIG.url}/storage/v1/object/${bucket}/${caminhoArquivo}`;
    const response = await gasStyleFetch(url, {
      method: 'POST',
      headers: {
        'apikey': PORTAL_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${PORTAL_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'true'
      },
      payload: blob.getBytes(),
      muteHttpExceptions: true
    });
    const statusCode = response.getResponseCode();
    if (statusCode >= 200 && statusCode < 300) {
      const urlPublica = `${PORTAL_SUPABASE_CONFIG.url}/storage/v1/object/public/${bucket}/${caminhoArquivo}`;
      return {
        sucesso: true,
        url: urlPublica,
        nomeArquivo: nomeArquivo,
        tamanho: blob.getBytes().length,
        tipo: mimeType
      };
    }
    const errorText = response.getContentText();
    throw new Error(`Erro ao fazer upload da foto do evento: ${statusCode} - ${errorText}`);
  } catch (error) {
    console.error('❌ Erro em portalUploadFotoEvento:', error);
    return { sucesso: false, erro: error.message };
  }
}

async function portalUploadArquivoParaStorage(blob, nomeArquivo, pastaTag, nomeClube, registroId) {
  try {
    if (!blob || !nomeArquivo || !pastaTag || !nomeClube) {
      throw new Error('Parâmetros obrigatórios faltando');
    }

    const clubeNormalizado = (typeof portalNormalizarNomeClubeParaBucketUpload === 'function')
      ? portalNormalizarNomeClubeParaBucketUpload(nomeClube)
      : portalNormalizarNomeClubeParaBucket(nomeClube);
    const registroNormalizado = portalNormalizarNomeParaPath(registroId || 'sem_id');
    const nomeArquivoNormalizado = portalNormalizarNomeArquivo(nomeArquivo);

    let bucket = '';
    let caminhoArquivo = '';

    if (pastaTag === 'FOTOS_OFICIAIS_ATIVIDADES') {
      bucket = 'atividades-fotos';
      caminhoArquivo = `atividades/${clubeNormalizado}/${registroNormalizado}/foto_oficial/${nomeArquivoNormalizado}`;
    } else if (pastaTag === 'FOTOS_OFICIAIS') {
      bucket = 'campanhas-fotos';
      caminhoArquivo = `campanhas/${clubeNormalizado}/${registroNormalizado}/foto_oficial/${nomeArquivoNormalizado}`;
    } else if (pastaTag === 'VIDEOS') {
      bucket = 'campanhas-videos';
      caminhoArquivo = `campanhas/${clubeNormalizado}/${registroNormalizado}/video/${nomeArquivoNormalizado}`;
    } else if (pastaTag === 'OUTRAS_FOTOS') {
      bucket = 'campanhas-fotos';
      caminhoArquivo = `campanhas/${clubeNormalizado}/${registroNormalizado}/outras_fotos/${nomeArquivoNormalizado}`;
    } else {
      throw new Error(`Pasta não definida: ${pastaTag}`);
    }

    const mimeType = blob.getContentType() || 'application/octet-stream';
    const url = `${PORTAL_SUPABASE_CONFIG.url}/storage/v1/object/${bucket}/${caminhoArquivo}`;
    const response = await gasStyleFetch(url, {
      method: 'POST',
      headers: {
        'apikey': PORTAL_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${PORTAL_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'true'
      },
      payload: blob.getBytes(),
      muteHttpExceptions: true
    });

    const statusCode = response.getResponseCode();
    if (statusCode >= 200 && statusCode < 300) {
      const urlPublica = `${PORTAL_SUPABASE_CONFIG.url}/storage/v1/object/public/${bucket}/${caminhoArquivo}`;
      return {
        sucesso: true,
        url: urlPublica,
        nomeArquivo: nomeArquivo,
        tamanho: blob.getBytes().length,
        tipo: mimeType
      };
    }

    const errorText = response.getContentText();
    throw new Error(`Erro ao fazer upload: ${statusCode} - ${errorText}`);
  } catch (error) {
    console.error('❌ Erro em portalUploadArquivoParaStorage:', error);
    return { sucesso: false, erro: error.message };
  }
}

// === CONFIGURAÇÕES (SUPABASE) ===
function portalNormalizeConfiguracaoRow(row) {
  if (!row) return null;
  const snakeToCamel = {
    id: 'id',
    al: 'al',
    trimestre_1_inicio: 'trimestre1Inicio',
    trimestre_1_fim: 'trimestre1Fim',
    trimestre_2_inicio: 'trimestre2Inicio',
    trimestre_2_fim: 'trimestre2Fim',
    trimestre_3_inicio: 'trimestre3Inicio',
    trimestre_3_fim: 'trimestre3Fim',
    trimestre_4_inicio: 'trimestre4Inicio',
    trimestre_4_fim: 'trimestre4Fim',
    ativo: 'ativo',
    created_at: 'createdAt',
    updated_at: 'updatedAt'
  };
  const obj = portalToCamelFromSnake(row, snakeToCamel);
  if (!obj.al) obj.al = '';
  obj.ativo = (obj.ativo === true) || (obj.ativo === 'true') || (obj.ativo === 'Sim');
  return obj;
}

async function portalListarConfiguracoes() {
  const table = PORTAL_SUPABASE_TABLES.configuracoes;
  const resp = await portalSupabaseFetch(`${table}?select=*&order=al.asc`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalListarConfiguracoes erro:', resp.getResponseCode(), resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(portalNormalizeConfiguracaoRow).filter(Boolean);
}

async function portalBuscarConfiguracaoAtiva() {
  const table = PORTAL_SUPABASE_TABLES.configuracoes;
  const resp = await portalSupabaseFetch(`${table}?select=*&ativo=eq.true&order=updated_at.desc&limit=1`, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalBuscarConfiguracaoAtiva erro:', resp.getResponseCode(), resp.getContentText());
    return null;
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  const row = rows && rows[0] ? rows[0] : null;
  return row ? portalNormalizeConfiguracaoRow(row) : null;
}

// === SOLICITAÇÕES DE ALTERAÇÃO (SUPABASE) ===
function portalNormalizeSolicitacaoAlteracaoRow(row) {
  if (!row) return null;
  const snakeToCamel = {
    id: 'id',
    tipo: 'tipo',
    tipo_item: 'tipoItem',
    tipoItem: 'tipoItem',
    item_id: 'itemId',
    itemId: 'itemId',
    clube_nome: 'clubeNome',
    clubeNome: 'clubeNome',
    usuario_email: 'usuarioEmail',
    usuarioEmail: 'usuarioEmail',
    trimestre_solicitado: 'trimestreSolicitado',
    trimestreSolicitado: 'trimestreSolicitado',
    al_solicitado: 'alSolicitado',
    alSolicitado: 'alSolicitado',
    justificativa: 'justificativa',
    dados_anteriores: 'dadosAnteriores',
    dadosAnteriores: 'dadosAnteriores',
    dados_novos: 'dadosNovos',
    dadosNovos: 'dadosNovos',
    status: 'status',
    aprovado_por: 'aprovadoPor',
    aprovadoPor: 'aprovadoPor',
    data_aprovacao: 'dataAprovacao',
    dataAprovacao: 'dataAprovacao',
    observacoes_aprovacao: 'observacoesAprovacao',
    observacoesAprovacao: 'observacoesAprovacao',
    created_at: 'createdAt',
    updated_at: 'updatedAt'
  };
  const obj = portalToCamelFromSnake(row, snakeToCamel);
  if (!obj.tipo) obj.tipo = '';
  if (!obj.tipoItem) obj.tipoItem = '';
  if (!obj.itemId) obj.itemId = '';
  if (!obj.clubeNome) obj.clubeNome = '';
  if (!obj.usuarioEmail) obj.usuarioEmail = '';
  if (!obj.status) obj.status = 'pendente';
  return obj;
}

async function portalListarSolicitacoesAlteracao(status = null) {
  const table = PORTAL_SUPABASE_TABLES.solicitacoes_alteracao;
  let path = `${table}?select=*&order=created_at.desc`;
  if (status) {
    path = `${table}?status=eq.${encodeURIComponent(status)}&select=*&order=created_at.desc`;
  }
  const resp = await portalSupabaseFetch(path, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalListarSolicitacoesAlteracao erro:', resp.getResponseCode(), resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(portalNormalizeSolicitacaoAlteracaoRow).filter(Boolean);
}

async function portalListarSolicitacoesAlteracaoPorClube(clubeNome) {
  const table = PORTAL_SUPABASE_TABLES.solicitacoes_alteracao;
  if (!clubeNome) return [];
  const path = `${table}?clube_nome=eq.${encodeURIComponent(clubeNome)}&select=*&order=created_at.desc`;
  const resp = await portalSupabaseFetch(path, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalListarSolicitacoesAlteracaoPorClube erro:', resp.getResponseCode(), resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(portalNormalizeSolicitacaoAlteracaoRow).filter(Boolean);
}

async function portalBuscarSolicitacaoPorId(solicitacaoId) {
  const table = PORTAL_SUPABASE_TABLES.solicitacoes_alteracao;
  if (!solicitacaoId) return null;
  const path = `${table}?id=eq.${encodeURIComponent(String(solicitacaoId))}&select=*`;
  const resp = await portalSupabaseFetch(path, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalBuscarSolicitacaoPorId erro:', resp.getResponseCode(), resp.getContentText());
    return null;
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  const row = rows && rows[0] ? rows[0] : null;
  return row ? portalNormalizeSolicitacaoAlteracaoRow(row) : null;
}

async function portalCriarSolicitacaoAlteracao(dados) {
  const table = PORTAL_SUPABASE_TABLES.solicitacoes_alteracao;
  const style = await portalDetectTableStyle(table);
  const camelToSnake = {
    tipo: 'tipo',
    tipoItem: 'tipo_item',
    itemId: 'item_id',
    clubeNome: 'clube_nome',
    usuarioEmail: 'usuario_email',
    trimestreSolicitado: 'trimestre_solicitado',
    alSolicitado: 'al_solicitado',
    justificativa: 'justificativa',
    dadosAnteriores: 'dados_anteriores',
    dadosNovos: 'dados_novos',
    status: 'status',
    aprovadoPor: 'aprovado_por',
    dataAprovacao: 'data_aprovacao',
    observacoesAprovacao: 'observacoes_aprovacao',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  };
  const payloadObj = (style === 'snake' || style === 'unknown')
    ? portalToSnakeFromCamel(dados || {}, camelToSnake)
    : Object.assign({}, dados || {});
  const resp = await portalSupabaseFetch(`${table}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    payload: JSON.stringify([payloadObj])
  });
  if (resp.getResponseCode() !== 201 && resp.getResponseCode() !== 200) {
    throw new Error(`Supabase criar solicitação falhou: ${resp.getResponseCode()} ${resp.getContentText()}`);
  }
  const arr = JSON.parse(resp.getContentText() || '[]');
  return arr && arr[0] ? portalNormalizeSolicitacaoAlteracaoRow(arr[0]) : portalNormalizeSolicitacaoAlteracaoRow(payloadObj);
}

async function portalAprovarSolicitacaoAlteracao(solicitacaoId, usuarioEmail, observacoes = '') {
  const table = PORTAL_SUPABASE_TABLES.solicitacoes_alteracao;
  if (!solicitacaoId) throw new Error('Solicitação não informada');
  const payload = {
    status: 'aprovada',
    aprovado_por: usuarioEmail || '',
    data_aprovacao: new Date().toISOString(),
    observacoes_aprovacao: observacoes || ''
  };
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(solicitacaoId))}`, {
    method: 'PATCH',
    payload: JSON.stringify(payload)
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`Supabase aprovar solicitação falhou: ${code} ${resp.getContentText()}`);
  }
  return { sucesso: true };
}

async function portalRejeitarSolicitacaoAlteracao(solicitacaoId, usuarioEmail, observacoes = '') {
  const table = PORTAL_SUPABASE_TABLES.solicitacoes_alteracao;
  if (!solicitacaoId) throw new Error('Solicitação não informada');
  const payload = {
    status: 'rejeitada',
    aprovado_por: usuarioEmail || '',
    data_aprovacao: new Date().toISOString(),
    observacoes_aprovacao: observacoes || ''
  };
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(solicitacaoId))}`, {
    method: 'PATCH',
    payload: JSON.stringify(payload)
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`Supabase rejeitar solicitação falhou: ${code} ${resp.getContentText()}`);
  }
  return { sucesso: true };
}

async function portalCriarConfiguracao(dados) {
  const table = PORTAL_SUPABASE_TABLES.configuracoes;
  const style = await portalDetectTableStyle(table);
  const camelToSnake = {
    trimestre1Inicio: 'trimestre_1_inicio',
    trimestre1Fim: 'trimestre_1_fim',
    trimestre2Inicio: 'trimestre_2_inicio',
    trimestre2Fim: 'trimestre_2_fim',
    trimestre3Inicio: 'trimestre_3_inicio',
    trimestre3Fim: 'trimestre_3_fim',
    trimestre4Inicio: 'trimestre_4_inicio',
    trimestre4Fim: 'trimestre_4_fim',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  };
  const payloadObj = (style === 'snake' || style === 'unknown')
    ? portalToSnakeFromCamel(dados || {}, camelToSnake)
    : Object.assign({}, dados || {});
  const resp = await portalSupabaseFetch(`${table}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    payload: JSON.stringify([payloadObj])
  });
  if (resp.getResponseCode() !== 201 && resp.getResponseCode() !== 200) {
    throw new Error(`Supabase criar configuração falhou: ${resp.getResponseCode()} ${resp.getContentText()}`);
  }
  const arr = JSON.parse(resp.getContentText() || '[]');
  return arr && arr[0] ? portalNormalizeConfiguracaoRow(arr[0]) : portalNormalizeConfiguracaoRow(payloadObj);
}

async function portalAtualizarConfiguracao(configId, dados) {
  const table = PORTAL_SUPABASE_TABLES.configuracoes;
  if (!configId) throw new Error('Configuração não informada');
  const style = await portalDetectTableStyle(table);
  const camelToSnake = {
    trimestre1Inicio: 'trimestre_1_inicio',
    trimestre1Fim: 'trimestre_1_fim',
    trimestre2Inicio: 'trimestre_2_inicio',
    trimestre2Fim: 'trimestre_2_fim',
    trimestre3Inicio: 'trimestre_3_inicio',
    trimestre3Fim: 'trimestre_3_fim',
    trimestre4Inicio: 'trimestre_4_inicio',
    trimestre4Fim: 'trimestre_4_fim',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  };
  const payloadObj = (style === 'snake' || style === 'unknown')
    ? portalToSnakeFromCamel(dados || {}, camelToSnake)
    : Object.assign({}, dados || {});
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(configId))}`, {
    method: 'PATCH',
    payload: JSON.stringify(payloadObj)
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`Supabase atualizar configuração falhou: ${code} ${resp.getContentText()}`);
  }
  return { sucesso: true };
}


// === EIXOS DE CAMPANHA (SUPABASE) ===
function portalNormalizeEixoCampanhaRow(row) {
  if (!row) return null;
  const snakeToCamel = {
    id: 'id',
    al: 'al',
    nome: 'nome',
    tipo: 'tipo',
    created_at: 'createdAt'
  };
  return portalToCamelFromSnake(row, snakeToCamel);
}

async function portalListarEixosCampanha(al) {
  if (!al) return [];
  const table = PORTAL_SUPABASE_TABLES.eixos_campanha;
  const path = `${table}?al=eq.${encodeURIComponent(String(al))}&order=tipo.asc,nome.asc&select=*`;
  const resp = await portalSupabaseFetch(path, { method: 'GET' });
  if (resp.getResponseCode() !== 200) {
    console.error('portalListarEixosCampanha erro:', resp.getResponseCode(), resp.getContentText());
    return [];
  }
  const rows = JSON.parse(resp.getContentText() || '[]');
  return (rows || []).map(portalNormalizeEixoCampanhaRow).filter(Boolean);
}

async function portalCriarEixoCampanha(dados) {
  dados = dados || {};
  const table = PORTAL_SUPABASE_TABLES.eixos_campanha;
  const payload = {
    al: dados.al,
    nome: dados.nome,
    tipo: dados.tipo
  };
  const resp = await portalSupabaseFetch(table, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    payload: JSON.stringify([payload])
  });
  const code = resp.getResponseCode();
  if (code !== 201 && code !== 200) {
    throw new Error(`portalCriarEixoCampanha falhou: ${code} ${resp.getContentText()}`);
  }
  const arr = JSON.parse(resp.getContentText() || '[]');
  return arr && arr[0] ? portalNormalizeEixoCampanhaRow(arr[0]) : portalNormalizeEixoCampanhaRow(payload);
}

async function portalExcluirEixoCampanha(id) {
  const table = PORTAL_SUPABASE_TABLES.eixos_campanha;
  const resp = await portalSupabaseFetch(`${table}?id=eq.${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  });
  const code = resp.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error(`portalExcluirEixoCampanha falhou: ${code} ${resp.getContentText()}`);
  }
  return { sucesso: true };
}

module.exports = {
  PORTAL_USAR_SUPABASE,
  PORTAL_SUPABASE_CONFIG,
  PORTAL_SUPABASE_TABLES,
  portalSupabaseFetch,
  portalDetectTableStyle,
  portalToCamelFromSnake,
  portalToSnakeFromCamel,
  portalNormalizeAtividadeRow,
  portalNormalizeCampanhaRow,
  portalBuscarAtividades,
  portalBuscarCampanhas,
  portalFetchAllRows,
  portalBuscarTodasAtividades,
  portalBuscarTodasCampanhas,
  portalUpsertAtividade,
  portalDeleteAtividade,
  portalUpsertCampanha,
  portalFetchCampanhaOutrasFotosUrl,
  portalPatchCampanhaOutrasFotosUrl,
  portalPatchCampanhaFotoOficialUrl,
  portalPatchCampanhaVideoUrl,
  portalPatchAtividadeFotoOficialUrl,
  portalDeleteCampanha,
  portalDiagnosticoSupabasePortal,
  portalNormalizeEventoRow,
  portalParseLoteInstanteMs,
  portalLoteDentroVigencia,
  portalNormalizeEventoLoteRow,
  portalNormalizeEventoInscricaoRow,
  portalNormalizeEventoEnvioRow,
  portalNormalizeEventoComprovanteRow,
  portalListarEventos,
  portalCriarEvento,
  portalAtualizarEvento,
  portalListarLotesEvento,
  portalCriarLoteEvento,
  portalAtualizarLoteEvento,
  portalExcluirLoteEvento,
  portalObterLoteAtualEvento,
  portalObterLoteAtualEventoReal,
  portalBuscarLoteEventoPorId,
  portalContarInscricoesPorLote,
  portalContarInscricoesMultiplosLotes,
  portalRecalcularQuantidadeUsadaLote,
  portalCriarInscricaoEvento,
  portalListarInscricoesEvento,
  portalContarInscricoesPorEvento,
  portalContarInscricoesEventos,
  portalEventosComLotesAtivos,
  portalListarInscricoesEventoRaw,
  portalListarInscricoesPendentesEvento,
  portalListarPendentesEnvio,
  portalResolverClubeIdPorNome,
  portalCriarEnvioEvento,
  portalCriarComprovanteEnvio,
  portalListarEnviosEvento,
  portalBuscarEnvioEvento,
  portalAtualizarEnvioEvento,
  portalListarInscricoesEnvio,
  portalListarComprovantesEnvio,
  portalExtrairCaminhoComprovanteStorage,
  portalExcluirArquivoStorage,
  portalExcluirComprovanteEnvio,
  portalListarComprovantesEnvioPorEvento,
  portalExcluirEnvioEvento,
  portalAtualizarInscricaoEvento,
  portalAtualizarCargaRefeicoesInscricao,
  portalValidarSaldoRefeicaoInscricao,
  portalConsumirRefeicaoInscricao,
  portalConsumirRefeicoesInscricaoLote,
  portalCredenciarInscricoesModalidadeLote,
  portalAtualizarCargaRefeicoesLote,
  portalListarModalidades,
  portalCriarModalidade,
  portalAtualizarModalidade,
  portalExcluirModalidade,
  portalObterModalidade,
  portalListarModalidadesEvento,
  portalVincularModalidadeEvento,
  portalRemoverModalidadeEvento,
  portalListarBloqueiosModalidade,
  portalCriarBloqueioModalidade,
  portalRemoverBloqueioModalidade,
  portalContarCredenciadosModalidade,
  portalContarCredenciadosModalidadePorClube,
  portalInscricaoJaCredenciadaModalidade,
  portalListarModalidadesQueInscricaoParticipou,
  portalListarModalidadesBloqueadasPor,
  portalListarCredenciamentosEvento,
  portalListarCredenciadosModalidadeDetalhado,
  portalRemoverCredenciamentoModalidade,
  portalListarTodosBloqueiosModalidade,
  portalValidarCredenciamentoModalidade,
  portalCredenciarInscricaoModalidade,
  portalObterModalidadePlenariaId,
  portalContarCredenciadosPlenariaPorClube,
  portalInscricaoJaCredenciadaPlenaria,
  portalCredenciarPlenaria,
  portalListarCredenciadosPlenaria,
  portalListarPastPresidentes,
  portalInserirPastPresidente,
  portalRemoverPastPresidente,
  portalAtualizarPastPresidente,
  portalEhPastPresidente,
  portalRemoverCredenciamentoPlenaria,
  portalRelatorioInscritosPorClube,
  portalExcluirInscricoesEventoPorEnvio,
  portalBuscarPrimeiraInscricaoEnvio,
  portalContarInscricoesPorEnvio,
  portalAtualizarInscricoesEnvioLote,
  portalNormalizarNomeArquivo,
  portalNormalizarNomeParaPath,
  portalNormalizarNomeClubeParaBucketUnificado,
  portalNormalizarNomeClubeParaBucket,
  portalNormalizarNomeClubeParaBucketLegacy,
  portalObterVariantesPathClubeBucket,
  portalNormalizarNomeClubeParaBucketUpload,
  portalUploadComprovanteEvento,
  portalUploadFotoEvento,
  portalUploadArquivoParaStorage,
  portalNormalizeConfiguracaoRow,
  portalListarConfiguracoes,
  portalBuscarConfiguracaoAtiva,
  portalNormalizeSolicitacaoAlteracaoRow,
  portalListarSolicitacoesAlteracao,
  portalListarSolicitacoesAlteracaoPorClube,
  portalBuscarSolicitacaoPorId,
  portalCriarSolicitacaoAlteracao,
  portalAprovarSolicitacaoAlteracao,
  portalRejeitarSolicitacaoAlteracao,
  portalCriarConfiguracao,
  portalAtualizarConfiguracao,
  portalNormalizeEixoCampanhaRow,
  portalListarEixosCampanha,
  portalCriarEixoCampanha,
  portalExcluirEixoCampanha,
};
