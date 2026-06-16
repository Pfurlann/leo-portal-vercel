'use strict';

const { UrlFetchApp, PropertiesService, CacheService, LockService, Utilities, Session, ScriptApp, Logger, MimeType, DriveApp, PORTAL_USAR_SUPABASE, portalBuscarCampanhas, portalBuscarAtividades, portalBuscarTodasAtividades, portalBuscarTodasCampanhas, RTMA_SUPABASE_CONFIG, PLANILHAS_CAMPANHAS, PLANILHAS_ATIVIDADES, SOURCE_PLANILHAS_CLUBES } = require('./gas-compat');
const { gasStyleFetch } = require('./async-fetch-helper');
const rtmaPessoas = require('./rtma_pessoas');
const rtmaSupabase = require('./rtma_supabase');
const rtmaAmigos = require('./rtma_amigos');
const rtmaCache = require('./rtma_cache');
const rtmaUtils = require('./rtma_utils');
const rtmaConfig = require('./rtma_config');
const portalSupabase = require('./portal_supabase');
const sistemaPermissoes = require('./sistema_permissoes_cargos');
// GAS has shared global scope; bridge ALL module function exports so bare-name calls in code.js work in Node.js
function bridgeModuleExportsToGlobal(mod) {
  Object.keys(mod || {}).forEach((k) => {
    if (typeof mod[k] === 'function' && typeof global[k] === 'undefined') {
      global[k] = mod[k];
    }
  });
}
[portalSupabase, rtmaPessoas, rtmaSupabase, rtmaAmigos, rtmaCache, rtmaConfig, rtmaUtils, sistemaPermissoes].forEach(bridgeModuleExportsToGlobal);
// Restore non-function constants from portal_supabase that code.js references by bare name
['PORTAL_SUPABASE_CONFIG', 'PORTAL_SUPABASE_TABLES', 'PORTAL_USAR_SUPABASE'].forEach((k) => {
  if (typeof global[k] === 'undefined' && portalSupabase[k] !== undefined) global[k] = portalSupabase[k];
});
const { RTMA_USAR_SUPABASE } = rtmaSupabase;
global.RTMA_USAR_SUPABASE = RTMA_USAR_SUPABASE;

// === SISTEMA LEO LD-8 UNIFICADO COM VISÃO GERENCIAL ===
// Campanhas + Atividades + Visão Gerencial em um só sistema (v1.6)

// === CONSTANTES ===
const TEMPLATE_CERTIFICADO_ID = '1lbVFXBlqy0BbdohQMyfWQ49zuJ_HjV0O'; // ID do template de certificado
const PASTA_CERTIFICADOS_ID = '1g7qYaZwU8dMpTpVFoZqIhYNxMjXvYwKV'; // Pasta onde os certificados serão salvos

// === MAPEAMENTOS DE PLANILHAS REMOVIDOS ===
// Todas as operações agora usam Supabase diretamente
// As constantes PLANILHAS_CAMPANHAS, PLANILHAS_ATIVIDADES e SOURCE_PLANILHAS_CLUBES foram removidas

// === CONSTANTES ===
const ABA_RTM = "RTMA";
const ABA_AMIGOS = "Amigos LEO e Conselheiros";
const ABA_CAMPANHAS = "Minhas Campanhas";
const ABA_ATIVIDADES = "Minhas Atividades";
const EIXOS_TAB = "Eixos";

const PLANILHA_ACESSO_ID = "1hZ0mpzgIbN0MRmZaYlb4LnNYWL22WYOJO3R8_8JwfR4";
const ABA_ACESSOS = "Acessos Clubes";

const CAMPANHAS_SHEET_ID = "1JfDKS-o26YO-gUaI9URXTw93FXinCM9mGlYCXjMdQ3E";
const FOLDER_FOTOS_OFICIAIS_CAMPANHAS = "1i1Ai1Jd5swscxOLbepfMRShV98-P4Ib7";
const FOLDER_OUTRAS_FOTOS = "1Eh2FIsx8QIebtixn9OpXsTqac0MFAZop";
const FOLDER_VIDEOS = "1OtMHRPiBxPGqOYynQA5HqYaQv3OOqWcA";
const FOLDER_FOTOS_OFICIAIS_ATIVIDADES = "1i1Ai1Jd5swscxOLbepfMRShV98-P4Ib7";

const COL_LINK_FOTO_OFICIAL_CAMPANHAS = 26;
const COL_LINK_VIDEO = 27;
const COL_LINK_OUTRAS_FOTOS = 28;
const COL_LINK_FOTO_OFICIAL_ATIVIDADES = 22;

const SUPABASE_URL_LEO = 'https://bqkttaflhtsdkamgscnf.supabase.co';

function obterServiceRoleKeySupabaseUnificado() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[CONFIG] SUPABASE_SERVICE_ROLE_KEY ausente — chamadas Supabase autenticadas vão falhar.');
}

// === TESTE DE VALIDAÇÃO COMPLETA DAS CAMPANHAS ===
// === FUNÇÕES DE DIRETORIA (NOMINATA) ===

/**
 * Buscar dirigentes (nominata). O filtro de ano leonístico NÃO é aplicado aqui no Supabase:
 * o select #diretoria-filtro-al já restringe no cliente; filtrar ano no servidor fazia o total
 * não subir após um cadastro noutro AL (ex.: filtro 2025-2026 e registo em 2026-2027).
 * @param {string} anoLeonistico - ignorado na query (mantido na assinatura por compatibilidade)
 */
async function buscarTodosDirigentes(clube, anoLeonistico, formacao, profissao) {
  console.log('🔍 Buscando dirigentes:', { clube, anoLeonistico, formacao, profissao });
  
  try {
    // Usar a mesma configuração do RTMA
    const RTMA_SUPABASE_CONFIG = {
      url: 'https://bqkttaflhtsdkamgscnf.supabase.co',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    };
    
    // Construir URL com filtros
    let url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/nominata_dirigentes?select=*&order=created_at.asc`;
    
    // Adicionar filtros (só clube; AL filtra no index.html)
    const filtros = [];
    if (clube && clube.trim() !== '') {
      filtros.push(`clube=eq.${encodeURIComponent(clube.trim())}`);
    }
    if (formacao && formacao.trim() !== '') {
      filtros.push(`formacao=eq.${encodeURIComponent(formacao.trim())}`);
    }
    if (profissao && profissao.trim() !== '') {
      filtros.push(`profissao=eq.${encodeURIComponent(profissao.trim())}`);
    }
    
    if (filtros.length > 0) {
      url += '&' + filtros.join('&');
    }
    
    console.log('📡 URL da query:', url);
    
    // Fazer requisição ao Supabase
    const response = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      console.error('❌ Erro ao buscar dirigentes:', responseCode, responseText);
      return [];
    }
    
    const dirigentes = JSON.parse(responseText);
    console.log('✅ Dirigentes encontrados:', dirigentes.length);
    
    // Mapear campos do Supabase para o formato esperado pelo frontend
    return dirigentes.map(function(dirigente) {
      return {
        id: dirigente.id,
        clube: dirigente.clube,
        cargo: dirigente.cargo,
        nome: dirigente.nome,
        url_foto: dirigente.url_foto,
        linkFoto: dirigente.url_foto, // Alias para compatibilidade
        anoLeonistico: dirigente.ano_leonistico,
        ano_leonistico: dirigente.ano_leonistico, // Alias
        data_cadastro: dirigente.data_cadastro,
        data_edicao: dirigente.data_edicao,
        formacao: dirigente.formacao,
        profissao: dirigente.profissao,
        created_at: dirigente.created_at,
        updated_at: dirigente.updated_at,
        clube_origem_id: dirigente.clube_origem_id || null,
        pessoa_rtma_id: dirigente.pessoa_rtma_id || null,
        pessoa_amigo_id: dirigente.pessoa_amigo_id || null
      };
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar dirigentes:', error);
    return [];
  }
}

/**
 * Dirigentes da nominata cujo campo `clube` é Gabinete Distrital OU Distrito LEO LD-8 (uma só query).
 * Cobre quem está só na nominata e não no RTMA de nenhum clube; evita perder linhas por divergência de filtro.
 * @return {Array<Object>} mesmo formato que buscarTodosDirigentes
 */
async function buscarDirigentesNominataGabineteOuDistrito() {
  console.log('🔍 buscarDirigentesNominataGabineteOuDistrito');
  try {
    var urlBase = 'https://bqkttaflhtsdkamgscnf.supabase.co';
    var key = obterServiceRoleKeySupabaseUnificado();
    var g = encodeURIComponent('Gabinete Distrital');
    var d = encodeURIComponent('Distrito LEO LD-8');
    var url = urlBase + '/rest/v1/nominata_dirigentes?or=(clube.eq.' + g + ',clube.eq.' + d + ')&select=*&order=nome.asc';
    var response = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      console.error('❌ buscarDirigentesNominataGabineteOuDistrito:', response.getResponseCode(), response.getContentText());
      return [];
    }
    var dirigentes = JSON.parse(response.getContentText() || '[]');
    return (dirigentes || []).map(function (dirigente) {
      return {
        id: dirigente.id,
        clube: dirigente.clube,
        cargo: dirigente.cargo,
        nome: dirigente.nome,
        url_foto: dirigente.url_foto,
        linkFoto: dirigente.url_foto,
        anoLeonistico: dirigente.ano_leonistico,
        ano_leonistico: dirigente.ano_leonistico,
        data_cadastro: dirigente.data_cadastro,
        data_edicao: dirigente.data_edicao,
        formacao: dirigente.formacao,
        profissao: dirigente.profissao,
        created_at: dirigente.created_at,
        updated_at: dirigente.updated_at,
        clube_origem_id: dirigente.clube_origem_id || null,
        pessoa_rtma_id: dirigente.pessoa_rtma_id || null,
        pessoa_amigo_id: dirigente.pessoa_amigo_id || null
      };
    });
  } catch (e) {
    console.error('❌ buscarDirigentesNominataGabineteOuDistrito:', e);
    return [];
  }
}

/**
 * Para dirigentes da nominata sem clube_origem_id: resolve clube de origem via pessoas_rtma ou amigos_conselheiros.
 * @param {Array<Object>} dirigentesList
 * @return {{ porPessoaRtmaId: Object<string, {clube_nome: string, clube_id: string|null}>, porAmigoId: Object<string, {clube_nome: string, clube_id: string|null}> }}
 */
async function rtmaBuscarMapaClubeOrigemPorVinculosNominata_(dirigentesList) {
  var vazio = { porPessoaRtmaId: {}, porAmigoId: {} };
  if (!dirigentesList || !dirigentesList.length) return vazio;
  var rtmaIds = [];
  var amigoIds = [];
  for (var i = 0; i < dirigentesList.length; i++) {
    var d = dirigentesList[i];
    if (!d || (d.clube_origem_id != null && String(d.clube_origem_id).trim() !== '')) continue;
    if (d.pessoa_rtma_id != null && String(d.pessoa_rtma_id).trim() !== '') {
      rtmaIds.push(String(d.pessoa_rtma_id).trim());
    }
    if (d.pessoa_amigo_id != null && String(d.pessoa_amigo_id).trim() !== '') {
      amigoIds.push(String(d.pessoa_amigo_id).trim());
    }
  }
  function uniq(arr) {
    var seen = {};
    var out = [];
    for (var j = 0; j < arr.length; j++) {
      var x = arr[j];
      if (!x || seen[x]) continue;
      seen[x] = true;
      out.push(x);
    }
    return out;
  }
  rtmaIds = uniq(rtmaIds);
  amigoIds = uniq(amigoIds);
  if (!rtmaIds.length && !amigoIds.length) return vazio;

  var key = obterServiceRoleKeySupabaseUnificado();
  var base = SUPABASE_URL_LEO;
  var headers = {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json'
  };

  async function fetchInFilter(table, ids, chunkSize) {
    var map = {};
    var size = chunkSize || 40;
    for (var c = 0; c < ids.length; c += size) {
      var chunk = ids.slice(c, c + size);
      if (!chunk.length) continue;
      var inPart = chunk.join(',');
      var url = base + '/rest/v1/' + table + '?id=in.(' + inPart + ')&select=id,clube_nome,clube_id';
      var response = await gasStyleFetch(url, {
        method: 'GET',
        headers: headers,
        muteHttpExceptions: true
      });
      if (response.getResponseCode() !== 200) {
        console.error('rtmaBuscarMapaClubeOrigemPorVinculosNominata_:', table, response.getResponseCode(), response.getContentText());
        continue;
      }
      var rows = JSON.parse(response.getContentText() || '[]');
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        if (!row || row.id == null) continue;
        var idStr = String(row.id).trim();
        map[idStr] = {
          clube_nome: row.clube_nome != null ? String(row.clube_nome).trim() : '',
          clube_id: row.clube_id != null ? String(row.clube_id).trim() : null
        };
      }
    }
    return map;
  }

  return {
    porPessoaRtmaId: rtmaIds.length ? await fetchInFilter('pessoas_rtma', rtmaIds, 40) : {},
    porAmigoId: amigoIds.length ? await fetchInFilter('amigos_conselheiros', amigoIds, 40) : {}
  };
}

/**
 * Listar cargos da nominata por ano leonístico (para exibir no card da pessoa na tela Pessoas).
 * @param {string} anoLeonistico - AL no formato "AAAA-AAAA" (ex: "2025-2026")
 * @return {Array<{clube: string, nome: string, cargo: string}>}
 */
async function listarCargosNominataPorAL(anoLeonistico) {
  try {
    if (!anoLeonistico || String(anoLeonistico).trim() === '') return [];
    var RTMA_SUPABASE_CONFIG = {
      url: 'https://bqkttaflhtsdkamgscnf.supabase.co',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    };
    var url = RTMA_SUPABASE_CONFIG.url + '/rest/v1/nominata_dirigentes?ano_leonistico=eq.' + encodeURIComponent(String(anoLeonistico).trim()) + '&select=clube,nome,cargo';
    var resp = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': 'Bearer ' + RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) return [];
    var rows = JSON.parse(resp.getContentText() || '[]');
    return (rows || []).map(function(r) {
      return {
        clube: String(r.clube || '').trim(),
        nome: String(r.nome || '').trim(),
        cargo: String(r.cargo || '').trim()
      };
    });
  } catch (e) {
    console.error('listarCargosNominataPorAL:', e);
    return [];
  }
}

/**
 * Lista os calendários do Google que o script tem acesso (conta do proprietário do projeto).
 * @return {Object} { sucesso: boolean, calendarios: Array<{id: string, nome: string}>, erro?: string }
 */
function listarCalendariosGoogle() {
  try {
    var calendarios = CalendarApp.getAllCalendars();
    var lista = (calendarios || []).map(function(cal) {
      return { id: String(cal.getId()), nome: String(cal.getName() || cal.getId()) };
    }).filter(function(c) { return c.id && c.nome; });
    return { sucesso: true, calendarios: lista };
  } catch (e) {
    console.error('listarCalendariosGoogle:', e);
    return { sucesso: false, calendarios: [], erro: e.message || String(e) };
  }
}

/**
 * Lista eventos de um calendário em um período (para exibir na agenda do portal).
 * @param {string} calendarId - ID do calendário (ex: xxx@group.calendar.google.com)
 * @param {string} dataInicio - YYYY-MM-DD
 * @param {string} dataFim - YYYY-MM-DD
 * @return {Object} { sucesso: boolean, eventos: Array<{titulo, inicio, fim, allDay}>, erro?: string }
 */
function listarEventosCalendarioGoogle(calendarId, dataInicio, dataFim) {
  try {
    if (!calendarId || !dataInicio || !dataFim) {
      return { sucesso: false, eventos: [], erro: 'calendarId, dataInicio e dataFim são obrigatórios' };
    }
    var cal = CalendarApp.getCalendarById(calendarId);
    if (!cal) return { sucesso: false, eventos: [], erro: 'Calendário não encontrado' };
    var inicio = new Date(dataInicio + 'T00:00:00');
    var fim = new Date(dataFim + 'T23:59:59');
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
      return { sucesso: false, eventos: [], erro: 'Datas inválidas' };
    }
    var events = cal.getEvents(inicio, fim);
    var eventos = (events || []).map(function(ev) {
      var start = ev.getStartTime();
      var end = ev.getEndTime();
      var allDay = ev.isAllDayEvent();
      return {
        titulo: String(ev.getTitle() || '(Sem título)'),
        inicio: allDay ? (start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0') + '-' + String(start.getDate()).padStart(2, '0')) : start.toISOString(),
        fim: allDay ? (end.getFullYear() + '-' + String(end.getMonth() + 1).padStart(2, '0') + '-' + String(end.getDate()).padStart(2, '0')) : end.toISOString(),
        allDay: allDay
      };
    });
    return { sucesso: true, eventos: eventos };
  } catch (e) {
    console.error('listarEventosCalendarioGoogle:', e);
    return { sucesso: false, eventos: [], erro: e.message || String(e) };
  }
}

/**
 * Lista calendários para a agenda do portal: os da conta do script + os que o usuário adicionou (Supabase).
 * Usa PORTAL_SUPABASE_CONFIG definido em portal_supabase.js.
 * @param {string} email - E-mail do usuário logado
 * @return {Object} { sucesso, calendarios: [{ id, nome, favorito }], erro? }
 */
async function listarCalendariosParaAgenda(email) {
  try {
    var idsVistos = {};
    var lista = [];
    var cfs = PORTAL_SUPABASE_CONFIG;
    var calendariosScript = [];
    try {
      calendariosScript = CalendarApp.getAllCalendars() || [];
    } catch (e) { calendariosScript = []; }
    calendariosScript.forEach(function(cal) {
      var id = String(cal.getId());
      if (!idsVistos[id]) { idsVistos[id] = true; lista.push({ id: id, nome: String(cal.getName() || id), favorito: false }); }
    });
    if (email && String(email).trim()) {
      var url = cfs.url + '/rest/v1/portal_calendarios_usuario?email=eq.' + encodeURIComponent(String(email).trim()) + '&select=calendar_id,nome_exibicao';
      var resp = await gasStyleFetch(url, { method: 'GET', headers: { 'apikey': cfs.serviceRoleKey, 'Authorization': 'Bearer ' + cfs.serviceRoleKey }, muteHttpExceptions: true });
      if (resp.getResponseCode() === 200) {
        var rows = JSON.parse(resp.getContentText() || '[]');
        (rows || []).forEach(function(r) {
          var id = String(r.calendar_id || '').trim();
          if (!id || idsVistos[id]) return;
          idsVistos[id] = true;
          lista.push({ id: id, nome: String((r.nome_exibicao || id)).trim() || id, favorito: true });
        });
      }
    }
    return { sucesso: true, calendarios: lista };
  } catch (e) {
    console.error('listarCalendariosParaAgenda:', e);
    return { sucesso: false, calendarios: [], erro: e.message || String(e) };
  }
}

/**
 * Adiciona um calendário à lista do usuário (ingressar em uma agenda).
 * @param {string} email - E-mail do usuário
 * @param {string} calendarId - ID do calendário (ex: xxx@group.calendar.google.com)
 * @param {string} nomeExibicao - Nome para exibir (opcional)
 * @return {Object} { sucesso, erro? }
 */
async function adicionarCalendarioUsuario(email, calendarId, nomeExibicao) {
  try {
    if (!email || !calendarId) return { sucesso: false, erro: 'E-mail e ID do calendário são obrigatórios' };
    var cfs = PORTAL_SUPABASE_CONFIG;
    var id = String(calendarId).trim();
    var nome = String(nomeExibicao || id).trim() || id;
    var url = cfs.url + '/rest/v1/portal_calendarios_usuario';
    var payload = JSON.stringify({ email: String(email).trim(), calendar_id: id, nome_exibicao: nome });
    var resp = await gasStyleFetch(url, {
      method: 'POST',
      headers: { 'apikey': cfs.serviceRoleKey, 'Authorization': 'Bearer ' + cfs.serviceRoleKey, 'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates' },
      payload: payload,
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) return { sucesso: true };
    var errText = resp.getContentText();
    if (errText && errText.indexOf('duplicate') !== -1) return { sucesso: true };
    return { sucesso: false, erro: errText || 'Erro ao adicionar' };
  } catch (e) {
    console.error('adicionarCalendarioUsuario:', e);
    return { sucesso: false, erro: e.message || String(e) };
  }
}

/**
 * Remove um calendário da lista do usuário.
 * @param {string} email - E-mail do usuário
 * @param {string} calendarId - ID do calendário
 * @return {Object} { sucesso, erro? }
 */
async function removerCalendarioUsuario(email, calendarId) {
  try {
    if (!email || !calendarId) return { sucesso: false, erro: 'E-mail e ID do calendário são obrigatórios' };
    var cfs = PORTAL_SUPABASE_CONFIG;
    var url = cfs.url + '/rest/v1/portal_calendarios_usuario?email=eq.' + encodeURIComponent(String(email).trim()) + '&calendar_id=eq.' + encodeURIComponent(String(calendarId).trim());
    var resp = await gasStyleFetch(url, { method: 'DELETE', headers: { 'apikey': cfs.serviceRoleKey, 'Authorization': 'Bearer ' + cfs.serviceRoleKey }, muteHttpExceptions: true });
    return { sucesso: (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) };
  } catch (e) {
    console.error('removerCalendarioUsuario:', e);
    return { sucesso: false, erro: e.message || String(e) };
  }
}

/**
 * Lista eventos de todas as agendas integradas pelo usuário (apenas favoritos) em um período.
 * @param {string} email - E-mail do usuário
 * @param {string} dataInicio - YYYY-MM-DD
 * @param {string} dataFim - YYYY-MM-DD
 * @return {Object} { sucesso, eventos: [{ titulo, inicio, fim, allDay }], erro? }
 */
async function listarEventosAgendasUsuario(email, dataInicio, dataFim) {
  try {
    if (!email || !dataInicio || !dataFim) return { sucesso: false, eventos: [], erro: 'Parâmetros obrigatórios' };
    var cfs = PORTAL_SUPABASE_CONFIG;
    var url = cfs.url + '/rest/v1/portal_calendarios_usuario?email=eq.' + encodeURIComponent(String(email).trim()) + '&select=calendar_id';
    var resp = await gasStyleFetch(url, { method: 'GET', headers: { 'apikey': cfs.serviceRoleKey, 'Authorization': 'Bearer ' + cfs.serviceRoleKey }, muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return { sucesso: true, eventos: [] };
    var rows = JSON.parse(resp.getContentText() || '[]');
    var ids = (rows || []).map(function(r) { return String(r.calendar_id || '').trim(); }).filter(function(id) { return id; });
    if (ids.length === 0) return { sucesso: true, eventos: [] };
    var inicio = new Date(dataInicio + 'T00:00:00');
    var fim = new Date(dataFim + 'T23:59:59');
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return { sucesso: false, eventos: [], erro: 'Datas inválidas' };
    var todos = [];
    ids.forEach(function(calendarId) {
      try {
        var cal = CalendarApp.getCalendarById(calendarId);
        if (!cal) return;
        var events = cal.getEvents(inicio, fim);
        (events || []).forEach(function(ev) {
          var start = ev.getStartTime();
          var end = ev.getEndTime();
          var allDay = ev.isAllDayEvent();
          todos.push({
            titulo: String(ev.getTitle() || '(Sem título)'),
            inicio: allDay ? (start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0') + '-' + String(start.getDate()).padStart(2, '0')) : start.toISOString(),
            fim: allDay ? (end.getFullYear() + '-' + String(end.getMonth() + 1).padStart(2, '0') + '-' + String(end.getDate()).padStart(2, '0')) : end.toISOString(),
            allDay: allDay
          });
        });
      } catch (e) { /* ignorar calendário inacessível */ }
    });
    todos.sort(function(a, b) {
      var ta = (a.inicio || '').substring(0, 19).replace('T', ' ');
      var tb = (b.inicio || '').substring(0, 19).replace('T', ' ');
      return (ta < tb) ? -1 : (ta > tb) ? 1 : 0;
    });
    return { sucesso: true, eventos: todos };
  } catch (e) {
    console.error('listarEventosAgendasUsuario:', e);
    return { sucesso: false, eventos: [], erro: e.message || String(e) };
  }
}

/**
 * Listar clubes para seletor de Dirigente do Gabinete Distrital (exclui Gabinete e Distrito)
 * @return {Object} { sucesso: boolean, clubes: Array<{id, nome}> }
 */
async function listarClubesParaDirigenteGabinete() {
  try {
    const resultado = await listarClubesSupabase();
    if (!resultado.sucesso || !Array.isArray(resultado.clubes)) {
      return { sucesso: false, clubes: [], erro: resultado.erro || 'Erro ao listar clubes' };
    }
    const excluir = ['Gabinete Distrital', 'Distrito LEO LD-8'];
    const clubes = (resultado.clubes || []).filter(function(c) {
      const nome = (c.nome || '').trim();
      return nome && excluir.indexOf(nome) < 0;
    }).sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
    return { sucesso: true, clubes: clubes };
  } catch (e) {
    console.error('listarClubesParaDirigenteGabinete:', e);
    return { sucesso: false, clubes: [], erro: e.message };
  }
}

/**
 * Listar pessoas de um clube para vincular Dirigente do Gabinete Distrital.
 * Inclui: Associados LEO, LEO e LEO/Leão ativos, Amigos LEO e Conselheiros.
 * @param {string} clubeNome - Nome do clube
 * @return {Array} [{ id, nome, tipo, origem, clube_origem_id }]
 */
async function listarPessoasParaDirigenteGabinete(clubeNome) {
  if (!clubeNome || String(clubeNome).trim() === '') return [];
  var clube = String(clubeNome).trim();
  var pessoas = [];
  var mapa = {};
  var clubesMap = (typeof obterMapaClubesSupabase === 'function') ? await obterMapaClubesSupabase() : {};
  var clubeOrigemId = clubesMap[clube] || null;

  try {
    if (typeof buscarPessoasRTMA === 'function') {
      var listaRTMA = (await buscarPessoasRTMA(clube, null, null, null)) || [];
      listaRTMA.forEach(function(p) {
        var status = String(p.status || '').toLowerCase();
        var tipo = String(p.tipo || '').trim();
        var nome = String(p.nome || '').trim();
        if (!nome) return;
        if (status !== 'ativo') return;
        var tiposAceitos = ['Associado LEO', 'Associado LEO e LEO/Leão', 'Associado LEO/Leão'];
        if (tiposAceitos.indexOf(tipo) < 0) return;
        var chave = 'rtma::' + (p.id || '') + '::' + nome;
        if (!mapa[chave]) {
          mapa[chave] = true;
          pessoas.push({ id: p.id, nome: nome, tipo: tipo, origem: 'pessoas_rtma', clube_origem_id: clubeOrigemId });
        }
      });
    }
  } catch (e) { console.warn('listarPessoasParaDirigenteGabinete RTMA:', e); }

  try {
    if (typeof buscarAmigosConselheiros === 'function') {
      var amigos = (await buscarAmigosConselheiros(clube, null)) || [];
      amigos.forEach(function(a) {
        var nome = String(a.nome || '').trim();
        if (!nome) return;
        var tipo = (a.tipo || 'Amigo/Conselheiro').trim();
        var chave = 'amigo::' + (a.id || '') + '::' + nome;
        if (!mapa[chave]) {
          mapa[chave] = true;
          pessoas.push({ id: a.id, nome: nome, tipo: tipo, origem: 'amigos_conselheiros', clube_origem_id: clubeOrigemId });
        }
      });
    }
  } catch (e) { console.warn('listarPessoasParaDirigenteGabinete Amigos:', e); }

  pessoas.sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
  return pessoas;
}

/**
 * Mesma lista de associados + amigos do clube, com id, para a nominata do clube
 * (vínculo evita diferenças de nome vs tabela pessoas ao localizar o e-mail).
 */
async function listarPessoasParaNominataClube(clubeNome) {
  return await listarPessoasParaDirigenteGabinete(clubeNome);
}

/**
 * Buscar nomes disponíveis do RTMA para um clube
 */
async function buscarNomesPorClube(clube) {
  console.log('🔍 Buscando nomes do clube:', clube);

  try {
    // getAssociadosLEO, getLeoLeao e getAmigosConselheiros retornam arrays de *strings* (nomes)
    const associadosLEO = (await getAssociadosLEO(clube)) || [];
    const leoLeao = (typeof getLeoLeao === 'function' ? await getLeoLeao(clube) : []) || [];
    const amigosLEO = (await getAmigosConselheiros(clube)) || [];
    
    const nomes = [];
    function pushUnico(n) {
      const s = String(n || '').trim();
      if (s && nomes.indexOf(s) < 0) nomes.push(s);
    }
    associadosLEO.forEach(pushUnico);
    leoLeao.forEach(pushUnico);
    amigosLEO.forEach(pushUnico);
    nomes.sort(function(a, b) { return a.localeCompare(b, 'pt-BR'); });
    
    console.log('✅ Nomes encontrados:', nomes.length);
    return nomes;
    
  } catch (error) {
    console.error('❌ Erro ao buscar nomes:', error);
    return [];
  }
}

/**
 * Salvar novo dirigente
 */
/**
 * Fazer upload de foto base64 para Supabase Storage
 * @param {string} fotoBase64 - Foto em base64 (data:image/png;base64,...)
 * @param {string} clube - Nome do clube
 * @param {string} nome - Nome do dirigente
 * @param {string} cargo - Cargo do dirigente
 * @param {string} anoLeonistico - Ano Leonístico
 * @returns {string|null} URL pública da foto no Supabase Storage ou null se falhar
 */
async function uploadFotoDirigenteParaSupabase(fotoBase64, clube, nome, cargo, anoLeonistico) {
  if (!fotoBase64 || fotoBase64.trim() === '') {
    return null;
  }
  
  try {
    // Validar formato base64
    if (!fotoBase64.includes(',') || !fotoBase64.match(/^data:(.*);base64,/)) {
      console.warn('Formato base64 inválido');
      return null;
    }
    
    const mimeType = fotoBase64.match(/^data:(.*);base64,/)[1];
    const base64Data = fotoBase64.split(',')[1];
    
    // Validar tipo (apenas PNG)
    if (mimeType.toLowerCase() !== 'image/png') {
      console.warn('Apenas PNG é permitido');
      return null;
    }
    
    // Decodificar base64
    const blob = Utilities.newBlob(
      Buffer.from(base64Data, "base64"),
      'image/png',
      'foto.png'
    );
    
    // Validar tamanho (máximo 5MB)
    if (blob.getBytes().length > 5 * 1024 * 1024) {
      console.warn('Foto muito grande (>5MB)');
      return null;
    }
    
    // Normalizar nome do clube para o bucket
    const clubeNormalizado = clube
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
    
    // Normalizar nome e cargo para o nome do arquivo
    const nomeNormalizado = nome.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
    const cargoNormalizado = cargo.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
    const anoNormalizado = anoLeonistico.replace(/[^a-zA-Z0-9]/g, '_');
    
    // Construir caminho no bucket: {clube}/{ano_leonistico}/{nome}-{cargo}-AL{ano}.png
    const nomeArquivo = `${nomeNormalizado}-${cargoNormalizado}-AL${anoNormalizado}.png`;
    const caminhoArquivo = `${clubeNormalizado}/${anoNormalizado}/${nomeArquivo}`;
    
    // Fazer upload para Supabase Storage
    const RTMA_SUPABASE_CONFIG = {
      url: 'https://bqkttaflhtsdkamgscnf.supabase.co',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    };
    
    const bucket = 'nominata-fotos';
    const url = `${RTMA_SUPABASE_CONFIG.url}/storage/v1/object/${bucket}/${caminhoArquivo}`;
    
    const response = await gasStyleFetch(url, {
      method: 'POST',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'image/png',
        'x-upsert': 'true' // Permite sobrescrever se já existir
      },
      payload: blob.getBytes(),
      muteHttpExceptions: true
    });
    
    const statusCode = response.getResponseCode();
    
    if (statusCode >= 200 && statusCode < 300) {
      // Construir URL pública
      const urlPublica = `${RTMA_SUPABASE_CONFIG.url}/storage/v1/object/public/${bucket}/${caminhoArquivo}`;
      console.log(`✅ Foto enviada com sucesso: ${urlPublica}`);
      return urlPublica;
    } else {
      const errorText = response.getContentText();
      console.warn(`⚠️ Erro ao fazer upload da foto (${statusCode}):`, errorText);
      return null;
    }
    
  } catch (error) {
    console.warn(`⚠️ Erro ao processar foto:`, error.message);
    return null;
  }
}

/**
 * O cliente envia vínculo como JSON string (fiável no google.script.run) ou, em raros casos, objeto.
 */
function normalizarVinculoDirigente(vinculo) {
  if (vinculo == null || vinculo === '') return null;
  var o = vinculo;
  if (typeof vinculo === 'string') {
    var t = String(vinculo).trim();
    if (!t) return null;
    try {
      o = JSON.parse(t);
    } catch (e) {
      return null;
    }
  }
  if (typeof o !== 'object' || o === null) return null;
  var out = {};
  if (o.clube_origem_id != null && o.clube_origem_id !== '') out.clube_origem_id = o.clube_origem_id;
  if (o.pessoa_rtma_id != null && o.pessoa_rtma_id !== '') out.pessoa_rtma_id = String(o.pessoa_rtma_id);
  if (o.pessoa_amigo_id != null && o.pessoa_amigo_id !== '') out.pessoa_amigo_id = String(o.pessoa_amigo_id);
  if (!out.clube_origem_id && !out.pessoa_rtma_id && !out.pessoa_amigo_id) return null;
  return out;
}

async function salvarDirigente(clube, cargo, nome, fotoBase64, anoLeonistico, vinculo) {
  vinculo = normalizarVinculoDirigente(vinculo);
  console.log('💾 Salvando dirigente:', { clube, cargo, nome, anoLeonistico, temFoto: !!fotoBase64, vinculo: vinculo });
  let idemLock = null;
  
  try {
    const RTMA_SUPABASE_CONFIG = {
      url: 'https://bqkttaflhtsdkamgscnf.supabase.co',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    };
    
    // Fazer upload da foto para Supabase Storage se houver
    let urlFoto = null;
    if (fotoBase64 && fotoBase64.trim() !== '') {
      urlFoto = await uploadFotoDirigenteParaSupabase(fotoBase64, clube, nome, cargo, anoLeonistico);
      if (!urlFoto) {
        console.warn('⚠️ Aviso: Foto não pôde ser enviada, mas o dirigente será salvo sem foto');
      }
    }
    
    // Inserir no Supabase
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/nominata_dirigentes`;
    const dados = {
      clube: clube,
      cargo: cargo,
      nome: nome,
      url_foto: urlFoto,
      ano_leonistico: anoLeonistico || '2025-2026',
      data_cadastro: new Date().toISOString()
    };
    if (vinculo && (vinculo.clube_origem_id || vinculo.pessoa_rtma_id || vinculo.pessoa_amigo_id)) {
      if (vinculo.clube_origem_id) dados.clube_origem_id = vinculo.clube_origem_id;
      if (vinculo.pessoa_rtma_id) dados.pessoa_rtma_id = vinculo.pessoa_rtma_id;
      if (vinculo.pessoa_amigo_id) dados.pessoa_amigo_id = vinculo.pessoa_amigo_id;
    }
    
    const anoRef = String(dados.ano_leonistico || '2025-2026').trim();
    var clubeS = String(clube || '').trim();
    var cargoS = String(cargo || '').trim();
    var nomeS = String(nome || '').trim();
    // Duplicata = mesmo clube + cargo + AL + *mesma ficha* (id RTMA / amigo). Nome sozinho gerava
    // bloqueio indevido (homônimos, grafia diferente no nominata vs. select, cache de idempotência colidindo).
    var chaveBusca;
    var urlExistente;
    var b = RTMA_SUPABASE_CONFIG.url + '/rest/v1/nominata_dirigentes?select=id&limit=1';
    if (vinculo && vinculo.pessoa_rtma_id) {
      chaveBusca = clubeS + '|' + cargoS + '|pessoa_rtma:' + vinculo.pessoa_rtma_id + '|' + anoRef;
      urlExistente = b + '&clube=eq.' + encodeURIComponent(clubeS) + '&cargo=eq.' + encodeURIComponent(cargoS) + '&ano_leonistico=eq.' + encodeURIComponent(anoRef) + '&pessoa_rtma_id=eq.' + encodeURIComponent(String(vinculo.pessoa_rtma_id));
    } else if (vinculo && vinculo.pessoa_amigo_id) {
      chaveBusca = clubeS + '|' + cargoS + '|pessoa_amigo:' + vinculo.pessoa_amigo_id + '|' + anoRef;
      urlExistente = b + '&clube=eq.' + encodeURIComponent(clubeS) + '&cargo=eq.' + encodeURIComponent(cargoS) + '&ano_leonistico=eq.' + encodeURIComponent(anoRef) + '&pessoa_amigo_id=eq.' + encodeURIComponent(String(vinculo.pessoa_amigo_id));
    } else {
      chaveBusca = clubeS + '|' + cargoS + '|nome:' + nomeS + '|' + anoRef;
      urlExistente = b + '&clube=eq.' + encodeURIComponent(clubeS) + '&cargo=eq.' + encodeURIComponent(cargoS) + '&nome=eq.' + encodeURIComponent(nomeS) + '&ano_leonistico=eq.' + encodeURIComponent(anoRef);
    }
    const cacheKey = 'IDEMP:nominata_dirigentes:' + Utilities.base64EncodeWebSafe(chaveBusca);
    idemLock = LockService.getScriptLock();
    idemLock.waitLock(10000);
    const cached = lerResultadoIdempotente(cacheKey);
    if (cached && cached.registroId) {
      return { sucesso: true, idempotente: true, dados: [{ id: cached.registroId }] };
    }

    const responseExistente = await gasStyleFetch(urlExistente, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    if (responseExistente.getResponseCode() === 200) {
      const existente = JSON.parse(responseExistente.getContentText() || '[]');
      if (Array.isArray(existente) && existente.length > 0 && existente[0].id) {
        salvarResultadoIdempotente(cacheKey, existente[0].id);
        return { sucesso: true, idempotente: true, dados: existente };
      }
    }

    const response = await gasStyleFetch(url, {
      method: 'POST',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      payload: JSON.stringify(dados),
      muteHttpExceptions: true
    });
    
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (statusCode >= 200 && statusCode < 300) {
      console.log('✅ Dirigente salvo com sucesso');
      const parsed = responseText ? JSON.parse(responseText) : {};
      const novoId = Array.isArray(parsed) ? (parsed[0] && parsed[0].id) : parsed.id;
      if (novoId) salvarResultadoIdempotente(cacheKey, novoId);
      // Provisionamento de acesso (e-mail/Auth) não roda aqui: seria numa 2ª chamada google.script.run
      // no cliente, para o retorno do INSERT ser rápido e serializável (evita timeout / falha silenciosa).
      return {
        sucesso: true,
        dados: parsed
      };
    } else {
      console.error(`❌ Erro ao salvar no Supabase (${statusCode}):`, responseText);
      return {
        sucesso: false,
        erro: `Erro ao salvar: ${responseText}`
      };
    }
  } catch (error) {
    console.error('❌ Erro ao salvar dirigente:', error);
    return {
      sucesso: false,
      erro: error.message
    };
  } finally {
    if (idemLock) {
      try { idemLock.releaseLock(); } catch (e) {}
    }
  }
}

/**
 * Editar dirigente existente
 */
async function editarDirigente(clube, cargoOriginal, nomeOriginal, cargoNovo, nomeNovo, fotoBase64, anoLeonistico, vinculo) {
  vinculo = normalizarVinculoDirigente(vinculo);
  console.log('✏️ Editando dirigente:', { clube, cargoOriginal, nomeOriginal, cargoNovo, nomeNovo, anoLeonistico, vinculo: vinculo });
  
  try {
    const RTMA_SUPABASE_CONFIG = {
      url: 'https://bqkttaflhtsdkamgscnf.supabase.co',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    };
    
    // Buscar o dirigente existente
    const urlBuscar = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/nominata_dirigentes?clube=eq.${encodeURIComponent(clube)}&cargo=eq.${encodeURIComponent(cargoOriginal)}&nome=eq.${encodeURIComponent(nomeOriginal)}&select=*`;
    const responseBuscar = await gasStyleFetch(urlBuscar, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    
    if (responseBuscar.getResponseCode() !== 200) {
      return {
        sucesso: false,
        erro: 'Dirigente não encontrado'
      };
    }
    
    const dirigentes = JSON.parse(responseBuscar.getContentText());
    if (!dirigentes || dirigentes.length === 0) {
      return {
        sucesso: false,
        erro: 'Dirigente não encontrado'
      };
    }
    
    const dirigente = dirigentes[0];
    
    // Fazer upload da nova foto para Supabase Storage se houver
    let urlFoto = dirigente.url_foto; // Manter foto existente por padrão
    if (fotoBase64 && fotoBase64.trim() !== '') {
      const novaUrlFoto = await uploadFotoDirigenteParaSupabase(fotoBase64, clube, nomeNovo, cargoNovo, anoLeonistico);
      if (novaUrlFoto) {
        urlFoto = novaUrlFoto;
      } else {
        console.warn('⚠️ Aviso: Nova foto não pôde ser enviada, mantendo foto existente');
      }
    }
    
    // Atualizar no Supabase
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/nominata_dirigentes?id=eq.${dirigente.id}`;
    const dados = {
      clube: clube,
      cargo: cargoNovo,
      nome: nomeNovo,
      url_foto: urlFoto,
      ano_leonistico: anoLeonistico || dirigente.ano_leonistico || '2025-2026',
      data_edicao: new Date().toISOString()
    };
    if (vinculo) {
      dados.clube_origem_id = vinculo.clube_origem_id || null;
      dados.pessoa_rtma_id = vinculo.pessoa_rtma_id || null;
      dados.pessoa_amigo_id = vinculo.pessoa_amigo_id || null;
    }
    
    const response = await gasStyleFetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      payload: JSON.stringify(dados),
      muteHttpExceptions: true
    });
    
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (statusCode >= 200 && statusCode < 300) {
      console.log('✅ Dirigente editado com sucesso');
      const dadosParsed = responseText ? JSON.parse(responseText) : {};
      return {
        sucesso: true,
        dados: dadosParsed
      };
    } else {
      console.error(`❌ Erro ao editar no Supabase (${statusCode}):`, responseText);
      return {
        sucesso: false,
        erro: `Erro ao editar: ${responseText}`
      };
    }
  } catch (error) {
    console.error('❌ Erro ao editar dirigente:', error);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

/**
 * Remover dirigente
 */
async function removerDirigente(clube, cargo, nome) {
  console.log('🗑️ Removendo dirigente:', { clube, cargo, nome });
  
  try {
    const RTMA_SUPABASE_CONFIG = {
      url: 'https://bqkttaflhtsdkamgscnf.supabase.co',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    };
    
    // Buscar o dirigente (ficha p/ revogar acesso) + id + foto
    const urlBuscar = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/nominata_dirigentes?clube=eq.${encodeURIComponent(clube)}&cargo=eq.${encodeURIComponent(cargo)}&nome=eq.${encodeURIComponent(nome)}&select=*`;
    const responseBuscar = await gasStyleFetch(urlBuscar, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    
    if (responseBuscar.getResponseCode() !== 200) {
      return {
        sucesso: false,
        erro: 'Dirigente não encontrado'
      };
    }
    
    const dirigentes = JSON.parse(responseBuscar.getContentText());
    if (!dirigentes || dirigentes.length === 0) {
      return {
        sucesso: false,
        erro: 'Dirigente não encontrado'
      };
    }
    
    const dirigente = dirigentes[0];

    // Remover foto do Storage se existir
    if (dirigente.url_foto) {
      try {
        // Extrair o path do arquivo a partir da URL pública
        const urlFoto = String(dirigente.url_foto);
        const storagePathMatch = urlFoto.match(/\/storage\/v1\/object\/(?:public\/)?(.+)$/);
        if (storagePathMatch) {
          const filePath = storagePathMatch[1];
          const urlDeleteFoto = `${RTMA_SUPABASE_CONFIG.url}/storage/v1/object/${filePath}`;
          await gasStyleFetch(urlDeleteFoto, {
            method: 'DELETE',
            headers: {
              'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
              'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`
            },
            muteHttpExceptions: true
          });
        }
      } catch (eFoto) {
        console.warn('⚠️ Não foi possível remover foto do Storage:', eFoto.message);
      }
    }

    // Remover do Supabase
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/nominata_dirigentes?id=eq.${dirigente.id}`;
    const response = await gasStyleFetch(url, {
      method: 'DELETE',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      muteHttpExceptions: true
    });
    
    const statusCode = response.getResponseCode();
    
    if (statusCode >= 200 && statusCode < 300) {
      console.log('✅ Dirigente removido com sucesso');
      try {
        const rev = await revogarAcessoPortalAposExcluirNominata(clube, cargo, nome, dirigente);
        if (rev && rev.authExcluido) {
          console.log('✅ Acesso do portal/Auth revogado após excluir nominata');
        } else if (rev && rev.authMantido) {
          console.log('ℹ️ Registro de acesso do nominata removido; Auth mantido (há outro acesso p/ este e-mail)');
        } else if (rev && rev.ignorado) {
          /* cargo sem provision automático */
        } else if (rev && rev.aviso) {
          console.warn('revogarAcesso após excluir nominata:', rev.aviso);
        }
      } catch (eRev) {
        console.warn('revogarAcessoPortalAposExcluirNominata:', eRev);
      }
      return {
        sucesso: true
      };
    } else {
      const responseText = response.getContentText();
      console.error(`❌ Erro ao remover no Supabase (${statusCode}):`, responseText);
      return {
        sucesso: false,
        erro: `Erro ao remover: ${responseText}`
      };
    }
  } catch (error) {
    console.error('❌ Erro ao remover dirigente:', error);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

async function testarSistemaCampanhasCompleto() {
  console.log('🔍 === TESTE COMPLETO DO SISTEMA DE CAMPANHAS ===');
  const clubeTeste = 'Ômega Cunha Porã';
  let resultados = {
    leituraCampanhas: false,
    criacaoId: false,
    buscaPorId: false,
    comentarios: false,
    edicao: false,
    estrutura: false
  };

  try {
    // 1. TESTE DE LEITURA DE CAMPANHAS
    console.log('\n📄 1. Testando leitura de campanhas...');
    const campanhas = await getCampanhasDoClube(clubeTeste);
    console.log(`   ✅ ${campanhas.length} campanhas encontradas`);

    if (campanhas.length > 0) {
      const primeira = campanhas[0];
      console.log(`   ✅ Primeira campanha: ID=${primeira.id}, Título=${primeira.titulo}`);
      console.log(`   ✅ Estrutura: ${Object.keys(primeira).length} campos`);
      resultados.leituraCampanhas = true;

      // Verificar se tem campos de comentários
      const temComentarios = 'comentarioDistrital' in primeira && 'marcadoCorrigido' in primeira && 'quemCorrigiu' in primeira;
      console.log(`   ✅ Campos de comentários: ${temComentarios ? 'Presentes' : 'Ausentes'}`);
    }

    // 2. TESTE DE CRIAÇÃO DE IDS
    console.log('\n🆔 2. Testando criação de IDs...');
    const resultadoMigracao = migrarCampanhasDoClube(clubeTeste);
    console.log(`   ✅ Campanhas migradas: ${resultadoMigracao.campanhasMigradas || 0}`);
    resultados.criacaoId = true;

    // 3. TESTE DE BUSCA POR ID
    console.log('\n🔍 3. Testando busca por ID...');
    const campanhasAtualizadas = await getCampanhasDoClube(clubeTeste);
    if (campanhasAtualizadas.length > 0) {
      const idTeste = campanhasAtualizadas[0].id;
      const campanhaEncontrada = await getCampanhaPorId(clubeTeste, idTeste);
      if (campanhaEncontrada) {
        console.log(`   ✅ Campanha encontrada por ID: ${campanhaEncontrada.titulo}`);
        resultados.buscaPorId = true;
      }
    }

    // 4. TESTE DE COMENTÁRIOS
    console.log('\n💬 4. Testando sistema de comentários...');
    if (campanhasAtualizadas.length > 0) {
      const idTeste = campanhasAtualizadas[0].id;

      // Adicionar comentário
      const resultadoComentario = adicionarComentarioCampanha(
        clubeTeste,
        idTeste,
        'Teste de comentário automático',
        true,
        'Sistema de Teste'
      );
      console.log(`   ✅ Adicionar comentário: ${resultadoComentario.sucesso ? 'OK' : 'ERRO'}`);

      // Obter comentário
      const comentarioLido = obterComentarioCampanha(clubeTeste, idTeste);
      console.log(`   ✅ Ler comentário: ${comentarioLido.comentario ? 'OK' : 'ERRO'}`);
      console.log(`   ✅ Marcado como corrigido: ${comentarioLido.marcadoCorrigido ? 'Sim' : 'Não'}`);
      console.log(`   ✅ Quem corrigiu: ${comentarioLido.quemCorrigiu || 'Não informado'}`);

      if (resultadoComentario.sucesso && comentarioLido.comentario) {
        resultados.comentarios = true;
      }
    }

    // 5. TESTE DE ESTRUTURA FINAL
    console.log('\n🏗️ 5. Validando estrutura final...');
    const estruturaFinal = validarEstruturaCampanhasCompleta();
    console.log(`   ✅ Estrutura real: ${estruturaFinal.totalColunas} colunas`);
    console.log(`   ✅ Upload - Foto: Col ${estruturaFinal.colunasUpload.fotoOficial}`);
    console.log(`   ✅ Upload - Video: Col ${estruturaFinal.colunasUpload.video}`);
    console.log(`   ✅ Upload - Outras: Col ${estruturaFinal.colunasUpload.outrasfotos}`);
    resultados.estrutura = true;

  } catch (error) {
    console.error(`❌ ERRO NO TESTE: ${error.message}`);
  }

  // RESUMO FINAL
  console.log('\n🎆 === RESUMO DOS TESTES ===');
  Object.entries(resultados).forEach(([teste, sucesso]) => {
    console.log(`   ${sucesso ? '✅' : '❌'} ${teste}: ${sucesso ? 'PASSOU' : 'FALHOU'}`);
  });

  const todosSucessos = Object.values(resultados).every(r => r === true);
  console.log(`\n🎯 RESULTADO GERAL: ${todosSucessos ? '✅ TUDO FUNCIONANDO!' : '❌ PROBLEMAS ENCONTRADOS'}`);

  return {
    sucesso: todosSucessos,
    detalhes: resultados,
    clube: clubeTeste
  };
}

// === TESTE DE VALIDAÇÃO COMPLETA ===
function validarSistemaComentarios() {
  console.log('🔍 === VALIDAÇÃO DO SISTEMA DE COMENTÁRIOS ATUALIZADA ===');

  console.log('\n📋 CAMPANHAS:');
  console.log('   ✅ Comentário Distrital: Coluna AE (31)');
  console.log('   ✅ Marcado como Corrigido: Coluna AF (32)');
  console.log('   ✅ Quem Corrigiu: Coluna AG (33)');
  console.log('   ✅ ID Único: Coluna AD (30)');
  console.log('   ✅ Resultado: Funções funcionam normalmente - SEM CONFLITOS');

  console.log('\n📋 ATIVIDADES:');
  console.log('   ✅ Comentário Distrital: Coluna W (24)');
  console.log('   ✅ Marcado como Corrigido: Coluna X (25)');
  console.log('   ✅ Quem Corrigiu: Coluna Y (26)');
  console.log('   ✅ ID Único: Coluna Z (27)');
  console.log('   ✅ Resultado: Funções funcionam normalmente - SEM CONFLITOS');

  console.log('\n🎆 NOVA ESTRUTURA CAMPANHAS:');
  console.log('   A-AC: Estrutura original (29 colunas)');
  console.log('   AD: ID Único');
  console.log('   AE: Comentário Distrital');
  console.log('   AF: Marcado como Corrigido');
  console.log('   AG: Quem Corrigiu');
  console.log('   Total: 33 colunas');

  return {
    campanhas: {
      comentarios: true,
      colunas: {
        comentario: 31,
        marcado: 32,
        quemCorrigiu: 33,
        idUnico: 30
      }
    },
    atividades: {
      comentarios: true,
      colunas: {
        comentario: 24,
        marcado: 25,
        quemCorrigiu: 26,
        idUnico: 27
      }
    }
  };
}

function validarEstruturaCampanhasCompleta() {
  console.log('🔍 === VALIDAÇÃO COMPLETA DA ESTRUTURA DE CAMPANHAS ===');

  // Estrutura esperada (baseada no que o usuário enviou)
  const estruturaReal = [
    'Carimbo Data e Hora',           // A (0)
    'AL',                            // B (1)
    'Trimestre',                     // C (2)
    'Clube',                         // D (3)
    'Titulo Campanha',               // E (4)
    'Objetivo Campanha',             // F (5)
    'Data e Hora início',            // G (6)
    'Data e Hora Fim',               // H (7)
    'Coordenador(a)',                // I (8)
    'Comissão',                      // J (9)
    'Membros na Comissão',           // K (10)
    'Associados Presentes',          // L (11)
    'Quantidade Associados Presentes', // M (12)
    'Pré LEO`s Presentes',           // N (13)
    'Quantidade Pré LEO`s Presentes', // O (14)
    'Amigos LEO e Conselheiros Presentes', // P (15)
    'Quantidade Conselheiros e Amigos LEO Presentes', // Q (16)
    'Pessoas Impactadas',            // R (17)
    'Custo Campanha',                // S (18)
    'Companheiros Leões Presentes',  // T (19)
    'Horas trabalhadas por pessoa',  // U (20)
    'Horas Totais Trabalhadas',      // V (21)
    'Descrição Campanha',            // W (22)
    'Eixo D8',                       // X (23)
    'Eixo DM',                       // Y (24)
    'Foto Oficial',                  // Z (25) - COL 26
    'Video Campanha',                // AA (26) - COL 27
    'Outras Fotos',                  // AB (27) - COL 28
    'Texto HTML',                    // AC (28) - COL 29
    'ID Único'                       // AD (29) - COL 30
  ];

  console.log('📋 Estrutura real esperada (29 campos + ID):');
  estruturaReal.forEach((campo, index) => {
    const letra = index < 26 ? String.fromCharCode(65 + index) : `A${String.fromCharCode(65 + (index - 26))}`;
    console.log(`   ${letra} (${index}): ${campo}`);
  });

  console.log('\n🔧 Verificando constantes de colunas:');
  console.log(`   FOTO_OFICIAL: Coluna ${COL_LINK_FOTO_OFICIAL_CAMPANHAS} (deveria ser 26 para Z)`);
  console.log(`   VIDEO: Coluna ${COL_LINK_VIDEO} (deveria ser 27 para AA)`);
  console.log(`   OUTRAS_FOTOS: Coluna ${COL_LINK_OUTRAS_FOTOS} (deveria ser 28 para AB)`);

  console.log('\n✅ Validação:');
  console.log(`   ✅ Foto Oficial: ${COL_LINK_FOTO_OFICIAL_CAMPANHAS === 26 ? 'CORRETO' : 'INCORRETO'}`);
  console.log(`   ✅ Video: ${COL_LINK_VIDEO === 27 ? 'CORRETO' : 'INCORRETO'}`);
  console.log(`   ✅ Outras Fotos: ${COL_LINK_OUTRAS_FOTOS === 28 ? 'CORRETO' : 'INCORRETO'}`);

  return {
    estruturaReal,
    totalColunas: estruturaReal.length,
    colunasUpload: {
      fotoOficial: COL_LINK_FOTO_OFICIAL_CAMPANHAS,
      video: COL_LINK_VIDEO,
      outrasfotos: COL_LINK_OUTRAS_FOTOS
    }
  };
}

// === FUNÇÃO PRINCIPAL ===
// Função doGet removida - usando a versão mais completa abaixo

// === SISTEMA DE LOGIN COM SUPABASE AUTH ===
// Função legada verificarLogin() removida - agora usa Supabase Auth no frontend
// Esta função é mantida apenas para compatibilidade durante a migração

/**
 * Verificar autenticação via token JWT do Supabase Auth
 * @param {string} token - Token JWT do Supabase Auth
 * @return {Object} Resultado da verificação
 */
async function verificarAutenticacao(token) {
  try {
    // Obter Service Role Key das propriedades do script (não hardcoded)
    const props = PropertiesService.getScriptProperties();
    const serviceRoleKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = 'https://bqkttaflhtsdkamgscnf.supabase.co';
    
    if (!serviceRoleKey) {
      console.error('Service Role Key não configurada. Configure em PropertiesService.');
      return { sucesso: false, erro: "Erro de configuração do servidor" };
    }
    
    if (!token) {
      return { sucesso: false, erro: "Token não fornecido" };
    }
    
    // Validar token JWT com Supabase
    const url = `${supabaseUrl}/auth/v1/user`;
    const response = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      console.error('Erro ao validar token:', response.getResponseCode(), response.getContentText());
      return { sucesso: false, erro: "Token inválido ou expirado" };
    }
    
    const userData = JSON.parse(response.getContentText());
    
    if (!userData || !userData.id) {
      return { sucesso: false, erro: "Dados do usuário inválidos" };
    }
    
    // Buscar dados adicionais na tabela usuarios_acessos
    const emailLower = (userData.email || '').toLowerCase().trim();
    const urlUsuarios = `${supabaseUrl}/rest/v1/usuarios_acessos?or=(email.eq.${encodeURIComponent(emailLower)},auth_user_id.eq.${userData.id})&select=id,clube_nome,tipo_acesso,ativo,clube_id`;
    const responseUsuarios = await gasStyleFetch(urlUsuarios, {
      method: 'GET',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    
    if (responseUsuarios.getResponseCode() !== 200) {
      console.error('Erro ao buscar dados do usuário:', responseUsuarios.getResponseCode());
      return { sucesso: false, erro: "Erro ao buscar dados do usuário" };
    }
    
    const dadosUsuarios = JSON.parse(responseUsuarios.getContentText() || '[]');
    
    if (!Array.isArray(dadosUsuarios) || dadosUsuarios.length === 0) {
      return { sucesso: false, erro: "Usuário não encontrado na base de dados" };
    }
    
    const acesso = dadosUsuarios[0];
    
    if (acesso.ativo === false || acesso.ativo === null) {
      console.log(`❌ Tentativa de acesso com usuário inativo: ${emailLower}`);
      return { sucesso: false, erro: "Acesso inativo. Entre em contato com a administração do sistema." };
    }
    
    const tipoAcessoRaw = String(acesso.tipo_acesso || '').toLowerCase().trim();
    const tipoAcessoMap = {
      distrito: 'distrital',
      regiao: 'regional',
      evento: 'eventos',
      clube: 'clube'
    };
    const tipoAcessoNormalizado = tipoAcessoMap[tipoAcessoRaw] || tipoAcessoRaw;
    const regiaoNormalizada = (tipoAcessoRaw === 'distrito' || tipoAcessoRaw === 'regiao') ? 'Total' : '';
    const clubeId = acesso.clube_id || null;
    
    return {
      sucesso: true,
      usuario: {
        id: userData.id,
        clube: acesso.clube_nome || '',
        clubeId: clubeId,
        email: emailLower,
        regiao: regiaoNormalizada,
        tipoAcesso: tipoAcessoNormalizado,
        driveId: '',
        isDistrito: tipoAcessoRaw === 'distrito',
        isRegiao: tipoAcessoRaw === 'regiao'
      },
      erro: null
    };
    
  } catch (error) {
    console.error("Erro ao verificar autenticação:", error);
    return { sucesso: false, erro: "Erro interno do sistema" };
  }
}

/**
 * Função legada - mantida para compatibilidade durante migração
 * @deprecated Use Supabase Auth no frontend
 */
function verificarLogin(email, senha) {
  console.warn('⚠️ verificarLogin() está deprecated. Use Supabase Auth no frontend.');
  return { sucesso: false, erro: "Sistema de login atualizado. Use Supabase Auth." };
}

// === SISTEMA DE PERMISSÕES BASEADO EM CARGOS ===
// Funções importadas de sistema_permissoes_cargos.js

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
 * E-mail (amigos_conselheiros) por ID da ficha.
 * @return {string|null} e-mail em minúsculas ou null
 */
async function buscarEmailAmigoConselheiroPorId(amigoId) {
  try {
    if (!amigoId) return null;
    const serviceRoleKey = obterServiceRoleKeySupabaseUnificado();
    const supabaseUrl = SUPABASE_URL_LEO;
    const url = `${supabaseUrl}/rest/v1/amigos_conselheiros?id=eq.${encodeURIComponent(String(amigoId))}&select=Email,email&limit=1`;
    const response = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) return null;
    const rows = JSON.parse(response.getContentText() || '[]');
    if (Array.isArray(rows) && rows[0]) {
      const em = rows[0].Email != null ? rows[0].Email : rows[0].email;
      if (em) return String(em).trim().toLowerCase();
    }
    return null;
  } catch (e) {
    console.error('buscarEmailAmigoConselheiroPorId:', e);
    return null;
  }
}

/**
 * E-mail da ficha RTMA por ID — a lista do modal vem de pessoas_rtma; tabela pessoas é só fallback legado.
 * @return {string|null} e-mail em minúsculas ou null
 */
async function buscarEmailPessoasPorId(pessoaId) {
  try {
    if (!pessoaId) return null;
    const serviceRoleKey = obterServiceRoleKeySupabaseUnificado();
    const supabaseUrl = SUPABASE_URL_LEO;
    const idEnc = encodeURIComponent(String(pessoaId));
    const headers = {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    };
    // Origem do vínculo: tabela pessoas_rtma (id da ficha no RTMA Supabase)
    const urlRtma = `${supabaseUrl}/rest/v1/pessoas_rtma?id=eq.${idEnc}&select=email&limit=1`;
    const responseRtma = await gasStyleFetch(urlRtma, {
      method: 'GET',
      headers: headers,
      muteHttpExceptions: true
    });
    if (responseRtma.getResponseCode() === 200) {
      const rowsR = JSON.parse(responseRtma.getContentText() || '[]');
      if (Array.isArray(rowsR) && rowsR[0]) {
        var eR = rowsR[0].email != null && rowsR[0].email !== '' ? rowsR[0].email : rowsR[0].Email;
        if (eR) return String(eR).trim().toLowerCase();
      }
    }
    // Fallback: alguns fluxos antigos usavam a tabela pessoas
    const urlLeg = `${supabaseUrl}/rest/v1/pessoas?id=eq.${idEnc}&select=email&limit=1`;
    const response = await gasStyleFetch(urlLeg, {
      method: 'GET',
      headers: headers,
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) return null;
    const rows = JSON.parse(response.getContentText() || '[]');
    if (Array.isArray(rows) && rows[0]) {
      var em = rows[0].email != null && rows[0].email !== '' ? rows[0].email : rows[0].Email;
      if (em) return String(em).trim().toLowerCase();
    }
    return null;
  } catch (e) {
    console.error('buscarEmailPessoasPorId:', e);
    return null;
  }
}

/**
 * Resolve o e-mail RTMA: prioriza ficha (pessoa_rtma_id), depois nome + clube.
 */
async function buscarEmailPessoaRtmParaDirigente(clubeNome, nome, vinculo) {
  try {
    if (vinculo && vinculo.pessoa_rtma_id) {
      const porId = await buscarEmailPessoasPorId(vinculo.pessoa_rtma_id);
      if (porId) return porId;
    }
    if (vinculo && vinculo.pessoa_amigo_id) {
      const eAm = await buscarEmailAmigoConselheiroPorId(vinculo.pessoa_amigo_id);
      if (eAm) return eAm;
    }
    return await buscarEmailNaNominataPorNome(nome, clubeNome);
  } catch (e) {
    console.warn('buscarEmailPessoaRtmParaDirigente:', e);
    return null;
  }
}

async function buscarEmailNaNominataPorNome(nome, clubeNome) {
  try {
    const serviceRoleKey = obterServiceRoleKeySupabaseUnificado();
    const supabaseUrl = SUPABASE_URL_LEO;
    
    var normalizarNome = function(n) {
      return String(n || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };
    var clubesCompativeis = function(cadastro, usado) {
      var a = String(cadastro || '').toLowerCase().replace(/\s+/g, ' ').trim();
      var b = String(usado || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!a || !b) return false;
      if (a === b) return true;
      return a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
    };
    var emailDaLinha = function(p) {
      if (!p) return null;
      if (p.email != null && String(p.email).trim() !== '') return p.email;
      if (p.Email != null && String(p.Email).trim() !== '') return p.Email;
      return null;
    };
    var tentarEmailEmLinhas = function(linhas, nomeFull) {
      var nAlvo = normalizarNome(nomeFull);
      for (var i = 0; i < linhas.length; i++) {
        var p = linhas[i];
        var eml = emailDaLinha(p);
        if (!eml) continue;
        if (normalizarNome(p.nome) === nAlvo) {
          return String(eml).trim().toLowerCase();
        }
      }
      return null;
    };
    
    var nomeNormalizado = normalizarNome(nome);
    var clubeT = String(clubeNome || '').trim();
    
    // 1) Mesmo clube (exact no RTMA) + nome, até 2000 linhas
    var url1 = supabaseUrl + '/rest/v1/pessoas?clube_nome=eq.' + encodeURIComponent(clubeT) + '&select=nome,email,clube_nome&limit=2000';
    var r1 = await gasStyleFetch(url1, {
      method: 'GET',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': 'Bearer ' + serviceRoleKey,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    if (r1.getResponseCode() === 200) {
      var pessoas1 = JSON.parse(r1.getContentText() || '[]');
      var found = tentarEmailEmLinhas(pessoas1, nome);
      if (found) return found;
    }
    
    // 1b) Mesma lógica na tabela pessoas_rtma (onde as fichas reais do RTMA costumam estar)
    var url1rtma = supabaseUrl + '/rest/v1/pessoas_rtma?clube_nome=eq.' + encodeURIComponent(clubeT) + '&select=nome,email,clube_nome&limit=2000';
    var r1rtma = await gasStyleFetch(url1rtma, {
      method: 'GET',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': 'Bearer ' + serviceRoleKey,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    if (r1rtma.getResponseCode() === 200) {
      var pessoasRtma = JSON.parse(r1rtma.getContentText() || '[]');
      var foundRtma = tentarEmailEmLinhas(pessoasRtma, nome);
      if (foundRtma) return foundRtma;
    }
    
    // 2) Ilike pelo último token do nome (API) e depois filtro de nome+clube no script
    var partes = nomeNormalizado.split(/\s+/).filter(Boolean);
    var token = partes.length ? partes[partes.length - 1] : '';
    if (token.length >= 2) {
      var ilike = '*' + token + '*';
      var url3 = supabaseUrl + '/rest/v1/pessoas?select=nome,email,clube_nome&nome=ilike.' + encodeURIComponent(ilike) + '&limit=150';
      var r3 = await gasStyleFetch(url3, {
        method: 'GET',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': 'Bearer ' + serviceRoleKey,
          'Content-Type': 'application/json'
        },
        muteHttpExceptions: true
      });
      if (r3.getResponseCode() === 200) {
        var p3 = JSON.parse(r3.getContentText() || '[]');
        for (var j = 0; j < p3.length; j++) {
          var p = p3[j];
          var emJ = emailDaLinha(p);
          if (!emJ) continue;
          if (normalizarNome(p.nome) !== nomeNormalizado) continue;
          if (clubesCompativeis(p.clube_nome, clubeT)) {
            return String(emJ).trim().toLowerCase();
          }
        }
      }
      var url3rtma = supabaseUrl + '/rest/v1/pessoas_rtma?select=nome,email,clube_nome&nome=ilike.' + encodeURIComponent(ilike) + '&limit=150';
      var r3rtma = await gasStyleFetch(url3rtma, {
        method: 'GET',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': 'Bearer ' + serviceRoleKey,
          'Content-Type': 'application/json'
        },
        muteHttpExceptions: true
      });
      if (r3rtma.getResponseCode() === 200) {
        var p3r = JSON.parse(r3rtma.getContentText() || '[]');
        for (var k = 0; k < p3r.length; k++) {
          var pr = p3r[k];
          var emK = emailDaLinha(pr);
          if (!emK) continue;
          if (normalizarNome(pr.nome) !== nomeNormalizado) continue;
          if (clubesCompativeis(pr.clube_nome, clubeT)) {
            return String(emK).trim().toLowerCase();
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Erro ao buscar email na tabela pessoas:', error);
    return null;
  }
}

/**
 * Buscar cargo na nominata para um usuário
 * @param {string} email - Email do usuário (ou null para buscar por nome)
 * @param {string} clubeNome - Nome do clube
 * @param {string} alAtual - AL atual no formato "AAAA-AAAA"
 * @param {string} tipoAcesso - Tipo de acesso esperado ('secretaria' ou 'campanhas')
 * @return {Object|null} { cargo: string, nome: string, al: string, email: string } ou null se não encontrar
 */
async function buscarCargoNaNominata(email, clubeNome, alAtual, tipoAcesso) {
  try {
    const props = PropertiesService.getScriptProperties();
    const serviceRoleKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = 'https://bqkttaflhtsdkamgscnf.supabase.co';
    
    if (!serviceRoleKey) {
      console.error('Service Role Key não configurada');
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
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^\w\s]/g, '') // Remove caracteres especiais
        .replace(/\s+/g, ' ') // Normaliza espaços
        .trim();
    };
    
    // Se temos email, buscar pessoa pelo email primeiro
    let nomePessoa = null;
    let emailPessoa = email ? email.toLowerCase().trim() : null;
    
    if (email) {
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
      
      if (responsePessoa.getResponseCode() === 200) {
        const pessoas = JSON.parse(responsePessoa.getContentText() || '[]');
        if (pessoas && pessoas.length > 0) {
          nomePessoa = (pessoas[0].nome || '').trim();
        }
      }
    }
    
    // Procurar cargo correspondente
    for (const dirigente of dirigentes) {
      const nomeDirigenteNormalizado = normalizarNome(dirigente.nome);
      
      // Se temos nome da pessoa, comparar
      if (nomePessoa) {
        const nomePessoaNormalizado = normalizarNome(nomePessoa);
        if (nomePessoaNormalizado === nomeDirigenteNormalizado) {
          return {
            cargo: (dirigente.cargo || '').trim(),
            nome: dirigente.nome,
            al: dirigente.ano_leonistico || alAtual,
            email: emailPessoa
          };
        }
      } else {
        // Se não temos nome, mas temos tipo de acesso, buscar email na tabela pessoas
        // Isso é para campanhas e secretaria que usam email do RTMA
        if (tipoAcesso === 'secretaria' || tipoAcesso === 'campanhas') {
          const emailEncontrado = await buscarEmailNaNominataPorNome(dirigente.nome, clubeNome);
          if (emailEncontrado) {
            return {
              cargo: (dirigente.cargo || '').trim(),
              nome: dirigente.nome,
              al: dirigente.ano_leonistico || alAtual,
              email: emailEncontrado
            };
          }
        }
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
 * Gerar senha provisória aleatória
 * @return {string} Senha provisória
 */
function gerarSenhaProvisoria() {
  // Usar UUID criptograficamente seguro como base de entropia
  const uuid = Utilities.getUuid().replace(/-/g, '');
  const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let senha = '';
  for (let i = 0; i < 12; i++) {
    const byte = parseInt(uuid.substr(i * 2, 2), 16);
    senha += caracteres.charAt(byte % caracteres.length);
  }
  return senha;
}

/**
 * Criar usuário no Supabase Auth com senha provisória
 * @param {string} email - Email do usuário
 * @param {string} senhaProvisoria - Senha provisória
 * @return {Object} { sucesso: boolean, userId: string, erro: string }
 */
async function criarUsuarioAuthComSenhaProvisoria(email, senhaProvisoria) {
  try {
    const serviceRoleKey = obterServiceRoleKeySupabaseUnificado();
    const supabaseUrl = SUPABASE_URL_LEO;
    
    const urlAuth = `${supabaseUrl}/auth/v1/admin/users`;
    const payloadAuth = {
      email: email.toLowerCase().trim(),
      password: senhaProvisoria,
      email_confirm: true, // Confirmar email automaticamente
      user_metadata: {
        primeiro_acesso: true,
        senha_provisoria: true,
        criado_em: new Date().toISOString()
      }
    };
    
    const responseAuth = await gasStyleFetch(urlAuth, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payloadAuth),
      muteHttpExceptions: true
    });
    
    const responseCode = responseAuth.getResponseCode();
    const responseText = responseAuth.getContentText();
    
    if (responseCode === 200 || responseCode === 201) {
      const userData = JSON.parse(responseText);
      return {
        sucesso: true,
        userId: userData.user.id,
        erro: null
      };
    } else {
      // Se usuário já existe, retornar sucesso (não é erro)
      if (responseCode === 422 || responseText.includes('already registered')) {
        // Buscar ID do usuário existente
        const urlGet = `${supabaseUrl}/auth/v1/admin/users?email=eq.${encodeURIComponent(email.toLowerCase().trim())}`;
        const responseGet = await gasStyleFetch(urlGet, {
          method: 'GET',
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json'
          },
          muteHttpExceptions: true
        });
        
        if (responseGet.getResponseCode() === 200) {
          const users = JSON.parse(responseGet.getContentText() || '[]');
          if (users && users.length > 0) {
            return {
              sucesso: true,
              userId: users[0].id,
              erro: null
            };
          }
        }
      }
      
      return {
        sucesso: false,
        erro: `Erro ao criar usuário: ${responseCode} - ${responseText}`
      };
    }
    
  } catch (error) {
    console.error('Erro ao criar usuário no Auth:', error);
    return {
      sucesso: false,
      erro: error.toString()
    };
  }
}

/**
 * Enviar email com senha provisória
 * @param {string} email - Email do destinatário
 * @param {string} senhaProvisoria - Senha provisória
 * @param {string} nome - Nome da pessoa
 * @param {string} cargo - Cargo na nominata
 * @return {Object} { sucesso: boolean, erro: string }
 */
/**
 * @param {string} [perfilAcesso] — 'secretaria' | 'campanhas' — texto explicando área permitida
 */
function enviarEmailSenhaProvisoria(email, senhaProvisoria, nome, cargo, perfilAcesso) {
  try {
    const blocoPerfil = perfilAcesso === 'secretaria'
      ? '<p>Seu acesso no portal é <strong>restrito à área de Secretaria</strong> (módulos de secretaria do clube / distrito, conforme aplicável).</p>'
      : (perfilAcesso === 'campanhas'
        ? '<p>Seu acesso no portal é <strong>restrito à área de Campanhas</strong> (módulos de campanhas do clube / distrito, conforme aplicável).</p>'
        : '');
    const assunto = 'Acesso ao LEO Portal - Senha Provisória';
    const corpo = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #495057;">Acesso ao LEO Portal</h2>
            
            <p>Olá ${nome || 'Usuário'},</p>
            
            <p>Você foi cadastrado como <strong>${cargo || 'usuário'}</strong> no LEO Portal e tem acesso ao sistema.</p>
            ${blocoPerfil}
            
            <p><strong>Sua senha provisória é:</strong></p>
            <div style="background: #f8f9fa; border: 2px solid #dee2e6; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center; font-size: 18px; font-weight: bold; letter-spacing: 2px; color: #495057;">
              ${senhaProvisoria}
            </div>
            
            <p><strong>⚠️ IMPORTANTE:</strong></p>
            <ul>
              <li>Esta é uma senha provisória</li>
              <li>Você será solicitado a criar uma nova senha no primeiro acesso</li>
              <li>Guarde esta senha com segurança até fazer o primeiro login</li>
            </ul>
            
            <p>Para acessar o sistema:</p>
            <ol>
              <li>Acesse: <a href="https://leo-portal.vercel.app" style="color: #495057;">https://leo-portal.vercel.app</a></li>
              <li>Digite seu email: <strong>${email}</strong></li>
              <li>Digite a senha provisória acima</li>
              <li>Crie uma nova senha quando solicitado</li>
            </ol>
            
            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 12px;">
              Este é um email automático. Por favor, não responda.
              <br>
              Sistema LEO Portal - Distrito LEO LD-8
            </p>
          </div>
        </body>
      </html>
    `;
    
    MailApp.sendEmail({
      to: email,
      subject: assunto,
      htmlBody: corpo
    });
    
    return { sucesso: true, erro: null };
    
  } catch (error) {
    console.error('Erro ao enviar email:', error);
    return {
      sucesso: false,
      erro: error.toString()
    };
  }
}

/**
 * E-mail para quem já tinha conta Auth: perfil/área atualizado sem reenvio de senha.
 */
function enviarEmailAcessoNominataUsuarioExistente(email, nome, cargo, tipoAcesso) {
  try {
    const bloco = tipoAcesso === 'secretaria'
      ? 'Seu acesso no LEO Portal foi configurado (ou atualizado) para a <strong>área de Secretaria</strong> apenas.'
      : 'Seu acesso no LEO Portal foi configurado (ou atualizado) para a <strong>área de Campanhas</strong> apenas.';
    const assunto = 'LEO Portal — acesso à nominata (perfil definido)';
    const corpo = `
      <html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #495057;">LEO Portal</h2>
          <p>Olá ${nome || 'Usuário'},</p>
          <p>Você foi vinculado à nominata como <strong>${cargo || 'dirigente'}</strong>.</p>
          <p>${bloco}</p>
          <p>Utilize o <strong>mesmo e-mail</strong> e a <strong>senha que você já utiliza</strong> no portal. Se esqueceu a senha, use a opção de recuperação na tela de login.</p>
          <p><a href="https://leo-portal.vercel.app" style="color: #495057;">https://leo-portal.vercel.app</a></p>
          <p style="margin-top: 24px; color: #6c757d; font-size: 12px;">Sistema LEO Portal — Distrito LEO LD-8</p>
        </div>
      </body></html>
    `;
    MailApp.sendEmail({ to: email, subject: assunto, htmlBody: corpo });
    return { sucesso: true, erro: null };
  } catch (error) {
    console.error('enviarEmailAcessoNominataUsuarioExistente:', error);
    return { sucesso: false, erro: String(error) };
  }
}

/**
 * Cria ou atualiza linha em usuarios_acessos (tipo secretaria / campanhas) após vincular nominata.
 */
async function upsertUsuariosAcessosAposNominata(email, clubeNome, tipoAcesso, authUserId) {
  const serviceRoleKey = obterServiceRoleKeySupabaseUnificado();
  const supabaseUrl = SUPABASE_URL_LEO;
  if (!authUserId) return;
  const tipoTabela = tipoAcesso === 'presidente' ? 'distrito' : tipoAcesso;
  const emailNorm = String(email).toLowerCase().trim();
  const urlGet = `${supabaseUrl}/rest/v1/usuarios_acessos?email=eq.${encodeURIComponent(emailNorm)}`;
  const responseGet = await gasStyleFetch(urlGet, {
    method: 'GET',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  });
  if (responseGet.getResponseCode() !== 200) return;
  const usuarios = JSON.parse(responseGet.getContentText() || '[]');
  if (usuarios && usuarios.length > 0) {
    const urlUpdate = `${supabaseUrl}/rest/v1/usuarios_acessos?id=eq.${usuarios[0].id}`;
    await gasStyleFetch(urlUpdate, {
      method: 'PATCH',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      payload: JSON.stringify({
        auth_user_id: authUserId,
        tipo_acesso: tipoTabela,
        ativo: true
      }),
      muteHttpExceptions: true
    });
  } else {
    let clubeId = null;
    const urlClube = `${supabaseUrl}/rest/v1/clubes?nome=eq.${encodeURIComponent(clubeNome)}&select=id&limit=1`;
    const responseClube = await gasStyleFetch(urlClube, {
      method: 'GET',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    if (responseClube.getResponseCode() === 200) {
      const clubes = JSON.parse(responseClube.getContentText() || '[]');
      if (clubes && clubes.length > 0) clubeId = clubes[0].id;
    }
    const urlInsert = `${supabaseUrl}/rest/v1/usuarios_acessos`;
    await gasStyleFetch(urlInsert, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      payload: JSON.stringify({
        email: emailNorm,
        clube_nome: clubeNome,
        clube_id: clubeId,
        tipo_acesso: tipoTabela,
        ativo: true,
        auth_user_id: authUserId
      }),
      muteHttpExceptions: true
    });
  }
}

/**
 * Exclui o usuário no Supabase Auth (API admin). Só chamar se não houver outro acesso em usuarios_acessos.
 * @return {Object} { sucesso: boolean, erro?: string }
 */
async function excluirUsuarioAuthSupabase(userId) {
  if (!userId) return { sucesso: false, erro: 'userId vazio' };
  try {
    const serviceRoleKey = obterServiceRoleKeySupabaseUnificado();
    const supabaseUrl = SUPABASE_URL_LEO;
    const url = supabaseUrl + '/auth/v1/admin/users/' + encodeURIComponent(String(userId));
    const response = await gasStyleFetch(url, {
      method: 'DELETE',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': 'Bearer ' + serviceRoleKey,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    const c = response.getResponseCode();
    if (c >= 200 && c < 300) {
      return { sucesso: true };
    }
    return { sucesso: false, erro: String(c) + ' ' + (response.getContentText() || '') };
  } catch (e) {
    return { sucesso: false, erro: e.message || String(e) };
  }
}

/**
 * Após excluir Secretário(ia) ou Dir. de Campanhas da nominata: remove linha em usuarios_acessos
 * (e-mail + clube + tipo) e, se não restar nenhum acesso com esse e-mail, exclui o user no Auth.
 * Cargos sem provisionamento automático (ex.: Presidente) são ignorados, como no fluxo de criação.
 * @return {Object} { ignorado?, sucesso, authExcluido?, authMantido?, aviso? }
 */
async function revogarAcessoPortalAposExcluirNominata(clube, cargo, nome, dirigenteRow) {
  try {
    const tipoAcesso = determinarTipoAcessoPorCargo(cargo);
    if (tipoAcesso !== 'secretaria' && tipoAcesso !== 'campanhas') {
      return { ignorado: true, sucesso: true };
    }
    const clubeNome = String(clube || '').trim();
    const nomePessoa = String(nome || '').trim();
    if (!clubeNome || !nomePessoa) {
      return { sucesso: false, aviso: 'clube_ou_nome_vazio' };
    }
    var v = null;
    if (dirigenteRow && typeof dirigenteRow === 'object') {
      v = normalizarVinculoDirigente({
        pessoa_rtma_id: dirigenteRow.pessoa_rtma_id,
        pessoa_amigo_id: dirigenteRow.pessoa_amigo_id,
        clube_origem_id: dirigenteRow.clube_origem_id
      });
    }
    const email = await buscarEmailPessoaRtmParaDirigente(clubeNome, nomePessoa, v);
    if (!email) {
      console.warn('revogarAcessoPortalAposExcluirNominata: e-mail não localizado, não é possível alinhar acesso ao RTMA');
      return { sucesso: false, aviso: 'email_nao_encontrado' };
    }
    const emailNorm = String(email).toLowerCase().trim();
    const tipoTabela = tipoAcesso; // alinhado a upsert: secretaria | campanhas
    const serviceRoleKey = obterServiceRoleKeySupabaseUnificado();
    const supabaseUrl = SUPABASE_URL_LEO;
    const urlLinhas = supabaseUrl + '/rest/v1/usuarios_acessos?email=eq.' + encodeURIComponent(emailNorm) + '&clube_nome=eq.' + encodeURIComponent(clubeNome) + '&tipo_acesso=eq.' + encodeURIComponent(tipoTabela) + '&select=id,auth_user_id';
    const rGet = await gasStyleFetch(urlLinhas, {
      method: 'GET',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': 'Bearer ' + serviceRoleKey,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    if (rGet.getResponseCode() !== 200) {
      return { sucesso: false, aviso: 'erro_buscar_acessos' };
    }
    const linhas = JSON.parse(rGet.getContentText() || '[]');
    var authIdMemoria = null;
    for (var i = 0; i < linhas.length; i++) {
      if (linhas[i].auth_user_id) authIdMemoria = linhas[i].auth_user_id;
      const idL = linhas[i].id;
      if (idL == null) continue;
      const urlDel = supabaseUrl + '/rest/v1/usuarios_acessos?id=eq.' + encodeURIComponent(String(idL));
      await gasStyleFetch(urlDel, {
        method: 'DELETE',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': 'Bearer ' + serviceRoleKey,
          'Content-Type': 'application/json'
        },
        muteHttpExceptions: true
      });
    }
    const rRest = await gasStyleFetch(
      supabaseUrl + '/rest/v1/usuarios_acessos?email=eq.' + encodeURIComponent(emailNorm) + '&select=id',
      {
        method: 'GET',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': 'Bearer ' + serviceRoleKey,
          'Content-Type': 'application/json'
        },
        muteHttpExceptions: true
      }
    );
    const restantes = rRest.getResponseCode() === 200 ? JSON.parse(rRest.getContentText() || '[]') : [];
    if (restantes && restantes.length > 0) {
      return { sucesso: true, authMantido: true, acessosRemovidos: linhas.length };
    }
    if (linhas.length === 0) {
      return { sucesso: true, aviso: 'nenhum_registro_acesso_nominata' };
    }
    const urlUser = supabaseUrl + '/auth/v1/admin/users?email=eq.' + encodeURIComponent(emailNorm);
    const rU = await gasStyleFetch(urlUser, {
      method: 'GET',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': 'Bearer ' + serviceRoleKey,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    var uid = null;
    if (rU.getResponseCode() === 200) {
      const users = JSON.parse(rU.getContentText() || '[]');
      if (users && users[0] && users[0].id) uid = users[0].id;
    }
    if (!uid) uid = authIdMemoria;
    if (!uid) {
      return { sucesso: true, aviso: 'auth_user_nao_resolvido' };
    }
    const ex = await excluirUsuarioAuthSupabase(uid);
    if (ex.sucesso) {
      return { sucesso: true, authExcluido: true };
    }
    return { sucesso: false, aviso: 'falha_excluir_auth', erro: ex.erro || '' };
  } catch (error) {
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Após salvar Secretário(a) ou Diretor(a) de Campanhas na nominata: cria acesso, envia credenciais ao e-mail do RTMA.
 * Não usa validarAcessoPorCargo (AL) para evitar rejeitar registro recém-criado; o tipo vem do cargo.
 * @return {Object} { ignorado, sucesso, email, tipoAcesso, aviso, erro }
 */
async function provisionarAcessoPortalAposNominata(clube, cargo, nome, anoLeonistico, vinculo) {
  try {
    vinculo = normalizarVinculoDirigente(vinculo);
    const tipoAcesso = determinarTipoAcessoPorCargo(cargo);
    if (tipoAcesso !== 'secretaria' && tipoAcesso !== 'campanhas') {
      return { ignorado: true, sucesso: true };
    }
    const serviceRoleKey = obterServiceRoleKeySupabaseUnificado();
    const clubeNome = String(clube || '').trim();
    const nomePessoa = String(nome || '').trim();
    if (!clubeNome || !nomePessoa) {
      return { sucesso: false, aviso: 'Clube ou nome vazio' };
    }
    const email = await buscarEmailPessoaRtmParaDirigente(clubeNome, nomePessoa, vinculo);
    if (!email) {
      return {
        sucesso: false,
        emailNaoEncontrado: true,
        aviso: 'E-mail da pessoa não encontrado no RTMA. Inclua o e-mail na ficha da pessoa (ou vincule à pessoa correta) para gerar acesso automaticamente.'
      };
    }
    const supabaseUrl = SUPABASE_URL_LEO;
    const urlExiste = `${supabaseUrl}/auth/v1/admin/users?email=eq.${encodeURIComponent(email)}`;
    const rExiste = await gasStyleFetch(urlExiste, {
      method: 'GET',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    let userId = null;
    let jaExiste = false;
    if (rExiste.getResponseCode() === 200) {
      const users = JSON.parse(rExiste.getContentText() || '[]');
      if (users && users.length > 0) {
        userId = users[0].id;
        jaExiste = true;
      }
    }
    if (jaExiste) {
      await upsertUsuariosAcessosAposNominata(email, clubeNome, tipoAcesso, userId);
      const mail = enviarEmailAcessoNominataUsuarioExistente(email, nomePessoa, cargo, tipoAcesso);
      if (!mail.sucesso) {
        console.warn('provisionarAcessoPortalAposNominata: e-mail não enviado (conta existente):', mail.erro);
      }
      return { sucesso: true, email: email, tipoAcesso: tipoAcesso, usuarioJaExistia: true };
    }
    const senhaProvisoria = gerarSenhaProvisoria();
    const resultadoAuth = await criarUsuarioAuthComSenhaProvisoria(email, senhaProvisoria);
    if (!resultadoAuth.sucesso) {
      return { sucesso: false, erro: resultadoAuth.erro || 'Falha ao criar usuário no Auth' };
    }
    userId = resultadoAuth.userId;
    const resultadoEmail = enviarEmailSenhaProvisoria(
      email,
      senhaProvisoria,
      nomePessoa,
      cargo,
      tipoAcesso
    );
    if (!resultadoEmail.sucesso) {
      console.warn('provisionarAcessoPortalAposNominata: usuário criado, envio de e-mail falhou:', resultadoEmail.erro);
    }
    await upsertUsuariosAcessosAposNominata(email, clubeNome, tipoAcesso, userId);
    return { sucesso: true, email: email, tipoAcesso: tipoAcesso, usuarioJaExistia: false };
  } catch (error) {
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Valida acesso do usuário baseado em cargo e AL
 * @param {string} email - Email do usuário (ou null para buscar por cargo)
 * @param {string} clubeNome - Nome do clube
 * @return {Object} { valido: boolean, tipoAcesso: string, cargo: string, email: string, erro: string, precisaCriarUsuario: boolean }
 */
async function validarAcessoPorCargo(email, clubeNome) {
  try {
    const alAtual = obterAlAtual();
    
    // Primeiro, buscar cargo na nominata
    // Se não temos email, vamos buscar por tipo de acesso (para campanhas e secretaria)
    let cargoInfo = null;
    let tipoAcessoEsperado = null;
    
    // Se temos email, buscar normalmente
    if (email) {
      cargoInfo = await buscarCargoNaNominata(email, clubeNome, alAtual, null);
    } else {
      // Se não temos email, tentar buscar para secretaria e campanhas
      // Isso acontece quando o usuário ainda não tem conta criada
      cargoInfo = await buscarCargoNaNominata(null, clubeNome, alAtual, 'secretaria');
      if (!cargoInfo) {
        cargoInfo = await buscarCargoNaNominata(null, clubeNome, alAtual, 'campanhas');
      }
    }
    
    if (!cargoInfo) {
      return {
        valido: false,
        tipoAcesso: null,
        cargo: null,
        email: null,
        erro: 'Usuário não encontrado na nominata do AL atual ou cargo não configurado.',
        precisaCriarUsuario: false
      };
    }
    
    // Determinar tipo de acesso
    const tipoAcesso = determinarTipoAcessoPorCargo(cargoInfo.cargo);
    
    if (!tipoAcesso) {
      return {
        valido: false,
        tipoAcesso: null,
        cargo: cargoInfo.cargo,
        email: cargoInfo.email,
        erro: `Cargo "${cargoInfo.cargo}" não tem permissão de acesso configurada. Apenas Presidente, Secretária/Secretário e Diretor/Diretora de Campanhas têm acesso.`,
        precisaCriarUsuario: false
      };
    }
    
    // Verificar se o AL corresponde
    if (cargoInfo.al !== alAtual) {
      return {
        valido: false,
        tipoAcesso: tipoAcesso,
        cargo: cargoInfo.cargo,
        email: cargoInfo.email,
        erro: `Acesso válido apenas para o AL ${cargoInfo.al}. AL atual é ${alAtual}.`,
        precisaCriarUsuario: false
      };
    }
    
    // Para campanhas e secretaria, verificar se precisa criar usuário
    let precisaCriarUsuario = false;
    let emailFinal = cargoInfo.email || email;
    
    if ((tipoAcesso === 'secretaria' || tipoAcesso === 'campanhas') && emailFinal) {
      // Verificar se usuário existe no Supabase Auth
      const props = PropertiesService.getScriptProperties();
      const serviceRoleKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
      const supabaseUrl = 'https://bqkttaflhtsdkamgscnf.supabase.co';
      
      if (serviceRoleKey) {
        const urlGet = `${supabaseUrl}/auth/v1/admin/users?email=eq.${encodeURIComponent(emailFinal.toLowerCase().trim())}`;
        const responseGet = await gasStyleFetch(urlGet, {
          method: 'GET',
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json'
          },
          muteHttpExceptions: true
        });
        
        if (responseGet.getResponseCode() === 200) {
          const users = JSON.parse(responseGet.getContentText() || '[]');
          if (!users || users.length === 0) {
            precisaCriarUsuario = true;
          }
        }
      }
    }
    
    return {
      valido: true,
      tipoAcesso: tipoAcesso,
      cargo: cargoInfo.cargo,
      email: emailFinal,
      al: cargoInfo.al,
      erro: null,
      precisaCriarUsuario: precisaCriarUsuario,
      nome: cargoInfo.nome
    };
    
  } catch (error) {
    console.error('Erro ao validar acesso por cargo:', error);
    return {
      valido: false,
      tipoAcesso: null,
      cargo: null,
      email: null,
      erro: 'Erro ao validar acesso: ' + (error.message || 'Erro desconhecido'),
      precisaCriarUsuario: false
    };
  }
}

/**
 * Criar usuário e enviar senha provisória para campanhas/secretaria
 * @param {string} email - Email do usuário
 * @param {string} clubeNome - Nome do clube
 * @return {Object} { sucesso: boolean, senhaProvisoria: string, erro: string }
 */
async function criarUsuarioComSenhaProvisoria(email, clubeNome) {
  try {
    // Validar acesso primeiro
    const validacao = await validarAcessoPorCargo(email, clubeNome);

    if (!validacao.valido) {
      return {
        sucesso: false,
        erro: validacao.erro
      };
    }

    // Gerar senha provisória
    const senhaProvisoria = gerarSenhaProvisoria();

    // Criar usuário no Supabase Auth
    const resultadoAuth = await criarUsuarioAuthComSenhaProvisoria(email, senhaProvisoria);
    
    if (!resultadoAuth.sucesso) {
      return {
        sucesso: false,
        erro: resultadoAuth.erro
      };
    }
    
    // Enviar email com senha provisória
    const resultadoEmail = enviarEmailSenhaProvisoria(
      email,
      senhaProvisoria,
      validacao.nome,
      validacao.cargo,
      validacao.tipoAcesso
    );
    
    if (!resultadoEmail.sucesso) {
      console.warn('⚠️ Usuário criado mas email não foi enviado:', resultadoEmail.erro);
      // Não falhar se email não foi enviado, apenas avisar
    }
    
    // Criar/atualizar registro na tabela usuarios_acessos
    const props = PropertiesService.getScriptProperties();
    const serviceRoleKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = 'https://bqkttaflhtsdkamgscnf.supabase.co';
    
    if (serviceRoleKey) {
      // Verificar se já existe registro
      const urlGet = `${supabaseUrl}/rest/v1/usuarios_acessos?email=eq.${encodeURIComponent(email.toLowerCase().trim())}`;
      const responseGet = await gasStyleFetch(urlGet, {
        method: 'GET',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json'
        },
        muteHttpExceptions: true
      });
      
      if (responseGet.getResponseCode() === 200) {
        const usuarios = JSON.parse(responseGet.getContentText() || '[]');
        
        if (usuarios && usuarios.length > 0) {
          // Atualizar registro existente
          const urlUpdate = `${supabaseUrl}/rest/v1/usuarios_acessos?id=eq.${usuarios[0].id}`;
          await gasStyleFetch(urlUpdate, {
            method: 'PATCH',
            headers: {
              'apikey': serviceRoleKey,
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            payload: JSON.stringify({
              auth_user_id: resultadoAuth.userId,
              tipo_acesso: validacao.tipoAcesso === 'presidente' ? 'distrito' : validacao.tipoAcesso,
              ativo: true
            }),
            muteHttpExceptions: true
          });
        } else {
          // Criar novo registro
          // Buscar clube_id
          const urlClube = `${supabaseUrl}/rest/v1/clubes?nome=eq.${encodeURIComponent(clubeNome)}&select=id&limit=1`;
          const responseClube = await gasStyleFetch(urlClube, {
            method: 'GET',
            headers: {
              'apikey': serviceRoleKey,
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json'
            },
            muteHttpExceptions: true
          });
          
          let clubeId = null;
          if (responseClube.getResponseCode() === 200) {
            const clubes = JSON.parse(responseClube.getContentText() || '[]');
            if (clubes && clubes.length > 0) {
              clubeId = clubes[0].id;
            }
          }
          
          const urlInsert = `${supabaseUrl}/rest/v1/usuarios_acessos`;
          await gasStyleFetch(urlInsert, {
            method: 'POST',
            headers: {
              'apikey': serviceRoleKey,
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            payload: JSON.stringify({
              email: email.toLowerCase().trim(),
              clube_nome: clubeNome,
              clube_id: clubeId,
              tipo_acesso: validacao.tipoAcesso === 'presidente' ? 'distrito' : validacao.tipoAcesso,
              ativo: true,
              auth_user_id: resultadoAuth.userId
            }),
            muteHttpExceptions: true
          });
        }
      }
    }
    
    return {
      sucesso: true,
      senhaProvisoria: senhaProvisoria,
      erro: null
    };
    
  } catch (error) {
    console.error('Erro ao criar usuário com senha provisória:', error);
    return {
      sucesso: false,
      erro: error.toString()
    };
  }
}

async function getAtividadePorId(clube, atividadeId) {
  const atividades = await getAtividadesDoClube(clube);
  return atividades.find(a => a.id === atividadeId) || null;
}

/**
 * Deletar atividade com verificação de trimestre (função wrapper para o frontend)
 * @param {string} clube - Nome do clube
 * @param {string} atividadeId - ID da atividade
 * @param {string} usuarioEmail - Email do usuário
 * @param {string} justificativa - Justificativa (se requer aprovação)
 * @return {Object} Resultado da operação
 */
async function deletarAtividadeComVerificacao(clube, atividadeId, usuarioEmail, justificativa = '') {
  try {
    // Buscar atividade original
    const atividadeOriginal = await getAtividadePorId(clube, atividadeId);
    if (!atividadeOriginal) {
      return { sucesso: false, erro: 'Atividade não encontrada' };
    }
    
    // Determinar data da atividade
    const dataAtividade = atividadeOriginal.dataInicio || atividadeOriginal.dataHoraInicio || atividadeOriginal.data_registro;
    
    // Verificar se está no trimestre vigente
    const verificacao = await verificarSeNoTrimestreVigente(dataAtividade);

    if (!verificacao.noTrimestreVigente) {
      // Não está no trimestre vigente
      let trimestreInfo = await determinarTrimestreDaData(dataAtividade);

      // Se não encontrou pela configuração, tentar usar os dados da atividade original
      if (!trimestreInfo && atividadeOriginal.al && atividadeOriginal.trimestre) {
        trimestreInfo = {
          trimestre: atividadeOriginal.trimestre,
          al: atividadeOriginal.al
        };
      }

      const trimestreTexto = trimestreInfo ? `${trimestreInfo.trimestre}º Trimestre` : 'Trimestre desconhecido';
      const alTexto = trimestreInfo ? trimestreInfo.al : 'AL desconhecido';

      // Se não tem justificativa, retornar que requer aprovação (para mostrar modal)
      if (!justificativa || justificativa.trim() === '') {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `Esta atividade está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. É necessária aprovação da Secretaria Distrital.`,
          trimestre: trimestreInfo ? trimestreInfo.trimestre : null,
          al: trimestreInfo ? trimestreInfo.al : null
        };
      }

      // Se tem justificativa, criar solicitação
      const dadosSolicitacao = {
        tipo: 'exclusao',
        tipoItem: 'atividade',
        itemId: atividadeId,
        clubeNome: clube,
        usuarioEmail: usuarioEmail,
        trimestreSolicitado: trimestreTexto,
        alSolicitado: alTexto,
        justificativa: justificativa,
        dadosAnteriores: atividadeOriginal,
        dadosNovos: null
      };

      const resultado = await criarSolicitacaoAlteracao(dadosSolicitacao);
      
      if (resultado.sucesso) {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `Esta atividade está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. Sua solicitação de exclusão foi enviada para aprovação da Secretaria Distrital.`,
          solicitacaoId: resultado.id
        };
      } else {
        return {
          sucesso: false,
          erro: 'Erro ao criar solicitação de alteração: ' + (resultado.erro || 'Erro desconhecido')
        };
      }
    }
    
    // Está no trimestre vigente, permitir exclusão direta
    return await deletarAtividade(clube, atividadeId);

  } catch (error) {
    console.error('Erro ao deletar atividade com verificação:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Editar campanha com verificação de trimestre (função wrapper para o frontend)
 * @param {string} clube - Nome do clube
 * @param {string} campanhaId - ID da campanha
 * @param {Object} dadosAtualizados - Dados atualizados
 * @param {string} usuarioEmail - Email do usuário
 * @param {string} justificativa - Justificativa (se requer aprovação)
 * @return {Object} Resultado da operação
 */
async function editarCampanhaComVerificacao(clube, campanhaId, dadosAtualizados, usuarioEmail, justificativa = '') {
  try {
    // Buscar campanha original
    const campanhaOriginal = await getCampanhaPorId(clube, campanhaId);
    if (!campanhaOriginal) {
      return { sucesso: false, erro: 'Campanha não encontrada' };
    }
    
    // Determinar data da campanha (usar data original)
    const dataCampanha = campanhaOriginal.dataHoraInicio || campanhaOriginal.dataInicio || campanhaOriginal.data_registro;
    
    // Verificar se está no trimestre vigente
    const verificacao = await verificarSeNoTrimestreVigente(dataCampanha);

    if (!verificacao.noTrimestreVigente) {
      // Não está no trimestre vigente, criar solicitação
      let trimestreInfo = await determinarTrimestreDaData(dataCampanha);

      // Se não encontrou pela configuração, tentar usar os dados da campanha original
      if (!trimestreInfo && campanhaOriginal.al && campanhaOriginal.trimestre) {
        trimestreInfo = {
          trimestre: campanhaOriginal.trimestre,
          al: campanhaOriginal.al
        };
      }

      const trimestreTexto = trimestreInfo ? `${trimestreInfo.trimestre}º Trimestre` : 'Trimestre desconhecido';
      const alTexto = trimestreInfo ? trimestreInfo.al : 'AL desconhecido';

      const dadosSolicitacao = {
        tipo: 'edicao',
        tipoItem: 'campanha',
        itemId: campanhaId,
        clubeNome: clube,
        usuarioEmail: usuarioEmail,
        trimestreSolicitado: trimestreTexto,
        alSolicitado: alTexto,
        justificativa: justificativa,
        dadosAnteriores: campanhaOriginal,
        dadosNovos: dadosAtualizados
      };

      const resultado = await criarSolicitacaoAlteracao(dadosSolicitacao);
      
      if (resultado.sucesso) {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `Esta campanha está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. Sua solicitação de edição foi enviada para aprovação da Secretaria Distrital.`,
          solicitacaoId: resultado.id
        };
      } else {
        return {
          sucesso: false,
          erro: 'Erro ao criar solicitação de alteração: ' + (resultado.erro || 'Erro desconhecido')
        };
      }
    }
    
    // Está no trimestre vigente, permitir edição direta
    return await editarCampanha(clube, campanhaId, dadosAtualizados);
    
  } catch (error) {
    console.error('Erro ao editar campanha com verificação:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Deletar campanha com verificação de trimestre (função wrapper para o frontend)
 * @param {string} clube - Nome do clube
 * @param {string} campanhaId - ID da campanha
 * @param {string} usuarioEmail - Email do usuário
 * @param {string} justificativa - Justificativa (se requer aprovação)
 * @return {Object} Resultado da operação
 */
async function deletarCampanhaComVerificacao(clube, campanhaId, usuarioEmail, justificativa = '') {
  try {
    // Buscar campanha original
    const campanhaOriginal = await getCampanhaPorId(clube, campanhaId);
    if (!campanhaOriginal) {
      return { sucesso: false, erro: 'Campanha não encontrada' };
    }
    
    // Determinar data da campanha
    const dataCampanha = campanhaOriginal.dataHoraInicio || campanhaOriginal.dataInicio || campanhaOriginal.data_registro;
    
    // Verificar se está no trimestre vigente
    const verificacao = await verificarSeNoTrimestreVigente(dataCampanha);

    if (!verificacao.noTrimestreVigente) {
      // Não está no trimestre vigente, criar solicitação
      let trimestreInfo = await determinarTrimestreDaData(dataCampanha);

      // Se não encontrou pela configuração, tentar usar os dados da campanha original
      if (!trimestreInfo && campanhaOriginal.al && campanhaOriginal.trimestre) {
        trimestreInfo = {
          trimestre: campanhaOriginal.trimestre,
          al: campanhaOriginal.al
        };
      }

      const trimestreTexto = trimestreInfo ? `${trimestreInfo.trimestre}º Trimestre` : 'Trimestre desconhecido';
      const alTexto = trimestreInfo ? trimestreInfo.al : 'AL desconhecido';

      const dadosSolicitacao = {
        tipo: 'exclusao',
        tipoItem: 'campanha',
        itemId: campanhaId,
        clubeNome: clube,
        usuarioEmail: usuarioEmail,
        trimestreSolicitado: trimestreTexto,
        alSolicitado: alTexto,
        justificativa: justificativa,
        dadosAnteriores: campanhaOriginal,
        dadosNovos: null
      };
      
      const resultado = await criarSolicitacaoAlteracao(dadosSolicitacao);

      if (resultado.sucesso) {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `Esta campanha está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. Sua solicitação de exclusão foi enviada para aprovação da Secretaria Distrital.`,
          solicitacaoId: resultado.id
        };
      } else {
        return {
          sucesso: false,
          erro: 'Erro ao criar solicitação de alteração: ' + (resultado.erro || 'Erro desconhecido')
        };
      }
    }

    // Está no trimestre vigente, permitir exclusão direta
    return await deletarCampanha(clube, campanhaId);
    
  } catch (error) {
    console.error('Erro ao deletar campanha com verificação:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Registrar atividade com verificação de trimestre (função wrapper para o frontend)
 * @param {Object} dados - Dados da atividade
 * @param {string} usuarioEmail - Email do usuário
 * @param {string} justificativa - Justificativa (se requer aprovação)
 * @return {Object} Resultado da operação
 */
async function registrarAtividadeComVerificacao(dados, usuarioEmail, justificativa = '') {
  try {
    // Determinar data da atividade
    const dataAtividade = dados.dataHoraInicio || dados.dataInicio || new Date().toISOString();

    // Verificar se está no trimestre vigente
    const verificacao = await verificarSeNoTrimestreVigente(dataAtividade);

    if (!verificacao.noTrimestreVigente) {
      // Não está no trimestre vigente
      let trimestreInfo = await determinarTrimestreDaData(dataAtividade);
      
      // Se não encontrou pela configuração, tentar usar os dados da atividade
      if (!trimestreInfo && dados.al && dados.trimestre) {
        trimestreInfo = {
          trimestre: dados.trimestre,
          al: dados.al
        };
      }
      
      const trimestreTexto = trimestreInfo ? `${trimestreInfo.trimestre}º Trimestre` : 'Trimestre desconhecido';
      const alTexto = trimestreInfo ? trimestreInfo.al : 'AL desconhecido';
      
      // Se não tem justificativa, retornar que requer aprovação (para mostrar modal)
      // NÃO criar solicitação ainda - será criada quando o usuário confirmar no modal
      if (!justificativa || justificativa.trim() === '') {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `Esta atividade está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. É necessária aprovação da Secretaria Distrital.`,
          trimestre: trimestreInfo ? trimestreInfo.trimestre : null,
          al: trimestreInfo ? trimestreInfo.al : null
        };
      }
      
      // Se tem justificativa, criar solicitação
      const dadosSolicitacao = {
        tipo: 'inclusao',
        tipoItem: 'atividade',
        itemId: null, // Ainda não tem ID, será gerado após aprovação
        clubeNome: dados.clube,
        usuarioEmail: usuarioEmail,
        trimestreSolicitado: trimestreTexto,
        alSolicitado: alTexto,
        justificativa: justificativa,
        dadosAnteriores: null,
        dadosNovos: dados
      };
      
      const resultado = await criarSolicitacaoAlteracao(dadosSolicitacao);

      if (resultado.sucesso) {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `Esta atividade está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. Sua solicitação de inclusão foi enviada para aprovação da Secretaria Distrital.`,
          solicitacaoId: resultado.id
        };
      } else {
        return {
          sucesso: false,
          erro: 'Erro ao criar solicitação de alteração: ' + (resultado.erro || 'Erro desconhecido')
        };
      }
    }

    // Está no trimestre vigente, permitir registro direto
    return await registrarAtividade(dados);
    
  } catch (error) {
    console.error('Erro ao registrar atividade com verificação:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Registrar campanha com verificação de trimestre (função wrapper para o frontend)
 * @param {Object} dados - Dados da campanha
 * @param {string} usuarioEmail - Email do usuário
 * @param {string} justificativa - Justificativa (se requer aprovação)
 * @return {Object} Resultado da operação
 */
async function registrarCampanhaComVerificacao(dados, usuarioEmail, justificativa = '') {
  try {
    // Determinar data da campanha
    const dataCampanha = dados.dataHoraInicio || dados.dataInicio || new Date().toISOString();

    // Verificar se está no trimestre vigente
    const verificacao = await verificarSeNoTrimestreVigente(dataCampanha);

    if (!verificacao.noTrimestreVigente) {
      // Não está no trimestre vigente
      const trimestreInfo = await determinarTrimestreDaData(dataCampanha);
      const trimestreTexto = trimestreInfo ? `${trimestreInfo.trimestre}º Trimestre` : 'Trimestre desconhecido';
      const alTexto = trimestreInfo ? trimestreInfo.al : 'AL desconhecido';
      
      // Se não tem justificativa, retornar que requer aprovação (para mostrar modal)
      if (!justificativa || justificativa.trim() === '') {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `Esta campanha está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. É necessária aprovação da Secretaria Distrital.`,
          trimestre: trimestreInfo ? trimestreInfo.trimestre : null,
          al: trimestreInfo ? trimestreInfo.al : null
        };
      }
      
      // Se tem justificativa, criar solicitação
      const dadosSolicitacao = {
        tipo: 'inclusao',
        tipoItem: 'campanha',
        itemId: null, // Ainda não tem ID, será gerado após aprovação
        clubeNome: dados.clube,
        usuarioEmail: usuarioEmail,
        trimestreSolicitado: trimestreTexto,
        alSolicitado: alTexto,
        justificativa: justificativa,
        dadosAnteriores: null,
        dadosNovos: dados
      };
      
      const resultado = await criarSolicitacaoAlteracao(dadosSolicitacao);

      if (resultado.sucesso) {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `Esta campanha está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. Sua solicitação de inclusão foi enviada para aprovação da Secretaria Distrital.`,
          solicitacaoId: resultado.id
        };
      } else {
        return {
          sucesso: false,
          erro: 'Erro ao criar solicitação de alteração: ' + (resultado.erro || 'Erro desconhecido')
        };
      }
    }

    // Está no trimestre vigente, permitir registro direto
    return await registrarCampanha(dados);
    
  } catch (error) {
    console.error('Erro ao registrar campanha com verificação:', error);
    return { sucesso: false, erro: error.message };
  }
}

async function deletarAtividade(clube, atividadeId) {
  try {
    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      await portalDeleteAtividade(String(atividadeId).trim());
      return { sucesso: true };
    }

    const planilhaClubeId = PLANILHAS_ATIVIDADES[clube];
    if (!planilhaClubeId) {
      throw new Error(`Planilha não mapeada para o clube: ${clube}`);
    }

    const ss = SpreadsheetApp.openById(planilhaClubeId);
    const sheet = ss.getSheetByName(ABA_ATIVIDADES);
    if (!sheet) {
      throw new Error(`Aba "${ABA_ATIVIDADES}" não encontrada para o clube: ${clube}`);
    }

    const atividade = await getAtividadePorId(clube, atividadeId);
    if (!atividade) {
      throw new Error('Atividade não encontrada');
    }

    sheet.deleteRow(atividade.rowIndex);
    
    return { sucesso: true };

  } catch (error) {
    console.error("Erro ao deletar atividade:", error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Editar atividade com verificação de trimestre (função wrapper para o frontend)
 * @param {string} clube - Nome do clube
 * @param {string} atividadeId - ID da atividade
 * @param {Object} dadosAtualizados - Dados atualizados
 * @param {string} usuarioEmail - Email do usuário
 * @param {string} justificativa - Justificativa (se requer aprovação)
 * @return {Object} Resultado da operação
 */
async function editarAtividadeComVerificacao(clube, atividadeId, dadosAtualizados, usuarioEmail, justificativa = '') {
  try {
    // Buscar atividade original
    const atividadeOriginal = await getAtividadePorId(clube, atividadeId);
    if (!atividadeOriginal) {
      return { sucesso: false, erro: 'Atividade não encontrada' };
    }
    
    // Determinar data da atividade (usar data original)
    const dataAtividade = atividadeOriginal.dataInicio || atividadeOriginal.dataHoraInicio || atividadeOriginal.data_registro;
    
    // Verificar se está no trimestre vigente
    const verificacao = await verificarSeNoTrimestreVigente(dataAtividade);

    if (!verificacao.noTrimestreVigente) {
      // Não está no trimestre vigente
      let trimestreInfo = await determinarTrimestreDaData(dataAtividade);

      // Se não encontrou pela configuração, tentar usar os dados da atividade original
      if (!trimestreInfo && atividadeOriginal.al && atividadeOriginal.trimestre) {
        trimestreInfo = {
          trimestre: atividadeOriginal.trimestre,
          al: atividadeOriginal.al
        };
      }

      const trimestreTexto = trimestreInfo ? `${trimestreInfo.trimestre}º Trimestre` : 'Trimestre desconhecido';
      const alTexto = trimestreInfo ? trimestreInfo.al : 'AL desconhecido';

      // Se não tem justificativa, retornar que requer aprovação (para mostrar modal)
      if (!justificativa || justificativa.trim() === '') {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `Esta atividade está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. É necessária aprovação da Secretaria Distrital.`,
          trimestre: trimestreInfo ? trimestreInfo.trimestre : null,
          al: trimestreInfo ? trimestreInfo.al : null
        };
      }

      // Se tem justificativa, criar solicitação
      const dadosSolicitacao = {
        tipo: 'edicao',
        tipoItem: 'atividade',
        itemId: atividadeId,
        clubeNome: clube,
        usuarioEmail: usuarioEmail,
        trimestreSolicitado: trimestreTexto,
        alSolicitado: alTexto,
        justificativa: justificativa,
        dadosAnteriores: atividadeOriginal,
        dadosNovos: dadosAtualizados
      };

      const resultado = await criarSolicitacaoAlteracao(dadosSolicitacao);

      if (resultado.sucesso) {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `Esta atividade está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. Sua solicitação de edição foi enviada para aprovação da Secretaria Distrital.`,
          solicitacaoId: resultado.id
        };
      } else {
        return {
          sucesso: false,
          erro: 'Erro ao criar solicitação de alteração: ' + (resultado.erro || 'Erro desconhecido')
        };
      }
    }

    // Está no trimestre vigente, permitir edição direta
    return await editarAtividade(clube, atividadeId, dadosAtualizados);
    
  } catch (error) {
    console.error('Erro ao editar atividade com verificação:', error);
    return { sucesso: false, erro: error.message };
  }
}

async function editarAtividade(clube, atividadeId, dadosAtualizados) {
  try {
    if (!atividadeId || String(atividadeId).trim() === '' || String(atividadeId).trim() === 'null' || String(atividadeId).trim() === 'undefined') {
      console.error('editarAtividade: ID inválido recebido, abortando para evitar duplicação:', atividadeId);
      return { sucesso: false, erro: 'ID da atividade inválido. Edição cancelada para evitar duplicação.' };
    }
    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      const payload = Object.assign({}, dadosAtualizados || {});
      payload.id = String(atividadeId).trim();
      payload.clube = payload.clube || clube;
      if (!payload.clubeId && typeof obterMapaClubesSupabase === 'function' && payload.clube) {
        const clubesMap = await obterMapaClubesSupabase();
        const clubeId = clubesMap[String(payload.clube).trim()];
        if (clubeId) payload.clubeId = clubeId;
      }
      if (!payload.dataRegistro) payload.dataRegistro = new Date().toISOString();
      if (payload.dataHoraInicio && !payload.dataInicio) payload.dataInicio = payload.dataHoraInicio;
      if (payload.dataHoraFim && !payload.dataFim) payload.dataFim = payload.dataHoraFim;
      delete payload.dataHoraInicio;
      delete payload.dataHoraFim;
      delete payload.descricaoHTML;
      delete payload.descricao_html;

      // Converter arrays de pessoas para string e recalcular contagens
      const arrToStr = (v) => Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v));
      const arrLen   = (v) => Array.isArray(v) ? v.length : (typeof v === 'string' && v.trim() !== '' ? v.split(',').filter(s => s.trim() !== '').length : 0);

      if (payload.presentes !== undefined) {
        payload.qtdPresentes = arrLen(payload.presentes);
        payload.presentes    = arrToStr(payload.presentes);
      }
      if (payload.preLeos !== undefined) {
        payload.qtdPreLeos = arrLen(payload.preLeos);
        payload.preLeos    = arrToStr(payload.preLeos);
      }
      if (payload.leoLeao !== undefined) {
        payload.qtdLeoLeao = arrLen(payload.leoLeao);
        payload.leoLeao    = arrToStr(payload.leoLeao);
      }
      if (payload.amigosConselheiros !== undefined) {
        payload.qtdAmigosConselheiros = arrLen(payload.amigosConselheiros);
        payload.amigosConselheiros    = arrToStr(payload.amigosConselheiros);
      }

      await portalUpsertAtividade(payload);
      return { sucesso: true };
    }

    const planilhaClubeId = PLANILHAS_ATIVIDADES[clube];
    if (!planilhaClubeId) {
      throw new Error(`Planilha não mapeada para o clube: ${clube}`);
    }

    const ss = SpreadsheetApp.openById(planilhaClubeId);
    const sheet = ss.getSheetByName(ABA_ATIVIDADES);
    if (!sheet) {
      throw new Error(`Aba "${ABA_ATIVIDADES}" não encontrada para o clube: ${clube}`);
    }

    const atividade = await getAtividadePorId(clube, atividadeId);
    if (!atividade) {
      throw new Error('Atividade não encontrada');
    }

    // CORRIGIDO: Manter a data de registro original para não afetar indicadores
    const dataRegistroOriginal = atividade.dataRegistro ? new Date(atividade.dataRegistro) : new Date();

    // CORRIGIDO: Preservar link existente se não houver novo arquivo
    const linkFotoOficial = dadosAtualizados.linkFotoOficial || atividade.linkFotoOficial || "";

    const row = [
      dataRegistroOriginal,
      dadosAtualizados.clube,
      dadosAtualizados.al,
      dadosAtualizados.trimestre,
      dadosAtualizados.titulo,
      dadosAtualizados.tipoAtividade,
      dadosAtualizados.dataHoraInicio,
      new Date(dadosAtualizados.dataHoraInicio).toTimeString().slice(0, 5),
      dadosAtualizados.dataHoraFim,
      new Date(dadosAtualizados.dataHoraFim).toTimeString().slice(0, 5),
      dadosAtualizados.localAtividade,
      dadosAtualizados.presentes.join(", "),
      dadosAtualizados.presentes.length,
      dadosAtualizados.preLeos.join(", "),
      dadosAtualizados.preLeos.length,
      dadosAtualizados.leoLeao.join(", "),
      dadosAtualizados.leoLeao.length,
      dadosAtualizados.amigosConselheiros.join(", "),
      dadosAtualizados.amigosConselheiros.length,
      dadosAtualizados.outrosLions,
      dadosAtualizados.descricaoTexto,
      linkFotoOficial,
      dadosAtualizados.duracaoTotal,
      dadosAtualizados.comentarioDistrital || "",
      dadosAtualizados.marcadoCorrigido ? "Sim" : "Não"
    ];

    sheet.getRange(atividade.rowIndex, 1, 1, 25).setValues([row]);
    
    return { sucesso: true };

  } catch (error) {
    console.error("Erro ao editar atividade:", error);
    return { sucesso: false, erro: error.message };
  }
}

// === SISTEMA DE IDS ÚNICOS ===
function gerarIdUnico() {
  // Para Supabase, usar UUID válido
  if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
    return Utilities.getUuid();
  }
  // Fallback para formato antigo (compatibilidade com planilhas)
  const timestamp = new Date().getTime();
  const random = Math.floor(Math.random() * 1000);
  return `${timestamp}_${random}`;
}

// === FUNÇÕES PARA AUTOMAÇÃO DE IDs E CONTROLE DE RELATÓRIOS ===

/**
 * Gera IDs automaticamente para todas as atividades que não possuem ID na coluna Y
 */
function gerarIdsAutomaticosAtividades() {
  try {
    console.log('🔄 Iniciando geração automática de IDs para atividades...');
    
    const planilhaId = '1szBXxc9ujpGNwxN1Ffn_AHSO-LfEl7Y7K6lLYD45aQg';
    const ss = SpreadsheetApp.openById(planilhaId);
    const sheet = ss.getSheetByName('Atividades D8');
    
    if (!sheet) {
      throw new Error('Aba "Atividades D8" não encontrada');
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      console.log('Nenhuma atividade encontrada para processar');
      return { sucesso: true, processadas: 0 };
    }
    
    // Coluna Y = índice 24 (25ª coluna)
    const colunaId = 25; // Y
    const colunaControle = 26; // Z - para marcar se já foi reportada
    
    let processadas = 0;
    let atualizadas = 0;
    
    // Verificar se as colunas Y e Z existem, se não, criar cabeçalhos
    const cabecalhos = sheet.getRange(1, 1, 1, colunaControle).getValues()[0];
    if (!cabecalhos[colunaId - 1]) {
      sheet.getRange(1, colunaId).setValue('ID Único');
      console.log('✅ Cabeçalho "ID Único" adicionado na coluna Y');
    }
    if (!cabecalhos[colunaControle - 1]) {
      sheet.getRange(1, colunaControle).setValue('Reportada');
      console.log('✅ Cabeçalho "Reportada" adicionado na coluna Z');
    }
    
    // Processar cada linha de dados (a partir da linha 2)
    for (let i = 2; i <= lastRow; i++) {
      const idAtual = sheet.getRange(i, colunaId).getValue();
      const temTitulo = sheet.getRange(i, 5).getValue(); // Coluna E - Título
      
      // Só processar se tem título e não tem ID
      if (temTitulo && temTitulo.toString().trim() !== '' && (!idAtual || idAtual.toString().trim() === '')) {
        const novoId = gerarIdUnico();
        sheet.getRange(i, colunaId).setValue(novoId);
        sheet.getRange(i, colunaControle).setValue('NÃO'); // Marcar como não reportada
        processadas++;
        console.log(`✅ ID gerado para linha ${i}: ${novoId}`);
      }
    }
    
    console.log(`🎯 Processamento concluído: ${processadas} atividades receberam IDs`);
    return { sucesso: true, processadas: processadas };
    
  } catch (error) {
    console.error('❌ Erro ao gerar IDs automáticos:', error);
    return { sucesso: false, erro: error.toString() };
  }
}

/**
 * Adiciona ID automaticamente quando uma nova atividade é reportada
 */
function adicionarIdNovaAtividade(rowIndex) {
  try {
    const planilhaId = '1szBXxc9ujpGNwxN1Ffn_AHSO-LfEl7Y7K6lLYD45aQg';
    const ss = SpreadsheetApp.openById(planilhaId);
    const sheet = ss.getSheetByName('Atividades D8');
    
    if (!sheet) {
      throw new Error('Aba "Atividades D8" não encontrada');
    }
    
    const colunaId = 25; // Y
    const colunaControle = 26; // Z
    
    // Verificar se já tem ID
    const idAtual = sheet.getRange(rowIndex, colunaId).getValue();
    if (!idAtual || idAtual.toString().trim() === '') {
      const novoId = gerarIdUnico();
      sheet.getRange(rowIndex, colunaId).setValue(novoId);
      sheet.getRange(rowIndex, colunaControle).setValue('NÃO');
      console.log(`✅ ID adicionado para nova atividade na linha ${rowIndex}: ${novoId}`);
      return novoId;
    }
    
    return idAtual.toString().trim();
    
  } catch (error) {
    console.error('❌ Erro ao adicionar ID para nova atividade:', error);
    return null;
  }
}

/**
 * Obtém configurações do arquivo de destino do relatório
 */
function obterConfiguracaoRelatorio() {
  try {
    const planilhaId = '1szBXxc9ujpGNwxN1Ffn_AHSO-LfEl7Y7K6lLYD45aQg';
    const ss = SpreadsheetApp.openById(planilhaId);
    let sheet = ss.getSheetByName('Configurações');
    
    if (!sheet) {
      // Criar aba de configurações se não existir
      sheet = ss.insertSheet('Configurações');
      sheet.getRange(1, 1).setValue('Configuração');
      sheet.getRange(1, 2).setValue('Valor');
      sheet.getRange(2, 1).setValue('Arquivo Relatório DM');
      sheet.getRange(2, 2).setValue('');
      console.log('✅ Aba "Configurações" criada');
    }
    
    const arquivoRelatorio = sheet.getRange(2, 2).getValue();
    return {
      arquivoRelatorio: arquivoRelatorio ? arquivoRelatorio.toString().trim() : '',
      temArquivo: arquivoRelatorio && arquivoRelatorio.toString().trim() !== ''
    };
    
  } catch (error) {
    console.error('❌ Erro ao obter configuração:', error);
    return { arquivoRelatorio: '', temArquivo: false };
  }
}

/**
 * Define o arquivo de destino do relatório
 */
function definirArquivoRelatorio(arquivoId) {
  try {
    const planilhaId = '1szBXxc9ujpGNwxN1Ffn_AHSO-LfEl7Y7K6lLYD45aQg';
    const ss = SpreadsheetApp.openById(planilhaId);
    let sheet = ss.getSheetByName('Configurações');
    
    if (!sheet) {
      sheet = ss.insertSheet('Configurações');
      sheet.getRange(1, 1).setValue('Configuração');
      sheet.getRange(1, 2).setValue('Valor');
      sheet.getRange(2, 1).setValue('Arquivo Relatório DM');
    }
    
    sheet.getRange(2, 2).setValue(arquivoId);
    console.log(`✅ Arquivo de relatório definido: ${arquivoId}`);
    return { sucesso: true };
    
  } catch (error) {
    console.error('❌ Erro ao definir arquivo de relatório:', error);
    return { sucesso: false, erro: error.toString() };
  }
}

/**
 * Obtém atividades que ainda não foram reportadas
 */
function obterAtividadesNaoReportadas() {
  try {
    const planilhaId = '1szBXxc9ujpGNwxN1Ffn_AHSO-LfEl7Y7K6lLYD45aQg';
    const ss = SpreadsheetApp.openById(planilhaId);
    const sheet = ss.getSheetByName('Atividades D8');
    
    if (!sheet) {
      throw new Error('Aba "Atividades D8" não encontrada');
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return [];
    }
    
    const colunaControle = 26; // Z
    const atividadesNaoReportadas = [];
    
    for (let i = 2; i <= lastRow; i++) {
      const reportada = sheet.getRange(i, colunaControle).getValue();
      const temTitulo = sheet.getRange(i, 5).getValue(); // Coluna E
      
      if (temTitulo && temTitulo.toString().trim() !== '' && 
          (!reportada || reportada.toString().trim() === 'NÃO')) {
        atividadesNaoReportadas.push(i);
      }
    }
    
    console.log(`📊 Encontradas ${atividadesNaoReportadas.length} atividades não reportadas`);
    return atividadesNaoReportadas;
    
  } catch (error) {
    console.error('❌ Erro ao obter atividades não reportadas:', error);
    return [];
  }
}

function adicionarIdUnicoSeNecessario(linha, rowIndex, isAtividade = false) {
  // Para campanhas: coluna 30 (índice 29 - AD), para atividades: coluna 27 (índice 26)
  const colunaId = isAtividade ? 26 : 29;

  if (!linha[colunaId] || linha[colunaId].toString().trim() === '') {
    return gerarIdUnico();
  }
  return linha[colunaId].toString().trim();
}

// === VALIDAÇÃO DE INTEGRIDADE ===
async function validarIntegridadeUpload(nomeClube, registroId, coluna, url, isAtividade = false) {
  try {
    console.log(`Validando integridade do upload - Clube: ${nomeClube}, ID: ${registroId}, Coluna: ${coluna}`);

    const planilhaClubeId = isAtividade ? PLANILHAS_ATIVIDADES[nomeClube] : PLANILHAS_CAMPANHAS[nomeClube];
    if (!planilhaClubeId) {
      throw new Error(`Planilha não mapeada para o clube: ${nomeClube}`);
    }

    const ss = SpreadsheetApp.openById(planilhaClubeId);
    const aba = isAtividade ? ABA_ATIVIDADES : ABA_CAMPANHAS;
    const sheet = ss.getSheetByName(aba);
    if (!sheet) {
      throw new Error(`Aba "${aba}" não encontrada`);
    }

    // Buscar o registro pelo ID
    let registro;
    if (isAtividade) {
      registro = await getAtividadePorId(nomeClube, registroId);
    } else {
      registro = await getCampanhaPorId(nomeClube, registroId);
    }

    if (!registro) {
      throw new Error(`Registro com ID ${registroId} não encontrado`);
    }

    // Verificar se o link está na linha correta
    const linkNaLinhaCorreta = sheet.getRange(registro.rowIndex, coluna).getValue();
    
    // CORRIGIDO: Para OUTRAS_FOTOS (coluna 28), pode haver múltiplas URLs separadas por vírgula
    let urlsMatch = false;
    if (coluna === COL_LINK_OUTRAS_FOTOS && linkNaLinhaCorreta) {
      // Verificar se a URL está contida na string (pode haver múltiplas URLs)
      const urlsExistentes = linkNaLinhaCorreta.toString().split(',').map(u => u.trim());
      urlsMatch = urlsExistentes.includes(url);
    } else {
      // Para outros tipos, verificar igualdade exata
      urlsMatch = linkNaLinhaCorreta === url;
    }

    console.log(`Validação de integridade - Link esperado: ${url}, Link encontrado: ${linkNaLinhaCorreta}, Match: ${urlsMatch}`);

    return {
      valido: urlsMatch,
      linhaEsperada: registro.rowIndex,
      linkEsperado: url,
      linkEncontrado: linkNaLinhaCorreta
    };

  } catch (error) {
    console.error('Erro na validação de integridade:', error);
    return {
      valido: false,
      erro: error.message
    };
  }
}

// === SISTEMA DE UPLOAD ===
function portalNormalizarTextoBasico(valor) {
  const texto = String(valor || '');
  const semAcento = texto.normalize ? texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : texto;
  return semAcento.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

async function portalUploadArquivoParaStorageLocal(blob, nomeArquivo, pastaTag, nomeClube, registroId) {
  try {
    if (!blob || !nomeArquivo || !pastaTag || !nomeClube) {
      throw new Error('Parâmetros obrigatórios faltando');
    }
    if (typeof PORTAL_SUPABASE_CONFIG === 'undefined' || !PORTAL_SUPABASE_CONFIG || !PORTAL_SUPABASE_CONFIG.url || !PORTAL_SUPABASE_CONFIG.serviceRoleKey) {
      throw new Error('Supabase não configurado');
    }

    const clubeNormalizado = (typeof portalNormalizarNomeClubeParaBucketUpload === 'function')
      ? portalNormalizarNomeClubeParaBucketUpload(nomeClube)
      : ((typeof portalNormalizarNomeClubeParaBucket === 'function')
          ? portalNormalizarNomeClubeParaBucket(nomeClube)
          : portalNormalizarTextoBasico(nomeClube));
    const registroNormalizado = (typeof portalNormalizarNomeParaPath === 'function')
      ? portalNormalizarNomeParaPath(registroId || 'sem_id')
      : (portalNormalizarTextoBasico(registroId || 'sem_id') || 'sem_id');
    const nomeArquivoNormalizado = (typeof portalNormalizarNomeArquivo === 'function')
      ? portalNormalizarNomeArquivo(nomeArquivo)
      : (portalNormalizarTextoBasico(nomeArquivo) || 'arquivo');

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
    console.error('❌ Erro em portalUploadArquivoParaStorageLocal:', error);
    return { sucesso: false, erro: error.message };
  }
}

async function uploadArquivo(base64, nomeArquivo, pastaTag, nomeClube, registroId = null) {
  try {
    console.log(`Iniciando upload: ${nomeArquivo} para ${nomeClube} na pasta ${pastaTag}, registro ID: ${registroId}`);

    if (!base64 || !nomeArquivo || !pastaTag || !nomeClube) {
      throw new Error('Parâmetros obrigatórios faltando');
    }

    if (!base64.includes(',') || !base64.match(/^data:(.*);base64,/)) {
      throw new Error('Formato base64 inválido');
    }

    const mimeType = base64.match(/^data:(.*);base64,/)[1];
    const base64Data = base64.split(',')[1];

    const mimeTypeLower = String(mimeType || '').toLowerCase();
    const tiposVideoPermitidos = ['video/mp4', 'video/avi', 'video/mov', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    const imagemPermitida = mimeTypeLower.startsWith('image/');
    const videoPermitido = tiposVideoPermitidos.includes(mimeTypeLower);
    if (!imagemPermitida && !videoPermitido) {
      throw new Error(`Tipo de arquivo não permitido: ${mimeType}`);
    }

    let blob;
    try {
      blob = Utilities.newBlob(
        Buffer.from(base64Data, "base64"),
        mimeType,
        nomeArquivo
      );
    } catch (error) {
      throw new Error(`Erro ao decodificar arquivo: ${error.message}`);
    }

    const maxSize = (pastaTag === 'VIDEOS') ? 25 * 1024 * 1024 : 5 * 1024 * 1024;
    if (blob.getBytes().length > maxSize) {
      throw new Error('Arquivo muito grande. Máximo permitido: ' + (maxSize / (1024 * 1024)) + 'MB');
    }

    const tagsSupabase = ['FOTOS_OFICIAIS_ATIVIDADES', 'FOTOS_OFICIAIS', 'VIDEOS', 'OUTRAS_FOTOS'];
    const exigeSupabase = tagsSupabase.includes(pastaTag);
    const usarSupabase = (typeof PORTAL_USAR_SUPABASE === 'undefined') ? true : PORTAL_USAR_SUPABASE === true;

    if (exigeSupabase && !usarSupabase) {
      throw new Error('Uploads de campanhas/atividades devem usar Supabase Storage.');
    }

    // CORRIGIDO: Usar Supabase Storage em vez de Google Drive
    if (usarSupabase || exigeSupabase) {
      console.log('📤 Fazendo upload para Supabase Storage...');
      const uploader = (typeof portalUploadArquivoParaStorage === 'function')
        ? portalUploadArquivoParaStorage
        : portalUploadArquivoParaStorageLocal;
      const resultado = uploader(blob, nomeArquivo, pastaTag, nomeClube, registroId);
      
      if (!resultado.sucesso) {
        throw new Error(resultado.erro || 'Erro ao fazer upload para Supabase Storage');
      }
      
      const url = resultado.url;
      console.log(`✅ Arquivo enviado com sucesso para Supabase Storage: ${url}`);
      
      // Atualizar no Supabase se houver registroId real (não temporário)
      const registroIdEhTemporario = registroId && String(registroId).startsWith('TEMP_');
      if (registroId && !registroIdEhTemporario) {
        try {
          if (pastaTag.includes('ATIVIDADES')) {
            if (typeof portalPatchAtividadeFotoOficialUrl === 'function') {
              await portalPatchAtividadeFotoOficialUrl(registroId, url);
              console.log(`✅ Foto atualizada no Supabase para atividade ${registroId}`);
            } else {
              const atividade = await getAtividadePorId(nomeClube, registroId);
              if (atividade) {
                await portalUpsertAtividade({
                  id: registroId,
                  clube: nomeClube,
                  linkFotoOficial: url
                });
                console.log(`✅ Foto atualizada no Supabase para atividade ${registroId}`);
              }
            }
          } else if (pastaTag === 'FOTOS_OFICIAIS') {
            if (typeof portalPatchCampanhaFotoOficialUrl === 'function') {
              await portalPatchCampanhaFotoOficialUrl(registroId, url);
              console.log(`✅ Foto atualizada no Supabase para campanha ${registroId}`);
            } else {
              const campanha = await getCampanhaPorId(nomeClube, registroId);
              if (campanha) {
                await portalUpsertCampanha({
                  id: registroId,
                  clube: nomeClube,
                  linkFotoOficial: url
                });
                console.log(`✅ Foto atualizada no Supabase para campanha ${registroId}`);
              }
            }
          } else if (pastaTag === 'VIDEOS') {
            if (typeof portalPatchCampanhaVideoUrl === 'function') {
              await portalPatchCampanhaVideoUrl(registroId, url);
            } else {
              await portalUpsertCampanha({
                id: registroId,
                clube: nomeClube,
                linkVideo: url
              });
            }
            console.log(`✅ Vídeo atualizado no Supabase para campanha ${registroId}`);
          } else if (pastaTag === 'OUTRAS_FOTOS') {
            let csvExistente = '';
            const campanha = await getCampanhaPorId(nomeClube, registroId);
            if (campanha && campanha.linkOutrasFotos) {
              csvExistente = String(campanha.linkOutrasFotos).trim();
            } else if (typeof portalFetchCampanhaOutrasFotosUrl === 'function') {
              csvExistente = (await portalFetchCampanhaOutrasFotosUrl(registroId)) || '';
            }
            const existentes = csvExistente
              .split(',')
              .map(item => item.trim())
              .filter(Boolean);
            if (!existentes.includes(url)) {
              existentes.push(url);
            }
            const novoCsv = existentes.join(', ');
            if (typeof portalPatchCampanhaOutrasFotosUrl === 'function') {
              await portalPatchCampanhaOutrasFotosUrl(registroId, novoCsv);
            } else {
              await portalUpsertCampanha({
                id: registroId,
                clube: nomeClube,
                linkOutrasFotos: novoCsv
              });
            }
            console.log(`✅ Outras fotos atualizadas no Supabase para campanha ${registroId}`);
          }
        } catch (error) {
          console.error('Erro ao sincronizar mídia com o Supabase (tabela):', error);
          throw error;
        }
      }
      
      return resultado;
    }
    
    // FALLBACK: Se não estiver usando Supabase, usar Google Drive (legado)
    console.warn('⚠️ Usando Google Drive (fallback) - considere migrar para Supabase Storage');

    let pastaId;
    switch (pastaTag) {
      case 'FOTOS_OFICIAIS':
        pastaId = FOLDER_FOTOS_OFICIAIS_CAMPANHAS;
        break;
      case 'FOTOS_OFICIAIS_ATIVIDADES':
        pastaId = FOLDER_FOTOS_OFICIAIS_ATIVIDADES;
        break;
      case 'VIDEOS':
        pastaId = FOLDER_VIDEOS;
        break;
      case 'OUTRAS_FOTOS':
        pastaId = FOLDER_OUTRAS_FOTOS;
        break;
      default:
        throw new Error(`Pasta não definida: ${pastaTag}`);
    }

    let pastaPai;
    try {
      pastaPai = DriveApp.getFolderById(pastaId);
    } catch (error) {
      throw new Error(`Pasta principal não encontrada: ${pastaId}`);
    }

    let pastaClube;
    try {
      const subPastas = pastaPai.getFoldersByName(nomeClube);
      if (subPastas.hasNext()) {
        pastaClube = subPastas.next();
        console.log(`Pasta do clube encontrada: ${nomeClube}`);
      } else {
        pastaClube = pastaPai.createFolder(nomeClube);
        console.log(`Pasta do clube criada: ${nomeClube}`);
      }
    } catch (error) {
      throw new Error(`Erro ao acessar/criar pasta do clube: ${error.message}`);
    }

    let file;
    try {
      const timestamp = new Date().getTime();
      const nomeUnico = `${timestamp}_${nomeArquivo}`;

      file = pastaClube.createFile(blob.setName(nomeUnico));
      console.log(`Arquivo criado com sucesso: ${nomeUnico}`);
    } catch (error) {
      throw new Error(`Erro ao criar arquivo no Drive: ${error.message}`);
    }

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (error) {
      console.warn(`Aviso: Não foi possível definir permissões do arquivo: ${error.message}`);
    }

    const url = file.getUrl();
    console.log(`URL do arquivo: ${url}`);

    // Se não estiver usando Supabase ou não houver registroId, tentar atualizar planilha (fallback)
    let planilhaClubeId, aba, coluna;
    const usarPlanilha = !(typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true);

    if (usarPlanilha) {
    if (pastaTag.includes('ATIVIDADES')) {
        planilhaClubeId = typeof PLANILHAS_ATIVIDADES !== 'undefined' ? PLANILHAS_ATIVIDADES[nomeClube] : null;
      aba = ABA_ATIVIDADES;
      coluna = COL_LINK_FOTO_OFICIAL_ATIVIDADES;
    } else {
        planilhaClubeId = typeof PLANILHAS_CAMPANHAS !== 'undefined' ? PLANILHAS_CAMPANHAS[nomeClube] : null;
      aba = ABA_CAMPANHAS;

      switch (pastaTag) {
        case 'FOTOS_OFICIAIS':
          coluna = COL_LINK_FOTO_OFICIAL_CAMPANHAS;
          break;
        case 'VIDEOS':
          coluna = COL_LINK_VIDEO;
          break;
        case 'OUTRAS_FOTOS':
          coluna = COL_LINK_OUTRAS_FOTOS;
          break;
      }
    }

    if (!planilhaClubeId) {
        // Se não há planilha e está usando Supabase, não é erro
        if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
          console.log('Usando Supabase, pulando atualização de planilha');
          return {
            sucesso: true,
            url: url,
            nomeArquivo: file.getName(),
            tamanho: blob.getBytes().length,
            tipo: mimeType,
            registroId: registroId,
            validado: registroId ? true : false
          };
        }
      throw new Error(`Planilha não mapeada para o clube: ${nomeClube}`);
      }
    } else {
      // Usando Supabase, não precisa atualizar planilha
      return {
        sucesso: true,
        url: url,
        nomeArquivo: file.getName(),
        tamanho: blob.getBytes().length,
        tipo: mimeType,
        registroId: registroId,
        validado: registroId ? true : false
      };
    }

    // Só tentar acessar planilha se realmente estiver usando planilhas
    if (!usarPlanilha || !planilhaClubeId) {
      return {
        sucesso: true,
        url: url,
        nomeArquivo: file.getName(),
        tamanho: blob.getBytes().length,
        tipo: mimeType,
        registroId: registroId,
        validado: registroId ? true : false
      };
    }

    let ss, sheet;
    try {
      ss = SpreadsheetApp.openById(planilhaClubeId);
      sheet = ss.getSheetByName(aba);
      if (!sheet) {
        throw new Error(`Aba "${aba}" não encontrada`);
      }
    } catch (error) {
      throw new Error(`Erro ao acessar planilha: ${error.message}`);
    }

    try {
      let linhaDestino;

      if (registroId) {
        // CORRIGIDO: Localizar linha específica pelo ID do registro
        console.log(`Localizando registro com ID: ${registroId}`);

        if (pastaTag.includes('ATIVIDADES')) {
          const atividade = await getAtividadePorId(nomeClube, registroId);
          if (!atividade) {
            throw new Error(`Atividade com ID ${registroId} não encontrada`);
          }
          linhaDestino = atividade.rowIndex;
        } else {
          const campanha = await getCampanhaPorId(nomeClube, registroId);
          if (!campanha) {
            throw new Error(`Campanha com ID ${registroId} não encontrada`);
          }
          linhaDestino = campanha.rowIndex;
        }

        console.log(`Registro encontrado na linha: ${linhaDestino}`);
      } else {
        // FALLBACK: Usar última linha apenas se não houver ID específico
        console.warn('AVISO: Upload sem ID específico - usando última linha como fallback');
        linhaDestino = sheet.getLastRow();
        if (linhaDestino < 2) {
          throw new Error('Nenhum registro encontrado para anexar o arquivo');
        }
      }

      // CORRIGIDO: Para OUTRAS_FOTOS, concatenar URLs separadas por vírgula em vez de sobrescrever
      // Usar LockService para evitar condição de corrida quando múltiplos uploads acontecem simultaneamente
      if (pastaTag === 'OUTRAS_FOTOS') {
        // Criar um lock único para esta linha e coluna específica
        const lockId = `outras_fotos_${planilhaClubeId}_${linhaDestino}_${coluna}`;
        const lock = LockService.getScriptLock();
        
        try {
          // Tentar adquirir o lock com timeout de 30 segundos
          lock.waitLock(30000);
          
          // Ler valor atual dentro do lock
          const valorAtual = sheet.getRange(linhaDestino, coluna).getValue();
          let novasUrls;
          
          if (valorAtual && valorAtual.toString().trim() !== '') {
            // Já existem URLs, adicionar a nova separada por vírgula
            const urlsExistentes = valorAtual.toString().split(',').map(u => u.trim()).filter(u => u);
            // Evitar duplicatas
            if (!urlsExistentes.includes(url)) {
              urlsExistentes.push(url);
              novasUrls = urlsExistentes.join(', ');
            } else {
              novasUrls = valorAtual.toString(); // URL já existe, manter como está
              console.log(`URL já existe, mantendo valores atuais`);
            }
          } else {
            // Primeira URL
            novasUrls = url;
          }
          
          // Escrever valor atualizado dentro do lock
          sheet.getRange(linhaDestino, coluna).setValue(novasUrls);
          const totalUrls = novasUrls.split(',').map(u => u.trim()).filter(u => u).length;
          console.log(`Link de outras fotos atualizado (concatenado) na planilha - Linha: ${linhaDestino}, Coluna: ${coluna}, Total URLs: ${totalUrls}`);
          
        } catch (error) {
          console.error(`Erro ao adquirir lock para outras fotos: ${error.message}`);
          // Fallback: tentar sem lock (pode haver condição de corrida)
          const valorAtual = sheet.getRange(linhaDestino, coluna).getValue();
          let novasUrls;
          
          if (valorAtual && valorAtual.toString().trim() !== '') {
            const urlsExistentes = valorAtual.toString().split(',').map(u => u.trim()).filter(u => u);
            if (!urlsExistentes.includes(url)) {
              urlsExistentes.push(url);
              novasUrls = urlsExistentes.join(', ');
            } else {
              novasUrls = valorAtual.toString();
            }
          } else {
            novasUrls = url;
          }
          
          sheet.getRange(linhaDestino, coluna).setValue(novasUrls);
        } finally {
          // Sempre liberar o lock
          lock.releaseLock();
        }
      } else {
        // Para outros tipos (FOTOS_OFICIAIS, VIDEOS), sobrescrever normalmente
        sheet.getRange(linhaDestino, coluna).setValue(url);
        console.log(`Link atualizado na planilha - Linha: ${linhaDestino}, Coluna: ${coluna}, Registro ID: ${registroId}`);
      }

      // VALIDAÇÃO DE INTEGRIDADE: Verificar se o link foi salvo corretamente
      if (registroId) {
        const validacao = await validarIntegridadeUpload(nomeClube, registroId, coluna, url, pastaTag.includes('ATIVIDADES'));
        if (!validacao.valido) {
          console.error('ERRO DE INTEGRIDADE:', validacao);
          throw new Error(`Falha na validação de integridade: ${validacao.erro || 'Link não foi salvo na linha correta'}`);
        } else {
          console.log('✅ Validação de integridade passou - Link salvo corretamente');
        }
      }

    } catch (error) {
      throw new Error(`Erro ao atualizar planilha: ${error.message}`);
    }

    return {
      sucesso: true,
      url: url,
      nomeArquivo: file.getName(),
      tamanho: blob.getBytes().length,
      tipo: mimeType,
      registroId: registroId,
      validado: registroId ? true : false
    };

  } catch (error) {
    console.error(`Erro no upload: ${error.message}`);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

/**
 * Obter URL da foto por registroId (pode ser temporário)
 * @param {string} registroId - ID do registro (pode ser temporário)
 * @param {string} nomeClube - Nome do clube
 * @param {string} pastaTag - Tag da pasta ('FOTOS_OFICIAIS_ATIVIDADES', etc)
 * @return {string|null} URL da foto ou null se não encontrada
 */
async function obterUrlFotoPorRegistroId(registroId, nomeClube, pastaTag) {
  try {
    if (!registroId || !nomeClube || !pastaTag) {
      console.warn('⚠️ obterUrlFotoPorRegistroId: Parâmetros inválidos', { registroId, nomeClube, pastaTag });
      return null;
    }
    
    console.log('🔍 Buscando foto por registroId:', registroId, 'Clube:', nomeClube, 'Pasta:', pastaTag);
    
    // CORRIGIDO: Se estiver usando Supabase, buscar do Storage
    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      try {
        // Determinar bucket
        let bucket;
        switch (pastaTag) {
          case 'FOTOS_OFICIAIS_ATIVIDADES':
            bucket = 'atividades-fotos';
            break;
          case 'FOTOS_OFICIAIS':
            bucket = 'campanhas-fotos';
            break;
          case 'VIDEOS':
            bucket = 'campanhas-videos';
            break;
          case 'OUTRAS_FOTOS':
            bucket = 'campanhas-fotos';
            break;
          default:
            console.warn('⚠️ PastaTag não reconhecida:', pastaTag);
            return null;
        }
        
        // Usar SOMENTE path legacy (mega_*) para consistência
        const clubeNormalizado = (typeof portalNormalizarNomeClubeParaBucketLegacy === 'function')
          ? portalNormalizarNomeClubeParaBucketLegacy(nomeClube)
          : (typeof portalNormalizarNomeClubeParaBucket === 'function' ? portalNormalizarNomeClubeParaBucket(nomeClube) : nomeClube.replace(/\s+/g, '_'));
        
        let caminhoBase;
        if (pastaTag === 'FOTOS_OFICIAIS_ATIVIDADES') {
          caminhoBase = `atividades/${clubeNormalizado}/${registroId}/foto_oficial/`;
        } else if (pastaTag === 'FOTOS_OFICIAIS') {
          caminhoBase = `campanhas/${clubeNormalizado}/${registroId}/foto_oficial/`;
        } else if (pastaTag === 'VIDEOS') {
          caminhoBase = `campanhas/${clubeNormalizado}/${registroId}/video/`;
        } else if (pastaTag === 'OUTRAS_FOTOS') {
          caminhoBase = `campanhas/${clubeNormalizado}/${registroId}/outras_fotos/`;
        } else {
          return null;
        }
        
        // Supabase Storage API: POST /object/list/{bucket} com body JSON { prefix, limit }
        const urlList = `${PORTAL_SUPABASE_CONFIG.url}/storage/v1/object/list/${bucket}`;
        const payload = JSON.stringify({
          prefix: caminhoBase,
          limit: 10
        });
        const resp = await gasStyleFetch(urlList, {
          method: 'POST',
          headers: {
            'apikey': PORTAL_SUPABASE_CONFIG.serviceRoleKey,
            'Authorization': `Bearer ${PORTAL_SUPABASE_CONFIG.serviceRoleKey}`,
            'Content-Type': 'application/json'
          },
          payload: payload,
          muteHttpExceptions: true
        });
        if (resp.getResponseCode() === 200) {
          const arquivos = JSON.parse(resp.getContentText() || '[]');
          if (arquivos && arquivos.length > 0) {
            const primeiro = arquivos[0];
            const nomeArquivo = (typeof primeiro === 'object' && primeiro !== null && primeiro.name) 
              ? primeiro.name 
              : String(primeiro);
            // name pode ser path completo (ex: campanhas/mega_X/uuid/foto_oficial/arquivo.png) ou só o nome
            const caminhoCompleto = nomeArquivo.indexOf('/') >= 0 
              ? nomeArquivo 
              : caminhoBase.replace(/\/$/, '') + '/' + nomeArquivo;
            const urlPublica = `${PORTAL_SUPABASE_CONFIG.url}/storage/v1/object/public/${bucket}/${caminhoCompleto}`;
            console.log('✅ URL obtida do Supabase Storage (legacy):', urlPublica);
            return urlPublica;
          }
        } else {
          console.warn('⚠️ Supabase list resp:', resp.getResponseCode(), resp.getContentText());
        }
        console.warn('⚠️ Nenhum arquivo encontrado no Supabase Storage para:', caminhoBase);
        return null;
      } catch (error) {
        console.warn('⚠️ Erro ao buscar do Supabase Storage:', error);
        // Quando Supabase está ativo, não tentar Google Drive
        return null;
      }
    }
    
    // FALLBACK: Buscar do Google Drive (legado — só quando Supabase NÃO está ativo)
    let pastaId;
    switch (pastaTag) {
      case 'FOTOS_OFICIAIS':
        pastaId = FOLDER_FOTOS_OFICIAIS_CAMPANHAS;
        break;
      case 'FOTOS_OFICIAIS_ATIVIDADES':
        pastaId = FOLDER_FOTOS_OFICIAIS_ATIVIDADES;
        break;
      case 'VIDEOS':
        pastaId = FOLDER_VIDEOS;
        break;
      case 'OUTRAS_FOTOS':
        pastaId = FOLDER_OUTRAS_FOTOS;
        break;
      default:
        console.warn('⚠️ PastaTag não reconhecida:', pastaTag);
        return null;
    }
    
    const pastaPai = DriveApp.getFolderById(pastaId);
    const subPastas = pastaPai.getFoldersByName(nomeClube);
    
    if (!subPastas.hasNext()) {
      console.warn('⚠️ Pasta do clube não encontrada:', nomeClube, 'na pasta:', pastaTag);
      return null;
    }
    
    const pastaClube = subPastas.next();
    const arquivos = pastaClube.getFiles();
    
    // Listar todos os arquivos para debug
    const arquivosEncontrados = [];
    while (arquivos.hasNext()) {
      const arquivo = arquivos.next();
      const nomeArquivo = arquivo.getName();
      arquivosEncontrados.push(nomeArquivo);
      
      // Se o registroId está no nome do arquivo (pode estar no início ou meio)
      if (nomeArquivo.includes(registroId)) {
        console.log('✅ Arquivo encontrado:', nomeArquivo);
        arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        const url = arquivo.getUrl();
        console.log('✅ URL obtida:', url);
        return url;
      }
    }
    
    console.warn('⚠️ Arquivo não encontrado. RegistroId buscado:', registroId);
    console.warn('⚠️ Arquivos na pasta:', arquivosEncontrados);
    return null;
  } catch (error) {
    console.error('❌ Erro ao obter URL da foto:', error);
    return null;
  }
}

/**
 * Lista arquivos da campanha no Storage (foto oficial, vídeo, outras fotos).
 * Usado pelo modal de Arquivos para exibir fotos quando o banco não tem a URL.
 */
async function portalBuscarArquivosCampanha(registroId, nomeClube) {
  const arquivos = [];
  if (!registroId || !nomeClube) return arquivos;
  const urlFoto = await obterUrlFotoPorRegistroId(registroId, nomeClube, 'FOTOS_OFICIAIS');
  if (urlFoto) {
    arquivos.push({ nome: 'Foto Oficial', url: urlFoto, tipo: 'Foto Oficial', isImage: true });
  }
  const urlVideo = await obterUrlFotoPorRegistroId(registroId, nomeClube, 'VIDEOS');
  if (urlVideo) {
    arquivos.push({ nome: 'Vídeo da Campanha', url: urlVideo, tipo: 'Vídeo', isImage: false });
  }
  return arquivos;
}

/**
 * Lista arquivos da atividade no Storage (foto oficial).
 */
async function portalBuscarArquivosAtividade(registroId, nomeClube) {
  const arquivos = [];
  if (!registroId || !nomeClube) return arquivos;
  const urlFoto = await obterUrlFotoPorRegistroId(registroId, nomeClube, 'FOTOS_OFICIAIS_ATIVIDADES');
  if (urlFoto) {
    arquivos.push({ nome: 'Foto Oficial', url: urlFoto, tipo: 'Foto Oficial', isImage: true });
  }
  return arquivos;
}

/**
 * Atualizar referência do arquivo quando o registroId muda (de temporário para definitivo)
 * @param {string} registroIdAntigo - ID antigo (temporário)
 * @param {string} registroIdNovo - ID novo (definitivo)
 * @param {string} nomeClube - Nome do clube
 * @param {string} pastaTag - Tag da pasta
 * @return {Object} Resultado da operação
 */
function atualizarReferenciaArquivo(registroIdAntigo, registroIdNovo, nomeClube, pastaTag) {
  try {
    if (!registroIdAntigo || !registroIdNovo || !nomeClube || !pastaTag) {
      return { sucesso: false, erro: 'Parâmetros obrigatórios faltando' };
    }
    
    let pastaId;
    switch (pastaTag) {
      case 'FOTOS_OFICIAIS':
        pastaId = FOLDER_FOTOS_OFICIAIS_CAMPANHAS;
        break;
      case 'FOTOS_OFICIAIS_ATIVIDADES':
        pastaId = FOLDER_FOTOS_OFICIAIS_ATIVIDADES;
        break;
      case 'VIDEOS':
        pastaId = FOLDER_VIDEOS;
        break;
      case 'OUTRAS_FOTOS':
        pastaId = FOLDER_OUTRAS_FOTOS;
        break;
      default:
        return { sucesso: false, erro: 'Pasta não definida' };
    }
    
    const pastaPai = DriveApp.getFolderById(pastaId);
    const subPastas = pastaPai.getFoldersByName(nomeClube);
    
    if (!subPastas.hasNext()) {
      return { sucesso: false, erro: 'Pasta do clube não encontrada' };
    }
    
    const pastaClube = subPastas.next();
    const arquivos = pastaClube.getFiles();
    
    // Procurar arquivo com registroIdAntigo e renomear
    while (arquivos.hasNext()) {
      const arquivo = arquivos.next();
      const nomeArquivo = arquivo.getName();
      
      if (nomeArquivo.includes(registroIdAntigo)) {
        // Renomear arquivo substituindo ID antigo pelo novo
        const novoNome = nomeArquivo.replace(registroIdAntigo, registroIdNovo);
        arquivo.setName(novoNome);
        console.log(`Arquivo renomeado: ${nomeArquivo} -> ${novoNome}`);
        return { sucesso: true };
      }
    }
    
    return { sucesso: false, erro: 'Arquivo não encontrado' };
  } catch (error) {
    console.error('Erro ao atualizar referência do arquivo:', error);
    return { sucesso: false, erro: error.message };
  }
}

// === FUNÇÕES DE TESTE DAS CORREÇÕES ===
async function testarCorrecoesUpload() {
  console.log('🔧 TESTE DAS CORREÇÕES DE UPLOAD DE FOTOS');
  console.log('===========================================');

  const clubeTeste = "Ômega Cunha Porã";

  console.log('\n🆔 1. Testando geração de IDs únicos...');
  try {
    const id1 = gerarIdUnico();
    const id2 = gerarIdUnico();

    console.log(`✓ ID 1: ${id1}`);
    console.log(`✓ ID 2: ${id2}`);
    console.log(`✓ IDs são únicos: ${id1 !== id2}`);

    if (id1 === id2) {
      throw new Error('IDs gerados não são únicos!');
    }
  } catch (error) {
    console.error(`✗ Erro ao testar IDs únicos: ${error.message}`);
  }

  console.log('\n📋 2. Testando estrutura de campanhas...');
  try {
    const campanhas = await getCampanhasDoClube(clubeTeste);
    console.log(`✓ ${campanhas.length} campanhas encontradas para ${clubeTeste}`);

    if (campanhas.length > 0) {
      const campanha = campanhas[0];
      console.log(`✓ Primeira campanha - ID: ${campanha.id}, Título: ${campanha.titulo}`);
      console.log(`✓ Row Index: ${campanha.rowIndex}`);
    }
  } catch (error) {
    console.error(`✗ Erro ao testar campanhas: ${error.message}`);
  }

  console.log('\n📅 3. Testando estrutura de atividades...');
  try {
    const atividades = await getAtividadesDoClube(clubeTeste);
    console.log(`✓ ${atividades.length} atividades encontradas para ${clubeTeste}`);

    if (atividades.length > 0) {
      const atividade = atividades[0];
      console.log(`✓ Primeira atividade - ID: ${atividade.id}, Título: ${atividade.titulo}`);
      console.log(`✓ Row Index: ${atividade.rowIndex}`);
    }
  } catch (error) {
    console.error(`✗ Erro ao testar atividades: ${error.message}`);
  }

  console.log('\n🔍 4. Testando busca por ID...');
  try {
    const campanhas = await getCampanhasDoClube(clubeTeste);
    if (campanhas.length > 0) {
      const campanhaId = campanhas[0].id;
      const campanhaEncontrada = await getCampanhaPorId(clubeTeste, campanhaId);

      if (campanhaEncontrada) {
        console.log(`✓ Campanha encontrada por ID: ${campanhaEncontrada.titulo}`);
      } else {
        console.error('✗ Campanha não encontrada por ID');
      }
    }

    const atividades = await getAtividadesDoClube(clubeTeste);
    if (atividades.length > 0) {
      const atividadeId = atividades[0].id;
      const atividadeEncontrada = await getAtividadePorId(clubeTeste, atividadeId);

      if (atividadeEncontrada) {
        console.log(`✓ Atividade encontrada por ID: ${atividadeEncontrada.titulo}`);
      } else {
        console.error('✗ Atividade não encontrada por ID');
      }
    }
  } catch (error) {
    console.error(`✗ Erro ao testar busca por ID: ${error.message}`);
  }

  console.log('\n✅ Teste das correções concluído!');
  console.log('Agora os uploads devem ir para os registros corretos.');
}

// === MIGRAÇÃO DE REGISTROS EXISTENTES ===
function migrarRegistrosExistentes(nomeClube = null, forcarMigracao = false) {
  console.log('🔄 MIGRAÇÃO DE REGISTROS EXISTENTES');
  console.log('====================================');

  if (!nomeClube) {
    console.log('⚠️ Migrando TODOS os clubes. Isso pode demorar...');
    if (!forcarMigracao) {
      console.log('❌ Para migrar todos os clubes, chame: migrarRegistrosExistentes(null, true)');
      return {
        campanhasMigradas: 0,
        atividadesMigradas: 0,
        totalMigrado: 0,
        clubesProcessados: 0,
        erro: 'Migração cancelada - defina forcarMigracao como true para migrar todos os clubes'
      };
    }
  }

  const clubesParaMigrar = nomeClube ? [nomeClube] : Object.keys(PLANILHAS_CAMPANHAS);
  let totalCampanhasMigradas = 0;
  let totalAtividadesMigradas = 0;

  clubesParaMigrar.forEach((clube, index) => {
    console.log(`\n📍 Migrando clube ${index + 1}/${clubesParaMigrar.length}: ${clube}`);

    try {
      // Migrar campanhas
      const campanhasMigradas = migrarCampanhasDoClube(clube);
      totalCampanhasMigradas += campanhasMigradas;

      // Migrar atividades
      const atividadesMigradas = migrarAtividadesDoClube(clube);
      totalAtividadesMigradas += atividadesMigradas;

      console.log(`✅ ${clube}: ${campanhasMigradas} campanhas, ${atividadesMigradas} atividades migradas`);

    } catch (error) {
      console.error(`❌ Erro ao migrar ${clube}: ${error.message}`);
    }
  });

  console.log(`\n🎉 MIGRAÇÃO CONCLUÍDA:`);
  console.log(`   - Total de campanhas migradas: ${totalCampanhasMigradas}`);
  console.log(`   - Total de atividades migradas: ${totalAtividadesMigradas}`);
  console.log(`   - Clubes processados: ${clubesParaMigrar.length}`);

  return {
    campanhasMigradas: totalCampanhasMigradas,
    atividadesMigradas: totalAtividadesMigradas,
    totalMigrado: totalCampanhasMigradas + totalAtividadesMigradas,
    clubesProcessados: clubesParaMigrar.length
  };
}

function migrarCampanhasDoClube(nomeClube = null) {
  // Se nomeClube for null, processar todos os clubes
  if (!nomeClube) {
    console.log('🔄 Criando IDs para campanhas de todos os clubes...');
    const todosOsClubes = Object.keys(PLANILHAS_CAMPANHAS);
    let totalMigrado = 0;

    todosOsClubes.forEach(clube => {
      try {
        const resultado = migrarCampanhasDoClube(clube);
        const migrados = resultado.campanhasMigradas || 0;
        totalMigrado += migrados;
        console.log(`✅ ${clube}: ${migrados} campanhas processadas`);
      } catch (error) {
        console.error(`❌ Erro ao processar ${clube}: ${error.message}`);
      }
    });

    return {
      campanhasMigradas: totalMigrado,
      clubesProcessados: todosOsClubes.length,
      totalMigrado: totalMigrado
    };
  }

  const planilhaClubeId = PLANILHAS_CAMPANHAS[nomeClube];
  if (!planilhaClubeId) {
    console.warn(`⚠️ Planilha de campanhas não mapeada para: ${nomeClube}`);
    return 0;
  }

  try {
    const ss = SpreadsheetApp.openById(planilhaClubeId);
    let sheet = ss.getSheetByName(ABA_CAMPANHAS);

    if (!sheet) {
      console.log(`📝 Criando aba de campanhas para ${nomeClube}`);
      sheet = criarAbaCampanhas(ss);
      return 0;
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      console.log(`📝 Nenhuma campanha para migrar em ${nomeClube}`);
      return 0;
    }

    // ATUALIZADO: Verificar se todas as 33 colunas existem (estrutura + ID + comentários)
    const ultimaColuna = sheet.getLastColumn();
    const colunaIdEsperada = 33; // A-AG: 29 estrutura + ID + 3 comentários

    if (ultimaColuna < colunaIdEsperada) {
      console.log(`🔧 Adicionando colunas faltantes para campanhas de ${nomeClube} (${ultimaColuna} -> ${colunaIdEsperada})`);

      // Cabeçalhos completos esperados
      const cabecalhoCompleto = [
        'Carimbo Data e Hora', 'AL', 'Trimestre', 'Clube', 'Titulo Campanha',
        'Objetivo Campanha', 'Data e Hora início', 'Data e Hora Fim', 'Coordenador(a)',
        'Comissão', 'Membros na Comissão', 'Associados Presentes', 'Quantidade Associados Presentes',
        'Pré LEO`s Presentes', 'Quantidade Pré LEO`s Presentes', 'Amigos LEO e Conselheiros Presentes',
        'Quantidade Conselheiros e Amigos LEO Presentes', 'Pessoas Impactadas', 'Custo Campanha',
        'Companheiros Leões Presentes', 'Horas trabalhadas por pessoa', 'Horas Totais Trabalhadas',
        'Descrição Campanha', 'Eixo D8', 'Eixo DM', 'Foto Oficial',
        'Video Campanha', 'Outras Fotos', 'Texto HTML', 'ID Único',
        'Comentário Distrital', 'Marcado como Corrigido', 'Quem Corrigiu'
      ];

      // Recriar cabeçalho completo
      sheet.getRange(1, 1, 1, cabecalhoCompleto.length).setValues([cabecalhoCompleto]);
    }

    let registrosMigrados = 0;

    // Processar cada linha de dados - ID único fica na coluna AD (30)
    const colunaIdUnico = 30; // Coluna AD
    for (let linha = 2; linha <= lastRow; linha++) {
      const idAtual = sheet.getRange(linha, colunaIdUnico).getValue();

      if (!idAtual || idAtual.toString().trim() === '') {
        // Gerar novo ID único baseado na data de registro + índice para evitar conflitos
        const dataRegistro = sheet.getRange(linha, 1).getValue();
        const timestamp = dataRegistro instanceof Date ? dataRegistro.getTime() : new Date().getTime();
        const idUnico = `${timestamp}_${linha}_C`; // C = Campanha

        sheet.getRange(linha, colunaIdUnico).setValue(idUnico);
        registrosMigrados++;

        console.log(`   ✓ Linha ${linha}: ID gerado = ${idUnico}`);
      } else {
        console.log(`   ℹ️ Linha ${linha}: ID já existe = ${idAtual}`);
      }
    }

    console.log(`✅ Campanhas de ${nomeClube}: ${registrosMigrados} registros migrados`);
    return {
      campanhasMigradas: registrosMigrados,
      clubesProcessados: 1,
      totalMigrado: registrosMigrados
    };

  } catch (error) {
    console.error(`❌ Erro ao migrar campanhas de ${nomeClube}: ${error.message}`);
    return {
      campanhasMigradas: 0,
      clubesProcessados: 0,
      totalMigrado: 0,
      erro: error.message
    };
  }
}

function migrarAtividadesDoClube(nomeClube = null) {
  // Se nomeClube for null, processar todos os clubes
  if (!nomeClube) {
    console.log('🔄 Criando IDs para atividades de todos os clubes...');
    const todosOsClubes = Object.keys(PLANILHAS_ATIVIDADES);
    let totalMigrado = 0;

    todosOsClubes.forEach(clube => {
      try {
        const resultado = migrarAtividadesDoClube(clube);
        const migrados = resultado.atividadesMigradas || 0;
        totalMigrado += migrados;
        console.log(`✅ ${clube}: ${migrados} atividades processadas`);
      } catch (error) {
        console.error(`❌ Erro ao processar ${clube}: ${error.message}`);
      }
    });

    return {
      atividadesMigradas: totalMigrado,
      clubesProcessados: todosOsClubes.length,
      totalMigrado: totalMigrado
    };
  }

  const planilhaClubeId = PLANILHAS_ATIVIDADES[nomeClube];
  if (!planilhaClubeId) {
    console.warn(`⚠️ Planilha de atividades não mapeada para: ${nomeClube}`);
    return 0;
  }

  try {
    const ss = SpreadsheetApp.openById(planilhaClubeId);
    let sheet = ss.getSheetByName(ABA_ATIVIDADES);

    if (!sheet) {
      console.log(`📝 Criando aba de atividades para ${nomeClube}`);
      sheet = criarAbaAtividades(ss);
      return 0;
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      console.log(`📝 Nenhuma atividade para migrar em ${nomeClube}`);
      return 0;
    }

    // Verificar se a coluna de ID existe (última coluna)
    const ultimaColuna = sheet.getLastColumn();
    const colunaIdEsperada = 27; // Baseado no novo cabeçalho para atividades

    if (ultimaColuna < colunaIdEsperada) {
      console.log(`🔧 Adicionando colunas faltantes para atividades de ${nomeClube}`);
      const novosHeaders = [];

      if (ultimaColuna < 24) novosHeaders.push('Comentário Distrital');
      if (ultimaColuna < 25) novosHeaders.push('Marcado como Corrigido');
      if (ultimaColuna < 26) novosHeaders.push('Quem Corrigiu');
      if (ultimaColuna < 27) novosHeaders.push('ID Único');

      // Adicionar cabeçalhos
      for (let i = 0; i < novosHeaders.length; i++) {
        sheet.getRange(1, ultimaColuna + 1 + i).setValue(novosHeaders[i]);
      }
    }

    let registrosMigrados = 0;

    // Processar cada linha de dados
    for (let linha = 2; linha <= lastRow; linha++) {
      const titulo = sheet.getRange(linha, 5).getValue(); // Coluna E - Título da Atividade

      // Pular linhas sem título
      if (!titulo || titulo.toString().trim() === '') {
        continue;
      }

      const idAtual = sheet.getRange(linha, colunaIdEsperada).getValue();

      if (!idAtual || idAtual.toString().trim() === '') {
        // Gerar novo ID único baseado na data de registro + índice para evitar conflitos
        const dataRegistro = sheet.getRange(linha, 1).getValue();
        const timestamp = dataRegistro instanceof Date ? dataRegistro.getTime() : new Date().getTime();
        const idUnico = `${timestamp}_${linha}_A`; // A = Atividade

        sheet.getRange(linha, colunaIdEsperada).setValue(idUnico);
        registrosMigrados++;

        console.log(`   ✓ Linha ${linha}: ID gerado = ${idUnico} (${titulo})`);
      } else {
        console.log(`   ℹ️ Linha ${linha}: ID já existe = ${idAtual} (${titulo})`);
      }
    }

    console.log(`✅ Atividades de ${nomeClube}: ${registrosMigrados} registros migrados`);
    return {
      atividadesMigradas: registrosMigrados,
      clubesProcessados: 1,
      totalMigrado: registrosMigrados
    };

  } catch (error) {
    console.error(`❌ Erro ao migrar atividades de ${nomeClube}: ${error.message}`);
    return {
      atividadesMigradas: 0,
      clubesProcessados: 0,
      totalMigrado: 0,
      erro: error.message
    };
  }
}

async function testarMigracaoIds(clubeEspecifico = null) {
  console.log('🧪 TESTE DE MIGRAÇÃO DE IDs');
  console.log('===========================');

  let totalCampanhasSemId = 0;
  let totalAtividadesSemId = 0;
  let totalRegistrosParaMigrar = 0;

  // Se um clube específico foi fornecido, analisar apenas ele
  const todosOsClubes = Object.keys(PLANILHAS_CAMPANHAS);
  const clubes = clubeEspecifico ? [clubeEspecifico] : todosOsClubes;

  if (clubeEspecifico) {
    console.log(`🎯 Analisando clube específico: ${clubeEspecifico}`);
  } else {
    console.log(`📊 Analisando todos os ${clubes.length} clubes`);
  }

  for (const clube of clubes) {
    console.log(`\n📍 Analisando clube: ${clube}`);

    try {
      // Verificar campanhas
      const campanhas = await getCampanhasDoClube(clube);
      const campanhasSemId = campanhas.filter(c => !c.id || c.id === '').length;
      totalCampanhasSemId += campanhasSemId;

      // Verificar atividades
      const atividades = await getAtividadesDoClube(clube);
      const atividadesSemId = atividades.filter(a => !a.id || a.id === '').length;
      totalAtividadesSemId += atividadesSemId;

      console.log(`   📊 Campanhas sem ID: ${campanhasSemId}`);
      console.log(`   📊 Atividades sem ID: ${atividadesSemId}`);

    } catch (error) {
      console.error(`❌ Erro ao analisar ${clube}: ${error.message}`);
    }
  }

  totalRegistrosParaMigrar = totalCampanhasSemId + totalAtividadesSemId;

  console.log(`\n📋 RESUMO DO TESTE:`);
  console.log(`   - Campanhas sem ID: ${totalCampanhasSemId}`);
  console.log(`   - Atividades sem ID: ${totalAtividadesSemId}`);
  console.log(`   - Total para migrar: ${totalRegistrosParaMigrar}`);
  console.log(`   - Clubes analisados: ${clubes.length}`);

  return {
    campanhasSemId: totalCampanhasSemId,
    atividadesSemId: totalAtividadesSemId,
    totalParaMigrar: totalRegistrosParaMigrar,
    clubesAnalisados: clubes.length,
    clubeEspecifico: clubeEspecifico,
    clubesDisponiveis: todosOsClubes.length
  };
}

function validarEstruturasPlanilhas(nomeClube = null) {
  console.log('🔍 VALIDAÇÃO DE ESTRUTURAS DAS PLANILHAS');
  if (nomeClube) {
    console.log(`📋 Validando apenas: ${nomeClube}`);
  } else {
    console.log('📋 Validando todos os clubes');
  }
  console.log('========================================');

  const resultados = {
    campanhas: {},
    atividades: {},
    resumo: {
      totalClubes: 0,
      campanhasComErros: 0,
      atividadesComErros: 0,
      problemas: []
    }
  };

  const todosOsClubes = Object.keys(PLANILHAS_CAMPANHAS);
  const clubes = nomeClube ? [nomeClube] : todosOsClubes;
  resultados.resumo.totalClubes = clubes.length;

  // CORRIGIDO: Estrutura esperada para campanhas (33 colunas) - estrutura REAL + ID + comentários
  const cabecalhoCampanhasEsperado = [
    'Carimbo Data e Hora', 'AL', 'Trimestre', 'Clube', 'Titulo Campanha',
    'Objetivo Campanha', 'Data e Hora início', 'Data e Hora Fim', 'Coordenador(a)',
    'Comissão', 'Membros na Comissão', 'Associados Presentes', 'Quantidade Associados Presentes',
    'Pré LEO`s Presentes', 'Quantidade Pré LEO`s Presentes', 'Amigos LEO e Conselheiros Presentes',
    'Quantidade Conselheiros e Amigos LEO Presentes', 'Pessoas Impactadas', 'Custo Campanha',
    'Companheiros Leões Presentes', 'Horas trabalhadas por pessoa', 'Horas Totais Trabalhadas',
    'Descrição Campanha', 'Eixo D8', 'Eixo DM', 'Foto Oficial',
    'Video Campanha', 'Outras Fotos', 'Texto HTML', 'ID Único',
    'Comentário Distrital', 'Marcado como Corrigido', 'Quem Corrigiu'
  ];

  // Estrutura esperada para atividades (27 colunas) - CORRIGIDO para coincidir com criarAbaAtividades
  const cabecalhoAtividadesEsperado = [
    'Carimbo Hora', 'Clube', 'AL', 'Trimestre', 'Título da Atividade',
    'Tipo da Atividade', 'Data inicio da Atividade', 'Hora inicio',
    'Data Fim da atividade', 'Hora Fim', 'Local da Atividade',
    'Associados Presentes', 'Qtd Associados Presentes', 'Pré LEOs presentes',
    'Qtd Pré-LEOs presentes', 'LEO/Leão presentes', 'Qtd LEO/Leão presentes',
    'Amigos LEO e Conselheiros', 'Qtd Amigos e Conselheiros',
    'Outros Lions', 'Descrição da atividade', 'Foto Oficial',
    'Duração total (minutos)', 'Comentário Distrital', 'Marcado como Corrigido', 'Quem Corrigiu', 'ID Único'
  ];

  clubes.forEach((clube, index) => {
    console.log(`\n📋 Analisando clube ${index + 1}/${clubes.length}: ${clube}`);

    // Validar estrutura de campanhas
    try {
      const campanhasPlanilhaId = PLANILHAS_CAMPANHAS[clube];
      if (campanhasPlanilhaId) {
        const ss = SpreadsheetApp.openById(campanhasPlanilhaId);
        let sheet = ss.getSheetByName(ABA_CAMPANHAS);

        if (!sheet) {
          console.log(`⚠️ Aba de campanhas não existe para ${clube}`);
          resultados.campanhas[clube] = {
            existe: false,
            colunas: 0,
            problemas: ['Aba de campanhas não existe']
          };
          resultados.resumo.campanhasComErros++;
        } else {
          const lastColumn = sheet.getLastColumn();
          const cabecalhoAtual = lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];

          const problemas = [];

          // Verificar número de colunas (esperado: 33 colunas)
          if (lastColumn < 33) {
            problemas.push(`Faltam colunas: tem ${lastColumn}, esperado 33`);
          } else if (lastColumn > 33) {
            problemas.push(`Colunas extras: tem ${lastColumn}, esperado 33`);
          }

          // Verificar se tem ID Único
          const temIdUnico = cabecalhoAtual.includes('ID Único');
          if (!temIdUnico) {
            problemas.push('Coluna "ID Único" não encontrada');
          }

          // Verificar cabeçalhos essenciais (usando estrutura real)
          const cabecalhosEssenciais = ['Titulo Campanha', 'Data e Hora início', 'Coordenador(a)'];
          cabecalhosEssenciais.forEach(cabecalho => {
            if (!cabecalhoAtual.includes(cabecalho)) {
              problemas.push(`Cabeçalho "${cabecalho}" não encontrado`);
            }
          });

          resultados.campanhas[clube] = {
            existe: true,
            colunas: lastColumn,
            temIdUnico,
            problemas
          };

          if (problemas.length > 0) {
            resultados.resumo.campanhasComErros++;
          }
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao analisar campanhas de ${clube}: ${error.message}`);
      resultados.campanhas[clube] = {
        existe: false,
        colunas: 0,
        problemas: [`Erro de acesso: ${error.message}`]
      };
      resultados.resumo.campanhasComErros++;
    }

    // Validar estrutura de atividades
    try {
      const atividadesPlanilhaId = PLANILHAS_ATIVIDADES[clube];
      if (atividadesPlanilhaId) {
        const ss = SpreadsheetApp.openById(atividadesPlanilhaId);
        let sheet = ss.getSheetByName(ABA_ATIVIDADES);

        if (!sheet) {
          console.log(`⚠️ Aba de atividades não existe para ${clube}`);
          resultados.atividades[clube] = {
            existe: false,
            colunas: 0,
            problemas: ['Aba de atividades não existe']
          };
          resultados.resumo.atividadesComErros++;
        } else {
          const lastColumn = sheet.getLastColumn();
          const cabecalhoAtual = lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];

          const problemas = [];

          // Verificar número de colunas
          if (lastColumn < 27) {
            problemas.push(`Faltam colunas: tem ${lastColumn}, esperado 27`);
          } else if (lastColumn > 27) {
            problemas.push(`Colunas extras: tem ${lastColumn}, esperado 27`);
          }

          // Verificar se tem ID Único
          const temIdUnico = cabecalhoAtual.includes('ID Único');
          if (!temIdUnico) {
            problemas.push('Coluna "ID Único" não encontrada');
          }

          // Verificar cabeçalhos essenciais
          const cabecalhosEssenciais = ['Título da Atividade', 'Data de Início', 'Responsável da Atividade'];
          cabecalhosEssenciais.forEach(cabecalho => {
            if (!cabecalhoAtual.includes(cabecalho)) {
              problemas.push(`Cabeçalho "${cabecalho}" não encontrado`);
            }
          });

          resultados.atividades[clube] = {
            existe: true,
            colunas: lastColumn,
            temIdUnico,
            problemas
          };

          if (problemas.length > 0) {
            resultados.resumo.atividadesComErros++;
          }
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao analisar atividades de ${clube}: ${error.message}`);
      resultados.atividades[clube] = {
        existe: false,
        colunas: 0,
        problemas: [`Erro de acesso: ${error.message}`]
      };
      resultados.resumo.atividadesComErros++;
    }
  });

  // Gerar resumo de problemas
  Object.keys(resultados.campanhas).forEach(clube => {
    if (resultados.campanhas[clube].problemas.length > 0) {
      resultados.resumo.problemas.push(`Campanhas ${clube}: ${resultados.campanhas[clube].problemas.join(', ')}`);
    }
  });

  Object.keys(resultados.atividades).forEach(clube => {
    if (resultados.atividades[clube].problemas.length > 0) {
      resultados.resumo.problemas.push(`Atividades ${clube}: ${resultados.atividades[clube].problemas.join(', ')}`);
    }
  });

  console.log(`\n📊 RESUMO DA VALIDAÇÃO:`);
  console.log(`   - Total de clubes: ${resultados.resumo.totalClubes}`);
  console.log(`   - Campanhas com problemas: ${resultados.resumo.campanhasComErros}`);
  console.log(`   - Atividades com problemas: ${resultados.resumo.atividadesComErros}`);
  console.log(`   - Total de problemas: ${resultados.resumo.problemas.length}`);

  return resultados;
}

function corrigirEstruturasPlanilhas(clubeEspecifico = null) {
  console.log('🔧 CORREÇÃO DE ESTRUTURAS DAS PLANILHAS');
  console.log('=======================================');

  const todosClubes = Object.keys(PLANILHAS_CAMPANHAS);
  const clubes = clubeEspecifico ? [clubeEspecifico] : todosClubes;

  if (clubeEspecifico) {
    console.log(`🎯 Corrigindo apenas: ${clubeEspecifico}`);
  } else {
    console.log(`🌐 Corrigindo todos os ${clubes.length} clubes`);
  }

  let campanhasCorrigidas = 0;
  let atividadesCorrigidas = 0;
  const detalhes = [];

  clubes.forEach((clube, index) => {
    console.log(`\n🔧 Corrigindo clube ${index + 1}/${clubes.length}: ${clube}`);

    // Corrigir estrutura de campanhas
    try {
      const campanhasPlanilhaId = PLANILHAS_CAMPANHAS[clube];
      if (campanhasPlanilhaId) {
        const ss = SpreadsheetApp.openById(campanhasPlanilhaId);
        let sheet = ss.getSheetByName(ABA_CAMPANHAS);

        if (!sheet) {
          console.log(`📝 Criando aba de campanhas para ${clube}`);
          sheet = criarAbaCampanhas(ss);
          campanhasCorrigidas++;
        } else {
          const lastColumn = sheet.getLastColumn();
          const cabecalhoAtual = lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];

          // CORRIGIDO: Usar estrutura REAL da planilha
          const cabecalhoCompleto = [
            'Carimbo Data e Hora', 'AL', 'Trimestre', 'Clube', 'Titulo Campanha',
            'Objetivo Campanha', 'Data e Hora início', 'Data e Hora Fim', 'Coordenador(a)',
            'Comissão', 'Membros na Comissão', 'Associados Presentes', 'Quantidade Associados Presentes',
            'Pré LEO`s Presentes', 'Quantidade Pré LEO`s Presentes', 'Amigos LEO e Conselheiros Presentes',
            'Quantidade Conselheiros e Amigos LEO Presentes', 'Pessoas Impactadas', 'Custo Campanha',
            'Companheiros Leões Presentes', 'Horas trabalhadas por pessoa', 'Horas Totais Trabalhadas',
            'Descrição Campanha', 'Eixo D8', 'Eixo DM', 'Foto Oficial',
            'Video Campanha', 'Outras Fotos', 'Texto HTML', 'ID Único',
            'Comentário Distrital', 'Marcado como Corrigido', 'Quem Corrigiu'
          ];

          if (lastColumn < 33) {
            console.log(`🔧 Expandindo colunas para campanhas de ${clube} (${lastColumn} -> 33)`);
            // Expandir colunas faltantes
            sheet.getRange(1, 1, 1, cabecalhoCompleto.length).setValues([cabecalhoCompleto]);
            campanhasCorrigidas++;
            detalhes.push(`✅ ${clube}: Expandido de ${lastColumn} para 33 colunas`);
          } else if (lastColumn >= 33) {
            // Verificar se cabeçalhos estão corretos
            let precisaCorrigir = false;
            for (let i = 0; i < cabecalhoCompleto.length; i++) {
              if (cabecalhoAtual[i] !== cabecalhoCompleto[i]) {
                precisaCorrigir = true;
                break;
              }
            }

            if (precisaCorrigir) {
              console.log(`🔧 Corrigindo cabeçalhos para campanhas de ${clube}`);
              sheet.getRange(1, 1, 1, cabecalhoCompleto.length).setValues([cabecalhoCompleto]);
              campanhasCorrigidas++;
              detalhes.push(`✅ ${clube}: Cabeçalhos corrigidos`);
            } else {
              console.log(`✅ Campanhas de ${clube} já estão corretas`);
              detalhes.push(`ℹ️ ${clube}: Estrutura já correta`);
            }

            // LIMPAR COLUNAS EXTRAS (AH, AI, AJ, AK, AL, AM, etc.)
            if (lastColumn > 33) {
              console.log(`🧹 Removendo ${lastColumn - 33} colunas extras de ${clube} (colunas AH em diante)`);

              // Limpar dados das colunas extras
              const ultimaLinha = sheet.getLastRow();
              if (ultimaLinha > 0) {
                sheet.getRange(1, 34, ultimaLinha, lastColumn - 33).clearContent();
                sheet.deleteColumns(34, lastColumn - 33);
              }

              detalhes.push(`🧹 ${clube}: Removidas ${lastColumn - 33} colunas extras`);
              campanhasCorrigidas++;
            }
          }
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao corrigir campanhas de ${clube}: ${error.message}`);
    }

    // Corrigir estrutura de atividades
    try {
      const atividadesPlanilhaId = PLANILHAS_ATIVIDADES[clube];
      if (atividadesPlanilhaId) {
        const ss = SpreadsheetApp.openById(atividadesPlanilhaId);
        let sheet = ss.getSheetByName(ABA_ATIVIDADES);

        if (!sheet) {
          console.log(`📝 Criando aba de atividades para ${clube}`);
          sheet = criarAbaAtividades(ss);
          atividadesCorrigidas++;
        } else {
          const lastColumn = sheet.getLastColumn();
          if (lastColumn < 27) {
            console.log(`🔧 Adicionando colunas faltantes para atividades de ${clube} (${lastColumn} -> 27)`);

            const cabecalhoCompleto = [
              'Carimbo Hora', 'Clube', 'AL', 'Trimestre', 'Título da Atividade',
              'Tipo da Atividade', 'Data inicio da Atividade', 'Hora inicio',
              'Data Fim da atividade', 'Hora Fim', 'Local da Atividade',
              'Associados Presentes', 'Qtd Associados Presentes', 'Pré LEOs presentes',
              'Qtd Pré-LEOs presentes', 'LEO/Leão presentes', 'Qtd LEO/Leão presentes',
              'Amigos LEO e Conselheiros', 'Qtd Amigos e Conselheiros',
              'Outros Lions', 'Descrição da atividade', 'Foto Oficial',
              'Duração total (minutos)', 'Comentário Distrital', 'Marcado como Corrigido', 'Quem Corrigiu', 'ID Único'
            ];

            // Recriar cabeçalho completo
            sheet.getRange(1, 1, 1, cabecalhoCompleto.length).setValues([cabecalhoCompleto]);
            atividadesCorrigidas++;
          }
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao corrigir atividades de ${clube}: ${error.message}`);
    }
  });

  console.log(`\n✅ CORREÇÃO CONCLUÍDA:`);
  console.log(`   - Campanhas corrigidas: ${campanhasCorrigidas}`);
  console.log(`   - Atividades corrigidas: ${atividadesCorrigidas}`);

  return {
    campanhasCorrigidas,
    atividadesCorrigidas,
    totalCorrigido: campanhasCorrigidas + atividadesCorrigidas,
    clubesProcessados: clubes.length,
    detalhes
  };
}

function limparColunasExtras(clubeEspecifico = null) {
  console.log('🧹 LIMPEZA DE COLUNAS EXTRAS DAS PLANILHAS');
  console.log('==========================================');

  const todosClubes = Object.keys(PLANILHAS_CAMPANHAS);
  const clubes = clubeEspecifico ? [clubeEspecifico] : todosClubes;

  if (clubeEspecifico) {
    console.log(`🎯 Limpando apenas: ${clubeEspecifico}`);
  } else {
    console.log(`🌐 Limpando todos os ${clubes.length} clubes`);
  }

  let campanhasLimpas = 0;
  const detalhes = [];

  clubes.forEach((clube, index) => {
    console.log(`\n🧹 Limpando clube ${index + 1}/${clubes.length}: ${clube}`);

    try {
      const campanhasPlanilhaId = PLANILHAS_CAMPANHAS[clube];
      if (campanhasPlanilhaId) {
        const ss = SpreadsheetApp.openById(campanhasPlanilhaId);
        let sheet = ss.getSheetByName(ABA_CAMPANHAS);

        if (sheet) {
          const lastColumn = sheet.getLastColumn();

          if (lastColumn > 33) {
            console.log(`🧹 Removendo ${lastColumn - 33} colunas extras de ${clube} (${lastColumn} -> 33)`);

            // Remover colunas extras (AH em diante)
            const colunasExtras = lastColumn - 33;
            sheet.deleteColumns(34, colunasExtras);

            campanhasLimpas++;
            detalhes.push(`🧹 ${clube}: Removidas ${colunasExtras} colunas extras (AH-${String.fromCharCode(65 + lastColumn - 1)})`);
          } else {
            console.log(`✅ ${clube} já tem apenas ${lastColumn} colunas (correto)`);
            detalhes.push(`✅ ${clube}: Estrutura já limpa (${lastColumn} colunas)`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao limpar ${clube}: ${error.message}`);
      detalhes.push(`❌ ${clube}: Erro - ${error.message}`);
    }
  });

  console.log(`\n✅ LIMPEZA CONCLUÍDA:`);
  console.log(`   - Campanhas limpas: ${campanhasLimpas}`);

  return {
    campanhasLimpas,
    clubesProcessados: clubes.length,
    detalhes
  };
}

function migracaoEmergenciaEstruturaCampanhas(clubeEspecifico = null) {
  console.log('🚨 MIGRAÇÃO DE EMERGÊNCIA - CORREÇÃO DE ESTRUTURA DE CAMPANHAS');
  console.log('================================================================');

  const todosClubes = Object.keys(PLANILHAS_CAMPANHAS);
  const clubes = clubeEspecifico ? [clubeEspecifico] : todosClubes;

  if (clubeEspecifico) {
    console.log(`🎯 Migrando apenas: ${clubeEspecifico}`);
  } else {
    console.log(`🌐 Migrando todos os ${clubes.length} clubes`);
  }

  let campanhasMigradas = 0;
  const detalhes = [];
  const backupDados = [];

  clubes.forEach((clube, index) => {
    console.log(`\n🚨 Migrando clube ${index + 1}/${clubes.length}: ${clube}`);

    try {
      const campanhasPlanilhaId = PLANILHAS_CAMPANHAS[clube];
      if (!campanhasPlanilhaId) {
        detalhes.push(`❌ ${clube}: Planilha não mapeada`);
        return;
      }

      const ss = SpreadsheetApp.openById(campanhasPlanilhaId);
      let sheet = ss.getSheetByName(ABA_CAMPANHAS);

      if (!sheet) {
        detalhes.push(`❌ ${clube}: Aba de campanhas não existe`);
        return;
      }

      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();

      if (lastRow <= 1) {
        detalhes.push(`ℹ️ ${clube}: Não há dados para migrar`);
        return;
      }

      console.log(`📊 ${clube}: ${lastRow-1} campanhas, ${lastColumn} colunas`);

      // STEP 1: BACKUP DOS DADOS ATUAIS
      const dadosAtuais = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
      backupDados.push({
        clube,
        dados: dadosAtuais,
        colunas: lastColumn
      });

      // STEP 2: ESTRUTURA CORRETA (36 colunas A-AJ)
      const estruturaCorreta = [
        'Carimbo Data e Hora', 'AL', 'Trimestre', 'Clube', 'Titulo Campanha',                    // A-E
        'Objetivo Campanha', 'Data e Hora início', 'Data e Hora Fim', 'Coordenador(a)',          // F-I
        'Comissão', 'Membros na Comissão', 'Associados Presentes', 'Quantidade Associados Presentes', // J-M
        'Pré LEO`s Presentes', 'Quantidade Pré LEO`s Presentes', 'Amigos LEO e Conselheiros Presentes', // N-P
        'Quantidade Conselheiros e Amigos LEO Presentes', 'Pessoas Impactadas', 'Custo Campanha', // Q-S
        'Companheiros Leões Presentes', 'Horas trabalhadas por pessoa', 'Horas Totais Trabalhadas', // T-V
        'Descrição Campanha', 'Eixo D8', 'Eixo DM', 'Foto Oficial',                              // W-Z
        'Video Campanha', 'Outras Fotos', 'Texto HTML',                                          // AA-AC
        'Tem Parceria', 'Entidade Parceira', 'Tipo Parceria', 'Descrição Parceria',            // AD-AG (29-32): PARCERIA RESTAURADA!
        'ID Único', 'Comentário Distrital', 'Marcado como Corrigido', 'Quem Corrigiu'          // AH-AK (33-36): MOVIDOS!
      ];

      // STEP 3: LIMPAR PLANILHA E RECRIAR CABEÇALHO
      sheet.clear();
      sheet.getRange(1, 1, 1, estruturaCorreta.length).setValues([estruturaCorreta]);

      // STEP 4: MIGRAR DADOS COM ESTRUTURA CORRIGIDA
      if (dadosAtuais.length > 0) {
        const dadosMigrados = dadosAtuais.map((linha, idx) => {
          const linhaMigrada = new Array(estruturaCorreta.length).fill('');

          // Copiar os primeiros 29 campos (A-AC) - estes estavam corretos
          for (let i = 0; i < 29 && i < linha.length; i++) {
            linhaMigrada[i] = linha[i] || '';
          }

          // RECUPERAR DADOS DE PARCERIA se existirem nas posições antigas
          if (linha.length > 29) {
            // Se tinha dados na coluna AD (antiga), pode ser parceria ou ID
            const dadoAD = linha[29] || '';

            // DETECÇÃO INTELIGENTE: Separar IDs de dados de parceria
            if (dadoAD.toString().length === 13 && !isNaN(dadoAD)) {
              // É um ID (timestamp de 13 dígitos) - mover para AH
              linhaMigrada[33] = dadoAD; // AH - ID Único
              linhaMigrada[29] = ''; // AD - Tem Parceria (limpar)
              console.log(`📋 ID ${dadoAD} movido para AH`);
            } else if (dadoAD === 'Sim' || dadoAD === 'Não') {
              // É campo de parceria correto - manter em AD
              linhaMigrada[29] = dadoAD; // AD - Tem Parceria
              console.log(`✅ Parceria "${dadoAD}" mantida em AD`);
            } else if (dadoAD && dadoAD.toString().trim() !== '') {
              // Pode ser nome de instituição que estava incorretamente em AD
              // Tentar determinar se é nome de instituição (mover para AE)
              const dadoStr = dadoAD.toString().trim();
              if (dadoStr.length > 3 && isNaN(dadoStr)) {
                linhaMigrada[30] = dadoStr; // AE - Entidade Parceira (provável instituição)
                linhaMigrada[29] = 'Sim'; // AD - Assumir que tem parceria se tem instituição
                console.log(`🏢 Instituição "${dadoStr}" movida para AE, parceria definida como "Sim"`);
              }
            }

            // Tentar recuperar outros campos de parceria das posições AE, AF, AG
            if (linha.length > 30) linhaMigrada[30] = linha[30] || ''; // AE - Entidade Parceira (índice 30)
            if (linha.length > 31) linhaMigrada[31] = linha[31] || ''; // AF - Tipo Parceria (índice 31)
            if (linha.length > 32) linhaMigrada[32] = linha[32] || ''; // AG - Descrição Parceria (índice 32)
          }

          // Gerar ID único na posição AH (índice 33) APENAS se não tiver nenhum
          if (!linhaMigrada[33] || linhaMigrada[33] === '') {
            const novoId = new Date().getTime().toString() + (idx + 1).toString().padStart(3, '0');
            linhaMigrada[33] = novoId; // AH - ID Único
            console.log(`🆔 Novo ID gerado: ${novoId}`);
          } else {
            console.log(`✅ ID existente preservado: ${linhaMigrada[33]}`);
          }

          return linhaMigrada;
        });

        // Escrever dados migrados
        sheet.getRange(2, 1, dadosMigrados.length, estruturaCorreta.length).setValues(dadosMigrados);

        campanhasMigradas++;
        detalhes.push(`✅ ${clube}: Migrado ${dadosMigrados.length} campanhas para estrutura correta (36 colunas)`);
      }

    } catch (error) {
      console.error(`❌ Erro ao migrar ${clube}: ${error.message}`);
      detalhes.push(`❌ ${clube}: Erro - ${error.message}`);
    }
  });

  console.log(`\n✅ MIGRAÇÃO DE EMERGÊNCIA CONCLUÍDA:`);
  console.log(`   - Campanhas migradas: ${campanhasMigradas}`);

  return {
    campanhasMigradas,
    clubesProcessados: clubes.length,
    detalhes,
    backupDados // Para recuperação se necessário
  };
}

function analisarConflitoColunaParceria(clubeEspecifico = null) {
  console.log('🔍 ANÁLISE DE CONFLITO NA COLUNA DE PARCERIA (AD)');
  console.log('==================================================');

  const todosClubes = Object.keys(PLANILHAS_CAMPANHAS);
  const clubes = clubeEspecifico ? [clubeEspecifico] : todosClubes.slice(0, 3); // Análise em apenas 3 clubes para não sobrecarregar

  const resultados = {
    totalCampanhas: 0,
    idsEncontrados: 0,
    parceriasEncontradas: 0,
    textosSuspeitos: 0,
    detalhes: []
  };

  clubes.forEach((clube, index) => {
    console.log(`\n🔍 Analisando conflito em ${clube}:`);

    try {
      const campanhasPlanilhaId = PLANILHAS_CAMPANHAS[clube];
      if (!campanhasPlanilhaId) {
        resultados.detalhes.push(`❌ ${clube}: Planilha não mapeada`);
        return;
      }

      const ss = SpreadsheetApp.openById(campanhasPlanilhaId);
      const sheet = ss.getSheetByName(ABA_CAMPANHAS);

      if (!sheet) {
        resultados.detalhes.push(`❌ ${clube}: Aba não existe`);
        return;
      }

      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        resultados.detalhes.push(`ℹ️ ${clube}: Sem dados`);
        return;
      }

      // Analisar apenas a coluna AD (índice 30, coluna 30)
      const dadosAD = sheet.getRange(2, 30, lastRow - 1, 1).getValues();

      let idsNoClube = 0;
      let parceriasNoClube = 0;
      let textosNoClube = 0;
      const amostras = [];

      dadosAD.forEach((linha, idx) => {
        const valor = linha[0];
        if (!valor || valor.toString().trim() === '') return;

        const valorStr = valor.toString().trim();
        const linha_num = idx + 2;

        if (valorStr.length === 13 && !isNaN(valorStr)) {
          // É um ID
          idsNoClube++;
          amostras.push(`   🆔 Linha ${linha_num}: ID = ${valorStr}`);
        } else if (valorStr === 'Sim' || valorStr === 'Não') {
          // É parceria correta
          parceriasNoClube++;
          amostras.push(`   ✅ Linha ${linha_num}: Parceria = ${valorStr}`);
        } else {
          // É texto suspeito (pode ser nome de instituição)
          textosNoClube++;
          amostras.push(`   🏢 Linha ${linha_num}: Texto = "${valorStr}"`);
        }
      });

      resultados.totalCampanhas += lastRow - 1;
      resultados.idsEncontrados += idsNoClube;
      resultados.parceriasEncontradas += parceriasNoClube;
      resultados.textosSuspeitos += textosNoClube;

      console.log(`📊 ${clube}: ${idsNoClube} IDs, ${parceriasNoClube} parcerias, ${textosNoClube} textos`);

      resultados.detalhes.push(`📊 ${clube}: ${lastRow-1} campanhas`);
      resultados.detalhes.push(`   🆔 IDs encontrados: ${idsNoClube}`);
      resultados.detalhes.push(`   ✅ Parcerias corretas: ${parceriasNoClube}`);
      resultados.detalhes.push(`   🏢 Textos suspeitos: ${textosNoClube}`);

      // Mostrar algumas amostras (máximo 5)
      if (amostras.length > 0) {
        resultados.detalhes.push(`   📋 Amostras dos dados:`);
        amostras.slice(0, 5).forEach(amostra => {
          resultados.detalhes.push(amostra);
        });
        if (amostras.length > 5) {
          resultados.detalhes.push(`   ... e mais ${amostras.length - 5} itens`);
        }
      }

    } catch (error) {
      console.error(`❌ Erro ao analisar ${clube}: ${error.message}`);
      resultados.detalhes.push(`❌ ${clube}: Erro - ${error.message}`);
    }
  });

  console.log(`\n📋 RESUMO DO CONFLITO:`);
  console.log(`   Total de campanhas analisadas: ${resultados.totalCampanhas}`);
  console.log(`   🆔 IDs misturados na coluna AD: ${resultados.idsEncontrados}`);
  console.log(`   ✅ Parcerias corretas na coluna AD: ${resultados.parceriasEncontradas}`);
  console.log(`   🏢 Textos suspeitos na coluna AD: ${resultados.textosSuspeitos}`);

  if (resultados.idsEncontrados > 0) {
    console.log(`\n🚨 CONFIRMADO: Há ${resultados.idsEncontrados} IDs misturados que precisam ser movidos!`);
  }

  return resultados;
}

function corrigirEstruturaCampanhasCompleta(clubeEspecifico = null) {
  console.log('🚀 CORREÇÃO COMPLETA DE ESTRUTURA DE CAMPANHAS');
  console.log('==============================================');

  const todosClubes = Object.keys(PLANILHAS_CAMPANHAS);
  const clubes = clubeEspecifico ? [clubeEspecifico] : todosClubes;

  if (clubeEspecifico) {
    console.log(`🎯 Corrigindo apenas: ${clubeEspecifico}`);
  } else {
    console.log(`🌐 Corrigindo todos os ${clubes.length} clubes`);
  }

  let clubesCorrigidos = 0;
  let campanhasProcessadas = 0;
  const detalhes = [];

  // ESTRUTURA FINAL CORRETA (37 colunas A-AK)
  const estruturaCorreta = [
    'Carimbo Data e Hora', 'AL', 'Trimestre', 'Clube', 'Titulo Campanha',                    // A-E
    'Objetivo Campanha', 'Data e Hora início', 'Data e Hora Fim', 'Coordenador(a)',          // F-I
    'Comissão', 'Membros na Comissão', 'Associados Presentes', 'Quantidade Associados Presentes', // J-M
    'Pré LEO`s Presentes', 'Quantidade Pré LEO`s Presentes', 'Amigos LEO e Conselheiros Presentes', // N-P
    'Quantidade Conselheiros e Amigos LEO Presentes', 'Pessoas Impactadas', 'Custo Campanha', // Q-S
    'Companheiros Leões Presentes', 'Horas trabalhadas por pessoa', 'Horas Totais Trabalhadas', // T-V
    'Descrição Campanha', 'Eixo D8', 'Eixo DM', 'Foto Oficial',                              // W-Z
    'Video Campanha', 'Outras Fotos', 'Texto HTML',                                          // AA-AC
    'Tem Parceria', 'Entidade Parceira', 'Tipo Parceria', 'Descrição Parceria',            // AD-AG: PARCERIA
    'ID Único', 'Comentário Distrital', 'Marcado como Corrigido', 'Quem Corrigiu'          // AH-AK: SISTEMA
  ];

  clubes.forEach((clube, index) => {
    console.log(`\n🔧 Processando clube ${index + 1}/${clubes.length}: ${clube}`);

    try {
      const campanhasPlanilhaId = PLANILHAS_CAMPANHAS[clube];
      if (!campanhasPlanilhaId) {
        detalhes.push(`❌ ${clube}: Planilha não mapeada`);
        return;
      }

      const ss = SpreadsheetApp.openById(campanhasPlanilhaId);
      let sheet = ss.getSheetByName(ABA_CAMPANHAS);

      if (!sheet) {
        // Criar nova aba com estrutura correta
        console.log(`📝 Criando aba de campanhas para ${clube}`);
        sheet = ss.insertSheet(ABA_CAMPANHAS);
        sheet.getRange(1, 1, 1, estruturaCorreta.length).setValues([estruturaCorreta]);
        clubesCorrigidos++;
        detalhes.push(`✅ ${clube}: Aba criada com estrutura correta (37 colunas)`);
        return;
      }

      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();

      console.log(`📊 ${clube}: ${lastRow - 1} campanhas, ${lastColumn} colunas`);

      // STEP 1: Backup dos dados existentes
      let dadosAtuais = [];
      if (lastRow > 1) {
        dadosAtuais = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
        campanhasProcessadas += dadosAtuais.length;
      }

      // STEP 2: Recriar estrutura completa
      sheet.clear();
      sheet.getRange(1, 1, 1, estruturaCorreta.length).setValues([estruturaCorreta]);

      // STEP 3: Migrar dados com separação inteligente
      if (dadosAtuais.length > 0) {
        const dadosMigrados = dadosAtuais.map((linha, idx) => {
          const linhaMigrada = new Array(estruturaCorreta.length).fill('');

          // Copiar os primeiros 29 campos (A-AC) - estrutura base
          for (let i = 0; i < 29 && i < linha.length; i++) {
            linhaMigrada[i] = linha[i] || '';
          }

          // SEPARAÇÃO INTELIGENTE DE DADOS MISTURADOS
          if (linha.length > 29) {
            const dadoAD = linha[29] || '';

            // Detectar e separar IDs de dados de parceria
            if (dadoAD.toString().length === 13 && !isNaN(dadoAD)) {
              // É um ID - mover para AH (índice 33)
              linhaMigrada[33] = dadoAD; // AH - ID Único
              linhaMigrada[29] = ''; // AD - Tem Parceria (limpar)
            } else if (dadoAD === 'Sim' || dadoAD === 'Não') {
              // É campo de parceria correto - manter em AD
              linhaMigrada[29] = dadoAD; // AD - Tem Parceria
            } else if (dadoAD && dadoAD.toString().trim() !== '') {
              // Pode ser nome de instituição - mover para AE
              const dadoStr = dadoAD.toString().trim();
              if (dadoStr.length > 3 && isNaN(dadoStr)) {
                linhaMigrada[30] = dadoStr; // AE - Entidade Parceira
                linhaMigrada[29] = 'Sim'; // AD - Assumir parceria = Sim
              }
            }

            // Recuperar outros campos de parceria se existirem
            if (linha.length > 30) linhaMigrada[30] = linhaMigrada[30] || linha[30] || ''; // AE - Entidade Parceira
            if (linha.length > 31) linhaMigrada[31] = linha[31] || ''; // AF - Tipo Parceria
            if (linha.length > 32) linhaMigrada[32] = linha[32] || ''; // AG - Descrição Parceria
          }

          // Gerar ID único se não tiver nenhum
          if (!linhaMigrada[33] || linhaMigrada[33] === '') {
            linhaMigrada[33] = new Date().getTime().toString() + (idx + 1).toString().padStart(3, '0');
          }

          return linhaMigrada;
        });

        // Escrever dados migrados
        if (dadosMigrados.length > 0) {
          sheet.getRange(2, 1, dadosMigrados.length, estruturaCorreta.length).setValues(dadosMigrados);
        }
      }

      clubesCorrigidos++;
      detalhes.push(`✅ ${clube}: Estrutura corrigida (${dadosAtuais.length} campanhas processadas)`);

    } catch (error) {
      console.error(`❌ Erro ao corrigir ${clube}: ${error.message}`);
      detalhes.push(`❌ ${clube}: Erro - ${error.message}`);
    }
  });

  console.log(`\n✅ CORREÇÃO COMPLETA CONCLUÍDA:`);
  console.log(`   - Clubes corrigidos: ${clubesCorrigidos}/${clubes.length}`);
  console.log(`   - Campanhas processadas: ${campanhasProcessadas}`);

  return {
    clubesCorrigidos,
    campanhasProcessadas,
    detalhes,
    estruturaFinal: '37 colunas (A-AK): Parceria restaurada, IDs separados'
  };
}

function analisarStatusCampanhas(clubeEspecifico = null) {
  console.log('📊 ANÁLISE DE STATUS DAS CAMPANHAS');
  console.log('==================================');

  const todosClubes = Object.keys(PLANILHAS_CAMPANHAS);
  const clubes = clubeEspecifico ? [clubeEspecifico] : todosClubes.slice(0, 5); // Máximo 5 clubes

  const resultados = {
    clubesAnalisados: 0,
    campanhasTotais: 0,
    estruturasCorretas: 0,
    estruturasIncorretas: 0,
    idsConflitantes: 0,
    detalhes: []
  };

  clubes.forEach(clube => {
    try {
      const campanhasPlanilhaId = PLANILHAS_CAMPANHAS[clube];
      if (!campanhasPlanilhaId) return;

      const ss = SpreadsheetApp.openById(campanhasPlanilhaId);
      const sheet = ss.getSheetByName(ABA_CAMPANHAS);

      if (!sheet) {
        resultados.detalhes.push(`❌ ${clube}: Aba não existe`);
        return;
      }

      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();
      const campanhasClube = lastRow > 1 ? lastRow - 1 : 0;

      resultados.clubesAnalisados++;
      resultados.campanhasTotais += campanhasClube;

      // Verificar estrutura
      if (lastColumn === 37) {
        resultados.estruturasCorretas++;
        resultados.detalhes.push(`✅ ${clube}: Estrutura correta (37 colunas, ${campanhasClube} campanhas)`);
      } else {
        resultados.estruturasIncorretas++;
        resultados.detalhes.push(`❌ ${clube}: Estrutura incorreta (${lastColumn} colunas, ${campanhasClube} campanhas)`);

        // Verificar conflitos na coluna AD se tiver dados
        if (campanhasClube > 0 && lastColumn >= 30) {
          const dadosAD = sheet.getRange(2, 30, campanhasClube, 1).getValues();
          let conflitos = 0;

          dadosAD.forEach(linha => {
            const valor = linha[0];
            if (valor && valor.toString().length === 13 && !isNaN(valor)) {
              conflitos++;
            }
          });

          if (conflitos > 0) {
            resultados.idsConflitantes += conflitos;
            resultados.detalhes.push(`   🚨 ${conflitos} IDs conflitantes encontrados na coluna AD`);
          }
        }
      }

    } catch (error) {
      resultados.detalhes.push(`❌ ${clube}: Erro - ${error.message}`);
    }
  });

  return resultados;
}

function limparIdsAntigos_EntidadeParceira(clubeEspecifico = null) {
  console.log('🧹 LIMPEZA DE IDs ANTIGOS NA COLUNA ENTIDADE PARCEIRA (AE)');
  console.log('===========================================================');

  const todosClubes = Object.keys(PLANILHAS_CAMPANHAS);
  const clubes = clubeEspecifico ? [clubeEspecifico] : todosClubes;

  if (clubeEspecifico) {
    console.log(`🎯 Limpando apenas: ${clubeEspecifico}`);
  } else {
    console.log(`🌐 Limpando todos os ${clubes.length} clubes`);
  }

  let campanhasLimpas = 0;
  let idsAntigos_removidos = 0;
  const detalhes = [];

  clubes.forEach((clube, index) => {
    console.log(`\n🧹 Processando clube ${index + 1}/${clubes.length}: ${clube}`);

    try {
      const campanhasPlanilhaId = PLANILHAS_CAMPANHAS[clube];
      if (!campanhasPlanilhaId) {
        detalhes.push(`❌ ${clube}: Planilha não mapeada`);
        return;
      }

      const ss = SpreadsheetApp.openById(campanhasPlanilhaId);
      let sheet = ss.getSheetByName(ABA_CAMPANHAS);

      if (!sheet) {
        detalhes.push(`❌ ${clube}: Aba não existe`);
        return;
      }

      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        detalhes.push(`ℹ️ ${clube}: Sem campanhas para processar`);
        return;
      }

      // Ler colunas AE (Entidade Parceira) e AH (ID Único)
      const dadosAE = sheet.getRange(2, 31, lastRow - 1, 1).getValues(); // Coluna AE (31)
      const dadosAH = sheet.getRange(2, 34, lastRow - 1, 1).getValues(); // Coluna AH (34)

      let idsRemovidosClube = 0;
      const alteracoes = [];

      dadosAE.forEach((linha, idx) => {
        const valorAE = linha[0];
        const valorAH = dadosAH[idx][0];
        const linhaNum = idx + 2;

        if (valorAE && valorAE.toString().trim() !== '') {
          const valorStr = valorAE.toString().trim();

          // DETECTAR PADRÃO DE ID ANTIGO: 13_digito_letra (ex: 1234567890123_4_A)
          const isIdAntigo = (
            valorStr.includes('_') &&
            valorStr.length > 10 &&
            /^\d{13,}_\d+_[A-Z]?$/i.test(valorStr)
          ) || (
            // OU apenas 13+ dígitos seguidos
            valorStr.length >= 13 &&
            !isNaN(valorStr) &&
            !valorStr.includes('@') &&
            !valorStr.includes('.')
          );

          if (isIdAntigo) {
            console.log(`🆔 ID antigo encontrado na AE - Linha ${linhaNum}: ${valorStr}`);

            // Verificar se já tem ID novo na coluna AH
            if (valorAH && valorAH.toString().trim() !== '') {
              // Já tem ID novo, pode limpar o antigo
              alteracoes.push({
                linha: linhaNum,
                colunaAE: 31, // AE
                valorAntigo: valorStr,
                valorNovo: '', // Limpar
                acao: 'LIMPAR_ID_ANTIGO'
              });
              idsRemovidosClube++;
            } else {
              // Não tem ID novo, mover o antigo para AH e limpar AE
              alteracoes.push({
                linha: linhaNum,
                colunaAE: 31, // AE - limpar
                colunaAH: 34, // AH - mover para cá
                valorAntigo: valorStr,
                valorNovo: '', // AE fica vazia
                idParaAH: valorStr, // Move para AH
                acao: 'MOVER_ID_ANTIGO'
              });
              idsRemovidosClube++;
            }
          }
        }
      });

      // Aplicar alterações
      if (alteracoes.length > 0) {
        alteracoes.forEach(alt => {
          if (alt.acao === 'LIMPAR_ID_ANTIGO') {
            // Limpar apenas a coluna AE
            sheet.getRange(alt.linha, alt.colunaAE).setValue('');
            console.log(`   🧹 Linha ${alt.linha}: ID antigo removido de AE`);
          } else if (alt.acao === 'MOVER_ID_ANTIGO') {
            // Mover ID antigo para AH e limpar AE
            sheet.getRange(alt.linha, alt.colunaAH).setValue(alt.idParaAH);
            sheet.getRange(alt.linha, alt.colunaAE).setValue('');
            console.log(`   🔄 Linha ${alt.linha}: ID antigo movido de AE para AH`);
          }
        });

        campanhasLimpas++;
        idsAntigos_removidos += idsRemovidosClube;
        detalhes.push(`✅ ${clube}: ${idsRemovidosClube} IDs antigos limpos/movidos`);
      } else {
        detalhes.push(`✅ ${clube}: Nenhum ID antigo encontrado na coluna AE`);
      }

    } catch (error) {
      console.error(`❌ Erro ao processar ${clube}: ${error.message}`);
      detalhes.push(`❌ ${clube}: Erro - ${error.message}`);
    }
  });

  console.log(`\n✅ LIMPEZA DE IDs ANTIGOS CONCLUÍDA:`);
  console.log(`   - Clubes processados: ${campanhasLimpas}/${clubes.length}`);
  console.log(`   - IDs antigos removidos: ${idsAntigos_removidos}`);

  return {
    clubesProcessados: campanhasLimpas,
    idsAntigos_removidos,
    detalhes
  };
}

function analisarEstruturasAtuais(nomeClube = null) {
  console.log('🔍 ANÁLISE DE ESTRUTURAS ATUAIS DAS PLANILHAS');
  if (nomeClube) {
    console.log(`📋 Analisando apenas: ${nomeClube}`);
  } else {
    console.log('📋 Analisando todos os clubes');
  }
  console.log('============================================');

  const resultados = {
    campanhas: {},
    atividades: {},
    resumo: {
      totalClubes: 0,
      estruturaFormulario: 0,
      estruturaSistema: 0,
      estruturaMista: 0,
      problemas: []
    }
  };

  const todosOsClubes = Object.keys(PLANILHAS_ATIVIDADES);
  const clubes = nomeClube ? [nomeClube] : todosOsClubes;
  resultados.resumo.totalClubes = clubes.length;

  // Identificadores de estrutura de formulário para ATIVIDADES
  const colunasFormularioAtividades = [
    'Carimbo de data/hora',
    'Clube',
    'AL',
    'Trimestre',
    'Título da Atividade',
    'Tipo da Atividade',
    'Data da Atividade',
    'Local da Atividade',
    'Número de Associados Participantes',
    'Número de Pré LEO\'s Participantes',
    'Duração atividade',
    'Resumo da Atividade',
    'Foto Oficial',
    'Endereço de e-mail'
  ];

  // Identificadores de estrutura de formulário para CAMPANHAS
  const colunasFormularioCampanhas = [
    'Carimbo Data e Hora',
    'AL',
    'Trimestre',
    'Clube',
    'Titulo Campanha',
    'Objetivo Campanha',
    'Data e Hora início',
    'Data e Hora Fim',
    'Coordenador(a)',
    'Comissão',
    'Membros na Comissão',
    'Associados Presentes',
    'Quantidade Associados Presentes',
    'Pré LEO`s Presentes',
    'Quantidade Pré LEO`s Presentes',
    'Amigos LEO e Conselheiros Presentes',
    'Quantidade Conselheiros e Amigos LEO Presentes',
    'Pessoas Impactadas',
    'Custo Campanha',
    'Companheiros Leões Presentes',
    'Horas trabalhadas por pessoa',
    'Horas Totais Trabalhadas',
    'Descrição Campanha',
    'Eixo D8',
    'Eixo DM',
    'Foto Oficial',
    'Video Campanha',
    'Outras Fotos',
    'Texto HTML'
  ];

  // Estrutura esperada pelo sistema para ATIVIDADES
  const colunasSistemaAtividades = [
    'Carimbo Hora',
    'Clube',
    'AL',
    'Trimestre',
    'Título da Atividade',
    'Tipo da Atividade',
    'Data inicio da Atividade',
    'Hora inicio',
    'Data Fim da atividade',
    'Hora Fim',
    'Local da Atividade',
    'Associados Presentes',
    'Qtd Associados Presentes',
    'Pré LEOs presentes',
    'Qtd Pré-LEOs presentes',
    'LEO/Leão presentes',
    'Qtd LEO/Leão presentes',
    'Amigos LEO e Conselheiros',
    'Qtd Amigos e Conselheiros',
    'Outros Lions',
    'Descrição da atividade',
    'Foto Oficial',
    'Duração total (minutos)',
    'Comentário Distrital',
    'Marcado como Corrigido',
    'Quem Corrigiu',
    'ID Único'
  ];

  // Estrutura esperada pelo sistema para CAMPANHAS
  const colunasSistemaCampanhas = [
    'Carimbo Data e Hora', 'AL', 'Trimestre', 'Clube', 'Titulo Campanha',
    'Objetivo Campanha', 'Data e Hora início', 'Data e Hora Fim', 'Coordenador(a)',
    'Comissão', 'Membros na Comissão', 'Associados Presentes', 'Quantidade Associados Presentes',
    'Pré LEO`s Presentes', 'Quantidade Pré LEO`s Presentes', 'Amigos LEO e Conselheiros Presentes',
    'Quantidade Conselheiros e Amigos LEO Presentes', 'Pessoas Impactadas', 'Custo Campanha',
    'Companheiros Leões Presentes', 'Horas trabalhadas por pessoa', 'Horas Totais Trabalhadas',
    'Descrição Campanha', 'Eixo D8', 'Eixo DM', 'Foto Oficial',
    'Video Campanha', 'Outras Fotos', 'Texto HTML', 'ID Único',
    'Comentário Distrital', 'Marcado como Corrigido', 'Quem Corrigiu'
  ];

  clubes.forEach((clube, index) => {
    console.log(`\n📋 Analisando estrutura de ${clube} (${index + 1}/${clubes.length})`);

    // Analisar CAMPANHAS
    try {
      const campanhasPlanilhaId = PLANILHAS_CAMPANHAS[clube];
      if (campanhasPlanilhaId) {
        const ss = SpreadsheetApp.openById(campanhasPlanilhaId);
        let sheet = ss.getSheetByName(ABA_CAMPANHAS);

        if (!sheet) {
          console.log(`⚠️ Aba de campanhas não existe para ${clube}`);
          resultados.campanhas[clube] = {
            existe: false,
            tipo: 'inexistente',
            colunas: 0,
            estrutura: 'inexistente'
          };
        } else {
          const lastColumn = sheet.getLastColumn();
          const lastRow = sheet.getLastRow();

          if (lastRow === 0) {
            resultados.campanhas[clube] = {
              existe: true,
              tipo: 'vazia',
              colunas: 0,
              estrutura: 'vazia'
            };
          } else {
            const cabecalhoAtual = lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];

            // Verificar tipo de estrutura para campanhas
            let tipoEstrutura = 'desconhecida';
            let pontuacaoFormulario = 0;
            let pontuacaoSistema = 0;

            // Verificar compatibilidade com formulário de campanhas
            colunasFormularioCampanhas.forEach(coluna => {
              if (cabecalhoAtual.some(header =>
                header && header.toString().toLowerCase().includes(coluna.toLowerCase()) ||
                header && coluna.toLowerCase().includes(header.toString().toLowerCase())
              )) {
                pontuacaoFormulario++;
              }
            });

            // Verificar compatibilidade com sistema de campanhas
            colunasSistemaCampanhas.forEach(coluna => {
              if (cabecalhoAtual.includes(coluna)) {
                pontuacaoSistema++;
              }
            });

            // Determinar tipo de estrutura (ajustado para 33 colunas)
            if (pontuacaoFormulario >= 15) {
              tipoEstrutura = 'formulario';
              resultados.resumo.estruturaFormulario++;
            } else if (pontuacaoSistema >= 20) {
              tipoEstrutura = 'sistema';
              resultados.resumo.estruturaSistema++;
            } else if (pontuacaoFormulario > 5 && pontuacaoSistema > 5) {
              tipoEstrutura = 'mista';
              resultados.resumo.estruturaMista++;
            }

            resultados.campanhas[clube] = {
              existe: true,
              tipo: tipoEstrutura,
              colunas: lastColumn,
              linhas: lastRow,
              estrutura: tipoEstrutura,
              pontuacaoFormulario,
              pontuacaoSistema,
              cabecalho: cabecalhoAtual.slice(0, 10),
              precisaMigracao: tipoEstrutura === 'formulario'
            };

            console.log(`   📊 Campanhas ${clube}: ${tipoEstrutura} (${lastColumn} colunas, ${lastRow-1} registros)`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao analisar campanhas de ${clube}: ${error.message}`);
      resultados.campanhas[clube] = {
        existe: false,
        tipo: 'erro',
        erro: error.message
      };
    }

    // Analisar ATIVIDADES
    try {
      const atividadesPlanilhaId = PLANILHAS_ATIVIDADES[clube];
      if (atividadesPlanilhaId) {
        const ss = SpreadsheetApp.openById(atividadesPlanilhaId);
        let sheet = ss.getSheetByName(ABA_ATIVIDADES);

        if (!sheet) {
          console.log(`⚠️ Aba de atividades não existe para ${clube}`);
          resultados.atividades[clube] = {
            existe: false,
            tipo: 'inexistente',
            colunas: 0,
            estrutura: 'inexistente'
          };
        } else {
          const lastColumn = sheet.getLastColumn();
          const lastRow = sheet.getLastRow();

          if (lastRow === 0) {
            resultados.atividades[clube] = {
              existe: true,
              tipo: 'vazia',
              colunas: 0,
              estrutura: 'vazia'
            };
          } else {
            const cabecalhoAtual = lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];

            // Verificar tipo de estrutura para atividades
            let tipoEstrutura = 'desconhecida';
            let pontuacaoFormulario = 0;
            let pontuacaoSistema = 0;

            // Verificar compatibilidade com formulário de atividades
            colunasFormularioAtividades.forEach(coluna => {
              if (cabecalhoAtual.some(header =>
                header && header.toString().toLowerCase().includes(coluna.toLowerCase()) ||
                header && coluna.toLowerCase().includes(header.toString().toLowerCase())
              )) {
                pontuacaoFormulario++;
              }
            });

            // Verificar compatibilidade com sistema de atividades
            colunasSistemaAtividades.forEach(coluna => {
              if (cabecalhoAtual.includes(coluna)) {
                pontuacaoSistema++;
              }
            });

            // Determinar tipo de estrutura
            if (pontuacaoFormulario >= 8) {
              tipoEstrutura = 'formulario';
              resultados.resumo.estruturaFormulario++;
            } else if (pontuacaoSistema >= 15) {
              tipoEstrutura = 'sistema';
              resultados.resumo.estruturaSistema++;
            } else if (pontuacaoFormulario > 3 && pontuacaoSistema > 3) {
              tipoEstrutura = 'mista';
              resultados.resumo.estruturaMista++;
            }

            resultados.atividades[clube] = {
              existe: true,
              tipo: tipoEstrutura,
              colunas: lastColumn,
              linhas: lastRow,
              estrutura: tipoEstrutura,
              pontuacaoFormulario,
              pontuacaoSistema,
              cabecalho: cabecalhoAtual.slice(0, 10),
              precisaMigracao: tipoEstrutura === 'formulario'
            };

            console.log(`   📊 Atividades ${clube}: ${tipoEstrutura} (${lastColumn} colunas, ${lastRow-1} registros)`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao analisar atividades de ${clube}: ${error.message}`);
      resultados.atividades[clube] = {
        existe: false,
        tipo: 'erro',
        erro: error.message
      };
    }
  });

  console.log(`\n📊 RESUMO DA ANÁLISE:`);
  console.log(`   - Total de clubes: ${resultados.resumo.totalClubes}`);
  console.log(`   - Estrutura de formulário: ${resultados.resumo.estruturaFormulario}`);
  console.log(`   - Estrutura do sistema: ${resultados.resumo.estruturaSistema}`);
  console.log(`   - Estrutura mista: ${resultados.resumo.estruturaMista}`);

  return resultados;
}

// Função especializada para análise detalhada de um clube específico
function analisarEstruturaCunhaPora() {
  console.log('=== ANÁLISE DETALHADA - ÔMEGA CUNHA PORÃ ===');

  const nomeClube = "Ômega Cunha Porã";
  const planilhaCampanhasId = PLANILHAS_CAMPANHAS[nomeClube];
  const planilhaAtividadesId = PLANILHAS_ATIVIDADES[nomeClube];

  const resultado = {
    campanhas: { colunas: 0, cabecalhos: [], vai_alem_Y: false },
    atividades: { colunas: 0, cabecalhos: [], vai_alem_Y: false }
  };

  try {
    // === CAMPANHAS ===
    console.log('\n📊 CAMPANHAS:');
    if (planilhaCampanhasId) {
      const ss = SpreadsheetApp.openById(planilhaCampanhasId);
      const sheet = ss.getSheetByName(ABA_CAMPANHAS);

      if (sheet) {
        resultado.campanhas.colunas = sheet.getLastColumn();
        resultado.campanhas.vai_alem_Y = resultado.campanhas.colunas > 25;

        console.log(`   Total de colunas: ${resultado.campanhas.colunas}`);

        if (resultado.campanhas.colunas > 0) {
          resultado.campanhas.cabecalhos = sheet.getRange(1, 1, 1, resultado.campanhas.colunas).getValues()[0];

          console.log('   Cabeçalhos:');
          resultado.campanhas.cabecalhos.forEach((header, index) => {
            const letra = index < 26 ? String.fromCharCode(65 + index) : `A${String.fromCharCode(65 + (index - 26))}`;
            console.log(`     ${letra}: "${header}"`);
          });

          if (resultado.campanhas.vai_alem_Y) {
            console.log(`   ⚠️ ATENÇÃO: Vai além da coluna Y (${resultado.campanhas.colunas} colunas)!`);
          }
        }
      } else {
        console.log('   ❌ Aba "Minhas Campanhas" não encontrada');
      }
    }

    // === ATIVIDADES ===
    console.log('\n📊 ATIVIDADES:');
    if (planilhaAtividadesId) {
      const ss = SpreadsheetApp.openById(planilhaAtividadesId);
      const sheet = ss.getSheetByName(ABA_ATIVIDADES);

      if (sheet) {
        resultado.atividades.colunas = sheet.getLastColumn();
        resultado.atividades.vai_alem_Y = resultado.atividades.colunas > 25;

        console.log(`   Total de colunas: ${resultado.atividades.colunas}`);

        if (resultado.atividades.colunas > 0) {
          resultado.atividades.cabecalhos = sheet.getRange(1, 1, 1, resultado.atividades.colunas).getValues()[0];

          console.log('   Cabeçalhos:');
          resultado.atividades.cabecalhos.forEach((header, index) => {
            const letra = index < 26 ? String.fromCharCode(65 + index) : `A${String.fromCharCode(65 + (index - 26))}`;
            console.log(`     ${letra}: "${header}"`);
          });

          if (resultado.atividades.vai_alem_Y) {
            console.log(`   ⚠️ ATENÇÃO: Vai além da coluna Y (${resultado.atividades.colunas} colunas)!`);
          }
        }
      } else {
        console.log('   ❌ Aba "Minhas Atividades" não encontrada');
      }
    }

    // === RESUMO ===
    console.log('\n📋 RESUMO:');
    console.log(`   Campanhas: ${resultado.campanhas.colunas} colunas`);
    console.log(`   Atividades: ${resultado.atividades.colunas} colunas`);

    const maxColunas = Math.max(resultado.campanhas.colunas, resultado.atividades.colunas);
    if (maxColunas > 25) {
      const ultimaColuna = maxColunas < 26 ? String.fromCharCode(64 + maxColunas) : `A${String.fromCharCode(65 + (maxColunas - 26))}`;
      console.log(`   🚨 SISTEMA VAI ALÉM DE A-Y! Máximo: ${maxColunas} colunas (até coluna ${ultimaColuna})`);
    } else {
      console.log(`   ✅ Sistema dentro do limite A-Y (máximo: ${maxColunas} colunas)`);
    }

    return resultado;

  } catch (error) {
    console.error(`❌ Erro: ${error.message}`);
    return null;
  }
}

function migrarEstruturaFormularioParaSistema(nomeClube = null) {
  console.log('🔄 MIGRAÇÃO DE ESTRUTURA: FORMULÁRIO → SISTEMA');
  console.log('==============================================');

  const clubesParaMigrar = nomeClube ? [nomeClube] : Object.keys(PLANILHAS_ATIVIDADES);
  let clubesMigrados = 0;
  let registrosMigrados = 0;
  let registrosCampanhasMigrados = 0;

  clubesParaMigrar.forEach((clube, index) => {
    console.log(`\n🔄 Migrando ${clube} (${index + 1}/${clubesParaMigrar.length})`);

    try {
      // === MIGRAÇÃO DE ATIVIDADES ===
      const atividadesPlanilhaId = PLANILHAS_ATIVIDADES[clube];
      if (atividadesPlanilhaId) {
        console.log(`📋 Migrando atividades de ${clube}...`);
        const ss = SpreadsheetApp.openById(atividadesPlanilhaId);
        let sheet = ss.getSheetByName(ABA_ATIVIDADES);

        if (sheet) {
          const lastColumn = sheet.getLastColumn();
          const lastRow = sheet.getLastRow();

          if (lastRow > 1) {
            // Ler dados atuais
            const dadosAtuais = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
            const cabecalhoAtual = dadosAtuais[0];

            // Verificar se é estrutura de formulário
            const temCarimbo = cabecalhoAtual.some(col => col.toString().includes('Carimbo de data/hora'));
            const temClube = cabecalhoAtual.some(col => col.toString().includes('Clube'));

            if (temCarimbo && temClube) {
              console.log(`🔧 Migrando ${lastRow - 1} atividades de ${clube}...`);

              // Criar nova estrutura para atividades
              const novoCabecalhoAtividades = [
                'Data de Início', 'Data de Fim', 'Horário de Início', 'Horário de Fim',
                'Responsável da Atividade', 'Título da Atividade', 'Local', 'Cidade',
                'Pré-LEOs presentes', 'Qtd Pré-LEOs presentes', 'LEO/Leão presentes',
                'Qtd LEO/Leão presentes', 'Amigos LEO e Conselheiros', 'Qtd Amigos e Conselheiros',
                'Outros Lions', 'Descrição da atividade', 'Foto Oficial',
                'Duração total (minutos)', 'Comentário Distrital', 'Marcado como Corrigido', 'Quem Corrigiu', 'ID Único'
              ];

              // Criar nova aba para backup
              const dataBackup = new Date().toISOString().slice(0,10);
              const nomeBackup = `${ABA_ATIVIDADES}_backup_${dataBackup}`;

              // Fazer backup da aba original
              const backupSheet = ss.insertSheet(nomeBackup);
              backupSheet.getRange(1, 1, lastRow, lastColumn).setValues(dadosAtuais);

              // Migrar dados
              const novosDados = [novoCabecalhoAtividades];

              for (let linha = 1; linha < lastRow; linha++) {
                const registro = dadosAtuais[linha];
                const novoRegistro = new Array(novoCabecalhoAtividades.length).fill('');

                // Mapear campos conhecidos
                cabecalhoAtual.forEach((colOriginal, indexOriginal) => {
                  const valor = registro[indexOriginal];

                  // Data da Atividade → Data de Início e Data de Fim
                  if (colOriginal.toString().includes('Data da Atividade')) {
                    novoRegistro[0] = valor; // Data de Início
                    novoRegistro[1] = valor; // Data de Fim
                  }
                  // Título da Atividade
                  else if (colOriginal.toString().includes('Título da Atividade')) {
                    novoRegistro[5] = valor; // Título da Atividade
                  }
                  // Local da Atividade → Local
                  else if (colOriginal.toString().includes('Local da Atividade')) {
                    novoRegistro[6] = valor; // Local
                  }
                  // Pré-LEOs
                  else if (colOriginal.toString().includes('Pré LEO')) {
                    novoRegistro[9] = valor; // Qtd Pré-LEOs presentes
                  }
                  // Associados → LEO/Leão
                  else if (colOriginal.toString().includes('Associados Participantes')) {
                    novoRegistro[11] = valor; // Qtd LEO/Leão presentes
                  }
                  // Leões → Amigos e Conselheiros
                  else if (colOriginal.toString().includes('Leões Participantes')) {
                    novoRegistro[13] = valor; // Qtd Amigos e Conselheiros
                  }
                  // Outros Participantes
                  else if (colOriginal.toString().includes('Outros Participantes')) {
                    novoRegistro[14] = valor; // Outros Lions
                  }
                  // Duração (converter de horas para minutos)
                  else if (colOriginal.toString().includes('Duração atividade')) {
                    const duracaoHoras = parseFloat(valor.toString().replace(',', '.')) || 0;
                    novoRegistro[17] = duracaoHoras * 60; // Duração total (minutos)
                  }
                  // Resumo → Descrição
                  else if (colOriginal.toString().includes('Resumo da Atividade')) {
                    novoRegistro[15] = valor; // Descrição da atividade
                  }
                  // Foto Oficial
                  else if (colOriginal.toString().includes('Foto Oficial')) {
                    novoRegistro[16] = valor; // Foto Oficial
                  }
                });

                // Definir valores padrão
                novoRegistro[4] = ''; // Responsável da Atividade
                novoRegistro[7] = ''; // Cidade
                novoRegistro[8] = ''; // Pré-LEOs presentes (nomes)
                novoRegistro[10] = ''; // LEO/Leão presentes (nomes)
                novoRegistro[12] = ''; // Amigos LEO e Conselheiros (nomes)
                novoRegistro[18] = ''; // Comentário Distrital
                novoRegistro[19] = 'Não'; // Marcado como Corrigido
                novoRegistro[20] = ''; // Quem Corrigiu
                novoRegistro[21] = gerarIdUnico(); // ID Único

                novosDados.push(novoRegistro);
                registrosMigrados++;
              }

              // Substituir dados na aba original
              sheet.clear();
              sheet.getRange(1, 1, novosDados.length, novoCabecalhoAtividades.length).setValues(novosDados);

              console.log(`✅ ${clube}: ${registrosMigrados} atividades migradas`);
              console.log(`📁 Backup criado: ${nomeBackup}`);
            }
          }
        }
      }

      // === MIGRAÇÃO DE CAMPANHAS ===
      const campanhasPlanilhaId = PLANILHAS_CAMPANHAS[clube];
      if (campanhasPlanilhaId) {
        console.log(`📢 Migrando campanhas de ${clube}...`);
        const ssCampanhas = SpreadsheetApp.openById(campanhasPlanilhaId);
        let sheetCampanhas = ssCampanhas.getSheetByName(ABA_CAMPANHAS);

        if (sheetCampanhas) {
          const lastColumnCampanhas = sheetCampanhas.getLastColumn();
          const lastRowCampanhas = sheetCampanhas.getLastRow();

          if (lastRowCampanhas > 1) {
            // Ler dados atuais
            const dadosAtuaisCampanhas = sheetCampanhas.getRange(1, 1, lastRowCampanhas, lastColumnCampanhas).getValues();
            const cabecalhoAtualCampanhas = dadosAtuaisCampanhas[0];

            // Verificar se é estrutura de formulário
            const temCarimboCampanhas = cabecalhoAtualCampanhas.some(col => col.toString().includes('Carimbo Data e Hora'));
            const temClubeCampanhas = cabecalhoAtualCampanhas.some(col => col.toString().includes('Clube'));

            if (temCarimboCampanhas && temClubeCampanhas) {
              console.log(`🔧 Migrando ${lastRowCampanhas - 1} campanhas de ${clube}...`);

              // Criar nova estrutura para campanhas (37 colunas)
              const novoCabecalhoCampanhas = [
                'Carimbo Hora', 'AL', 'Trimestre', 'Clube', 'Título da Campanha',
                'Objetivo da Campanha', 'Data Inicio', 'Data Fim', 'Coordenador',
                'Comissão', 'Qtd Comissão', 'Presentes', 'Qtd Presentes',
                'Pré-LEOs', 'Qtd Pré-LEOs', 'Amigos/Conselheiros', 'Qtd Amigos/Conselheiros',
                'Pessoas Impactadas', 'Custo', 'Qtd Leões', 'Horas por Pessoa',
                'Horas Trabalhadas', 'Descrição', 'Eixo', 'Eixo DM',
                'Link Foto Oficial', 'Link Vídeo', 'Link Outras Fotos', 'Descrição HTML',
                'Tem Parceria', 'Entidade Parceira', 'Tipo Parceria', 'Descrição Parceria',
                'Comentário Distrital', 'Marcado como Corrigido', 'Quem Corrigiu', 'ID Único'
              ];

              // Criar nova aba para backup
              const dataBackupCampanhas = new Date().toISOString().slice(0,10);
              const nomeBackupCampanhas = `${ABA_CAMPANHAS}_backup_${dataBackupCampanhas}`;

              // Fazer backup da aba original
              const backupSheetCampanhas = ssCampanhas.insertSheet(nomeBackupCampanhas);
              backupSheetCampanhas.getRange(1, 1, lastRowCampanhas, lastColumnCampanhas).setValues(dadosAtuaisCampanhas);

              // Migrar dados
              const novosDadosCampanhas = [novoCabecalhoCampanhas];

              for (let linha = 1; linha < lastRowCampanhas; linha++) {
                const registro = dadosAtuaisCampanhas[linha];
                const novoRegistro = new Array(novoCabecalhoCampanhas.length).fill('');

                // Mapear campos conhecidos
                cabecalhoAtualCampanhas.forEach((colOriginal, indexOriginal) => {
                  const valor = registro[indexOriginal];

                  // Carimbo Data e Hora → Data de Registro
                  if (colOriginal.toString().includes('Carimbo Data e Hora')) {
                    novoRegistro[0] = valor; // Data de Registro
                  }
                  // AL
                  else if (colOriginal.toString().toLowerCase().includes('al') && !colOriginal.toString().includes('Campanha')) {
                    novoRegistro[1] = valor; // AL
                  }
                  // Trimestre
                  else if (colOriginal.toString().includes('Trimestre')) {
                    novoRegistro[2] = valor; // Trimestre
                  }
                  // Clube
                  else if (colOriginal.toString().includes('Clube')) {
                    novoRegistro[3] = valor; // Clube
                  }
                  // Titulo Campanha
                  else if (colOriginal.toString().includes('Titulo Campanha')) {
                    novoRegistro[4] = valor; // Título da Campanha
                  }
                  // Meta da Campanha
                  else if (colOriginal.toString().includes('Meta da Campanha')) {
                    novoRegistro[5] = valor; // Meta da Campanha
                  }
                  // Tipo de Campanha
                  else if (colOriginal.toString().includes('Tipo de Campanha')) {
                    novoRegistro[6] = valor; // Tipo da Campanha
                  }
                  // Tema Líder
                  else if (colOriginal.toString().includes('Tema Líder')) {
                    novoRegistro[7] = valor; // Tema Líder
                  }
                  // Data de início da campanha
                  else if (colOriginal.toString().includes('Data de início da campanha')) {
                    novoRegistro[8] = valor; // Datas Campanha Início
                  }
                  // Data de fim da campanha
                  else if (colOriginal.toString().includes('Data de fim da campanha')) {
                    novoRegistro[9] = valor; // Datas Campanha Fim
                  }
                  // Local
                  else if (colOriginal.toString().includes('Local')) {
                    novoRegistro[10] = valor; // Local da Campanha
                  }
                  // Cidade
                  else if (colOriginal.toString().includes('Cidade')) {
                    novoRegistro[11] = valor; // Cidade
                  }
                  // Responsável pela campanha
                  else if (colOriginal.toString().includes('Responsável pela campanha')) {
                    novoRegistro[12] = valor; // Responsável da Campanha
                  }
                  // Pré-LEOs participantes da campanha
                  else if (colOriginal.toString().includes('Pré-LEOs participantes da campanha')) {
                    novoRegistro[14] = valor; // Qtd Pré-LEOs presentes
                  }
                  // Associados participantes da campanha
                  else if (colOriginal.toString().includes('Associados participantes da campanha')) {
                    novoRegistro[16] = valor; // Qtd LEO/Leão presentes
                  }
                  // Leões participantes da campanha
                  else if (colOriginal.toString().includes('Leões participantes da campanha')) {
                    novoRegistro[18] = valor; // Qtd Amigos e Conselheiros
                  }
                  // Outros participantes da campanha
                  else if (colOriginal.toString().includes('Outros participantes da campanha')) {
                    novoRegistro[20] = valor; // Qtd Outros Lions
                  }
                  // Valor arrecadado
                  else if (colOriginal.toString().includes('Valor arrecadado')) {
                    novoRegistro[22] = valor; // Valor Arrecadado
                  }
                  // Beneficiário da campanha
                  else if (colOriginal.toString().includes('Beneficiário da campanha')) {
                    novoRegistro[23] = valor; // Beneficiário
                  }
                  // Descrição da campanha
                  else if (colOriginal.toString().includes('Descrição da campanha')) {
                    novoRegistro[24] = valor; // Descrição da campanha
                  }
                  // Foto Oficial
                  else if (colOriginal.toString().includes('Foto Oficial')) {
                    novoRegistro[25] = valor; // Foto Oficial
                  }
                  // Evidências adicionais
                  else if (colOriginal.toString().includes('Evidências adicionais')) {
                    novoRegistro[26] = valor; // Evidências Adicionais
                  }
                });

                // Definir valores padrão
                novoRegistro[13] = ''; // Pré-LEOs presentes (nomes)
                novoRegistro[15] = ''; // LEO/Leão presentes (nomes)
                novoRegistro[17] = ''; // Amigos LEO e Conselheiros (nomes)
                novoRegistro[19] = ''; // Outros Lions (nomes)
                novoRegistro[21] = ''; // Total de Participantes
                novoRegistro[27] = ''; // Anexo 1
                novoRegistro[28] = ''; // Anexo 2
                novoRegistro[29] = ''; // Anexo 3
                novoRegistro[30] = ''; // Duração total (minutos)
                novoRegistro[31] = ''; // Comentário Distrital
                novoRegistro[32] = 'Não'; // Marcado como Corrigido
                novoRegistro[33] = ''; // Quem Corrigiu
                novoRegistro[34] = 'Ativo'; // Status
                novoRegistro[35] = ''; // Observações
                novoRegistro[36] = gerarIdUnico(); // ID Único

                novosDadosCampanhas.push(novoRegistro);
                registrosCampanhasMigrados++;
              }

              // Substituir dados na aba original
              sheetCampanhas.clear();
              sheetCampanhas.getRange(1, 1, novosDadosCampanhas.length, novoCabecalhoCampanhas.length).setValues(novosDadosCampanhas);

              console.log(`✅ ${clube}: ${registrosCampanhasMigrados} campanhas migradas`);
              console.log(`📁 Backup criado: ${nomeBackupCampanhas}`);
            }
          }
        }
      }

      clubesMigrados++;

    } catch (error) {
      console.error(`❌ Erro ao migrar ${clube}: ${error.message}`);
    }
  });

  console.log(`\n🎉 MIGRAÇÃO CONCLUÍDA:`);
  console.log(`   - Clubes migrados: ${clubesMigrados}`);
  console.log(`   - Atividades migradas: ${registrosMigrados}`);
  console.log(`   - Campanhas migradas: ${registrosCampanhasMigrados}`);
  console.log(`   - Total de registros: ${registrosMigrados + registrosCampanhasMigrados}`);

  return {
    clubesMigrados,
    atividadesMigradas: registrosMigrados,
    campanhasMigradas: registrosCampanhasMigrados,
    totalMigrado: registrosMigrados + registrosCampanhasMigrados,
    backupsRealizados: clubesMigrados
  };
}

// === FUNÇÕES DE MIGRAÇÃO DE TESTE ===
async function testarMigracaoClubePiloto() {
  console.log('🧪 TESTE DE MIGRAÇÃO - CLUBE PILOTO');
  console.log('==================================');

  const clubePiloto = "Ômega Cunha Porã";

  console.log(`\n🎯 Testando migração para: ${clubePiloto}`);

  try {
    migrarRegistrosExistentes(clubePiloto);

    console.log('\n🔍 Verificando resultados...');

    // Verificar campanhas
    const campanhas = await getCampanhasDoClube(clubePiloto);
    console.log(`📋 Campanhas encontradas: ${campanhas.length}`);

    if (campanhas.length > 0) {
      console.log(`   - Primeira campanha ID: ${campanhas[0].id}`);
      console.log(`   - Última campanha ID: ${campanhas[campanhas.length - 1].id}`);
    }

    // Verificar atividades
    const atividades = await getAtividadesDoClube(clubePiloto);
    console.log(`📅 Atividades encontradas: ${atividades.length}`);

    if (atividades.length > 0) {
      console.log(`   - Primeira atividade ID: ${atividades[0].id}`);
      console.log(`   - Última atividade ID: ${atividades[atividades.length - 1].id}`);
    }

    console.log('\n✅ Teste de migração concluído com sucesso!');

  } catch (error) {
    console.error(`❌ Erro no teste de migração: ${error.message}`);
  }
}

// === FUNÇÃO PARA TESTAR ORDENAÇÃO CRONOLÓGICA ===
async function testarOrdenacaoCronologica() {
  console.log('📅 TESTE DE ORDENAÇÃO CRONOLÓGICA');
  console.log('=================================');

  const clubeTeste = "Ômega Cunha Porã";

  console.log(`\n🎯 Testando ordenação para: ${clubeTeste}`);

  try {
    console.log('\n📋 Verificando campanhas...');
    const campanhas = await getCampanhasDoClube(clubeTeste);

    if (campanhas.length > 0) {
      console.log(`✓ Total de campanhas: ${campanhas.length}`);
      console.log(`\n🗓️  Primeiras 5 campanhas (ordenação por data do evento):`);

      campanhas.slice(0, 5).forEach((campanha, index) => {
        const dataEvento = campanha.dataInicio ? new Date(campanha.dataInicio).toLocaleDateString('pt-BR') : 'Sem data';
        const dataRegistro = campanha.dataRegistro ? new Date(campanha.dataRegistro).toLocaleDateString('pt-BR') : 'Sem data';

        console.log(`   ${index + 1}. ${campanha.titulo}`);
        console.log(`      📅 Data do evento: ${dataEvento}`);
        console.log(`      📝 Data de registro: ${dataRegistro}`);
      });
    } else {
      console.log('⚠️ Nenhuma campanha encontrada');
    }

    console.log('\n📅 Verificando atividades...');
    const atividades = await getAtividadesDoClube(clubeTeste);

    if (atividades.length > 0) {
      console.log(`✓ Total de atividades: ${atividades.length}`);
      console.log(`\n🗓️  Primeiras 5 atividades (ordenação por data do evento):`);

      atividades.slice(0, 5).forEach((atividade, index) => {
        const dataEvento = atividade.dataInicio ? new Date(atividade.dataInicio).toLocaleDateString('pt-BR') : 'Sem data';
        const dataRegistro = atividade.dataRegistro ? new Date(atividade.dataRegistro).toLocaleDateString('pt-BR') : 'Sem data';

        console.log(`   ${index + 1}. ${atividade.titulo}`);
        console.log(`      📅 Data do evento: ${dataEvento}`);
        console.log(`      📝 Data de registro: ${dataRegistro}`);
      });
    } else {
      console.log('⚠️ Nenhuma atividade encontrada');
    }

    console.log('\n✅ Teste de ordenação cronológica concluído!');
    console.log('📌 As atividades e campanhas mais recentes aparecem primeiro.');

  } catch (error) {
    console.error(`❌ Erro no teste de ordenação: ${error.message}`);
  }
}

// === SISTEMA DE BACKUP PARA PRESIDENTE ===
function criarBackupCompleto() {
  console.log('💾 INICIANDO BACKUP COMPLETO DAS PLANILHAS');
  console.log('==========================================');

  try {
    // 1. Criar pasta principal de backup
    const pastaBackupPrincipal = criarPastaBackupPrincipal();

    // 2. Criar subpastas
    const pastaBackupCampanhas = criarSubpastaBackup(pastaBackupPrincipal, 'Campanhas');
    const pastaBackupAtividades = criarSubpastaBackup(pastaBackupPrincipal, 'Atividades');

    console.log(`✅ Pastas de backup criadas:`);
    console.log(`   📁 Principal: ${pastaBackupPrincipal.getName()}`);
    console.log(`   📁 Campanhas: ${pastaBackupCampanhas.getName()}`);
    console.log(`   📁 Atividades: ${pastaBackupAtividades.getName()}`);

    // 3. Fazer backup das planilhas
    const resultadoCampanhas = fazerBackupCampanhas(pastaBackupCampanhas);
    const resultadoAtividades = fazerBackupAtividades(pastaBackupAtividades);

    const relatorio = {
      sucesso: true,
      dataBackup: new Date().toLocaleString('pt-BR'),
      pastaPrincipal: pastaBackupPrincipal.getUrl(),
      campanhas: resultadoCampanhas,
      atividades: resultadoAtividades,
      totalArquivos: resultadoCampanhas.arquivosCriados + resultadoAtividades.arquivosCriados
    };

    console.log(`\n🎉 BACKUP CONCLUÍDO COM SUCESSO!`);
    console.log(`   📊 Total de arquivos: ${relatorio.totalArquivos}`);
    console.log(`   📋 Campanhas: ${resultadoCampanhas.arquivosCriados} planilhas`);
    console.log(`   📅 Atividades: ${resultadoAtividades.arquivosCriados} planilhas`);
    console.log(`   🔗 Pasta: ${relatorio.pastaPrincipal}`);

    return relatorio;

  } catch (error) {
    console.error(`❌ Erro no backup: ${error.message}`);
    return {
      sucesso: false,
      erro: error.message,
      dataBackup: new Date().toLocaleString('pt-BR')
    };
  }
}

function criarPastaBackupPrincipal() {
  const nomePatraPrincipal = `Backup_Campanhas_Atividades_${new Date().toISOString().split('T')[0]}`;

  try {
    // Verificar se já existe uma pasta de backup de hoje
    const pastasExistentes = DriveApp.getFoldersByName(nomePatraPrincipal);

    if (pastasExistentes.hasNext()) {
      console.log(`📁 Usando pasta de backup existente: ${nomePatraPrincipal}`);
      return pastasExistentes.next();
    } else {
      console.log(`📁 Criando nova pasta de backup: ${nomePatraPrincipal}`);
      return DriveApp.createFolder(nomePatraPrincipal);
    }
  } catch (error) {
    throw new Error(`Erro ao criar pasta principal de backup: ${error.message}`);
  }
}

function criarSubpastaBackup(pastaPai, nomeSubpasta) {
  try {
    const subpastasExistentes = pastaPai.getFoldersByName(nomeSubpasta);

    if (subpastasExistentes.hasNext()) {
      console.log(`📂 Usando subpasta existente: ${nomeSubpasta}`);
      return subpastasExistentes.next();
    } else {
      console.log(`📂 Criando subpasta: ${nomeSubpasta}`);
      return pastaPai.createFolder(nomeSubpasta);
    }
  } catch (error) {
    throw new Error(`Erro ao criar subpasta ${nomeSubpasta}: ${error.message}`);
  }
}

function fazerBackupCampanhas(pastaDestino) {
  console.log('\n📋 Iniciando backup das planilhas de campanhas...');

  let arquivosCriados = 0;
  const erros = [];

  Object.entries(PLANILHAS_CAMPANHAS).forEach(([nomeClube, planilhaId]) => {
    try {
      console.log(`   💾 Backup: ${nomeClube}`);

      const planilhaOriginal = SpreadsheetApp.openById(planilhaId);
      const nomeBackup = `Campanhas_${nomeClube}_${new Date().toISOString().split('T')[0]}`;

      // Fazer cópia da planilha
      const backup = planilhaOriginal.copy(nomeBackup);

      // Mover para pasta de backup
      const arquivo = DriveApp.getFileById(backup.getId());
      pastaDestino.addFile(arquivo);
      DriveApp.getRootFolder().removeFile(arquivo);

      arquivosCriados++;
      console.log(`     ✅ Backup criado: ${nomeBackup}`);

    } catch (error) {
      console.error(`     ❌ Erro no backup de ${nomeClube}: ${error.message}`);
      erros.push({clube: nomeClube, erro: error.message});
    }
  });

  return {
    arquivosCriados,
    totalClubes: Object.keys(PLANILHAS_CAMPANHAS).length,
    erros
  };
}

function fazerBackupAtividades(pastaDestino) {
  console.log('\n📅 Iniciando backup das planilhas de atividades...');

  let arquivosCriados = 0;
  const erros = [];

  Object.entries(PLANILHAS_ATIVIDADES).forEach(([nomeClube, planilhaId]) => {
    try {
      console.log(`   💾 Backup: ${nomeClube}`);

      const planilhaOriginal = SpreadsheetApp.openById(planilhaId);
      const nomeBackup = `Atividades_${nomeClube}_${new Date().toISOString().split('T')[0]}`;

      // Fazer cópia da planilha
      const backup = planilhaOriginal.copy(nomeBackup);

      // Mover para pasta de backup
      const arquivo = DriveApp.getFileById(backup.getId());
      pastaDestino.addFile(arquivo);
      DriveApp.getRootFolder().removeFile(arquivo);

      arquivosCriados++;
      console.log(`     ✅ Backup criado: ${nomeBackup}`);

    } catch (error) {
      console.error(`     ❌ Erro no backup de ${nomeClube}: ${error.message}`);
      erros.push({clube: nomeClube, erro: error.message});
    }
  });

  return {
    arquivosCriados,
    totalClubes: Object.keys(PLANILHAS_ATIVIDADES).length,
    erros
  };
}

// === FUNÇÕES DE TESTE E DIAGNÓSTICO ===
async function testarSistemaUnificado() {
  console.log('🔍 TESTE DO SISTEMA UNIFICADO LEO LD-8 COM VISÃO GERENCIAL');
  console.log('================================================================');
  
  const clubeTeste = "Ômega Cunha Porã";
  
  console.log('\n🔐 1. Testando sistema de login...');
  try {
    const ss = SpreadsheetApp.openById(PLANILHA_ACESSO_ID);
    const aba = ss.getSheetByName(ABA_ACESSOS);
    
    if (aba) {
      const dados = aba.getDataRange().getValues();
      console.log(`✓ Sistema de login funcionando com ${dados.length - 1} usuários`);
    } else {
      console.error(`✗ Aba "${ABA_ACESSOS}" não encontrada`);
    }
  } catch (error) {
    console.error(`✗ Erro ao testar login: ${error.message}`);
  }
  
  console.log('\n📊 2. Testando visão gerencial...');
  try {
    const dadosGerenciais = await getDadosGerenciais();
    console.log(`✓ Dados gerenciais carregados:`);
    console.log(`   - ${dadosGerenciais.clubes.length} clubes`);
    console.log(`   - ${dadosGerenciais.campanhas.length} campanhas`);
    console.log(`   - ${dadosGerenciais.atividades.length} atividades`);
  } catch (error) {
    console.error(`✗ Erro ao testar visão gerencial: ${error.message}`);
  }

  console.log('\n📢 3. Testando módulo de campanhas...');
  try {
    const campanhas = await getCampanhasDoClube(clubeTeste);
    console.log(`✓ ${campanhas.length} campanhas encontradas para ${clubeTeste}`);
  } catch (error) {
    console.error(`✗ Erro ao testar campanhas: ${error.message}`);
  }

  console.log('\n📅 4. Testando módulo de atividades...');
  try {
    const atividades = await getAtividadesDoClube(clubeTeste);
    console.log(`✓ ${atividades.length} atividades encontradas para ${clubeTeste}`);
  } catch (error) {
    console.error(`✗ Erro ao testar atividades: ${error.message}`);
  }
  
  console.log('\n👥 5. Testando dados de pessoas...');
  try {
    const associados = await getAssociadosLEO(clubeTeste);
    const preLeos = await getPreLeos(clubeTeste);
    const leoLeao = await getLeoLeao(clubeTeste);
    const amigos = await getAmigosConselheiros(clubeTeste);
    
    console.log(`✓ Associados LEO: ${associados.length}`);
    console.log(`✓ Pré-LEOs: ${preLeos.length}`);
    console.log(`✓ LEO/Leão: ${leoLeao.length}`);
    console.log(`✓ Amigos e Conselheiros: ${amigos.length}`);
  } catch (error) {
    console.error(`✗ Erro ao testar dados de pessoas: ${error.message}`);
  }
  
  console.log('\n🎯 6. Testando eixos de campanhas...');
  try {
    const eixos = await getEixos();
    console.log(`✓ Eixos: ${eixos.eixo.length}, Eixos DM: ${eixos.eixoDM.length}`);
  } catch (error) {
    console.error(`✗ Erro ao testar eixos: ${error.message}`);
  }
  
  console.log('\n📁 7. Testando pastas do Drive...');
  const pastas = {
    'FOTOS_OFICIAIS_CAMPANHAS': FOLDER_FOTOS_OFICIAIS_CAMPANHAS,
    'FOTOS_OFICIAIS_ATIVIDADES': FOLDER_FOTOS_OFICIAIS_ATIVIDADES,
    'VIDEOS': FOLDER_VIDEOS,
    'OUTRAS_FOTOS': FOLDER_OUTRAS_FOTOS
  };
  
  Object.entries(pastas).forEach(([nome, id]) => {
    try {
      const pasta = DriveApp.getFolderById(id);
      console.log(`✓ Pasta ${nome} acessível: ${pasta.getName()}`);
    } catch (error) {
      console.error(`✗ Erro ao acessar pasta ${nome} (${id}): ${error.message}`);
    }
  });
  
  console.log('\n🏛️ 8. Testando mapeamento de clubes...');
  const totalClubes = Object.keys(PLANILHAS_CAMPANHAS).length;
  const totalAtividades = Object.keys(PLANILHAS_ATIVIDADES).length;
  const totalSource = Object.keys(SOURCE_PLANILHAS_CLUBES).length;
  
  console.log(`✓ Clubes mapeados:`);
  console.log(`   - Campanhas: ${totalClubes} clubes`);
  console.log(`   - Atividades: ${totalAtividades} clubes`);
  console.log(`   - Pessoas: ${totalSource} clubes`);
  
  if (totalClubes === totalAtividades && totalAtividades === totalSource) {
    console.log(`✓ Todos os mapeamentos estão consistentes`);
  } else {
    console.warn(`⚠️ Inconsistência nos mapeamentos detectada`);
  }
  
  console.log('\n✅ TESTE CONCLUÍDO!');
  console.log('Sistema LEO LD-8 Unificado com Visão Gerencial pronto para uso.');
  console.log('🎯 Funcionalidades disponíveis:');
  console.log('   - ✅ Login de clubes individuais');
  console.log('   - ✅ Login gerencial do Distrito LEO LD-8');
  console.log('   - ✅ Gestão de campanhas (CRUD completo)');
  console.log('   - ✅ Gestão de atividades (CRUD completo)');
  console.log('   - ✅ Visão consolidada (somente leitura)');
  console.log('   - ✅ Upload de arquivos');
  console.log('   - ✅ Filtros e estatísticas');
}

// === FUNÇÃO DE DIAGNÓSTICO ESPECÍFICA PARA VISÃO GERENCIAL ===
async function testarVisaoGerencial() {
  console.log('🔍 TESTE ESPECÍFICO DA VISÃO GERENCIAL');
  console.log('=====================================');

  try {
    console.log('📊 Iniciando carregamento de dados gerenciais...');
    const inicio = new Date().getTime();

    const dados = await getDadosGerenciais();
    
    const fim = new Date().getTime();
    const tempoDecorrido = (fim - inicio) / 1000;
    
    console.log(`✅ Dados carregados em ${tempoDecorrido.toFixed(2)} segundos`);
    console.log(`📈 Estatísticas:`);
    console.log(`   - Clubes processados: ${dados.clubes.length}`);
    console.log(`   - Total de campanhas: ${dados.campanhas.length}`);
    console.log(`   - Total de atividades: ${dados.atividades.length}`);
    
    // Análise por clube
    const estatisticasPorClube = {};
    
    dados.campanhas.forEach(campanha => {
      if (!estatisticasPorClube[campanha.clube]) {
        estatisticasPorClube[campanha.clube] = { campanhas: 0, atividades: 0 };
      }
      estatisticasPorClube[campanha.clube].campanhas++;
    });
    
    dados.atividades.forEach(atividade => {
      if (!estatisticasPorClube[atividade.clube]) {
        estatisticasPorClube[atividade.clube] = { campanhas: 0, atividades: 0 };
      }
      estatisticasPorClube[atividade.clube].atividades++;
    });
    
    console.log('\n📋 Estatísticas por clube:');
    Object.entries(estatisticasPorClube)
      .sort(([,a], [,b]) => (b.campanhas + b.atividades) - (a.campanhas + a.atividades))
      .slice(0, 5)
      .forEach(([clube, stats]) => {
        console.log(`   ${clube}: ${stats.campanhas} campanhas, ${stats.atividades} atividades`);
      });
    
    // Verificar integridade dos dados
    let campanhasComErro = 0;
    let atividadesComErro = 0;
    
    dados.campanhas.forEach(campanha => {
      if (!campanha.titulo || !campanha.clube) {
        campanhasComErro++;
      }
    });
    
    dados.atividades.forEach(atividade => {
      if (!atividade.titulo || !atividade.clube) {
        atividadesComErro++;
      }
    });
    
    if (campanhasComErro > 0 || atividadesComErro > 0) {
      console.warn(`⚠️ Problemas de integridade detectados:`);
      console.warn(`   - Campanhas com dados faltando: ${campanhasComErro}`);
      console.warn(`   - Atividades com dados faltando: ${atividadesComErro}`);
    } else {
      console.log(`✅ Todos os dados estão íntegros`);
    }
    
    return {
      sucesso: true,
      tempoCarregamento: tempoDecorrido,
      totalClubes: dados.clubes.length,
      totalCampanhas: dados.campanhas.length,
      totalAtividades: dados.atividades.length,
      campanhasComErro: campanhasComErro,
      atividadesComErro: atividadesComErro
    };
    
  } catch (error) {
    console.error('❌ Erro no teste da visão gerencial:', error);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

// === FUNÇÃO PARA CRIAR ACESSO GERENCIAL (APENAS PARA ADMINISTRADORES) ===
function criarAcessoGerencial() {
  try {
    const ss = SpreadsheetApp.openById(PLANILHA_ACESSO_ID);
    const aba = ss.getSheetByName(ABA_ACESSOS);
    
    if (!aba) {
      throw new Error('Aba de acessos não encontrada');
    }
    
    // Verificar se já existe o acesso gerencial
    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0] === "Distrito LEO LD-8") {
        console.log('Acesso gerencial já existe');
        return { sucesso: true, mensagem: 'Acesso gerencial já existe' };
      }
    }
    
    // Criar o acesso gerencial
    const novaLinha = [
      "Distrito LEO LD-8",
      "gerencial@distritold8.org", // Email para acesso gerencial
      "DistritoLD8@2025" // Senha para acesso gerencial
    ];
    
    aba.appendRow(novaLinha);
    
    console.log('✅ Acesso gerencial criado com sucesso');
    console.log('📧 Email: gerencial@distritold8.org');
    
    return { 
      sucesso: true, 
      mensagem: 'Acesso gerencial criado com sucesso',
      email: 'gerencial@distritold8.org'
    };
    
  } catch (error) {
    console.error('❌ Erro ao criar acesso gerencial:', error);
    return { sucesso: false, erro: error.message };
  }
}

// === FUNÇÃO PARA FILTRAR POR REGIÃO ===
function filtrarDadosPorRegiao(dados, regiao) {
  if (!regiao || regiao.trim() === '') {
    return dados;
  }

  // Ler a planilha uma única vez antes de filtrar (evita N+1)
  let mapaRegiaoClube = {};
  try {
    const ss = SpreadsheetApp.openById(PLANILHA_ACESSO_ID);
    const aba = ss.getSheetByName(ABA_ACESSOS);
    if (aba) {
      const dadosAcesso = aba.getDataRange().getValues();
      for (let i = 1; i < dadosAcesso.length; i++) {
        const clubeAcesso = String(dadosAcesso[i][0] || '').trim();
        const regiaoAcesso = String(dadosAcesso[i][3] || '').trim();
        if (clubeAcesso) mapaRegiaoClube[clubeAcesso] = regiaoAcesso;
      }
    }
  } catch (e) {
    console.warn('filtrarDadosPorRegiao: erro ao ler planilha de acessos', e.message);
  }

  return dados.filter(item => {
    const regiaoClube = mapaRegiaoClube[item.clube];
    if (regiaoClube === undefined) return true; // clube não encontrado: não filtra
    return regiaoClube === regiao;
  });
}

// === FUNÇÃO DE ANÁLISE DE ESTRUTURA REAL ===
function analisarEstruturaReal() {
  console.log('🔍 ANÁLISE DE ESTRUTURA REAL DAS PLANILHAS');
  console.log('==========================================');

  const clube = "Ômega Cunha Porã";

  try {
    // Analisar Campanhas
    const campanhasId = PLANILHAS_CAMPANHAS[clube];
    const ssCamp = SpreadsheetApp.openById(campanhasId);
    const sheetCamp = ssCamp.getSheetByName(ABA_CAMPANHAS);

    const colunasCampanhas = sheetCamp.getLastColumn();
    const cabecalhoCampanhas = sheetCamp.getRange(1, 1, 1, colunasCampanhas).getValues()[0];

    console.log(`📢 CAMPANHAS - Total de colunas: ${colunasCampanhas}`);
    console.log(`📢 Vai até coluna: ${String.fromCharCode(64 + colunasCampanhas)}`);
    console.log('📢 Cabeçalhos:', cabecalhoCampanhas);

    // Analisar Atividades
    const atividadesId = PLANILHAS_ATIVIDADES[clube];
    const ssAtiv = SpreadsheetApp.openById(atividadesId);
    const sheetAtiv = ssAtiv.getSheetByName(ABA_ATIVIDADES);

    const colunasAtividades = sheetAtiv.getLastColumn();
    const cabecalhoAtividades = sheetAtiv.getRange(1, 1, 1, colunasAtividades).getValues()[0];

    console.log(`📅 ATIVIDADES - Total de colunas: ${colunasAtividades}`);
    console.log(`📅 Vai até coluna: ${String.fromCharCode(64 + colunasAtividades)}`);
    console.log('📅 Cabeçalhos:', cabecalhoAtividades);

    return {
      campanhas: {
        totalColunas: colunasCampanhas,
        ultimaColuna: String.fromCharCode(64 + colunasCampanhas),
        cabecalhos: cabecalhoCampanhas
      },
      atividades: {
        totalColunas: colunasAtividades,
        ultimaColuna: String.fromCharCode(64 + colunasAtividades),
        cabecalhos: cabecalhoAtividades
      }
    };

  } catch (error) {
    console.error('Erro na análise:', error);
    return { erro: error.message };
  }
}

// === FUNÇÕES GERENCIAIS ===
// Cache em memória (melhora muito o primeiro carregamento em instâncias "quentes")
// Observação: Apps Script pode reaproveitar instâncias por um tempo, então isso ajuda bastante.
var __cacheDadosGerenciaisMem = {}; // { key: { ts:number, data:object } }

async function getDadosGerenciais(regiao, resumoOnly) {
  try {
    // === Supabase (sem planilhas) ===
    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      const key = (regiao ? String(regiao) : '__ALL__') + (resumoOnly ? '_resumo' : '');
      const now = new Date().getTime();
      const ttlMs = 5 * 60 * 1000; // 5 min

      if (__cacheDadosGerenciaisMem[key] && (now - __cacheDadosGerenciaisMem[key].ts) < ttlMs) {
        console.log('getDadosGerenciais(Supabase): cache HIT ' + key);
        return __cacheDadosGerenciaisMem[key].data;
      }

      console.log('getDadosGerenciais: buscando do Supabase...' + (resumoOnly ? ' (resumo)' : ''));
      // resumoOnly: menos colunas = menos payload e mais rápido para o dashboard
      const minimal = !!resumoOnly;
      let todasCampanhas = await portalBuscarTodasCampanhas(true, minimal);
      let todasAtividades = await portalBuscarTodasAtividades(true, minimal);

      if (regiao) {
        console.log('getDadosGerenciais: filtrando regiao ' + regiao);
        todasCampanhas = filtrarDadosPorRegiao(todasCampanhas, regiao);
        todasAtividades = filtrarDadosPorRegiao(todasAtividades, regiao);
      }

      const clubesSet = new Set();
      (todasCampanhas || []).forEach(function(c) { if (c && c.clube) clubesSet.add(c.clube); });
      (todasAtividades || []).forEach(function(a) { if (a && a.clube) clubesSet.add(a.clube); });
      const clubes = Array.from(clubesSet).filter(Boolean).sort();

      const result = { clubes: clubes, campanhas: todasCampanhas, atividades: todasAtividades };
      __cacheDadosGerenciaisMem[key] = { ts: now, data: result };
      console.log('getDadosGerenciais(Supabase): cache atualizado ' + key);
      return result;
    }

    const key = regiao ? String(regiao) : '__ALL__';
    const now = new Date().getTime();
    const ttlMs = 5 * 60 * 1000; // 5 min

    if (__cacheDadosGerenciaisMem[key] && (now - __cacheDadosGerenciaisMem[key].ts) < ttlMs) {
      console.log(`⚡ getDadosGerenciais: cache em memória HIT (${key})`);
      return __cacheDadosGerenciaisMem[key].data;
    }

    console.log('🔍 Iniciando busca de dados gerenciais...');
    
    const clubes = (typeof rtmaConfig.rtmaObterTodosClubes === "function" ? rtmaConfig.rtmaObterTodosClubes() : []).filter(clube => clube !== "DEMONSTRAÇÃO I CDM");
    console.log(`📊 Total de clubes a processar: ${clubes.length}`);
    
    let todasCampanhas = [];
    let todasAtividades = [];
    
    // Processar campanhas de todos os clubes
    for (const [index, clube] of clubes.entries()) {
      try {
        console.log(`📢 Processando campanhas do clube ${index + 1}/${clubes.length}: ${clube}`);
        const campanhasClube = await getCampanhasDoClube(clube);
        if (campanhasClube && campanhasClube.length > 0) {
          todasCampanhas = todasCampanhas.concat(campanhasClube);
          console.log(`✅ ${campanhasClube.length} campanhas encontradas para ${clube}`);
        }
      } catch (error) {
        console.warn(`⚠️ Erro ao buscar campanhas de ${clube}:`, error);
      }
    }
    
    // Processar atividades de todos os clubes
    for (const [index, clube] of clubes.entries()) {
      try {
        console.log(`📅 Processando atividades do clube ${index + 1}/${clubes.length}: ${clube}`);
        const atividadesClube = await getAtividadesDoClube(clube);
        if (atividadesClube && atividadesClube.length > 0) {
          todasAtividades = todasAtividades.concat(atividadesClube);
          console.log(`✅ ${atividadesClube.length} atividades encontradas para ${clube}`);
        }
      } catch (error) {
        console.warn(`⚠️ Erro ao buscar atividades de ${clube}:`, error);
      }
    }
    
    // Aplicar filtro por região se especificado
    if (regiao) {
      console.log(`🌍 Aplicando filtro por região: ${regiao}`);
      todasCampanhas = filtrarDadosPorRegiao(todasCampanhas, regiao);
      todasAtividades = filtrarDadosPorRegiao(todasAtividades, regiao);
      
      // Filtrar clubes únicos baseado nos dados filtrados
      const clubesFiltrados = [...new Set([...todasCampanhas, ...todasAtividades].map(item => item.clube))];
      
      console.log(`🎯 Dados gerenciais filtrados por região ${regiao}:`);
      console.log(`   - Total de clubes: ${clubesFiltrados.length}`);
      console.log(`   - Total de campanhas: ${todasCampanhas.length}`);
      console.log(`   - Total de atividades: ${todasAtividades.length}`);
      
      return {
        clubes: clubesFiltrados,
        campanhas: todasCampanhas,
        atividades: todasAtividades
      };
    }
    
    console.log(`🎯 Dados gerenciais consolidados:`);
    console.log(`   - Total de clubes: ${clubes.length}`);
    console.log(`   - Total de campanhas: ${todasCampanhas.length}`);
    console.log(`   - Total de atividades: ${todasAtividades.length}`);
    
    const result = {
      clubes: clubes,
      campanhas: todasCampanhas,
      atividades: todasAtividades
    };

    __cacheDadosGerenciaisMem[key] = { ts: now, data: result };
    console.log(`✅ getDadosGerenciais: cache em memória atualizado (${key})`);

    return result;
    
  } catch (error) {
    console.error('❌ Erro ao buscar dados gerenciais:', error);
    return {
      clubes: [],
      campanhas: [],
      atividades: []
    };
  }
}

// === FUNÇÕES COMPARTILHADAS ===
function getClubes() {
  return Object.keys(SOURCE_PLANILHAS_CLUBES).sort();
}

async function getAssociadosLEO(clube) {
  // Usar Supabase se disponível
  if (typeof RTMA_USAR_SUPABASE !== 'undefined' && RTMA_USAR_SUPABASE === true && typeof buscarPessoasRTMA === 'function') {
    try {
      const pessoas = await buscarPessoasRTMA(clube, null, null, null);
      return pessoas
        .filter(p => p.status && p.status.toLowerCase() === 'ativo' && 
                     (p.tipo === 'Associado LEO' || p.tipo === 'Associado LEO e LEO/Leão') &&
                     p.nome && p.nome.trim() !== '')
        .map(p => p.nome);
    } catch (error) {
      console.error("Erro ao buscar associados LEO do Supabase:", error);
      // Fallback para planilha
    }
  }

  // Fallback: usar planilha
  const sourceId = SOURCE_PLANILHAS_CLUBES[clube];
  if (!sourceId) return [];

  try {
    const ss = SpreadsheetApp.openById(sourceId);
    const sheet = ss.getSheetByName(ABA_RTM);
    if (!sheet) return [];

    // Buscar dados incluindo a coluna A (status)
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    
    return data.filter(row => {
      const status = String(row[0] || "").trim().toLowerCase();
      const tipo = String(row[1] || "").trim();
      const nome = String(row[3] || "").trim();
      
      // Filtrar apenas ativos
      return status === "ativo" && 
             (tipo === "Associado LEO" || tipo === "Associado LEO e LEO/Leão") &&
             nome !== "";
    }).map(row => row[3]);
      
  } catch (error) {
    console.error("Erro ao buscar associados LEO:", error);
    return [];
  }
}

async function getPreLeos(clube) {
  // Usar Supabase se disponível
  if (typeof RTMA_USAR_SUPABASE !== 'undefined' && RTMA_USAR_SUPABASE === true && typeof buscarPessoasRTMA === 'function') {
    try {
      const pessoas = await buscarPessoasRTMA(clube, null, null, null);
      return pessoas
        .filter(p => p.status && p.status.toLowerCase() === 'ativo' && 
                     p.tipo === 'Pré LEO' &&
                     p.nome && p.nome.trim() !== '')
        .map(p => p.nome);
    } catch (error) {
      console.error("Erro ao buscar Pré-LEOs do Supabase:", error);
      // Fallback para planilha
    }
  }

  // Fallback: usar planilha
  const sourceId = SOURCE_PLANILHAS_CLUBES[clube];
  if (!sourceId) return [];

  try {
    const ss = SpreadsheetApp.openById(sourceId);
    const sheet = ss.getSheetByName(ABA_RTM);
    if (!sheet) return [];

    // Buscar dados incluindo a coluna A (status)
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    
    return data.filter(row => {
      const status = String(row[0] || "").trim().toLowerCase();
      const tipo = String(row[1] || "").trim();
      const nome = String(row[3] || "").trim();
      
      // Filtrar apenas ativos
      return status === "ativo" && 
             tipo === "Pré LEO" &&
             nome !== "";
    }).map(row => row[3]);
  } catch (error) {
    console.error("Erro ao buscar Pré-LEOs:", error);
    return [];
  }
}

async function getLeoLeao(clube) {
  // Usar Supabase se disponível
  if (typeof RTMA_USAR_SUPABASE !== 'undefined' && RTMA_USAR_SUPABASE === true && typeof buscarPessoasRTMA === 'function') {
    try {
      const pessoas = await buscarPessoasRTMA(clube, null, null, null);
      return pessoas
        .filter(p => p.status && p.status.toLowerCase() === 'ativo' && 
                     p.tipo === 'Associado LEO/Leão' &&
                     p.nome && p.nome.trim() !== '')
        .map(p => p.nome);
    } catch (error) {
      console.error("Erro ao buscar LEO/Leão do Supabase:", error);
      // Fallback para planilha
    }
  }

  // Fallback: usar planilha
  const sourceId = SOURCE_PLANILHAS_CLUBES[clube];
  if (!sourceId) return [];

  try {
    const ss = SpreadsheetApp.openById(sourceId);
    const sheet = ss.getSheetByName(ABA_RTM);
    if (!sheet) return [];

    // Buscar dados incluindo a coluna A (status)
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    
    return data.filter(row => {
      const status = String(row[0] || "").trim().toLowerCase();
      const tipo = String(row[1] || "").trim();
      const nome = String(row[3] || "").trim();
      
      // Filtrar apenas ativos
      return status === "ativo" && 
             (tipo === "Associado LEO/Leão") &&
             nome !== "";
    }).map(row => row[3]);
      
  } catch (error) {
    console.error("Erro ao buscar LEO/Leão:", error);
    return [];
  }
}

async function getAmigosConselheiros(clube) {
  // Usar Supabase se disponível
  if (typeof RTMA_USAR_SUPABASE !== 'undefined' && RTMA_USAR_SUPABASE === true && typeof buscarAmigosConselheiros === 'function') {
    try {
      const amigos = await buscarAmigosConselheiros(clube, null);
      return amigos
        .filter(a => a.nome && a.nome.trim() !== '')
        .map(a => a.nome);
    } catch (error) {
      console.error("Erro ao buscar Amigos e Conselheiros do Supabase:", error);
      // Fallback para planilha
    }
  }

  // Fallback: usar planilha
  const sourceId = SOURCE_PLANILHAS_CLUBES[clube];
  if (!sourceId) return [];

  try {
    const ss = SpreadsheetApp.openById(sourceId);
    const sheet = ss.getSheetByName(ABA_AMIGOS);
    if (!sheet) return [];

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    return data.map(row => row[0]).filter(n => n && n.trim() !== "");
  } catch (error) {
    console.error("Erro ao buscar Amigos e Conselheiros:", error);
    return [];
  }
}

/**
 * Quantos dos nomes informados são cadastrados como Amigo(a) LEO (exclui Conselheiro(a)).
 * Usado no modal de detalhes de campanha para o resumo "Convidados e Amigos LEO participantes".
 * @param {string} clube
 * @param {string[]|string} nomesSelecionados - lista ou texto separado por vírgula
 * @return {number}
 */
async function contarAmigosLeoSelecionados(clube, nomesSelecionados) {
  try {
    if (!clube || String(clube).trim() === '') return 0;
    var nomes = [];
    if (Array.isArray(nomesSelecionados)) {
      nomes = nomesSelecionados.map(function(n) {
        return String(n || '').trim();
      }).filter(Boolean);
    } else if (nomesSelecionados != null && nomesSelecionados !== '') {
      nomes = String(nomesSelecionados).split(/[,;]/).map(function(x) {
        return x.trim();
      }).filter(Boolean);
    }
    if (nomes.length === 0) return 0;

    var set = {};
    nomes.forEach(function(n) {
      set[String(n).toLowerCase()] = true;
    });

    var amigos = (await buscarAmigosConselheiros(clube, null)) || [];
    var c = 0;
    for (var i = 0; i < amigos.length; i++) {
      var a = amigos[i];
      var nome = String(a.nome || '').trim();
      if (!nome || !set[nome.toLowerCase()]) continue;
      var tipo = String(a.tipo || '').trim();
      if (tipo === 'Amigo(a) LEO') c++;
    }
    return c;
  } catch (e) {
    console.error('contarAmigosLeoSelecionados:', e);
    return 0;
  }
}

/**
 * Listar pessoas para inscrição em eventos
 * Inclui pessoas ativas do RTMA e Amigos LEO/Conselheiros
 * @param {string} clube - Nome do clube
 * @return {Array} Array de objetos { nome, tipo, origem }
 */
async function listarPessoasParaEventos(clube, incluirNominata = false) {
  if (!clube || String(clube).trim() === '') return [];
  const clubeNome = String(clube).trim();
  const pessoas = [];
  const mapa = {};

  try {
    if (typeof buscarPessoasRTMA === 'function') {
      const listaRTMA = (await buscarPessoasRTMA(clubeNome, null, null, null)) || [];
      listaRTMA.forEach(pessoa => {
        const status = String(pessoa.status || '').toLowerCase();
        const nome = String(pessoa.nome || '').trim();
        if (!nome || status !== 'ativo') return;
        const tipo = String(pessoa.tipo || 'Pessoa Ativa').trim();
        const chave = `${nome}::${tipo}`;
        if (!mapa[chave]) {
          mapa[chave] = true;
          pessoas.push({ nome: nome, tipo: tipo, origem: 'RTMA' });
        }
      });
    }
  } catch (error) {
    console.error('Erro ao buscar pessoas RTMA para eventos:', error);
  }

  try {
    if (typeof buscarAmigosConselheiros === 'function') {
      const amigos = (await buscarAmigosConselheiros(clubeNome, null)) || [];
      amigos.forEach(amigo => {
        const nome = String(amigo.nome || '').trim();
        if (!nome) return;
        const tipo = String(amigo.tipo || 'Amigo/Conselheiro').trim();
        const chave = `${nome}::${tipo}`;
        if (!mapa[chave]) {
          mapa[chave] = true;
          pessoas.push({ nome: nome, tipo: tipo, origem: 'Amigos/Conselheiros' });
        }
      });
    }
  } catch (error) {
    console.error('Erro ao buscar amigos/conselheiros para eventos:', error);
  }

  if (incluirNominata) {
    try {
      const mapaIdParaNome = (typeof obterMapaClubesIdParaNomeSupabase === 'function')
        ? (await obterMapaClubesIdParaNomeSupabase()) : {};
      const precisaClubeOrigemParaInscricaoGabinete =
        String(clubeNome).toLowerCase().indexOf('gabinete distrital') >= 0;
      const inscricaoComoGabineteOuDistritoNome =
        precisaClubeOrigemParaInscricaoGabinete ||
        String(clubeNome).toLowerCase().indexOf('distrito leo ld-8') >= 0;

      var nominataDirigentesList = [];
      if (inscricaoComoGabineteOuDistritoNome && typeof buscarDirigentesNominataGabineteOuDistrito === 'function') {
        nominataDirigentesList = (await buscarDirigentesNominataGabineteOuDistrito()) || [];
      } else {
        const clubesNominata = [clubeNome, 'Gabinete Distrital', 'Distrito LEO LD-8']
          .map(c => String(c || '').trim())
          .filter(Boolean);
        const visitados = {};
        for (const clubeAlvo of clubesNominata) {
          if (visitados[clubeAlvo]) continue;
          visitados[clubeAlvo] = true;
          const dirs = (await buscarTodosDirigentes(clubeAlvo, null, null, null)) || [];
          dirs.forEach(function (d) {
            nominataDirigentesList.push(d);
          });
        }
      }

      const vistoIdNominata = {};
      const vinculosOrigem = precisaClubeOrigemParaInscricaoGabinete
        ? (await rtmaBuscarMapaClubeOrigemPorVinculosNominata_(nominataDirigentesList))
        : { porPessoaRtmaId: {}, porAmigoId: {} };
      nominataDirigentesList.forEach(dirigente => {
        if (!dirigente) return;
        if (dirigente.id && vistoIdNominata[String(dirigente.id)]) return;
        if (dirigente.id) vistoIdNominata[String(dirigente.id)] = true;
        const nome = String(dirigente.nome || '').trim();
        if (!nome) return;
        const tipo = String(dirigente.cargo || 'Nominata').trim();
        const chave = `${nome}::${tipo}`;
        if (!mapa[chave]) {
          mapa[chave] = true;
          const obj = { nome: nome, tipo: tipo, origem: 'Nominata' };
          if (precisaClubeOrigemParaInscricaoGabinete) {
            var coId = (dirigente.clube_origem_id != null && String(dirigente.clube_origem_id).trim() !== '')
              ? String(dirigente.clube_origem_id).trim() : '';
            var coNome = '';
            if (coId) {
              obj.clube_origem_id = coId;
              if (mapaIdParaNome[coId]) coNome = String(mapaIdParaNome[coId]).trim();
            } else {
              var prId = dirigente.pessoa_rtma_id != null ? String(dirigente.pessoa_rtma_id).trim() : '';
              var paId = dirigente.pessoa_amigo_id != null ? String(dirigente.pessoa_amigo_id).trim() : '';
              var rowRtma = prId && vinculosOrigem.porPessoaRtmaId ? vinculosOrigem.porPessoaRtmaId[prId] : null;
              var rowAmigo = paId && vinculosOrigem.porAmigoId ? vinculosOrigem.porAmigoId[paId] : null;
              var row = rowRtma || rowAmigo;
              if (row) {
                if (row.clube_id) {
                  obj.clube_origem_id = String(row.clube_id).trim();
                  if (mapaIdParaNome[row.clube_id]) coNome = String(mapaIdParaNome[row.clube_id]).trim();
                }
                if (row.clube_nome) coNome = String(row.clube_nome).trim();
              }
            }
            if (coNome) obj.clube_origem_nome = coNome;
          }
          pessoas.push(obj);
        }
      });
    } catch (error) {
      console.error('Erro ao buscar nominata para eventos:', error);
    }
  }

  pessoas.sort((a, b) => a.nome.localeCompare(b.nome));
  return pessoas;
}

/**
 * Listar pessoas do RTMA para inscrição em eventos (sem nominata/gabinete)
 * @param {string} clube - Nome do clube
 * @return {Array} Array de objetos { nome, tipo, origem }
 */
async function listarPessoasRTMAParaEventos(clube) {
  if (!clube || String(clube).trim() === '') return [];
  const clubeNome = String(clube).trim();
  const pessoas = [];
  const mapa = {};

  try {
    if (typeof buscarPessoasRTMA === 'function') {
      const listaRTMA = (await buscarPessoasRTMA(clubeNome, null, null, null)) || [];
      listaRTMA.forEach(pessoa => {
        const status = String(pessoa.status || '').toLowerCase();
        const nome = String(pessoa.nome || '').trim();
        if (!nome || status !== 'ativo') return;
        const tipo = String(pessoa.tipo || 'Pessoa Ativa').trim();
        const chave = `${nome}::${tipo}`;
        if (!mapa[chave]) {
          mapa[chave] = true;
          pessoas.push({ nome: nome, tipo: tipo, origem: 'RTMA' });
        }
      });
    }
  } catch (error) {
    console.error('Erro ao buscar pessoas RTMA para eventos:', error);
  }

  return pessoas;
}

/**
 * Registrar inscrição com upload opcional de comprovante
 * @param {Object} dados
 * @return {Object}
 */
async function registrarInscricaoEventoComComprovante(dados) {
  try {
    if (!dados || !dados.eventoId || !dados.pessoaNome || !dados.clubeNome) {
      return { sucesso: false, erro: 'Dados obrigatórios não informados.' };
    }

    let comprovanteInfo = null;
    if (dados.comprovanteBase64 && dados.comprovanteNome) {
      const base64String = String(dados.comprovanteBase64);
      const parts = base64String.split(',');
      const base64Data = parts.length > 1 ? parts[1] : parts[0];
      const mimeFromDataUrl = parts.length > 1 ? (parts[0].match(/data:(.*);base64/) || [])[1] : null;
      const mimeType = dados.comprovanteMime || mimeFromDataUrl || 'application/octet-stream';

      const bytes = Buffer.from(base64Data, "base64");
      const blob = Utilities.newBlob(bytes, mimeType, dados.comprovanteNome);

      comprovanteInfo = await portalUploadComprovanteEvento(
        blob,
        dados.comprovanteNome,
        dados.eventoId,
        dados.clubeNome,
        dados.pessoaNome
      );

      if (!comprovanteInfo || !comprovanteInfo.sucesso) {
        return { sucesso: false, erro: comprovanteInfo && comprovanteInfo.erro ? comprovanteInfo.erro : 'Erro ao enviar comprovante.' };
      }
    }

    const envio = await portalCriarEnvioEvento({
      eventoId: dados.eventoId,
      clubeNome: dados.clubeNome,
      clubeId: dados.clubeId || null
    });
    if (!envio || !envio.id) {
      return { sucesso: false, erro: 'Erro ao criar envio.' };
    }
    if (comprovanteInfo && comprovanteInfo.sucesso) {
      await portalCriarComprovanteEnvio({
        envioId: envio.id,
        comprovanteUrl: comprovanteInfo.url,
        comprovanteNome: comprovanteInfo.nomeArquivo || dados.comprovanteNome,
        comprovanteMime: comprovanteInfo.tipo || dados.comprovanteMime,
        comprovanteTamanho: comprovanteInfo.tamanho || dados.comprovanteTamanho
      });
    }

    const payload = Object.assign({}, dados, { envioId: envio.id });
    const inscricao = await portalCriarInscricaoEvento(payload);
    return { sucesso: true, inscricao: inscricao };
  } catch (error) {
    console.error('Erro ao registrar inscrição com comprovante:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Verifica se o formulário de convidados está ativo.
 */
function isFormularioConvidadosAtivo() {
  try {
    const props = PropertiesService.getScriptProperties();
    const v = props.getProperty('formulario_convidados_ativado');
    return v === 'true' || v === '1';
  } catch (e) {
    return false;
  }
}

/**
 * Ativa ou desativa o formulário de convidados (apenas distrital/admin).
 */
function setFormularioConvidadosAtivo(ativo) {
  try {
    PropertiesService.getScriptProperties().setProperty('formulario_convidados_ativado', ativo ? 'true' : 'false');
    return { sucesso: true, ativo: !!ativo };
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }
}

/**
 * Habilita ou desabilita o formulário externo de convidados para um evento específico.
 * O link externo só é válido quando: (1) formulário global ativo E (2) evento.formularioConvidadosHabilitado = true.
 */
async function setFormularioConvidadosHabilitadoEvento(eventoId, habilitado) {
  try {
    if (!eventoId) return { sucesso: false, erro: 'Evento não informado.' };
    await portalAtualizarEvento(eventoId, { formularioConvidadosHabilitado: !!habilitado });
    return { sucesso: true, habilitado: !!habilitado };
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }
}

/**
 * Retorna informações do evento/lote para o formulário de convidados (acesso externo).
 * Usado pela página form_evento_convidados.html.
 * @param {string} eventoId - ID do evento (obrigatório)
 * @param {string|null} loteId - ID do lote (opcional). Se vazio, retorna evento + lista de lotes disponíveis para o usuário selecionar.
 */
async function obterInfoFormularioConvidado(eventoId, loteId) {
  try {
    if (!eventoId || !String(eventoId).trim()) return { sucesso: false, erro: 'Evento obrigatório.' };
    const eventos = await portalListarEventos();
    const evento = eventos ? eventos.find(function(e) { return String(e.id) === String(eventoId); }) : null;
    if (!evento) return { sucesso: false, erro: 'Evento não encontrado.' };
    if (!evento.formularioConvidadosHabilitado) return { sucesso: false, erro: 'Formulário externo não habilitado para este evento.' };
    const lotes = (await portalListarLotesEvento(eventoId)) || [];
    const formatarData = function(d) {
      if (!d) return '';
      try {
        const x = new Date(d);
        if (isNaN(x.getTime())) return String(d);
        return Utilities.formatDate(x, 'America/Sao_Paulo', 'dd/MM/yyyy');
      } catch (e) { return String(d); }
    };
    let periodo = '';
    if (evento.dataInicio && evento.dataFim) periodo = formatarData(evento.dataInicio) + ' até ' + formatarData(evento.dataFim);
    else if (evento.dataInicio) periodo = formatarData(evento.dataInicio);
    else if (evento.dataEvento) periodo = formatarData(evento.dataEvento);
    const base = {
      sucesso: true,
      nomeEvento: evento.nome || 'Evento',
      fotoUrl: (evento.fotoUrl || '').trim(),
      descricao: (evento.descricao || '').trim(),
      local: (evento.clubeSedeNome || '').trim(),
      periodo: periodo,
      pixKey: (evento.pixKey || '').trim(),
      beneficiario: (evento.beneficiario || '').trim(),
      banco: (evento.banco || '').trim(),
      permitirEmailClubePassaporte: !!(evento.eventoTeraPassaportes && evento.enviarPassaportePorEmail)
    };
    if (loteId && String(loteId).trim()) {
      const lote = lotes.find(function(l) { return String(l.id) === String(loteId); });
      if (!lote) return { sucesso: false, erro: 'Lote não encontrado.' };
      const usados = await portalContarInscricoesPorLote(lote.id);
      const restantes = (lote.quantidadeTotal || 0) - usados;
      if (lote.ativo === false || restantes <= 0) return { sucesso: false, erro: 'Lote encerrado ou sem vagas.' };
      if (typeof portalLoteDentroVigencia === 'function' && !portalLoteDentroVigencia(lote)) {
        return { sucesso: false, erro: 'Lote fora do período de vigência (horário de Brasília).' };
      }
      return Object.assign({}, base, {
        nomeLote: lote.nomeLote || lote.nome_lote || '',
        restantes: restantes,
        valorLote: lote.valor != null ? Number(lote.valor) : 0
      });
    }
    var usadosMap = (typeof portalContarInscricoesMultiplosLotes === 'function')
      ? await portalContarInscricoesMultiplosLotes(lotes.map(function(l) { return l.id; }))
      : {};
    var lotesDisponiveis = [];
    for (const l of lotes) {
      const usados = usadosMap[String(l.id)] != null ? usadosMap[String(l.id)] : await portalContarInscricoesPorLote(l.id);
      const restantes = (l.quantidadeTotal || 0) - usados;
      if (l.ativo !== false && restantes > 0 && (typeof portalLoteDentroVigencia !== 'function' || portalLoteDentroVigencia(l))) {
        lotesDisponiveis.push({
          id: l.id,
          nomeLote: l.nomeLote || l.nome_lote || '',
          restantes: restantes,
          valor: l.valor != null ? Number(l.valor) : 0
        });
      }
    }
    if (lotesDisponiveis.length === 0) return { sucesso: false, erro: 'Nenhum lote disponível para inscrição.' };
    var clubesForm = [];
    try {
      var resClubes = await listarClubesSupabase();
      if (resClubes.sucesso && Array.isArray(resClubes.clubes)) {
        var excluir = ['Gabinete Distrital', 'Distrito LEO LD-8'];
        clubesForm = (resClubes.clubes || []).filter(function(c) {
          var n = (c.nome || '').trim();
          return n && excluir.indexOf(n) < 0;
        }).sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
      }
    } catch (ec) { console.warn('obterInfoFormularioConvidado clubes:', ec); }
    return Object.assign({}, base, { lotes: lotesDisponiveis, clubes: clubesForm });
  } catch (e) {
    console.error('obterInfoFormularioConvidado:', e);
    return { sucesso: false, erro: e.message || 'Erro ao carregar informações.' };
  }
}

/**
 * Retorna a URL do formulário de convidados para um evento.
 * O convidado seleciona o lote ao preencher o formulário.
 * Retorna null se o formulário não estiver ativo ou o evento não tiver o link habilitado.
 */
async function obterUrlFormularioConvidados(eventoId) {
  if (!eventoId) return null;
  try {
    var evento = null;
    var eventos = await portalListarEventos();
    if (eventos) evento = eventos.find(function(e) { return String(e.id) === String(eventoId); });
    if (!evento || !evento.formularioConvidadosHabilitado) return null;
    // Link público do formulário de convidados, hospedado na Vercel (página estática).
    // ALLOWED_ORIGIN é o domínio público; nunca usar a URL de deployment (protegida por SSO) nem a do Apps Script (pede login Google).
    var baseUrl = (process.env.ALLOWED_ORIGIN || 'https://leo-portal-vercel.vercel.app').replace(/\/+$/, '');
    return baseUrl + '/form_evento_convidados.html?evento=' + encodeURIComponent(String(eventoId || ''));
  } catch (e) {
    return null;
  }
}

/**
 * URL base do scanner hospedado externamente (Vercel, Netlify, etc.).
 * Quando definida, o link do scanner usa esta URL em vez do Apps Script (câmera funciona).
 */
var SCANNER_HOSTED_BASE_URL = 'https://leo-portal.vercel.app/scanner_deploy';

/**
 * Retorna a URL da página do scanner de refeições (passaporte) para um evento.
 * Usado no portal para copiar/abrir o link no celular.
 * Se SCANNER_HOSTED_BASE_URL estiver definida, retorna a URL hospedada (câmera funciona).
 */
function getUrlScannerRefeicoes(eventoId, eventoNome) {
  try {
    var baseUrl = '';
    if (typeof ScriptApp !== 'undefined' && ScriptApp.getService) {
      var svc = ScriptApp.getService();
      if (svc) baseUrl = svc.getUrl() || '';
    }
    if (!baseUrl) baseUrl = 'https://script.google.com/macros/s/AKfycbwOhvOaFLGBYCOhk7RhPCL5iGjGjNdBXv5W8KyRGZIgaU2hLhKJhDjJHvOkZjMfQSuDFg/exec';
    var hosted = (typeof SCANNER_HOSTED_BASE_URL === 'string') ? String(SCANNER_HOSTED_BASE_URL).trim() : '';
    if (hosted) {
      var url = hosted.replace(/\/+$/, '') + '/scanner_hosted.html';
      url += '?apiUrl=' + encodeURIComponent(baseUrl);
      url += '&evento=' + encodeURIComponent(String(eventoId || ''));
      if (eventoNome) url += '&eventoNome=' + encodeURIComponent(String(eventoNome));
      return url;
    }
    return baseUrl + '?page=scanner_refeicoes&evento=' + encodeURIComponent(String(eventoId || ''));
  } catch (e) {
    return '';
  }
}

// === CAMISAS ENUMERADAS (PLANILHA GOOGLE FORMS) ===
// ID da planilha de respostas do formulário de camisas (ex.: "Pedido camisetas III CDM AL 25/26 (respostas)").
// Para usar outra planilha: abra a planilha no Drive, a URL é .../d/ESTE_ID/edit — copie ESTE_ID e substitua abaixo.
const CAMISAS_PLANILHA_ID = '1VyyOCNafu3dxOUiPR2aKopt2Iy1-fwa4nO4mdbXupIU';
// Pasta do Drive para anexos de comprovante de pagamento (camisas)
const CAMISAS_PASTA_COMPROVANTES_ID = '1pPQyJj_FTRXh0wnJs1m3PDRamr4rC6_s';
// Alguns projetos renomeiam a aba de respostas; tratamos múltiplos nomes e fallback.
const CAMISAS_ABA_RESPOSTAS_PREFERIDAS = [
  'Form_Responses',
  'Respostas ao formulário 1'
];

/**
 * Localiza a aba correta da planilha de camisas.
 * Tenta pelos nomes conhecidos e, se não encontrar, procura por cabeçalho compatível.
 */
function obterSheetCamisas(ss) {
  if (!ss) {
    ss = SpreadsheetApp.openById(CAMISAS_PLANILHA_ID);
  }

  // 1) Tenta pelos nomes preferidos
  for (var i = 0; i < CAMISAS_ABA_RESPOSTAS_PREFERIDAS.length; i++) {
    var nome = CAMISAS_ABA_RESPOSTAS_PREFERIDAS[i];
    if (!nome) continue;
    var s = ss.getSheetByName(nome);
    if (s) {
      Logger.log('[Camisas] Aba encontrada por nome: "' + s.getName() + '"');
      return s;
    }
  }

  // 2) Procura uma aba cujo cabeçalho pareça com o formulário de camisas
  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var sh = sheets[j];
    try {
      var header = sh.getRange(1, 1, 1, 7).getValues()[0]; // A1:G1
      var a = String(header[0] || '').trim().toLowerCase();
      var b = String(header[1] || '').trim().toLowerCase();
      var c = String(header[2] || '').trim().toLowerCase();
      var d = String(header[3] || '').trim().toLowerCase();
      var e = String(header[4] || '').trim().toLowerCase();
      if (a.indexOf('carimbo') === 0 &&
          b.indexOf('nome completo') === 0 &&
          c.indexOf('tamanho') === 0 &&
          d.indexOf('nome escrito na personalização') === 0 &&
          e.indexOf('número que ficará nas costas') === 0) {
        Logger.log('[Camisas] Aba encontrada por cabeçalho: "' + sh.getName() + '"');
        return sh;
      }
    } catch (eh) {
      // Ignora erros em abas estranhas
    }
  }

  // 3) Fallback final: usa a primeira aba disponível
  if (sheets && sheets.length > 0) {
    Logger.log('[Camisas] Usando fallback: primeira aba "' + sheets[0].getName() + '"');
    return sheets[0];
  }

  Logger.log('[Camisas] Nenhuma aba encontrada.');
  return null;
}

/**
 * Normaliza o número da camiseta para string de 2 dígitos (ex: "7" -> "07").
 */
function normalizarNumeroCamisa(valor) {
  var n = String(valor == null ? '' : valor).trim();
  if (!n) return '';
  // Se vier como número, garantir apenas dígitos
  n = n.replace(/[^\d]/g, '');
  if (!n) return '';
  if (n.length === 1) n = '0' + n;
  return n;
}

/**
 * Lista todas as camisas enumeradas com base na planilha de respostas.
 * Retorna apenas linhas que possuem número de camiseta preenchido.
 * Logs em Logger.log para debug em Execuções do Apps Script.
 */
function listarCamisasEnumeradas() {
  var debugBase = { planilhaId: CAMISAS_PLANILHA_ID };
  try {
    Logger.log('[Camisas] Abrindo planilha ID: ' + CAMISAS_PLANILHA_ID);
    var ss = SpreadsheetApp.openById(CAMISAS_PLANILHA_ID);
    var sheet = obterSheetCamisas(ss);
    if (!sheet) {
      Logger.log('[Camisas] ERRO: Aba de respostas não encontrada. Abas: ' + (ss.getSheets().map(function(s) { return s.getName(); }).join(', ')));
      debugBase.erro = 'Aba de respostas não encontrada.';
      debugBase.abasDisponiveis = ss.getSheets().map(function(s) { return s.getName(); });
      return { itens: [], debug: debugBase };
    }

    var sheetNome = sheet.getName();
    Logger.log('[Camisas] Aba encontrada: "' + sheetNome + '"');

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    Logger.log('[Camisas] lastRow=' + lastRow + ', lastCol=' + lastCol);

    if (lastRow < 2) {
      debugBase.sheetNome = sheetNome;
      debugBase.ultimaLinhaPlanilha = lastRow;
      debugBase.totalLinhasDados = 0;
      debugBase.motivo = 'Planilha com menos de 2 linhas (só cabeçalho ou vazia).';
      return { itens: [], debug: debugBase };
    }

    var colCount = Math.max(lastCol, 7);
    var values = sheet.getRange(2, 1, lastRow, colCount).getValues();
    var linhasLidas = values.length;
    Logger.log('[Camisas] Linhas lidas (dados): ' + linhasLidas);

    var resultado = [];
    var amostraColunaE = [];
    for (var i = 0; i < values.length; i++) {
      var linha = values[i];
      var rawE = linha[4];
      var numero = normalizarNumeroCamisa(rawE);
      if (amostraColunaE.length < 5) {
        var rawSerial = (rawE == null) ? null : (typeof rawE === 'object' && rawE instanceof Date ? rawE.toISOString() : rawE);
        amostraColunaE.push({ raw: rawSerial, tipo: typeof rawE, normalizado: numero });
      }

      var nomePersonalizacao = linha[3] || '';
      var nomeCompleto = linha[1] || '';

      if (!numero) {
        continue;
      }

      var ts = linha[0];
      var timestampSerial = (ts == null) ? null : (ts instanceof Date ? ts.toISOString() : String(ts));

      resultado.push({
        id: i + 1,
        timestamp: timestampSerial,
        nomeCompleto: nomeCompleto,
        tamanho: linha[2] || '',
        nomePersonalizacao: nomePersonalizacao,
        numeroCamisa: numero,
        comprovanteUrl: linha[5] || '',
        retirada: linha[6] || ''
      });
    }

    Logger.log('[Camisas] Registros com número preenchido: ' + resultado.length + ' (de ' + linhasLidas + ' linhas)');
    if (linhasLidas > 0 && resultado.length === 0) {
      Logger.log('[Camisas] Amostra coluna E (primeiras linhas): ' + JSON.stringify(amostraColunaE));
    }

    debugBase.sheetNome = sheetNome;
    debugBase.totalLinhasDados = resultado.length;
    debugBase.ultimaLinhaPlanilha = lastRow;
    debugBase.totalColunasPlanilha = lastCol;
    debugBase.linhasLidas = linhasLidas;
    if (linhasLidas > 0 && resultado.length === 0) debugBase.amostraColunaE = amostraColunaE;

    return { itens: resultado, debug: debugBase };
  } catch (e) {
    var errMsg = e && e.message ? e.message : String(e);
    Logger.log('[Camisas] EXCEÇÃO: ' + errMsg);
    if (e && e.stack) Logger.log('[Camisas] Stack: ' + e.stack);
    debugBase.erro = errMsg;
    if (e && e.stack) debugBase.stack = String(e.stack).substring(0, 500);
    return { itens: [], debug: debugBase };
  }
}

/**
 * Salva uma nova camisa enumerada na planilha.
 * Garante que o número da camiseta seja único.
 */
function salvarCamisaEnumerada(dados) {
  try {
    if (!dados) {
      return { sucesso: false, erro: 'Dados não informados.' };
    }

    var nomeCompleto = String(dados.nomeCompleto || '').trim();
    var tamanho = String(dados.tamanho || '').trim();
    var nomePersonalizacao = String(dados.nomePersonalizacao || '').trim();
    var numero = normalizarNumeroCamisa(dados.numeroCamisa);
    var comprovanteUrl = String(dados.comprovanteUrl || '').trim();
    var retirada = String(dados.retirada || '').trim();

    if (!nomeCompleto) {
      return { sucesso: false, erro: 'Informe o nome completo.' };
    }
    if (!tamanho) {
      return { sucesso: false, erro: 'Informe o tamanho da camiseta.' };
    }
    if (!nomePersonalizacao) {
      return { sucesso: false, erro: 'Informe o nome para personalização.' };
    }
    if (nomePersonalizacao.length > 7) {
      return { sucesso: false, erro: 'O nome para personalização deve ter no máximo 7 caracteres.' };
    }
    if (!numero) {
      return { sucesso: false, erro: 'Informe o número da camiseta.' };
    }

    var ss = SpreadsheetApp.openById(CAMISAS_PLANILHA_ID);
    var sheet = obterSheetCamisas(ss);
    if (!sheet) {
      return { sucesso: false, erro: 'Aba de respostas da planilha de camisas não encontrada. Confirme o nome/cabeçalho da aba.' };
    }

    // Lock para evitar que duas respostas simultâneas sobrescrevam ou dupliquem número
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000); // esperar até 30s pelo lock
    } catch (e) {
      return { sucesso: false, erro: 'Muitas requisições no momento. Tente novamente em alguns segundos.' };
    }
    try {
      // Verificar se o número já foi usado (dentro do lock)
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var numerosExistentesRange = sheet.getRange(2, 5, lastRow - 1, 1).getValues(); // Coluna E
        for (var i = 0; i < numerosExistentesRange.length; i++) {
          var existente = normalizarNumeroCamisa(numerosExistentesRange[i][0]);
          if (existente && existente === numero) {
            lock.releaseLock();
            return {
              sucesso: false,
              erro: 'Este número de camiseta já foi escolhido. Selecione outro número.'
            };
          }
        }
      }

      // Montar linha conforme estrutura atual da planilha (A:G)
      var novaLinha = [
        new Date(),         // A - Carimbo de data/hora
        nomeCompleto,       // B - Nome completo
        tamanho,            // C - Tamanho da camiseta
        nomePersonalizacao, // D - Nome na personalização
        numero,             // E - Número nas costas
        comprovanteUrl,     // F - Comprovante de pagamento (link)
        retirada            // G - Retirada da camiseta
      ];

      sheet.appendRow(novaLinha);
      return { sucesso: true };
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    console.error('salvarCamisaEnumerada:', e);
    return { sucesso: false, erro: e.message || 'Erro ao salvar dados da camiseta.' };
  }
}

/**
 * Envia um arquivo (base64) para a pasta de comprovantes de camisas no Drive.
 * Retorna { sucesso: true, url: '...' } ou { sucesso: false, erro: '...' }.
 */
function enviarComprovanteCamisaParaDrive(base64DataUrl, nomeArquivo) {
  try {
    if (!base64DataUrl || typeof base64DataUrl !== 'string') {
      return { sucesso: false, erro: 'Dados do arquivo não informados.' };
    }
    var parts = base64DataUrl.split(',');
    var base64Data = parts.length > 1 ? parts[1] : parts[0];
    var mimeType = 'application/octet-stream';
    if (parts.length > 1 && parts[0].match(/data:(.*);base64/)) {
      mimeType = parts[0].match(/data:(.*);base64/)[1].trim();
    }
    var nome = (nomeArquivo && String(nomeArquivo).trim()) ? String(nomeArquivo).trim() : 'comprovante_' + new Date().getTime();
    var bytes = Buffer.from(base64Data, "base64");
    var blob = Utilities.newBlob(bytes, mimeType, nome);

    var folder = DriveApp.getFolderById(CAMISAS_PASTA_COMPROVANTES_ID);
    var file = folder.createFile(blob);
    var url = file.getUrl();
    return { sucesso: true, url: url };
  } catch (e) {
    console.error('enviarComprovanteCamisaParaDrive:', e);
    return { sucesso: false, erro: (e && e.message) ? e.message : String(e) };
  }
}

/**
 * Retorna a URL pública do formulário de camisas enumeradas.
 * Usa a URL atual do Web App como base, com fallback em caso de erro.
 */
function obterUrlFormularioCamisas() {
  try {
    var baseUrl = '';
    if (typeof ScriptApp !== 'undefined' && ScriptApp.getService) {
      var svc = ScriptApp.getService();
      if (svc) baseUrl = svc.getUrl() || '';
    }
    if (!baseUrl) {
      // Fallback (mesmo usado em outros links externos do portal)
      baseUrl = 'https://script.google.com/macros/s/AKfycbwOhvOaFLGBYCOhk7RhPCL5iGjGjNdBXv5W8KyRGZIgaU2hLhKJhDjJHvOkZjMfQSuDFg/exec';
    }
    return baseUrl + '?page=camisas_enumeradas';
  } catch (e) {
    return '';
  }
}

/**
 * Registra inscrição de convidado externo (sem clube no sistema).
 * Aceita uma pessoa ou várias (pessoas: [{nome, cargo, restricaoAlimentar}]).
 * Uma única envio e comprovante para todas as inscrições.
 */
async function registrarInscricaoConvidadoExterno(dados) {
  try {
    if (!dados || !dados.eventoId || !dados.loteId) {
      return { sucesso: false, erro: 'Evento e lote são obrigatórios.' };
    }
    var pessoas = [];
    if (dados.pessoas && Array.isArray(dados.pessoas) && dados.pessoas.length > 0) {
      pessoas = dados.pessoas.filter(function(p) { return p && String(p.nome || '').trim(); });
    } else if (dados.nome) {
      pessoas = [{ nome: dados.nome, cargo: dados.cargo || '', restricaoAlimentar: dados.restricaoAlimentar || '' }];
    }
    if (pessoas.length === 0) {
      return { sucesso: false, erro: 'Informe ao menos um nome.' };
    }
    var eventos = await portalListarEventos();
    var evento = eventos ? eventos.find(function(e) { return String(e.id) === String(dados.eventoId); }) : null;
    if (!evento || !evento.formularioConvidadosHabilitado) {
      return { sucesso: false, erro: 'Formulário externo não habilitado para este evento.' };
    }
    if (!dados.comprovanteBase64 || !dados.comprovanteNome) {
      return { sucesso: false, erro: 'É obrigatório anexar o comprovante de pagamento.' };
    }
    var clubeNome = 'Convidado';
    if (dados.representaClube && dados.clubeD8 && String(dados.clubeD8).trim()) {
      clubeNome = String(dados.clubeD8).trim();
      const podeAtualizarEmailClube = !!(evento.eventoTeraPassaportes && evento.enviarPassaportePorEmail);
      if (podeAtualizarEmailClube && dados.emailClube && String(dados.emailClube).trim() && dados.emailClube.indexOf('@') >= 0) {
        try {
          await atualizarEmailClubeSupabase(clubeNome, String(dados.emailClube).trim());
        } catch (ec) { console.warn('Atualizar email clube:', ec); }
      }
    } else {
      var rep = String(dados.representacao || '').trim();
      if (rep) clubeNome = rep;
    }

    const base64String = String(dados.comprovanteBase64);
    const parts = base64String.split(',');
    const base64Data = parts.length > 1 ? parts[1] : parts[0];
    const mimeFromDataUrl = parts.length > 1 ? (parts[0].match(/data:(.*);base64/) || [])[1] : null;
    const mimeType = dados.comprovanteMime || mimeFromDataUrl || 'application/octet-stream';
    const bytes = Buffer.from(base64Data, "base64");
    const blob = Utilities.newBlob(bytes, mimeType, dados.comprovanteNome);

    var nomesParaUpload = pessoas.map(function(p) { return p.nome; }).join(', ');
    const comprovanteInfo = await portalUploadComprovanteEvento(blob, dados.comprovanteNome, dados.eventoId, clubeNome, nomesParaUpload);
    if (!comprovanteInfo || !comprovanteInfo.sucesso) {
      return { sucesso: false, erro: comprovanteInfo && comprovanteInfo.erro ? comprovanteInfo.erro : 'Erro ao enviar comprovante.' };
    }

    const envio = await portalCriarEnvioEvento({ eventoId: dados.eventoId, clubeNome: clubeNome, clubeId: null });
    if (!envio || !envio.id) return { sucesso: false, erro: 'Erro ao criar envio.' };

    await portalCriarComprovanteEnvio({
      envioId: envio.id,
      comprovanteUrl: comprovanteInfo.url,
      comprovanteNome: comprovanteInfo.nomeArquivo || dados.comprovanteNome,
      comprovanteMime: comprovanteInfo.tipo || dados.comprovanteMime,
      comprovanteTamanho: comprovanteInfo.tamanho || dados.comprovanteTamanho
    });

    // Validar vagas do lote antes de criar inscrições (evitar ultrapassar limite)
    var loteConvidado = await portalBuscarLoteEventoPorId(dados.loteId);
    if (!loteConvidado) return { sucesso: false, erro: 'Lote não encontrado.' };
    if (typeof portalLoteDentroVigencia === 'function' && !portalLoteDentroVigencia(loteConvidado)) {
      return { sucesso: false, erro: 'Lote fora do período de vigência (horário de Brasília).' };
    }
    if (loteConvidado.ativo === false) return { sucesso: false, erro: 'Lote encerrado.' };
    var usadosLote = await portalContarInscricoesPorLote(dados.loteId);
    var restantesLote = (loteConvidado.quantidadeTotal || 0) - usadosLote;
    if (restantesLote <= 0) return { sucesso: false, erro: 'Lote sem vagas disponíveis.' };
    if (pessoas.length > restantesLote) {
      return {
        sucesso: false,
        erro: 'O lote possui apenas ' + restantesLote + ' vaga(s) restante(s). Você informou ' + pessoas.length + ' pessoa(s). Reduza a quantidade ou escolha outro lote.'
      };
    }

    var inscricoes = [];
    var erros = [];
    for (var i = 0; i < pessoas.length; i++) {
      var p = pessoas[i];
      var nome = String(p.nome || '').trim();
      if (!nome) continue;
      try {
        var payload = {
          eventoId: dados.eventoId,
          loteId: dados.loteId,
          envioId: envio.id,
          clubeNome: clubeNome,
          pessoaNome: nome,
          pessoaTipo: String(p.cargo || '').trim(),
          restricaoAlimentar: !!(p.restricaoAlimentar && String(p.restricaoAlimentar).trim()),
          restricaoDescricao: String(p.restricaoAlimentar || '').trim()
        };
        var insc = await portalCriarInscricaoEvento(payload);
        inscricoes.push(insc);
      } catch (err) {
        erros.push(nome + ': ' + (err.message || err));
      }
    }
    if (inscricoes.length === 0) {
      return { sucesso: false, erro: erros.length > 0 ? erros.join('; ') : 'Nenhuma inscrição foi realizada.' };
    }
    return {
      sucesso: true,
      inscricao: inscricoes[0],
      inscricoes: inscricoes,
      total: inscricoes.length,
      errosParciais: erros.length > 0 ? erros : null
    };
  } catch (e) {
    console.error('registrarInscricaoConvidadoExterno:', e);
    return { sucesso: false, erro: e.message || 'Erro ao registrar inscrição.' };
  }
}

/**
 * Registrar várias inscrições de evento em lote (lógica interna).
 * @param {Object} dados - Metadados e lista de pessoas (sem arquivo em base64 quando blob for usado).
 * @param {Blob|null} blobComprovanteOpcional - Comprovante enviado como Blob (ex.: formulário HTML → google.script.run); evita limite de payload do base64.
 * @return {Object}
 */
async function registrarInscricoesEventoEmLoteInterno_(dados, blobComprovanteOpcional) {
  try {
    console.log('📦 Início registrarInscricoesEventoEmLote', {
      eventoId: dados && dados.eventoId,
      clube: dados && dados.clubeNome,
      loteId: dados && dados.loteId,
      pessoas: (dados && dados.pessoas && dados.pessoas.length) || 0,
      comprovanteViaBlob: !!(blobComprovanteOpcional && blobComprovanteOpcional.getBytes && blobComprovanteOpcional.getBytes().length)
    });
    if (!dados || !dados.eventoId || !dados.clubeNome) {
      return { sucesso: false, erro: 'Evento e clube são obrigatórios.' };
    }
    const pessoas = Array.isArray(dados.pessoas) ? dados.pessoas : [];
    if (pessoas.length === 0) {
      return { sucesso: false, erro: 'Nenhuma pessoa informada para inscrição.' };
    }

    const eventoId = String(dados.eventoId).trim();
    const clubeNome = String(dados.clubeNome).trim();
    const loteId = String(dados.loteId || '').trim();
    const restricao = !!dados.restricaoAlimentar;
    const restricaoDescricao = String(dados.restricaoDescricao || '').trim();
    const restricaoPessoas = Array.isArray(dados.restricaoPessoas) ? dados.restricaoPessoas : [];
    const restricaoDetalhes = (dados.restricaoPessoasDetalhes && typeof dados.restricaoPessoasDetalhes === 'object')
      ? dados.restricaoPessoasDetalhes
      : {};
    const mapaRestricao = {};
    const mapaRestricaoDetalhes = {};
    restricaoPessoas.forEach(nome => {
      const chave = String(nome || '').trim().toLowerCase();
      if (chave) mapaRestricao[chave] = true;
    });
    Object.keys(restricaoDetalhes).forEach(nome => {
      const chave = String(nome || '').trim().toLowerCase();
      if (chave) {
        mapaRestricao[chave] = true;
        mapaRestricaoDetalhes[chave] = String(restricaoDetalhes[nome] || '').trim();
      }
    });

    let comprovanteInfo = null;
    if (blobComprovanteOpcional && blobComprovanteOpcional.getBytes && blobComprovanteOpcional.getBytes().length > 0) {
      console.log('📎 Enviando comprovante do lote (Blob do formulário)...');
      var nomeBlobComp = 'comprovante.pdf';
      try {
        nomeBlobComp = blobComprovanteOpcional.getName() || nomeBlobComp;
      } catch (eNome) {}
      comprovanteInfo = await portalUploadComprovanteEvento(
        blobComprovanteOpcional,
        nomeBlobComp,
        dados.eventoId,
        dados.clubeNome,
        'lote'
      );
      if (!comprovanteInfo || !comprovanteInfo.sucesso) {
        return {
          sucesso: false,
          erro: comprovanteInfo && comprovanteInfo.erro ? comprovanteInfo.erro : 'Erro ao enviar comprovante.'
        };
      }
      console.log('✅ Comprovante enviado:', comprovanteInfo.url);
    } else if (dados.comprovanteBase64 && dados.comprovanteNome) {
      console.log('📎 Enviando comprovante do lote (base64 legado)...');
      const base64String = String(dados.comprovanteBase64);
      const parts = base64String.split(',');
      const base64Data = parts.length > 1 ? parts[1] : parts[0];
      const mimeFromDataUrl = parts.length > 1 ? (parts[0].match(/data:(.*);base64/) || [])[1] : null;
      const mimeType = dados.comprovanteMime || mimeFromDataUrl || 'application/octet-stream';

      const bytes = Buffer.from(base64Data, "base64");
      const blob = Utilities.newBlob(bytes, mimeType, dados.comprovanteNome);

      comprovanteInfo = await portalUploadComprovanteEvento(
        blob,
        dados.comprovanteNome,
        dados.eventoId,
        dados.clubeNome,
        'lote'
      );

      if (!comprovanteInfo || !comprovanteInfo.sucesso) {
        return {
          sucesso: false,
          erro: comprovanteInfo && comprovanteInfo.erro ? comprovanteInfo.erro : 'Erro ao enviar comprovante.'
        };
      }
      console.log('✅ Comprovante enviado:', comprovanteInfo.url);
    }

    console.log('🔍 Buscando inscritos existentes...');
    const inscritosExistentes = (await portalListarInscricoesEvento(eventoId)) || [];
    const mapaExistentes = {};
    inscritosExistentes.forEach(item => {
      const nome = String(item.pessoaNome || '').trim().toLowerCase();
      if (nome) mapaExistentes[nome] = true;
    });

    let loteSelecionado = null;
    if (loteId) {
      console.log('🎟️ Carregando lote selecionado...');
      const lotes = (await portalListarLotesEvento(eventoId)) || [];
      loteSelecionado = lotes.find(l => String(l.id) === loteId) || null;
      if (!loteSelecionado) {
        return { sucesso: false, erro: 'Lote selecionado não encontrado.' };
      }
      // Contagem em tempo real para evitar ultrapassar o limite do lote
      const usadosReais = await portalContarInscricoesPorLote(loteId);
      const restantesInicial = (loteSelecionado.quantidadeTotal || 0) - usadosReais;
      if (loteSelecionado.ativo === false || restantesInicial <= 0) {
        return { sucesso: false, erro: 'Lote selecionado indisponível.' };
      }
      if (typeof portalLoteDentroVigencia === 'function' && !portalLoteDentroVigencia(loteSelecionado)) {
        return { sucesso: false, erro: 'Lote selecionado fora do período de vigência (horário de Brasília).' };
      }
      // Se houver mais pessoas que vagas: as que couberem serão inscritas; o restante fica pendente (troca de lote/cancelamento).
    }

    let restantes = loteSelecionado
      ? ((loteSelecionado.quantidadeTotal || 0) - await portalContarInscricoesPorLote(loteId))
      : null;

    let sucesso = 0;
    let falhas = 0;
    let excedeuLote = 0;
    const erros = [];
    const inscricoesCriadas = []; // inscrições realizadas (para e-mail com lista e passaportes)
    const pendentesParaCriar = []; // pessoas sem vaga no lote: ficam pendentes (troca de lote/cancelamento)
    let envio = null;
    let comprovanteRegistrado = false;

    for (const pessoa of pessoas) {
      const nome = String(pessoa.nome || '').trim();
      if (!nome) {
        falhas++;
        erros.push('Pessoa sem nome informada.');
        continue;
      }
      const chave = nome.toLowerCase();
      if (mapaExistentes[chave]) {
        falhas++;
        erros.push(`Já inscrito: ${nome}`);
        continue;
      }
      if (restantes !== null && restantes <= 0) {
        excedeuLote++;
        if (loteId) {
          if (!envio) {
            envio = await portalCriarEnvioEvento({
              eventoId: eventoId,
              clubeNome: clubeNome,
              clubeId: dados.clubeId || null
            });
            if (!envio || !envio.id) {
              erros.push(nome + ': envio não criado (lote cheio).');
              continue;
            }
            if (!comprovanteRegistrado && comprovanteInfo && comprovanteInfo.sucesso) {
              await portalCriarComprovanteEnvio({
                envioId: envio.id,
                comprovanteUrl: comprovanteInfo.url,
                comprovanteNome: comprovanteInfo.nomeArquivo || dados.comprovanteNome,
                comprovanteMime: comprovanteInfo.tipo || dados.comprovanteMime,
                comprovanteTamanho: comprovanteInfo.tamanho || dados.comprovanteTamanho
              });
              comprovanteRegistrado = true;
            }
          }
          if (envio && envio.id) {
            const descricaoPessoa = String(mapaRestricaoDetalhes[chave] || '').trim();
            const temRestricao = restricao && !!mapaRestricao[chave];
            const ehGD = String(clubeNome || '').toLowerCase().indexOf('gabinete distrital') >= 0;
            const clubeOrigemPessoa = (ehGD && (pessoa.clubeOrigemNome || dados.clubeOrigemNome))
              ? String(pessoa.clubeOrigemNome || dados.clubeOrigemNome).trim() : null;
            const clubeOrigemIdPessoa = (ehGD && (pessoa.clubeOrigemId || dados.clubeOrigemId))
              ? String(pessoa.clubeOrigemId || dados.clubeOrigemId).trim() : null;
            pendentesParaCriar.push({
              eventoId: eventoId,
              envioId: envio.id,
              pessoaNome: nome,
              pessoaTipo: pessoa.tipo || '',
              clubeNome: clubeNome,
              clubeId: clubeOrigemIdPessoa || dados.clubeId || null,
              clubeOrigemId: clubeOrigemIdPessoa,
              clubeOrigemNome: clubeOrigemPessoa,
              loteIdSolicitado: loteId,
              restricaoAlimentar: temRestricao,
              restricaoDescricao: temRestricao ? (descricaoPessoa || restricaoDescricao) : ''
            });
          }
        }
        continue;
      }

      try {
        if (!envio) {
          envio = await portalCriarEnvioEvento({
            eventoId: eventoId,
            clubeNome: clubeNome,
            clubeId: dados.clubeId || null
          });
          if (!envio || !envio.id) {
            throw new Error('Erro ao criar envio.');
          }
          if (!comprovanteRegistrado && comprovanteInfo && comprovanteInfo.sucesso) {
            await portalCriarComprovanteEnvio({
              envioId: envio.id,
              comprovanteUrl: comprovanteInfo.url,
              comprovanteNome: comprovanteInfo.nomeArquivo || dados.comprovanteNome,
              comprovanteMime: comprovanteInfo.tipo || dados.comprovanteMime,
              comprovanteTamanho: comprovanteInfo.tamanho || dados.comprovanteTamanho
            });
            comprovanteRegistrado = true;
          }
        }
        const descricaoPessoa = String(mapaRestricaoDetalhes[chave] || '').trim();
        const temRestricao = restricao && !!mapaRestricao[chave];
        const ehGD = String(clubeNome || '').toLowerCase().indexOf('gabinete distrital') >= 0;
        const clubeOrigemPessoa = (ehGD && (pessoa.clubeOrigemNome || dados.clubeOrigemNome))
          ? String(pessoa.clubeOrigemNome || dados.clubeOrigemNome).trim() : null;
        const clubeOrigemIdPessoa = (ehGD && (pessoa.clubeOrigemId || dados.clubeOrigemId))
          ? String(pessoa.clubeOrigemId || dados.clubeOrigemId).trim() : null;
        const payload = {
          eventoId: eventoId,
          envioId: envio.id,
          clubeNome: clubeNome,
          clubeId: clubeOrigemIdPessoa || dados.clubeId || null,
          clubeOrigemId: clubeOrigemIdPessoa,
          clubeOrigemNome: clubeOrigemPessoa,
          pessoaNome: nome,
          pessoaTipo: pessoa.tipo || '',
          tipoInscricao: loteSelecionado ? (loteSelecionado.nomeLote || '') : '',
          loteId: loteId,
          restricaoAlimentar: temRestricao,
          restricaoDescricao: temRestricao ? (descricaoPessoa || restricaoDescricao) : '',
          comprovanteUrl: null,
          comprovanteNome: null,
          comprovanteMime: null,
          comprovanteTamanho: null
        };
        const resultado = await portalCriarInscricaoEvento(payload);
        if (!resultado) {
          throw new Error('Nenhuma resposta ao criar inscrição');
        }
        sucesso++;
        inscricoesCriadas.push({
          inscricaoId: resultado.id,
          pessoaNome: resultado.pessoaNome,
          pessoaTipo: resultado.pessoaTipo || '',
          clubeNome: resultado.clubeNome || clubeNome
        });
        mapaExistentes[chave] = true;
        if (restantes !== null) restantes--;
      } catch (error) {
        falhas++;
        erros.push(`${nome}: ${error.message}`);
      }
    }

    const pendentesCriados = [];
    if (pendentesParaCriar.length > 0) {
      for (const pend of pendentesParaCriar) {
        try {
          const res = await portalCriarInscricaoEvento({
            eventoId: pend.eventoId,
            envioId: pend.envioId,
            clubeNome: pend.clubeNome,
            clubeId: pend.clubeId,
            clubeOrigemId: pend.clubeOrigemId,
            clubeOrigemNome: pend.clubeOrigemNome,
            pessoaNome: pend.pessoaNome,
            pessoaTipo: pend.pessoaTipo,
            tipoInscricao: loteSelecionado ? (loteSelecionado.nomeLote || '') : '',
            loteId: pend.loteIdSolicitado,
            restricaoAlimentar: false,
            restricaoDescricao: '',
            status: 'pendente'
          });
          if (res) pendentesCriados.push(res);
        } catch (errPend) {
          console.warn('Erro ao salvar pendente:', pend.pessoaNome, errPend);
          erros.push('Pendente ' + pend.pessoaNome + ': ' + (errPend.message || errPend));
        }
      }
    }

    const eventosList = (await portalListarEventos()) || [];
    const ev = eventosList.find(e => String(e.id) === String(eventoId));
    const eventoNome = (dados.eventoNome && String(dados.eventoNome).trim()) || (ev && ev.nome) || '';
    const loteNome = (dados.loteNome && String(dados.loteNome).trim()) || (loteSelecionado ? (loteSelecionado.nomeLote || '') : '') || '';
    if ((sucesso > 0 || pendentesParaCriar.length > 0) && (eventoNome || eventoId)) {
      try {
        await enviarEmailResumoInscricoesEvento(
          eventoId,
          eventoNome || eventoId,
          loteNome,
          clubeNome,
          { sucesso: sucesso, falhas: falhas, excedeuLote: excedeuLote, pendentes: pendentesParaCriar.length, pendentesLista: pendentesParaCriar.map(p => p.pessoaNome), erros: erros, inscricoesCriadas: inscricoesCriadas },
          dados.emailDestino || null
        );
      } catch (errEmail) {
        console.warn('Erro ao enviar email de resumo:', errEmail);
      }
    }

    // Envio automático de passaportes por e-mail (quando habilitado no evento)
    if (sucesso > 0 && ev && ev.eventoTeraPassaportes && ev.enviarPassaportePorEmail && inscricoesCriadas.length > 0) {
      try {
        var emailDestinoClube = '';
        if (typeof obterEmailClubeSupabase === 'function') {
          emailDestinoClube = String((await obterEmailClubeSupabase(clubeNome)) || '').trim();
        }
        await criarRascunhoEmailPassaportesClube(
          eventoId,
          eventoNome || eventoId,
          clubeNome,
          inscricoesCriadas,
          emailDestinoClube || null,
          (ev && ev.fotoUrl) ? String(ev.fotoUrl).trim() : ''
        );
      } catch (errPassaporteAuto) {
        console.warn('Erro no envio automático de passaportes:', errPassaporteAuto);
      }
    }

    console.log('✅ Fim registrarInscricoesEventoEmLote', { sucesso, falhas, excedeuLote, pendentes: pendentesParaCriar.length });
    return {
      sucesso: true,
      resultado: {
        sucesso: sucesso,
        falhas: falhas,
        excedeuLote: excedeuLote,
        pendentes: pendentesParaCriar.length,
        pendentesLista: pendentesParaCriar.map(p => p.pessoaNome),
        pendentesCriados: pendentesCriados,
        erros: erros
      }
    };
  } catch (error) {
    console.error('Erro ao registrar inscrições em lote:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Wrapper público: comprovante apenas em base64 (payload pode estourar limite com PDFs grandes).
 * @param {Object} dados
 * @return {Object}
 */
async function registrarInscricoesEventoEmLote(dados) {
  return await registrarInscricoesEventoEmLoteInterno_(dados, null);
}

/**
 * Inscrições em lote com comprovante como arquivo (único parâmetro = form).
 * Documentação Apps Script: arquivo vira Blob no servidor, sem limite prático do base64 no google.script.run.
 * @param {Object} formObject - Resultado do envio do formulário (campos nomeados + file name="comprovante").
 * @return {Object}
 */
async function registrarInscricoesEventoEmLoteComForm(formObject) {
  try {
    if (!formObject) {
      return { sucesso: false, erro: 'Formulário não enviado.' };
    }
    const raw = formObject.payloadJson;
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return { sucesso: false, erro: 'Dados da inscrição ausentes (payloadJson).' };
    }
    const dados = JSON.parse(String(raw));
    const blobComp = formObject.comprovante;
    return await registrarInscricoesEventoEmLoteInterno_(dados, blobComp);
  } catch (error) {
    console.error('registrarInscricoesEventoEmLoteComForm:', error);
    return { sucesso: false, erro: error.message || 'Erro ao processar formulário de inscrição.' };
  }
}

/**
 * Gerar relatório de inscritos do evento em Excel (XLSX)
 * - Aba "Resumo" com totais e valores por clube/lote
 * - Uma aba por clube com dados completos (RTMA/Amigos)
 * @param {string} eventoId
 * @return {Object} Resultado com downloadUrl
 */
async function gerarRelatorioInscritosEventoExcel(eventoId) {
  try {
    if (!eventoId) {
      return { sucesso: false, erro: 'Evento não informado.' };
    }

    const eventos = (typeof portalListarEventos === 'function') ? await portalListarEventos() : [];
    const evento = (eventos || []).find(e => String(e.id) === String(eventoId)) || {};
    const inscricoes = (typeof portalListarInscricoesEvento === 'function') ? await portalListarInscricoesEvento(eventoId) : [];

    if (!inscricoes || inscricoes.length === 0) {
      return { sucesso: false, erro: 'Nenhuma inscrição encontrada para este evento.' };
    }

    const nomeArquivoBase = `Relatorio_Inscritos_${(evento.nome || 'Evento')}`.replace(/[^\w\- ]/g, '').trim() || 'Relatorio_Inscritos';
    const ss = SpreadsheetApp.create(nomeArquivoBase);
    const resumoSheet = ss.getActiveSheet();
    resumoSheet.setName('Resumo');

    const formatarData = (data) => {
      if (!data) return '';
      try {
        const d = new Date(data);
        return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy');
      } catch (e) {
        return String(data);
      }
    };

    // Agrupar por clube e por lote
    const porClube = {};
    const totaisPorClubeLote = {};
    inscricoes.forEach(inscricao => {
      const clube = inscricao.clubeNome || 'Sem clube';
      const lote = inscricao.loteNome || inscricao.tipoInscricao || 'Sem lote';
      if (!porClube[clube]) porClube[clube] = [];
      porClube[clube].push(inscricao);

      if (!totaisPorClubeLote[clube]) totaisPorClubeLote[clube] = {};
      if (!totaisPorClubeLote[clube][lote]) {
        totaisPorClubeLote[clube][lote] = { qtd: 0, valor: inscricao.valorLote || 0 };
      }
      totaisPorClubeLote[clube][lote].qtd += 1;
      if (inscricao.valorLote !== undefined && inscricao.valorLote !== null) {
        totaisPorClubeLote[clube][lote].valor = Number(inscricao.valorLote) || 0;
      }
    });

    // Construir resumo
    const resumoData = [];
    resumoData.push(['Relatório de Inscritos por Clube']);
    resumoData.push([`Evento: ${evento.nome || eventoId}`]);
    if (evento.dataInicio || evento.dataFim) {
      resumoData.push([`Período: ${formatarData(evento.dataInicio)} até ${formatarData(evento.dataFim)}`]);
    } else if (evento.dataEvento) {
      resumoData.push([`Data: ${formatarData(evento.dataEvento)}`]);
    }
    resumoData.push([`Total de inscritos: ${inscricoes.length}`]);
    resumoData.push([]);
    resumoData.push(['Clube', 'Lote', 'Qtd', 'Valor Unitário', 'Valor Total']);

    const clubesOrdenados = Object.keys(totaisPorClubeLote).sort();
    let totalGeral = 0;
    clubesOrdenados.forEach(clube => {
      const lotes = totaisPorClubeLote[clube];
      Object.keys(lotes).sort().forEach(lote => {
        const item = lotes[lote];
        const valorTotal = (item.qtd || 0) * (item.valor || 0);
        totalGeral += valorTotal;
        resumoData.push([clube, lote, item.qtd || 0, item.valor || 0, valorTotal]);
      });
    });
    resumoData.push([]);
    resumoData.push(['Total geral (R$)', '', '', '', totalGeral]);

    resumoSheet.getRange(1, 1, resumoData.length, 5).setValues(resumoData);
    resumoSheet.getRange(1, 1, 1, 1).setFontWeight('bold').setFontSize(14);
    resumoSheet.getRange(6, 1, 1, 5).setFontWeight('bold');
    resumoSheet.getRange(6, 1, resumoData.length - 5, 5).setHorizontalAlignment('left');
    resumoSheet.setFrozenRows(6);
    resumoSheet.autoResizeColumns(1, 5);

    // Criar abas por clube
    const nomesAbasUsados = {};
    const gerarNomeAba = (nome) => {
      const base = String(nome || 'Clube').substring(0, 25).trim() || 'Clube';
      let candidato = base;
      let idx = 1;
      while (nomesAbasUsados[candidato]) {
        candidato = `${base.substring(0, 20)}_${idx}`;
        idx++;
      }
      nomesAbasUsados[candidato] = true;
      return candidato;
    };

    const normalizarContatoAmigo = (amigo) => {
      if (!amigo) return { email: '', telefone: '', cidade: '' };
      const candidatosEmail = [amigo.email, amigo.telefone, amigo.logradouro];
      const candidatosTelefone = [amigo.telefone, amigo.email, amigo.logradouro];
      const email = (candidatosEmail.find(item => String(item || '').includes('@')) || '') || '';
      const telefone = (candidatosTelefone.find(item => {
        const digitos = String(item || '').replace(/\D/g, '');
        return digitos.length >= 8;
      }) || '') || '';
      const cidade = (amigo.cidade && /[A-Za-zÀ-ÿ]/.test(String(amigo.cidade))) ? amigo.cidade : '';
      return { email, telefone, cidade };
    };

    const headers = [
      'Clube',
      'Pessoa',
      'Tipo Pessoa',
      'Lote',
      'Valor Lote',
      'Restrição Alimentar',
      'Restrição (descrição)',
      'Status RTMA',
      'Tipo RTMA',
      'Cargo',
      'Email',
      'Telefone',
      'Cidade',
      'Data Nascimento',
      'Número Associado'
    ];

    var configSupabaseXls = (typeof RTMA_SUPABASE_CONFIG !== 'undefined') ? RTMA_SUPABASE_CONFIG : { url: 'https://bqkttaflhtsdkamgscnf.supabase.co', serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY };

    for (const clube of clubesOrdenados) {
      const sheet = ss.insertSheet(gerarNomeAba(clube));
      const pessoasRTMA = (typeof buscarPessoasRTMA === 'function') ? await buscarPessoasRTMA(clube, null, null, null) : [];
      const amigos = (typeof buscarAmigosConselheiros === 'function') ? await buscarAmigosConselheiros(clube, null) : [];

      const mapaRTMAPorNorm = {};
      (pessoasRTMA || []).forEach(p => {
        if (p && p.nome) mapaRTMAPorNorm[_normalizarNomeParaComparacao(p.nome)] = p;
      });
      const mapaAmigosPorNorm = {};
      (amigos || []).forEach(a => {
        if (a && a.nome) mapaAmigosPorNorm[_normalizarNomeParaComparacao(a.nome)] = a;
      });

      var clubesNominataSet = {};
      clubesNominataSet[clube] = true;
      if (String(clube).toLowerCase().indexOf('gabinete distrital') >= 0) {
        (porClube[clube] || []).forEach(function (insc) {
          var o = (insc.clubeOrigemNome || insc.clube_origem_nome || '').trim();
          if (o) clubesNominataSet[o] = true;
        });
      }
      var mapaCargosPorClube = {};
      for (const cn of Object.keys(clubesNominataSet)) {
        var mc = (typeof _obterMapaCargosNominataClubeAlMult === 'function')
          ? await _obterMapaCargosNominataClubeAlMult(cn, AL_NOMINATA_RELATORIO_EVENTOS, configSupabaseXls)
          : {};
        mapaCargosPorClube[cn] = mc || {};
      }

      const linhas = (porClube[clube] || []).map(inscricao => {
        const nome = String(inscricao.pessoaNome || '').trim();
        const nomeNorm = _normalizarNomeParaComparacao(nome);
        const pessoaRTMA = mapaRTMAPorNorm[nomeNorm];
        const pessoaAmigo = mapaAmigosPorNorm[nomeNorm];
        const tipoInscricao = String(inscricao.pessoaTipo || '').toLowerCase();
        const ehAmigo = tipoInscricao.includes('amigo') || tipoInscricao.includes('conselheiro');
        const contatoAmigo = ehAmigo && pessoaAmigo ? normalizarContatoAmigo(pessoaAmigo) : { email: '', telefone: '', cidade: '' };
        const usarRTMA = !ehAmigo && pessoaRTMA;
        var tipoRTMAVal = usarRTMA ? (pessoaRTMA.tipo || '') : (pessoaAmigo ? (pessoaAmigo.tipo || '') : '');
        var clubeNominata = clube;
        if (String(clube).toLowerCase().indexOf('gabinete distrital') >= 0) {
          var orig = (inscricao.clubeOrigemNome || inscricao.clube_origem_nome || '').trim();
          if (orig) clubeNominata = orig;
        }
        var mapaCargoLinha = mapaCargosPorClube[clubeNominata] || {};
        var cargoFinal = mapaCargoLinha[nomeNorm] || '';
        cargoFinal = cargoFinal ? _unificarSeparadoresCargoExcel(cargoFinal) : '';
        if (!cargoFinal || !String(cargoFinal).trim()) cargoFinal = String(tipoRTMAVal || inscricao.pessoaTipo || '').trim();
        return [
          clube,
          nome,
          inscricao.pessoaTipo || (pessoaRTMA && pessoaRTMA.tipo) || (pessoaAmigo && pessoaAmigo.tipo) || '',
          inscricao.loteNome || inscricao.tipoInscricao || '',
          inscricao.valorLote || 0,
          inscricao.restricaoAlimentar ? 'Sim' : 'Não',
          inscricao.restricaoDescricao || '',
          usarRTMA ? (pessoaRTMA.status || '') : '',
          tipoRTMAVal,
          cargoFinal,
          usarRTMA ? (pessoaRTMA.email || '') : (contatoAmigo.email || ''),
          usarRTMA ? (pessoaRTMA.telefone || '') : (contatoAmigo.telefone || ''),
          usarRTMA ? (pessoaRTMA.cidade || '') : (contatoAmigo.cidade || ''),
          pessoaRTMA ? (pessoaRTMA.data_nascimento || '') : (pessoaAmigo ? (pessoaAmigo.data_nascimento || '') : ''),
          pessoaRTMA ? (pessoaRTMA.numero_associado || '') : ''
        ];
      });

      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      if (linhas.length > 0) {
        sheet.getRange(2, 1, linhas.length, headers.length).setValues(linhas);
      }
      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, headers.length);
    }

    const arquivoSheet = DriveApp.getFileById(ss.getId());
    const blob = arquivoSheet.getAs(MimeType.MICROSOFT_EXCEL).setName(`${nomeArquivoBase}.xlsx`);
    const arquivoExcel = DriveApp.createFile(blob);
    arquivoExcel.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const downloadUrl = 'https://drive.google.com/uc?export=download&id=' + arquivoExcel.getId();
    arquivoSheet.setTrashed(true);

    return {
      sucesso: true,
      arquivo: {
        id: arquivoExcel.getId(),
        nome: arquivoExcel.getName(),
        downloadUrl: downloadUrl
      }
    };
  } catch (error) {
    console.error('Erro ao gerar relatório Excel de inscritos:', error);
    return { sucesso: false, erro: error.message };
  }
}

async function excluirInscricoesEventoPorEnvio(eventoId, clubeNome, comprovanteUrl) {
  try {
    const ok = await portalExcluirInscricoesEventoPorEnvio(eventoId, clubeNome, comprovanteUrl);
    return { sucesso: !!ok };
  } catch (error) {
    console.error('Erro ao excluir inscrições por envio:', error);
    return { sucesso: false, erro: error.message };
  }
}

async function editarLoteEnvioInscricoes(eventoId, clubeNome, comprovanteUrl, comprovanteNome, comprovanteTamanho, novoLoteId, permitirExceder) {
  try {
    const resultado = await portalAtualizarInscricoesEnvioLote(
      eventoId,
      clubeNome,
      comprovanteUrl,
      comprovanteNome,
      comprovanteTamanho,
      novoLoteId,
      permitirExceder === true
    );
    return { sucesso: true, resultado: resultado };
  } catch (error) {
    console.error('Erro ao editar lote do envio:', error);
    return { sucesso: false, erro: error.message };
  }
}

async function obterDetalhesEnvioEvento(envioId) {
  try {
    if (!envioId) {
      return { sucesso: false, erro: 'Envio não informado.' };
    }
    const envio = await portalBuscarEnvioEvento(envioId);
    if (!envio) {
      return { sucesso: false, erro: 'Envio não encontrado.' };
    }
    const inscricoes = (await portalListarInscricoesEnvio(envioId)) || [];
    const comprovantes = (await portalListarComprovantesEnvio(envioId)) || [];
    return { sucesso: true, envio: envio, inscricoes: inscricoes, comprovantes: comprovantes };
  } catch (error) {
    console.error('Erro ao obter detalhes do envio:', error);
    return { sucesso: false, erro: error.message };
  }
}

async function atualizarInscricoesEnvioLotes(dados) {
  try {
    console.log('📦 atualizarInscricoesEnvioLotes: inicio', {
      envioId: dados && dados.envioId,
      totalAtualizacoes: (dados && dados.atualizacoes && dados.atualizacoes.length) || 0,
      novoClubeNome: dados && dados.novoClubeNome
    });
    if (!dados || !dados.envioId) {
      return { sucesso: false, erro: 'Envio não informado.' };
    }
    const atualizacoes = Array.isArray(dados.atualizacoes) ? dados.atualizacoes : [];
    const permitirExceder = !!dados.permitirExceder;
    const envio = await portalBuscarEnvioEvento(dados.envioId);
    if (!envio || !envio.eventoId) {
      return { sucesso: false, erro: 'Envio inválido.' };
    }
    const novoClubeNome = String(dados.novoClubeNome || '').trim();
    const clubeAtualNome = String(envio.clubeNome || '').trim();
    const clubeFoiAlterado = !!(novoClubeNome && novoClubeNome !== clubeAtualNome);
    if (atualizacoes.length === 0 && !clubeFoiAlterado) {
      return { sucesso: false, erro: 'Nenhuma atualização informada.' };
    }
    const inscricoes = (await portalListarInscricoesEnvio(dados.envioId)) || [];
    const mapaInscricoes = {};
    inscricoes.forEach(item => {
      if (item && item.id) mapaInscricoes[item.id] = item;
    });
    const lotes = (await portalListarLotesEvento(envio.eventoId)) || [];
    const lotesMap = {};
    lotes.forEach(lote => {
      if (lote && lote.id) lotesMap[lote.id] = lote;
    });

    const deltaPorLote = {};
    let faltantes = 0;
    atualizacoes.forEach(atualizacao => {
      const inscricao = mapaInscricoes[atualizacao.inscricaoId];
      if (!inscricao) {
        console.warn('atualizarInscricoesEnvioLotes: inscricao não encontrada', {
          envioId: dados.envioId,
          inscricaoId: atualizacao.inscricaoId
        });
        faltantes++;
        return;
      }
      const loteAtualId = String(inscricao.loteId || '').trim();
      const novoLoteId = String(atualizacao.novoLoteId || '').trim();
      if (!novoLoteId || !lotesMap[novoLoteId] || novoLoteId === loteAtualId) return;
      deltaPorLote[loteAtualId] = (deltaPorLote[loteAtualId] || 0) - 1;
      deltaPorLote[novoLoteId] = (deltaPorLote[novoLoteId] || 0) + 1;
    });

    const usadosMap = {};
    for (const loteId of Object.keys(deltaPorLote)) {
      if (!loteId) continue;
      usadosMap[loteId] = (await portalContarInscricoesPorLote(loteId)) || 0;
    }

    const erros = [];
    Object.keys(deltaPorLote).forEach(loteId => {
      const delta = deltaPorLote[loteId] || 0;
      if (delta <= 0) return;
      const lote = lotesMap[loteId];
      if (!lote) return;
      if (typeof portalLoteDentroVigencia === 'function' && !portalLoteDentroVigencia(lote)) {
        erros.push(`Lote ${lote.nomeLote || lote.nome_lote || loteId} fora do período de vigência (horário de Brasília).`);
        return;
      }
      const total = lote.quantidadeTotal || 0;
      const usados = usadosMap[loteId] || 0;
      const restante = total - (usados + delta);
      if (!permitirExceder && (lote.ativo === false || restante < 0)) {
        erros.push(`Lote ${lote.nomeLote || lote.nome_lote || loteId} sem vagas suficientes.`);
      }
    });
    if (erros.length > 0) {
      return { sucesso: false, erro: erros.join(' ') };
    }

    let atualizados = 0;
    const lotesAfetados = {};
    for (const atualizacao of atualizacoes) {
      const inscricao = mapaInscricoes[atualizacao.inscricaoId];
      if (!inscricao) continue;
      const loteAtualId = String(inscricao.loteId || '').trim();
      const novoLoteId = String(atualizacao.novoLoteId || '').trim();
      if (!novoLoteId || !lotesMap[novoLoteId] || novoLoteId === loteAtualId) continue;
      const lote = lotesMap[novoLoteId];
      await portalAtualizarInscricaoEvento(inscricao.id, {
        loteId: lote.id,
        loteNome: lote.nomeLote || lote.nome_lote || '',
        tipoInscricao: lote.nomeLote || lote.nome_lote || '',
        valorLote: lote.valor || 0
      });
      lotesAfetados[loteAtualId] = true;
      lotesAfetados[novoLoteId] = true;
      atualizados++;
    }

    if (clubeFoiAlterado) {
      const novoClubeId = (typeof portalResolverClubeIdPorNome === 'function')
        ? ((await portalResolverClubeIdPorNome(novoClubeNome)) || null)
        : null;
      if (typeof portalAtualizarEnvioEvento === 'function') {
        await portalAtualizarEnvioEvento(dados.envioId, { clubeNome: novoClubeNome, clubeId: novoClubeId });
      }
      for (const inscricao of inscricoes) {
        if (!inscricao || !inscricao.id) continue;
        await portalAtualizarInscricaoEvento(inscricao.id, {
          clubeNome: novoClubeNome,
          clubeId: novoClubeId
        });
      }
    }

    for (const loteId of Object.keys(lotesAfetados)) {
      if (!loteId) continue;
      await portalRecalcularQuantidadeUsadaLote(loteId);
    }

    if (faltantes > 0) {
      return {
        sucesso: false,
        erro: `Algumas inscrições não foram encontradas no envio (${faltantes}). Recarregue o relatório e tente novamente.`
      };
    }
    console.log('✅ atualizarInscricoesEnvioLotes: fim', { atualizados: atualizados, clubeFoiAlterado: clubeFoiAlterado });
    return { sucesso: true, atualizados: atualizados, clubeFoiAlterado: clubeFoiAlterado };
  } catch (error) {
    console.error('Erro ao atualizar inscrições do envio:', error);
    return { sucesso: false, erro: error.message };
  }
}

async function trocarInscricaoEvento(dados) {
  try {
    if (!dados || !dados.eventoId || !dados.inscricaoId || !dados.pessoaNome) {
      return { sucesso: false, erro: 'Evento, inscrição e pessoa são obrigatórios.' };
    }
    const pessoaExterna = !!dados.pessoaExterna;
    if (!pessoaExterna && !dados.clubeNome) {
      return { sucesso: false, erro: 'Clube é obrigatório para pessoas cadastradas no RTMA.' };
    }
    const eventoId = String(dados.eventoId || '').trim();
    const inscricaoId = String(dados.inscricaoId || '').trim();
    const clubeNome = String(dados.clubeNome || '').trim();
    const pessoaNome = String(dados.pessoaNome || '').trim();
    const pessoaTipo = String(dados.pessoaTipo || '').trim();
    if (!eventoId || !inscricaoId || !pessoaNome || (!pessoaExterna && !clubeNome)) {
      return { sucesso: false, erro: 'Dados obrigatórios inválidos.' };
    }

    const eventos = (typeof portalListarEventos === 'function') ? await portalListarEventos() : [];
    const evento = (eventos || []).find(e => String(e.id) === String(eventoId));
    if (evento && evento.aceitarTrocas !== true) {
      return { sucesso: false, erro: 'Esse evento não está aceitando trocas de inscrições.' };
    }

    const inscricoes = await portalListarInscricoesEvento(eventoId) || [];
    const nomeLower = pessoaNome.toLowerCase();
    const duplicada = inscricoes.find(item => {
      const nome = String(item.pessoaNome || '').trim().toLowerCase();
      const id = String(item.id || '').trim();
      return nome === nomeLower && id !== inscricaoId;
    });
    if (duplicada) {
      return { sucesso: false, erro: 'Essa pessoa já está inscrita neste evento.' };
    }
    const atual = inscricoes.find(item => String(item.id || '').trim() === inscricaoId) || null;
    if (!atual) {
      return { sucesso: false, erro: 'Inscrição não encontrada.' };
    }

    let clubeId = dados.clubeId || null;
    if (!clubeId && typeof obterMapaClubesSupabase === 'function') {
      try {
        const clubesMap = await obterMapaClubesSupabase();
        clubeId = clubesMap ? (clubesMap[clubeNome] || null) : null;
      } catch (e) {
        console.warn('trocarInscricaoEvento: falha ao obter clubeId', e);
      }
    }

    try {
      if (typeof portalCriarSolicitacaoAlteracao === 'function') {
        const solicitacao = await portalCriarSolicitacaoAlteracao({
          tipo: 'troca',
          tipoItem: 'inscricao_evento',
          itemId: inscricaoId,
          clubeNome: atual.clubeNome || '',
          usuarioEmail: dados.usuarioEmail || '',
          status: 'pendente',
          justificativa: 'Troca de inscrição solicitada pelo clube.',
          dadosAnteriores: atual ? {
            clubeNome: atual.clubeNome || '',
            pessoaNome: atual.pessoaNome || '',
            pessoaTipo: atual.pessoaTipo || '',
            eventoId: eventoId
          } : { eventoId: eventoId },
          dadosNovos: {
            clubeDestino: clubeNome,
            pessoaNome: pessoaNome,
            pessoaTipo: pessoaTipo || '',
            eventoId: eventoId,
            inscricaoId: inscricaoId,
            ...(pessoaExterna ? {
              pessoaExterna: true,
              pessoaCargo: String(dados.pessoaCargo || '').trim(),
              pessoaRepresentaClube: !!dados.pessoaRepresentaClube,
              pessoaClubeD8: String(dados.pessoaClubeD8 || '').trim(),
              pessoaRepresentacao: String(dados.pessoaRepresentacao || '').trim(),
              pessoaRestricaoAlimentar: String(dados.pessoaRestricaoAlimentar || '').trim()
            } : {})
          }
        });
        if (!solicitacao) {
          return { sucesso: false, erro: 'Falha ao criar solicitação de troca.' };
        }
      }
    } catch (e) {
      console.warn('trocarInscricaoEvento: falha ao registrar troca', e);
      const msg = (e && e.message) ? e.message : String(e);
      return { sucesso: false, erro: `Erro ao registrar solicitação de troca: ${msg}` };
    }
    return {
      sucesso: true,
      pendente: true,
      mensagem: pessoaExterna
        ? 'Solicitação de troca para pessoa externa registrada. Aprove na aba Aprovações › Trocas.'
        : 'Solicitação enviada para aprovação do clube que receberá a inscrição.'
    };
  } catch (error) {
    console.error('Erro ao trocar inscrição do evento:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Atualiza a carga de refeições (passaporte) de uma inscrição.
 * Chamada pelo portal com google.script.run.
 * @param {string} inscricaoId - UUID da inscrição
 * @param {Object} carga - Ex.: { cafe: 3, almoco: 2, jantar: 2 }
 * @param {boolean} zerarUsado - Se true, zera o uso consumido
 * @returns {Object|null} Inscrição atualizada ou null
 */
async function atualizarCargaRefeicoesPassaporte(inscricaoId, carga, zerarUsado) {
  try {
    if (typeof portalAtualizarCargaRefeicoesInscricao !== 'function') {
      throw new Error('Função de passaporte não disponível.');
    }
    return await portalAtualizarCargaRefeicoesInscricao(inscricaoId, carga || {}, zerarUsado === true);
  } catch (e) {
    console.error('atualizarCargaRefeicoesPassaporte:', e);
    throw e;
  }
}

/**
 * Aplica a mesma carga de refeições a todos os inscritos do evento.
 * @param {string} eventoId - UUID do evento
 * @param {Object} carga - Ex.: { cafe: 3, almoco: 2, jantar: 2 }
 * @param {boolean} zerarUsado - Se true, zera o uso consumido em cada inscrição
 * @returns {Object} { atualizados: number, erros: string[] }
 */
async function atualizarCargaRefeicoesLotePassaporte(eventoId, carga, zerarUsado) {
  try {
    if (typeof portalAtualizarCargaRefeicoesLote !== 'function') {
      throw new Error('Função de passaporte em lote não disponível.');
    }
    return await portalAtualizarCargaRefeicoesLote(eventoId, carga || {}, zerarUsado === true);
  } catch (e) {
    console.error('atualizarCargaRefeicoesLotePassaporte:', e);
    throw e;
  }
}

/**
 * Consome uma refeição para a inscrição (chamado pelo scanner QR).
 * Chamada pelo portal ou pela página do scanner com google.script.run.
 * @param {string} inscricaoId - UUID da inscrição (lido do QR)
 * @param {string} eventoId - UUID do evento
 * @param {string} tipoRefeicao - Ex.: 'cafe', 'almoco', 'jantar'
 * @returns {Object} { ok: boolean, pessoaNome?: string, saldoRestante?: Object, erro?: string }
 */
async function consumirRefeicaoPassaporte(inscricaoId, eventoId, tipoRefeicao) {
  try {
    if (typeof portalConsumirRefeicaoInscricao !== 'function') {
      return { ok: false, erro: 'Função de passaporte não disponível.' };
    }
    return await portalConsumirRefeicaoInscricao(inscricaoId, eventoId, tipoRefeicao);
  } catch (e) {
    console.error('consumirRefeicaoPassaporte:', e);
    return { ok: false, erro: (e && e.message) ? e.message : 'Erro ao consumir refeição.' };
  }
}

/**
 * Valida se a inscrição tem saldo para o tipo de refeição (não consome).
 * Usado pelo scanner para feedback imediato antes de adicionar à fila.
 * @param {string} inscricaoId - UUID da inscrição
 * @param {string} eventoId - UUID do evento
 * @param {string} tipoRefeicao - Ex.: 'cafe', 'almoco', 'jantar'
 * @returns {Object} { ok, pessoaNome?, saldoRestante?, erro? }
 */
async function validarSaldoRefeicaoPassaporte(inscricaoId, eventoId, tipoRefeicao) {
  try {
    if (typeof portalValidarSaldoRefeicaoInscricao !== 'function') {
      return { ok: false, erro: 'Função não disponível.' };
    }
    return await portalValidarSaldoRefeicaoInscricao(inscricaoId, eventoId, tipoRefeicao);
  } catch (e) {
    console.error('validarSaldoRefeicaoPassaporte:', e);
    return { ok: false, erro: (e && e.message) ? e.message : 'Erro ao validar.' };
  }
}

/**
 * Carrega cache de saldo de refeições para validação no scanner (uma única chamada).
 * Retorna mapa inscricaoId -> { cafe, almoco, jantar, pessoaNome } com saldos.
 * O frontend armazena em localStorage e valida localmente sem novas consultas.
 * @param {string} eventoId
 * @returns {Object} { mapaSaldo: Object, timestamp: number }
 */
async function obterCacheValidacaoAlimentacao(eventoId) {
  try {
    var mapaSaldo = {};
    var inscricoes = (typeof portalListarInscricoesEvento === 'function') ? (await portalListarInscricoesEvento(eventoId)) : [];
    if (!inscricoes || inscricoes.length === 0) return { mapaSaldo: {}, timestamp: Date.now() };
    inscricoes.forEach(function(i) {
      var id = String(i.id || i.inscricaoId || '').trim().toLowerCase();
      if (!id) return;
      var carga = (i.refeicoesCarga && typeof i.refeicoesCarga === 'object') ? i.refeicoesCarga : (i.refeicoes_carga && typeof i.refeicoes_carga === 'object') ? i.refeicoes_carga : {};
      var usado = (i.refeicoesUsado && typeof i.refeicoesUsado === 'object') ? i.refeicoesUsado : (i.refeicoes_usado && typeof i.refeicoes_usado === 'object') ? i.refeicoes_usado : {};
      var saldo = function(tipo) {
        var t = (typeof carga[tipo] === 'number' ? carga[tipo] : parseInt(carga[tipo], 10) || 0);
        var u = (typeof usado[tipo] === 'number' ? usado[tipo] : parseInt(usado[tipo], 10) || 0);
        return Math.max(0, t - u);
      };
      mapaSaldo[id] = {
        cafe: saldo('cafe'),
        almoco: saldo('almoco'),
        jantar: saldo('jantar'),
        pessoaNome: i.pessoaNome || i.pessoa_nome || ''
      };
    });
    return { mapaSaldo: mapaSaldo, timestamp: Date.now() };
  } catch (e) {
    console.error('obterCacheValidacaoAlimentacao:', e);
    return { mapaSaldo: {}, timestamp: 0 };
  }
}

/**
 * Gera PDFs dos passaportes para uma lista de inscritos (para anexar em e-mail).
 * @param {string} eventoId - UUID do evento
 * @param {string} eventoNome - Nome do evento
 * @param {string} clubeNome - Nome do clube
 * @param {Array<{inscricaoId:string,pessoaNome:string,pessoaTipo?:string,clubeNome?:string}>} inscritos
 * @returns {Array<Blob>} Array de blobs PDF (pode ser vazio em caso de erro)
 */
async function gerarAnexosPassaportes(eventoId, eventoNome, clubeNome, inscritos) {
  var anexos = [];
  var docsParaExcluir = [];
  if (!inscritos || inscritos.length === 0) return anexos;
  try {
    for (var i = 0; i < inscritos.length; i++) {
      var ins = inscritos[i];
      var inscricaoId = String(ins.inscricaoId || '').trim();
      var pessoaNome = String(ins.pessoaNome || ins.pessoa_nome || 'Inscrito').trim() || 'Inscrito';
      var clube = String(ins.clubeNome || clubeNome || '').trim() || clubeNome;
      if (!inscricaoId) continue;
      try {
        var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(inscricaoId);
        var qrBlob = await gasStyleFetch(qrUrl, { muteHttpExceptions: true }).getBlob();
        var doc = DocumentApp.create('Passaporte_' + inscricaoId.substring(0, 8) + '_' + Date.now());
        var body = doc.getBody();
        body.clear();
        var center = DocumentApp.HorizontalAlignment.CENTER;
        var pNome = body.appendParagraph(pessoaNome);
        pNome.setAlignment(center).setBold(true).setSpacingAfter(4);
        if (pNome.getNumChildren() > 0) pNome.getChild(0).asText().setFontFamily('Arial').setFontSize(18);
        var pClube = body.appendParagraph(clube);
        pClube.setAlignment(center).setSpacingAfter(10);
        if (pClube.getNumChildren() > 0) pClube.getChild(0).asText().setFontFamily('Arial').setFontSize(12);
        var imgPara = body.appendImage(qrBlob);
        if (imgPara && imgPara.getParent) imgPara.getParent().setAlignment(center);
        body.appendParagraph('').setSpacingAfter(10);
        var pEvento = body.appendParagraph(eventoNome || 'Evento');
        pEvento.setAlignment(center).setSpacingAfter(0);
        if (pEvento.getNumChildren() > 0) pEvento.getChild(0).asText().setFontFamily('Arial').setFontSize(11);
        doc.saveAndClose();
        var pdfBlob = DriveApp.getFileById(doc.getId()).getAs('application/pdf');
        var nomeArquivo = (pessoaNome || 'passaporte').replace(/[^a-zA-Z0-9\u00C0-\u024F\s\-]/g, '_').substring(0, 80);
        pdfBlob.setName('Passaporte_' + nomeArquivo + '.pdf');
        anexos.push(pdfBlob);
        docsParaExcluir.push(doc.getId());
      } catch (ex) {
        console.warn('Erro ao gerar passaporte para ' + pessoaNome + ':', ex);
      }
    }
    for (var j = 0; j < docsParaExcluir.length; j++) {
      try { DriveApp.getFileById(docsParaExcluir[j]).setTrashed(true); } catch (e) {}
    }
  } catch (e) {
    console.warn('gerarAnexosPassaportes:', e);
  }
  return anexos;
}

/**
 * Envia e-mail de resumo das inscrições de evento para o remetente (cópia).
 * Inclui lista de pessoas inscritas com tipo, quantas ficaram pendentes e anexa os passaportes (PDF).
 * @param {string} [eventoId] - UUID do evento (para gerar passaportes)
 * @param {string} eventoNome - Nome do evento
 * @param {string} loteNome - Nome do lote
 * @param {string} clubeNome - Nome do clube
 * @param {Object} resultado - { sucesso, falhas, excedeuLote, pendentes, pendentesLista, erros, inscricoesCriadas }
 * @param {string} [emailDestino] - Se vazio, usa Session.getActiveUser().getEmail()
 * @returns {Object} { ok: boolean, enviado?: boolean, erro?: string }
 */
async function enviarEmailResumoInscricoesEvento(eventoId, eventoNome, loteNome, clubeNome, resultado, emailDestino) {
  try {
    var dest = (emailDestino && String(emailDestino).trim()) ? String(emailDestino).trim() : Session.getActiveUser().getEmail();
    if (!dest) {
      console.warn('enviarEmailResumoInscricoesEvento: nenhum e-mail de destino');
      return { ok: false, erro: 'E-mail do destinatário não disponível.' };
    }
    var sucesso = (resultado && typeof resultado.sucesso === 'number') ? resultado.sucesso : 0;
    var falhas = (resultado && typeof resultado.falhas === 'number') ? resultado.falhas : 0;
    var pendentes = (resultado && typeof resultado.pendentes === 'number') ? resultado.pendentes : 0;
    var pendentesLista = (resultado && Array.isArray(resultado.pendentesLista)) ? resultado.pendentesLista : [];
    var erros = (resultado && Array.isArray(resultado.erros)) ? resultado.erros : [];
    var inscricoesCriadas = (resultado && Array.isArray(resultado.inscricoesCriadas)) ? resultado.inscricoesCriadas : [];

    var linhas = [];
    linhas.push('Resumo do envio de inscrições');
    linhas.push('');
    linhas.push('Evento: ' + (eventoNome || 'Evento'));
    linhas.push('Lote: ' + (loteNome || ''));
    linhas.push('Clube: ' + (clubeNome || ''));
    linhas.push('');
    linhas.push('Inscrições realizadas: ' + sucesso);
    if (inscricoesCriadas.length > 0) {
      linhas.push('');
      linhas.push('Pessoas inscritas:');
      inscricoesCriadas.forEach(function(ins) {
        var nome = (ins.pessoaNome || ins.pessoa_nome || 'Inscrito').trim();
        var tipo = (ins.pessoaTipo || '').trim() || '—';
        linhas.push('  • ' + nome + ' – ' + tipo);
      });
    }
    if (pendentes > 0) {
      linhas.push('');
      linhas.push('Inscrições pendentes (sem vaga no lote): ' + pendentes);
      linhas.push('Pendentes: ' + (pendentesLista.length ? pendentesLista.join(', ') : '(lista não disponível)'));
      linhas.push('');
      linhas.push('As pendentes podem ser inseridas em outro lote ou canceladas no relatório de inscritos do evento no Portal.');
    }
    if (falhas > 0) {
      linhas.push('');
      linhas.push('Falhas: ' + falhas);
      if (erros.length > 0) {
        erros.slice(0, 10).forEach(function(e) { linhas.push('  - ' + e); });
        if (erros.length > 10) linhas.push('  ... e mais ' + (erros.length - 10) + '.');
      }
    }
    linhas.push('');
    linhas.push('Leoisticamente,');
    linhas.push('Distrito LEO LD-8');

    var corpo = linhas.join('\n');
    var assunto = 'Inscrições - ' + (eventoNome || 'Evento') + ' - ' + (clubeNome || 'Clube');
    var anexos = [];
    if (eventoId && inscricoesCriadas.length > 0 && typeof gerarAnexosPassaportes === 'function') {
      try {
        anexos = await gerarAnexosPassaportes(eventoId, eventoNome || 'Evento', clubeNome, inscricoesCriadas);
      } catch (errAnexos) {
        console.warn('Erro ao gerar passaportes para e-mail de resumo:', errAnexos);
      }
    }
    var opts = anexos.length > 0 ? { attachments: anexos } : {};
    if (typeof GmailApp !== 'undefined') {
      try {
        GmailApp.sendEmail(dest, assunto, corpo, opts);
        return { ok: true, enviado: true };
      } catch (gmailErr) {
        if (typeof MailApp !== 'undefined') {
          try {
            MailApp.sendEmail(dest, assunto, corpo, opts);
            return { ok: true, enviado: true };
          } catch (mailErr) {}
        }
      }
    } else if (typeof MailApp !== 'undefined') {
      try {
        MailApp.sendEmail(dest, assunto, corpo, opts);
        return { ok: true, enviado: true };
      } catch (mailErr) {}
    }
    return { ok: false, erro: 'Gmail/MailApp não disponível.' };
  } catch (e) {
    console.warn('enviarEmailResumoInscricoesEvento:', e);
    return { ok: false, erro: (e && e.message) ? e.message : String(e) };
  }
}

/**
 * Cria um rascunho de email no Gmail com os passaportes (PDF) dos inscritos do clube.
 * Enviado do e-mail do usuário logado (ex: presidente@leold8.org.br). Rascunho pronto com destinatário, assunto, corpo e anexos.
 * @param {string} eventoId - UUID do evento
 * @param {string} eventoNome - Nome do evento
 * @param {string} clubeNome - Nome do clube
 * @param {Array<{inscricaoId:string,pessoaNome:string,clubeNome:string}>} inscritos
 * @param {string} emailDestino - E-mail do clube (destinatário). Se vazio, usa o e-mail do usuário.
 * @param {string} [eventoFotoUrl] - URL da logo/foto do evento (opcional). Se informada, é exibida no topo do passaporte.
 * @returns {Object} { url?: string, erro?: string }
 */
async function criarRascunhoEmailPassaportesClube(eventoId, eventoNome, clubeNome, inscritos, emailDestino, eventoFotoUrl) {
  Logger.log('[Passaportes] Início - eventoId=' + eventoId + ', clube=' + clubeNome + ', inscritos=' + (inscritos ? inscritos.length : 0));
  try {
    if (!inscritos || inscritos.length === 0) {
      Logger.log('[Passaportes] ERRO: Nenhum inscrito');
      return { erro: 'Nenhum inscrito para gerar passaporte.' };
    }
    var anexos = [];
    var docsParaExcluir = [];
    for (var i = 0; i < inscritos.length; i++) {
      var ins = inscritos[i];
      var inscricaoId = String(ins.inscricaoId || '').trim();
      var pessoaNome = String(ins.pessoaNome || ins.pessoa_nome || 'Inscrito').trim() || 'Inscrito';
      var clube = String(ins.clubeNome || clubeNome || '').trim() || clubeNome;
      Logger.log('[Passaportes] Inscrito ' + (i + 1) + '/' + inscritos.length + ': ' + pessoaNome + ' (id=' + (inscricaoId ? inscricaoId.substring(0, 8) + '...' : 'vazio') + ')');
      if (!inscricaoId) {
        Logger.log('[Passaportes] Pulando - inscricaoId vazio');
        continue;
      }
      try {
        var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(inscricaoId);
        Logger.log('[Passaportes] Buscando QR para ' + pessoaNome);
        var qrBlob = await gasStyleFetch(qrUrl, { muteHttpExceptions: true }).getBlob();
        Logger.log('[Passaportes] QR ok, criando Document');
        var doc = DocumentApp.create('Passaporte_' + inscricaoId.substring(0, 8) + '_' + Date.now());
        var body = doc.getBody();
        body.clear();
        var center = DocumentApp.HorizontalAlignment.CENTER;
        var pNome = body.appendParagraph(pessoaNome);
        pNome.setAlignment(center).setBold(true).setSpacingAfter(4);
        if (pNome.getNumChildren() > 0) pNome.getChild(0).asText().setFontFamily('Arial').setFontSize(18);
        var pClube = body.appendParagraph(clube);
        pClube.setAlignment(center).setSpacingAfter(10);
        if (pClube.getNumChildren() > 0) pClube.getChild(0).asText().setFontFamily('Arial').setFontSize(12);
        var imgPara = body.appendImage(qrBlob);
        if (imgPara && imgPara.getParent) imgPara.getParent().setAlignment(center);
        body.appendParagraph('').setSpacingAfter(10);
        var pEvento = body.appendParagraph(eventoNome || 'Evento');
        pEvento.setAlignment(center).setSpacingAfter(0);
        if (pEvento.getNumChildren() > 0) pEvento.getChild(0).asText().setFontFamily('Arial').setFontSize(11);
        doc.saveAndClose();
        Logger.log('[Passaportes] Doc salvo, convertendo para PDF');
        var pdfBlob = DriveApp.getFileById(doc.getId()).getAs('application/pdf');
        var nomeArquivo = (pessoaNome || 'passaporte').replace(/[^a-zA-Z0-9\u00C0-\u024F\s\-]/g, '_').substring(0, 80);
        pdfBlob.setName('Passaporte_' + nomeArquivo + '.pdf');
        anexos.push(pdfBlob);
        docsParaExcluir.push(doc.getId());
        Logger.log('[Passaportes] PDF gerado: Passaporte_' + nomeArquivo + '.pdf');
      } catch (ex) {
        Logger.log('[Passaportes] ERRO ao gerar para ' + pessoaNome + ': ' + (ex && ex.message ? ex.message : String(ex)));
        console.warn('Erro ao gerar passaporte para ' + pessoaNome + ':', ex);
      }
    }
    Logger.log('[Passaportes] Excluindo docs temporários: ' + docsParaExcluir.length);
    for (var j = 0; j < docsParaExcluir.length; j++) {
      try { DriveApp.getFileById(docsParaExcluir[j]).setTrashed(true); } catch (e) {}
    }
    if (anexos.length === 0) {
      Logger.log('[Passaportes] ERRO: Nenhum PDF gerado');
      return { erro: 'Não foi possível gerar nenhum passaporte.' };
    }
    var corpo = 'Olá,\n\nSegue em anexo os passaportes dos inscritos pelo ' + (clubeNome || 'clube') + ' para o ' + (eventoNome || 'evento') + '.\n\nLeoisticamente,\nDistrito LEO LD-8';
    var dest = (emailDestino && String(emailDestino).trim()) ? String(emailDestino).trim() : Session.getActiveUser().getEmail();
    var assunto = 'Passaportes - ' + (clubeNome || '') + ' - ' + (eventoNome || 'Evento');
    Logger.log('[Passaportes] Enviando email: para=' + dest + ', anexos=' + anexos.length);
    if (typeof GmailApp === 'undefined') {
      Logger.log('[Passaportes] GmailApp não disponível');
      return { erro: 'Gmail não disponível. Autorize o Gmail no projeto Apps Script (Executar solicitarPermissaoGmail uma vez).' };
    }
    try {
      GmailApp.sendEmail(dest, assunto, corpo, { attachments: anexos });
      Logger.log('[Passaportes] SUCESSO - email enviado (GmailApp)');
      return { ok: true, enviado: true };
    } catch (gmailErr) {
      var msgGmail = (gmailErr && gmailErr.message) ? gmailErr.message : String(gmailErr);
      Logger.log('[Passaportes] GmailApp falhou: ' + msgGmail + ', tentando MailApp');
      try {
        if (typeof MailApp !== 'undefined') {
          MailApp.sendEmail(dest, assunto, corpo, { attachments: anexos });
          Logger.log('[Passaportes] SUCESSO - email enviado (MailApp)');
          return { ok: true, enviado: true };
        }
      } catch (mailErr) {
        Logger.log('[Passaportes] MailApp falhou: ' + (mailErr && mailErr.message ? mailErr.message : ''));
      }
      var pasta = DriveApp.createFolder('Passaportes_' + (clubeNome || 'Clube').replace(/[^a-zA-Z0-9\u00C0-\u024F\s\-]/g, '_').substring(0, 50) + '_' + Date.now());
      for (var k = 0; k < anexos.length; k++) {
        pasta.createFile(anexos[k]);
      }
      pasta.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var folderUrl = pasta.getUrl();
      return {
        erro: 'Não foi possível enviar o e-mail pelo sistema: ' + msgGmail + '. Os PDFs foram salvos no Drive (link abaixo).',
        fallbackDrive: true,
        folderUrl: folderUrl,
        textoEmail: corpo,
        assunto: assunto
      };
    }
  } catch (e) {
    var msg = (e && e.message) ? e.message : String(e);
    var stack = (e && e.stack) ? e.stack : '';
    Logger.log('[Passaportes] ERRO FATAL: ' + msg);
    Logger.log('[Passaportes] Stack: ' + stack);
    console.error('criarRascunhoEmailPassaportesClube:', e);
    return { erro: msg, _stack: stack };
  }
}

/**
 * Solicita permissão de Gmail. Execute esta função uma vez no editor de script
 * (Extensions > Apps Script > selecione esta função > Executar) e autorize o Gmail quando solicitado.
 * Depois disso, "Enviar passaporte" funcionará.
 */
function solicitarPermissaoGmail() {
  var drafts = GmailApp.getDrafts();
  Logger.log('Permissão Gmail OK. Rascunhos: ' + (drafts ? drafts.length : 0));
  return 'Permissão concedida. Agora use "Enviar passaporte" no relatório.';
}

/**
 * Teste manual - executa criarRascunhoEmailPassaportesClube.
 * Rode no editor de script, depois veja Execuções > [sua execução] > Logs.
 * Para testar com dados reais: use "Enviar passaporte" na tela do relatório.
 */
async function criarRascunhoEmailPassaportesClubeTeste() {
  Logger.log('=== TESTE Passaportes ===');
  var lista = [{ inscricaoId: '00000000-0000-0000-0000-000000000001', pessoaNome: 'Teste', clubeNome: 'Clube Teste' }];
  var r = await criarRascunhoEmailPassaportesClube('ev-teste', 'Evento Teste', 'Clube Teste', lista);
  Logger.log('Resultado: ' + JSON.stringify(r));
}

/**
 * Consome refeições em lote (chamado pelo scanner com fila local).
 * @param {string} eventoId - UUID do evento
 * @param {Array<{inscricaoId:string,tipoRefeicao:string}>} itens - Lista de { inscricaoId, tipoRefeicao }
 * @returns {Object} { processados, sucesso, erros }
 */
async function consumirRefeicoesPassaporteLote(eventoId, itens) {
  try {
    if (!eventoId || !eventoId.toString().trim()) {
      return { processados: 0, sucesso: 0, erros: [{ erro: 'Evento não informado.' }] };
    }
    var arr = Array.isArray(itens) ? itens : [];
    if (arr.length === 0) {
      return { processados: 0, sucesso: 0, erros: [] };
    }
    if (typeof portalConsumirRefeicoesInscricaoLote !== 'function') {
      return { processados: 0, sucesso: 0, erros: [{ erro: 'Módulo de refeições não carregado. Verifique se portal_supabase está ativo.' }] };
    }
    return await portalConsumirRefeicoesInscricaoLote(eventoId, arr);
  } catch (e) {
    console.error('consumirRefeicoesPassaporteLote:', e);
    return { processados: 0, sucesso: 0, erros: [{ erro: (e && e.message) ? e.message : 'Erro ao processar lote.' }] };
  }
}

/**
 * Credencia inscrições em modalidades em lote (chamado pelo scanner com fila local).
 * @param {string} eventoId - UUID do evento
 * @param {Array<{inscricaoId:string,modalidadeId:string}>} itens - Lista de { inscricaoId, modalidadeId }
 * @returns {Object} { processados, sucesso, erros }
 */
async function credenciarInscricoesModalidadeLote(eventoId, itens) {
  try {
    if (!eventoId || !eventoId.toString().trim()) {
      return { processados: 0, sucesso: 0, erros: [{ erro: 'Evento não informado.' }] };
    }
    var raw = Array.isArray(itens) ? itens : [];
    if (raw.length === 0) {
      return { processados: 0, sucesso: 0, erros: [] };
    }
    var arr = raw.map(function(x) {
      var iid = (x && (x.inscricaoId || x.inscricao_id)) ? String(x.inscricaoId || x.inscricao_id).trim() : '';
      var mid = (x && (x.modalidadeId || x.modalidade_id)) ? String(x.modalidadeId || x.modalidade_id).trim() : '';
      return { inscricaoId: iid, modalidadeId: mid };
    });
    if (typeof portalCredenciarInscricoesModalidadeLote !== 'function') {
      return { processados: 0, sucesso: 0, erros: [{ erro: 'Módulo de credenciamento não carregado.' }] };
    }
    return await portalCredenciarInscricoesModalidadeLote(eventoId, arr);
  } catch (e) {
    console.error('credenciarInscricoesModalidadeLote:', e);
    return { processados: 0, sucesso: 0, erros: [{ erro: (e && e.message) ? e.message : 'Erro ao processar lote.' }] };
  }
}

/**
 * Valida se a inscrição pode ser credenciada na Plenária (delegado).
 * Verifica se o clube tem direito a delegados (Art. 52) e se ainda há vaga para o clube.
 * @param {string} inscricaoId - UUID da inscrição (passaporte)
 * @param {string} eventoId - UUID do evento
 * @returns {Object} { ok, erro?, pessoaNome?, jaCredenciado?, semVagaDelegado?, delegadosClube?, jaCredenciadosClube? }
 */
async function validarCredenciamentoPlenaria(inscricaoId, eventoId) {
  try {
    if (!inscricaoId || !eventoId) return { ok: false, erro: 'Inscrição ou evento não informado.' };
    var id = String(inscricaoId).trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { ok: false, erro: 'Código do passaporte inválido.' };
    var inscricoes = (typeof portalListarInscricoesEvento === 'function') ? await portalListarInscricoesEvento(eventoId) : [];
    var insc = (inscricoes || []).find(function(r) { return r && String(r.id || r.inscricaoId || '').toLowerCase().trim() === id.toLowerCase(); });
    if (!insc) return { ok: false, erro: 'Inscrição não encontrada. Verifique se o passaporte é deste evento.' };
    var clubeNome = (insc.clubeNome || insc.clube_nome || '').trim();
    if (String(clubeNome).toLowerCase().indexOf('gabinete distrital') >= 0 && (insc.clubeOrigemNome || insc.clube_origem_nome)) {
      clubeNome = (insc.clubeOrigemNome || insc.clube_origem_nome).trim();
    }
    var pessoaNome = (insc.pessoaNome || insc.pessoa_nome || '').trim();
    var pessoaTipo = (insc.pessoaTipo || insc.pessoa_tipo || '').trim();
    // Validar tipo de associado: apenas "Associado LEO" ou "Associado LEO e LEO/Leão" podem ser credenciados como delegados
    var tiposPermitidos = ['Associado LEO', 'Associado LEO e LEO/Leão'];
    if (pessoaTipo && tiposPermitidos.indexOf(pessoaTipo) === -1) {
      return { ok: false, erro: 'Apenas Associados LEO e Associados LEO e LEO/Leão podem ser credenciados como delegados.', pessoaNome: pessoaNome };
    }
    if (typeof portalInscricaoJaCredenciadaPlenaria === 'function' && await portalInscricaoJaCredenciadaPlenaria(id, eventoId)) {
      return { ok: false, jaCredenciado: true, erro: 'Já credenciado na plenária.', pessoaNome: pessoaNome };
    }
    var eventos = (typeof portalListarEventos === 'function') ? await portalListarEventos() : [];
    var evento = (eventos || []).find(function(e) { return String(e.id) === String(eventoId); });
    var dataRefStr = null;
    if (evento && (evento.dataInicio || evento.data_evento)) {
      var dt = evento.dataInicio || evento.data_evento;
      var d = null;
      if (typeof dt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dt)) {
        var p = dt.split(/[-T]/);
        d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10) || 1);
      } else if (typeof dt === 'string' && dt.length >= 10) {
        var parts = dt.split(/[/-]/);
        if (parts.length >= 3) {
          if (parts[0].length === 4) d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10) || 1);
          else d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10) || 1);
        }
      }
      if (d && !isNaN(d.getTime())) {
        d.setMonth(d.getMonth() - 1);
        d.setDate(1);
        dataRefStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      }
    }
    var resumo = (typeof obterResumoDelegadosClubes === 'function') ? await obterResumoDelegadosClubes(dataRefStr) : null;
    if (!resumo || !resumo.sucesso || !resumo.dados || !resumo.dados.clubes) {
      return { ok: false, erro: 'Não foi possível obter o resumo de delegados. Tente novamente.', pessoaNome: pessoaNome };
    }
    var clubeResumo = (resumo.dados.clubes || []).find(function(c) { return String(c.clubeNome || '').trim() === String(clubeNome).trim(); });
    var delegadosClube = clubeResumo ? (parseInt(clubeResumo.delegados, 10) || 0) : 0;
    if (clubeResumo && clubeResumo.inadimplente) {
      return { ok: false, semVagaDelegado: true, erro: 'Clube inadimplente não pode credenciar delegados.', pessoaNome: pessoaNome, delegadosClube: 0 };
    }
    if (clubeResumo && clubeResumo.nucleo) {
      return { ok: false, semVagaDelegado: true, erro: 'Clube Núcleo não pode credenciar delegados.', pessoaNome: pessoaNome, delegadosClube: 0 };
    }
    if (delegadosClube <= 0) {
      return { ok: false, semVagaDelegado: true, erro: 'O clube não possui direito a delegados na data de referência (Art. 52).', pessoaNome: pessoaNome, delegadosClube: 0 };
    }
    var ehPastPresidente = (typeof portalEhPastPresidente === 'function') && await portalEhPastPresidente(clubeNome, pessoaNome);
    if (!ehPastPresidente) {
      var jaCredenciadosClube = (typeof portalContarCredenciadosPlenariaPorClube === 'function') ? await portalContarCredenciadosPlenariaPorClube(eventoId, clubeNome) : 0;
      if (jaCredenciadosClube >= delegadosClube) {
        return { ok: false, semVagaDelegado: true, erro: 'O clube já atingiu o limite de delegados para esta plenária.', pessoaNome: pessoaNome, delegadosClube: delegadosClube, jaCredenciadosClube: jaCredenciadosClube };
      }
    }
    return { ok: true, pessoaNome: pessoaNome, clubeNome: clubeNome, delegadosClube: delegadosClube, jaCredenciadosClube: ehPastPresidente ? 0 : (typeof portalContarCredenciadosPlenariaPorClube === 'function' ? await portalContarCredenciadosPlenariaPorClube(eventoId, clubeNome) : 0), isDelegadoNato: ehPastPresidente };
  } catch (e) {
    console.error('validarCredenciamentoPlenaria:', e);
    return { ok: false, erro: (e && e.message) ? e.message : 'Erro ao validar.' };
  }
}

/**
 * Credencia a inscrição na Plenária (registra como delegado). Valida antes.
 * @param {string} inscricaoId - UUID da inscrição
 * @param {string} eventoId - UUID do evento
 * @param {boolean} [delegadoNatoFromClient] - Se informado, usa este valor em vez de recalcular (evita perder dado do scanner).
 * @returns {Object} { ok, erro?, pessoaNome?, delegadoNato? }
 */
async function credenciarPlenaria(inscricaoId, eventoId, delegadoNatoFromClient) {
  try {
    var validacao = await validarCredenciamentoPlenaria(inscricaoId, eventoId);
    if (!validacao.ok) return { ok: false, erro: validacao.erro || 'Não pode credenciar.', pessoaNome: validacao.pessoaNome || '' };
    var inscricoes = (typeof portalListarInscricoesEvento === 'function') ? await portalListarInscricoesEvento(eventoId) : [];
    var id = String(inscricaoId).trim();
    var insc = (inscricoes || []).find(function(r) { return r && String(r.id || r.inscricaoId || '').toLowerCase().trim() === id.toLowerCase(); });
    if (!insc) return { ok: false, erro: 'Inscrição não encontrada.', pessoaNome: '' };
    var clubeNome = (insc.clubeNome || insc.clube_nome || '').trim();
    if (String(clubeNome).toLowerCase().indexOf('gabinete distrital') >= 0 && (insc.clubeOrigemNome || insc.clube_origem_nome)) {
      clubeNome = (insc.clubeOrigemNome || insc.clube_origem_nome).trim();
    }
    if (typeof portalCredenciarPlenaria !== 'function') return { ok: false, erro: 'Módulo de plenária não disponível.', pessoaNome: validacao.pessoaNome || '' };
    var delegadoNato = typeof delegadoNatoFromClient === 'boolean' ? delegadoNatoFromClient : ((typeof portalEhPastPresidente === 'function') && await portalEhPastPresidente(clubeNome, (insc.pessoaNome || insc.pessoa_nome || '').trim()));
    var result = await portalCredenciarPlenaria(id, eventoId, clubeNome, delegadoNato);
    if (!result.ok) return { ok: false, erro: result.erro || 'Falha ao registrar.', pessoaNome: validacao.pessoaNome || '' };
    return { ok: true, pessoaNome: validacao.pessoaNome || '', delegadoNato: delegadoNato };
  } catch (e) {
    console.error('credenciarPlenaria:', e);
    return { ok: false, erro: (e && e.message) ? e.message : 'Erro ao credenciar.' };
  }
}

/**
 * Credencia em lote na Plenária (para o scanner enviar vários com delegado_nato preservado).
 * @param {string} eventoId - UUID do evento
 * @param {Array<{inscricaoId: string, delegadoNato: boolean}>} itens - Lista com inscricaoId e delegadoNato (do cache do scanner).
 * @returns {Object} { sucesso: number, erros: Array<{inscricaoId?: string, erro: string}> }
 */
async function credenciarPlenariaLote(eventoId, itens) {
  var sucesso = 0;
  var erros = [];
  if (!eventoId || !Array.isArray(itens) || itens.length === 0) return { sucesso: 0, erros: [] };
  var inscricoes = (typeof portalListarInscricoesEvento === 'function') ? await portalListarInscricoesEvento(eventoId) : [];
  for (const item of itens) {
    var id = String(item && item.inscricaoId ? item.inscricaoId : '').trim();
    var delegadoNato = item && item.delegadoNato === true;
    if (!id) { erros.push({ inscricaoId: id, erro: 'Inscrição inválida.' }); continue; }
    var insc = (inscricoes || []).find(function(r) { return r && String(r.id || r.inscricaoId || '').toLowerCase().trim() === id.toLowerCase(); });
    if (!insc) { erros.push({ inscricaoId: id, erro: 'Inscrição não encontrada no evento.' }); continue; }
    var clubeNome = (insc.clubeNome || insc.clube_nome || '').trim();
    if (String(clubeNome).toLowerCase().indexOf('gabinete distrital') >= 0 && (insc.clubeOrigemNome || insc.clube_origem_nome)) {
      clubeNome = (insc.clubeOrigemNome || insc.clube_origem_nome).trim();
    }
    if (typeof portalCredenciarPlenaria !== 'function') { erros.push({ inscricaoId: id, erro: 'Módulo de plenária não disponível.' }); continue; }
    var result = await portalCredenciarPlenaria(id, eventoId, clubeNome, delegadoNato);
    if (result && result.ok) sucesso++; else erros.push({ inscricaoId: id, erro: (result && result.erro) ? result.erro : 'Falha ao registrar.' });
  }
  return { sucesso: sucesso, erros: erros };
}

/**
 * Lista credenciados na plenária do evento (para o scanner).
 * @param {string} eventoId - UUID do evento
 * @returns {Array<{inscricaoId:string,clubeNome:string,pessoaNome:string}>}
 */
async function listarCredenciadosPlenaria(eventoId) {
  try {
    if (!eventoId) return [];
    if (typeof portalListarCredenciadosPlenaria !== 'function') return [];
    var creds = (await portalListarCredenciadosPlenaria(eventoId)) || [];
    var inscricoes = (typeof portalListarInscricoesEvento === 'function') ? await portalListarInscricoesEvento(eventoId) : [];
    var mapaNome = {};
    (inscricoes || []).forEach(function(insc) {
      var iid = String(insc.id || insc.inscricaoId || '').trim();
      if (iid) mapaNome[iid.toLowerCase()] = { pessoaNome: (insc.pessoaNome || insc.pessoa_nome || '').trim(), clubeNome: (insc.clubeNome || insc.clube_nome || '').trim() };
    });
    return creds.map(function(c) {
      var id = String(c.inscricao_id || c.inscricaoId || '').trim();
      var info = mapaNome[id.toLowerCase()] || {};
      var delegadoNato = !!(c.delegado_nato === true || c.delegadoNato === true);
      return { inscricaoId: id, clubeNome: (c.clube_nome || c.clubeNome || info.clubeNome || '').trim(), pessoaNome: (info.pessoaNome || '').trim() || '—', delegadoNato: delegadoNato };
    });
  } catch (e) {
    console.error('listarCredenciadosPlenaria:', e);
    return [];
  }
}

/**
 * Remove credenciamento de plenária (para o scanner).
 * @param {string} inscricaoId - UUID da inscrição
 * @param {string} eventoId - UUID do evento
 * @returns {Object} { ok, erro? }
 */
async function removerCredenciamentoPlenaria(inscricaoId, eventoId) {
  try {
    if (!inscricaoId || !eventoId) return { ok: false, erro: 'Dados incompletos.' };
    if (typeof portalRemoverCredenciamentoPlenaria !== 'function') return { ok: false, erro: 'Módulo não disponível.' };
    return await portalRemoverCredenciamentoPlenaria(inscricaoId, eventoId);
  } catch (e) {
    console.error('removerCredenciamentoPlenaria:', e);
    return { ok: false, erro: (e && e.message) ? e.message : 'Erro ao remover.' };
  }
}

/**
 * Lista Past-Presidentes cadastrados (Delegado Nato) com AL e status do RTMA (Ativo/Inativo).
 * @returns {Array<{id:string,clubeNome:string,pessoaNome:string,anoLeonistico:string,statusRTMA:string}>}
 */
async function listarPastPresidentes() {
  try {
    if (typeof portalListarPastPresidentes !== 'function') return [];
    var rows = (await portalListarPastPresidentes()) || [];
    var resultado = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var clube = (r.clube_nome || r.clubeNome || '').trim();
      var pessoa = (r.pessoa_nome || r.pessoaNome || '').trim();
      var al = (r.ano_leonistico || r.anoLeonistico || '2025-2026').trim() || '2025-2026';
      var statusRTMA = '—';
      if (typeof buscarPessoasRTMA === 'function') {
        try {
          var listaRTMA = (await buscarPessoasRTMA(clube, null, null, null)) || [];
          var p = listaRTMA.find(function(x) { return String((x.nome || '').trim()).toLowerCase() === pessoa.toLowerCase(); });
          if (p && p.status) statusRTMA = (p.status || '').trim() || '—';
        } catch (err) {}
      }
      resultado.push({ id: r.id, clubeNome: clube, pessoaNome: pessoa, anoLeonistico: al, statusRTMA: statusRTMA });
    }
    // Ordenar por AL do mais novo ao mais velho (primeiro ano do "AAAA-AAAA")
    resultado.sort(function(a, b) {
      var anoA = parseInt(String(a.anoLeonistico || '').split('-')[0], 10) || 0;
      var anoB = parseInt(String(b.anoLeonistico || '').split('-')[0], 10) || 0;
      if (anoA !== anoB) return anoB - anoA;
      return String(a.clubeNome || '').localeCompare(b.clubeNome || '') || String(a.pessoaNome || '').localeCompare(b.pessoaNome || '');
    });
    return resultado;
  } catch (e) {
    console.error('listarPastPresidentes:', e);
    return [];
  }
}

/**
 * Atualiza um Past-Presidente (ex.: AL).
 * @param {string} id - ID do registro
 * @param {Object} dados - { anoLeonistico?: string }
 * @returns {Object} { ok, erro? }
 */
async function atualizarPastPresidente(id, dados) {
  try {
    if (!id) return { ok: false, erro: 'ID inválido.' };
    if (typeof portalAtualizarPastPresidente !== 'function') return { ok: false, erro: 'Módulo não disponível.' };
    return await portalAtualizarPastPresidente(id, dados || {});
  } catch (e) {
    console.error('atualizarPastPresidente:', e);
    return { ok: false, erro: (e && e.message) ? e.message : 'Erro ao atualizar.' };
  }
}

/**
 * Cadastra um Past-Presidente (Delegado Nato). Se ativo no movimento, pode credenciar sem consumir cota do clube.
 * @param {string} clubeNome - Nome do clube
 * @param {string} pessoaNome - Nome da pessoa
 * @returns {Object} { ok, erro? }
 */
async function salvarPastPresidente(clubeNome, pessoaNome) {
  let idemLock = null;
  try {
    if (!clubeNome || !pessoaNome) return { ok: false, erro: 'Clube e pessoa são obrigatórios.' };
    if (typeof portalInserirPastPresidente !== 'function') return { ok: false, erro: 'Módulo não disponível.' };
    const clube = String(clubeNome).trim();
    const pessoa = String(pessoaNome).trim();
    const chaveRaw = `${clube}|${pessoa}`.toLowerCase();
    const cacheKey = `IDEMP:past_presidente:${Utilities.base64EncodeWebSafe(chaveRaw)}`;
    idemLock = LockService.getScriptLock();
    idemLock.waitLock(10000);
    const cached = CacheService.getScriptCache().get(cacheKey);
    if (cached === '1') return { ok: true, idempotente: true };
    const res = await portalInserirPastPresidente(clube, pessoa);
    if (res && res.ok) {
      CacheService.getScriptCache().put(cacheKey, '1', 6 * 60 * 60);
    }
    return res;
  } catch (e) {
    console.error('salvarPastPresidente:', e);
    return { ok: false, erro: (e && e.message) ? e.message : 'Erro ao salvar.' };
  } finally {
    if (idemLock) {
      try { idemLock.releaseLock(); } catch (err) {}
    }
  }
}

/**
 * Remove um Past-Presidente do cadastro.
 * @param {string} id - ID do registro
 * @returns {Object} { ok, erro? }
 */
async function removerPastPresidente(id) {
  try {
    if (!id) return { ok: false, erro: 'ID inválido.' };
    if (typeof portalRemoverPastPresidente !== 'function') return { ok: false, erro: 'Módulo não disponível.' };
    return await portalRemoverPastPresidente(id);
  } catch (e) {
    console.error('removerPastPresidente:', e);
    return { ok: false, erro: (e && e.message) ? e.message : 'Erro ao remover.' };
  }
}

/**
 * Lista nomes de pessoas do clube (para seletor Past-Presidentes). RTMA.
 * @param {string} clubeNome - Nome do clube
 * @returns {Array<{nome:string}>}
 */
async function listarNomesPessoasClube(clubeNome) {
  try {
    if (!clubeNome || !String(clubeNome).trim()) return [];
    var pessoas = (typeof buscarPessoasRTMA === 'function') ? (await buscarPessoasRTMA(String(clubeNome).trim(), null, null, null)) : [];
    return (pessoas || []).map(function(p) { return { nome: (p.nome || '').trim() }; }).filter(function(x) { return x.nome; });
  } catch (e) {
    console.error('listarNomesPessoasClube:', e);
    return [];
  }
}

/**
 * Retorna dados para cache de validação instantânea da plenária no scanner.
 * Inclui limite de delegados por clube, credenciados atuais e mapa inscrição -> clube.
 * @param {string} eventoId - UUID do evento
 * @returns {Object} { limitByClube: Object, credenciados: Array, inscricoes: Array<{id,clubeNome,pessoaNome}> }
 */
async function obterCachePlenaria(eventoId) {
  try {
    if (!eventoId) return { limitByClube: {}, credenciados: [], inscricoes: [] };
    var eventos = (typeof portalListarEventos === 'function') ? await portalListarEventos() : [];
    var evento = (eventos || []).find(function(e) { return String(e.id) === String(eventoId); });
    var dataInicioStr = (evento && evento.dataInicio) ? String(evento.dataInicio).trim() : '';
    var dataRefStr = '';
    if (dataInicioStr) {
      var d = new Date(dataInicioStr.split('T')[0] + 'T12:00:00');
      if (d && !isNaN(d.getTime())) {
        d.setMonth(d.getMonth() - 1);
        d.setDate(1);
        dataRefStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      }
    }
    var limitByClube = {};
    var resumo = (typeof obterResumoDelegadosClubes === 'function') ? await obterResumoDelegadosClubes(dataRefStr) : null;
    if (resumo && resumo.sucesso && resumo.dados && resumo.dados.clubes) {
      (resumo.dados.clubes || []).forEach(function(c) {
        var nome = (c.clubeNome || '').trim();
        if (nome) limitByClube[nome] = parseInt(c.delegados, 10) || 0;
      });
    }
    var credenciados = (typeof listarCredenciadosPlenaria === 'function') ? await listarCredenciadosPlenaria(eventoId) : [];
    var inscricoes = (typeof portalListarInscricoesEvento === 'function') ? await portalListarInscricoesEvento(eventoId) : [];
    var inscricoesMin = (inscricoes || []).map(function(i) {
      var id = String(i.id || i.inscricaoId || '').trim();
      var clube = (i.clubeNome || i.clube_nome || '').trim();
      if (String(clube).toLowerCase().indexOf('gabinete distrital') >= 0 && (i.clubeOrigemNome || i.clube_origem_nome)) {
        clube = (i.clubeOrigemNome || i.clube_origem_nome).trim();
      }
      return { id: id, clubeNome: clube, pessoaNome: (i.pessoaNome || i.pessoa_nome || '').trim(), pessoaTipo: (i.pessoaTipo || i.pessoa_tipo || '').trim() };
    }).filter(function(x) { return x.id; });
    var pastPresidentes = (typeof portalListarPastPresidentes === 'function') ? await portalListarPastPresidentes() : [];
    var pastPresidentesMin = (pastPresidentes || []).map(function(p) {
      return { clubeNome: (p.clube_nome || p.clubeNome || '').trim(), pessoaNome: (p.pessoa_nome || p.pessoaNome || '').trim() };
    }).filter(function(x) { return x.clubeNome && x.pessoaNome; });
    return { limitByClube: limitByClube, credenciados: credenciados || [], inscricoes: inscricoesMin, pastPresidentes: pastPresidentesMin };
  } catch (e) {
    console.error('obterCachePlenaria:', e);
    return { limitByClube: {}, credenciados: [], inscricoes: [] };
  }
}

// === Wrappers modalidades e credenciamento (competição) ===
async function listarModalidades() {
  try {
    if (typeof portalListarModalidades !== 'function') return [];
    return await portalListarModalidades();
  } catch (e) {
    console.error('listarModalidades:', e);
    return [];
  }
}

async function criarModalidade(dados) {
  try {
    if (typeof portalCriarModalidade !== 'function') throw new Error('Função não disponível.');
    return await portalCriarModalidade(dados);
  } catch (e) {
    console.error('criarModalidade:', e);
    throw e;
  }
}

async function atualizarModalidade(id, dados) {
  try {
    if (typeof portalAtualizarModalidade !== 'function') throw new Error('Função não disponível.');
    return await portalAtualizarModalidade(id, dados);
  } catch (e) {
    console.error('atualizarModalidade:', e);
    throw e;
  }
}

async function excluirModalidade(id) {
  try {
    if (typeof portalExcluirModalidade !== 'function') throw new Error('Função não disponível.');
    return await portalExcluirModalidade(id);
  } catch (e) {
    console.error('excluirModalidade:', e);
    throw e;
  }
}

async function listarModalidadesEvento(eventoId) {
  try {
    if (typeof portalListarModalidadesEvento !== 'function') return [];
    return await portalListarModalidadesEvento(eventoId);
  } catch (e) {
    console.error('listarModalidadesEvento:', e);
    return [];
  }
}

/**
 * Retorna apto a competir e se o evento tem modalidades (para exibir no passaporte).
 * @param {string} eventoId
 * @param {string} inscricaoId
 * @returns {{ aptoACompetir: string, temModalidades: boolean, labelModalidades: string }}
 */
async function obterAptoEModalidadesPassaporte(eventoId, inscricaoId) {
  try {
    var modalidades = await listarModalidadesEvento(eventoId);
    var temModalidades = Array.isArray(modalidades) && modalidades.length > 0;
    var apto = (typeof obterAptoACompetirInscricao === 'function') ? await obterAptoACompetirInscricao(eventoId, inscricaoId) : { aptoACompetir: 'Não' };
    var aptoVal = String(apto.aptoACompetir || 'Não').trim();
    var label = 'Não pode competir';
    if (aptoVal === 'Sim') label = 'Liberado para competir';
    else if (aptoVal === 'Apenas Coletivas') label = 'Apenas Coletivas';
    return { aptoACompetir: aptoVal, temModalidades: temModalidades, labelModalidades: label };
  } catch (e) {
    console.error('obterAptoEModalidadesPassaporte:', e);
    return { aptoACompetir: 'Não', temModalidades: false, labelModalidades: 'Não pode competir' };
  }
}

/**
 * Retorna apto a competir e se o evento tem modalidades (para exibir no passaporte).
 * @param {string} eventoId
 * @param {string} inscricaoId
 * @returns {{ aptoACompetir: string, temModalidades: boolean }}
 */
async function obterAptoEModalidadesPassaporte(eventoId, inscricaoId) {
  try {
    var temModalidades = false;
    if (eventoId) {
      var mods = await listarModalidadesEvento(eventoId);
      temModalidades = Array.isArray(mods) && mods.length > 0;
    }
    var apto = await obterAptoACompetirInscricao(eventoId, inscricaoId);
    return { aptoACompetir: apto.aptoACompetir || 'Não', temModalidades: temModalidades };
  } catch (e) {
    console.error('obterAptoEModalidadesPassaporte:', e);
    return { aptoACompetir: 'Não', temModalidades: false };
  }
}

async function listarCredenciadosModalidade(eventoId, modalidadeId) {
  try {
    if (typeof portalListarCredenciadosModalidadeDetalhado !== 'function') return [];
    return (await portalListarCredenciadosModalidadeDetalhado(eventoId, modalidadeId)) || [];
  } catch (e) {
    console.error('listarCredenciadosModalidade:', e);
    return [];
  }
}

async function removerCredenciamentoModalidade(inscricaoId, eventoId, modalidadeId) {
  try {
    if (typeof portalRemoverCredenciamentoModalidade !== 'function') {
      return { ok: false, erro: 'Função não disponível.' };
    }
    return await portalRemoverCredenciamentoModalidade(inscricaoId, eventoId, modalidadeId);
  } catch (e) {
    console.error('removerCredenciamentoModalidade:', e);
    return { ok: false, erro: (e && e.message) ? e.message : 'Erro ao remover.' };
  }
}

async function listarCredenciadosModalidade(eventoId, modalidadeId) {
  try {
    if (typeof portalListarCredenciadosModalidadeDetalhado !== 'function') return [];
    return (await portalListarCredenciadosModalidadeDetalhado(eventoId, modalidadeId)) || [];
  } catch (e) {
    console.error('listarCredenciadosModalidade:', e);
    return [];
  }
}

async function removerCredenciamentoModalidade(inscricaoId, eventoId, modalidadeId) {
  try {
    if (typeof portalRemoverCredenciamentoModalidade !== 'function') return { ok: false, erro: 'Função não disponível.' };
    return (await portalRemoverCredenciamentoModalidade(inscricaoId, eventoId, modalidadeId)) || { ok: false, erro: 'Erro ao remover.' };
  } catch (e) {
    console.error('removerCredenciamentoModalidade:', e);
    return { ok: false, erro: (e && e.message) ? e.message : 'Erro ao remover credenciamento.' };
  }
}

async function vincularModalidadeEvento(eventoId, modalidadeId, limiteParticipantes) {
  try {
    if (typeof portalVincularModalidadeEvento !== 'function') throw new Error('Função não disponível.');
    return await portalVincularModalidadeEvento(eventoId, modalidadeId, limiteParticipantes);
  } catch (e) {
    console.error('vincularModalidadeEvento:', e);
    throw e;
  }
}

async function removerModalidadeEvento(eventoId, modalidadeId) {
  try {
    if (typeof portalRemoverModalidadeEvento !== 'function') throw new Error('Função não disponível.');
    return await portalRemoverModalidadeEvento(eventoId, modalidadeId);
  } catch (e) {
    console.error('removerModalidadeEvento:', e);
    throw e;
  }
}

async function listarBloqueiosModalidade(modalidadeIdOrigem) {
  try {
    if (typeof portalListarBloqueiosModalidade !== 'function') return [];
    return await portalListarBloqueiosModalidade(modalidadeIdOrigem);
  } catch (e) {
    console.error('listarBloqueiosModalidade:', e);
    return [];
  }
}

async function criarBloqueioModalidade(modalidadeIdOrigem, modalidadeIdBloqueada) {
  try {
    if (typeof portalCriarBloqueioModalidade !== 'function') throw new Error('Função não disponível.');
    return await portalCriarBloqueioModalidade(modalidadeIdOrigem, modalidadeIdBloqueada);
  } catch (e) {
    console.error('criarBloqueioModalidade:', e);
    throw e;
  }
}

async function removerBloqueioModalidade(id) {
  try {
    if (typeof portalRemoverBloqueioModalidade !== 'function') throw new Error('Função não disponível.');
    return await portalRemoverBloqueioModalidade(id);
  } catch (e) {
    console.error('removerBloqueioModalidade:', e);
    throw e;
  }
}

async function validarCredenciamentoModalidade(inscricaoId, eventoId, modalidadeId) {
  try {
    if (typeof portalValidarCredenciamentoModalidade !== 'function') {
      return { ok: false, erro: 'Função não disponível.' };
    }
    return await portalValidarCredenciamentoModalidade(inscricaoId, eventoId, modalidadeId);
  } catch (e) {
    console.error('validarCredenciamentoModalidade:', e);
    return { ok: false, erro: (e && e.message) ? e.message : 'Erro ao validar.' };
  }
}

/**
 * Normaliza nome para comparação: trim, espaços únicos, minúsculas, remove acentos.
 * @param {string} s
 * @returns {string}
 */
function _normalizarNomeParaComparacao(s) {
  var t = String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  var mapa = { á: 'a', à: 'a', ã: 'a', â: 'a', ä: 'a', é: 'e', ê: 'e', è: 'e', í: 'i', ì: 'i', ó: 'o', ò: 'o', ô: 'o', õ: 'o', ú: 'u', ù: 'u', ç: 'c', ñ: 'n' };
  for (var k in mapa) t = t.split(k).join(mapa[k]);
  return t.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

/** Ano leonístico de referência da nominata nos relatórios de inscritos (Excel). */
var AL_NOMINATA_RELATORIO_EVENTOS = '2025-2026';

/**
 * Em textos com dois cargos concatenados com " e ", troca por " / " quando o segundo cargo
 * começa por palavras típicas de função (evita cortar "Arte e Cultura").
 * @param {string} s
 * @returns {string}
 */
function _unificarSeparadoresCargoExcel(s) {
  if (!s) return '';
  var t = String(s).trim();
  if (!t) return '';
  return t.replace(/\s+e\s+(?=Diret|Presidente|Vice|Tesoureir|Secretár|Secretário|Associad|Casal|Conselheiro|Instru)/gi, ' / ');
}

/**
 * nominata_dirigentes filtrado por AL: agrega vários cargos por pessoa com " / ".
 * @param {string} clube
 * @param {string} anoLeonistico ex: 2025-2026
 * @param {object} configSupabase
 * @returns {Object.<string, string>} nomeNormalizado -> cargos unidos
 */
async function _obterMapaCargosNominataClubeAlMult(clube, anoLeonistico, configSupabase) {
  var out = {};
  try {
    if (typeof UrlFetchApp === 'undefined') return out;
    if (!clube || !String(clube).trim()) return out;
    var config = configSupabase || (typeof RTMA_SUPABASE_CONFIG !== 'undefined' ? RTMA_SUPABASE_CONFIG : null);
    if (!config || !config.url) return out;
    var al = String(anoLeonistico || AL_NOMINATA_RELATORIO_EVENTOS).trim() || AL_NOMINATA_RELATORIO_EVENTOS;
    var url = config.url + '/rest/v1/nominata_dirigentes?clube=eq.' + encodeURIComponent(String(clube).trim()) +
      '&ano_leonistico=eq.' + encodeURIComponent(al) + '&select=nome,cargo';
    var resp = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'apikey': config.serviceRoleKey,
        'Authorization': 'Bearer ' + config.serviceRoleKey,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) return out;
    var rows = JSON.parse(resp.getContentText() || '[]');
    var agg = {};
    (rows || []).forEach(function (r) {
      var nome = String(r.nome || '').trim();
      var cargo = String(r.cargo || '').trim();
      if (!nome) return;
      var k = _normalizarNomeParaComparacao(nome);
      if (!agg[k]) agg[k] = [];
      if (cargo && agg[k].indexOf(cargo) < 0) agg[k].push(cargo);
    });
    Object.keys(agg).forEach(function (k) {
      var joined = agg[k].join(' / ');
      out[k] = _unificarSeparadoresCargoExcel(joined);
    });
  } catch (e) { console.warn('_obterMapaCargosNominataClubeAlMult:', e); }
  return out;
}

/**
 * Busca cargos da nominata_dirigentes para um clube (AL 2025-2026, múltiplos cargos com /).
 * @param {string} clube
 * @param {object} configSupabase - { url, serviceRoleKey }
 * @returns {Object.<string, string>}
 */
async function _obterMapaCargoNominataClube(clube, configSupabase) {
  return await _obterMapaCargosNominataClubeAlMult(clube, AL_NOMINATA_RELATORIO_EVENTOS, configSupabase);
}

/**
 * Retorna true se o tipo é Pré-LEO (não apto a competir).
 */
function _ehPreLeo(tipoInscricao) {
  var t = String(tipoInscricao || '').toLowerCase().replace(/\s+/g, ' ');
  return t.indexOf('pré-leo') >= 0 || t.indexOf('pre-leo') >= 0 || t.indexOf('pre leo') >= 0 || (t.indexOf('pré') >= 0 && t.indexOf('leo') >= 0);
}

/**
 * Retorna true se o tipo é "Associado LEO/Leão", "Apenas LEO/Leão" ou "Companheiro LEO/Leão"
 * (apenas modalidades coletivas; até 32 anos). Sem "Associado LEO e LEO/Leão" nem "Companheiro LEO e LEO/Leão".
 */
function _ehApenasLeoLeao(tipoInscricao) {
  var t = String(tipoInscricao || '').toLowerCase().replace(/\s+/g, ' ');
  if (t.indexOf(' e leo') >= 0 || t.indexOf(' e leão') >= 0) return false;
  if (t.indexOf('leo/leao') >= 0 || t.indexOf('leo/leão') >= 0 || t.indexOf('leo/leao') >= 0)
    return t.indexOf('associado') >= 0 || t.indexOf('apenas') >= 0 || t.indexOf('companheiro') >= 0;
  if ((t.indexOf('apenas') >= 0 || t.indexOf('companheiro') >= 0) && (t.indexOf('leo') >= 0 || t.indexOf('leão') >= 0 || t.indexOf('leao') >= 0))
    return true;
  return false;
}

/**
 * Calcula idade em anos na data de referência a partir de data de nascimento.
 * Aceita dd/mm/yyyy ou yyyy-mm-dd.
 * @param {string} dataNascStr
 * @param {Date} dataRef
 * @returns {number|null} Idade em anos ou null se inválido
 */
function _calcularIdadeEmData(dataNascStr, dataRef) {
  if (!dataNascStr || !dataRef || !(dataRef instanceof Date) || isNaN(dataRef.getTime())) return null;
  var s = String(dataNascStr).trim();
  var iso = s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) iso = s.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1');
  else if (s.indexOf('/') >= 0) iso = s.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1');
  var d = new Date(iso.split('T')[0].substring(0, 10) + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  var anos = dataRef.getFullYear() - d.getFullYear();
  var m = dataRef.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && dataRef.getDate() < d.getDate())) anos--;
  return anos;
}

/**
 * Calcula idade em anos na data de referência. Data nascimento: dd/mm/yyyy ou yyyy-mm-dd.
 * @param {string} dataNascStr
 * @param {Date} dataRef
 * @returns {number|null} idade em anos ou null se inválido
 */
function _calcularIdadeEmData(dataNascStr, dataRef) {
  if (!dataNascStr || !dataRef || !(dataRef instanceof Date) || isNaN(dataRef.getTime())) return null;
  var s = String(dataNascStr).trim();
  var iso = s.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1').split('T')[0].substring(0, 10);
  if (iso.length !== 10) return null;
  var nasc = new Date(iso + 'T12:00:00');
  if (isNaN(nasc.getTime())) return null;
  var anos = dataRef.getFullYear() - nasc.getFullYear();
  var m = dataRef.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && dataRef.getDate() < nasc.getDate())) anos--;
  return anos;
}

/**
 * Calcula idade em anos na data de referência. dataNascimento: DD/MM/YYYY ou ISO.
 * @param {string} dataNascimentoStr
 * @param {Date} [dataRef] - default hoje
 * @returns {number|null} idade ou null se data inválida
 */
function _idadeEmData(dataNascimentoStr, dataRef) {
  if (!dataNascimentoStr || !String(dataNascimentoStr).trim()) return null;
  var str = String(dataNascimentoStr).trim();
  var iso = str.indexOf('/') >= 0 ? str.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1').split('T')[0].substring(0, 10) : str.split('T')[0].substring(0, 10);
  var nasc = new Date(iso + 'T12:00:00');
  if (isNaN(nasc.getTime())) return null;
  var ref = dataRef || new Date();
  var anos = ref.getFullYear() - nasc.getFullYear();
  var m = ref.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < nasc.getDate())) anos--;
  return anos;
}

/**
 * Calcula "Apto a Competir" para uma inscrição: data de posse <= data de corte do evento;
 * Amigo LEO/Conselheiro = Apenas Coletivas; Apenas LEO/Leão até 32 anos = Apenas Coletivas; Pré-LEO = Não.
 * Para inscrições do Gabinete Distrital, usa o clube de origem para buscar data de posse no RTMA.
 * @param {string} eventoId
 * @param {string} inscricaoId
 * @returns {{ aptoACompetir: string, dataPosse?: string, tipo?: string, pessoaNome?: string, semClubeOrigem?: boolean }}
 */
/**
 * Carrega todo o cache necessário para validar credenciamento em lote (uma única chamada).
 * Retorna mapa inscricaoId -> { aptoACompetir, pessoaNome, naoEncontradoRTMA? }.
 * O frontend armazena em localStorage e valida localmente sem novas consultas.
 * @param {string} eventoId
 * @returns {Object} { mapaApto: Object, timestamp: number }
 */
async function obterCacheValidacaoCredenciamento(eventoId) {
  try {
    var mapaApto = {};
    var eventos = (typeof portalListarEventos === 'function') ? await portalListarEventos() : [];
    var evento = (eventos || []).find(function(e) { return String(e.id) === String(eventoId); });
    var dataCorteStr = evento && evento.dataCorteCompetidores ? String(evento.dataCorteCompetidores).trim() : '';
    var inscricoes = (typeof portalListarInscricoesEvento === 'function') ? await portalListarInscricoesEvento(eventoId) : [];
    if (!inscricoes || inscricoes.length === 0) return { mapaApto: {}, timestamp: Date.now() };

    var clubesUnicos = {};
    (inscricoes || []).forEach(function(i) {
      var c = i.clubeNome || 'Sem clube';
      var ehGD = String(c).toLowerCase().indexOf('gabinete distrital') >= 0;
      if (ehGD && (i.clubeOrigemNome || i.clube_origem_nome)) c = String(i.clubeOrigemNome || i.clube_origem_nome).trim();
      if (c) clubesUnicos[c] = true;
    });
    var clubesLista = Object.keys(clubesUnicos);

    var cacheRTMA = {};
    var cacheAmigos = {};
    await Promise.all(clubesLista.map(async (clube) => {
      const [pessoas, amigos] = await Promise.all([
        (typeof buscarPessoasRTMA === 'function') ? buscarPessoasRTMA(clube, null, null, null) : Promise.resolve([]),
        (typeof buscarAmigosConselheiros === 'function') ? buscarAmigosConselheiros(clube, null) : Promise.resolve([])
      ]);
      cacheRTMA[clube] = pessoas || [];
      cacheAmigos[clube] = amigos || [];
    }));

    var dataCorteObj = null;
    if (dataCorteStr) {
      dataCorteObj = new Date(dataCorteStr.split('T')[0] + 'T12:00:00');
      if (isNaN(dataCorteObj.getTime())) dataCorteObj = null;
    }

    inscricoes.forEach(function(inscricao) {
      var id = String(inscricao.id || inscricao.inscricaoId || '').trim().toLowerCase();
      if (!id) return;
      var clube = inscricao.clubeNome || 'Sem clube';
      var ehGabineteDistrital = String(clube).toLowerCase().indexOf('gabinete distrital') >= 0;
      var clubeOrigem = (inscricao.clubeOrigemNome || inscricao.clube_origem_nome || '').trim();
      if (ehGabineteDistrital && clubeOrigem) clube = clubeOrigem;
      if (ehGabineteDistrital && !clubeOrigem) {
        mapaApto[id] = { aptoACompetir: 'Não', pessoaNome: inscricao.pessoaNome || '', semClubeOrigem: true };
        return;
      }
      var nome = String(inscricao.pessoaNome || '').trim();
      var pessoaNome = inscricao.pessoaNome || '';
      var nomeNorm = _normalizarNomeParaComparacao(nome);
      var pessoasRTMA = cacheRTMA[clube] || [];
      var amigos = cacheAmigos[clube] || [];
      var pessoaRTMA = (pessoasRTMA || []).find(function(p) { return _normalizarNomeParaComparacao(p.nome) === nomeNorm; });
      if (!pessoaRTMA) {
        var nomeNormSimples = (nome || '').trim().replace(/\s+/g, ' ').toLowerCase();
        pessoaRTMA = (pessoasRTMA || []).find(function(p) { return (String(p.nome || '').trim().replace(/\s+/g, ' ').toLowerCase()) === nomeNormSimples; });
      }
      var pessoaAmigo = (amigos || []).find(function(a) { return _normalizarNomeParaComparacao(a.nome) === nomeNorm; });
      if (!pessoaAmigo) pessoaAmigo = (amigos || []).find(function(a) { return String(a.nome || '').trim() === nome; });
      var tipoInscricao = String(inscricao.pessoaTipo || '').toLowerCase();
      var ehAmigo = tipoInscricao.indexOf('amigo') >= 0 || tipoInscricao.indexOf('conselheiro') >= 0;
      var dataPosse = '';
      if (pessoaRTMA) dataPosse = String(pessoaRTMA.associadoDesde || pessoaRTMA.associado_desde || '').trim();
      var tipoParaRegra = (inscricao.pessoaTipo || (pessoaRTMA ? pessoaRTMA.tipo : '') || '').trim();
      if (_ehPreLeo(tipoParaRegra)) {
        mapaApto[id] = { aptoACompetir: 'Não', tipo: inscricao.pessoaTipo || '', pessoaNome: pessoaNome };
        return;
      }
      if (ehAmigo) {
        mapaApto[id] = { aptoACompetir: 'Apenas Coletivas', tipo: inscricao.pessoaTipo || '', pessoaNome: pessoaNome };
        return;
      }
      if (_ehApenasLeoLeao(tipoParaRegra) && pessoaRTMA) {
        var dataNasc = String(pessoaRTMA.dataNascimento || pessoaRTMA.data_nascimento || '').trim();
        if (dataNasc) {
          var refDate = dataCorteObj || new Date();
          var idade = _calcularIdadeEmData(dataNasc, refDate);
          if (idade !== null && idade <= 32) {
            mapaApto[id] = { aptoACompetir: 'Apenas Coletivas', tipo: inscricao.pessoaTipo || '', pessoaNome: pessoaNome };
            return;
          }
        }
      }
      if (!dataCorteStr) {
        mapaApto[id] = { aptoACompetir: dataPosse ? 'Sim' : 'Não', dataPosse: dataPosse || '', pessoaNome: pessoaNome };
        return;
      }
      if (!dataCorteObj) {
        mapaApto[id] = { aptoACompetir: dataPosse ? 'Sim' : 'Não', dataPosse: dataPosse || '', pessoaNome: pessoaNome };
        return;
      }
      if (!dataPosse) {
        var naoEncontradoRTMA = ehGabineteDistrital && clubeOrigem && !pessoaRTMA;
        mapaApto[id] = { aptoACompetir: 'Não', dataPosse: '', pessoaNome: pessoaNome, naoEncontradoRTMA: !!naoEncontradoRTMA };
        return;
      }
      var dataPosseStrNorm = String(dataPosse).trim();
      var isoPosse = dataPosseStrNorm.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1').split('T')[0].substring(0, 10);
      var dataPosseObj = new Date(isoPosse + 'T12:00:00');
      if (isNaN(dataPosseObj.getTime())) {
        mapaApto[id] = { aptoACompetir: 'Não', dataPosse: dataPosse, pessoaNome: pessoaNome };
        return;
      }
      var apto = dataPosseObj <= dataCorteObj ? 'Sim' : 'Não';
      mapaApto[id] = { aptoACompetir: apto, dataPosse: dataPosse, pessoaNome: pessoaNome };
    });

    var mapaCredenciados = {};
    var mapaParticipou = {};
    var mapaBloqueios = {};
    try {
      var creds = (typeof portalListarCredenciamentosEvento === 'function') ? (await portalListarCredenciamentosEvento(eventoId)) : [];
      (creds || []).forEach(function(c) {
        var iid = String(c.inscricao_id || c.inscricaoId || '').trim().toLowerCase();
        var mid = String(c.modalidade_id || c.modalidadeId || '').trim();
        if (iid && mid) {
          mapaCredenciados[iid + '|' + mid] = true;
          if (!mapaParticipou[iid]) mapaParticipou[iid] = [];
          if (mapaParticipou[iid].indexOf(mid) < 0) mapaParticipou[iid].push(mid);
        }
      });
      var bloqueios = (typeof portalListarTodosBloqueiosModalidade === 'function') ? (await portalListarTodosBloqueiosModalidade()) : [];
      (bloqueios || []).forEach(function(b) {
        var orig = String(b.modalidade_id_origem || b.modalidadeIdOrigem || '').trim();
        var bloc = String(b.modalidade_id_bloqueada || b.modalidadeIdBloqueada || '').trim();
        if (orig && bloc) {
          if (!mapaBloqueios[orig]) mapaBloqueios[orig] = [];
          if (mapaBloqueios[orig].indexOf(bloc) < 0) mapaBloqueios[orig].push(bloc);
        }
      });
    } catch (e) { console.warn('Cache credenciados/bloqueios:', e); }

    return { mapaApto: mapaApto, mapaCredenciados: mapaCredenciados, mapaParticipou: mapaParticipou, mapaBloqueios: mapaBloqueios, timestamp: Date.now() };
  } catch (e) {
    console.error('obterCacheValidacaoCredenciamento:', e);
    return { mapaApto: {}, mapaCredenciados: {}, mapaParticipou: {}, mapaBloqueios: {}, timestamp: 0 };
  }
}

async function obterAptoACompetirInscricao(eventoId, inscricaoId) {
  try {
    const eventos = (typeof portalListarEventos === 'function') ? await portalListarEventos() : [];
    const evento = (eventos || []).find(function(e) { return String(e.id) === String(eventoId); });
    const dataCorteStr = evento && evento.dataCorteCompetidores ? String(evento.dataCorteCompetidores).trim() : '';
    const inscricoes = (typeof portalListarInscricoesEvento === 'function') ? await portalListarInscricoesEvento(eventoId) : [];
    const inscricao = (inscricoes || []).find(function(i) { return String(i.id) === String(inscricaoId); });
    if (!inscricao) return { aptoACompetir: 'Não', pessoaNome: '' };
    var clube = inscricao.clubeNome || 'Sem clube';
    var ehGabineteDistrital = String(clube).toLowerCase().indexOf('gabinete distrital') >= 0;
    var clubeOrigem = (inscricao.clubeOrigemNome || inscricao.clube_origem_nome || '').trim();
    if (ehGabineteDistrital && clubeOrigem) {
      clube = clubeOrigem;
    }
    if (ehGabineteDistrital && !clubeOrigem) {
      return { aptoACompetir: 'Não', dataPosse: '', pessoaNome: inscricao.pessoaNome || '', semClubeOrigem: true };
    }
    const nome = String(inscricao.pessoaNome || '').trim();
    const pessoaNome = inscricao.pessoaNome || '';
    const nomeNorm = _normalizarNomeParaComparacao(nome);
    const pessoasRTMA = (typeof buscarPessoasRTMA === 'function') ? await buscarPessoasRTMA(clube, null, null, null) : [];
    const amigos = (typeof buscarAmigosConselheiros === 'function') ? await buscarAmigosConselheiros(clube, null) : [];
    var pessoaRTMA = (pessoasRTMA || []).find(function(p) { return _normalizarNomeParaComparacao(p.nome) === nomeNorm; });
    if (!pessoaRTMA) {
      var nomeNormSimples = (nome || '').trim().replace(/\s+/g, ' ').toLowerCase();
      pessoaRTMA = (pessoasRTMA || []).find(function(p) { return (String(p.nome || '').trim().replace(/\s+/g, ' ').toLowerCase()) === nomeNormSimples; });
    }
    var pessoaAmigo = (amigos || []).find(function(a) { return _normalizarNomeParaComparacao(a.nome) === nomeNorm; });
    if (!pessoaAmigo) pessoaAmigo = (amigos || []).find(function(a) { return String(a.nome || '').trim() === nome; });
    const tipoParaRegra = String(inscricao.pessoaTipo || (pessoaRTMA ? pessoaRTMA.tipo : '') || '').trim();
    const tipoInscricao = tipoParaRegra.toLowerCase();
    const ehAmigo = tipoInscricao.indexOf('amigo') >= 0 || tipoInscricao.indexOf('conselheiro') >= 0;
    var dataPosse = '';
    if (pessoaRTMA) {
      dataPosse = String(pessoaRTMA.associadoDesde || pessoaRTMA.associado_desde || '').trim();
    }
    if (_ehPreLeo(tipoParaRegra)) return { aptoACompetir: 'Não', tipo: inscricao.pessoaTipo || '', pessoaNome: pessoaNome };
    if (ehAmigo) return { aptoACompetir: 'Apenas Coletivas', tipo: inscricao.pessoaTipo || '', pessoaNome: pessoaNome };
    if (_ehApenasLeoLeao(tipoParaRegra) && pessoaRTMA) {
      var dataNasc = String(pessoaRTMA.dataNascimento || pessoaRTMA.data_nascimento || '').trim();
      if (dataNasc) {
        var refDate = dataCorteStr ? new Date(dataCorteStr.split('T')[0] + 'T12:00:00') : new Date();
        if (!isNaN(refDate.getTime())) {
          var idade = _calcularIdadeEmData(dataNasc, refDate);
          if (idade !== null && idade <= 32) return { aptoACompetir: 'Apenas Coletivas', tipo: inscricao.pessoaTipo || '', pessoaNome: pessoaNome };
        }
      }
    }
    if (!dataCorteStr) return { aptoACompetir: dataPosse ? 'Sim' : 'Não', dataPosse: dataPosse || '', pessoaNome: pessoaNome };
    var dataCorteObj = new Date(dataCorteStr.split('T')[0] + 'T12:00:00');
    if (isNaN(dataCorteObj.getTime())) return { aptoACompetir: dataPosse ? 'Sim' : 'Não', dataPosse: dataPosse || '', pessoaNome: pessoaNome };
    if (!dataPosse) {
      var naoEncontradoRTMA = ehGabineteDistrital && clubeOrigem && !pessoaRTMA;
      return { aptoACompetir: 'Não', dataPosse: '', pessoaNome: pessoaNome, naoEncontradoRTMA: !!naoEncontradoRTMA };
    }
    var dataPosseStrNorm = String(dataPosse).trim();
    var isoPosse = dataPosseStrNorm.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1').split('T')[0].substring(0, 10);
    var dataPosseObj = new Date(isoPosse + 'T12:00:00');
    if (isNaN(dataPosseObj.getTime())) return { aptoACompetir: 'Não', dataPosse: dataPosse, pessoaNome: pessoaNome };
    return { aptoACompetir: dataPosseObj <= dataCorteObj ? 'Sim' : 'Não', dataPosse: dataPosse, pessoaNome: pessoaNome };
  } catch (e) {
    console.error('obterAptoACompetirInscricao:', e);
    return { aptoACompetir: 'Não', pessoaNome: '' };
  }
}

async function credenciarInscricaoModalidade(inscricaoId, eventoId, modalidadeId) {
  try {
    if (typeof portalCredenciarInscricaoModalidade !== 'function') {
      return { ok: false, erro: 'Função não disponível.' };
    }
    var apto = await obterAptoACompetirInscricao(eventoId, inscricaoId);
    if (apto.aptoACompetir === 'Apenas Coletivas') {
      var mod = (typeof portalObterModalidade === 'function') ? await portalObterModalidade(modalidadeId) : null;
      if (!mod || !mod.coletiva) {
        return { ok: false, erro: 'Apenas LEO/Leão até 32 anos e Amigos LEO/Conselheiros participam apenas de modalidades coletivas.', pessoaNome: apto.pessoaNome || '', aptoACompetir: 'Apenas Coletivas' };
      }
    } else if (apto.aptoACompetir !== 'Sim') {
      var msg = 'Não apto a competir. ';
      if (apto.semClubeOrigem) {
        msg += 'Inscrição do Gabinete Distrital sem clube de origem. Edite a inscrição e informe o clube de origem da pessoa (clube onde consta no RTMA com data de posse).';
      } else if (apto.naoEncontradoRTMA) {
        msg += 'Pessoa não encontrada no RTMA do clube de origem ou sem data de posse. Verifique se o nome está igual ao do RTMA desse clube e se há data de posse cadastrada.';
      } else {
        msg += 'Verifique data de posse no clube de origem e data de corte do evento.';
      }
      return { ok: false, erro: msg, pessoaNome: apto.pessoaNome || '', aptoACompetir: apto.aptoACompetir || '' };
    }
    const res = await portalCredenciarInscricaoModalidade(inscricaoId, eventoId, modalidadeId);
    if (res && res.ok) {
      res.aptoACompetir = 'Sim';
    }
    return res;
  } catch (e) {
    console.error('credenciarInscricaoModalidade:', e);
    return { ok: false, erro: (e && e.message) ? e.message : 'Erro ao credenciar.' };
  }
}

async function listarTrocasInscricaoEvento(eventoId) {
  try {
    const eventoIdLimpo = String(eventoId || '').trim();
    if (!eventoIdLimpo) return {};
    const table = PORTAL_SUPABASE_TABLES.solicitacoes_alteracao;
    const path = `${table}?tipo=eq.${encodeURIComponent('troca')}&status=eq.${encodeURIComponent('aprovada')}&select=id,item_id,dados_novos,dados_anteriores,created_at`;
    const resp = await portalSupabaseFetch(path, { method: 'GET' });
    if (resp.getResponseCode() !== 200) {
      console.error('listarTrocasInscricaoEvento erro:', resp.getResponseCode(), resp.getContentText());
      return {};
    }
    const rows = JSON.parse(resp.getContentText() || '[]');
    const mapa = {};
    (rows || []).forEach(row => {
      const itemId = row.item_id || row.itemId || '';
      let dadosNovos = row.dados_novos || row.dadosNovos || null;
      if (typeof dadosNovos === 'string') {
        try { dadosNovos = JSON.parse(dadosNovos); } catch (e) {}
      }
      let dadosAnteriores = row.dados_anteriores || row.dadosAnteriores || null;
      if (typeof dadosAnteriores === 'string') {
        try { dadosAnteriores = JSON.parse(dadosAnteriores); } catch (e) {}
      }
      const eventoRow = dadosNovos && (dadosNovos.eventoId || dadosNovos.evento_id)
        ? String(dadosNovos.eventoId || dadosNovos.evento_id)
        : '';
      if (!itemId || !eventoRow || eventoRow !== eventoIdLimpo) return;
      const clubeNovo = dadosNovos && (dadosNovos.clubeDestino || dadosNovos.clube_destino || dadosNovos.clubeNome || dadosNovos.clube_nome)
        ? String(dadosNovos.clubeDestino || dadosNovos.clube_destino || dadosNovos.clubeNome || dadosNovos.clube_nome)
        : '';
      const clubeAntigo = dadosAnteriores && (dadosAnteriores.clubeNome || dadosAnteriores.clube_nome)
        ? String(dadosAnteriores.clubeNome || dadosAnteriores.clube_nome)
        : '';
      const pessoaAntiga = dadosAnteriores && (dadosAnteriores.pessoaNome || dadosAnteriores.pessoa_nome)
        ? String(dadosAnteriores.pessoaNome || dadosAnteriores.pessoa_nome)
        : '';
      mapa[itemId] = {
        id: row.id || '',
        createdAt: row.created_at || row.createdAt || '',
        clubeNovo: clubeNovo,
        clubeAntigo: clubeAntigo,
        pessoaAntiga: pessoaAntiga
      };
    });
    return mapa;
  } catch (error) {
    console.error('Erro ao listar trocas de inscrição:', error);
    return {};
  }
}

async function listarTrocasPendentesPorClube(clubeNome) {
  try {
    const clube = String(clubeNome || '').trim();
    if (!clube) return { sucesso: false, erro: 'Clube não informado.', solicitacoes: [] };
    const pendentes = (await portalListarSolicitacoesAlteracao('pendente')) || [];
    const filtradas = (pendentes || []).filter(sol => {
      if (sol.tipo !== 'troca') return false;
      let dados = sol.dados_novos || sol.dadosNovos || null;
      if (typeof dados === 'string') {
        try { dados = JSON.parse(dados); } catch (e) {}
      }
      const destino = dados && (dados.clubeDestino || dados.clube_destino) ? String(dados.clubeDestino || dados.clube_destino) : '';
      // Troca com pessoa externa (não cadastrada no RTMA): não há clube destino real
      // para aprovar, então o próprio clube solicitante aprova a própria troca.
      const ehExterna = !!(dados && (dados.pessoaExterna || dados.pessoa_externa));
      const solicitante = String(sol.clube_nome || sol.clubeNome || '').trim();
      if (ehExterna) return solicitante === clube;
      return destino === clube;
    });
    return { sucesso: true, solicitacoes: filtradas };
  } catch (error) {
    console.error('Erro ao listar trocas pendentes do clube:', error);
    return { sucesso: false, erro: error.message, solicitacoes: [] };
  }
}

async function processarTrocaInscricaoSolicitacao(solicitacao) {
  try {
    if (!solicitacao) return { sucesso: false, erro: 'Solicitação inválida' };
    let dados = solicitacao.dados_novos || solicitacao.dadosNovos || null;
    if (typeof dados === 'string') {
      try { dados = JSON.parse(dados); } catch (e) {}
    }
    if (!dados) return { sucesso: false, erro: 'Dados da solicitação inválidos' };
    const eventoId = dados.eventoId || dados.evento_id || '';
    const inscricaoId = dados.inscricaoId || dados.inscricao_id || solicitacao.item_id || '';
    const clubeDestino = dados.clubeDestino || dados.clube_destino || dados.clubeNome || '';
    const pessoaNome = dados.pessoaNome || '';
    const pessoaTipo = dados.pessoaTipo || '';
    if (!eventoId || !inscricaoId || !clubeDestino || !pessoaNome) {
      return { sucesso: false, erro: 'Dados obrigatórios incompletos para a troca.' };
    }
    const eventos = (typeof portalListarEventos === 'function') ? await portalListarEventos() : [];
    const evento = (eventos || []).find(e => String(e.id) === String(eventoId));
    if (evento && evento.aceitarTrocas !== true) {
      return { sucesso: false, erro: 'Esse evento não está aceitando trocas de inscrições.' };
    }

    const inscricoes = await portalListarInscricoesEvento(eventoId) || [];
    const duplicada = inscricoes.find(item => {
      const nome = String(item.pessoaNome || '').trim().toLowerCase();
      const id = String(item.id || '').trim();
      return nome === String(pessoaNome || '').trim().toLowerCase() && id !== String(inscricaoId);
    });
    if (duplicada) {
      return { sucesso: false, erro: 'Essa pessoa já está inscrita neste evento.' };
    }

    let clubeId = null;
    if (typeof obterMapaClubesSupabase === 'function') {
      try {
        const clubesMap = await obterMapaClubesSupabase();
        clubeId = clubesMap ? (clubesMap[clubeDestino] || null) : null;
      } catch (e) { console.warn('processarTrocaInscricaoSolicitacao: falha ao obter clubeId', e); }
    }

    await portalAtualizarInscricaoEvento(inscricaoId, {
      pessoaNome: pessoaNome,
      pessoaTipo: pessoaTipo,
      clubeNome: clubeDestino,
      clubeId: clubeId
    });
    return { sucesso: true };
  } catch (error) {
    console.error('Erro ao processar troca de inscrição:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Processa solicitação de transferência de pessoa aprovada (atualiza clube e historico_clubes no RTMA).
 * @param {Object} solicitacao - Solicitação com tipo === 'transferencia'
 * @returns {Object} { sucesso, erro? }
 */
async function processarTransferenciaPessoaSolicitacao(solicitacao) {
  try {
    if (!solicitacao) return { sucesso: false, erro: 'Solicitação inválida' };
    let dadosNovos = solicitacao.dados_novos || solicitacao.dadosNovos || null;
    let dadosAnt = solicitacao.dados_anteriores || solicitacao.dadosAnteriores || null;
    if (typeof dadosNovos === 'string') { try { dadosNovos = JSON.parse(dadosNovos); } catch (e) {} }
    if (typeof dadosAnt === 'string') { try { dadosAnt = JSON.parse(dadosAnt); } catch (e) {} }
    const pessoaId = (solicitacao.item_id || solicitacao.itemId || (dadosNovos && dadosNovos.pessoaId)) || '';
    const clubeDestino = (dadosNovos && (dadosNovos.clubeDestino || dadosNovos.clube_destino)) || '';
    const clubeOrigem = (dadosAnt && (dadosAnt.clubeNome || dadosAnt.clube_nome)) || (solicitacao.clube_nome || '');
    if (!pessoaId || !clubeDestino) {
      return { sucesso: false, erro: 'Dados da transferência incompletos.' };
    }
    let historicoAtual = [];
    if (typeof buscarPessoaPorIdSupabase === 'function') {
      try {
        const pessoa = await buscarPessoaPorIdSupabase(pessoaId);
        if (pessoa && pessoa.historicoClubes && Array.isArray(pessoa.historicoClubes)) {
          historicoAtual = pessoa.historicoClubes;
        } else if (pessoa && pessoa.historico_clubes) {
          historicoAtual = typeof pessoa.historico_clubes === 'string' ? JSON.parse(pessoa.historico_clubes || '[]') : (pessoa.historico_clubes || []);
        }
      } catch (e) {}
    }
    if (typeof transferirPessoaParaClubeSupabase === 'function') {
      const resultado = await transferirPessoaParaClubeSupabase(pessoaId, clubeOrigem, clubeDestino, historicoAtual);
      return (resultado && resultado.sucesso) ? { sucesso: true } : { sucesso: false, erro: (resultado && resultado.erro) || 'Erro ao transferir pessoa.' };
    }
    return { sucesso: false, erro: 'Função de transferência não disponível.' };
  } catch (error) {
    console.error('Erro ao processar transferência de pessoa:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Cria solicitação de transferência de pessoa entre clubes (pendente aprovação do clube destino).
 * @param {string} clubeOrigem - Nome do clube de origem
 * @param {string} pessoaId - ID da pessoa no RTMA
 * @param {string} pessoaNome - Nome da pessoa
 * @param {string} clubeDestino - Nome do clube de destino
 * @param {string} usuarioEmail - Email de quem solicitou
 * @returns {Object} { sucesso, solicitacao?, erro? }
 */
async function criarSolicitacaoTransferenciaPessoa(clubeOrigem, pessoaId, pessoaNome, clubeDestino, usuarioEmail) {
  try {
    if (!clubeOrigem || !pessoaId || !pessoaNome || !clubeDestino) {
      return { sucesso: false, erro: 'Clube origem, pessoa e clube destino são obrigatórios.' };
    }
    if (String(clubeOrigem).trim() === String(clubeDestino).trim()) {
      return { sucesso: false, erro: 'Clube de destino deve ser diferente do atual.' };
    }
    if (typeof portalCriarSolicitacaoAlteracao !== 'function') {
      return { sucesso: false, erro: 'Módulo de solicitações não disponível.' };
    }
    const solicitacao = await portalCriarSolicitacaoAlteracao({
      tipo: 'transferencia',
      tipoItem: 'pessoa',
      itemId: pessoaId,
      clubeNome: clubeOrigem,
      usuarioEmail: usuarioEmail || '',
      status: 'pendente',
      justificativa: 'Transferência de associado entre clubes.',
      dadosAnteriores: { clubeNome: clubeOrigem, pessoaNome: pessoaNome, pessoaId: pessoaId },
      dadosNovos: { clubeDestino: clubeDestino, pessoaNome: pessoaNome, pessoaId: pessoaId }
    });
    return { sucesso: true, solicitacao: solicitacao };
  } catch (error) {
    console.error('Erro ao criar solicitação de transferência:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Lista transferências pendentes cujo clube destino é o informado (para o clube aprovar).
 * @param {string} clubeNome - Nome do clube (destino)
 * @returns {Object} { sucesso, solicitacoes: [] }
 */
async function listarTransferenciasPendentesPorClube(clubeNome) {
  try {
    const clube = String(clubeNome || '').trim();
    if (!clube) return { sucesso: false, erro: 'Clube não informado.', solicitacoes: [] };
    const pendentes = (await portalListarSolicitacoesAlteracao('pendente')) || [];
    const filtradas = (pendentes || []).filter(sol => {
      if (sol.tipo !== 'transferencia') return false;
      let dados = sol.dados_novos || sol.dadosNovos || null;
      if (typeof dados === 'string') {
        try { dados = JSON.parse(dados); } catch (e) {}
      }
      const destino = dados && (dados.clubeDestino || dados.clube_destino) ? String(dados.clubeDestino || dados.clube_destino) : '';
      return destino === clube;
    });
    return { sucesso: true, solicitacoes: filtradas };
  } catch (error) {
    console.error('Erro ao listar transferências pendentes do clube:', error);
    return { sucesso: false, erro: error.message, solicitacoes: [] };
  }
}

async function adicionarComprovanteEnvio(dados) {
  try {
    if (!dados || !dados.envioId || !dados.comprovanteBase64 || !dados.comprovanteNome) {
      return { sucesso: false, erro: 'Envio e comprovante são obrigatórios.' };
    }
    const envio = await portalBuscarEnvioEvento(dados.envioId);
    if (!envio) {
      return { sucesso: false, erro: 'Envio não encontrado.' };
    }
    const base64String = String(dados.comprovanteBase64);
    const parts = base64String.split(',');
    const base64Data = parts.length > 1 ? parts[1] : parts[0];
    const mimeFromDataUrl = parts.length > 1 ? (parts[0].match(/data:(.*);base64/) || [])[1] : null;
    const mimeType = dados.comprovanteMime || mimeFromDataUrl || 'application/octet-stream';

    const bytes = Buffer.from(base64Data, "base64");
    const blob = Utilities.newBlob(bytes, mimeType, dados.comprovanteNome);

    const comprovanteInfo = await portalUploadComprovanteEvento(
      blob,
      dados.comprovanteNome,
      envio.eventoId,
      envio.clubeNome,
      'complementar'
    );

    if (!comprovanteInfo || !comprovanteInfo.sucesso) {
      return { sucesso: false, erro: comprovanteInfo && comprovanteInfo.erro ? comprovanteInfo.erro : 'Erro ao enviar comprovante.' };
    }

    const comprovante = await portalCriarComprovanteEnvio({
      envioId: envio.id,
      comprovanteUrl: comprovanteInfo.url,
      comprovanteNome: comprovanteInfo.nomeArquivo || dados.comprovanteNome,
      comprovanteMime: comprovanteInfo.tipo || dados.comprovanteMime,
      comprovanteTamanho: comprovanteInfo.tamanho || dados.comprovanteTamanho,
      valor: (dados.valor !== undefined && dados.valor !== null) ? dados.valor : null
    });

    return { sucesso: true, comprovante: comprovante };
  } catch (error) {
    console.error('Erro ao adicionar comprovante ao envio:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Upload da foto de capa do evento (bucket eventos-fotos).
 * Chamada pelo front com google.script.run.uploadFotoEvento({ fotoBase64, fotoNome, eventoId }).
 * Retorna { sucesso, url } ou { sucesso: false, erro }.
 */
async function uploadFotoEvento(dados) {
  try {
    if (!dados || !dados.fotoBase64 || !dados.fotoNome || !dados.eventoId) {
      return { sucesso: false, erro: 'Foto (base64), nome e ID do evento são obrigatórios.' };
    }
    const base64String = String(dados.fotoBase64);
    const parts = base64String.split(',');
    const base64Data = parts.length > 1 ? parts[1] : parts[0];
    const mimeFromDataUrl = parts.length > 1 ? (parts[0].match(/data:(.*);base64/) || [])[1] : null;
    const mimeType = dados.fotoMime || mimeFromDataUrl || 'image/jpeg';
    const bytes = Buffer.from(base64Data, "base64");
    const blob = Utilities.newBlob(bytes, mimeType, dados.fotoNome);
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (blob.getBytes().length > maxSize) {
      return { sucesso: false, erro: 'Arquivo muito grande. Máximo 5MB.' };
    }
    const resultado = typeof portalUploadFotoEvento === 'function'
      ? await portalUploadFotoEvento(blob, dados.fotoNome, dados.eventoId)
      : { sucesso: false, erro: 'portalUploadFotoEvento não disponível.' };
    if (!resultado.sucesso) {
      return { sucesso: false, erro: resultado.erro || 'Erro ao enviar foto.' };
    }
    return { sucesso: true, url: resultado.url };
  } catch (error) {
    console.error('Erro em uploadFotoEvento:', error);
    return { sucesso: false, erro: error.message };
  }
}

async function excluirComprovanteEnvio(dados) {
  try {
    const comprovanteId = dados && dados.comprovanteId ? dados.comprovanteId : '';
    const comprovanteUrl = dados && dados.comprovanteUrl ? dados.comprovanteUrl : '';
    if (!comprovanteId && !comprovanteUrl) {
      return { sucesso: false, erro: 'Comprovante não informado.' };
    }
    const ok = await portalExcluirComprovanteEnvio(comprovanteId, comprovanteUrl);
    return { sucesso: !!ok };
  } catch (error) {
    console.error('Erro ao excluir comprovante:', error);
    return { sucesso: false, erro: error.message };
  }
}

async function excluirEnvioEvento(envioId) {
  try {
    if (!envioId) {
      return { sucesso: false, erro: 'Envio não informado.' };
    }
    const inscricoes = (await portalListarInscricoesEnvio(envioId)) || [];
    const lotesAfetados = {};
    inscricoes.forEach(item => {
      if (item && item.loteId) lotesAfetados[item.loteId] = true;
    });
    await portalExcluirEnvioEvento(envioId);
    for (const loteId of Object.keys(lotesAfetados)) {
      await portalRecalcularQuantidadeUsadaLote(loteId);
    }
    return { sucesso: true };
  } catch (error) {
    console.error('Erro ao excluir envio:', error);
    return { sucesso: false, erro: error.message };
  }
}

async function migrarEnviosEventos(eventoId) {
  try {
    console.log('migrarEnviosEventos v3', new Date().toISOString());
    const eventos = eventoId ? [{ id: eventoId }] : ((await portalListarEventos()) || []);
    const resultados = [];
    for (const evento of eventos) {
      const eventoAtualId = String(evento.id || '').trim();
      if (!eventoAtualId) continue;
      const inscricoes = await portalListarInscricoesEventoRaw(eventoAtualId);
      if (!Array.isArray(inscricoes)) {
        console.error('migrarEnviosEventos: inscrições inválidas', { eventoId: eventoAtualId, tipo: typeof inscricoes });
        continue;
      }
      console.log('migrarEnviosEventos: evento', { eventoId: eventoAtualId, total: inscricoes.length });
      const grupos = {};
      let ultimoIdx = -1;
      try {
        for (let idx = 0; idx < inscricoes.length; idx++) {
          ultimoIdx = idx;
          const item = inscricoes[idx];
          if (!item || typeof item !== 'object') {
            console.warn('migrarEnviosEventos: inscrição inválida', { eventoId: eventoAtualId, idx: idx, item: item });
            continue;
          }
          let envioExistente = '';
          try {
            envioExistente = item.envio_id || '';
          } catch (e) {
            console.error('migrarEnviosEventos: erro ao ler envio_id', { eventoId: eventoAtualId, idx: idx, item: item, erro: e && e.message });
            continue;
          }
          if (envioExistente) continue;
          const clube = item.clube_nome || 'Sem clube';
          let chave = '';
          if (item.comprovante_url) {
            chave = `URL:${item.comprovante_url}`;
          } else if (item.comprovante_nome) {
            chave = `NOME:${item.comprovante_nome}__${item.comprovante_tamanho || 0}`;
          } else {
            chave = `SEM:${item.id}`;
          }
          const key = `${clube}__${chave}`;
          if (!grupos[key]) {
            grupos[key] = {
              clubeNome: clube,
              comprovanteUrl: item.comprovante_url || '',
              comprovanteNome: item.comprovante_nome || '',
              comprovanteMime: item.comprovante_mime || '',
              comprovanteTamanho: item.comprovante_tamanho || 0,
              inscricoes: []
            };
          }
          grupos[key].inscricoes.push(item);
        }
      } catch (loopError) {
        console.error('migrarEnviosEventos: erro no loop', {
          eventoId: eventoAtualId,
          ultimoIdx: ultimoIdx,
          erro: loopError && loopError.message,
          stack: loopError && loopError.stack
        });
        throw loopError;
      }

      let enviosCriados = 0;
      let inscricoesAtualizadas = 0;
      for (const key of Object.keys(grupos)) {
        const grupo = grupos[key];
        const clubeIdResolvido = (typeof portalResolverClubeIdPorNome === 'function')
          ? await portalResolverClubeIdPorNome(grupo.clubeNome) : null;
        const envio = await portalCriarEnvioEvento({
          eventoId: eventoAtualId,
          clubeNome: grupo.clubeNome,
          clubeId: clubeIdResolvido
        });
        if (!envio || !envio.id) continue;
        enviosCriados++;
        if (grupo.comprovanteUrl) {
          await portalCriarComprovanteEnvio({
            envioId: envio.id,
            comprovanteUrl: grupo.comprovanteUrl,
            comprovanteNome: grupo.comprovanteNome,
            comprovanteMime: grupo.comprovanteMime,
            comprovanteTamanho: grupo.comprovanteTamanho
          });
        }
        for (const inscricao of (grupo.inscricoes || [])) {
          await portalAtualizarInscricaoEvento(inscricao.id, { envioId: envio.id });
          inscricoesAtualizadas++;
        }
      }
      resultados.push({
        eventoId: eventoAtualId,
        enviosCriados: enviosCriados,
        inscricoesAtualizadas: inscricoesAtualizadas
      });
    }
    return { sucesso: true, resultados: resultados };
  } catch (error) {
    console.error('Erro ao migrar envios:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Gerar dados do relatório de inscritos do evento para exportação XLSX no client.
 * @param {string} eventoId
 * @return {Object} Dados estruturados para XLSX
 */
async function gerarRelatorioInscritosEventoDados(eventoId) {
  try {
    if (!eventoId) {
      return { sucesso: false, erro: 'Evento não informado.' };
    }

    const eventos = (typeof portalListarEventos === 'function') ? await portalListarEventos() : [];
    const evento = (eventos || []).find(e => String(e.id) === String(eventoId)) || {};
    const inscricoes = (typeof portalListarInscricoesEvento === 'function') ? await portalListarInscricoesEvento(eventoId) : [];

    if (!inscricoes || inscricoes.length === 0) {
      return { sucesso: false, erro: 'Nenhuma inscrição encontrada para este evento.' };
    }

    const porClube = {};
    const totaisPorClubeLote = {};
    inscricoes.forEach(inscricao => {
      const clube = inscricao.clubeNome || 'Sem clube';
      const lote = inscricao.loteNome || inscricao.tipoInscricao || 'Sem lote';
      if (!porClube[clube]) porClube[clube] = [];
      porClube[clube].push(inscricao);

      if (!totaisPorClubeLote[clube]) totaisPorClubeLote[clube] = {};
      if (!totaisPorClubeLote[clube][lote]) {
        totaisPorClubeLote[clube][lote] = { qtd: 0, valor: inscricao.valorLote || 0 };
      }
      totaisPorClubeLote[clube][lote].qtd += 1;
      if (inscricao.valorLote !== undefined && inscricao.valorLote !== null) {
        totaisPorClubeLote[clube][lote].valor = Number(inscricao.valorLote) || 0;
      }
    });

    const clubesOrdenados = Object.keys(totaisPorClubeLote).sort();
    const resumo = [];
    let totalGeral = 0;
    clubesOrdenados.forEach(clube => {
      const lotes = totaisPorClubeLote[clube];
      Object.keys(lotes).sort().forEach(lote => {
        const item = lotes[lote];
        const valorTotal = (item.qtd || 0) * (item.valor || 0);
        totalGeral += valorTotal;
        resumo.push({
          clube: clube,
          lote: lote,
          qtd: item.qtd || 0,
          valorUnitario: item.valor || 0,
          valorTotal: valorTotal
        });
      });
    });

    const normalizarContatoAmigo = (amigo) => {
      if (!amigo) return { email: '', telefone: '', cidade: '', cep: '' };
      const campos = [amigo.email, amigo.telefone, amigo.logradouro, amigo.cidade, amigo.cep];
      const email = (campos.find(item => String(item || '').includes('@')) || '') || '';
      const telefone = (campos.find(item => {
        const digitos = String(item || '').replace(/\D/g, '');
        return digitos.length >= 8;
      }) || '') || '';
      const cep = (campos.find(item => {
        const digitos = String(item || '').replace(/\D/g, '');
        return digitos.length === 8;
      }) || '') || '';
      let cidade = '';
      if (amigo.cidade && /[A-Za-zÀ-ÿ]/.test(String(amigo.cidade)) && !String(amigo.cidade).includes('@')) {
        cidade = amigo.cidade;
      }
      if (!cidade) {
        const candidato = campos.find(item => {
          const texto = String(item || '');
          if (!texto || texto.includes('@')) return false;
          const digitos = texto.replace(/\D/g, '');
          if (digitos.length >= 8) return false;
          return /[A-Za-zÀ-ÿ]/.test(texto);
        });
        cidade = candidato || '';
      }
      return { email, telefone, cidade, cep };
    };

    var configSupabase = (typeof RTMA_SUPABASE_CONFIG !== 'undefined') ? RTMA_SUPABASE_CONFIG : { url: 'https://bqkttaflhtsdkamgscnf.supabase.co', serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY };

    const clubes = [];
    for (const clube of clubesOrdenados) {
      const pessoasRTMA = (typeof buscarPessoasRTMA === 'function') ? await buscarPessoasRTMA(clube, null, null, null) : [];
      const amigos = (typeof buscarAmigosConselheiros === 'function') ? await buscarAmigosConselheiros(clube, null) : [];

      const mapaRTMAPorNorm = {};
      (pessoasRTMA || []).forEach(p => {
        if (p && p.nome) mapaRTMAPorNorm[_normalizarNomeParaComparacao(p.nome)] = p;
      });
      const mapaAmigosPorNorm = {};
      (amigos || []).forEach(a => {
        if (a && a.nome) mapaAmigosPorNorm[_normalizarNomeParaComparacao(a.nome)] = a;
      });

      var clubesNominataSet = {};
      (porClube[clube] || []).forEach(function (insc) {
        var cn = clube;
        if (String(clube).toLowerCase().indexOf('gabinete distrital') >= 0) {
          var o = (insc.clubeOrigemNome || insc.clube_origem_nome || '').trim();
          if (o) cn = o;
        }
        clubesNominataSet[cn] = true;
      });
      var mapaCargosPorClube = {};
      for (const cn of Object.keys(clubesNominataSet)) {
        var mc = (typeof _obterMapaCargosNominataClubeAlMult === 'function')
          ? await _obterMapaCargosNominataClubeAlMult(cn, AL_NOMINATA_RELATORIO_EVENTOS, configSupabase)
          : {};
        mapaCargosPorClube[cn] = mc || {};
      }

      const linhas = (porClube[clube] || []).map(inscricao => {
        const nome = String(inscricao.pessoaNome || '').trim();
        const nomeNorm = _normalizarNomeParaComparacao(nome);
        const pessoaRTMA = mapaRTMAPorNorm[nomeNorm];
        const pessoaAmigo = mapaAmigosPorNorm[nomeNorm];
        const tipoInscricao = String(inscricao.pessoaTipo || '').toLowerCase();
        const ehAmigo = tipoInscricao.includes('amigo') || tipoInscricao.includes('conselheiro');
        const contatoAmigo = ehAmigo && pessoaAmigo ? normalizarContatoAmigo(pessoaAmigo) : { email: '', telefone: '', cidade: '', cep: '' };
        var tipoRTMAVal = pessoaRTMA ? (pessoaRTMA.tipo || '') : (pessoaAmigo ? (pessoaAmigo.tipo || '') : '');
        var clubeNominata = clube;
        if (String(clube).toLowerCase().indexOf('gabinete distrital') >= 0) {
          var orig = (inscricao.clubeOrigemNome || inscricao.clube_origem_nome || '').trim();
          if (orig) clubeNominata = orig;
        }
        var mapaCargo = mapaCargosPorClube[clubeNominata] || {};
        var cargoNom = mapaCargo[nomeNorm] || '';
        cargoNom = cargoNom ? _unificarSeparadoresCargoExcel(cargoNom) : '';
        var cargoFinal = (cargoNom && String(cargoNom).trim()) ? String(cargoNom).trim() : String(tipoRTMAVal || inscricao.pessoaTipo || '').trim();
        return {
          clube: clube,
          pessoa: nome,
          tipoPessoa: inscricao.pessoaTipo || (pessoaRTMA && pessoaRTMA.tipo) || (pessoaAmigo && pessoaAmigo.tipo) || '',
          lote: inscricao.loteNome || inscricao.tipoInscricao || '',
          valorLote: inscricao.valorLote || 0,
          restricaoAlimentar: !!inscricao.restricaoAlimentar,
          restricaoDescricao: inscricao.restricaoDescricao || '',
          statusRTMA: pessoaRTMA ? (pessoaRTMA.status || '') : '',
          tipoRTMA: tipoRTMAVal,
          cargo: cargoFinal,
          email: pessoaRTMA ? (pessoaRTMA.email || '') : (contatoAmigo.email || ''),
          telefone: pessoaRTMA ? (pessoaRTMA.telefone || '') : (contatoAmigo.telefone || ''),
          cidade: pessoaRTMA ? (pessoaRTMA.cidade || '') : (contatoAmigo.cidade || ''),
          dataNascimento: pessoaRTMA
            ? (pessoaRTMA.dataNascimento || pessoaRTMA.data_nascimento || '')
            : (pessoaAmigo ? (pessoaAmigo.dataNascimento || pessoaAmigo.data_nascimento || '') : ''),
          numeroAssociado: pessoaRTMA ? (pessoaRTMA.numeroAssociado || pessoaRTMA.numero_associado || '') : ''
        };
      });

      clubes.push({ clubeNome: clube, linhas: linhas });
    }

    return {
      sucesso: true,
      dados: {
        evento: {
          id: eventoId,
          nome: evento.nome || '',
          dataInicio: evento.dataInicio || null,
          dataFim: evento.dataFim || null,
          dataEvento: evento.dataEvento || null
        },
        totalInscritos: inscricoes.length,
        resumo: resumo,
        totalGeral: totalGeral,
        clubes: clubes
      }
    };
  } catch (error) {
    console.error('Erro ao gerar dados do relatório de inscritos:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Retorna a data de corte (competidores) do evento para preencher o modal Validar Competidores.
 * @param {string} eventoId
 * @return {{ dataCorteCompetidores: string|null }}
 */
async function getEventoDataCorteCompetidores(eventoId) {
  try {
    const eventos = (typeof portalListarEventos === 'function') ? await portalListarEventos() : [];
    const evento = (eventos || []).find(function(e) { return String(e.id) === String(eventoId); });
    const d = evento && evento.dataCorteCompetidores ? String(evento.dataCorteCompetidores).trim().split('T')[0] : null;
    return { dataCorteCompetidores: d || null };
  } catch (e) {
    console.error('getEventoDataCorteCompetidores:', e);
    return { dataCorteCompetidores: null };
  }
}

/**
 * Atualiza a data de corte (competidores) do evento.
 * @param {string} eventoId
 * @param {string} dataCorteCompetidores YYYY-MM-DD
 */
async function atualizarDataCorteCompetidoresEvento(eventoId, dataCorteCompetidores) {
  if (!eventoId) return;
  if (typeof portalAtualizarEvento !== 'function') return;
  await portalAtualizarEvento(eventoId, { dataCorteCompetidores: dataCorteCompetidores || null });
}

/**
 * Retorna a data de corte (competidores) do evento para pré-preencher o modal.
 * @param {string} eventoId
 * @return {{ dataCorteCompetidores: string|null }}
 */
async function getEventoDataCorteCompetidores(eventoId) {
  try {
    if (!eventoId) return { dataCorteCompetidores: null };
    const eventos = (typeof portalListarEventos === 'function') ? await portalListarEventos() : [];
    const evento = (eventos || []).find(function(e) { return String(e.id) === String(eventoId); });
    const d = evento && evento.dataCorteCompetidores ? String(evento.dataCorteCompetidores).trim().split('T')[0] : null;
    return { dataCorteCompetidores: d || null };
  } catch (e) {
    console.error('getEventoDataCorteCompetidores:', e);
    return { dataCorteCompetidores: null };
  }
}

/**
 * Atualiza a data de corte (competidores) do evento.
 * @param {string} eventoId
 * @param {string} dataCorteStr YYYY-MM-DD
 */
async function atualizarDataCorteCompetidoresEvento(eventoId, dataCorteStr) {
  try {
    if (!eventoId || typeof portalAtualizarEvento !== 'function') return;
    const d = dataCorteStr ? String(dataCorteStr).trim().split('T')[0] : null;
    await portalAtualizarEvento(eventoId, { dataCorteCompetidores: d || null });
  } catch (e) {
    console.error('atualizarDataCorteCompetidoresEvento:', e);
  }
}

/**
 * Gerar dados do relatório consolidado de inscritos do evento para exportação XLSX.
 * @param {string} eventoId
 * @return {Object} Dados estruturados para XLSX
 */
async function gerarRelatorioInscritosEventoConsolidadoDados(eventoId) {
  try {
    if (!eventoId) {
      return { sucesso: false, erro: 'Evento não informado.' };
    }

    const eventos = (typeof portalListarEventos === 'function') ? await portalListarEventos() : [];
    const evento = (eventos || []).find(e => String(e.id) === String(eventoId)) || {};
    const inscricoes = (typeof portalListarInscricoesEvento === 'function') ? await portalListarInscricoesEvento(eventoId) : [];

    if (!inscricoes || inscricoes.length === 0) {
      return { sucesso: false, erro: 'Nenhuma inscrição encontrada para este evento.' };
    }

    var mapaNomeParaClubeOrigem = {};
    var temGDSemOrigem = inscricoes.some(function(insc) {
      var c = insc.clubeNome || '';
      var ehGD = String(c).toLowerCase().indexOf('gabinete distrital') >= 0;
      var orig = (insc.clubeOrigemNome || insc.clube_origem_nome || '').trim();
      return ehGD && !orig;
    });
    if (temGDSemOrigem && typeof listarClubesParaDirigenteGabinete === 'function' && typeof _normalizarNomeParaComparacao === 'function') {
      try {
        var resClubes = await listarClubesParaDirigenteGabinete();
        var listaClubes = (resClubes && resClubes.clubes) ? resClubes.clubes : [];
        for (const c of (listaClubes || [])) {
          var clubeNome = (c.nome || '').trim();
          if (!clubeNome) continue;
          var prtma = (typeof buscarPessoasRTMA === 'function') ? await buscarPessoasRTMA(clubeNome, null, null, null) : [];
          var am = (typeof buscarAmigosConselheiros === 'function') ? await buscarAmigosConselheiros(clubeNome, null) : [];
          (prtma || []).forEach(function(p) {
            var n = (p.nome || '').trim();
            if (n && !mapaNomeParaClubeOrigem[_normalizarNomeParaComparacao(n)]) mapaNomeParaClubeOrigem[_normalizarNomeParaComparacao(n)] = clubeNome;
          });
          (am || []).forEach(function(a) {
            var n = (a.nome || '').trim();
            if (n && !mapaNomeParaClubeOrigem[_normalizarNomeParaComparacao(n)]) mapaNomeParaClubeOrigem[_normalizarNomeParaComparacao(n)] = clubeNome;
          });
        }
      } catch (e) { console.warn('Resolução clube de origem (RTMA) para GD:', e); }
    }

    const porClube = {};
    inscricoes.forEach(inscricao => {
      const clubeInscricao = inscricao.clubeNome || 'Sem clube';
      const ehGabineteDistrital = String(clubeInscricao).toLowerCase().indexOf('gabinete distrital') >= 0;
      var origem = (inscricao.clubeOrigemNome || inscricao.clube_origem_nome || '').trim();
      if (ehGabineteDistrital && !origem && typeof _normalizarNomeParaComparacao === 'function') {
        var nomeNorm = _normalizarNomeParaComparacao(String(inscricao.pessoaNome || '').trim());
        if (mapaNomeParaClubeOrigem[nomeNorm]) origem = mapaNomeParaClubeOrigem[nomeNorm];
      }
      const clubeGrupo = (ehGabineteDistrital && origem) ? origem : clubeInscricao;
      if (!porClube[clubeGrupo]) porClube[clubeGrupo] = [];
      porClube[clubeGrupo].push(inscricao);
    });

    const normalizarRestricao = (inscricao) => {
      if (!inscricao) return '';
      if (inscricao.restricaoDescricao) return inscricao.restricaoDescricao;
      return inscricao.restricaoAlimentar ? 'Sim' : '';
    };

    var configSupabase = (typeof RTMA_SUPABASE_CONFIG !== 'undefined') ? RTMA_SUPABASE_CONFIG : { url: 'https://bqkttaflhtsdkamgscnf.supabase.co', serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY };

    const linhas = [];
    const clubes = [];
    for (const clube of Object.keys(porClube).sort()) {
      var clubeParaRTMA = clube;
      var pessoasRTMA = [];
      var amigos = [];
      if (String(clube).toLowerCase().indexOf('gabinete distrital') >= 0) {
        var origens = {};
        (porClube[clube] || []).forEach(function(insc) {
          var orig = (insc.clubeOrigemNome || insc.clube_origem_nome || '').trim();
          if (orig) origens[orig] = true;
        });
        var mapaRTMAPorOrigem = {};
        var mapaAmigosPorOrigem = {};
        for (const orig of Object.keys(origens)) {
          mapaRTMAPorOrigem[orig] = {};
          mapaAmigosPorOrigem[orig] = {};
          var prtma = (typeof buscarPessoasRTMA === 'function') ? await buscarPessoasRTMA(orig, null, null, null) : [];
          var am = (typeof buscarAmigosConselheiros === 'function') ? await buscarAmigosConselheiros(orig, null) : [];
          (prtma || []).forEach(function(p) {
            if (p.nome) {
              var kt = String(p.nome).trim();
              mapaRTMAPorOrigem[orig][kt] = p;
              if (typeof _normalizarNomeParaComparacao === 'function') {
                mapaRTMAPorOrigem[orig][_normalizarNomeParaComparacao(kt)] = p;
              }
            }
          });
          (am || []).forEach(function(a) {
            if (a.nome) {
              var ka = String(a.nome).trim();
              mapaAmigosPorOrigem[orig][ka] = a;
              if (typeof _normalizarNomeParaComparacao === 'function') {
                mapaAmigosPorOrigem[orig][_normalizarNomeParaComparacao(ka)] = a;
              }
            }
          });
        }
      } else {
        pessoasRTMA = (typeof buscarPessoasRTMA === 'function') ? await buscarPessoasRTMA(clube, null, null, null) : [];
        amigos = (typeof buscarAmigosConselheiros === 'function') ? await buscarAmigosConselheiros(clube, null) : [];
      }

      var mapaRTMA = {};
      var mapaAmigos = {};
      var mapaRTMAPorNorm = {};
      var mapaAmigosPorNorm = {};
      if (String(clube).toLowerCase().indexOf('gabinete distrital') < 0) {
        (pessoasRTMA || []).forEach(p => {
          if (p.nome) {
            var kn = String(p.nome).trim();
            mapaRTMA[kn] = p;
            if (typeof _normalizarNomeParaComparacao === 'function') {
              mapaRTMAPorNorm[_normalizarNomeParaComparacao(kn)] = p;
            }
          }
        });
        (amigos || []).forEach(a => {
          if (a.nome) {
            var ka = String(a.nome).trim();
            mapaAmigos[ka] = a;
            if (typeof _normalizarNomeParaComparacao === 'function') {
              mapaAmigosPorNorm[_normalizarNomeParaComparacao(ka)] = a;
            }
          }
        });
      }

      var ehGabineteDistrital = String(clube).toLowerCase().indexOf('gabinete distrital') >= 0;
      var clubesNominataSet = {};
      clubesNominataSet[clube] = true;
      if (ehGabineteDistrital) {
        (porClube[clube] || []).forEach(function (insc) {
          var o = (insc.clubeOrigemNome || insc.clube_origem_nome || '').trim();
          if (o) clubesNominataSet[o] = true;
        });
      }
      var mapaCargosPorClube = {};
      for (const cn of Object.keys(clubesNominataSet)) {
        try {
          var mc = (typeof _obterMapaCargosNominataClubeAlMult === 'function')
            ? await _obterMapaCargosNominataClubeAlMult(cn, AL_NOMINATA_RELATORIO_EVENTOS, configSupabase)
            : {};
          mapaCargosPorClube[cn] = mc || {};
        } catch (e) { mapaCargosPorClube[cn] = {}; }
      }

      var dataCorteObjRel = null;
      var dataCorteStrRel = evento.dataCorteCompetidores ? String(evento.dataCorteCompetidores).trim() : '';
      if (dataCorteStrRel) {
        dataCorteObjRel = new Date(dataCorteStrRel.split('T')[0] + 'T12:00:00');
        if (isNaN(dataCorteObjRel.getTime())) dataCorteObjRel = null;
      }
      const linhasClube = (porClube[clube] || []).map(inscricao => {
        const nome = String(inscricao.pessoaNome || '').trim();
        var nomeNorm = typeof _normalizarNomeParaComparacao === 'function' ? _normalizarNomeParaComparacao(nome) : nome.toLowerCase();
        var pessoaRTMA = mapaRTMA[nome] || mapaRTMAPorNorm[nomeNorm];
        var pessoaAmigo = mapaAmigos[nome] || mapaAmigosPorNorm[nomeNorm];
        if (!pessoaRTMA && String(clube).toLowerCase().indexOf('gabinete distrital') >= 0) {
          var orig = (inscricao.clubeOrigemNome || inscricao.clube_origem_nome || '').trim();
          if (orig && mapaRTMAPorOrigem && mapaRTMAPorOrigem[orig]) {
            pessoaRTMA = mapaRTMAPorOrigem[orig][nome] || mapaRTMAPorOrigem[orig][nomeNorm];
          }
          if (orig && mapaAmigosPorOrigem && mapaAmigosPorOrigem[orig]) {
            pessoaAmigo = mapaAmigosPorOrigem[orig][nome] || mapaAmigosPorOrigem[orig][nomeNorm];
          }
        }
        const tipoParaRegra = (inscricao.pessoaTipo || (pessoaRTMA ? pessoaRTMA.tipo : '') || '').trim();
        const tipoInscricao = String(tipoParaRegra).toLowerCase();
        const ehAmigo = tipoInscricao.includes('amigo') || tipoInscricao.includes('conselheiro');
        const dataPosse = pessoaRTMA
          ? (pessoaRTMA.associadoDesde || pessoaRTMA.associado_desde || '')
          : '';
        var aptoACompetir = '';
        if (_ehPreLeo(tipoParaRegra)) aptoACompetir = 'Não';
        else if (ehAmigo) aptoACompetir = 'Apenas Coletivas';
        else if (_ehApenasLeoLeao(tipoParaRegra)) {
          var dataNascRel = pessoaRTMA ? String(pessoaRTMA.dataNascimento || pessoaRTMA.data_nascimento || '').trim() : '';
          var idadeRel = dataNascRel ? _calcularIdadeEmData(dataNascRel, dataCorteObjRel || new Date()) : null;
          aptoACompetir = (idadeRel !== null && idadeRel <= 32) ? 'Apenas Coletivas' : '';
        }
        if (!aptoACompetir) {
          if (!dataPosse) aptoACompetir = 'Não';
          else if (!dataCorteObjRel) aptoACompetir = 'Sim';
          else {
            var isoPosseRel = String(dataPosse).trim().replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1').split('T')[0].substring(0, 10);
            var dataPosseObjRel = new Date(isoPosseRel + 'T12:00:00');
            aptoACompetir = !isNaN(dataPosseObjRel.getTime()) && dataPosseObjRel <= dataCorteObjRel ? 'Sim' : 'Não';
          }
        }
        var clubeNominata = clube;
        if (ehGabineteDistrital) {
          var origNom = (inscricao.clubeOrigemNome || inscricao.clube_origem_nome || '').trim();
          if (origNom) clubeNominata = origNom;
        }
        var mapaCargoLinha = mapaCargosPorClube[clubeNominata] || {};
        var cargo = mapaCargoLinha[nomeNorm] || '';
        cargo = cargo ? _unificarSeparadoresCargoExcel(cargo) : '';
        var tipoDisp = (pessoaRTMA ? (pessoaRTMA.tipo || '') : (pessoaAmigo ? (pessoaAmigo.tipo || '') : ''));
        if (!cargo || !String(cargo).trim()) cargo = String(tipoDisp || '').trim();
        return {
          clube: clube,
          nome: nome,
          tipo: ehAmigo
            ? (pessoaAmigo ? (pessoaAmigo.tipo || '') : (inscricao.pessoaTipo || ''))
            : (inscricao.pessoaTipo || (pessoaRTMA ? (pessoaRTMA.tipo || '') : '')),
          restricao: normalizarRestricao(inscricao),
          cargo: cargo,
          lote: inscricao.loteNome || inscricao.tipoInscricao || '',
          dataPosse: dataPosse || '',
          aptoACompetir: aptoACompetir
        };
      });

      linhasClube.sort((a, b) => a.nome.localeCompare(b.nome));
      linhas.push(...linhasClube);
      clubes.push({ clubeNome: clube, linhas: linhasClube });
    }

    return {
      sucesso: true,
      dados: {
        evento: {
          id: eventoId,
          nome: evento.nome || '',
          dataInicio: evento.dataInicio || null,
          dataFim: evento.dataFim || null,
          dataEvento: evento.dataEvento || null,
          dataCorteCompetidores: evento.dataCorteCompetidores || null
        },
        linhas: linhas,
        clubes: clubes
      }
    };
  } catch (error) {
    console.error('Erro ao gerar dados do relatório consolidado de inscritos:', error);
    return { sucesso: false, erro: error.message };
  }
}

// === MÓDULO DE CAMPANHAS ===
async function getCampanhasDoClube(clube) {
  // === Supabase (sem planilhas) ===
  if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
    try {
      return await portalBuscarCampanhas(clube);
    } catch (e) {
      console.error('Erro Supabase (campanhas):', e);
      return [];
    }
  }

  const planilhaClubeId = PLANILHAS_CAMPANHAS[clube];
  if (!planilhaClubeId) {
    console.error(`Planilha de campanhas não mapeada para o clube: ${clube}`);
    return [];
  }

  try {
    const ss = SpreadsheetApp.openById(planilhaClubeId);
    let sheet = ss.getSheetByName(ABA_CAMPANHAS);
    
    if (!sheet) {
      console.log(`Aba "${ABA_CAMPANHAS}" não encontrada. Criando...`);
      sheet = criarAbaCampanhas(ss);
      return [];
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];

    // ATUALIZADO: Busca estrutura completa corrigida (40 colunas: A-AN)
    const dados = sheet.getRange(2, 1, lastRow - 1, 40).getValues();

    const campanhas = dados.map((linha, index) => {
      // CORRIGIDO: Usar ID único da coluna AH (índice 33) - ESTRUTURA FINAL
      // Garantir que o ID seja sempre uma string
      let idUnico = linha[33] || linha[29] || adicionarIdUnicoSeNecessario(linha, index + 2, false);
      idUnico = String(idUnico).trim(); // Normalizar para string

      return {
        id: idUnico,
        rowIndex: index + 2,
        // ESTRUTURA FINAL CORRIGIDA (37 colunas A-AK)
        dataRegistro: linha[0] ? new Date(linha[0]).toISOString() : null,   // A - Carimbo Data e Hora
        al: linha[1] || "",                                                // B - AL
        trimestre: linha[2] || "",                                         // C - Trimestre
        clube: linha[3] || "",                                             // D - Clube
        titulo: linha[4] || "",                                            // E - Titulo Campanha
        objetivo: linha[5] || "",                                          // F - Objetivo Campanha
        dataInicio: linha[6] ? new Date(linha[6]).toISOString() : null,     // G - Data e Hora início
        dataFim: linha[7] ? new Date(linha[7]).toISOString() : null,        // H - Data e Hora Fim
        coordenador: linha[8] || "",                                       // I - Coordenador(a)
        comissao: linha[9] || "",                                          // J - Comissão
        membrosComissao: linha[10] || "",                                  // K - Membros na Comissão
        associadosPresentes: linha[11] || "",                              // L - Associados Presentes
        qtdPresentes: parseInt(linha[12]) || 0,                            // M - Quantidade Associados Presentes
        preLeoPresentes: linha[13] || "",                                  // N - Pré LEO's Presentes
        qtdPreLeos: parseInt(linha[14]) || 0,                              // O - Quantidade Pré LEO's Presentes
        amigosConselheiros: linha[15] || "",                               // P - Amigos LEO e Conselheiros Presentes
        qtdAmigosConselheiros: parseInt(linha[16]) || 0,                   // Q - Quantidade Conselheiros e Amigos LEO Presentes
        pessoasImpactadas: parseInt(linha[17]) || 0,                       // R - Pessoas Impactadas
        custoCampanha: parseFloat(linha[18]) || 0,                         // S - Custo Campanha
        qtdLeoesParticipantes: parseInt(linha[19]) || 0,                   // T - Companheiros Leões Presentes (Quantidade)
        horasPorPessoa: parseFloat(linha[20]) || 0,                        // U - Horas trabalhadas por pessoa
        horasTotais: parseFloat(linha[21]) || 0,                           // V - Horas Totais Trabalhadas
        descricaoTexto: linha[22] || "",                                   // W - Descrição Campanha
        eixo: linha[23] || "",                                             // X - Eixo D8
        eixoDM: linha[24] || "",                                           // Y - Eixo DM
        linkFotoOficial: linha[25] || "",                                  // Z - Foto Oficial
        linkVideo: linha[26] || "",                                        // AA - Video Campanha
        linkOutrasFotos: linha[27] || "",                                  // AB - Outras Fotos
        descricaoHTML: linha[28] || "",                                     // AC - Texto HTML
        // CAMPOS DE PARCERIA RESTAURADOS (29-32)
        temParceria: linha[29] === 'Sim',                                  // AD - Tem Parceria
        entidadeParceira: linha[30] || "",                                 // AE - Entidade Parceira
        tipoParceria: linha[31] || "",                                     // AF - Tipo Parceria
        descricaoParceria: linha[32] || "",                                // AG - Descrição Parceria
        // CAMPOS DE SISTEMA (33-36)
        comentarioDistrital: linha[34] || "",                              // AI - Comentário Distrital
        marcadoCorrigido: linha[35] === 'Sim',                             // AJ - Marcado como Corrigido
        quemCorrigiu: linha[36] || "",                                      // AK - Quem Corrigiu
        // NOVOS CAMPOS DESCRITIVOS (37-39)
        divulgacao: linha[37] || "",                                        // AL - Divulgação da Campanha
        pontosMelhorar: linha[38] || "",                                    // AM - Pontos a Serem Melhorados
        feedback: linha[39] || ""                                           // AN - Feedback da Campanha
      };
    }).filter(campanha => campanha.titulo);

    // MELHORADO: Ordenar por data do evento (data de início) em ordem decrescente (mais recentes primeiro)
    campanhas.sort((a, b) => {
      // Priorizar data do evento, com fallback para data de registro
      const dataEventoA = a.dataInicio ? new Date(a.dataInicio) : (a.dataRegistro ? new Date(a.dataRegistro) : new Date(0));
      const dataEventoB = b.dataInicio ? new Date(b.dataInicio) : (b.dataRegistro ? new Date(b.dataRegistro) : new Date(0));

      // Ordenação decrescente: mais recentes primeiro
      return dataEventoB - dataEventoA;
    });

    return campanhas;

  } catch (error) {
    console.error("Erro ao buscar campanhas:", error);
    return [];
  }
}

function criarAbaCampanhas(ss) {
  const sheet = ss.insertSheet(ABA_CAMPANHAS);
  
  // ATUALIZADO: Cabeçalho com estrutura REAL + ID Único + campos de comentários + novos campos descritivos (40 colunas)
  const cabecalho = [
    'Carimbo Data e Hora', 'AL', 'Trimestre', 'Clube', 'Titulo Campanha',                    // A-E
    'Objetivo Campanha', 'Data e Hora início', 'Data e Hora Fim', 'Coordenador(a)',          // F-I
    'Comissão', 'Membros na Comissão', 'Associados Presentes', 'Quantidade Associados Presentes', // J-M
    'Pré LEO`s Presentes', 'Quantidade Pré LEO`s Presentes', 'Amigos LEO e Conselheiros Presentes', // N-P
    'Quantidade Conselheiros e Amigos LEO Presentes', 'Pessoas Impactadas', 'Custo Campanha', // Q-S
    'Companheiros Leões Presentes', 'Horas trabalhadas por pessoa', 'Horas Totais Trabalhadas', // T-V
    'Descrição Campanha', 'Eixo D8', 'Eixo DM', 'Foto Oficial',                              // W-Z
    'Video Campanha', 'Outras Fotos', 'Texto HTML',                                          // AA-AC
    'Tem Parceria', 'Entidade Parceira', 'Tipo Parceria', 'Descrição Parceria',            // AD-AG: PARCERIA
    'ID Único', 'Comentário Distrital', 'Marcado como Corrigido', 'Quem Corrigiu',          // AH-AK: SISTEMA
    'Divulgação da Campanha', 'Pontos a Serem Melhorados', 'Feedback da Campanha'            // AL-AN: NOVOS CAMPOS
  ];
  
  sheet.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  
  const headerRange = sheet.getRange(1, 1, 1, cabecalho.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#D90F28');
  headerRange.setFontColor('white');
  
  sheet.autoResizeColumns(1, cabecalho.length);
  
  return sheet;
}

async function getEixos() {
  try {
    const configAtiva = await portalBuscarConfiguracaoAtiva();
    if (!configAtiva || !configAtiva.al) return { eixo: [], eixoDM: [] };
    const todos = await portalListarEixosCampanha(configAtiva.al);
    const eixo = todos.filter(e => e.tipo === 'd8').map(e => e.nome);
    const eixoDM = todos.filter(e => e.tipo === 'dm').map(e => e.nome);
    return { eixo, eixoDM };
  } catch (error) {
    console.error('Erro ao buscar eixos:', error);
    return { eixo: [], eixoDM: [] };
  }
}

function montarChaveIdempotencia(prefixo, dados) {
  const chaveRaw = String((dados && (dados._idempotencyKey || dados.idempotencyKey)) || '').trim();
  if (!chaveRaw) return '';
  return `IDEMP:${prefixo}:${chaveRaw}`;
}

function lerResultadoIdempotente(cacheKey) {
  if (!cacheKey) return null;
  try {
    const cache = CacheService.getScriptCache();
    const bruto = cache.get(cacheKey);
    if (!bruto) return null;
    const obj = JSON.parse(bruto);
    if (obj && obj.registroId) return obj;
  } catch (e) {
    console.warn('Falha ao ler cache de idempotência:', e);
  }
  return null;
}

function salvarResultadoIdempotente(cacheKey, registroId) {
  if (!cacheKey || !registroId) return;
  try {
    const cache = CacheService.getScriptCache();
    cache.put(cacheKey, JSON.stringify({ registroId: String(registroId) }), 6 * 60 * 60); // 6h
  } catch (e) {
    console.warn('Falha ao gravar cache de idempotência:', e);
  }
}

async function registrarCampanha(dados) {
  let idemLock = null;
  let cacheKey = '';
  try {
    cacheKey = montarChaveIdempotencia('campanha', dados);
    if (cacheKey) {
      idemLock = LockService.getScriptLock();
      idemLock.waitLock(10000);
      const cached = lerResultadoIdempotente(cacheKey);
      if (cached && cached.registroId) {
        return { sucesso: true, registroId: cached.registroId, idempotente: true };
      }
    }
    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      const dtInicio = new Date(dados.dataHoraInicio);
      const dtFim = new Date(dados.dataHoraFim);

      if (isNaN(dtInicio.getTime()) || isNaN(dtFim.getTime())) {
        console.error("Datas inválidas:", dados.dataHoraInicio, dados.dataHoraFim);
        throw new Error("Datas inválidas fornecidas");
      }

      const diffMilliseconds = dtFim.getTime() - dtInicio.getTime();
      const diffHoras = Math.max(0, diffMilliseconds / (1000 * 60 * 60));
      const horasEvento = Math.min(diffHoras, 720);

      if (diffHoras > 168) {
        console.log(`⚠️ Evento longo: ${dados.titulo} - ${diffHoras.toFixed(1)}h (${Math.ceil(diffHoras/24)} dias)`);
      }

      const totalPessoas = (dados.presentes?.length || 0) +
                          (dados.preLeos?.length || 0) +
                          (dados.amigosConselheiros?.length || 0) +
                          (dados.comissao?.length || 0);

      const horasPorPessoa = parseFloat(horasEvento.toFixed(2));
      const horasTrabalhadas = parseFloat((horasEvento * Math.max(totalPessoas, 1)).toFixed(2));

      const idUnico = String(gerarIdUnico()).trim();
      console.log(`🆔 ID gerado para nova campanha (Supabase): ${idUnico}`);

      const payload = Object.assign({}, dados || {});
      payload.id = idUnico;
      payload.idUnicoOriginal = idUnico;
      payload.dataRegistro = new Date().toISOString();
      payload.dataInicio = dados.dataHoraInicio;
      payload.dataFim = dados.dataHoraFim;
      payload.localRealizacao = dados.localRealizacao || "";
      payload.comissao = (dados.comissao || []).join(", ");
      payload.membrosComissao = (dados.comissao || []).length;
      payload.associadosPresentes = (dados.presentes || []).join(", ");
      payload.qtdPresentes = (dados.presentes || []).length;
      payload.preLeoPresentes = (dados.preLeos || []).join(", ");
      payload.qtdPreLeos = (dados.preLeos || []).length;
      payload.amigosConselheirosPresentes = (dados.amigosConselheiros || []).join(", ");
      payload.qtdAmigosConselheiros = (dados.amigosConselheiros || []).length;
      payload.horasPorPessoa = horasPorPessoa;
      payload.horasTotais = horasTrabalhadas;
      payload.descricaoTexto = dados.descricaoTexto || "";
      payload.companheirosLeoesPresentes = (dados.qtdLeoesParticipantes || '').toString();

      delete payload.dataHoraInicio;
      delete payload.dataHoraFim;
      delete payload.qtdLeoesParticipantes;
      delete payload.presentes;
      delete payload.preLeos;
      delete payload.amigosConselheiros;

      const toInt = (v) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : 0;
      };
      const toNum = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      const toBool = (v) => (v === true || v === 'Sim' || v === 'true' || v === 1 || v === '1');

      payload.membrosComissao = toInt(payload.membrosComissao);
      payload.qtdPresentes = toInt(payload.qtdPresentes);
      payload.qtdPreLeos = toInt(payload.qtdPreLeos);
      payload.qtdAmigosConselheiros = toInt(payload.qtdAmigosConselheiros);
      payload.pessoasImpactadas = toInt(payload.pessoasImpactadas);
      payload.custoCampanha = toNum(payload.custoCampanha);
      payload.horasPorPessoa = toNum(payload.horasPorPessoa);
      payload.horasTotais = toNum(payload.horasTotais);
      payload.temParceria = toBool(payload.temParceria);
      payload.marcadoCorrigido = toBool(payload.marcadoCorrigido);

      await portalUpsertCampanha(payload);
      salvarResultadoIdempotente(cacheKey, idUnico);
      return { sucesso: true, registroId: idUnico };
    }

    const planilhaClubeId = PLANILHAS_CAMPANHAS[dados.clube];
    if (!planilhaClubeId) throw new Error(`Planilha não mapeada para o clube: ${dados.clube}`);

    const ss = SpreadsheetApp.openById(planilhaClubeId);
    const sheet = ss.getSheetByName(ABA_CAMPANHAS);
    if (!sheet) throw new Error(`Aba "${ABA_CAMPANHAS}" não encontrada para o clube: ${dados.clube}`);

    const dtInicio = new Date(dados.dataHoraInicio);
    const dtFim = new Date(dados.dataHoraFim);

    if (isNaN(dtInicio.getTime()) || isNaN(dtFim.getTime())) {
      console.error("Datas inválidas:", dados.dataHoraInicio, dados.dataHoraFim);
      throw new Error("Datas inválidas fornecidas");
    }

    const diffMilliseconds = dtFim.getTime() - dtInicio.getTime();
    const diffHoras = Math.max(0, diffMilliseconds / (1000 * 60 * 60));
    const horasEvento = Math.min(diffHoras, 720);
    
    if (diffHoras > 168) {
      console.log(`⚠️ Evento longo: ${dados.titulo} - ${diffHoras.toFixed(1)}h (${Math.ceil(diffHoras/24)} dias)`);
    }

    const totalPessoas = (dados.presentes?.length || 0) + 
                        (dados.preLeos?.length || 0) + 
                        (dados.amigosConselheiros?.length || 0) + 
                        (dados.comissao?.length || 0);

    const horasPorPessoa = parseFloat(horasEvento.toFixed(2));
    const horasTrabalhadas = parseFloat((horasEvento * Math.max(totalPessoas, 1)).toFixed(2));

    console.log(`🕐 Cálculo Horas - ${dados.titulo}:
      - Duração evento: ${horasEvento.toFixed(2)}h
      - Total pessoas: ${totalPessoas}
      - Horas trabalhadas: ${horasTrabalhadas}h`);

    // CORRIGIDO: Gerar ID único para o novo registro e garantir que seja string
    const idUnico = String(gerarIdUnico()).trim();
    console.log(`🆔 ID gerado para nova campanha: ${idUnico}`);

    // ESTRUTURA FINAL CORRIGIDA (40 colunas A-AN)
    const row = [
      new Date(),                              // A - Carimbo Data e Hora
      dados.al,                                // B - AL
      dados.trimestre,                         // C - Trimestre
      dados.clube,                             // D - Clube
      dados.titulo,                            // E - Titulo Campanha
      dados.objetivo,                          // F - Objetivo Campanha
      dados.dataHoraInicio,                    // G - Data e Hora início
      dados.dataHoraFim,                       // H - Data e Hora Fim
      dados.coordenador,                       // I - Coordenador(a)
      dados.comissao.join(", "),               // J - Comissão
      dados.comissao.length,                   // K - Membros na Comissão
      dados.presentes.join(", "),              // L - Associados Presentes
      dados.presentes.length,                  // M - Quantidade Associados Presentes
      dados.preLeos.join(", "),                // N - Pré LEO's Presentes
      dados.preLeos.length,                    // O - Quantidade Pré LEO's Presentes
      dados.amigosConselheiros.join(", "),     // P - Amigos LEO e Conselheiros Presentes
      dados.amigosConselheiros.length,         // Q - Quantidade Conselheiros e Amigos LEO Presentes
      dados.pessoasImpactadas,                 // R - Pessoas Impactadas
      dados.custoCampanha,                     // S - Custo Campanha
      dados.qtdLeoesParticipantes,             // T - Companheiros Leões Presentes
      horasPorPessoa,                          // U - Horas trabalhadas por pessoa
      horasTrabalhadas,                        // V - Horas Totais Trabalhadas
      dados.descricaoTexto,                    // W - Descrição Campanha
      dados.eixo,                              // X - Eixo D8
      dados.eixoDM,                            // Y - Eixo DM
      "",                                       // Z - Foto Oficial (será preenchido via upload)
      "",                                       // AA - Video Campanha (será preenchido via upload)
      "",                                       // AB - Outras Fotos (será preenchido via upload)
      dados.descricaoHTML,                     // AC - Texto HTML
      // CAMPOS DE PARCERIA (AD-AG)
      dados.temParceria || "Não",              // AD - Tem Parceria
      dados.entidadeParceira || "",             // AE - Entidade Parceira
      dados.tipoParceria || "",                 // AF - Tipo Parceria
      dados.descricaoParceria || "",            // AG - Descrição Parceria
      // CAMPOS DE SISTEMA (AH-AK)
      idUnico,                                 // AH - ID Único
      "",                                       // AI - Comentário Distrital
      "Não",                                   // AJ - Marcado como Corrigido
      "",                                       // AK - Quem Corrigiu
      // NOVOS CAMPOS DESCRITIVOS (AL-AN)
      dados.divulgacao || "",                   // AL - Divulgação da Campanha
      dados.pontosMelhorar || "",               // AM - Pontos a Serem Melhorados
      dados.feedback || ""                      // AN - Feedback da Campanha
    ];

    sheet.appendRow(row);
    console.log(`✅ Campanha registrada com sucesso - ID: ${idUnico}, Linha: ${sheet.getLastRow()}`);
    salvarResultadoIdempotente(cacheKey, idUnico);
    return { sucesso: true, registroId: idUnico };

  } catch (error) {
    console.error("Erro ao registrar campanha:", error);
    throw error;
  } finally {
    if (idemLock) {
      try { idemLock.releaseLock(); } catch (e) {}
    }
  }
}

async function getCampanhaPorId(clube, campanhaId) {
  // Normalizar ID para string (pode vir como número ou string)
  const idNormalizado = String(campanhaId).trim();

  // Primeiro, tentar buscar na lista de campanhas carregadas
  const campanhas = await getCampanhasDoClube(clube);
  const campanhaEncontrada = campanhas.find(c => {
    const idCampanha = String(c.id || '').trim();
    return idCampanha === idNormalizado;
  });
  
  if (campanhaEncontrada) {
    return campanhaEncontrada;
  }
  
  // FALLBACK: Buscar diretamente na planilha se não encontrou na lista
  // Isso resolve problemas de timing quando a campanha foi recém criada
  try {
    const planilhaClubeId = PLANILHAS_CAMPANHAS[clube];
    if (!planilhaClubeId) {
      console.error(`Planilha de campanhas não mapeada para o clube: ${clube}`);
      return null;
    }

    const ss = SpreadsheetApp.openById(planilhaClubeId);
    const sheet = ss.getSheetByName(ABA_CAMPANHAS);
    if (!sheet) {
      return null;
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;

    // Buscar o ID na coluna AH (índice 33)
    const dados = sheet.getRange(2, 1, lastRow - 1, 40).getValues();
    
    for (let i = 0; i < dados.length; i++) {
      const linha = dados[i];
      const idNaPlanilha = String(linha[33] || '').trim();
      
      if (idNaPlanilha === idNormalizado) {
        // Construir objeto campanha igual ao formato de getCampanhasDoClube
        return {
          id: idNaPlanilha,
          rowIndex: i + 2,
          dataRegistro: linha[0] ? new Date(linha[0]).toISOString() : null,
          al: linha[1] || "",
          trimestre: linha[2] || "",
          clube: linha[3] || "",
          titulo: linha[4] || "",
          objetivo: linha[5] || "",
          dataInicio: linha[6] ? new Date(linha[6]).toISOString() : null,
          dataFim: linha[7] ? new Date(linha[7]).toISOString() : null,
          coordenador: linha[8] || "",
          comissao: linha[9] || "",
          membrosComissao: linha[10] || "",
          associadosPresentes: linha[11] || "",
          qtdPresentes: parseInt(linha[12]) || 0,
          preLeoPresentes: linha[13] || "",
          qtdPreLeos: parseInt(linha[14]) || 0,
          amigosConselheiros: linha[15] || "",
          qtdAmigosConselheiros: parseInt(linha[16]) || 0,
          pessoasImpactadas: parseInt(linha[17]) || 0,
          custoCampanha: parseFloat(linha[18]) || 0,
          qtdLeoesParticipantes: parseInt(linha[19]) || 0,
          horasPorPessoa: parseFloat(linha[20]) || 0,
          horasTotais: parseFloat(linha[21]) || 0,
          descricaoTexto: linha[22] || "",
          eixo: linha[23] || "",
          eixoDM: linha[24] || "",
          linkFotoOficial: linha[25] || "",
          linkVideo: linha[26] || "",
          linkOutrasFotos: linha[27] || "",
          descricaoHTML: linha[28] || "",
          temParceria: linha[29] === 'Sim',
          entidadeParceira: linha[30] || "",
          tipoParceria: linha[31] || "",
          descricaoParceria: linha[32] || "",
          comentarioDistrital: linha[34] || "",
          marcadoCorrigido: linha[35] === 'Sim',
          quemCorrigiu: linha[36] || "",
          divulgacao: linha[37] || "",
          pontosMelhorar: linha[38] || "",
          feedback: linha[39] || ""
        };
      }
    }
  } catch (error) {
    console.error(`Erro ao buscar campanha diretamente na planilha: ${error.message}`);
  }
  
  return null;
}

async function deletarCampanha(clube, campanhaId) {
  try {
    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      await portalDeleteCampanha(String(campanhaId).trim());
      return { sucesso: true };
    }

    // Normalizar ID para string
    const idNormalizado = String(campanhaId).trim();
    
    const planilhaClubeId = PLANILHAS_CAMPANHAS[clube];
    if (!planilhaClubeId) {
      throw new Error(`Planilha não mapeada para o clube: ${clube}`);
    }

    const ss = SpreadsheetApp.openById(planilhaClubeId);
    const sheet = ss.getSheetByName(ABA_CAMPANHAS);
    if (!sheet) {
      throw new Error(`Aba "${ABA_CAMPANHAS}" não encontrada para o clube: ${clube}`);
    }

    // Usar a função melhorada de busca
    const campanha = await getCampanhaPorId(clube, idNormalizado);
    if (!campanha) {
      console.error(`Campanha não encontrada - Clube: ${clube}, ID: ${idNormalizado}`);
      throw new Error('Campanha não encontrada');
    }

    console.log(`Deletando campanha na linha ${campanha.rowIndex} - ID: ${idNormalizado}`);
    sheet.deleteRow(campanha.rowIndex);
    
    return { sucesso: true };

  } catch (error) {
    console.error("Erro ao deletar campanha:", error);
    return { sucesso: false, erro: error.message };
  }
}

async function editarCampanha(clube, campanhaId, dadosAtualizados) {
  try {
    if (!campanhaId || String(campanhaId).trim() === '' || String(campanhaId).trim() === 'null' || String(campanhaId).trim() === 'undefined') {
      console.error('editarCampanha: ID inválido recebido, abortando para evitar duplicação:', campanhaId);
      return { sucesso: false, erro: 'ID da campanha inválido. Edição cancelada para evitar duplicação.' };
    }
    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      const payload = Object.assign({}, dadosAtualizados || {});
      payload.id = String(campanhaId).trim();
      payload.clube = payload.clube || clube;
      if (!payload.dataRegistro) payload.dataRegistro = new Date().toISOString();
      if (payload.dataHoraInicio && !payload.dataInicio) payload.dataInicio = payload.dataHoraInicio;
      if (payload.dataHoraFim && !payload.dataFim) payload.dataFim = payload.dataHoraFim;
      if (payload.qtdLeoesParticipantes && !payload.companheirosLeoesPresentes) {
        payload.companheirosLeoesPresentes = String(payload.qtdLeoesParticipantes);
      }
      delete payload.dataHoraInicio;
      delete payload.dataHoraFim;

      // Converter arrays de pessoas para string e mapear para nomes corretos do banco
      // (frontend envia presentes/preLeos/amigosConselheiros; banco espera associadosPresentes etc.)
      const arrToStr = (v) => Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v));
      const arrLen   = (v) => Array.isArray(v) ? v.length : (typeof v === 'string' && v.trim() !== '' ? v.split(',').filter(s => s.trim() !== '').length : 0);

      // Mapear e converter participantes vindos do frontend
      if (payload.presentes !== undefined) {
        payload.associadosPresentes = arrToStr(payload.presentes);
        payload.qtdPresentes        = arrLen(payload.presentes);
        delete payload.presentes;
      }
      if (payload.preLeos !== undefined) {
        payload.preLeoPresentes = arrToStr(payload.preLeos);
        payload.qtdPreLeos      = arrLen(payload.preLeos);
        delete payload.preLeos;
      }
      if (payload.amigosConselheiros !== undefined) {
        payload.amigosConselheirosPresentes = arrToStr(payload.amigosConselheiros);
        payload.qtdAmigosConselheiros       = arrLen(payload.amigosConselheiros);
        delete payload.amigosConselheiros;
      }
      // Converter comissão e campos já com nome correto (caso venham de outro caminho)
      if (payload.comissao !== undefined) {
        payload.membrosComissao = arrLen(payload.comissao);
        payload.comissao        = arrToStr(payload.comissao);
      }
      if (payload.associadosPresentes !== undefined && typeof payload.associadosPresentes !== 'string')
        payload.associadosPresentes = arrToStr(payload.associadosPresentes);
      if (payload.preLeoPresentes !== undefined && typeof payload.preLeoPresentes !== 'string')
        payload.preLeoPresentes = arrToStr(payload.preLeoPresentes);
      if (payload.amigosConselheirosPresentes !== undefined && typeof payload.amigosConselheirosPresentes !== 'string')
        payload.amigosConselheirosPresentes = arrToStr(payload.amigosConselheirosPresentes);

      // Converter qtdLeoesParticipantes → companheirosLeoesPresentes
      if (payload.qtdLeoesParticipantes !== undefined) {
        payload.companheirosLeoesPresentes = String(payload.qtdLeoesParticipantes);
        delete payload.qtdLeoesParticipantes;
      }

      const toInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };
      const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
      const toBool = (v) => (v === true || v === 'Sim' || v === 'true' || v === 1 || v === '1');

      if (payload.membrosComissao !== undefined) payload.membrosComissao = toInt(payload.membrosComissao);
      if (payload.qtdPresentes !== undefined) payload.qtdPresentes = toInt(payload.qtdPresentes);
      if (payload.qtdPreLeos !== undefined) payload.qtdPreLeos = toInt(payload.qtdPreLeos);
      if (payload.qtdAmigosConselheiros !== undefined) payload.qtdAmigosConselheiros = toInt(payload.qtdAmigosConselheiros);
      if (payload.pessoasImpactadas !== undefined) payload.pessoasImpactadas = toInt(payload.pessoasImpactadas);
      if (payload.custoCampanha !== undefined) payload.custoCampanha = toNum(payload.custoCampanha);
      if (payload.horasPorPessoa !== undefined) payload.horasPorPessoa = toNum(payload.horasPorPessoa);
      if (payload.horasTotais !== undefined) payload.horasTotais = toNum(payload.horasTotais);
      if (payload.temParceria !== undefined) payload.temParceria = toBool(payload.temParceria);
      if (payload.marcadoCorrigido !== undefined) payload.marcadoCorrigido = toBool(payload.marcadoCorrigido);

      await portalUpsertCampanha(payload);
      return { sucesso: true };
    }

    const planilhaClubeId = PLANILHAS_CAMPANHAS[clube];
    if (!planilhaClubeId) {
      throw new Error(`Planilha não mapeada para o clube: ${clube}`);
    }

    const ss = SpreadsheetApp.openById(planilhaClubeId);
    const sheet = ss.getSheetByName(ABA_CAMPANHAS);
    if (!sheet) {
      throw new Error(`Aba "${ABA_CAMPANHAS}" não encontrada para o clube: ${clube}`);
    }

    // Normalizar ID para string
    const idNormalizado = String(campanhaId).trim();
    const campanha = await getCampanhaPorId(clube, idNormalizado);
    if (!campanha) {
      console.error(`Campanha não encontrada para edição - Clube: ${clube}, ID: ${idNormalizado}`);
      throw new Error('Campanha não encontrada');
    }

    const dtInicio = new Date(dadosAtualizados.dataHoraInicio);
    const dtFim = new Date(dadosAtualizados.dataHoraFim);
    
    if (isNaN(dtInicio.getTime()) || isNaN(dtFim.getTime())) {
      console.error("Datas inválidas na edição:", dadosAtualizados.dataHoraInicio, dadosAtualizados.dataHoraFim);
      throw new Error("Datas inválidas fornecidas");
    }
    
    const diffMilliseconds = dtFim.getTime() - dtInicio.getTime();
    const diffHoras = Math.max(0, diffMilliseconds / (1000 * 60 * 60));
    const horasEvento = Math.min(diffHoras, 720);
    
    if (diffHoras > 168) {
      console.log(`⚠️ Evento longo detectado: ${diffHoras.toFixed(1)}h (${Math.ceil(diffHoras/24)} dias)`);
    }

    const totalPessoas = dadosAtualizados.presentes.length + dadosAtualizados.preLeos.length + 
                        dadosAtualizados.amigosConselheiros.length + dadosAtualizados.comissao.length;
    const horasPorPessoa = parseFloat(horasEvento.toFixed(2));
    const horasTrabalhadas = parseFloat((horasEvento * Math.max(totalPessoas, 1)).toFixed(2));

    // CORRIGIDO: Manter a data de registro original para não afetar indicadores
    const dataRegistroOriginal = campanha.dataRegistro ? new Date(campanha.dataRegistro) : new Date();

    // CORRIGIDO: Preservar links existentes se não houver novos arquivos
    const linkFotoOficial = dadosAtualizados.linkFotoOficial || campanha.linkFotoOficial || "";
    const linkVideo = dadosAtualizados.linkVideo || campanha.linkVideo || "";
    const linkOutrasFotos = dadosAtualizados.linkOutrasFotos || campanha.linkOutrasFotos || "";

    // ESTRUTURA FINAL CORRIGIDA (40 colunas A-AN)
    const row = [
      dataRegistroOriginal,                               // A - Carimbo Data e Hora
      dadosAtualizados.al,                                // B - AL
      dadosAtualizados.trimestre,                         // C - Trimestre
      dadosAtualizados.clube,                             // D - Clube
      dadosAtualizados.titulo,                            // E - Titulo Campanha
      dadosAtualizados.objetivo,                          // F - Objetivo Campanha
      dadosAtualizados.dataHoraInicio,                    // G - Data e Hora início
      dadosAtualizados.dataHoraFim,                       // H - Data e Hora Fim
      dadosAtualizados.coordenador,                       // I - Coordenador(a)
      dadosAtualizados.comissao.join(", "),               // J - Comissão
      dadosAtualizados.comissao.length,                   // K - Membros na Comissão
      dadosAtualizados.presentes.join(", "),              // L - Associados Presentes
      dadosAtualizados.presentes.length,                  // M - Quantidade Associados Presentes
      dadosAtualizados.preLeos.join(", "),                // N - Pré LEO's Presentes
      dadosAtualizados.preLeos.length,                    // O - Quantidade Pré LEO's Presentes
      dadosAtualizados.amigosConselheiros.join(", "),     // P - Amigos LEO e Conselheiros Presentes
      dadosAtualizados.amigosConselheiros.length,         // Q - Quantidade Conselheiros e Amigos LEO Presentes
      dadosAtualizados.pessoasImpactadas,                 // R - Pessoas Impactadas
      dadosAtualizados.custoCampanha,                     // S - Custo Campanha
      dadosAtualizados.qtdLeoesParticipantes,             // T - Companheiros Leões Presentes
      horasPorPessoa,                                      // U - Horas trabalhadas por pessoa
      horasTrabalhadas,                                    // V - Horas Totais Trabalhadas
      dadosAtualizados.descricaoTexto,                    // W - Descrição Campanha
      dadosAtualizados.eixo,                              // X - Eixo D8
      dadosAtualizados.eixoDM,                            // Y - Eixo DM
      linkFotoOficial,                                     // Z - Foto Oficial
      linkVideo,                                           // AA - Video Campanha
      linkOutrasFotos,                                     // AB - Outras Fotos
      dadosAtualizados.descricaoHTML,                     // AC - Texto HTML
      // CAMPOS DE PARCERIA RESTAURADOS (AD-AG)
      dadosAtualizados.temParceria || "Não",              // AD - Tem Parceria
      dadosAtualizados.entidadeParceira || "",             // AE - Entidade Parceira
      dadosAtualizados.tipoParceria || "",                 // AF - Tipo Parceria
      dadosAtualizados.descricaoParceria || "",            // AG - Descrição Parceria
      // CAMPOS DE SISTEMA (AH-AK)
      campanha.id,                                         // AH - ID Único (manter o existente)
      dadosAtualizados.comentarioDistrital || "",          // AI - Comentário Distrital
      dadosAtualizados.marcadoCorrigido ? "Sim" : "Não",   // AJ - Marcado como Corrigido
      dadosAtualizados.quemCorrigiu || "",                 // AK - Quem Corrigiu
      // NOVOS CAMPOS DESCRITIVOS (AL-AN)
      dadosAtualizados.divulgacao || "",                    // AL - Divulgação da Campanha
      dadosAtualizados.pontosMelhorar || "",                // AM - Pontos a Serem Melhorados
      dadosAtualizados.feedback || ""                       // AN - Feedback da Campanha
    ];

    // CORRIGIDO: Agora atualiza 40 colunas (estrutura final completa)
    sheet.getRange(campanha.rowIndex, 1, 1, 40).setValues([row]);
    
    return { sucesso: true };

  } catch (error) {
    console.error("Erro ao editar campanha:", error);
    return { sucesso: false, erro: error.message };
  }
}

// === EXCLUSÃO DE MÍDIAS ===

/**
 * Exclui uma mídia de campanha do Supabase Storage e limpa o campo correspondente no banco.
 * tipo: 'fotoOficial' | 'video' | 'outraFoto'
 * urlMidia: URL completa do arquivo no Storage (para excluir do bucket)
 */
async function excluirMidiaCampanha(campanhaId, tipo, urlMidia) {
  try {
    if (!campanhaId || !tipo) return { sucesso: false, erro: 'Parâmetros inválidos.' };

    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      // Excluir do Storage (ignora erro se arquivo não existir)
      if (urlMidia && String(urlMidia).trim()) {
        await portalExcluirArquivoStorage(String(urlMidia).trim());
      }

      // Limpar campo no banco
      if (tipo === 'fotoOficial') {
        await portalPatchCampanhaFotoOficialUrl(campanhaId, '');
      } else if (tipo === 'video') {
        await portalPatchCampanhaVideoUrl(campanhaId, '');
      } else if (tipo === 'outraFoto') {
        // Remover apenas a URL específica do CSV de outras fotos
        const csvAtual = await portalFetchCampanhaOutrasFotosUrl(campanhaId);
        const urls = csvAtual.split(',').map(u => u.trim()).filter(u => u && u !== String(urlMidia).trim());
        await portalPatchCampanhaOutrasFotosUrl(campanhaId, urls.join(', '));
      }

      return { sucesso: true };
    }

    return { sucesso: false, erro: 'Operação disponível apenas com Supabase ativo.' };
  } catch (e) {
    console.error('excluirMidiaCampanha erro:', e);
    return { sucesso: false, erro: e.message };
  }
}

/**
 * Exclui a foto oficial de uma atividade do Supabase Storage e limpa o campo no banco.
 */
async function excluirMidiaAtividade(atividadeId, urlMidia) {
  try {
    if (!atividadeId) return { sucesso: false, erro: 'ID da atividade não informado.' };

    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      if (urlMidia && String(urlMidia).trim()) {
        await portalExcluirArquivoStorage(String(urlMidia).trim());
      }
      await portalPatchAtividadeFotoOficialUrl(atividadeId, '');
      return { sucesso: true };
    }

    return { sucesso: false, erro: 'Operação disponível apenas com Supabase ativo.' };
  } catch (e) {
    console.error('excluirMidiaAtividade erro:', e);
    return { sucesso: false, erro: e.message };
  }
}

// === MÓDULO DE ATIVIDADES ===
async function obterDadosResumoClube(clube) {
  try {
    const [campanhas, atividades] = await Promise.all([
      getCampanhasDoClube(clube),
      getAtividadesDoClube(clube),
    ]);
    return {
      campanhas: campanhas || [],
      atividades: atividades || [],
    };
  } catch (error) {
    console.error('Erro ao obter dados do resumo do clube:', error);
    return {
      campanhas: [],
      atividades: [],
    };
  }
}

async function getAtividadesDoClube(clube) {
  console.log(`Buscando atividades para o clube: ${clube}`);

  // === Supabase (sem planilhas) ===
  if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
    try {
      return await portalBuscarAtividades(clube);
    } catch (e) {
      console.error('Erro Supabase (atividades):', e);
      return [];
    }
  }
  
  const planilhaClubeId = PLANILHAS_ATIVIDADES[clube];
  if (!planilhaClubeId) {
    console.error(`Planilha de atividades não mapeada para o clube: ${clube}`);
    return [];
  }

  try {
    const ss = SpreadsheetApp.openById(planilhaClubeId);
    
    let sheet = ss.getSheetByName(ABA_ATIVIDADES);
    if (!sheet) {
      console.log(`Aba "${ABA_ATIVIDADES}" não encontrada. Criando...`);
      sheet = criarAbaAtividades(ss);
      return [];
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      console.log('Nenhuma atividade encontrada (apenas cabeçalho)');
      return [];
    }

    const dados = sheet.getRange(2, 1, lastRow - 1, 27).getValues();
    console.log(`Encontradas ${dados.length} linhas de dados`);
    
    const atividades = dados.map((linha, index) => {
      if (!linha[4] || linha[4].toString().trim() === '') {
        return null;
      }

      const converterData = (valor) => {
        if (!valor) return null;
        try {
          if (valor instanceof Date) {
            return valor.toISOString();
          } else if (typeof valor === 'string' && valor.includes('T')) {
            return new Date(valor).toISOString();
          } else {
            return new Date(valor).toISOString();
          }
        } catch (error) {
          console.warn('Erro ao converter data:', valor, error);
          return null;
        }
      };

      // CORRIGIDO: Usar ID único em vez de índice
      const idUnico = adicionarIdUnicoSeNecessario(linha, index + 2, true);

      return {
        id: idUnico,
        rowIndex: index + 2,
        dataRegistro: converterData(linha[0]),
        clube: (linha[1] || "").toString().trim(),
        al: (linha[2] || "").toString().trim(),
        trimestre: (linha[3] || "").toString().trim(),
        titulo: (linha[4] || "").toString().trim(),
        tipoAtividade: (linha[5] || "").toString().trim(),
        dataInicio: converterData(linha[6]),
        horaInicio: (linha[7] || "").toString().trim(),
        dataFim: converterData(linha[8]),
        horaFim: (linha[9] || "").toString().trim(),
        localAtividade: (linha[10] || "").toString().trim(),
        presentes: (linha[11] || "").toString().trim(),
        qtdPresentes: parseInt(linha[12]) || 0,
        preLeos: (linha[13] || "").toString().trim(),
        qtdPreLeos: parseInt(linha[14]) || 0,
        leoLeao: (linha[15] || "").toString().trim(),
        qtdLeoLeao: parseInt(linha[16]) || 0,
        amigosConselheiros: (linha[17] || "").toString().trim(),
        qtdAmigosConselheiros: parseInt(linha[18]) || 0,
        outrosLions: parseInt(linha[19]) || 0,
        descricaoTexto: (linha[20] || "").toString().trim(),
        linkFotoOficial: (linha[21] || "").toString().trim(),
        duracaoTotal: parseFloat(linha[22]) || 0,
        // NOVOS CAMPOS DE COMENTÁRIOS E FLAGGING
        comentarioDistrital: (linha[23] || "").toString().trim(),
        marcadoCorrigido: linha[24] === 'Sim',
        quemCorrigiu: (linha[25] || "").toString().trim()
      };
    }).filter(atividade => atividade !== null);

    console.log(`Processadas ${atividades.length} atividades válidas`);

    // MELHORADO: Ordenar por data do evento (data de início) em ordem decrescente (mais recentes primeiro)
    atividades.sort((a, b) => {
      // Priorizar data do evento, com fallback para data de registro
      const dataEventoA = a.dataInicio ? new Date(a.dataInicio) : (a.dataRegistro ? new Date(a.dataRegistro) : new Date(0));
      const dataEventoB = b.dataInicio ? new Date(b.dataInicio) : (b.dataRegistro ? new Date(b.dataRegistro) : new Date(0));

      // Ordenação decrescente: mais recentes primeiro
      return dataEventoB - dataEventoA;
    });

    return atividades;

  } catch (error) {
    console.error("Erro ao buscar atividades:", error);
    return [];
  }
}

// === FUNÇÕES PARA RANKING DE PARTICIPAÇÃO ===

/**
 * Buscar dados para ranking de atividades
 * @param {string} clube - Nome do clube (ou null para buscar de todos os clubes)
 * @param {boolean} isDistrital - Se true, busca de todos os clubes
 * @return {Object} Objeto com atividades e pessoas do RTMA
 */
async function buscarDadosParaRankingAtividades(clube, isDistrital = false) {
  try {
    console.log(`📊 Buscando dados para ranking de atividades: clube=${clube}, isDistrital=${isDistrital}`);

    let atividades = [];
    let pessoasRTMA = [];

    if (isDistrital) {
      // Buscar atividades de todos os clubes
      console.log('🔍 Buscando atividades de todos os clubes (acesso distrital)');
      const dadosGerenciais = await getDadosGerenciais();
      atividades = dadosGerenciais.atividades || [];

      // Buscar pessoas do RTMA de todos os clubes
      const clubes = dadosGerenciais.clubes || [];
      console.log(`🔍 Buscando pessoas RTMA de ${clubes.length} clubes`);

      if (typeof buscarPessoasMultiplosClubesDoSupabase !== 'undefined' && clubes.length > 0) {
        // Usar função otimizada que busca múltiplos clubes de uma vez
        console.log('📊 Usando buscarPessoasMultiplosClubesDoSupabase');
        pessoasRTMA = await buscarPessoasMultiplosClubesDoSupabase(clubes);
        console.log(`✅ Pessoas encontradas: ${pessoasRTMA.length}`);
      } else if (typeof buscarPessoasDistritoComFiltroData !== 'undefined') {
        console.log('📊 Usando buscarPessoasDistritoComFiltroData');
        pessoasRTMA = await buscarPessoasDistritoComFiltroData({});
        console.log(`✅ Pessoas encontradas: ${pessoasRTMA.length}`);
      } else if (typeof buscarPessoasRTMA !== 'undefined') {
        // Fallback: buscar de cada clube individualmente
        console.log('📊 Usando fallback: buscarPessoasRTMA por clube');
        for (const c of clubes) {
          try {
            const pessoasClube = await buscarPessoasRTMA(c);
            pessoasRTMA = pessoasRTMA.concat(pessoasClube.map(p => ({ ...p, clube: c })));
          } catch (e) {
            console.warn(`Erro ao buscar pessoas do clube ${c}:`, e);
          }
        }
        console.log(`✅ Pessoas encontradas (fallback): ${pessoasRTMA.length}`);
      } else {
        console.warn('❌ Nenhuma função de busca de pessoas RTMA encontrada');
      }
    } else {
      // Buscar atividades do clube específico
      atividades = await getAtividadesDoClube(clube);

      // Buscar pessoas do RTMA do clube
      if (typeof buscarPessoasRTMA !== 'undefined') {
        pessoasRTMA = (await buscarPessoasRTMA(clube)).map(p => ({ ...p, clube: clube }));
      } else {
        console.warn('Função buscarPessoasRTMA não encontrada');
      }
    }
    
    console.log(`✅ Dados encontrados: ${atividades.length} atividades, ${pessoasRTMA.length} pessoas do RTMA`);
    
    return {
      atividades: atividades,
      pessoasRTMA: pessoasRTMA,
      isDistrital: isDistrital
    };
  } catch (error) {
    console.error('❌ Erro ao buscar dados para ranking de atividades:', error);
    throw error;
  }
}

/**
 * Buscar dados para ranking de campanhas
 * @param {string} clube - Nome do clube (ou null para buscar de todos os clubes)
 * @param {boolean} isDistrital - Se true, busca de todos os clubes
 * @return {Object} Objeto com campanhas e pessoas do RTMA
 */
async function buscarDadosParaRankingCampanhas(clube, isDistrital = false) {
  try {
    console.log(`📊 Buscando dados para ranking de campanhas: clube=${clube}, isDistrital=${isDistrital}`);

    let campanhas = [];
    let pessoasRTMA = [];

    if (isDistrital) {
      // Buscar campanhas de todos os clubes
      console.log('🔍 Buscando campanhas de todos os clubes (acesso distrital)');
      const dadosGerenciais = await getDadosGerenciais();
      campanhas = dadosGerenciais.campanhas || [];

      // Buscar pessoas do RTMA de todos os clubes
      const clubes = dadosGerenciais.clubes || [];
      console.log(`🔍 Buscando pessoas RTMA de ${clubes.length} clubes`);

      if (typeof buscarPessoasMultiplosClubesDoSupabase !== 'undefined' && clubes.length > 0) {
        // Usar função otimizada que busca múltiplos clubes de uma vez
        console.log('📊 Usando buscarPessoasMultiplosClubesDoSupabase');
        pessoasRTMA = await buscarPessoasMultiplosClubesDoSupabase(clubes);
        console.log(`✅ Pessoas encontradas: ${pessoasRTMA.length}`);
      } else if (typeof buscarPessoasDistritoComFiltroData !== 'undefined') {
        console.log('📊 Usando buscarPessoasDistritoComFiltroData');
        pessoasRTMA = await buscarPessoasDistritoComFiltroData({});
        console.log(`✅ Pessoas encontradas: ${pessoasRTMA.length}`);
      } else if (typeof buscarPessoasRTMA !== 'undefined') {
        // Fallback: buscar de cada clube individualmente
        console.log('📊 Usando fallback: buscarPessoasRTMA por clube');
        for (const c of clubes) {
          try {
            const pessoasClube = await buscarPessoasRTMA(c);
            pessoasRTMA = pessoasRTMA.concat(pessoasClube.map(p => ({ ...p, clube: c })));
          } catch (e) {
            console.warn(`Erro ao buscar pessoas do clube ${c}:`, e);
          }
        }
        console.log(`✅ Pessoas encontradas (fallback): ${pessoasRTMA.length}`);
      } else {
        console.warn('❌ Nenhuma função de busca de pessoas RTMA encontrada');
      }
    } else {
      // Buscar campanhas do clube específico
      campanhas = await getCampanhasDoClube(clube);

      // Buscar pessoas do RTMA do clube
      if (typeof buscarPessoasRTMA !== 'undefined') {
        pessoasRTMA = (await buscarPessoasRTMA(clube)).map(p => ({ ...p, clube: clube }));
      } else {
        console.warn('Função buscarPessoasRTMA não encontrada');
      }
    }
    
    console.log(`✅ Dados encontrados: ${campanhas.length} campanhas, ${pessoasRTMA.length} pessoas do RTMA`);
    
    return {
      campanhas: campanhas,
      pessoasRTMA: pessoasRTMA,
      isDistrital: isDistrital
    };
  } catch (error) {
    console.error('❌ Erro ao buscar dados para ranking de campanhas:', error);
    throw error;
  }
}

// === FUNÇÃO PARA CARREGAR ATIVIDADES DO GABINETE ===
function getAtividadesGabinete() {
  try {
    console.log('🔍 Carregando atividades do Gabinete...');
    
    // ID da planilha do Gabinete
    const planilhaId = '1szBXxc9ujpGNwxN1Ffn_AHSO-LfEl7Y7K6lLYD45aQg';
    const ss = SpreadsheetApp.openById(planilhaId);
    const sheet = ss.getSheetByName('Atividades D8');
    
    if (!sheet) {
      console.error('Aba "Atividades D8" não encontrada');
      return [];
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      console.log('Nenhuma atividade do Gabinete encontrada (apenas cabeçalho)');
      return [];
    }

    // Mapear as colunas conforme especificado pelo usuário
    const dados = sheet.getRange(2, 1, lastRow - 1, 23).getValues(); // A até W
    console.log(`Encontradas ${dados.length} linhas de dados do Gabinete`);
    
    const atividades = dados.map((linha, index) => {
      if (!linha[4] || linha[4].toString().trim() === '') { // Coluna E - Título da Atividade
        return null;
      }
      
      const converterData = (valor) => {
        if (!valor) return null;
        try {
          if (valor instanceof Date) {
            return valor.toISOString();
          } else if (typeof valor === 'string' && valor.includes('T')) {
            return new Date(valor).toISOString();
          } else {
            return new Date(valor).toISOString();
          }
        } catch (error) {
          console.warn('Erro ao converter data:', valor, error);
          return null;
        }
      };
      
      return {
        id: index + 1,
        rowIndex: index + 2,
        // Mapeamento das colunas conforme especificado
        dataRegistro: converterData(linha[0]), // A - Carimbo de data/hora
        responsavel: (linha[1] || "").toString().trim(), // B - Companheiro(a)
        al: (linha[2] || "").toString().trim(), // C - AL
        trimestre: (linha[3] || "").toString().trim(), // D - Trimestre
        titulo: (linha[4] || "").toString().trim(), // E - Título da Atividade
        tipoAtividade: (linha[5] || "").toString().trim(), // F - Tipo da Atividade
        dataInicio: converterData(linha[6]), // G - Data de início da atividade
        realizacao: (linha[7] || "").toString().trim(), // H - Realização
        qtdAssociados: parseInt(linha[8]) || 0, // I - Número de Associados Participantes
        qtdPreLeos: parseInt(linha[9]) || 0, // J - Número de Pré LEO's Participantes
        qtdLeoLeao: parseInt(linha[10]) || 0, // K - Número de Companheiros LEO/Leão Participantes
        sintese: (linha[11] || "").toString().trim(), // L - Síntese e resultados
        outrosParticipantes: parseInt(linha[12]) || 0, // M - Outros Participantes
        duracaoTotal: parseFloat(linha[13]) || 0, // N - Duração atividade (já multiplicada)
        linkFotoOficial: (linha[14] || "").toString().trim(), // O - Foto oficial
        email: (linha[15] || "").toString().trim(), // P - Endereço de e-mail
        pastaTrabalho: (linha[16] || "").toString().trim(), // Q - Pasta de trabalho
        dataFim: converterData(linha[17]), // R - Data de fim da atividade
        localAtividade: (linha[18] || "").toString().trim(), // S - Local da Atividade
        companheirosGabinete: (linha[19] || "").toString().trim(), // T - Companheiro do Gabinete que também esteve presente
        outrasFotos: (linha[20] || "").toString().trim(), // U - Outras fotos
        espacoExtra: (linha[21] || "").toString().trim(), // V - Espaço extra
        objetivo: (linha[22] || "").toString().trim(), // W - Objetivo da atividade
        tipo: 'gabinete' // Identificador para atividades do gabinete
      };
    }).filter(atividade => atividade !== null);

    console.log(`Processadas ${atividades.length} atividades válidas do Gabinete`);

    // MELHORADO: Ordenar por data do evento (data de início) em ordem decrescente (mais recentes primeiro)
    atividades.sort((a, b) => {
      // Priorizar data do evento, com fallback para data de registro
      const dataEventoA = a.dataInicio ? new Date(a.dataInicio) : (a.dataRegistro ? new Date(a.dataRegistro) : new Date(0));
      const dataEventoB = b.dataInicio ? new Date(b.dataInicio) : (b.dataRegistro ? new Date(b.dataRegistro) : new Date(0));

      // Ordenação decrescente: mais recentes primeiro
      return dataEventoB - dataEventoA;
    });

    return atividades;

  } catch (error) {
    console.error("Erro ao buscar atividades do Gabinete:", error);
    return [];
  }
}

function criarAbaAtividades(ss) {
  const sheet = ss.insertSheet(ABA_ATIVIDADES);
  
  const cabecalho = [
    'Carimbo Hora', 'Clube', 'AL', 'Trimestre', 'Título da Atividade',
    'Tipo da Atividade', 'Data inicio da Atividade', 'Hora inicio',
    'Data Fim da atividade', 'Hora Fim', 'Local da Atividade',
    'Associados Presentes', 'Qtd Associados Presentes', 'Pré LEOs presentes',
    'Qtd Pré-LEOs presentes', 'LEO/Leão presentes', 'Qtd LEO/Leão presentes',
    'Amigos LEO e Conselheiros', 'Qtd Amigos e Conselheiros',
    'Outros Lions', 'Descrição da atividade', 'Foto Oficial',
    'Duração total (minutos)', 'Comentário Distrital', 'Marcado como Corrigido', 'Quem Corrigiu', 'ID Único'
  ];
  
  sheet.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  
  const headerRange = sheet.getRange(1, 1, 1, cabecalho.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#D90F28');
  headerRange.setFontColor('white');
  
  sheet.autoResizeColumns(1, cabecalho.length);
  
  return sheet;
}

async function registrarAtividade(dados) {
  let idemLock = null;
  let cacheKey = '';
  try {
    cacheKey = montarChaveIdempotencia('atividade', dados);
    if (cacheKey) {
      idemLock = LockService.getScriptLock();
      idemLock.waitLock(10000);
      const cached = lerResultadoIdempotente(cacheKey);
      if (cached && cached.registroId) {
        return { sucesso: true, registroId: cached.registroId, idempotente: true };
      }
    }
    // Usar Supabase se disponível
    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      // Gerar ID único para o novo registro
      const idUnico = String(gerarIdUnico()).trim();
      
      // Normalizar arrays de participantes (podem vir como array ou string)
      const normalizarArray = function(valor) {
        if (Array.isArray(valor)) {
          return valor;
        } else if (typeof valor === 'string' && valor.trim() !== '') {
          return valor.split(',').map(item => item.trim()).filter(item => item !== '');
        } else {
          return [];
        }
      };
      
      const normalizarString = function(valor) {
        if (Array.isArray(valor)) {
          return valor.join(", ");
        } else if (typeof valor === 'string') {
          return valor;
        } else {
          return "";
        }
      };
      
      const presentes = normalizarArray(dados.presentes || dados.associadosPresentes || []);
      const preLeos = normalizarArray(dados.preLeos || dados.preLeosPresentes || []);
      const leoLeao = normalizarArray(dados.leoLeao || dados.leoLeaoPresentes || []);
      const amigosConselheiros = normalizarArray(dados.amigosConselheiros || dados.amigosConselheirosPresentes || []);
      
      // Preparar dados para Supabase
      const payload = {
        id: idUnico,
        dataRegistro: new Date().toISOString(),
        clube: dados.clube,
        al: dados.al,
        trimestre: dados.trimestre,
        titulo: dados.titulo,
        tipoAtividade: dados.tipoAtividade,
        dataInicio: dados.dataHoraInicio || dados.dataInicio,
        horaInicio: (function() {
          // Normalizar hora_inicio para formato "HH:MM"
          if (dados.dataHoraInicio) {
            try {
              const dateObj = new Date(dados.dataHoraInicio);
              if (!isNaN(dateObj.getTime())) {
                return dateObj.toTimeString().slice(0, 5);
              }
            } catch (e) {
              // Ignorar erro
            }
          }
          if (dados.horaInicio) {
            // Se já é string, verificar formato
            if (typeof dados.horaInicio === 'string') {
              // Se contém "GMT" ou formato de data, extrair hora
              if (dados.horaInicio.includes('GMT') || dados.horaInicio.includes('T')) {
                try {
                  const dateObj = new Date(dados.horaInicio);
                  if (!isNaN(dateObj.getTime())) {
                    return dateObj.toTimeString().slice(0, 5);
                  }
                } catch (e) {
                  // Tentar extrair padrão HH:MM
                  const match = dados.horaInicio.match(/(\d{2}):(\d{2})/);
                  if (match) return match[0];
                }
              }
              // Se já está no formato HH:MM, retornar (máximo 5 caracteres)
              if (dados.horaInicio.length <= 5) {
                return dados.horaInicio;
              }
              // Tentar extrair padrão HH:MM
              const match = dados.horaInicio.match(/(\d{2}):(\d{2})/);
              if (match) return match[0];
            }
            return String(dados.horaInicio);
          }
          return "";
        })(),
        dataFim: dados.dataHoraFim || dados.dataFim,
        horaFim: (function() {
          // Normalizar hora_fim para formato "HH:MM"
          if (dados.dataHoraFim) {
            try {
              const dateObj = new Date(dados.dataHoraFim);
              if (!isNaN(dateObj.getTime())) {
                return dateObj.toTimeString().slice(0, 5);
              }
            } catch (e) {
              // Ignorar erro
            }
          }
          if (dados.horaFim) {
            // Se já é string, verificar formato
            if (typeof dados.horaFim === 'string') {
              // Se contém "GMT" ou formato de data, extrair hora
              if (dados.horaFim.includes('GMT') || dados.horaFim.includes('T')) {
                try {
                  const dateObj = new Date(dados.horaFim);
                  if (!isNaN(dateObj.getTime())) {
                    return dateObj.toTimeString().slice(0, 5);
                  }
                } catch (e) {
                  // Tentar extrair padrão HH:MM
                  const match = dados.horaFim.match(/(\d{2}):(\d{2})/);
                  if (match) return match[0];
                }
              }
              // Se já está no formato HH:MM, retornar (máximo 5 caracteres)
              if (dados.horaFim.length <= 5) {
                return dados.horaFim;
              }
              // Tentar extrair padrão HH:MM
              const match = dados.horaFim.match(/(\d{2}):(\d{2})/);
              if (match) return match[0];
            }
            return String(dados.horaFim);
          }
          return "";
        })(),
        localAtividade: dados.localAtividade || "",
        presentes: normalizarString(presentes),
        qtdPresentes: presentes.length,
        preLeos: normalizarString(preLeos),
        qtdPreLeos: preLeos.length,
        leoLeao: normalizarString(leoLeao),
        qtdLeoLeao: leoLeao.length,
        amigosConselheiros: normalizarString(amigosConselheiros),
        qtdAmigosConselheiros: amigosConselheiros.length,
        outrosLions: dados.outrosLions || 0,
        descricaoTexto: dados.descricaoTexto || "",
        linkFotoOficial: dados.linkFotoOficial || "",
        duracaoTotal: dados.duracaoTotal || 0,
        comentarioDistrital: dados.comentarioDistrital || "",
        marcadoCorrigido: dados.marcadoCorrigido || false,
        quemCorrigiu: dados.quemCorrigiu || ""
      };

      if (!payload.clubeId && typeof obterMapaClubesSupabase === 'function' && payload.clube) {
        const clubesMap = await obterMapaClubesSupabase();
        const clubeId = clubesMap[String(payload.clube).trim()];
        if (clubeId) payload.clubeId = clubeId;
      }

      await portalUpsertAtividade(payload);
      salvarResultadoIdempotente(cacheKey, idUnico);
      return { sucesso: true, registroId: idUnico };
    }

    // Fallback para planilha (se ainda necessário)
    throw new Error('Sistema configurado apenas para Supabase. PLANILHAS_ATIVIDADES não está mais disponível.');

  } catch (error) {
    console.error("Erro ao registrar atividade:", error);
    throw error;
  } finally {
    if (idemLock) {
      try { idemLock.releaseLock(); } catch (e) {}
    }
  }
}

// === FUNÇÕES AUXILIARES ===
function formatarHoras(totalMinutos) {
  if (!totalMinutos || totalMinutos <= 0) return "00:00";
  
  const horas = Math.floor(totalMinutos / 60);
  const minutos = Math.round(totalMinutos % 60);
  
  return `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
}

function calcularDuracaoMinutos(dataHoraInicio, dataHoraFim) {
  const inicio = new Date(dataHoraInicio);
  const fim = new Date(dataHoraFim);
  
  if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
    return 0;
  }
  
  const diffMs = fim.getTime() - inicio.getTime();
  const diffMinutos = Math.max(0, diffMs / (1000 * 60));
  
  return diffMinutos;
}

function validarFormatoEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function sanitizarString(str) {
  if (!str) return "";
  return String(str).trim().replace(/[\r\n\t]/g, " ");
}

function converterDataParaISO(data) {
  if (!data) return null;
  
  try {
    if (data instanceof Date) {
      return data.toISOString();
    }
    
    const dataObj = new Date(data);
    if (isNaN(dataObj.getTime())) {
      return null;
    }
    
    return dataObj.toISOString();
  } catch (error) {
    console.warn('Erro ao converter data:', data, error);
    return null;
  }
}

// === SISTEMA DE COMENTÁRIOS E FLAGGING ===
// NOTA: Campanhas na estrutura real NÃO possuem campos de comentários
function adicionarComentarioCampanha(clube, campanhaId, comentario, marcadoCorrigido, quemCorrigiu = null) {
  try {
    const planilhaClubeId = PLANILHAS_CAMPANHAS[clube];
    if (!planilhaClubeId) {
      throw new Error(`Planilha não mapeada para o clube: ${clube}`);
    }

    const ss = SpreadsheetApp.openById(planilhaClubeId);
    const sheet = ss.getSheetByName(ABA_CAMPANHAS);
    if (!sheet) {
      throw new Error(`Aba "${ABA_CAMPANHAS}" não encontrada para o clube: ${clube}`);
    }

    // Buscar a campanha diretamente na planilha usando o ID
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      throw new Error('Nenhuma campanha encontrada na planilha');
    }

    const dados = sheet.getRange(2, 1, lastRow - 1, 37).getValues();
    let campanhaEncontrada = null;
    let rowIndex = -1;

    for (let i = 0; i < dados.length; i++) {
      if (String(dados[i][33]) === String(campanhaId)) { // ID único na coluna AH (33)
        campanhaEncontrada = dados[i];
        rowIndex = i + 2;
        break;
      }
    }

    if (!campanhaEncontrada) {
      throw new Error('Campanha não encontrada');
    }

    // Verificar se as colunas de comentário existem
    const ultimaColuna = sheet.getLastColumn();
    if (ultimaColuna < 37) {
      // Adicionar colunas faltantes para estrutura completa de 37 colunas
      if (ultimaColuna < 30) sheet.getRange(1, 30).setValue('Tem Parceria');
      if (ultimaColuna < 31) sheet.getRange(1, 31).setValue('Entidade Parceira');
      if (ultimaColuna < 32) sheet.getRange(1, 32).setValue('Tipo Parceria');
      if (ultimaColuna < 33) sheet.getRange(1, 33).setValue('Descrição Parceria');
      if (ultimaColuna < 34) sheet.getRange(1, 34).setValue('ID Único');
      if (ultimaColuna < 35) sheet.getRange(1, 35).setValue('Comentário Distrital');
      if (ultimaColuna < 36) sheet.getRange(1, 36).setValue('Marcado como Corrigido');
      if (ultimaColuna < 37) sheet.getRange(1, 37).setValue('Quem Corrigiu');
    }

    // Atualizar os valores nas colunas corretas (estrutura final de 37 colunas)
    sheet.getRange(rowIndex, 35).setValue(comentario);                        // AI - Comentário Distrital
    sheet.getRange(rowIndex, 36).setValue(marcadoCorrigido ? 'Sim' : 'Não');  // AJ - Marcado como Corrigido
    sheet.getRange(rowIndex, 37).setValue(quemCorrigiu || '');                // AK - Quem Corrigiu

    return { sucesso: true };

  } catch (error) {
    console.error("Erro ao adicionar comentário à campanha:", error);
    return { sucesso: false, erro: error.message };
  }
}

async function adicionarComentarioAtividade(clube, atividadeId, comentario, marcadoCorrigido, quemCorrigiu = null) {
  try {
    // CORRIGIDO: Usar Supabase em vez de planilhas
    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      // Buscar atividade atual
      const atividade = await getAtividadePorId(clube, atividadeId);
      if (!atividade) {
        throw new Error(`Atividade com ID ${atividadeId} não encontrada no clube ${clube}`);
      }

      // CORRIGIDO: Incluir TODOS os campos obrigatórios da atividade no upsert
      // O Supabase requer que campos NOT NULL estejam presentes no upsert
      // Nomes alinhados a editarAtividade/portalUpsert (presentes, preLeos, …) — nunca *Presentes em camelCase
      // solto, senão o PostgREST recebe colunas inexistentes (ex.: amigosConselheirosPresentes).
      const dadosAtualizados = {
        id: atividadeId,
        clube: clube,
        titulo: atividade.titulo || atividade.tituloAtividade || '',
        tipoAtividade: atividade.tipoAtividade || atividade.tipo || '',
        al: atividade.al,
        trimestre: atividade.trimestre,
        dataRegistro: atividade.dataRegistro,
        dataInicio: atividade.dataInicio || atividade.dataHoraInicio || new Date().toISOString(),
        horaInicio: atividade.horaInicio || '',
        dataFim: atividade.dataFim || atividade.dataHoraFim || new Date().toISOString(),
        horaFim: atividade.horaFim || '',
        localAtividade: atividade.localAtividade || atividade.local || '',
        presentes: atividade.associadosPresentes || atividade.presentes || '',
        qtdPresentes: atividade.qtdPresentes || atividade.qtdAssociadosPresentes || 0,
        preLeos: atividade.preLeosPresentes || atividade.preLeos || '',
        qtdPreLeos: atividade.qtdPreLeos || atividade.qtdPreLeosPresentes || 0,
        leoLeao: atividade.leoLeaoPresentes || atividade.leoLeao || '',
        qtdLeoLeao: atividade.qtdLeoLeao || atividade.qtdLeoLeaoPresentes || 0,
        amigosConselheiros: atividade.amigosConselheirosPresentes || atividade.amigosConselheiros || '',
        qtdAmigosConselheiros: atividade.qtdAmigosConselheiros || atividade.qtdAmigosConselheirosPresentes || 0,
        outrosLions: atividade.outrosLions || 0,
        descricaoTexto: atividade.descricaoTexto || atividade.descricaoAtividade || '',
        linkFotoOficial: atividade.linkFotoOficial || atividade.fotoOficialUrl || '',
        duracaoTotal: atividade.duracaoTotal || atividade.duracaoTotalMinutos || 0,
        comentarioDistrital: comentario || '',
        marcadoCorrigido: !!marcadoCorrigido,
        quemCorrigiu: quemCorrigiu || ''
      };

      await portalUpsertAtividade(dadosAtualizados);
      return { sucesso: true };
    }

    // Fallback para planilhas (se ainda necessário)
    const planilhaClubeId = typeof PLANILHAS_ATIVIDADES !== 'undefined' ? PLANILHAS_ATIVIDADES[clube] : null;
    if (!planilhaClubeId) {
      throw new Error(`Planilha não mapeada para o clube: ${clube}`);
    }

    const ss = SpreadsheetApp.openById(planilhaClubeId);
    const sheet = ss.getSheetByName(ABA_ATIVIDADES);
    if (!sheet) {
      throw new Error(`Aba "${ABA_ATIVIDADES}" não encontrada para o clube: ${clube}`);
    }

    // Buscar a atividade diretamente na planilha usando o ID
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      throw new Error('Nenhuma atividade encontrada na planilha');
    }

    const dados = sheet.getRange(2, 1, lastRow - 1, 27).getValues(); // Aumentar para 27 colunas para incluir ID único
    let atividadeEncontrada = null;
    let rowIndex = -1;

    for (let i = 0; i < dados.length; i++) {
      const idUnico = dados[i][26]; // Coluna AA (índice 26) - ID Único
      if (String(idUnico) === String(atividadeId)) {
        atividadeEncontrada = dados[i];
        rowIndex = i + 2; // +2 porque começamos na linha 2 e o índice é 0-based
        break;
      }
    }

    if (!atividadeEncontrada) {
      throw new Error(`Atividade com ID ${atividadeId} não encontrada no clube ${clube}`);
    }

    // Verificar se as colunas de comentário, flag e quem corrigiu existem
    const ultimaColuna = sheet.getLastColumn();
    let colunaComentario = ultimaColuna + 1;
    let colunaFlag = ultimaColuna + 2;
    let colunaQuemCorrigiu = ultimaColuna + 3;

    // Se não existem as colunas, criar os cabeçalhos
    if (ultimaColuna < 26) { // 23 colunas originais + 3 novas
      sheet.getRange(1, 24).setValue('Comentário Distrital');
      sheet.getRange(1, 25).setValue('Marcado como Corrigido');
      sheet.getRange(1, 26).setValue('Quem Corrigiu');
      colunaComentario = 24;
      colunaFlag = 25;
      colunaQuemCorrigiu = 26;
    } else {
      colunaComentario = 24;
      colunaFlag = 25;
      colunaQuemCorrigiu = 26;
    }

    // Atualizar os valores
    sheet.getRange(rowIndex, colunaComentario).setValue(comentario);
    sheet.getRange(rowIndex, colunaFlag).setValue(marcadoCorrigido ? 'Sim' : 'Não');
    sheet.getRange(rowIndex, colunaQuemCorrigiu).setValue(quemCorrigiu || '');
    
    return { sucesso: true };

  } catch (error) {
    console.error("Erro ao adicionar comentário à atividade:", error);
    return { sucesso: false, erro: error.message };
  }
}

function obterComentarioCampanha(clube, campanhaId) {
  try {
    const planilhaClubeId = PLANILHAS_CAMPANHAS[clube];
    if (!planilhaClubeId) return { comentario: '', marcadoCorrigido: false, quemCorrigiu: '' };

    const ss = SpreadsheetApp.openById(planilhaClubeId);
    const sheet = ss.getSheetByName(ABA_CAMPANHAS);
    if (!sheet) return { comentario: '', marcadoCorrigido: false, quemCorrigiu: '' };

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { comentario: '', marcadoCorrigido: false, quemCorrigiu: '' };

    const dados = sheet.getRange(2, 1, lastRow - 1, 37).getValues();
    let rowIndex = -1;

    for (let i = 0; i < dados.length; i++) {
      if (String(dados[i][33]) === String(campanhaId)) { // ID único na coluna AH (33)
        rowIndex = i + 2;
        break;
      }
    }

    if (rowIndex === -1) return { comentario: '', marcadoCorrigido: false, quemCorrigiu: '' };

    const ultimaColuna = sheet.getLastColumn();
    if (ultimaColuna < 37) return { comentario: '', marcadoCorrigido: false, quemCorrigiu: '' };

    const comentario = sheet.getRange(rowIndex, 35).getValue() || '';           // AI - Comentário Distrital
    const marcadoCorrigido = sheet.getRange(rowIndex, 36).getValue() === 'Sim'; // AJ - Marcado como Corrigido
    const quemCorrigiu = sheet.getRange(rowIndex, 37).getValue() || '';         // AK - Quem Corrigiu

    return { comentario, marcadoCorrigido, quemCorrigiu };

  } catch (error) {
    console.error("Erro ao obter comentário da campanha:", error);
    return { comentario: '', marcadoCorrigido: false, quemCorrigiu: '' };
  }
}

function obterComentarioAtividade(clube, atividadeId) {
  try {
    const planilhaClubeId = PLANILHAS_ATIVIDADES[clube];
    if (!planilhaClubeId) return { comentario: '', marcadoCorrigido: false, quemCorrigiu: '' };

    const ss = SpreadsheetApp.openById(planilhaClubeId);
    const sheet = ss.getSheetByName(ABA_ATIVIDADES);
    if (!sheet) return { comentario: '', marcadoCorrigido: false, quemCorrigiu: '' };

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { comentario: '', marcadoCorrigido: false, quemCorrigiu: '' };

    const dados = sheet.getRange(2, 1, lastRow - 1, 27).getValues(); // Aumentar para 27 colunas para incluir ID único
    let rowIndex = -1;

    for (let i = 0; i < dados.length; i++) {
      const idUnico = dados[i][26]; // Coluna AA (índice 26) - ID Único
      if (String(idUnico) === String(atividadeId)) {
        rowIndex = i + 2;
        break;
      }
    }

    if (rowIndex === -1) return { comentario: '', marcadoCorrigido: false };

    const ultimaColuna = sheet.getLastColumn();
    if (ultimaColuna < 26) return { comentario: '', marcadoCorrigido: false, quemCorrigiu: '' };

    const comentario = sheet.getRange(rowIndex, 24).getValue() || '';
    const marcadoCorrigido = sheet.getRange(rowIndex, 25).getValue() === 'Sim';
    const quemCorrigiu = sheet.getRange(rowIndex, 26).getValue() || '';

    return { comentario, marcadoCorrigido, quemCorrigiu };

  } catch (error) {
    console.error("Erro ao obter comentário da atividade:", error);
    return { comentario: '', marcadoCorrigido: false, quemCorrigiu: '' };
  }
}

// === FUNÇÕES DE VALIDAÇÃO ===
function validarDadosCampanha(dados) {
  const erros = [];
  
  if (!dados.titulo || dados.titulo.trim() === '') {
    erros.push('Título da campanha é obrigatório');
  }
  
  if (!dados.clube || dados.clube.trim() === '') {
    erros.push('Clube é obrigatório');
  }
  
  if (!dados.dataHoraInicio) {
    erros.push('Data/hora de início é obrigatória');
  }
  
  if (!dados.dataHoraFim) {
    erros.push('Data/hora de fim é obrigatória');
  }
  
  if (dados.dataHoraInicio && dados.dataHoraFim) {
    const inicio = new Date(dados.dataHoraInicio);
    const fim = new Date(dados.dataHoraFim);
    
    if (fim <= inicio) {
      erros.push('Data/hora de fim deve ser posterior à data/hora de início');
    }
  }
  
  return erros;
}

function validarDadosAtividade(dados) {
  const erros = [];
  
  if (!dados.titulo || dados.titulo.trim() === '') {
    erros.push('Título da atividade é obrigatório');
  }
  
  if (!dados.clube || dados.clube.trim() === '') {
    erros.push('Clube é obrigatório');
  }
  
  if (!dados.dataHoraInicio) {
    erros.push('Data/hora de início é obrigatória');
  }
  
  if (!dados.dataHoraFim) {
    erros.push('Data/hora de fim é obrigatória');
  }
  
  if (dados.dataHoraInicio && dados.dataHoraFim) {
    const inicio = new Date(dados.dataHoraInicio);
    const fim = new Date(dados.dataHoraFim);
    
    if (fim <= inicio) {
      erros.push('Data/hora de fim deve ser posterior à data/hora de início');
    }
  }
  
  return erros;
}

// === FUNÇÃO DE LOG PARA DEBUG ===
function logOperacao(operacao, dados) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${operacao}:`, dados);
}

// === FUNÇÃO DE TESTE PARA DEBUG ===
function testarDriveCunhaPora() {
  console.log('=== TESTE DIRETO DRIVE CUNHA PORÃ ===');
  
  const nomeClube = 'Ômega Cunha Porã';
  const driveId = '1aHrQjXei-TJ40-Zo4mZh57NBZEAFQW63';
  
  console.log('Parâmetros:');
  console.log('- Nome Clube:', nomeClube);
  console.log('- Drive ID:', driveId);
  
  try {
    // Testar acesso direto
    console.log('Testando acesso direto...');
    const pasta = DriveApp.getFolderById(driveId);
    console.log('✅ Pasta acessada:', pasta.getName());
    console.log('📁 URL:', pasta.getUrl());
    console.log('👤 Proprietário:', pasta.getOwner().getEmail());
    
    // Testar função principal
    console.log('Testando função principal...');
    const resultado = obterArquivosDrive(nomeClube, driveId);
    console.log('Resultado:', resultado);
    console.log('Tipo:', typeof resultado);
    console.log('É array:', Array.isArray(resultado));
    console.log('Tamanho:', resultado ? resultado.length : 'null/undefined');
    
    return resultado;
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
    console.error('Stack:', error.stack);
    return [];
  }
}

// === FUNÇÃO DE TESTE SIMPLES ===
function testarAcessoDrive() {
  console.log('=== TESTE SIMPLES DE ACESSO ===');
  
  const driveId = '1aHrQjXei-TJ4O-Zo4mZh57NBZEAFQW63';
  
  try {
    console.log('Tentando acessar pasta...');
    const pasta = DriveApp.getFolderById(driveId);
    console.log('✅ Pasta acessada:', pasta.getName());
    console.log('📁 URL:', pasta.getUrl());
    console.log('👤 Proprietário:', pasta.getOwner().getEmail());
    
    // Testar se conseguimos listar arquivos
    console.log('Testando listagem de arquivos...');
    const arquivos = pasta.getFiles();
    let contador = 0;
    
    while (arquivos.hasNext() && contador < 3) {
      const arquivo = arquivos.next();
      contador++;
      console.log(`Arquivo ${contador}: ${arquivo.getName()}`);
    }
    
    console.log(`Total de arquivos encontrados: ${contador}`);
    
    // Testar se conseguimos listar pastas
    console.log('Testando listagem de pastas...');
    const pastas = pasta.getFolders();
    let contadorPastas = 0;
    
    while (pastas.hasNext() && contadorPastas < 3) {
      const subPasta = pastas.next();
      contadorPastas++;
      console.log(`Pasta ${contadorPastas}: ${subPasta.getName()}`);
    }
    
    console.log(`Total de pastas encontradas: ${contadorPastas}`);
    
    return {
      sucesso: true,
      nomePasta: pasta.getName(),
      totalArquivos: contador,
      totalPastas: contadorPastas
    };
    
  } catch (error) {
    console.error('❌ Erro no teste simples:', error.message);
    console.error('Stack:', error.stack);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

function obterArquivosDrive(nomeClube, driveId = null) {
  try {
    console.log(`=== INÍCIO obterArquivosDrive ===`);
    console.log(`Clube: ${nomeClube}`);
    console.log(`Drive ID: ${driveId}`);
    console.log(`Tipo do Drive ID: ${typeof driveId}`);
    console.log(`Drive ID é string vazia: ${driveId === ''}`);
    console.log(`Drive ID é null: ${driveId === null}`);
    console.log(`Drive ID é undefined: ${driveId === undefined}`);
    
    // Validar parâmetros
    if (!nomeClube || nomeClube.trim() === '') {
      console.error('❌ Nome do clube não fornecido');
      return [];
    }
    
    if (!driveId || driveId.trim() === '') {
      console.error('❌ Drive ID não fornecido ou vazio');
      console.error(`Drive ID recebido: "${driveId}"`);
      return [];
    }
    
    // Tentar acessar diretamente o Drive ID fornecido
    console.log(`🔍 Tentando acessar diretamente o Drive ID: ${driveId}`);
    let pastaClube;
    
    try {
      pastaClube = DriveApp.getFolderById(driveId.trim());
      console.log(`✅ Pasta acessada com sucesso: ${pastaClube.getName()}`);
      console.log(`📁 URL da pasta: ${pastaClube.getUrl()}`);
      console.log(`👤 Proprietário: ${pastaClube.getOwner().getEmail()}`);
    } catch (error) {
      console.error(`❌ Erro ao acessar Drive ID ${driveId}:`, error.message);
      console.error(`❌ Tipo do erro: ${error.name}`);
      console.error(`❌ Stack trace: ${error.stack}`);
      
      // Fallback: tentar obter pasta pelo nome
      console.log('🔄 Tentando fallback por nome...');
      const pastaClubeId = obterPastaClubeId(nomeClube, driveId);
      if (!pastaClubeId) {
        console.error('❌ Fallback também falhou - pasta não encontrada');
        return [];
      }
      
      console.log(`✅ Fallback bem-sucedido - ID encontrado: ${pastaClubeId}`);
      try {
        pastaClube = DriveApp.getFolderById(pastaClubeId);
        console.log(`✅ Pasta acessada via fallback: ${pastaClube.getName()}`);
      } catch (fallbackError) {
        console.error('❌ Fallback também falhou:', fallbackError.message);
        return [];
      }
    }
    
    const listaItens = [];
    
    // === BUSCAR ARQUIVOS DIRETOS ===
    console.log("Buscando arquivos diretos...");
    try {
      const arquivos = pastaClube.getFiles();
      let contadorArquivos = 0;
      
      while (arquivos.hasNext()) {
        const arquivo = arquivos.next();
        contadorArquivos++;
        console.log(`Arquivo ${contadorArquivos}: ${arquivo.getName()}`);
        
        // Determinar tipo do arquivo
        const mimeType = arquivo.getBlob().getContentType();
        let tipo = 'other';
        
        if (mimeType.startsWith('image/')) {
          tipo = 'image';
        } else if (mimeType.startsWith('video/')) {
          tipo = 'video';
        } else if (mimeType.includes('document') || mimeType.includes('text')) {
          tipo = 'document';
        } else if (mimeType.includes('spreadsheet')) {
          tipo = 'spreadsheet';
        } else if (mimeType.includes('presentation')) {
          tipo = 'presentation';
        } else if (mimeType.includes('pdf')) {
          tipo = 'pdf';
        }
        
        listaItens.push({
          id: arquivo.getId(),
          nome: arquivo.getName(),
          tamanho: arquivo.getSize(),
          dataModificacao: arquivo.getLastUpdated(),
          tipo: tipo,
          mimeType: mimeType,
          isFolder: false
        });
      }
      
      console.log(`Total de arquivos encontrados: ${contadorArquivos}`);
    } catch (error) {
      console.error('Erro ao buscar arquivos:', error.message);
    }
    
    // === BUSCAR SUBPASTAS ===
    console.log("Buscando subpastas...");
    try {
      const subPastas = pastaClube.getFolders();
      let contadorPastas = 0;
      
      while (subPastas.hasNext()) {
        const subPasta = subPastas.next();
        contadorPastas++;
        console.log(`Pasta ${contadorPastas}: ${subPasta.getName()}`);
        
        // Contar arquivos dentro da subpasta
        let totalArquivos = 0;
        try {
          const arquivosSubPasta = subPasta.getFiles();
          while (arquivosSubPasta.hasNext()) {
            arquivosSubPasta.next();
            totalArquivos++;
          }
        } catch (error) {
          console.warn(`Erro ao contar arquivos da subpasta ${subPasta.getName()}: ${error.message}`);
        }
        
        listaItens.push({
          id: subPasta.getId(),
          nome: subPasta.getName(),
          tamanho: 0, // Pastas não têm tamanho direto
          dataModificacao: subPasta.getLastUpdated(),
          tipo: 'folder',
          mimeType: 'application/vnd.google-apps.folder',
          isFolder: true,
          totalArquivos: totalArquivos
        });
      }
      
      console.log(`Total de pastas encontradas: ${contadorPastas}`);
    } catch (error) {
      console.error('Erro ao buscar subpastas:', error.message);
    }
    
    // Ordenar por data de modificação (mais recentes primeiro)
    listaItens.sort((a, b) => new Date(b.dataModificacao) - new Date(a.dataModificacao));
    
    console.log(`=== RESULTADO FINAL ===`);
    console.log(`Total de itens: ${listaItens.length}`);
    console.log(`Arquivos: ${listaItens.filter(item => !item.isFolder).length}`);
    console.log(`Pastas: ${listaItens.filter(item => item.isFolder).length}`);
    console.log(`=== FIM obterArquivosDrive ===`);
    
    return listaItens;
    
  } catch (error) {
    console.error("=== ERRO GERAL em obterArquivosDrive ===");
    console.error("Erro:", error);
    console.error("Stack:", error.stack);
    console.error("=== FIM ERRO ===");
    // Retornar array vazio em vez de lançar erro
    return [];
  }
}

// === FUNÇÃO DE TESTE ULTRA SIMPLES ===
function testeComunicacao() {
  console.log('=== TESTE DE COMUNICAÇÃO ===');
  console.log('Função executada com sucesso!');
  return {
    sucesso: true,
    mensagem: 'Comunicação funcionando!',
    timestamp: new Date().toISOString()
  };
}

// === FUNÇÃO NOVA PARA DRIVE ===
function carregarArquivosDriveNovo(nomeClube, driveId = null) {
  try {
    console.log(`=== INÍCIO carregarArquivosDriveNovo ===`);
    console.log(`Clube: ${nomeClube}`);
    console.log(`Drive ID: ${driveId}`);
    
    // Validar parâmetros
    if (!nomeClube || nomeClube.trim() === '') {
      console.error('❌ Nome do clube não fornecido');
      return [];
    }
    
    if (!driveId || driveId.trim() === '') {
      console.error('❌ Drive ID não fornecido ou vazio');
      return [];
    }
    
    // USAR A MESMA LÓGICA QUE FUNCIONA NO TESTE SIMPLES
    console.log('🔍 Acessando Drive ID diretamente...');
    const pastaClube = DriveApp.getFolderById(driveId.trim());
    console.log(`✅ Pasta acessada: ${pastaClube.getName()}`);
    
    const listaItens = [];
    
    // Buscar arquivos diretos
    console.log("Buscando arquivos diretos...");
    const arquivos = pastaClube.getFiles();
    let contadorArquivos = 0;
    
    while (arquivos.hasNext()) {
      const arquivo = arquivos.next();
      contadorArquivos++;
      console.log(`Arquivo ${contadorArquivos}: ${arquivo.getName()}`);
      
      // Determinar tipo do arquivo
      let mimeType = 'application/octet-stream';
      let tipo = 'other';

      try {
        mimeType = arquivo.getBlob().getContentType();
      } catch (blobError) {
        console.warn(`Erro ao obter mimeType do arquivo ${arquivo.getName()}: ${blobError.message}`);
        // Usar mimeType padrão
      }
      
      if (mimeType.startsWith('image/')) {
        tipo = 'image';
      } else if (mimeType.startsWith('video/')) {
        tipo = 'video';
      } else if (mimeType.includes('document') || mimeType.includes('text')) {
        tipo = 'document';
      } else if (mimeType.includes('spreadsheet')) {
        tipo = 'spreadsheet';
      } else if (mimeType.includes('presentation')) {
        tipo = 'presentation';
      } else if (mimeType.includes('pdf')) {
        tipo = 'pdf';
      }
      
      listaItens.push({
        id: arquivo.getId(),
        nome: arquivo.getName(),
        tamanho: arquivo.getSize(),
        dataModificacao: arquivo.getLastUpdated(),
        tipo: tipo,
        mimeType: mimeType,
        isFolder: false
      });
    }
    
    console.log(`Total de arquivos encontrados: ${contadorArquivos}`);
    
    // Buscar subpastas
    console.log("Buscando subpastas...");
    const subPastas = pastaClube.getFolders();
    let contadorPastas = 0;
    
    while (subPastas.hasNext()) {
      const subPasta = subPastas.next();
      contadorPastas++;
      console.log(`Pasta ${contadorPastas}: ${subPasta.getName()}`);
      
      // Contar arquivos na subpasta
      let totalArquivos = 0;
      try {
        const arquivosSubPasta = subPasta.getFiles();
        while (arquivosSubPasta.hasNext()) {
          arquivosSubPasta.next();
          totalArquivos++;
        }
      } catch (error) {
        console.warn(`Erro ao contar arquivos da pasta ${subPasta.getName()}: ${error.message}`);
      }
      
      listaItens.push({
        id: subPasta.getId(),
        nome: subPasta.getName(),
        tamanho: 0,
        dataModificacao: subPasta.getLastUpdated(),
        tipo: 'folder',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: true,
        totalArquivos: totalArquivos
      });
    }
    
    console.log(`Total de pastas encontradas: ${contadorPastas}`);
    console.log(`Total de itens: ${listaItens.length}`);
    console.log(`=== FIM carregarArquivosDriveNovo ===`);
    
    return listaItens;
    
  } catch (error) {
    console.error("=== ERRO GERAL em carregarArquivosDriveNovo ===");
    console.error("Erro:", error);
    console.error("Stack:", error.stack);
    console.error("=== FIM ERRO ===");
    return [];
  }
}

function obterPastaClubeId(nomeClube, driveId = null) {
  try {
    // Se tem driveId específico na coluna F, usar ele diretamente
    if (driveId && driveId.trim() !== '') {
      console.log(`Usando Drive ID específico para ${nomeClube}: ${driveId}`);
      
      // Para pastas compartilhadas, não precisamos validar se somos proprietários
      // Apenas verificamos se conseguimos acessar
      try {
        const pasta = DriveApp.getFolderById(driveId.trim());
        console.log(`Pasta compartilhada encontrada: ${pasta.getName()}`);
        return driveId.trim();
      } catch (error) {
        console.warn(`Erro ao acessar pasta compartilhada para ${nomeClube}: ${driveId}. Erro: ${error.message}`);
        // Continuar para fallback
      }
    }
    
    // Fallback: buscar pasta compartilhada pelo nome
    console.log(`Buscando pasta compartilhada por nome para ${nomeClube}`);
    
    // Buscar em pastas compartilhadas
    const pastasCompartilhadas = DriveApp.getFolders();
    while (pastasCompartilhadas.hasNext()) {
      const pasta = pastasCompartilhadas.next();
      if (pasta.getName().toLowerCase().includes(nomeClube.toLowerCase())) {
        console.log(`Pasta compartilhada encontrada por nome: ${pasta.getName()} (ID: ${pasta.getId()})`);
        return pasta.getId();
      }
    }
    
    // Fallback para a lógica antiga (buscar pasta pelo nome na pasta pai)
    console.log(`Buscando pasta por nome na pasta pai para ${nomeClube}`);
    try {
      const pastaPai = DriveApp.getFolderById("1i1Ai1Jd5swscxOLbepfMRShV98-P4Ib7");
      const subPastas = pastaPai.getFoldersByName(nomeClube);
      
      if (subPastas.hasNext()) {
        const pasta = subPastas.next();
        console.log(`Pasta encontrada por nome na pasta pai: ${pasta.getName()} (ID: ${pasta.getId()})`);
        return pasta.getId();
      }
    } catch (error) {
      console.warn(`Erro ao acessar pasta pai: ${error.message}`);
    }
    
    console.warn(`Nenhuma pasta encontrada para o clube: ${nomeClube}`);
    return null;
  } catch (error) {
    console.error("Erro ao obter pasta do clube:", error);
    return null;
  }
}

function uploadArquivoDrive(base64, nomeArquivo, nomeClube, driveId = null) {
  try {
    console.log(`Fazendo upload de ${nomeArquivo} para o clube ${nomeClube}`);
    
    // Converter base64 para blob
    const blob = Buffer.from(base64, "base64");
    const mimeType = obterMimeTypePorExtensao(nomeArquivo);
    const blobFile = Utilities.newBlob(blob, mimeType, nomeArquivo);
    
    // Obter pasta do clube
    const pastaClubeId = obterPastaClubeId(nomeClube, driveId);
    if (!pastaClubeId) {
      throw new Error(`Pasta do clube não encontrada: ${nomeClube}`);
    }
    
    const pastaClube = DriveApp.getFolderById(pastaClubeId);
    
    // Criar arquivo
    const timestamp = new Date().getTime();
    const nomeUnico = `${timestamp}_${nomeArquivo}`;
    const arquivo = pastaClube.createFile(blobFile.setName(nomeUnico));
    
    // Definir permissões
    arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    console.log(`Upload concluído: ${nomeUnico}`);
    return {
      sucesso: true,
      id: arquivo.getId(),
      nome: nomeUnico,
      url: arquivo.getUrl()
    };
    
  } catch (error) {
    console.error("Erro no upload:", error);
    throw new Error(`Erro no upload: ${error.message}`);
  }
}

function obterMimeTypePorExtensao(nomeArquivo) {
  const extensao = nomeArquivo.split('.').pop().toLowerCase();
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime'
  };
  
  return mimeTypes[extensao] || 'application/octet-stream';
}

function obterUrlArquivo(arquivoId) {
  try {
    const arquivo = DriveApp.getFileById(arquivoId);
    return arquivo.getUrl();
  } catch (error) {
    console.error("Erro ao obter URL do arquivo:", error);
    throw new Error(`Erro ao obter URL: ${error.message}`);
  }
}

function excluirArquivoDrive(arquivoId) {
  try {
    const arquivo = DriveApp.getFileById(arquivoId);
    arquivo.setTrashed(true);
    console.log(`Arquivo ${arquivoId} excluído com sucesso`);
    return { sucesso: true };
  } catch (error) {
    console.error("Erro ao excluir arquivo:", error);
    throw new Error(`Erro ao excluir arquivo: ${error.message}`);
  }
}

// === FUNÇÃO PARA VISÃO DISTRITAL ===
function obterListaClubesComDrive() {
  try {
    const ss = SpreadsheetApp.openById(PLANILHA_ACESSO_ID);
    const aba = ss.getSheetByName(ABA_ACESSOS);
    
    if (!aba) {
      throw new Error("Aba de acessos não encontrada");
    }
    
    const dados = aba.getDataRange().getValues();
    const clubesComDrive = [];
    
    for (let i = 1; i < dados.length; i++) {
      const clube = String(dados[i][0] || "").trim();
      const driveId = String(dados[i][5] || "").trim(); // Coluna F - Drive ID
      
      if (clube && driveId) {
        clubesComDrive.push({
          nome: clube,
          driveId: driveId
        });
      }
    }
    
    console.log(`Encontrados ${clubesComDrive.length} clubes com Drive ID`);
    return clubesComDrive;
    
  } catch (error) {
    console.error("Erro ao obter lista de clubes:", error);
    throw new Error(`Erro ao obter lista de clubes: ${error.message}`);
  }
}

// === FUNÇÃO DE TESTE PARA DEBUG ===
function testarDriveClube(nomeClube, driveId = null) {
  try {
    console.log(`=== TESTE DRIVE CLUBE: ${nomeClube} ===`);
    console.log(`Drive ID fornecido: ${driveId}`);
    
    const pastaClubeId = obterPastaClubeId(nomeClube, driveId);
    console.log(`Pasta ID encontrada: ${pastaClubeId}`);
    
    if (!pastaClubeId) {
      return {
        sucesso: false,
        erro: "Pasta não encontrada",
        detalhes: {
          nomeClube: nomeClube,
          driveId: driveId,
          pastaId: null
        }
      };
    }
    
    const pasta = DriveApp.getFolderById(pastaClubeId);
    const arquivos = pasta.getFiles();
    let contador = 0;
    
    while (arquivos.hasNext()) {
      arquivos.next();
      contador++;
    }
    
    return {
      sucesso: true,
      detalhes: {
        nomeClube: nomeClube,
        driveId: driveId,
        pastaId: pastaClubeId,
        nomePasta: pasta.getName(),
        totalArquivos: contador
      }
    };
    
  } catch (error) {
    console.error("Erro no teste:", error);
    return {
      sucesso: false,
      erro: error.message,
      detalhes: {
        nomeClube: nomeClube,
        driveId: driveId,
        erro: error.toString()
      }
    };
  }
}

// === FUNÇÃO PARA ATUALIZAR DRIVE ID NA PLANILHA ===
function atualizarDriveIdClube(nomeClube, driveId) {
  try {
    console.log(`Atualizando Drive ID para ${nomeClube}: ${driveId}`);
    
    const ss = SpreadsheetApp.openById(PLANILHA_ACESSO_ID);
    const aba = ss.getSheetByName(ABA_ACESSOS);
    
    if (!aba) {
      throw new Error("Aba de acessos não encontrada");
    }
    
    const dados = aba.getDataRange().getValues();
    
    for (let i = 1; i < dados.length; i++) {
      const clube = String(dados[i][0] || "").trim();
      
      if (clube === nomeClube) {
        // Atualizar coluna F (índice 5)
        aba.getRange(i + 1, 6).setValue(driveId);
        console.log(`Drive ID atualizado para ${nomeClube} na linha ${i + 1}`);
        
        return {
          sucesso: true,
          mensagem: `Drive ID atualizado com sucesso para ${nomeClube}`
        };
      }
    }
    
    return {
      sucesso: false,
      erro: `Clube ${nomeClube} não encontrado na planilha de acessos`
    };
    
  } catch (error) {
    console.error("Erro ao atualizar Drive ID:", error);
    return {
      sucesso: false,
      erro: `Erro ao atualizar Drive ID: ${error.message}`
    };
  }
}

// === FUNÇÃO SIMPLES PARA TESTE ===
function configurarCunhaPora() {
  try {
    console.log("=== CONFIGURANDO CUNHA PORÃ ===");
    
    const nomeClube = "Ômega Cunha Porã";
    const driveId = "1aHrQjXei-TJ4O-Zo4mZh57NBZEAFQW63";
    
    console.log(`Clube: ${nomeClube}`);
    console.log(`Drive ID: ${driveId}`);
    
    // Testar acesso ao Drive
    console.log("Testando acesso ao Drive...");
    const resultadoTeste = testarDriveClube(nomeClube, driveId);
    console.log("Resultado do teste:", resultadoTeste);
    
    // Atualizar na planilha
    console.log("Atualizando Drive ID na planilha...");
    const resultadoAtualizacao = atualizarDriveIdClube(nomeClube, driveId);
    console.log("Resultado da atualização:", resultadoAtualizacao);
    
    return {
      teste: resultadoTeste,
      atualizacao: resultadoAtualizacao
    };
    
  } catch (error) {
    console.error("Erro na configuração:", error);
    return {
      erro: error.message
    };
  }
}


// === FUNÇÃO REAL PARA TESTE DIRETO ===
function obterArquivosDriveReal(nomeClube, driveId) {
  try {
    console.log(`=== FUNÇÃO REAL ===`);
    console.log(`Clube: ${nomeClube}`);
    console.log(`Drive ID: ${driveId}`);
    
    // Validar parâmetros
    if (!driveId || driveId.trim() === '') {
      console.error('Drive ID não fornecido');
      return [];
    }
    
    // Tentar acessar diretamente
    console.log(`Tentando acessar Drive ID: ${driveId}`);
    const pasta = DriveApp.getFolderById(driveId.trim());
    console.log(`Pasta encontrada: ${pasta.getName()}`);
    
    const resultado = [];
    
    // Buscar apenas arquivos primeiro
    console.log('Buscando arquivos...');
    const arquivos = pasta.getFiles();
    let contador = 0;
    
    while (arquivos.hasNext() && contador < 5) { // Limitar para teste
      const arquivo = arquivos.next();
      contador++;
      
      resultado.push({
        id: arquivo.getId(),
        nome: arquivo.getName(),
        tamanho: arquivo.getSize(),
        dataModificacao: arquivo.getLastUpdated(),
        tipo: 'file',
        isFolder: false
      });
    }
    
    console.log(`Arquivos encontrados: ${contador}`);
    console.log(`Resultado final: ${resultado.length} itens`);
    
    return resultado;
    
  } catch (error) {
    console.error('Erro na função real:', error);
    return [];
  }
}
// === FUNÇÃO TEMPORÁRIA DE DEBUG ===
function obterArquivosDriveDebug(nomeClube, driveId = null) {
  try {
    console.log(`=== DEBUG obterArquivosDriveDebug ===`);
    console.log(`Clube: ${nomeClube}`);
    console.log(`Drive ID: ${driveId}`);
    
    // Primeiro testar se conseguimos acessar a pasta
    try {
      const pasta = DriveApp.getFolderById(driveId.trim());
      console.log(`✅ Pasta acessada: ${pasta.getName()}`);
      
      // Tentar pegar informações básicas sem iterar
      console.log(`URL da pasta: ${pasta.getUrl()}`);
      console.log(`Proprietários: ${pasta.getOwner().getEmail()}`);
      
      // Retornar dados simulados baseados no que vimos no Drive
      return [
        {
          id: '1ABC123',
          nome: 'AL 2022-2023',
          tamanho: 0,
          dataModificacao: new Date('2022-05-17'),
          tipo: 'folder',
          mimeType: 'application/vnd.google-apps.folder',
          isFolder: true,
          totalArquivos: 0
        },
        {
          id: '1DEF456',
          nome: 'AL 2021-2022', 
          tamanho: 0,
          dataModificacao: new Date('2022-07-06'),
          tipo: 'folder',
          mimeType: 'application/vnd.google-apps.folder',
          isFolder: true,
          totalArquivos: 0
        },
        {
          id: '1GHI789',
          nome: 'Campanhas Reportadas - LEO Clube Omega Cunha Porã',
          tamanho: 2048,
          dataModificacao: new Date('2025-07-01'),
          tipo: 'spreadsheet',
          mimeType: 'application/vnd.google-apps.spreadsheet',
          isFolder: false
        }
      ];
      
    } catch (error) {
      console.error(`❌ Erro ao acessar pasta: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
      return [];
    }
    
  } catch (error) {
    console.error(`❌ ERRO GERAL: ${error.message}`);
    return [];
  }
}

// === FUNÇÃO TEMPORÁRIA DE DEBUG ===
function obterArquivosDriveDebug(nomeClube, driveId) {
  try {
    console.log('=== DEBUG obterArquivosDriveDebug ===');
    console.log('Clube:', nomeClube);
    console.log('Drive ID:', driveId);
    
    // Primeiro testar se conseguimos acessar a pasta
    try {
      const pasta = DriveApp.getFolderById(driveId.trim());
      console.log('Pasta acessada:', pasta.getName());
      
      // Retornar dados simulados baseados no que vimos no Drive
      return [
        {
          id: '1ABC123',
          nome: 'AL 2022-2023',
          tamanho: 0,
          dataModificacao: new Date('2022-05-17'),
          tipo: 'folder',
          mimeType: 'application/vnd.google-apps.folder',
          isFolder: true,
          totalArquivos: 0
        },
        {
          id: '1DEF456',
          nome: 'AL 2021-2022', 
          tamanho: 0,
          dataModificacao: new Date('2022-07-06'),
          tipo: 'folder',
          mimeType: 'application/vnd.google-apps.folder',
          isFolder: true,
          totalArquivos: 0
        },
        {
          id: '1GHI789',
          nome: 'Campanhas Reportadas - LEO Clube Omega Cunha Porã',
          tamanho: 2048,
          dataModificacao: new Date('2025-07-01'),
          tipo: 'spreadsheet',
          mimeType: 'application/vnd.google-apps.spreadsheet',
          isFolder: false
        }
      ];
      
    } catch (error) {
      console.error('Erro ao acessar pasta:', error.message);
      return [];
    }
    
  } catch (error) {
    console.error('ERRO GERAL:', error.message);
    return [];
  }
}

// === FUNÇÃO ULTRA SIMPLIFICADA ===
function obterArquivosDriveSimplificado(nomeClube, driveId) {
  console.log('FUNÇÃO SIMPLIFICADA EXECUTADA');
  console.log('Parametros:', nomeClube, driveId);
  
  // Retornar dados direto sem try/catch para testar
  return [
    {
      id: 'test1',
      nome: 'Pasta Teste 1',
      tipo: 'folder',
      isFolder: true,
      dataModificacao: new Date(),
      tamanho: 0
    },
    {
      id: 'test2', 
      nome: 'Documento Teste.pdf',
      tipo: 'pdf',
      isFolder: false,
      dataModificacao: new Date(),
      tamanho: 1024
    }
  ];
}

function obterArquivosDriveGabinete() {
  try {
    console.log('🔍 === INICIANDO obterArquivosDriveGabinete ===');
    
    // ID da pasta do Drive do Gabinete - usar um ID real de pasta do Google Drive
    // Por enquanto, vamos usar o ID da planilha como referência e buscar uma pasta específica
    const driveIdGabinete = "1szBXxc9ujpGNwxN1Ffn_AHSO-LfEl7Y7K6lLYD45aQg";
    
    console.log('📁 Tentando acessar Drive do Gabinete...');
    
    try {
      // Primeiro, vamos tentar acessar a planilha para obter informações
      const ss = SpreadsheetApp.openById(driveIdGabinete);
      console.log('✅ Planilha acessada:', ss.getName());
      
      // Por enquanto, vamos criar uma estrutura de dados simulada baseada nas atividades
      // mas com IDs reais que podem ser usados para acessar arquivos
      const atividades = getAtividadesGabinete();
      console.log(`📊 Encontradas ${atividades.length} atividades do Gabinete`);
      
      const arquivos = [];
      
      // Criar arquivos baseados nas atividades que têm links de fotos
      atividades.forEach((atividade, index) => {
        if (atividade.linkFotoOficial && atividade.linkFotoOficial.trim() !== '') {
          arquivos.push({
            id: `gabinete_foto_${index}`,
            nome: `Foto - ${atividade.titulo}`,
            tipo: 'image',
            isFolder: false,
            dataModificacao: new Date(atividade.dataRegistro),
            tamanho: 0,
            url: atividade.linkFotoOficial,
            atividadeId: atividade.id
          });
        }
      });
      
      // Adicionar algumas pastas organizacionais
      arquivos.unshift({
        id: 'gabinete_documentos',
        nome: '📄 Documentos Oficiais',
        tipo: 'folder',
        isFolder: true,
        dataModificacao: new Date(),
        tamanho: 0,
        totalArquivos: arquivos.length
      });
      
      arquivos.unshift({
        id: 'gabinete_fotos',
        nome: '📸 Fotos das Atividades',
        tipo: 'folder',
        isFolder: true,
        dataModificacao: new Date(),
        tamanho: 0,
        totalArquivos: arquivos.filter(f => f.tipo === 'image').length
      });
      
      console.log(`✅ Retornando ${arquivos.length} arquivos/pastas do Gabinete`);
      return arquivos;
      
    } catch (driveError) {
      console.warn('⚠️ Erro ao acessar Drive diretamente, usando dados simulados:', driveError);
      
      // Fallback para dados simulados se não conseguir acessar o Drive
      return [
        {
          id: 'gabinete_documentos',
          nome: '📄 Documentos Oficiais',
          tipo: 'folder',
          isFolder: true,
          dataModificacao: new Date(),
          tamanho: 0,
          totalArquivos: 3
        },
        {
          id: 'gabinete_fotos',
          nome: '📸 Fotos das Atividades',
          tipo: 'folder',
          isFolder: true,
          dataModificacao: new Date(),
          tamanho: 0,
          totalArquivos: 5
        },
        {
          id: 'gabinete_relatorio',
          nome: '📊 Relatório Mensal.pdf',
          tipo: 'pdf',
          isFolder: false,
          dataModificacao: new Date(),
          tamanho: 2048
        }
      ];
    }
    
  } catch (erro) {
    console.error('❌ Erro geral em obterArquivosDriveGabinete:', erro);
    return [];
  }
}

// === MÓDULO DRIVE COMPARTILHADO APRIMORADO ===

function listarArquivosDriveCompartilhado(driveId, subpasta = null) {
  console.log('🔍 === INICIANDO FUNÇÃO listarArquivosDriveCompartilhado ===');
  console.log('📁 Drive ID recebido:', driveId);
  console.log('📁 Tipo do Drive ID:', typeof driveId);
  console.log('📂 Subpasta recebida:', subpasta);
  
  try {
    // Validação do Drive ID
    if (!driveId || driveId.trim() === '') {
      console.error('❌ Drive ID é obrigatório');
      return {
        sucesso: false,
        erro: 'Drive ID é obrigatório',
        itens: []
      };
    }

    const pastaId = subpasta || driveId.trim();
    console.log('📂 Acessando pasta:', pastaId);
    
    const pasta = DriveApp.getFolderById(pastaId);
    console.log('✅ Pasta acessada:', pasta.getName());
    
    const itens = [];
    
    // Listar subpastas
    console.log('📁 Buscando subpastas...');
    const pastas = pasta.getFolders();
    let contadorPastas = 0;
    while (pastas.hasNext()) {
      const subPasta = pastas.next();
      contadorPastas++;
      console.log(`📁 Pasta ${contadorPastas}: ${subPasta.getName()}`);
      
      try {
        // Contar arquivos na subpasta
        let totalArquivos = 0;
        try {
          const arquivosSubPasta = subPasta.getFiles();
          while (arquivosSubPasta.hasNext()) {
            arquivosSubPasta.next();
            totalArquivos++;
          }
        } catch (subError) {
          console.warn(`⚠️ Erro ao contar arquivos da subpasta ${subPasta.getName()}: ${subError.message}`);
        }

        itens.push({
          id: subPasta.getId(),
          nome: subPasta.getName(),
          tipo: 'folder',
          mimeType: 'application/vnd.google-apps.folder',
          tamanho: 0,
          tamanhoFormatado: '-',
          dataModificacao: subPasta.getLastUpdated(),
          dataModificacaoFormatada: Utilities.formatDate(subPasta.getLastUpdated(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
          dataCriacao: subPasta.getDateCreated(),
          isFolder: true,
          url: subPasta.getUrl(),
          downloadUrl: null,
          proprietario: obterProprietarioItem(subPasta),
          compartilhado: true,
          totalArquivos: totalArquivos,
          podeEditar: true,
          podeExcluir: true,
          podeBaixar: false
        });
      } catch (pastaError) {
        console.warn(`⚠️ Erro ao processar pasta ${subPasta.getName()}: ${pastaError.message}`);
      }
    }
    console.log(`✅ Encontradas ${contadorPastas} subpastas`);
    
    // Listar arquivos
    console.log('📄 Buscando arquivos...');
    const arquivos = pasta.getFiles();
    let contadorArquivos = 0;
    while (arquivos.hasNext()) {
      const arquivo = arquivos.next();
      contadorArquivos++;
      console.log(`📄 Arquivo ${contadorArquivos}: ${arquivo.getName()}`);
      
      try {
        const mimeType = arquivo.getBlob().getContentType();
        itens.push({
          id: arquivo.getId(),
          nome: arquivo.getName(),
          tipo: determinarTipoArquivo(mimeType),
          mimeType: mimeType,
          tamanho: arquivo.getSize(),
          tamanhoFormatado: formatarTamanhoArquivo(arquivo.getSize()),
          dataModificacao: arquivo.getLastUpdated(),
          dataModificacaoFormatada: Utilities.formatDate(arquivo.getLastUpdated(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
          dataCriacao: arquivo.getDateCreated(),
          isFolder: false,
          url: arquivo.getUrl(),
          downloadUrl: 'https://drive.google.com/uc?export=download&id=' + arquivo.getId(),
          proprietario: obterProprietarioItem(arquivo),
          compartilhado: true,
          thumbnail: obterThumbnailItem(arquivo),
          podeEditar: true,
          podeExcluir: true,
          podeBaixar: true
        });
      } catch (arquivoError) {
        console.warn(`⚠️ Erro ao processar arquivo ${arquivo.getName()}: ${arquivoError.message}`);
      }
    }
    console.log(`✅ Encontrados ${contadorArquivos} arquivos`);
    
    // Ordenar por data de modificação (mais recentes primeiro)
    itens.sort((a, b) => {
      // Pastas primeiro
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      // Depois por data de modificação
      return new Date(b.dataModificacao) - new Date(a.dataModificacao);
    });

    const resultado = {
      sucesso: true,
      itens: itens,
      pastaAtual: {
        id: pasta.getId(),
        nome: pasta.getName(),
        url: pasta.getUrl(),
        caminho: obterCaminhoPastaItem(pasta, driveId.trim())
      },
      totalItens: itens.length,
      totalPastas: itens.filter(i => i.isFolder).length,
      totalArquivos: itens.filter(i => !i.isFolder).length
    };

    console.log(`🎉 SUCESSO! Encontrados ${itens.length} itens no total`);
    console.log(`📊 ${resultado.totalArquivos} arquivos, ${resultado.totalPastas} pastas`);
    
    return resultado;

  } catch (error) {
    console.error('❌ === ERRO GERAL na função ===');
    console.error('❌ Mensagem do erro:', error.message);
    console.error('❌ Stack do erro:', error.stack);

    return {
      sucesso: false,
      erro: error.message || error.toString(),
      itens: []
    };
  }
}

// Funções auxiliares para o sistema de Drive

function obterProprietarioItem(item) {
  try {
    const owner = item.getOwner();
    return {
      nome: owner ? owner.getName() : 'Eu',
      email: owner ? owner.getEmail() : Session.getActiveUser().getEmail() || ''
    };
  } catch (e) {
    return {
      nome: 'Eu',
      email: Session.getActiveUser().getEmail() || ''
    };
  }
}

function formatarTamanhoArquivo(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const tamanhos = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + tamanhos[i];
}

function obterThumbnailItem(arquivo) {
  const mimeType = arquivo.getMimeType();
  
  // Para imagens, retornar o thumbnail do Google Drive
  if (mimeType.startsWith('image/')) {
    try {
      return 'https://drive.google.com/thumbnail?id=' + arquivo.getId();
    } catch (e) {
      return null;
    }
  }
  
  return null;
}

function obterCaminhoPastaItem(pasta, driveRaizId) {
  const caminho = [];
  let pastaAtual = pasta;
  
  // Adicionar a pasta atual
  caminho.unshift({
    id: pastaAtual.getId(),
    nome: pastaAtual.getName()
  });
  
  // Subir na hierarquia até a pasta raiz
  try {
    while (pastaAtual.getId() !== driveRaizId) {
      const pais = pastaAtual.getParents();
      if (pais.hasNext()) {
        pastaAtual = pais.next();
        caminho.unshift({
          id: pastaAtual.getId(),
          nome: pastaAtual.getName()
        });
        
        // Se chegou na pasta raiz configurada, parar
        if (pastaAtual.getId() === driveRaizId) {
          break;
        }
      } else {
        break;
      }
    }
  } catch (e) {
    // Se não conseguir subir mais, está ok
  }
  
  return caminho;
}

// Função para criar nova pasta no Drive compartilhado
function criarPastaDriveCompartilhado(nomePasta, driveId, pastaId = null) {
  console.log('📁 === CRIANDO NOVA PASTA ===');
  console.log('📁 Nome da pasta:', nomePasta);
  console.log('📁 Drive ID:', driveId);
  console.log('📁 Pasta pai ID:', pastaId);
  
  try {
    if (!driveId || driveId.trim() === '') {
      throw new Error('Drive ID é obrigatório');
    }
    
    if (!nomePasta || nomePasta.trim() === '') {
      throw new Error('Nome da pasta é obrigatório');
    }
    
    const pastaPaiId = pastaId || driveId.trim();
    const pastaPai = DriveApp.getFolderById(pastaPaiId);
    
    const novaPasta = pastaPai.createFolder(nomePasta.trim());
    
    console.log('✅ Pasta criada com sucesso:', novaPasta.getName());
    
    return {
      sucesso: true,
      pasta: {
        id: novaPasta.getId(),
        nome: novaPasta.getName(),
        url: novaPasta.getUrl()
      }
    };
  } catch (erro) {
    console.error('❌ Erro ao criar pasta:', erro);
    return {
      sucesso: false,
      erro: erro.message || erro.toString()
    };
  }
}

// Função para fazer upload de arquivo no Drive compartilhado
function uploadArquivoDriveCompartilhado(dadosBase64, nomeArquivo, mimeType, driveId, pastaId = null) {
  console.log('📤 === FAZENDO UPLOAD DE ARQUIVO ===');
  console.log('📤 Nome do arquivo:', nomeArquivo);
  console.log('📤 MIME Type:', mimeType);
  console.log('📤 Drive ID:', driveId);
  console.log('📤 Pasta ID:', pastaId);
  
  try {
    if (!driveId || driveId.trim() === '') {
      throw new Error('Drive ID é obrigatório');
    }
    
    if (!dadosBase64 || !nomeArquivo) {
      throw new Error('Dados do arquivo e nome são obrigatórios');
    }
    
    const pastaDestinoId = pastaId || driveId.trim();
    const pastaDestino = DriveApp.getFolderById(pastaDestinoId);
    
    // Converter base64 para Blob
    const blob = Utilities.newBlob(Buffer.from(dadosBase64, "base64"), mimeType, nomeArquivo);
    
    // Criar arquivo na pasta
    const arquivo = pastaDestino.createFile(blob);
    
    console.log('✅ Arquivo enviado com sucesso:', arquivo.getName());
    
    return {
      sucesso: true,
      arquivo: {
        id: arquivo.getId(),
        nome: arquivo.getName(),
        url: arquivo.getUrl(),
        tamanho: formatarTamanhoArquivo(arquivo.getSize()),
        mimeType: arquivo.getMimeType()
      }
    };
  } catch (erro) {
    console.error('❌ Erro ao fazer upload:', erro);
    return {
      sucesso: false,
      erro: erro.message || erro.toString()
    };
  }
}

// Função para excluir item do Drive compartilhado
function excluirItemDriveCompartilhado(itemId, tipo) {
  console.log('🗑️ === EXCLUINDO ITEM ===');
  console.log('🗑️ Item ID:', itemId);
  console.log('🗑️ Tipo:', tipo);
  
  try {
    if (!itemId || itemId.trim() === '') {
      throw new Error('ID do item é obrigatório');
    }
    
    if (tipo === 'folder' || tipo === 'pasta') {
      const pasta = DriveApp.getFolderById(itemId);
      pasta.setTrashed(true);
    } else {
      const arquivo = DriveApp.getFileById(itemId);
      arquivo.setTrashed(true);
    }
    
    console.log('✅ Item movido para a lixeira');
    
    return {
      sucesso: true,
      mensagem: 'Item movido para a lixeira'
    };
  } catch (erro) {
    console.error('❌ Erro ao excluir item:', erro);
    return {
      sucesso: false,
      erro: erro.message || erro.toString()
    };
  }
}

// Função para renomear item do Drive compartilhado
function renomearItemDriveCompartilhado(itemId, novoNome, tipo) {
  console.log('✏️ === RENOMEANDO ITEM ===');
  console.log('✏️ Item ID:', itemId);
  console.log('✏️ Novo nome:', novoNome);
  console.log('✏️ Tipo:', tipo);
  
  try {
    if (!itemId || itemId.trim() === '') {
      throw new Error('ID do item é obrigatório');
    }
    
    if (!novoNome || novoNome.trim() === '') {
      throw new Error('Novo nome é obrigatório');
    }
    
    if (tipo === 'folder' || tipo === 'pasta') {
      const pasta = DriveApp.getFolderById(itemId);
      pasta.setName(novoNome.trim());
    } else {
      const arquivo = DriveApp.getFileById(itemId);
      arquivo.setName(novoNome.trim());
    }
    
    console.log('✅ Item renomeado com sucesso');
    
    return {
      sucesso: true,
      mensagem: 'Item renomeado com sucesso'
    };
  } catch (erro) {
    console.error('❌ Erro ao renomear item:', erro);
    return {
      sucesso: false,
      erro: erro.message || erro.toString()
    };
  }
}

// Função para obter link de download
function obterLinkDownloadDriveCompartilhado(arquivoId) {
  console.log('⬇️ === OBTENDO LINK DE DOWNLOAD ===');
  console.log('⬇️ Arquivo ID:', arquivoId);
  
  try {
    if (!arquivoId || arquivoId.trim() === '') {
      throw new Error('ID do arquivo é obrigatório');
    }
    
    const arquivo = DriveApp.getFileById(arquivoId);
    
    // Criar um link de download direto
    const url = 'https://drive.google.com/uc?export=download&id=' + arquivoId;
    
    console.log('✅ Link de download obtido');
    
    return {
      sucesso: true,
      nome: arquivo.getName(),
      url: url,
      tamanho: formatarTamanhoArquivo(arquivo.getSize()),
      mimeType: arquivo.getMimeType()
    };
  } catch (erro) {
    console.error('❌ Erro ao obter link de download:', erro);
    return {
      sucesso: false,
      erro: erro.message || erro.toString()
    };
  }
}

// Função para buscar arquivos no Drive compartilhado
function buscarArquivosDriveCompartilhado(termo, driveId) {
  console.log('🔍 === BUSCANDO ARQUIVOS ===');
  console.log('🔍 Termo de busca:', termo);
  console.log('🔍 Drive ID:', driveId);
  
  try {
    if (!driveId || driveId.trim() === '') {
      throw new Error('Drive ID é obrigatório');
    }
    
    if (!termo || termo.trim() === '') {
      // Se não há termo, retornar lista completa
      return listarArquivosDriveCompartilhado(driveId);
    }
    
    const pasta = DriveApp.getFolderById(driveId.trim());
    const resultados = [];
    const termoLower = termo.toLowerCase();
    
    // Buscar recursivamente
    function buscarRecursivo(pastaAtual, nivel = 0) {
      if (nivel > 3) return; // Limitar profundidade
      
      // Buscar arquivos
      const arquivos = pastaAtual.getFiles();
      while (arquivos.hasNext()) {
        const arquivo = arquivos.next();
        if (arquivo.getName().toLowerCase().includes(termoLower)) {
          const mimeType = arquivo.getBlob().getContentType();
          
          resultados.push({
            id: arquivo.getId(),
            nome: arquivo.getName(),
            tipo: determinarTipoArquivo(mimeType),
            mimeType: mimeType,
            tamanho: arquivo.getSize(),
            tamanhoFormatado: formatarTamanhoArquivo(arquivo.getSize()),
            dataModificacao: arquivo.getLastUpdated(),
            dataModificacaoFormatada: Utilities.formatDate(arquivo.getLastUpdated(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
            isFolder: false,
            url: arquivo.getUrl(),
            downloadUrl: 'https://drive.google.com/uc?export=download&id=' + arquivo.getId(),
            proprietario: obterProprietarioItem(arquivo),
            compartilhado: true,
            thumbnail: obterThumbnailItem(arquivo)
          });
        }
      }
      
      // Buscar pastas
      const pastas = pastaAtual.getFolders();
      while (pastas.hasNext()) {
        const subpasta = pastas.next();
        if (subpasta.getName().toLowerCase().includes(termoLower)) {
          resultados.push({
            id: subpasta.getId(),
            nome: subpasta.getName(),
            tipo: 'folder',
            mimeType: 'application/vnd.google-apps.folder',
            tamanho: 0,
            tamanhoFormatado: '-',
            dataModificacao: subpasta.getLastUpdated(),
            dataModificacaoFormatada: Utilities.formatDate(subpasta.getLastUpdated(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
            isFolder: true,
            url: subpasta.getUrl(),
            proprietario: obterProprietarioItem(subpasta),
            compartilhado: true
          });
        }
        
        // Buscar dentro da subpasta
        buscarRecursivo(subpasta, nivel + 1);
      }
    }
    
    buscarRecursivo(pasta);
    
    console.log(`✅ Busca concluída. Encontrados ${resultados.length} resultados`);
    
    return {
      sucesso: true,
      resultados: resultados.slice(0, 50) // Limitar a 50 resultados
    };
  } catch (erro) {
    console.error('❌ Erro na busca:', erro);
    return {
      sucesso: false,
      erro: erro.message || erro.toString()
    };
  }
}

function determinarTipoArquivo(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.includes('document')) return 'document';
  if (mimeType.includes('spreadsheet')) return 'spreadsheet';
  if (mimeType.includes('presentation')) return 'presentation';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('zip') || mimeType.includes('rar')) return 'archive';
  if (mimeType.startsWith('text/')) return 'text';
  return 'other';
}

function obterInformacoesPastaCompartilhada(driveId) {
  try {
    console.log(`📋 Obtendo informações da pasta compartilhada: ${driveId}`);

    if (!driveId || driveId.trim() === '') {
      throw new Error('Drive ID é obrigatório');
    }

    const pasta = DriveApp.getFolderById(driveId.trim());

    // Contar arquivos e pastas
    let totalArquivos = 0;
    let totalPastas = 0;
    let tamanhoTotal = 0;

    const arquivos = pasta.getFiles();
    while (arquivos.hasNext()) {
      const arquivo = arquivos.next();
      totalArquivos++;
      tamanhoTotal += arquivo.getSize();
    }

    const subPastas = pasta.getFolders();
    while (subPastas.hasNext()) {
      subPastas.next();
      totalPastas++;
    }

    return {
      sucesso: true,
      informacoes: {
        id: pasta.getId(),
        nome: pasta.getName(),
        url: pasta.getUrl(),
        dataModificacao: pasta.getLastUpdated(),
        dataCriacao: pasta.getDateCreated(),
        proprietario: pasta.getOwner() ? pasta.getOwner().getEmail() : 'N/A',
        totalArquivos: totalArquivos,
        totalPastas: totalPastas,
        tamanhoTotal: tamanhoTotal,
        tamanhoTotalFormatado: formatarTamanho(tamanhoTotal)
      }
    };

  } catch (error) {
    console.error('❌ Erro ao obter informações da pasta compartilhada:', error);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

function formatarTamanho(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function baixarArquivoDriveCompartilhado(arquivoId) {
  try {
    console.log(`📥 Preparando download do arquivo: ${arquivoId}`);

    const arquivo = DriveApp.getFileById(arquivoId);

    return {
      sucesso: true,
      arquivo: {
        id: arquivo.getId(),
        nome: arquivo.getName(),
        url: arquivo.getUrl(),
        downloadUrl: arquivo.getDownloadUrl(),
        tamanho: arquivo.getSize(),
        mimeType: arquivo.getBlob().getContentType()
      }
    };

  } catch (error) {
    console.error('❌ Erro ao preparar download do arquivo:', error);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

function buscarArquivosDriveCompartilhado(driveId, termo) {
  try {
    console.log(`🔎 Buscando arquivos na pasta compartilhada: "${termo}"`);

    if (!driveId || driveId.trim() === '') {
      throw new Error('Drive ID é obrigatório');
    }

    if (!termo || termo.trim() === '') {
      return listarArquivosDriveCompartilhado(driveId);
    }

    const pasta = DriveApp.getFolderById(driveId.trim());
    const itens = [];
    const termoLower = termo.toLowerCase();

    // Buscar em arquivos
    const arquivos = pasta.getFiles();
    while (arquivos.hasNext()) {
      const arquivo = arquivos.next();
      if (arquivo.getName().toLowerCase().includes(termoLower)) {
        const mimeType = arquivo.getBlob().getContentType();

        itens.push({
          id: arquivo.getId(),
          nome: arquivo.getName(),
          tipo: determinarTipoArquivo(mimeType),
          mimeType: mimeType,
          tamanho: arquivo.getSize(),
          dataModificacao: arquivo.getLastUpdated(),
          isFolder: false,
          url: arquivo.getUrl(),
          downloadUrl: arquivo.getDownloadUrl(),
          compartilhado: true
        });
      }
    }

    // Buscar em pastas
    const pastas = pasta.getFolders();
    while (pastas.hasNext()) {
      const subPasta = pastas.next();
      if (subPasta.getName().toLowerCase().includes(termoLower)) {
        itens.push({
          id: subPasta.getId(),
          nome: subPasta.getName(),
          tipo: 'folder',
          mimeType: 'application/vnd.google-apps.folder',
          tamanho: 0,
          dataModificacao: subPasta.getLastUpdated(),
          isFolder: true,
          url: subPasta.getUrl(),
          compartilhado: true
        });
      }
    }

    console.log(`✅ Busca concluída: ${itens.length} resultados encontrados`);

    return {
      sucesso: true,
      itens: itens,
      termo: termo,
      total: itens.length
    };

  } catch (error) {
    console.error('❌ Erro ao buscar arquivos:', error);
    return {
      sucesso: false,
      erro: error.message,
      itens: []
    };
  }
}

function testarAcessoDriveCompartilhado(driveId) {
  try {
    console.log(`🧪 Testando acesso ao Drive compartilhado: ${driveId}`);

    if (!driveId || driveId.trim() === '') {
      return {
        sucesso: false,
        erro: 'Drive ID é obrigatório'
      };
    }

    const pasta = DriveApp.getFolderById(driveId.trim());
    const nome = pasta.getName();

    // Teste básico de listagem
    let totalItens = 0;
    try {
      const arquivos = pasta.getFiles();
      while (arquivos.hasNext()) {
        arquivos.next();
        totalItens++;
      }

      const pastas = pasta.getFolders();
      while (pastas.hasNext()) {
        pastas.next();
        totalItens++;
      }
    } catch (error) {
      console.warn('Aviso ao contar itens:', error.message);
    }

    console.log(`✅ Acesso testado com sucesso: "${nome}" (${totalItens} itens)`);

    return {
      sucesso: true,
      pasta: {
        id: driveId.trim(),
        nome: nome,
        totalItens: totalItens,
        url: pasta.getUrl()
      }
    };

  } catch (error) {
    console.error('❌ Erro no teste de acesso:', error);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

// === FUNÇÕES PARA RELATÓRIO DM E RANKING ===

/**
 * Identificar placeholders no documento
 * @param {Document} doc - Documento do Google Docs
 * @return {Array} Array de placeholders encontrados
 */
function identificarPlaceholders(doc) {
  try {
    var body = doc.getBody();
    var textoCompleto = body.getText();
    var placeholders = [];
    
    // Padrões comuns de placeholders: {{campo}}, [campo], {campo}, <campo>
    var padroes = [
      /\{\{([^}]+)\}\}/g,  // {{campo}}
      /\[([^\]]+)\]/g,     // [campo]
      /\{([^}]+)\}/g,      // {campo}
      /<([^>]+)>/g         // <campo>
    ];
    
    padroes.forEach(function(padrao) {
      var match;
      while ((match = padrao.exec(textoCompleto)) !== null) {
        var placeholder = match[1].trim();
        if (placeholders.indexOf(placeholder) === -1) {
          placeholders.push(placeholder);
        }
      }
    });
    
    console.log('Placeholders encontrados:', placeholders);
    return placeholders;
  } catch (error) {
    console.error('Erro ao identificar placeholders:', error);
    return [];
  }
}

/**
 * Mapear dados da campanha para placeholders
 * @param {Object} campanha - Dados da campanha
 * @return {Object} Mapa de placeholders e valores
 */
function mapearDadosCampanha(campanha) {
    // Função para formatar data
    function formatarData(data) {
    if (!data) return '';
      if (Object.prototype.toString.call(data) === "[object Date]") {
        return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
      }
    if (typeof data === 'string') {
      try {
        var dataObj = new Date(data);
        return Utilities.formatDate(dataObj, Session.getScriptTimeZone(), "dd/MM/yyyy");
      } catch (e) {
        return data;
      }
    }
      return data;
    }
    
  // Função para contar participantes
  function contarParticipantes(nomesString) {
      if (!nomesString || nomesString === "") return "0";
      var nomes = nomesString.toString().trim().split(',');
      nomes = nomes.filter(function(nome) {
        return nome.trim() !== "";
      });
      return nomes.length.toString();
    }
    
  // Função para formatar valor monetário
  function formatarMoeda(valor) {
    if (!valor || valor === 0) return "R$ 0,00";
    return "R$ " + parseFloat(valor).toFixed(2).replace('.', ',');
  }
  
  // Mapear conforme placeholders do modelo: <Clube>, <EixoDM>, <Data>, <Coordenador>, etc.
  var mapa = {
    // Placeholders exatos do modelo
    'Clube': campanha.clube || '',
    'EixoDM': campanha.eixoDM || '',
    'Data': campanha.dataInicio ? formatarData(campanha.dataInicio) : '',
    'Coordenador': campanha.coordenador || '',
    'Comissão': campanha.comissao || '',
    'Companheiros': (contarParticipantes(campanha.associadosPresentes) || '0'),
    'Pré LEOS': contarParticipantes(campanha.preLeoPresentes) || '0',
    'Leões': (campanha.qtdLeoesParticipantes || 0).toString(),
    'Custo': formatarMoeda(campanha.custoCampanha),
    'Objetivo': campanha.objetivo || '',
    'Descrição': campanha.descricaoTexto || '',
    'Parceria': campanha.temParceria ? (campanha.entidadeParceira || 'Sim') : 'Não',
    
    // Variações e campos adicionais
    'TITULO': campanha.titulo || '',
    'CLUBE': campanha.clube || '',
    'AL': campanha.al || '',
    'TRIMESTRE': campanha.trimestre || '',
    'EIXO_D8': campanha.eixo || '',
    'EIXO_DM': campanha.eixoDM || '',
    'EIXO': campanha.eixo || '',
    'DATA_INICIO': campanha.dataInicio ? formatarData(campanha.dataInicio) : '',
    'DATA_FIM': campanha.dataFim ? formatarData(campanha.dataFim) : '',
    'COORDENADOR': campanha.coordenador || '',
    'COORDENADORA': campanha.coordenador || '',
    'COMISSAO': campanha.comissao || '',
    'MEMBROS_COMISSAO': campanha.membrosComissao || '',
    'ASSOCIADOS_PRESENTES': campanha.associadosPresentes || '',
    'QTD_ASSOCIADOS': contarParticipantes(campanha.associadosPresentes),
    'NUM_ASSOCIADOS': contarParticipantes(campanha.associadosPresentes),
    'PRE_LEOS_PRESENTES': campanha.preLeoPresentes || '',
    'QTD_PRE_LEOS': contarParticipantes(campanha.preLeoPresentes),
    'NUM_PRE_LEOS': contarParticipantes(campanha.preLeoPresentes),
    'AMIGOS_CONSELHEIROS': campanha.amigosConselheiros || '',
    'QTD_AMIGOS': contarParticipantes(campanha.amigosConselheiros),
    'NUM_AMIGOS': contarParticipantes(campanha.amigosConselheiros),
    'QTD_LEOES': (campanha.qtdLeoesParticipantes || 0).toString(),
    'NUM_LEOES': (campanha.qtdLeoesParticipantes || 0).toString(),
    'PESSOAS_IMPACTADAS': (campanha.pessoasImpactadas || 0).toString(),
    'CUSTO_CAMPANHA': formatarMoeda(campanha.custoCampanha),
    'CUSTO': formatarMoeda(campanha.custoCampanha),
    'HORAS_POR_PESSOA': (campanha.horasPorPessoa || 0).toString(),
    'HORAS_TOTAIS': (campanha.horasTotais || 0).toString(),
    'OBJETIVO': campanha.objetivo || '',
    'DESCRICAO': campanha.descricaoTexto || '',
    'DESCRICAO_CAMPANHA': campanha.descricaoTexto || '',
    'SINTESE': campanha.descricaoTexto || '',
    'TEM_PARCERIA': campanha.temParceria ? 'Sim' : 'Não',
    'ENTIDADE_PARCEIRA': campanha.entidadeParceira || '',
    'TIPO_PARCERIA': campanha.tipoParceria || '',
    'DESCRICAO_PARCERIA': campanha.descricaoParceria || ''
  };
  
  // Adicionar variações em minúsculas e com underscores/hífens
  var variacoes = {};
  Object.keys(mapa).forEach(function(key) {
    variacoes[key.toLowerCase()] = mapa[key];
    variacoes[key.replace(/_/g, '-')] = mapa[key];
    variacoes[key.replace(/_/g, ' ')] = mapa[key];
  });
  
  return Object.assign({}, mapa, variacoes);
}

/**
 * Buscar todas as campanhas do distrito
 * @return {Array} Array de campanhas
 */
async function buscarTodasCampanhasDistrito() {
  try {
    var todasCampanhas = [];
    
    // Obter todos os clubes
    var clubes = [];
    if (typeof rtmaConfig.rtmaObterTodosClubes === 'function') {
      clubes = rtmaConfig.rtmaObterTodosClubes();
    } else if (typeof RTMA_REGIOES !== 'undefined') {
      Object.values(RTMA_REGIOES).forEach(clubesRegiao => {
        clubes.push(...clubesRegiao);
      });
    }
    
    console.log(`Buscando campanhas de ${clubes.length} clubes...`);
    
    // Buscar campanhas de cada clube
    for (var i = 0; i < clubes.length; i++) {
      try {
        var campanhasClube = await getCampanhasDoClube(clubes[i]);
        todasCampanhas = todasCampanhas.concat(campanhasClube);
      } catch (e) {
        console.warn(`Erro ao buscar campanhas do clube ${clubes[i]}:`, e);
      }
    }
    
    console.log(`Total de campanhas encontradas: ${todasCampanhas.length}`);
    return todasCampanhas;
    
  } catch (error) {
    console.error('Erro ao buscar campanhas do distrito:', error);
    return [];
  }
}

function transferirDados(tipoOperacao = 'novo', campanhasFornecidas = null) {
  var documentoId = "1vpEnLC2ne72VWMCIVEp3rsUFQbiqoxYins43bN8t_QY"; // ID do documento modelo de CAMPANHAS
  
  try {
    console.log('Iniciando geração do relatório DM de CAMPANHAS...');
    console.log('Tipo de operação:', tipoOperacao);
    console.log('Campanhas fornecidas:', campanhasFornecidas ? campanhasFornecidas.length : 'null');
    
    // VALIDAÇÃO: Deve ter campanhas fornecidas (selecionadas)
    if (!campanhasFornecidas || !Array.isArray(campanhasFornecidas) || campanhasFornecidas.length === 0) {
      throw new Error('Nenhuma campanha selecionada para processar. Selecione campanhas antes de gerar o relatório.');
    }
    
    console.log('✅ Processando APENAS as campanhas selecionadas:', campanhasFornecidas.length);
    
    // Filtrar campanhas válidas
    var campanhasValidas = campanhasFornecidas.filter(function(campanha) {
      return campanha && campanha.titulo && campanha.titulo.trim() !== '';
    });
    
    if (campanhasValidas.length === 0) {
      throw new Error('Nenhuma campanha válida encontrada para processar');
    }
    
    console.log('Campanhas válidas:', campanhasValidas.length);
    
    // AGRUPAR POR EIXO DM
    var campanhasPorEixo = {};
    campanhasValidas.forEach(function(campanha) {
      var eixoDM = campanha.eixoDM || 'Sem Eixo';
      if (!campanhasPorEixo[eixoDM]) {
        campanhasPorEixo[eixoDM] = [];
      }
      campanhasPorEixo[eixoDM].push(campanha);
    });
    
    console.log('Campanhas agrupadas por eixo DM:', Object.keys(campanhasPorEixo).length, 'eixos');
    Object.keys(campanhasPorEixo).forEach(function(eixo) {
      console.log('  -', eixo + ':', campanhasPorEixo[eixo].length, 'campanhas');
    });
    
    // Processar cada eixo DM separadamente (um arquivo por eixo)
    var arquivosGerados = [];
    var totalCampanhasProcessadas = 0;
    
    for (var eixoDM in campanhasPorEixo) {
      var campanhasDoEixo = campanhasPorEixo[eixoDM];
      console.log('\n📋 Processando eixo DM:', eixoDM, '-', campanhasDoEixo.length, 'campanhas');
      
      // Criar cópia do template para este eixo
      var templateFile = DriveApp.getFileById(documentoId);
      var nomeArquivo = "Relatório Trimestral de Campanhas - " + eixoDM + " - " + 
                       Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm");
      var novoDoc = templateFile.makeCopy(nomeArquivo);
      
      console.log('Template copiado:', nomeArquivo);
      
      // Abrir o novo documento
      var doc = DocumentApp.openById(novoDoc.getId());
      var body = doc.getBody();
      
      // ENCONTRAR SEÇÃO DE TEMPLATE: "LEO Clube: <Clube>" até "Descrição da campanha: <Descrição>"
      var elementos = body.getNumChildren();
      var indiceInicioTemplate = -1;
      var indiceFimTemplate = -1;
      
      console.log('Procurando seção de template no documento...');
      
      // Procurar início: "LEO Clube: <Clube>" ou "LEO Clube:" ou similar
      for (var i = 0; i < elementos; i++) {
        try {
        var elemento = body.getChild(i);
        if (elemento.getType() === DocumentApp.ElementType.PARAGRAPH) {
          var texto = elemento.asText().getText();
            // Procurar por início da seção de campanha
            if (texto.includes("LEO Clube:") || texto.includes("LEO Clube") || 
                texto.includes("<Clube>") || texto.includes("Clube:")) {
              if (indiceInicioTemplate === -1) {
                indiceInicioTemplate = i;
                console.log('Início do template encontrado no índice:', i, '- Texto:', texto.substring(0, 50));
              }
            }
            // Procurar fim: "Descrição da campanha:" ou "Descrição:" ou próximo marcador
            if (indiceInicioTemplate !== -1 && indiceFimTemplate === -1) {
              if (texto.includes("Descrição da campanha:") || 
                  texto.includes("Descrição:") && texto.includes("<Descrição>") ||
                  (i > indiceInicioTemplate + 10 && texto.trim() === "")) {
                indiceFimTemplate = i + 1; // Incluir o parágrafo da descrição
                console.log('Fim do template encontrado no índice:', i, '- Texto:', texto.substring(0, 50));
            break;
          }
        }
          }
        } catch (e) {
          // Continuar procurando
        }
      }
      
      if (indiceInicioTemplate === -1 || indiceFimTemplate === -1) {
        console.warn('⚠️ Seção de template não encontrada claramente. Usando fallback...');
        // Fallback: procurar por qualquer placeholder
        for (var i = 0; i < elementos; i++) {
          try {
        var elemento = body.getChild(i);
        if (elemento.getType() === DocumentApp.ElementType.PARAGRAPH) {
          var texto = elemento.asText().getText();
              if (texto.includes("<") && indiceInicioTemplate === -1) {
                indiceInicioTemplate = i;
              }
              if (indiceInicioTemplate !== -1 && texto.includes(">") && indiceFimTemplate === -1 && i > indiceInicioTemplate + 5) {
                indiceFimTemplate = i + 1;
            break;
          }
        }
          } catch (e) {
            // Continuar
          }
        }
      }
      
      if (indiceInicioTemplate === -1) {
        throw new Error('Não foi possível encontrar a seção de template no documento modelo');
      }
      
      if (indiceFimTemplate === -1) {
        indiceFimTemplate = elementos; // Usar até o final se não encontrar
      }
      
      console.log('✅ Seção de template identificada: índices', indiceInicioTemplate, 'a', indiceFimTemplate);
      
      // Processar campanhas deste eixo
      var campanhasProcessadasEixo = 0;
      
      for (var c = 0; c < campanhasDoEixo.length; c++) {
        var campanha = campanhasDoEixo[c];
        
        if (!campanha.titulo || campanha.titulo.trim() === "") {
          console.log("Campanha ignorada por falta de título.");
        continue;
      }
      
        console.log('  Processando campanha', (c + 1), 'de', campanhasDoEixo.length + ':', campanha.titulo);
        
        // Se não for a primeira campanha, duplicar a seção de template
        if (campanhasProcessadasEixo > 0) {
          // Calcular índice de inserção (após última campanha)
          var indiceInsercao = indiceFimTemplate;
          
          // Inserir quebra de página antes da nova seção
          body.insertPageBreak(indiceInsercao);
        indiceInsercao++;
          
          // Duplicar elementos do template mantendo estrutura completa
          for (var k = indiceInicioTemplate; k < indiceFimTemplate; k++) {
            try {
              var elementoOriginal = body.getChild(k);
              
              if (elementoOriginal.getType() === DocumentApp.ElementType.PARAGRAPH) {
                var paragrafoOriginal = elementoOriginal.asParagraph();
                var textoOriginal = paragrafoOriginal.copy();
                var novoParagrafo = body.insertParagraph(indiceInsercao, textoOriginal);
                
                // Copiar formatação completa do parágrafo
                novoParagrafo.setAlignment(paragrafoOriginal.getAlignment());
                novoParagrafo.setIndentStart(paragrafoOriginal.getIndentStart());
                novoParagrafo.setIndentEnd(paragrafoOriginal.getIndentEnd());
                novoParagrafo.setSpacingBefore(paragrafoOriginal.getSpacingBefore());
                novoParagrafo.setSpacingAfter(paragrafoOriginal.getSpacingAfter());
                novoParagrafo.setLineSpacing(paragrafoOriginal.getLineSpacing());
                
                indiceInsercao++;
              } else if (elementoOriginal.getType() === DocumentApp.ElementType.TABLE) {
                var tabelaOriginal = elementoOriginal.asTable();
                var novaTabela = body.insertTable(indiceInsercao, tabelaOriginal.copy());
                indiceInsercao++;
              } else if (elementoOriginal.getType() === DocumentApp.ElementType.PAGE_BREAK) {
                body.insertPageBreak(indiceInsercao);
                indiceInsercao++;
              } else if (elementoOriginal.getType() === DocumentApp.ElementType.HORIZONTAL_RULE) {
                body.insertHorizontalRule(indiceInsercao);
        indiceInsercao++;
              }
            } catch (e) {
              console.log('Erro ao duplicar elemento:', e);
            }
          }
          
          // Atualizar índice de fim do template para próxima duplicação
          indiceFimTemplate = indiceInsercao;
        }
        
        // Mapear dados da campanha
        var mapaDados = mapearDadosCampanha(campanha);
        
        // Determinar range da seção atual para substituir placeholders
        var indiceInicioSecao = campanhasProcessadasEixo === 0 ? indiceInicioTemplate : 
                                indiceFimTemplate - (indiceFimTemplate - indiceInicioTemplate);
        var indiceFimSecao = indiceFimTemplate;
        
        // Substituir placeholders usando replaceText (mantém formatação)
        Object.keys(mapaDados).forEach(function(placeholder) {
          var valor = String(mapaDados[placeholder] || '');
          
          // Tentar diferentes formatos de placeholder
          var formatos = [
            '<' + placeholder + '>',
            '<' + placeholder.toLowerCase() + '>',
            '<' + placeholder.replace(/_/g, ' ') + '>',
            '{{' + placeholder + '}}',
            '[' + placeholder + ']'
          ];
          
          formatos.forEach(function(formato) {
            try {
              // Escapar caracteres especiais para replaceText
              var formatoEscapado = formato.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              body.replaceText(formatoEscapado, valor);
            } catch (e) {
              // Ignorar erros
            }
          });
        });
        
        // Processar foto oficial se houver
        if (campanha.linkFotoOficial && typeof campanha.linkFotoOficial === "string" && campanha.linkFotoOficial.trim() !== "") {
          try {
            console.log('📷 Processando foto oficial da campanha:', campanha.titulo);
            
            // Extrair ID do arquivo do Google Drive
            var fileIdMatch = campanha.linkFotoOficial.match(/[-\w]{25,}/);
          
          if (fileIdMatch) {
            var fileId = fileIdMatch[0];
            var file = DriveApp.getFileById(fileId);
            var imageBlob = file.getBlob();
            
              // Procurar placeholder de foto oficial na seção atual
              var rangeFoto = null;
              var formatosFoto = ['<Foto Oficial>', '<FotoOficial>', '{{Foto Oficial}}', '[Foto Oficial]', 'Foto Oficial'];
              
              for (var f = 0; f < formatosFoto.length; f++) {
                try {
                  rangeFoto = body.findText(formatosFoto[f]);
                  if (rangeFoto) {
                    console.log('✅ Placeholder de foto encontrado:', formatosFoto[f]);
                    break;
                  }
                } catch (e) {
                  // Continuar procurando
                }
              }
              
              if (rangeFoto) {
                // Encontrar o parágrafo que contém o placeholder
                var elementoFoto = rangeFoto.getElement();
                var paragrafoFoto = elementoFoto.getParent();
                
                if (paragrafoFoto.getType() === DocumentApp.ElementType.PARAGRAPH) {
                  var paragrafo = paragrafoFoto.asParagraph();
                  
                  // Remover o texto placeholder
                  var textoCompleto = paragrafo.getText();
                  var textoLimpo = textoCompleto.replace(/<Foto Oficial>|<FotoOficial>|{{Foto Oficial}}|\[Foto Oficial\]/g, '').trim();
                  
                  if (textoLimpo === '') {
                    // Se o parágrafo ficou vazio, substituir pelo placeholder e inserir imagem
                    paragrafo.clear();
                    var image = paragrafo.appendInlineImage(imageBlob);
                    
                    // Redimensionar imagem (largura máxima 500px, altura proporcional)
            var originalWidth = image.getWidth();
            var originalHeight = image.getHeight();
                    var maxWidth = 500;
                    var maxHeight = 600;
            
            var ratio = Math.min(maxWidth / originalWidth, maxHeight / originalHeight);
            
            if (ratio < 1) {
              image.setWidth(Math.round(originalWidth * ratio));
              image.setHeight(Math.round(originalHeight * ratio));
            }
            
                    // Centralizar parágrafo
                    paragrafo.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
                    paragrafo.setSpacingAfter(12);
                    
                    console.log('✅ Foto oficial inserida com sucesso');
                  } else {
                    // Se há texto no parágrafo, inserir imagem após o texto
                    paragrafo.appendInlineImage(imageBlob);
                    console.log('✅ Foto oficial inserida no parágrafo existente');
                  }
                }
              } else {
                console.warn('⚠️ Placeholder de foto oficial não encontrado no documento');
              }
            } else {
              console.warn('⚠️ Não foi possível extrair ID do arquivo da URL:', campanha.linkFotoOficial);
            }
          } catch (e) {
            console.error('❌ Erro ao processar foto oficial:', e);
            console.error('Stack:', e.stack);
          }
        }
        
        campanhasProcessadasEixo++;
      }
      
      // Substituir placeholders globais (EixoDM, Trimestre, etc.)
      var primeiraCampanha = campanhasDoEixo[0];
      if (primeiraCampanha) {
        body.replaceText('<EixoDM>', primeiraCampanha.eixoDM || eixoDM);
        body.replaceText('<Trimestre>', primeiraCampanha.trimestre || '');
      }
      
      // Salvar documento
    doc.saveAndClose();
    
      // Mover para pasta destino
      var pastaDestinoId = "1BD0_gpJX-9z8bCcHfACEb9Cl2ls79olM";
      try {
        var arquivo = DriveApp.getFileById(novoDoc.getId());
        var pastaDestino = DriveApp.getFolderById(pastaDestinoId);
        pastaDestino.addFile(arquivo);
        DriveApp.getRootFolder().removeFile(arquivo);
      } catch (e) {
        console.log("Erro ao mover arquivo:", e);
      }
      
      arquivosGerados.push({
        id: novoDoc.getId(),
        nome: nomeArquivo,
        url: novoDoc.getUrl(),
        eixoDM: eixoDM,
        campanhas: campanhasProcessadasEixo
      });
      
      totalCampanhasProcessadas += campanhasProcessadasEixo;
      console.log('✅ Eixo', eixoDM, 'processado:', campanhasProcessadasEixo, 'campanhas');
    }
    
    console.log('\n✅ Processamento concluído!');
    console.log('Total de arquivos gerados:', arquivosGerados.length);
    console.log('Total de campanhas processadas:', totalCampanhasProcessadas);
    
    // Retornar resultado
    return {
      sucesso: true,
      campanhasProcessadas: totalCampanhasProcessadas,
      arquivosGerados: arquivosGerados,
      url: arquivosGerados.length > 0 ? arquivosGerados[0].url : null
    };
    
  } catch (error) {
    console.error("Erro ao transferir dados:", error);
    return {
      sucesso: false,
      erro: error.toString()
    };
  }
}

// === FUNÇÕES PARA INTERFACE DE RELATÓRIO ===

/**
 * Função chamada pelo frontend para gerar relatório com opção de escolha
 */
function gerarRelatorioDMComOpcao() {
  try {
    var config = obterConfiguracaoRelatorio();
    
    return {
      sucesso: true,
      temArquivoConfigurado: config.temArquivo,
      arquivoConfigurado: config.arquivoRelatorio,
      opcoes: {
        novoDocumento: true,
        atualizarExistente: config.temArquivo
      }
    };
    
  } catch (error) {
    console.error('Erro ao obter opções de relatório:', error);
    return {
      sucesso: false,
      erro: error.toString()
    };
  }
}

/**
 * Função chamada pelo frontend para executar a geração do relatório
 */
function executarGeracaoRelatorio(tipoOperacao) {
  try {
    console.log(`Executando geração de relatório: ${tipoOperacao}`);
    
    // Buscar campanhas selecionadas do usuário logado
    var campanhasSelecionadas = [];
    try {
      var usuarioEmail = Session.getActiveUser().getEmail();
      console.log('📧 Email do usuário obtido:', usuarioEmail);
      
      // Buscar TODAS as campanhas selecionadas da tabela (sem filtro de usuário)
      console.log('🔍 Buscando TODAS as campanhas selecionadas da tabela campanhas_selecionadas...');
      campanhasSelecionadas = buscarCampanhasSelecionadas(null, null); // null = busca todas
      
      console.log('📊 Resultado da busca:');
      console.log('  - Tipo:', typeof campanhasSelecionadas);
      console.log('  - É array?', Array.isArray(campanhasSelecionadas));
      console.log('  - Quantidade encontrada:', campanhasSelecionadas ? campanhasSelecionadas.length : 'null/undefined');
      
      if (campanhasSelecionadas && campanhasSelecionadas.length > 0) {
        console.log('✅ Campanhas encontradas:');
        campanhasSelecionadas.forEach(function(c, i) {
          console.log(`  ${i + 1}. ${c.titulo || 'Sem título'} - Clube: ${c.clube || 'N/A'}`);
        });
      } else {
        console.warn('⚠️ Nenhuma campanha selecionada encontrada!');
        throw new Error('Nenhuma campanha selecionada encontrada. Selecione campanhas antes de gerar o relatório.');
      }
    } catch (e) {
      console.error('❌ Erro ao buscar campanhas selecionadas:', e);
      console.error('Stack:', e.stack);
      return {
        sucesso: false,
        erro: 'Erro ao buscar campanhas selecionadas: ' + e.toString()
      };
    }
    
    // Executar transferência de dados com campanhas selecionadas
    console.log('🚀 Iniciando transferência de dados com', campanhasSelecionadas.length, 'campanhas...');
    var resultado = transferirDados(tipoOperacao, campanhasSelecionadas);
    
    if (resultado.sucesso) {
      console.log(`✅ Relatório ${tipoOperacao} gerado com sucesso`);
      console.log(`📊 ${resultado.campanhasProcessadas || resultado.atividadesProcessadas} campanha(s) processada(s)`);
    }
    
    return resultado;
    
  } catch (error) {
    console.error('Erro ao executar geração de relatório:', error);
    return {
      sucesso: false,
      erro: error.toString()
    };
  }
}

/**
 * Função para configurar arquivo de destino do relatório
 */
function configurarArquivoRelatorio(arquivoId) {
  try {
    var resultado = definirArquivoRelatorio(arquivoId);
    
    if (resultado.sucesso) {
      console.log(`✅ Arquivo de relatório configurado: ${arquivoId}`);
    }
    
    return resultado;
    
  } catch (error) {
    console.error('Erro ao configurar arquivo de relatório:', error);
    return {
      sucesso: false,
      erro: error.toString()
    };
  }
}

function gerarRankingGabinete() {
  try {
    console.log('Gerando ranking do Gabinete...');
    
    const planilhaId = '1szBXxc9ujpGNwxN1Ffn_AHSO-LfEl7Y7K6lLYD45aQg';
    const ss = SpreadsheetApp.openById(planilhaId);
    const sheet = ss.getSheetByName('Atividades D8');
    
    if (!sheet) {
      throw new Error('Aba "Atividades D8" não encontrada');
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return [];
    }
    
    const dados = sheet.getRange(2, 1, lastRow - 1, 23).getValues(); // A até W
    
    // Mapear responsáveis e calcular pontuações
    const responsaveis = {};
    
    dados.forEach((linha, index) => {
      const responsavel = (linha[1] || "").toString().trim(); // Coluna B - Responsável
      const dataRegistro = linha[0]; // Coluna A - Data e Hora que foi enviada
      const dataInicio = linha[6]; // Coluna G - Data de Início da Atividade
      
      if (!responsavel || responsavel === '') return;
      
      // Inicializar responsável se não existir
      if (!responsaveis[responsavel]) {
        responsaveis[responsavel] = {
          nome: responsavel,
          atividades: 0,
          pontos: 0,
          atividadesMesmoDia: 0,
          atividadesDiaSeguinte: 0,
          atividadesSemBonus: 0
        };
      }
      
      // Contar atividade
      responsaveis[responsavel].atividades++;
      
      // Calcular bônus por tempo de reporte
      let bonus = 0;
      if (dataRegistro && dataInicio) {
        try {
          const dataRegistroObj = new Date(dataRegistro);
          const dataInicioObj = new Date(dataInicio);
          
          // Validar se a data de registro é posterior ou igual à data de início
          if (dataRegistroObj >= dataInicioObj) {
            // Calcular diferença em dias (sem Math.abs para manter direção correta)
            const diffTime = dataRegistroObj - dataInicioObj;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) {
              bonus = 1; // Mesmo dia
              responsaveis[responsavel].atividadesMesmoDia++;
            } else if (diffDays === 1) {
              bonus = 0.5; // Dia seguinte
              responsaveis[responsavel].atividadesDiaSeguinte++;
            } else {
              responsaveis[responsavel].atividadesSemBonus++;
            }
            // Sem bônus para depois do 2º dia
          } else {
            // Se reportado antes da atividade, não recebe bônus
            console.warn(`Atividade reportada antes da data de início: ${responsavel}`);
            responsaveis[responsavel].atividadesSemBonus++;
          }
        } catch (error) {
          console.warn('Erro ao calcular diferença de datas:', error);
          responsaveis[responsavel].atividadesSemBonus++;
        }
      } else {
        responsaveis[responsavel].atividadesSemBonus++;
      }
      
      // Pontuação: 1 ponto base + bônus
      responsaveis[responsavel].pontos += 1 + bonus;
    });
    
    // Converter para array e ordenar por pontos
    const ranking = Object.values(responsaveis)
      .sort((a, b) => b.pontos - a.pontos)
      .map(item => {
        // Determinar nível baseado na pontuação
        let nivel = '⚠️ Quase Amigo';
        if (item.pontos >= 10.5) {
          nivel = '💎 Diamante';
        } else if (item.pontos >= 6.5) {
          nivel = '🥇 Ouro';
        } else if (item.pontos >= 3.5) {
          nivel = '🥈 Prata';
        } else if (item.pontos >= 1) {
          nivel = '🥉 Bronze';
        }
        
        return {
          ...item,
          nivel,
          pontos: Math.round(item.pontos * 10) / 10 // Arredondar para 1 casa decimal
        };
      });
    
    console.log(`Ranking gerado com ${ranking.length} responsáveis`);
    return ranking;
    
  } catch (error) {
    console.error("Erro ao gerar ranking do Gabinete:", error);
    throw error;
  }
}

// === FUNÇÕES DO DRIVE COMPARTILHADO ===

/**
 * URL pública desta web app (…/exec), para o parâmetro redirect do Supabase na recuperação de senha.
 * O valor deve existir em Supabase → Authentication → URL Configuration → Redirect URLs
 * (a URL exata, ou p.ex. o padrão https://script.google.com/**)
 */
function leoObterUrlWebAppRecuperacaoSenha() {
  try {
    var s = ScriptApp.getService();
    if (!s) {
      return '';
    }
    var u = s.getUrl();
    if (u) {
      return String(u).replace(/\/$/, '');
    }
  } catch (err) {
    console.error('leoObterUrlWebAppRecuperacaoSenha', err);
  }
  return '';
}

// Função principal para servir páginas baseada em parâmetros
// doGet removed (GAS web app handler)


/**
 * Obter URL base do script para uso no frontend
 * @return {string} URL base do script
 */
function obterUrlBaseScript() {
  try {
    if (typeof ScriptApp !== 'undefined' && ScriptApp.getService) {
      const service = ScriptApp.getService();
      if (service) {
        return service.getUrl();
      }
    }
  } catch (error) {
    console.error('Erro ao obter URL do script:', error);
  }
  
  // Fallback
  return 'https://script.google.com/a/macros/leold8.org.br/s/AKfycbyxhzZE30640fN97YFvn3Oi-EFdpuK6N4xju8yyP0etbWQhuhoB_3RCec7yvQ1JAu2MTA/exec';
}

/**
 * Helper: adiciona headers CORS à resposta (para scanner hospedado em Vercel).
 */
function _cors(output) {
  try {
    if (output && typeof output.setHeader === 'function') {
      output.setHeader('Access-Control-Allow-Origin', '*');
      output.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      output.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
  } catch (e) {}
  return output;
}

/**
 * API do scanner (para página servida via ContentService).
 * Permite que o scanner use fetch no lugar de google.script.run (que só existe em HtmlService).
 */
// doPost removed (GAS web app handler)


// === RTMA (módulo integrado) ===
// Retorna o HTML do RTMA (arquivo `rtma.html`) para ser carregado via iframe (srcdoc) no Portal.
function getRtmaHtml() {
  try {
    const fs = require('fs');
    const path = require('path');
    const htmlPath = path.join(__dirname, '../public/rtma.html');
    var html = fs.readFileSync(htmlPath, 'utf8');
    
    // Verificar se o HTML foi carregado corretamente
    if (!html || html.trim() === '') {
      console.error('❌ HTML do RTMA está vazio');
      return '<html><body><h1>Erro: HTML do RTMA está vazio</h1></body></html>';
    }
    
    // Verificar se há problemas de sintaxe básicos (chaves desbalanceadas)
    var openBraces = (html.match(/\{/g) || []).length;
    var closeBraces = (html.match(/\}/g) || []).length;
    
    if (openBraces !== closeBraces) {
      console.warn('⚠️ Possível problema de sintaxe: chaves desbalanceadas no HTML do RTMA');
      console.warn('Chaves abertas: ' + openBraces + ', Chaves fechadas: ' + closeBraces);
    }
    
    return html;
  } catch (e) {
    console.error('❌ Erro em getRtmaHtml:', e);
    return '<html><body><h1>Erro ao carregar RTMA</h1><p>' + String(e.message || e) + '</p></body></html>';
  }
}

// Funções wrapper para buscarOpcoesFiltros e buscarOpcoesFiltrosDistritoPessoas
// As funções originais estão em rtma_pessoas.js, mas podem não estar disponíveis via google.script.run
// Estas funções garantem que as chamadas funcionem, delegando para as originais se existirem

/**
 * Buscar opções de filtros para um clube
 * Esta função está definida no code.js para garantir que esteja disponível via google.script.run
 * @param {string} clube - Nome do clube
 * @return {Object} Opções de filtros com formacoes e profissoes
 */
async function buscarOpcoesFiltros(clube) {
  console.log('🔍 buscarOpcoesFiltros chamada com clube:', clube);
  try {
    // Validar parâmetro
    if (!clube || typeof clube !== 'string') {
      return { formacoes: [], profissoes: [] };
    }

    // Tentar chamar buscarPessoasRTMA se existir
    // No Google Apps Script, todas as funções compartilham o mesmo escopo global
    var pessoas = [];
    if (typeof buscarPessoasRTMA === 'function') {
      try {
        pessoas = await buscarPessoasRTMA(clube, null, null, null);
      } catch (e) {
        console.warn('Erro ao chamar buscarPessoasRTMA:', e);
      }
    }
    
    // Se não conseguiu buscar pessoas, retornar valores padrão
    if (!Array.isArray(pessoas) || pessoas.length === 0) {
      return { formacoes: [], profissoes: [] };
    }
    
    // Extrair formacoes e profissoes únicas
    var formacoesSet = {};
    var profissoesSet = {};
    
    for (var i = 0; i < pessoas.length; i++) {
      var pessoa = pessoas[i];
      if (pessoa && pessoa.nome) {
        if (pessoa.formacao && typeof pessoa.formacao === 'string') {
          var formacao = pessoa.formacao.trim();
          if (formacao) {
            formacoesSet[formacao] = true;
          }
        }
        if (pessoa.profissao && typeof pessoa.profissao === 'string') {
          var profissao = pessoa.profissao.trim();
          if (profissao) {
            profissoesSet[profissao] = true;
          }
        }
      }
    }
    
    // Converter objetos em arrays ordenados
    var formacoes = Object.keys(formacoesSet).sort();
    var profissoes = Object.keys(profissoesSet).sort();
    
    return {
      formacoes: formacoes,
      profissoes: profissoes
    };
  } catch (e) {
    console.error('Erro em buscarOpcoesFiltros:', e);
    return { formacoes: [], profissoes: [] };
  }
}

async function buscarOpcoesFiltrosDistritoPessoas(usuario) {
  try {
    // Tentar usar a função coletarOpcoesFiltrosMultiplosClubes se existir
    if (typeof coletarOpcoesFiltrosMultiplosClubes === 'function' && usuario) {
      let clubesPermitidos = [];
      
      if (usuario.isRegiao && usuario.clubesPermitidos) {
        clubesPermitidos = usuario.clubesPermitidos;
      } else if (usuario.isDistrito) {
        // Obter todos os clubes das regiões
        if (typeof rtmaConfig.rtmaObterTodosClubes === 'function') {
          clubesPermitidos = rtmaConfig.rtmaObterTodosClubes();
        } else if (typeof RTMA_REGIOES !== 'undefined') {
          const todosClubes = [];
          Object.values(RTMA_REGIOES).forEach(function(clubes) {
            todosClubes.push.apply(todosClubes, clubes);
          });
          clubesPermitidos = todosClubes;
        }
      }
      
      if (clubesPermitidos.length > 0) {
        const opcoes = await coletarOpcoesFiltrosMultiplosClubes(clubesPermitidos);
        if (usuario.isDistrito) {
          opcoes.regioes = ['A', 'B', 'D'];
        }
        return opcoes;
      }
    }
    
    // Fallback: retornar valores padrão
    console.warn('buscarOpcoesFiltrosDistritoPessoas: usando fallback');
    return { clubes: [], formacoes: [], profissoes: [], regioes: [] };
  } catch (e) {
    console.error('Erro em buscarOpcoesFiltrosDistritoPessoas:', e);
    return { clubes: [], formacoes: [], profissoes: [], regioes: [] };
  }
}

// Função principal para listar conteúdo da pasta
function listarConteudoPasta(pastaId, ordenacao = 'nome', tipoVisualizacao = 'lista', driveRaizId) {
  try {
    if (!driveRaizId) {
      throw new Error('Drive ID é obrigatório');
    }
    
    const id = pastaId || driveRaizId;
    const pasta = DriveApp.getFolderById(id);
    
    const itens = [];
    
    // Listar subpastas
    const pastas = pasta.getFolders();
    while (pastas.hasNext()) {
      const subpasta = pastas.next();
      itens.push({
        id: subpasta.getId(),
        nome: subpasta.getName(),
        tipo: 'pasta',
        mimeType: 'application/vnd.google-apps.folder',
        tamanho: null,
        dataModificacao: subpasta.getLastUpdated().getTime(),
        dataModificacaoFormatada: Utilities.formatDate(subpasta.getLastUpdated(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
        url: subpasta.getUrl(),
        compartilhado: false,
        proprietario: obterProprietarioDrive(subpasta),
        descricao: subpasta.getDescription() || '',
        podeEditar: true,
        podeBaixar: false,
        podeExcluir: true
      });
    }
    
    // Listar arquivos
    const arquivos = pasta.getFiles();
    while (arquivos.hasNext()) {
      const arquivo = arquivos.next();
      itens.push({
        id: arquivo.getId(),
        nome: arquivo.getName(),
        tipo: 'arquivo',
        mimeType: arquivo.getMimeType(),
        tamanho: arquivo.getSize(),
        tamanhoFormatado: formatarTamanhoDrive(arquivo.getSize()),
        dataModificacao: arquivo.getLastUpdated().getTime(),
        dataModificacaoFormatada: Utilities.formatDate(arquivo.getLastUpdated(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
        url: arquivo.getUrl(),
        compartilhado: false,
        proprietario: obterProprietarioDrive(arquivo),
        descricao: arquivo.getDescription() || '',
        thumbnail: obterThumbnailDrive(arquivo),
        podeEditar: true,
        podeBaixar: true,
        podeExcluir: true
      });
    }
    
    // Ordenar itens
    itens.sort((a, b) => {
      // Pastas sempre primeiro
      if (a.tipo === 'pasta' && b.tipo !== 'pasta') return -1;
      if (a.tipo !== 'pasta' && b.tipo === 'pasta') return 1;
      
      // Depois ordenar pelo critério escolhido
      switch(ordenacao) {
        case 'nome':
          return a.nome.localeCompare(b.nome);
        case 'dataModificacao':
          return b.dataModificacao - a.dataModificacao;
        case 'tamanho':
          return (b.tamanho || 0) - (a.tamanho || 0);
        default:
          return a.nome.localeCompare(b.nome);
      }
    });
    
    const caminho = obterCaminhoPasta(pasta, driveRaizId);
    
    return {
      sucesso: true,
      pasta: {
        id: pasta.getId(),
        nome: pasta.getName(),
        caminho: caminho
      },
      itens: itens,
      totalItens: itens.length,
      totalPastas: itens.filter(i => i.tipo === 'pasta').length,
      totalArquivos: itens.filter(i => i.tipo === 'arquivo').length
    };
    
  } catch (erro) {
    console.error('Erro ao listar conteúdo:', erro);
    return {
      sucesso: false,
      erro: erro.toString()
    };
  }
}

// Função para obter o caminho completo da pasta (breadcrumb)
function obterCaminhoPasta(pasta, driveRaizId) {
  const caminho = [];
  let pastaAtual = pasta;
  
  // Adicionar a pasta atual
  caminho.unshift({
    id: pastaAtual.getId(),
    nome: pastaAtual.getName()
  });
  
  // Subir na hierarquia até a pasta raiz
  try {
    while (pastaAtual.getId() !== driveRaizId) {
      const pais = pastaAtual.getParents();
      if (pais.hasNext()) {
        pastaAtual = pais.next();
        caminho.unshift({
          id: pastaAtual.getId(),
          nome: pastaAtual.getName()
        });
        
        // Se chegou na pasta raiz configurada, parar
        if (pastaAtual.getId() === driveRaizId) {
          break;
        }
      } else {
        break;
      }
    }
  } catch (e) {
    // Se não conseguir subir mais, está ok
  }
  
  return caminho;
}

// Função para obter o proprietário
function obterProprietarioDrive(item) {
  try {
    return {
      nome: 'Eu',
      email: Session.getActiveUser().getEmail() || '',
      foto: null
    };
  } catch (e) {
    return {
      nome: 'Eu',
      email: '',
      foto: null
    };
  }
}

// Função para obter thumbnail
function obterThumbnailDrive(arquivo) {
  const mimeType = arquivo.getMimeType();
  
  // Para imagens, retornar o thumbnail do Google Drive
  if (mimeType.startsWith('image/')) {
    try {
      return 'https://drive.google.com/thumbnail?id=' + arquivo.getId();
    } catch (e) {
      return null;
    }
  }
  
  return null;
}

// Função para criar nova pasta
function criarPasta(nome, pastaId, driveRaizId) {
  try {
    if (!driveRaizId) {
      throw new Error('Drive ID é obrigatório');
    }
    
    const id = pastaId || driveRaizId;
    const pastaPai = DriveApp.getFolderById(id);
    
    const novaPasta = pastaPai.createFolder(nome);
    
    return {
      sucesso: true,
      pasta: {
        id: novaPasta.getId(),
        nome: novaPasta.getName(),
        url: novaPasta.getUrl()
      }
    };
  } catch (erro) {
    console.error('Erro ao criar pasta:', erro);
    return {
      sucesso: false,
      erro: erro.toString()
    };
  }
}

// Função para excluir item (mover para lixeira)
function excluirItem(itemId, tipo) {
  try {
    if (tipo === 'pasta') {
      const pasta = DriveApp.getFolderById(itemId);
      pasta.setTrashed(true);
    } else {
      const arquivo = DriveApp.getFileById(itemId);
      arquivo.setTrashed(true);
    }
    
    return {
      sucesso: true,
      mensagem: 'Item movido para a lixeira'
    };
  } catch (erro) {
    console.error('Erro ao excluir item:', erro);
    return {
      sucesso: false,
      erro: erro.toString()
    };
  }
}

// Função para renomear item
function renomearItem(itemId, novoNome, tipo) {
  try {
    if (tipo === 'pasta') {
      const pasta = DriveApp.getFolderById(itemId);
      pasta.setName(novoNome);
    } else {
      const arquivo = DriveApp.getFileById(itemId);
      arquivo.setName(novoNome);
    }
    
    return {
      sucesso: true,
      mensagem: 'Item renomeado com sucesso'
    };
  } catch (erro) {
    console.error('Erro ao renomear item:', erro);
    return {
      sucesso: false,
      erro: erro.toString()
    };
  }
}

// FUNÇÃO REMOVIDA - Função duplicada que causava conflito com a função uploadArquivo principal (linha 285)
// Esta função estava sobrescrevendo a função correta e causando o erro "Drive ID é obrigatório"

// Função para fazer download de arquivo
function obterLinkDownload(arquivoId) {
  try {
    const arquivo = DriveApp.getFileById(arquivoId);
    
    // Criar um link de download direto
    const url = 'https://drive.google.com/uc?export=download&id=' + arquivoId;
    
    return {
      sucesso: true,
      nome: arquivo.getName(),
      url: url,
      tamanho: formatarTamanhoDrive(arquivo.getSize()),
      mimeType: arquivo.getMimeType()
    };
  } catch (erro) {
    console.error('Erro ao obter link de download:', erro);
    return {
      sucesso: false,
      erro: erro.toString()
    };
  }
}

// Função para copiar arquivo
function copiarArquivo(arquivoId, pastaDestinoId, driveRaizId) {
  try {
    const arquivo = DriveApp.getFileById(arquivoId);
    const pastaDestino = DriveApp.getFolderById(pastaDestinoId || driveRaizId);
    
    const copia = arquivo.makeCopy(arquivo.getName() + ' (cópia)', pastaDestino);
    
    return {
      sucesso: true,
      arquivo: {
        id: copia.getId(),
        nome: copia.getName(),
        url: copia.getUrl()
      }
    };
  } catch (erro) {
    console.error('Erro ao copiar arquivo:', erro);
    return {
      sucesso: false,
      erro: erro.toString()
    };
  }
}

// Função para buscar arquivos
function buscarArquivos(termo, pastaId, driveRaizId) {
  try {
    if (!driveRaizId) {
      throw new Error('Drive ID é obrigatório');
    }
    
    const resultados = [];
    const pastaBase = pastaId ? DriveApp.getFolderById(pastaId) : DriveApp.getFolderById(driveRaizId);
    
    // Buscar recursivamente
    function buscarRecursivo(pasta, nivel = 0) {
      if (nivel > 3) return; // Limitar profundidade
      
      // Buscar arquivos
      const arquivos = pasta.searchFiles('title contains "' + termo + '"');
      while (arquivos.hasNext()) {
        const arquivo = arquivos.next();
        resultados.push({
          id: arquivo.getId(),
          nome: arquivo.getName(),
          tipo: 'arquivo',
          mimeType: arquivo.getMimeType(),
          tamanho: arquivo.getSize(),
          tamanhoFormatado: formatarTamanhoDrive(arquivo.getSize()),
          dataModificacao: arquivo.getLastUpdated().getTime(),
          dataModificacaoFormatada: Utilities.formatDate(arquivo.getLastUpdated(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
          url: arquivo.getUrl(),
          proprietario: obterProprietarioDrive(arquivo),
          caminho: obterCaminhoPasta(arquivo.getParents().next(), driveRaizId)
        });
      }
      
      // Buscar pastas
      const pastas = pasta.searchFolders('title contains "' + termo + '"');
      while (pastas.hasNext()) {
        const subpasta = pastas.next();
        resultados.push({
          id: subpasta.getId(),
          nome: subpasta.getName(),
          tipo: 'pasta',
          mimeType: 'application/vnd.google-apps.folder',
          dataModificacao: subpasta.getLastUpdated().getTime(),
          dataModificacaoFormatada: Utilities.formatDate(subpasta.getLastUpdated(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
          url: subpasta.getUrl(),
          proprietario: obterProprietarioDrive(subpasta),
          caminho: obterCaminhoPasta(subpasta, driveRaizId)
        });
        
        // Buscar dentro da subpasta
        buscarRecursivo(subpasta, nivel + 1);
      }
    }
    
    buscarRecursivo(pastaBase);
    
    return {
      sucesso: true,
      resultados: resultados.slice(0, 50) // Limitar a 50 resultados
    };
  } catch (erro) {
    console.error('Erro na busca:', erro);
    return {
      sucesso: false,
      erro: erro.toString()
    };
  }
}

// Função auxiliar para formatar tamanho
function formatarTamanhoDrive(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const tamanhos = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + tamanhos[i];
}

// === GERAÇÃO DE CERTIFICADOS ===
async function gerarCertificadosCampanhas(campanhasSelecionadas) {
  try {
    // Abrir template
    const template = SlidesApp.openById(TEMPLATE_CERTIFICADO_ID);
    
    // Criar nova apresentação
    const dataHora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy_HH-mm');
    const novaApresentacao = SlidesApp.create(`Certificados_Campanhas_${dataHora}`);
    const novaApresentacaoId = novaApresentacao.getId();
    
    // Obter slide modelo (primeiro slide do template)
    const slideModelo = template.getSlides()[0];
    
    // Para cada campanha selecionada
    let certificadosGerados = 0;
    
    for (let i = 0; i < campanhasSelecionadas.length; i++) {
      const campanhaInfo = campanhasSelecionadas[i];
      
      // Buscar dados da campanha (usar ordem correta: clube, id)
      const campanha = await getCampanhaPorId(campanhaInfo.clube, campanhaInfo.id);
      
      if (!campanha) {
        Logger.log(`Campanha ${campanhaInfo.id} não encontrada`);
        continue;
      }
      
      // Copiar slide modelo para a nova apresentação
      const novoSlide = copiarSlide(slideModelo, novaApresentacao);
      
      // Substituir placeholders
      substituirPlaceholders(novoSlide, campanha);
      
      certificadosGerados++;
    }
    
    // Remover o primeiro slide vazio (criado automaticamente)
    if (novaApresentacao.getSlides().length > campanhasSelecionadas.length) {
      novaApresentacao.getSlides()[0].remove();
    }
    
    // Mover para pasta de certificados
    const arquivo = DriveApp.getFileById(novaApresentacaoId);
    const pastaCertificados = DriveApp.getFolderById(PASTA_CERTIFICADOS_ID);
    
    // Adicionar à pasta e remover de "Meu Drive"
    pastaCertificados.addFile(arquivo);
    DriveApp.getRootFolder().removeFile(arquivo);
    
    return {
      sucesso: true,
      quantidade: certificadosGerados,
      urlDocumento: novaApresentacao.getUrl()
    };
    
  } catch (erro) {
    Logger.log('Erro ao gerar certificados: ' + erro);
    return {
      sucesso: false,
      erro: erro.toString()
    };
  }
}

// Função auxiliar para copiar um slide
function copiarSlide(slideOrigem, apresentacaoDestino) {
  // Obter elementos do slide original
  const elementos = slideOrigem.getPageElements();
  
  // Criar novo slide na apresentação destino
  const novoSlide = apresentacaoDestino.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  
  // Copiar background
  const background = slideOrigem.getBackground();
  novoSlide.getBackground().setSolidFill(background.getSolidFill().getColor());
  
  // Copiar cada elemento
  elementos.forEach(elemento => {
    try {
      if (elemento.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
        const shape = elemento.asShape();
        const novoShape = novoSlide.insertShape(
          shape.getShapeType(),
          shape.getLeft(),
          shape.getTop(),
          shape.getWidth(),
          shape.getHeight()
        );
        
        // Copiar texto
        if (shape.getText()) {
          novoShape.getText().setText(shape.getText().asString());
          
          // Copiar formatação de texto
          const textRange = shape.getText().getTextStyle();
          const novoTextRange = novoShape.getText().getTextStyle();
          
          if (textRange.getFontFamily()) {
            novoTextRange.setFontFamily(textRange.getFontFamily());
          }
          if (textRange.getFontSize()) {
            novoTextRange.setFontSize(textRange.getFontSize());
          }
          if (textRange.isBold()) {
            novoTextRange.setBold(true);
          }
          if (textRange.isItalic()) {
            novoTextRange.setItalic(true);
          }
          if (textRange.getForegroundColor()) {
            novoTextRange.setForegroundColor(textRange.getForegroundColor());
          }
        }
        
        // Copiar fill
        if (shape.getFill()) {
          const fill = shape.getFill();
          if (fill.getSolidFill()) {
            novoShape.getFill().setSolidFill(fill.getSolidFill().getColor());
          }
        }
        
        // Copiar borda
        if (shape.getBorder()) {
          const border = shape.getBorder();
          if (border.getLineFill()) {
            const lineFill = border.getLineFill();
            if (lineFill.getSolidFill()) {
              novoShape.getBorder().getLineFill().setSolidFill(lineFill.getSolidFill().getColor());
            }
          }
        }
      } else if (elemento.getPageElementType() === SlidesApp.PageElementType.IMAGE) {
        const image = elemento.asImage();
        novoSlide.insertImage(
          image.getBlob(),
          image.getLeft(),
          image.getTop(),
          image.getWidth(),
          image.getHeight()
        );
      }
    } catch (e) {
      Logger.log('Erro ao copiar elemento: ' + e);
    }
  });
  
  return novoSlide;
}

// Função para substituir placeholders
function substituirPlaceholders(slide, campanha) {
  const shapes = slide.getShapes();
  
  // Mapear placeholders
  const placeholders = {
    '<nome>': campanha.clube || '',
    '<clube>': campanha.clube || '',
    '<titulo>': campanha.titulo || '',
    '<eixo8>': formatarEixo(campanha.eixo) || '',
    '<trimestre>': campanha.trimestre || '',
    '<AL>': extrairAnoLeonistico(campanha.trimestre) || ''
  };
  
  // Substituir em cada shape
  shapes.forEach(shape => {
    try {
      const textRange = shape.getText();
      if (textRange) {
        let texto = textRange.asString();
        
        // Substituir cada placeholder
        Object.keys(placeholders).forEach(placeholder => {
          texto = texto.replace(new RegExp(placeholder, 'g'), placeholders[placeholder]);
        });
        
        textRange.setText(texto);
      }
    } catch (e) {
      Logger.log('Erro ao substituir placeholder: ' + e);
    }
  });
}

// Função auxiliar para formatar eixo
function formatarEixo(eixo) {
  if (!eixo) return '';
  
  // Remover "Eixo " se existir e pegar apenas o número
  const numeroEixo = eixo.toString().replace(/[^0-9]/g, '');
  
  if (numeroEixo) {
    return numeroEixo;
  }
  
  return eixo;
}

// Função auxiliar para extrair ano leonístico
function extrairAnoLeonistico(trimestre) {
  if (!trimestre) return '';
  
  // Formato esperado: "1º Trimestre 2025/2026" ou similar
  const match = trimestre.match(/(\d{4})\/(\d{4})/);
  
  if (match) {
    return `${match[1]}/${match[2]}`;
  }
  
  return '';
}

// Função auxiliar para buscar campanha por ID

// === FUNÇÕES PARA CAMPANHAS FILTRADAS/RELATÓRIOS ===

function processarRelatoriosCampanhas(campanhasSelecionadas, usuarioEmailParam = null) {
  try {
    console.log('Processando relatórios para campanhas:', campanhasSelecionadas);
    console.log('Email recebido como parâmetro:', usuarioEmailParam);
    
    // Obter email do usuário logado
    let usuarioEmail = usuarioEmailParam;
    
    // Se não foi passado como parâmetro, tentar obter de outras formas
    if (!usuarioEmail) {
      try {
        // Tentar obter da sessão do Apps Script
        usuarioEmail = Session.getActiveUser().getEmail();
        console.log('Email obtido da sessão:', usuarioEmail);
      } catch (e) {
        console.warn('Não foi possível obter email do usuário:', e);
      }
    }
    
    if (!usuarioEmail) {
      return {
        sucesso: false,
        erro: 'Não foi possível identificar o usuário logado. Por favor, faça login novamente.'
      };
    }
    
    console.log('Email final usado para salvar:', usuarioEmail);
    
    let campanhasProcessadas = 0;
    let campanhasSalvasSupabase = 0;
    const erros = [];
    
    // Processar cada campanha selecionada - APENAS NO SUPABASE
    for (const campanhaSelecionada of campanhasSelecionadas) {
      try {
        // Salvar no Supabase
        if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
          if (typeof adicionarCampanhaSelecionada === 'function') {
            const resultado = adicionarCampanhaSelecionada(
              campanhaSelecionada.id,
              campanhaSelecionada.clube,
              usuarioEmail
            );
            if (resultado && resultado.sucesso) {
              campanhasSalvasSupabase++;
        campanhasProcessadas++;
            } else {
              erros.push(`Erro ao salvar ${campanhaSelecionada.id} no Supabase: ${resultado?.erro || 'Erro desconhecido'}`);
            }
          } else {
            erros.push(`Função adicionarCampanhaSelecionada não disponível`);
          }
        } else {
          erros.push(`Supabase não está habilitado`);
        }
      } catch (e) {
        console.error(`Erro ao processar campanha ${campanhaSelecionada.id}:`, e);
        erros.push(`Erro ao processar ${campanhaSelecionada.id}: ${e.toString()}`);
      }
    }
    
    return {
      sucesso: true,
      quantidade: campanhasProcessadas,
      quantidadeSupabase: campanhasSalvasSupabase,
      mensagem: `${campanhasSalvasSupabase} campanha(s) salva(s) com sucesso no Supabase`,
      erros: erros.length > 0 ? erros : undefined
    };
    
  } catch (erro) {
    console.error('Erro ao processar relatórios:', erro);
    return {
      sucesso: false,
      erro: erro.toString()
    };
  }
}

// === FUNÇÕES PARA CAMPANHAS SELECIONADAS (SUPABASE) ===

/**
 * Adicionar campanha à lista de selecionadas
 * @param {string} campanhaId - ID da campanha
 * @param {string} clubeNome - Nome do clube
 * @param {string} usuarioEmail - Email do usuário
 * @return {Object} Resultado da operação
 */
function adicionarCampanhaSelecionada(campanhaId, clubeNome, usuarioEmail) {
  try {
    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      if (typeof portalAdicionarCampanhaSelecionada === 'function') {
        return portalAdicionarCampanhaSelecionada(campanhaId, clubeNome, usuarioEmail);
      }
    }
    // Fallback: retornar sucesso mesmo sem Supabase (compatibilidade)
    return { sucesso: true };
  } catch (error) {
    console.error('Erro ao adicionar campanha selecionada:', error);
    return { sucesso: false, erro: error.toString() };
  }
}

/**
 * Remover campanha da lista de selecionadas
 * @param {string} campanhaId - ID da campanha
 * @param {string} clubeNome - Nome do clube
 * @param {string} usuarioEmail - Email do usuário
 * @return {Object} Resultado da operação
 */
function removerCampanhaSelecionada(campanhaId, clubeNome, usuarioEmail) {
  try {
    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      if (typeof portalRemoverCampanhaSelecionada === 'function') {
        return portalRemoverCampanhaSelecionada(campanhaId, clubeNome, usuarioEmail);
      }
    }
    // Fallback: retornar sucesso mesmo sem Supabase (compatibilidade)
    return { sucesso: true };
  } catch (error) {
    console.error('Erro ao remover campanha selecionada:', error);
    return { sucesso: false, erro: error.toString() };
  }
}

/**
 * Verificar se uma campanha está selecionada
 * @param {string} campanhaId - ID da campanha
 * @param {string} clubeNome - Nome do clube
 * @param {string} usuarioEmail - Email do usuário
 * @return {boolean} True se estiver selecionada
 */
function verificarCampanhaSelecionada(campanhaId, clubeNome, usuarioEmail) {
  try {
    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      if (typeof portalVerificarCampanhaSelecionada === 'function') {
        return portalVerificarCampanhaSelecionada(campanhaId, clubeNome, usuarioEmail);
      }
    }
    return false;
  } catch (error) {
    console.error('Erro ao verificar campanha selecionada:', error);
    return false;
  }
}

/**
 * Buscar campanhas selecionadas completas
 * @param {string} usuarioEmail - Email do usuário
 * @param {string} clubeNome - Nome do clube (opcional)
 * @return {Array} Array de campanhas completas
 */
function buscarCampanhasSelecionadas(usuarioEmail, clubeNome = null) {
  try {
    console.log('=== BUSCAR CAMPANHAS SELECIONADAS ===');
    console.log('Email do usuário:', usuarioEmail);
    console.log('Clube (filtro):', clubeNome);
    
    if (typeof PORTAL_USAR_SUPABASE !== 'undefined' && PORTAL_USAR_SUPABASE === true) {
      if (typeof portalBuscarCampanhasSelecionadasCompletas === 'function') {
        // Se não forneceu email, busca TODAS as campanhas selecionadas da tabela
        const resultado = portalBuscarCampanhasSelecionadasCompletas(usuarioEmail || null, clubeNome);
        console.log('Resultado da busca:', resultado);
        console.log('Quantidade encontrada:', resultado?.length || 0);
        return resultado;
      } else {
        console.error('Função portalBuscarCampanhasSelecionadasCompletas não disponível');
      }
    } else {
      console.warn('Supabase não está habilitado');
    }
    // Fallback: retornar array vazio
    return [];
  } catch (error) {
    console.error('Erro ao buscar campanhas selecionadas:', error);
    console.error('Stack trace:', error.stack);
    return [];
  }
}

function obterCampanhasFiltradas() {
  try {
    console.log('Obtendo campanhas filtradas...');
    
    // ID da planilha de relatórios
    const PLANILHA_RELATORIOS_ID = '1JfDKS-o26YO-gUaI9URXTw93FXinCM9mGlYCXjMdQ3E';
    const ABA_RELATORIOS = 'Campanhas Selecionadas';
    
    // Abrir planilha de relatórios
    const ssRelatorios = SpreadsheetApp.openById(PLANILHA_RELATORIOS_ID);
    const abaRelatorios = ssRelatorios.getSheetByName(ABA_RELATORIOS);
    
    if (!abaRelatorios) {
      return {
        sucesso: true,
        dados: [],
        mensagem: 'Nenhuma campanha encontrada na planilha de relatórios'
      };
    }
    
    const dados = abaRelatorios.getDataRange().getValues();
    
    if (dados.length <= 1) {
      return {
        sucesso: true,
        dados: [],
        mensagem: 'Nenhuma campanha encontrada na planilha de relatórios'
      };
    }
    
    // Converter dados para objetos
    const campanhas = [];
    for (let i = 1; i < dados.length; i++) {
      const linha = dados[i];
      const campanha = {
        id: linha[0],
        clube: linha[1],
        al: linha[2],
        trimestre: linha[3],
        tipoCampanha: linha[4],
        titulo: linha[5],
        objetivo: linha[6],
        dataInicio: linha[7],
        dataFim: linha[8],
        local: linha[9],
        pessoasImpactadas: linha[10],
        qtdPresentes: linha[11],
        qtdPreLeos: linha[12],
        qtdAmigosConselheiros: linha[13],
        custoCampanha: linha[14],
        eixo: linha[15],
        eixoDM: linha[16],
        temParceria: linha[17],
        entidadeParceira: linha[18],
        tipoParceria: linha[19],
        descricaoParceria: linha[20],
        linkFotoOficial: linha[21],
        linkVideo: linha[22],
        linkOutrasFotos: linha[23],
        descricaoTexto: linha[24],
        dataRegistro: linha[25],
        comentarioDistrital: linha[26],
        marcadoCorrigido: linha[27],
        quemCorrigiu: linha[28],
        divulgacao: linha[29] || '',
        pontosMelhorar: linha[30] || '',
        feedback: linha[31] || ''
      };
      
      campanhas.push(campanha);
    }
    
    return {
      sucesso: true,
      dados: campanhas,
      quantidade: campanhas.length
    };
    
  } catch (erro) {
    console.error('Erro ao obter campanhas filtradas:', erro);
    return {
      sucesso: false,
      erro: erro.toString()
    };
  }
}

function atualizarCampanhaFiltrada(dadosAtualizados) {
  try {
    console.log('Atualizando campanha filtrada:', dadosAtualizados);
    
    // Esta função atualiza apenas a planilha de relatórios
    // A verificação de trimestre já foi feita no frontend antes de chamar esta função
    // ID da planilha de relatórios
    const PLANILHA_RELATORIOS_ID = '1JfDKS-o26YO-gUaI9URXTw93FXinCM9mGlYCXjMdQ3E';
    const ABA_RELATORIOS = 'Campanhas Selecionadas';
    
    // Abrir planilha de relatórios
    const ssRelatorios = SpreadsheetApp.openById(PLANILHA_RELATORIOS_ID);
    const abaRelatorios = ssRelatorios.getSheetByName(ABA_RELATORIOS);
    
    if (!abaRelatorios) {
      return {
        sucesso: false,
        erro: 'Aba de relatórios não encontrada'
      };
    }
    
    const dados = abaRelatorios.getDataRange().getValues();
    
    // Encontrar a linha da campanha
    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0] === dadosAtualizados.id) {
        // Atualizar os campos editáveis
        abaRelatorios.getRange(i + 1, 6).setValue(dadosAtualizados.titulo); // Título
        abaRelatorios.getRange(i + 1, 7).setValue(dadosAtualizados.objetivo); // Objetivo
        abaRelatorios.getRange(i + 1, 25).setValue(dadosAtualizados.descricaoTexto); // Descrição
        abaRelatorios.getRange(i + 1, 16).setValue(dadosAtualizados.eixo); // Eixo
        abaRelatorios.getRange(i + 1, 17).setValue(dadosAtualizados.eixoDM); // Eixo DM
        
        return {
          sucesso: true,
          mensagem: 'Campanha atualizada com sucesso'
        };
      }
    }
    
    return {
      sucesso: false,
      erro: 'Campanha não encontrada na planilha de relatórios'
    };
    
  } catch (erro) {
    console.error('Erro ao atualizar campanha filtrada:', erro);
    return {
      sucesso: false,
      erro: erro.toString()
    };
  }
}

/**
 * Deletar campanha filtrada (da planilha de relatórios)
 * @param {string} campanhaId - ID da campanha
 * @return {Object} Resultado da operação
 */
function deletarCampanhaFiltrada(campanhaId) {
  try {
    // Esta função deleta apenas da planilha de relatórios
    // A verificação de trimestre já foi feita no frontend antes de chamar esta função
    const PLANILHA_RELATORIOS_ID = '1JfDKS-o26YO-gUaI9URXTw93FXinCM9mGlYCXjMdQ3E';
    const ABA_RELATORIOS = 'Campanhas Selecionadas';
    
    const ssRelatorios = SpreadsheetApp.openById(PLANILHA_RELATORIOS_ID);
    const abaRelatorios = ssRelatorios.getSheetByName(ABA_RELATORIOS);
    
    if (!abaRelatorios) {
      return {
        sucesso: false,
        erro: 'Aba de relatórios não encontrada'
      };
    }
    
    const dados = abaRelatorios.getDataRange().getValues();
    
    // Encontrar e deletar a linha da campanha
    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0] === campanhaId) {
        abaRelatorios.deleteRow(i + 1);
        return {
          sucesso: true,
          mensagem: 'Campanha deletada com sucesso'
        };
      }
    }
    
    return {
      sucesso: false,
      erro: 'Campanha não encontrada na planilha de relatórios'
    };
    
  } catch (erro) {
    console.error('Erro ao deletar campanha filtrada:', erro);
    return {
      sucesso: false,
      erro: erro.toString()
    };
  }
}

function buscarCampanhaPorId(campanhaId, clube) {
  try {
    // Normalizar IDs para string com trim
    const idNormalizado = String(campanhaId).trim();
    const clubeNormalizado = String(clube).trim();
    
    // Buscar na planilha do clube
    const planilhaClubeId = PLANILHAS_CAMPANHAS[clubeNormalizado];
    if (!planilhaClubeId) {
      console.error(`Planilha de campanhas não mapeada para o clube: ${clubeNormalizado}`);
      return null;
    }
    
    const ss = SpreadsheetApp.openById(planilhaClubeId);
    const aba = ss.getSheetByName(ABA_CAMPANHAS);
    
    if (!aba) {
      return null;
    }
    
    const lastRow = aba.getLastRow();
    if (lastRow <= 1) return null;
    
    // Buscar dados com estrutura completa (40 colunas A-AN)
    const dados = aba.getRange(2, 1, lastRow - 1, 40).getValues();
    
    // Mapeamento de colunas (baseado na estrutura da planilha do clube: 40 colunas A-AN)
    // A=0, B=1, C=2, ..., AH=33 (ID), AL=37, AM=38, AN=39
    const COL_ID = 33; // AH - ID Único
    
    for (let i = 0; i < dados.length; i++) {
      const linha = dados[i];
      
      const idLinha = String(linha[COL_ID] || '').trim();
      
      if (idLinha === idNormalizado) {
        return {
          id: linha[33] || '', // AH - ID Único
          clube: linha[3] || '', // D - Clube
          al: linha[1] || '', // B - AL
          trimestre: linha[2] || '', // C - Trimestre
          tipoCampanha: '', // Não existe na planilha do clube
          titulo: linha[4] || '', // E - Titulo Campanha
          objetivo: linha[5] || '', // F - Objetivo Campanha
          dataInicio: linha[6] ? new Date(linha[6]).toISOString() : null, // G - Data e Hora início
          dataFim: linha[7] ? new Date(linha[7]).toISOString() : null, // H - Data e Hora Fim
          local: linha[8] || '', // I - Coordenador (usar como local temporariamente, mas não há campo local específico)
          pessoasImpactadas: parseInt(linha[17]) || 0, // R - Pessoas Impactadas
          qtdPresentes: parseInt(linha[12]) || 0, // M - Quantidade Associados Presentes
          qtdPreLeos: parseInt(linha[14]) || 0, // O - Quantidade Pré LEO's Presentes
          qtdAmigosConselheiros: parseInt(linha[16]) || 0, // Q - Quantidade Conselheiros e Amigos LEO Presentes
          custoCampanha: parseFloat(linha[18]) || 0, // S - Custo Campanha
          qtdLeoesParticipantes: parseInt(linha[19]) || 0, // T - Companheiros Leões Presentes (Quantidade)
          eixo: linha[23] || '', // X - Eixo D8
          eixoDM: linha[24] || '', // Y - Eixo DM
          temParceria: linha[29] === 'Sim', // AD - Tem Parceria
          entidadeParceira: linha[30] || '', // AE - Entidade Parceira
          tipoParceria: linha[31] || '', // AF - Tipo Parceria
          descricaoParceria: linha[32] || '', // AG - Descrição Parceria
          linkFotoOficial: linha[25] || '', // Z - Foto Oficial
          linkVideo: linha[26] || '', // AA - Video Campanha
          linkOutrasFotos: linha[27] || '', // AB - Outras Fotos
          descricaoTexto: linha[22] || '', // W - Descrição Campanha
          dataRegistro: linha[0] ? new Date(linha[0]).toISOString() : null, // A - Carimbo Data e Hora
          comentarioDistrital: linha[34] || '', // AI - Comentário Distrital
          marcadoCorrigido: linha[35] === 'Sim', // AJ - Marcado como Corrigido
          quemCorrigiu: linha[36] || '', // AK - Quem Corrigiu
          divulgacao: linha[37] || '', // AL - Divulgação da Campanha
          pontosMelhorar: linha[38] || '', // AM - Pontos a Serem Melhorados
          feedback: linha[39] || '' // AN - Feedback da Campanha
        };
      }
    }
    
    return null;
    
  } catch (erro) {
    console.error('Erro ao buscar campanha por ID:', erro);
    return null;
  }
}

// === FUNÇÕES DE CONFIGURAÇÕES ===

/**
 * Listar todas as configurações
 * @return {Object} Objeto com sucesso e configurações
 */
async function listarConfiguracoes() {
  try {
    const configuracoes = await portalListarConfiguracoes();
    return {
      sucesso: true,
      configuracoes: configuracoes
    };
  } catch (error) {
    console.error('Erro ao listar configurações:', error);
    return {
      sucesso: false,
      erro: error.message,
      configuracoes: []
    };
  }
}

/**
 * Salvar configuração (criar ou atualizar)
 * @param {Object} dados - Dados da configuração
 * @param {string} configId - ID da configuração (opcional, se não fornecido cria nova)
 * @return {Object} Resultado da operação
 */
async function salvarConfiguracao(dados, configId) {
  try {
    let resultado;
    if (configId) {
      resultado = await portalAtualizarConfiguracao(configId, dados);
    } else {
      resultado = await portalCriarConfiguracao(dados);
    }
    return resultado;
  } catch (error) {
    console.error('Erro ao salvar configuração:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Ativar configuração (desativa todas as outras)
 * @param {string} configId - ID da configuração a ativar
 * @return {Object} Resultado da operação
 */
async function ativarConfiguracao(configId) {
  try {
    return await portalAtivarConfiguracao(configId);
  } catch (error) {
    console.error('Erro ao ativar configuração:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Excluir configuração
 * @param {string} configId - ID da configuração
 * @return {Object} Resultado da operação
 */
async function excluirConfiguracao(configId) {
  try {
    return await portalExcluirConfiguracao(configId);
  } catch (error) {
    console.error('Erro ao excluir configuração:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Buscar configuração ativa
 * @return {Object|null} Configuração ativa ou null
 */
async function buscarConfiguracaoAtiva() {
  try {
    return await portalBuscarConfiguracaoAtiva();
  } catch (error) {
    console.error('Erro ao buscar configuração ativa:', error);
    return null;
  }
}

// === EIXOS DE CAMPANHA ===

async function listarEixosCampanha(al) {
  try {
    const eixos = await portalListarEixosCampanha(al);
    return { sucesso: true, eixos };
  } catch (error) {
    console.error('Erro ao listar eixos de campanha:', error);
    return { sucesso: false, eixos: [], erro: error.message };
  }
}

async function salvarEixoCampanha(dados) {
  try {
    const eixo = await portalCriarEixoCampanha(dados);
    return { sucesso: true, eixo };
  } catch (error) {
    console.error('Erro ao salvar eixo de campanha:', error);
    return { sucesso: false, erro: error.message };
  }
}

async function excluirEixoCampanha(id) {
  if (!id) return { sucesso: false, erro: 'ID inválido.' };
  try {
    await portalExcluirEixoCampanha(id);
    return { sucesso: true };
  } catch (error) {
    console.error('Erro ao excluir eixo de campanha:', error);
    return { sucesso: false, erro: error.message };
  }
}

// === FUNÇÕES DE GERENCIAMENTO DE ACESSOS ===

/**
 * Listar todos os acessos cadastrados no Supabase
 * @return {Object} {sucesso: boolean, acessos: Array, erro: string|null}
 */
async function listarAcessos() {
  try {
    console.log('🔍 Buscando todos os acessos do Supabase');
    
    // Usar a mesma configuração do RTMA
    const RTMA_SUPABASE_CONFIG = {
      url: 'https://bqkttaflhtsdkamgscnf.supabase.co',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    };
    
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/usuarios_acessos?select=*&order=clube_nome.asc`;
    const response = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      const erroTexto = response.getContentText();
      console.error('❌ Erro ao buscar acessos no Supabase:', erroTexto);
      return {
        sucesso: false,
        acessos: [],
        erro: 'Erro ao buscar acessos: ' + erroTexto
      };
    }
    
    const acessos = JSON.parse(response.getContentText());
    
    // Normalizar dados para o frontend
    const acessosNormalizados = acessos.map(acesso => ({
      id: acesso.id || '',
      idUnico: acesso.id || '',
      clube: acesso.clube_nome || '',
      email: acesso.email || '',
      regiao: '', // Região não está na tabela usuarios_acessos, pode estar em clubes relacionada
      tipoAcesso: acesso.tipo_acesso || '',
      driveId: '', // Drive ID não está na tabela usuarios_acessos
      ativo: acesso.ativo !== undefined ? acesso.ativo : true, // Default true se não existir
      senha: '***' // Não retornar senha real
    }));
    
    console.log(`✅ Retornando ${acessosNormalizados.length} acessos`);
    return {
      sucesso: true,
      acessos: acessosNormalizados,
      erro: null
    };
    
  } catch (error) {
    console.error('❌ Erro ao listar acessos:', error.message);
    return {
      sucesso: false,
      acessos: [],
      erro: 'Erro ao listar acessos: ' + error.message
    };
  }
}

/**
 * Formata data_fundacao para exibição em fuso brasileiro (America/Sao_Paulo).
 * Aceita ISO ou YYYY-MM-DD; retorna DD/MM/YYYY ou null.
 */
function formatarDataFundacaoBR(val) {
  if (val === null || val === undefined || val === '') return null;
  var s = String(val).trim();
  if (!s) return null;
  var d = null;
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) {
    var p = s.split(/[-T]/);
    d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10) || 1);
  } else if (s.match(/^\d{2}\/\d{2}\/\d{4}$/)) return s;
  if (!d || isNaN(d.getTime())) return null;
  return Utilities.formatDate(d, 'America/Sao_Paulo', 'dd/MM/yyyy');
}

/**
 * Listar clubes cadastrados no Supabase.
 * Colunas na tabela clubes: id, nome, email, status (Ativo|Inativo|Inadimplente|Núcleo), data_fundacao, regiao, lions_patrocinador.
 * @param {string} [filtroRegiao] - Opcional: filtrar por regiao (ex: "A", "B")
 * @param {string} [filtroStatus] - Opcional: filtrar por status
 * @return {Object} {sucesso: boolean, clubes: Array, erro: string|null}
 */
async function listarClubesSupabase(filtroRegiao, filtroStatus) {
  try {
    var url = RTMA_SUPABASE_CONFIG.url + '/rest/v1/clubes?select=id,nome,email,status,data_fundacao,regiao,lions_patrocinador&order=nome.asc';
    var response = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': 'Bearer ' + RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      url = RTMA_SUPABASE_CONFIG.url + '/rest/v1/clubes?select=id,nome,email&order=nome.asc';
      response = await gasStyleFetch(url, {
        method: 'GET',
        headers: {
          'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
          'Authorization': 'Bearer ' + RTMA_SUPABASE_CONFIG.serviceRoleKey,
          'Content-Type': 'application/json'
        },
        muteHttpExceptions: true
      });
    }
    if (response.getResponseCode() !== 200) {
      console.error('Erro ao listar clubes:', response.getContentText());
      return { sucesso: false, clubes: [], erro: response.getContentText() || 'Erro ao listar clubes.' };
    }
    var raw = JSON.parse(response.getContentText() || '[]');
    var clubes = (raw || []).map(function(c) {
      return {
        id: c.id,
        nome: (c.nome || '').trim(),
        email: (c.email && String(c.email).trim()) ? String(c.email).trim() : null,
        status: (c.status && String(c.status).trim()) ? String(c.status).trim() : 'Ativo',
        data_fundacao: c.data_fundacao ? formatarDataFundacaoBR(c.data_fundacao) : null,
        regiao: (c.regiao && String(c.regiao).trim()) ? String(c.regiao).trim() : null,
        lions_patrocinador: (c.lions_patrocinador && String(c.lions_patrocinador).trim()) ? String(c.lions_patrocinador).trim() : null
      };
    });
    if (filtroRegiao && String(filtroRegiao).trim()) {
      clubes = clubes.filter(function(c) { return (c.regiao || '') === String(filtroRegiao).trim(); });
    }
    if (filtroStatus && String(filtroStatus).trim()) {
      clubes = clubes.filter(function(c) { return (c.status || 'Ativo') === String(filtroStatus).trim(); });
    }
    return { sucesso: true, clubes: clubes, erro: null };
  } catch (error) {
    console.error('Erro ao listar clubes:', error);
    return { sucesso: false, clubes: [], erro: 'Erro ao listar clubes: ' + error.message };
  }
}

/**
 * Retorna mapa nome do clube -> regiao (A, B, D) para uso em gráficos/filtros de campanhas.
 * Assim campanhas usam a regiao cadastrada no clube e não ficam "Não mapeada".
 * @returns {Object} { sucesso, mapa: { nomeClube: 'A'|'B'|'D' }, erro? }
 */
async function obterMapaRegiaoClubes() {
  try {
    var res = await listarClubesSupabase();
    if (!res.sucesso || !res.clubes) return { sucesso: true, mapa: {} };
    var mapa = {};
    (res.clubes || []).forEach(function(c) {
      var nome = (c.nome || '').trim();
      var reg = (c.regiao || '').trim().toUpperCase();
      if (nome && reg) mapa[nome] = reg;
    });
    return { sucesso: true, mapa: mapa };
  } catch (e) {
    console.error('obterMapaRegiaoClubes:', e);
    return { sucesso: false, mapa: {}, erro: (e && e.message) || '' };
  }
}

/**
 * Resumo de delegados por clube (Art. 52): 1 delegado e 1 suplente para cada grupo de 10
 * associados ativos ou fração igual ou superior a 5. Associados Ativos = Associado LEO +
 * Associado LEO e LEO/Leão ativos. Data de referência = primeiro dia do mês anterior à Conferência.
 * @param {string} [dataReferenciaStr] - Data de referência YYYY-MM-DD (ex.: 1º do mês anterior à Conferência). Se vazio, usa dados atuais.
 * @returns {Object} { sucesso, dados: { dataReferencia, clubes: [{ clubeNome, associadosAtivos, delegados, suplentes }] }, erro }
 */
async function obterResumoDelegadosClubes(dataReferenciaStr) {
  try {
    var dataRef = null;
    if (dataReferenciaStr && String(dataReferenciaStr).trim()) {
      var s = String(dataReferenciaStr).trim();
      var match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (match) {
        dataRef = new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
      } else {
        var parts = s.split(/[-/]/);
        if (parts.length >= 2) {
          dataRef = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
        }
      }
      if (!dataRef || isNaN(dataRef.getTime())) dataRef = null;
    }

    var resClubes = (typeof listarClubesParaDirigenteGabinete === 'function') ? await listarClubesParaDirigenteGabinete() : null;
    var listaClubes = (resClubes && resClubes.sucesso && resClubes.clubes) ? resClubes.clubes : [];
    if (!listaClubes.length && typeof listarClubesSupabase === 'function') {
      var resSupabase = await listarClubesSupabase();
      listaClubes = (resSupabase && resSupabase.clubes) ? resSupabase.clubes : [];
      var excluir = ['Gabinete Distrital', 'Distrito LEO LD-8'];
      listaClubes = listaClubes.filter(function(c) {
        var nome = (c.nome || '').trim();
        return nome && excluir.indexOf(nome) < 0;
      });
    }

    var tipoAssociadoAtivo1 = 'Associado LEO';
    var tipoAssociadoAtivo2 = 'Associado LEO e LEO/Leão';
    var resultados = [];

    for (var i = 0; i < listaClubes.length; i++) {
      var clube = listaClubes[i];
      var clubeNome = (clube.nome || '').trim() || ('Clube ' + (i + 1));
      var statusClube = (clube.status || 'Ativo').trim();
      var inadimplente = statusClube === 'Inadimplente';
      var nucleo = statusClube === 'Núcleo';
      var pessoas = (typeof buscarPessoasRTMA === 'function') ? ((await buscarPessoasRTMA(clubeNome, null, null, null)) || []) : [];
      var associadosAtivos = 0;

      if (dataRef && typeof obterTipoHistoricoPessoa === 'function') {
        for (var j = 0; j < pessoas.length; j++) {
          var p = pessoas[j];
          var tipoHist = obterTipoHistoricoPessoa(p, dataRef, false);
          if (tipoHist === tipoAssociadoAtivo1 || tipoHist === tipoAssociadoAtivo2) associadosAtivos++;
        }
      } else {
        for (var k = 0; k < pessoas.length; k++) {
          var pessoa = pessoas[k];
          var status = String(pessoa.status || '').toLowerCase();
          var tipo = String(pessoa.tipo || '').trim();
          if (status !== 'ativo') continue;
          if (tipo === tipoAssociadoAtivo1 || tipo === tipoAssociadoAtivo2) associadosAtivos++;
        }
      }

      var delegados = 0;
      var suplentes = 0;
      if (!inadimplente && !nucleo) {
        var n = associadosAtivos;
        var grupos10 = Math.floor(n / 10);
        var resto = n % 10;
        delegados = grupos10 + (resto >= 5 ? 1 : 0);
        suplentes = delegados;
      }

      resultados.push({
        clubeNome: clubeNome,
        associadosAtivos: associadosAtivos,
        delegados: delegados,
        suplentes: suplentes,
        statusClube: statusClube,
        inadimplente: inadimplente,
        nucleo: nucleo
      });
    }

    resultados.sort(function(a, b) { return (a.clubeNome || '').localeCompare(b.clubeNome || '', 'pt-BR'); });

    var dataRefLabel = dataRef
      ? (dataRef.getDate() + '/' + (dataRef.getMonth() + 1) + '/' + dataRef.getFullYear())
      : 'Dados atuais';

    return {
      sucesso: true,
      dados: {
        dataReferencia: dataRefLabel,
        dataReferenciaISO: dataRef ? (dataRef.getFullYear() + '-' + String(dataRef.getMonth() + 1).padStart(2, '0') + '-' + String(dataRef.getDate()).padStart(2, '0')) : null,
        clubes: resultados
      },
      erro: null
    };
  } catch (e) {
    console.error('obterResumoDelegadosClubes:', e);
    return { sucesso: false, dados: null, erro: (e && e.message) ? e.message : String(e) };
  }
}

/**
 * Retorna o e-mail cadastrado do clube (para envio de passaportes).
 * @param {string} clubeNome - Nome do clube
 * @returns {string} E-mail ou vazio
 */
async function obterEmailClubeSupabase(clubeNome) {
  try {
    if (!clubeNome || !String(clubeNome).trim()) return '';
    var nome = String(clubeNome).trim();
    var url = RTMA_SUPABASE_CONFIG.url + '/rest/v1/clubes?nome=eq.' + encodeURIComponent(nome) + '&select=email';
    var response = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': 'Bearer ' + RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) return '';
    var rows = JSON.parse(response.getContentText() || '[]');
    var first = rows && rows[0] ? rows[0] : null;
    var email = first && first.email ? String(first.email).trim() : '';
    return email || '';
  } catch (e) {
    console.warn('obterEmailClubeSupabase:', e);
    return '';
  }
}

/**
 * Atualiza o e-mail do clube na tabela clubes (para envio de passaportes).
 * @param {string} clubeNome - Nome do clube
 * @param {string} email - E-mail a salvar
 * @returns {{ sucesso: boolean, erro?: string }}
 */
async function atualizarEmailClubeSupabase(clubeNome, email) {
  try {
    if (!clubeNome || !String(clubeNome).trim()) return { sucesso: false, erro: 'Nome do clube é obrigatório.' };
    var nome = String(clubeNome).trim();
    var emailVal = (email && String(email).trim()) ? String(email).trim() : null;
    var url = RTMA_SUPABASE_CONFIG.url + '/rest/v1/clubes?nome=eq.' + encodeURIComponent(nome);
    var options = {
      method: 'PATCH',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': 'Bearer ' + RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ email: emailVal }),
      muteHttpExceptions: true
    };
    var response = await gasStyleFetch(url, options);
    if (response.getResponseCode() !== 200 && response.getResponseCode() !== 204) {
      return { sucesso: false, erro: response.getContentText() || 'Erro ao atualizar e-mail do clube.' };
    }
    if (typeof obterMapaClubesSupabase === 'function') {
      MAPA_CLUBES_CACHE = null;
      MAPA_CLUBES_CACHE_TIMESTAMP = null;
    }
    return { sucesso: true };
  } catch (e) {
    console.error('atualizarEmailClubeSupabase:', e);
    return { sucesso: false, erro: (e && e.message) || 'Erro ao atualizar e-mail.' };
  }
}

/**
 * Atualiza dados do clube na tabela clubes (nome, email ou outros campos).
 * @param {string} clubeId - ID (UUID) do clube
 * @param {Object} dados - { nome?: string, email?: string }
 * @returns {{ sucesso: boolean, erro?: string }}
 */
async function atualizarClubeSupabase(clubeId, dados) {
  try {
    if (!clubeId || !String(clubeId).trim()) return { sucesso: false, erro: 'ID do clube é obrigatório.' };
    var id = String(clubeId).trim();
    var payload = {};
    if (dados && dados.nome !== undefined) payload.nome = String(dados.nome || '').trim() || null;
    if (dados && dados.email !== undefined) payload.email = (dados.email && String(dados.email).trim()) ? String(dados.email).trim() : null;
    if (dados && dados.status !== undefined) payload.status = (dados.status && String(dados.status).trim()) ? String(dados.status).trim() : null;
    if (dados && dados.data_fundacao !== undefined) payload.data_fundacao = (dados.data_fundacao && String(dados.data_fundacao).trim()) ? String(dados.data_fundacao).trim() : null;
    if (dados && dados.regiao !== undefined) payload.regiao = (dados.regiao && String(dados.regiao).trim()) ? String(dados.regiao).trim() : null;
    if (dados && dados.lions_patrocinador !== undefined) payload.lions_patrocinador = (dados.lions_patrocinador && String(dados.lions_patrocinador).trim()) ? String(dados.lions_patrocinador).trim() : null;
    if (Object.keys(payload).length === 0) return { sucesso: true };
    var url = RTMA_SUPABASE_CONFIG.url + '/rest/v1/clubes?id=eq.' + encodeURIComponent(id);
    var response = await gasStyleFetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': 'Bearer ' + RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200 && response.getResponseCode() !== 204) {
      return { sucesso: false, erro: response.getContentText() || 'Erro ao atualizar clube.' };
    }
    if (typeof obterMapaClubesSupabase === 'function') {
      MAPA_CLUBES_CACHE = null;
      MAPA_CLUBES_CACHE_TIMESTAMP = null;
    }
    return { sucesso: true };
  } catch (e) {
    console.error('atualizarClubeSupabase:', e);
    return { sucesso: false, erro: (e && e.message) || 'Erro ao atualizar clube.' };
  }
}

/**
 * Inserir novo clube na tabela clubes.
 * @param {Object} dados - { nome, email?, status?, data_fundacao?, regiao?, lions_patrocinador? }
 * @returns {{ sucesso: boolean, id?: string, erro?: string }}
 */
async function inserirClube(dados) {
  try {
    var nome = dados && dados.nome ? String(dados.nome).trim() : '';
    if (!nome) return { sucesso: false, erro: 'Nome do clube é obrigatório.' };
    var payload = { nome: nome };
    if (dados.email !== undefined && dados.email !== null) payload.email = String(dados.email).trim() || null;
    if (dados.status !== undefined && dados.status !== null) payload.status = String(dados.status).trim() || 'Ativo';
    if (dados.data_fundacao !== undefined && dados.data_fundacao !== null && String(dados.data_fundacao).trim()) payload.data_fundacao = String(dados.data_fundacao).trim();
    if (dados.regiao !== undefined && dados.regiao !== null) payload.regiao = String(dados.regiao).trim() || null;
    if (dados.lions_patrocinador !== undefined && dados.lions_patrocinador !== null) payload.lions_patrocinador = String(dados.lions_patrocinador).trim() || null;
    var url = RTMA_SUPABASE_CONFIG.url + '/rest/v1/clubes';
    var response = await gasStyleFetch(url, {
      method: 'POST',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': 'Bearer ' + RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 201 && response.getResponseCode() !== 200) {
      return { sucesso: false, erro: response.getContentText() || 'Erro ao criar clube.' };
    }
    var created = JSON.parse(response.getContentText() || '[]');
    var id = (created && created[0] && created[0].id) ? created[0].id : null;
    if (typeof obterMapaClubesSupabase === 'function') {
      MAPA_CLUBES_CACHE = null;
      MAPA_CLUBES_CACHE_TIMESTAMP = null;
    }
    return { sucesso: true, id: id };
  } catch (e) {
    console.error('inserirClube:', e);
    return { sucesso: false, erro: (e && e.message) || 'Erro ao criar clube.' };
  }
}

/**
 * Excluir clube por ID.
 * @param {string} clubeId - UUID do clube
 * @returns {{ sucesso: boolean, erro?: string }}
 */
async function excluirClube(clubeId) {
  try {
    if (!clubeId || !String(clubeId).trim()) return { sucesso: false, erro: 'ID do clube é obrigatório.' };
    var url = RTMA_SUPABASE_CONFIG.url + '/rest/v1/clubes?id=eq.' + encodeURIComponent(String(clubeId).trim());
    var response = await gasStyleFetch(url, {
      method: 'DELETE',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': 'Bearer ' + RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200 && response.getResponseCode() !== 204) {
      return { sucesso: false, erro: response.getContentText() || 'Erro ao excluir clube.' };
    }
    if (typeof obterMapaClubesSupabase === 'function') {
      MAPA_CLUBES_CACHE = null;
      MAPA_CLUBES_CACHE_TIMESTAMP = null;
    }
    return { sucesso: true };
  } catch (e) {
    console.error('excluirClube:', e);
    return { sucesso: false, erro: (e && e.message) || 'Erro ao excluir clube.' };
  }
}

/**
 * Criar novo clube e atribuir acesso
 * @param {Object} dados
 * @return {Object} {sucesso: boolean, erro: string|null}
 */
async function criarClubeComAcesso(dados) {
  try {
    const nomeClube = String(dados && dados.nomeClube ? dados.nomeClube : '').trim();
    const email = String(dados && dados.email ? dados.email : '').trim().toLowerCase();
    const senha = String(dados && dados.senha ? dados.senha : '').trim();
    const tipoAcesso = String(dados && dados.tipoAcesso ? dados.tipoAcesso : '').trim().toLowerCase();
    if (!nomeClube || !email || !senha || !tipoAcesso) {
      return { sucesso: false, erro: 'Preencha clube, email, senha e tipo de acesso.' };
    }

    const urlEmail = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/usuarios_acessos?email=eq.${encodeURIComponent(email)}&select=id`;
    const respEmail = await gasStyleFetch(urlEmail, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    if (respEmail.getResponseCode() !== 200) {
      return { sucesso: false, erro: 'Erro ao validar email de acesso.' };
    }
    const existentes = JSON.parse(respEmail.getContentText() || '[]');
    if (Array.isArray(existentes) && existentes.length > 0) {
      return { sucesso: false, erro: 'Já existe acesso com esse email.' };
    }

    const clubesMap = (typeof obterMapaClubesSupabase === 'function') ? (await obterMapaClubesSupabase()) : {};
    let clubeId = clubesMap[nomeClube];
    if (!clubeId) {
      const urlClube = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/clubes`;
      const respClube = await gasStyleFetch(urlClube, {
        method: 'POST',
        headers: {
          'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
          'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        payload: JSON.stringify([{ nome: nomeClube }]),
        muteHttpExceptions: true
      });
      if (respClube.getResponseCode() !== 201 && respClube.getResponseCode() !== 200) {
        return { sucesso: false, erro: `Erro ao criar clube: ${respClube.getContentText()}` };
      }
      const criado = JSON.parse(respClube.getContentText() || '[]');
      clubeId = criado && criado[0] ? criado[0].id : null;
    }
    if (!clubeId) {
      return { sucesso: false, erro: 'Não foi possível obter o ID do clube.' };
    }

    const urlAcesso = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/usuarios_acessos`;
    const respAcesso = await gasStyleFetch(urlAcesso, {
      method: 'POST',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      payload: JSON.stringify([{
        clube_nome: nomeClube,
        clube_id: clubeId,
        email: email,
        senha: senha,
        tipo_acesso: tipoAcesso,
        ativo: true
      }]),
      muteHttpExceptions: true
    });
    if (respAcesso.getResponseCode() !== 201 && respAcesso.getResponseCode() !== 200) {
      return { sucesso: false, erro: `Erro ao criar acesso: ${respAcesso.getContentText()}` };
    }

    if (typeof MAPA_CLUBES_CACHE !== 'undefined') {
      MAPA_CLUBES_CACHE = null;
      MAPA_CLUBES_CACHE_TIMESTAMP = null;
    }

    return { sucesso: true, erro: null };
  } catch (error) {
    console.error('❌ Erro ao criar clube e acesso:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Atualizar status ativo/inativo de um acesso
 * @param {string} acessoId - ID do acesso (UUID)
 * @param {boolean} ativo - Novo status (true = ativo, false = inativo)
 * @return {Object} {sucesso: boolean, erro: string|null}
 */
async function atualizarStatusAcesso(acessoId, ativo) {
  try {
    console.log(`🔄 Atualizando status do acesso ${acessoId} para ${ativo ? 'ATIVO' : 'INATIVO'}`);
    
    // Usar a mesma configuração do RTMA
    const RTMA_SUPABASE_CONFIG = {
      url: 'https://bqkttaflhtsdkamgscnf.supabase.co',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    };
    
    // Primeiro, verificar se o acesso existe e obter o ID correto
    // O acessoId deve ser um UUID
    let urlBusca = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/usuarios_acessos?id=eq.${encodeURIComponent(acessoId)}&select=id`;
    let response = await gasStyleFetch(urlBusca, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      const erroTexto = response.getContentText();
      console.error('❌ Erro ao buscar acesso para atualização:', erroTexto);
      return {
        sucesso: false,
        erro: 'Erro ao buscar acesso: ' + erroTexto
      };
    }
    
    const dados = JSON.parse(response.getContentText());
    if (!dados || dados.length === 0) {
      console.error('❌ Acesso não encontrado:', acessoId);
      return {
        sucesso: false,
        erro: 'Acesso não encontrado'
      };
    }
    
    const acesso = dados[0];
    const idParaUpdate = acesso.id; // Usar UUID para atualização
    
    // Atualizar o status
    const urlUpdate = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/usuarios_acessos?id=eq.${encodeURIComponent(idParaUpdate)}`;
    response = await gasStyleFetch(urlUpdate, {
      method: 'PATCH',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      payload: JSON.stringify({
        ativo: ativo,
        updated_at: new Date().toISOString()
      }),
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200 && response.getResponseCode() !== 204) {
      const erroTexto = response.getContentText();
      console.error('❌ Erro ao atualizar status do acesso:', erroTexto);
      return {
        sucesso: false,
        erro: 'Erro ao atualizar acesso: ' + erroTexto
      };
    }
    
    console.log(`✅ Status do acesso ${acessoId} atualizado com sucesso para ${ativo ? 'ATIVO' : 'INATIVO'}`);
    return {
      sucesso: true,
      erro: null
    };
    
  } catch (error) {
    console.error('❌ Erro ao atualizar status do acesso:', error.message);
    return {
      sucesso: false,
      erro: 'Erro ao atualizar acesso: ' + error.message
    };
  }
}

/**
 * Obtém as datas de início e fim de um trimestre específico para o relatório DM
 * Ajusta a lógica: se o trimestre anterior termina em 30/09, o próximo começa em 01/10
 * @param {string} trimestre - '1', '2', '3' ou '4'
 * @return {Object|null} {dataInicio: string (YYYY-MM-DD), dataFim: string (YYYY-MM-DD), al: string} ou null
 */
async function obterDatasTrimestreParaDM(trimestre) {
  try {
    const config = await buscarConfiguracaoAtiva();
    if (!config) {
      console.warn('Nenhuma configuração ativa encontrada');
      return null;
    }

    const parseConfigDate = (valor) => {
      if (!valor) return null;
      if (valor instanceof Date && !isNaN(valor.getTime())) return valor;
      const raw = String(valor).trim();
      if (!raw) return null;
      // Formato ISO
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const partes = raw.split('-');
        const ano = parseInt(partes[0], 10);
        const mes = parseInt(partes[1], 10) - 1;
        const dia = parseInt(partes[2], 10);
        const dataIso = new Date(ano, mes, dia);
        return isNaN(dataIso.getTime()) ? null : dataIso;
      }
      // Formato BR (DD/MM/AAAA)
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        const partes = raw.split('/');
        const dia = parseInt(partes[0], 10);
        const mes = parseInt(partes[1], 10) - 1;
        const ano = parseInt(partes[2], 10);
        const dataBr = new Date(ano, mes, dia);
        return isNaN(dataBr.getTime()) ? null : dataBr;
      }
      const dataTentativa = new Date(raw);
      return isNaN(dataTentativa.getTime()) ? null : dataTentativa;
    };
    
    let dataInicio, dataFim;
    
    const cfg = {
      t1Inicio: config.trimestre1Inicio || config.trimestre_1_inicio,
      t1Fim: config.trimestre1Fim || config.trimestre_1_fim,
      t2Inicio: config.trimestre2Inicio || config.trimestre_2_inicio,
      t2Fim: config.trimestre2Fim || config.trimestre_2_fim,
      t3Inicio: config.trimestre3Inicio || config.trimestre_3_inicio,
      t3Fim: config.trimestre3Fim || config.trimestre_3_fim,
      t4Inicio: config.trimestre4Inicio || config.trimestre_4_inicio,
      t4Fim: config.trimestre4Fim || config.trimestre_4_fim
    };

    if (trimestre === '1') {
      // Primeiro trimestre: usa as datas configuradas
      const ini = parseConfigDate(cfg.t1Inicio);
      const fim = parseConfigDate(cfg.t1Fim);
      if (!ini || !fim) return null;
      dataInicio = formatarDataParaISO(ini);
      dataFim = formatarDataParaISO(fim);
    } else if (trimestre === '2') {
      // Segundo trimestre: começa no dia seguinte ao fim do primeiro
      const trim1Fim = parseConfigDate(cfg.t1Fim);
      const trim2Fim = parseConfigDate(cfg.t2Fim);
      if (!trim1Fim || !trim2Fim) return null;
      trim1Fim.setDate(trim1Fim.getDate() + 1);
      dataInicio = formatarDataParaISO(trim1Fim);
      dataFim = formatarDataParaISO(trim2Fim);
    } else if (trimestre === '3') {
      // Terceiro trimestre: começa no dia seguinte ao fim do segundo
      const trim2Fim = parseConfigDate(cfg.t2Fim);
      const trim3Fim = parseConfigDate(cfg.t3Fim);
      if (!trim2Fim || !trim3Fim) return null;
      trim2Fim.setDate(trim2Fim.getDate() + 1);
      dataInicio = formatarDataParaISO(trim2Fim);
      dataFim = formatarDataParaISO(trim3Fim);
    } else if (trimestre === '4') {
      // Quarto trimestre: começa no dia seguinte ao fim do terceiro
      const trim3Fim = parseConfigDate(cfg.t3Fim);
      const trim4Fim = parseConfigDate(cfg.t4Fim);
      if (!trim3Fim || !trim4Fim) return null;
      trim3Fim.setDate(trim3Fim.getDate() + 1);
      dataInicio = formatarDataParaISO(trim3Fim);
      dataFim = formatarDataParaISO(trim4Fim);
    } else {
      console.error('Trimestre inválido:', trimestre);
      return null;
    }
    
    return {
      dataInicio: dataInicio,
      dataFim: dataFim,
      al: config.al
    };
  } catch (error) {
    console.error('Erro ao obter datas do trimestre para DM:', error);
    return null;
  }
}

/**
 * Formata uma data para o formato ISO (YYYY-MM-DD)
 * @param {Date} data - Data a formatar
 * @return {string} Data no formato YYYY-MM-DD
 */
function formatarDataParaISO(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// === SISTEMA DE SEGURANÇA E APROVAÇÃO ===

/**
 * Determina qual trimestre uma data pertence baseado na configuração ativa
 * @param {Date|string} data - Data a verificar
 * @param {Object} config - Configuração ativa (opcional, busca automaticamente se não fornecido)
 * @return {Object|null} {trimestre: '1'|'2'|'3'|'4', al: string} ou null se não encontrar
 */
async function determinarTrimestreDaData(data, config = null) {
  try {
    if (!config) {
      config = await buscarConfiguracaoAtiva();
    }
    
    if (!config) {
      console.warn('Nenhuma configuração ativa encontrada');
      return null;
    }
    
    const dataObj = data instanceof Date ? data : new Date(data);
    if (isNaN(dataObj.getTime())) {
      console.error('Data inválida:', data);
      return null;
    }
    
    // Converter datas da configuração para objetos Date
    const trim1Inicio = new Date(config.trimestre_1_inicio);
    const trim1Fim = new Date(config.trimestre_1_fim);
    const trim2Inicio = new Date(config.trimestre_2_inicio);
    const trim2Fim = new Date(config.trimestre_2_fim);
    const trim3Inicio = new Date(config.trimestre_3_inicio);
    const trim3Fim = new Date(config.trimestre_3_fim);
    const trim4Inicio = new Date(config.trimestre_4_inicio);
    const trim4Fim = new Date(config.trimestre_4_fim);
    
    // Verificar se a data está dentro de algum trimestre
    if (dataObj >= trim1Inicio && dataObj <= trim1Fim) {
      return { trimestre: '1', al: config.al };
    } else if (dataObj >= trim2Inicio && dataObj <= trim2Fim) {
      return { trimestre: '2', al: config.al };
    } else if (dataObj >= trim3Inicio && dataObj <= trim3Fim) {
      return { trimestre: '3', al: config.al };
    } else if (dataObj >= trim4Inicio && dataObj <= trim4Fim) {
      return { trimestre: '4', al: config.al };
    }
    
    return null; // Data não está em nenhum trimestre da configuração ativa
  } catch (error) {
    console.error('Erro ao determinar trimestre da data:', error);
    return null;
  }
}

/**
 * Verifica se uma data está no trimestre vigente (trimestre atual)
 * @param {Date|string} data - Data a verificar
 * @return {Object} {noTrimestreVigente: boolean, trimestre: string|null, al: string|null, mensagem: string}
 */
async function verificarSeNoTrimestreVigente(data) {
  try {
    const config = await buscarConfiguracaoAtiva();
    if (!config) {
      return {
        noTrimestreVigente: true, // Se não há configuração, permite (compatibilidade)
        trimestre: null,
        al: null,
        mensagem: 'Nenhuma configuração ativa encontrada'
      };
    }
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    // Determinar trimestre atual
    const trimestreAtual = await determinarTrimestreDaData(hoje, config);
    if (!trimestreAtual) {
      return {
        noTrimestreVigente: true, // Se não está em nenhum trimestre, permite (compatibilidade)
        trimestre: null,
        al: null,
        mensagem: 'Data atual não está em nenhum trimestre configurado'
      };
    }

    // Determinar trimestre da data fornecida
    const trimestreData = await determinarTrimestreDaData(data, config);
    if (!trimestreData) {
      return {
        noTrimestreVigente: false,
        trimestre: null,
        al: null,
        mensagem: 'A data fornecida não está em nenhum trimestre da configuração ativa'
      };
    }
    
    // Verificar se está no mesmo trimestre e AL
    const noTrimestreVigente = 
      trimestreData.trimestre === trimestreAtual.trimestre && 
      trimestreData.al === trimestreAtual.al;
    
    return {
      noTrimestreVigente: noTrimestreVigente,
      trimestre: trimestreData.trimestre,
      al: trimestreData.al,
      trimestreAtual: trimestreAtual.trimestre,
      alAtual: trimestreAtual.al,
      mensagem: noTrimestreVigente 
        ? `A data está no ${trimestreData.trimestre}º Trimestre vigente (${trimestreData.al})`
        : `A data está no ${trimestreData.trimestre}º Trimestre (${trimestreData.al}), mas o trimestre vigente é o ${trimestreAtual.trimestre}º Trimestre (${trimestreAtual.al})`
    };
  } catch (error) {
    console.error('Erro ao verificar trimestre vigente:', error);
    return {
      noTrimestreVigente: true, // Em caso de erro, permite (compatibilidade)
      trimestre: null,
      al: null,
      mensagem: 'Erro ao verificar trimestre vigente: ' + error.message
    };
  }
}

/**
 * Criar solicitação de alteração
 * @param {Object} dados - Dados da solicitação
 * @return {Object} Resultado da operação
 */
async function criarSolicitacaoAlteracao(dados) {
  try {
    return await portalCriarSolicitacaoAlteracao(dados);
  } catch (error) {
    console.error('Erro ao criar solicitação de alteração:', error);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

/**
 * Verificar e processar alteração com aprovação se necessário
 * @param {string} tipo - 'edicao', 'inclusao', 'exclusao'
 * @param {string} tipoItem - 'atividade', 'campanha'
 * @param {string} clube - Nome do clube
 * @param {string} itemId - ID do item
 * @param {Object} dadosAnteriores - Dados originais (para edição/exclusão)
 * @param {Object} dadosNovos - Novos dados (para edição/inclusão)
 * @param {string} usuarioEmail - Email do usuário
 * @param {Function} callbackDireto - Função a executar se estiver no trimestre vigente
 * @return {Object} Resultado da operação
 */
async function verificarEProcessarAlteracao(tipo, tipoItem, clube, itemId, dadosAnteriores, dadosNovos, usuarioEmail, callbackDireto) {
  try {
    // Determinar a data da atividade/campanha
    let dataItem = null;

    if (tipo === 'edicao' || tipo === 'exclusao') {
      // Para edição/exclusão, usar a data original
      if (dadosAnteriores) {
        dataItem = dadosAnteriores.dataInicio || dadosAnteriores.dataHoraInicio || dadosAnteriores.data_registro;
      }
    } else if (tipo === 'inclusao') {
      // Para inclusão, usar a data nova
      if (dadosNovos) {
        dataItem = dadosNovos.dataInicio || dadosNovos.dataHoraInicio || new Date().toISOString();
      }
    }

    if (!dataItem) {
      // Se não conseguiu determinar a data, permite a alteração diretamente
      console.warn('Não foi possível determinar a data do item, permitindo alteração direta');
      return await callbackDireto();
    }

    // Verificar se está no trimestre vigente
    const verificacao = await verificarSeNoTrimestreVigente(dataItem);

    if (verificacao.noTrimestreVigente) {
      // Está no trimestre vigente, permite alteração direta
      return await callbackDireto();
    }

    // Não está no trimestre vigente, criar solicitação
    const trimestreInfo = await determinarTrimestreDaData(dataItem);
    const trimestreTexto = trimestreInfo ? `${trimestreInfo.trimestre}º Trimestre` : 'Trimestre desconhecido';
    const alTexto = trimestreInfo ? trimestreInfo.al : 'AL desconhecido';

    return {
      sucesso: false,
      requerAprovacao: true,
      mensagem: `Esta ${tipoItem} está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. É necessária aprovação da Secretaria Distrital.`,
      trimestre: trimestreInfo ? trimestreInfo.trimestre : null,
      al: trimestreInfo ? trimestreInfo.al : null
    };

  } catch (error) {
    console.error('Erro ao verificar e processar alteração:', error);
    // Em caso de erro, permite a alteração (compatibilidade)
    return await callbackDireto();
  }
}

/**
 * Processar solicitação aprovada (executar a alteração)
 * @param {string} solicitacaoId - ID da solicitação
 * @return {Object} Resultado da operação
 */
async function processarSolicitacaoAprovada(solicitacaoId) {
  try {
    const solicitacao = await portalBuscarSolicitacaoPorId(solicitacaoId);
    if (!solicitacao) {
      return { sucesso: false, erro: 'Solicitação não encontrada' };
    }
    
    if (solicitacao.status !== 'aprovada') {
      return { sucesso: false, erro: 'Solicitação não está aprovada' };
    }
    
    // Executar a alteração baseada no tipo
    if (solicitacao.tipo === 'edicao') {
      if (solicitacao.tipo_item === 'atividade') {
        const resultado = await editarAtividade(
          solicitacao.clube_nome,
          solicitacao.item_id,
          solicitacao.dados_novos
        );
        return resultado;
      } else if (solicitacao.tipo_item === 'campanha') {
        const resultado = await editarCampanha(
          solicitacao.clube_nome,
          solicitacao.item_id,
          solicitacao.dados_novos
        );
        return resultado;
      } else if (solicitacao.tipo_item === 'pessoa') {
        const resultado = await editarPessoaRTMA(
          solicitacao.clube_nome,
          solicitacao.item_id,
          solicitacao.dados_novos
        );
        return resultado;
      }
    } else if (solicitacao.tipo === 'inclusao') {
      if (solicitacao.tipo_item === 'atividade') {
        // Normalizar dados antes de enviar para o Supabase
        // Os dados vêm do frontend e podem ter arrays que precisam ser convertidos
        const dadosNormalizados = Object.assign({}, solicitacao.dados_novos);
        
        // CORRIGIDO: Converter TODOS os arrays de participantes para strings
        // O registrarAtividade espera arrays, mas se vierem como strings do frontend, manter como strings
        // Se vierem como arrays, converter para strings separadas por vírgula
        if (Array.isArray(dadosNormalizados.presentes)) {
          dadosNormalizados.presentes = dadosNormalizados.presentes.join(", ");
        } else if (typeof dadosNormalizados.presentes === 'string') {
          // Já é string, manter
        } else {
          dadosNormalizados.presentes = '';
        }
        
        if (Array.isArray(dadosNormalizados.preLeos)) {
          dadosNormalizados.preLeos = dadosNormalizados.preLeos.join(", ");
        } else if (typeof dadosNormalizados.preLeos === 'string') {
          // Já é string, manter
        } else {
          dadosNormalizados.preLeos = '';
        }
        
        if (Array.isArray(dadosNormalizados.leoLeao)) {
          dadosNormalizados.leoLeao = dadosNormalizados.leoLeao.join(", ");
        } else if (typeof dadosNormalizados.leoLeao === 'string') {
          // Já é string, manter
        } else {
          dadosNormalizados.leoLeao = '';
        }
        
        if (Array.isArray(dadosNormalizados.amigosConselheiros)) {
          dadosNormalizados.amigosConselheiros = dadosNormalizados.amigosConselheiros.join(", ");
        } else if (typeof dadosNormalizados.amigosConselheiros === 'string') {
          // Já é string, manter
        } else {
          dadosNormalizados.amigosConselheiros = '';
        }
        
        // Garantir que os campos de participantes estejam presentes
        dadosNormalizados.associadosPresentes = dadosNormalizados.presentes || '';
        dadosNormalizados.preLeosPresentes = dadosNormalizados.preLeos || '';
        dadosNormalizados.leoLeaoPresentes = dadosNormalizados.leoLeao || '';
        dadosNormalizados.amigosConselheirosPresentes = dadosNormalizados.amigosConselheiros || '';
        
        // Garantir que dataHoraInicio seja mapeada para dataInicio
        if (dadosNormalizados.dataHoraInicio && !dadosNormalizados.dataInicio) {
          dadosNormalizados.dataInicio = dadosNormalizados.dataHoraInicio;
        }
        
        if (dadosNormalizados.dataHoraFim && !dadosNormalizados.dataFim) {
          dadosNormalizados.dataFim = dadosNormalizados.dataHoraFim;
        }
        
        // CORRIGIDO: Se há idTemporarioUpload, buscar URL da foto do Supabase Storage
        if (dadosNormalizados.idTemporarioUpload && !dadosNormalizados.linkFotoOficial) {
          const urlFoto = await obterUrlFotoPorRegistroId(
            dadosNormalizados.idTemporarioUpload,
            dadosNormalizados.clube,
            'FOTOS_OFICIAIS_ATIVIDADES'
          );
          if (urlFoto) {
            dadosNormalizados.linkFotoOficial = urlFoto;
          } else {
            console.warn('⚠️ Não foi possível obter URL da foto pelo idTemporarioUpload:', dadosNormalizados.idTemporarioUpload);
          }
        }
        
        // Garantir que linkFotoOficial seja preservado se já estiver presente
        if (dadosNormalizados.linkFotoOficial) {
          console.log('✅ linkFotoOficial preservado nos dados normalizados:', dadosNormalizados.linkFotoOficial);
        }
        
        // CORRIGIDO: Verificar se já existe uma atividade com o mesmo ID antes de criar (evitar duplicidade)
        if (dadosNormalizados.id) {
          const atividadeExistente = await getAtividadePorId(dadosNormalizados.clube, dadosNormalizados.id);
          if (atividadeExistente) {
            console.warn('⚠️ Atividade com ID já existe, atualizando em vez de criar:', dadosNormalizados.id);
            // Se já existe, fazer update em vez de insert
            const resultado = await editarAtividade(dadosNormalizados.clube, dadosNormalizados.id, dadosNormalizados);
            return resultado;
          }
        }

        // Usar registrarAtividade para garantir normalização completa
        const resultado = await registrarAtividade(dadosNormalizados);
        
        // Se houve sucesso e há idTemporarioUpload, atualizar referência do arquivo
        if (resultado.sucesso && resultado.registroId && dadosNormalizados.idTemporarioUpload) {
          atualizarReferenciaArquivo(
            dadosNormalizados.idTemporarioUpload,
            resultado.registroId,
            dadosNormalizados.clube,
            'FOTOS_OFICIAIS_ATIVIDADES'
          );
        }
        
        return resultado;
      } else if (solicitacao.tipo_item === 'campanha') {
        // Função de criar campanha (precisa ser implementada)
        await portalUpsertCampanha(solicitacao.dados_novos);
        return { sucesso: true };
      } else if (solicitacao.tipo_item === 'pessoa') {
        const resultado = await criarPessoaRTMA(
          solicitacao.clube_nome,
          solicitacao.dados_novos
        );
        return resultado;
      }
    } else if (solicitacao.tipo === 'exclusao') {
      if (solicitacao.tipo_item === 'atividade') {
        const resultado = await deletarAtividade(
          solicitacao.clube_nome,
          solicitacao.item_id
        );
        return resultado;
      } else if (solicitacao.tipo_item === 'campanha') {
        const resultado = await deletarCampanha(
          solicitacao.clube_nome,
          solicitacao.item_id
        );
        return resultado;
      }
    }
    
    return { sucesso: false, erro: 'Tipo de solicitação não suportado' };
  } catch (error) {
    console.error('Erro ao processar solicitação aprovada:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Listar solicitações de alteração
 * @param {string} status - Status a filtrar (opcional)
 * @return {Object} Resultado com lista de solicitações
 */
async function listarSolicitacoesAlteracao(status = null) {
  try {
    const solicitacoes = await portalListarSolicitacoesAlteracao(status);
    return {
      sucesso: true,
      solicitacoes: solicitacoes
    };
  } catch (error) {
    console.error('Erro ao listar solicitações:', error);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

async function listarSolicitacoesAlteracaoPorClube(clubeNome) {
  try {
    const solicitacoes = await portalListarSolicitacoesAlteracaoPorClube(clubeNome);
    return {
      sucesso: true,
      solicitacoes: solicitacoes
    };
  } catch (error) {
    console.error('Erro ao listar solicitações do clube:', error);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

/**
 * Aprovar solicitação de alteração
 * @param {string} solicitacaoId - ID da solicitação
 * @param {string} observacoes - Observações da aprovação
 * @return {Object} Resultado da operação
 */
async function aprovarSolicitacaoAlteracao(solicitacaoId, usuarioEmail, observacoes = '') {
  try {
    const solicitacao = await portalBuscarSolicitacaoPorId(solicitacaoId);
    if (!solicitacao) {
      return { sucesso: false, erro: 'Solicitação não encontrada' };
    }

    if (solicitacao.tipo === 'troca') {
      const processamento = await processarTrocaInscricaoSolicitacao(solicitacao);
      if (!processamento || !processamento.sucesso) {
        return processamento || { sucesso: false, erro: 'Erro ao processar troca' };
      }
      return await portalAprovarSolicitacaoAlteracao(solicitacaoId, usuarioEmail, observacoes);
    }

    if (solicitacao.tipo === 'transferencia') {
      const processamento = await processarTransferenciaPessoaSolicitacao(solicitacao);
      if (!processamento || !processamento.sucesso) {
        return processamento || { sucesso: false, erro: 'Erro ao processar transferência' };
      }
      return await portalAprovarSolicitacaoAlteracao(solicitacaoId, usuarioEmail, observacoes);
    }

    // Aprovar no banco
    const resultado = await portalAprovarSolicitacaoAlteracao(solicitacaoId, usuarioEmail, observacoes);

    if (resultado.sucesso) {
      // Processar a solicitação aprovada (executar a alteração)
      const processamento = await processarSolicitacaoAprovada(solicitacaoId);
      return processamento;
    }

    return resultado;
  } catch (error) {
    console.error('Erro ao aprovar solicitação:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Rejeitar solicitação de alteração
 * @param {string} solicitacaoId - ID da solicitação
 * @param {string} usuarioEmail - Email do usuário que está rejeitando
 * @param {string} observacoes - Observações da rejeição
 * @return {Object} Resultado da operação
 */
async function rejeitarSolicitacaoAlteracao(solicitacaoId, usuarioEmail, observacoes = '') {
  try {
    return await portalRejeitarSolicitacaoAlteracao(solicitacaoId, usuarioEmail, observacoes);
  } catch (error) {
    console.error('Erro ao rejeitar solicitação:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Buscar solicitação por ID
 * @param {string} solicitacaoId - ID da solicitação
 * @return {Object|null} Solicitação encontrada ou null
 */
async function buscarSolicitacaoPorId(solicitacaoId) {
  try {
    return await portalBuscarSolicitacaoPorId(solicitacaoId);
  } catch (error) {
    console.error('Erro ao buscar solicitação:', error);
    return null;
  }
}

/**
 * Criar solicitação de alteração (função exposta para frontend)
 * @param {Object} dados - Dados da solicitação
 * @return {Object} Resultado da operação
 */
async function criarSolicitacaoAlteracao(dados) {
  try {
    return await portalCriarSolicitacaoAlteracao(dados);
  } catch (error) {
    console.error('Erro ao criar solicitação:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Obter trimestre atual baseado na data de hoje (função exposta para frontend)
 * @return {Object} {sucesso: true, dados: {trimestre: string, al: string}} ou {sucesso: false, erro: string}
 */
async function obterTrimestreAtualWrapper() {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const trimestreInfo = await determinarTrimestreDaData(hoje);
    
    if (!trimestreInfo) {
      return {
        sucesso: false,
        erro: 'Não foi possível determinar o trimestre atual. Verifique se há uma configuração ativa.'
      };
    }
    
    return {
      sucesso: true,
      dados: {
        trimestre: trimestreInfo.trimestre,
        al: trimestreInfo.al
      }
    };
  } catch (error) {
    console.error('Erro ao obter trimestre atual:', error);
    return {
      sucesso: false,
      erro: error.message || 'Erro desconhecido ao obter trimestre atual'
    };
  }
}

/**
 * Obter datas de um trimestre para o relatório DM (função exposta para frontend)
 * @param {string} trimestre - '1', '2', '3' ou '4'
 * @return {Object} {sucesso: true, dados: {dataInicio: string, dataFim: string, al: string}} ou {sucesso: false, erro: string}
 */
async function obterDatasTrimestreParaDMWrapper(trimestre) {
  try {
    const resultado = await obterDatasTrimestreParaDM(trimestre);
    if (!resultado) {
      return {
        sucesso: false,
        erro: 'Não foi possível obter as datas do trimestre. Verifique se há uma configuração ativa.'
      };
    }
    return {
      sucesso: true,
      dados: resultado
    };
  } catch (error) {
    console.error('Erro ao obter datas do trimestre para DM:', error);
    return {
      sucesso: false,
      erro: error.message || 'Erro desconhecido ao obter datas do trimestre'
    };
  }
}

/**
 * Calcular resumo DM com filtros do dashboard (função exposta para frontend)
 * @param {string} dataInicioPeriodo - Data de início do período (DD/MM/AAAA)
 * @param {string} dataFimPeriodo - Data de fim do período (DD/MM/AAAA)
 * @return {Object} Dados do resumo DM no formato {sucesso: true, dados: {...}}
 */
/**
 * Wrapper para obter todos os clubes do RTMA
 * @return {Array} Array de nomes de clubes
 */
function obterTodosClubesRTMA() {
  try {
    if (typeof rtmaConfig.rtmaObterTodosClubes === 'function') {
      return rtmaConfig.rtmaObterTodosClubes();
    }
    // Fallback: retornar clubes das regiões manualmente
    const todosClubes = [];
    if (typeof RTMA_REGIOES !== 'undefined') {
      Object.values(RTMA_REGIOES).forEach(clubes => {
        todosClubes.push(...clubes);
      });
    }
    return todosClubes;
  } catch (error) {
    console.error('Erro ao obter todos os clubes:', error);
    return [];
  }
}

async function calcularResumoDMComFiltrosDashboardWrapper(dataInicioPeriodo, dataFimPeriodo) {
  try {
    if (typeof rtmaPessoas.calcularResumoDMComFiltrosDashboard !== 'function') {
      console.error('Função calcularResumoDMComFiltrosDashboard não encontrada no escopo');
      return {
        sucesso: false,
        erro: 'Função não encontrada',
        dados: {
          dadosPorClube: [],
          totalGeral: {
            totalInicio: 0,
            inclusoes: 0,
            exclusoes: 0,
            totalFim: 0
          }
        }
      };
    }

    const resultado = await rtmaPessoas.calcularResumoDMComFiltrosDashboard(dataInicioPeriodo, dataFimPeriodo);
    
    // Verificar se o resultado já está no formato esperado (com sucesso)
    if (resultado && resultado.sucesso !== undefined) {
      return resultado;
    }
    
    // Se não está no formato esperado, envolver no formato padrão
    if (resultado && resultado.totalGeral && Array.isArray(resultado.dadosPorClube)) {
      return {
        sucesso: true,
        dados: {
          totalGeral: resultado.totalGeral,
          dadosPorClube: resultado.dadosPorClube,
          periodo: resultado.periodo || {
            inicio: dataInicioPeriodo,
            fim: dataFimPeriodo
          }
        }
      };
    }
    
    // Se o resultado está vazio ou inválido
    console.error('Resultado inválido do calcularResumoDMComFiltrosDashboard:', resultado);
    return {
      sucesso: false,
      erro: 'Resultado inválido',
      dados: {
        dadosPorClube: [],
        totalGeral: {
          totalInicio: 0,
          inclusoes: 0,
          exclusoes: 0,
          totalFim: 0
        }
      }
    };
  } catch (error) {
    console.error('Erro ao calcular resumo DM:', error);
    return {
      sucesso: false,
      erro: error.message,
      dados: {
        dadosPorClube: [],
        totalGeral: {
          totalInicio: 0,
          inclusoes: 0,
          exclusoes: 0,
          totalFim: 0
        }
      }
    };
  }
}

/**
 * Criar pessoa RTMA com verificação de trimestre
 * @param {string} clube - Nome do clube
 * @param {Object} dados - Dados da pessoa
 * @param {string} usuarioEmail - Email do usuário
 * @param {string} justificativa - Justificativa (se requer aprovação)
 * @return {Object} Resultado da operação
 */
async function criarPessoaComVerificacao(clube, dados, usuarioEmail, justificativa = '') {
  try {
    // Verificar datas relevantes: associadoDesde e dataInicioPreLeo
    const dataAssociadoDesde = dados.associadoDesde || null;
    const dataInicioPreLeo = dados.dataInicioPreLeo || null;

    // Determinar qual data usar para verificação (priorizar associadoDesde)
    let dataParaVerificar = dataAssociadoDesde || dataInicioPreLeo;

    if (!dataParaVerificar) {
      // Se não tem nenhuma das datas, permitir criação direta (pode ser um erro, mas não bloqueamos)
      console.warn('Pessoa criada sem data de posse ou início pré LEO');
      return await criarPessoaRTMA(clube, dados);
    }

    // Verificar se está no trimestre vigente
    const verificacao = await verificarSeNoTrimestreVigente(dataParaVerificar);

    if (!verificacao.noTrimestreVigente) {
      // Não está no trimestre vigente
      let trimestreInfo = await determinarTrimestreDaData(dataParaVerificar);
      
      const trimestreTexto = trimestreInfo ? `${trimestreInfo.trimestre}º Trimestre` : 'Trimestre desconhecido';
      const alTexto = trimestreInfo ? trimestreInfo.al : 'AL desconhecido';
      
      // Se não tem justificativa, retornar que requer aprovação (para mostrar modal)
      if (!justificativa || justificativa.trim() === '') {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `A data de ${dataAssociadoDesde ? 'posse no clube' : 'início como Pré LEO'} está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. É necessária aprovação da Secretaria Distrital.`,
          trimestre: trimestreInfo ? trimestreInfo.trimestre : null,
          al: trimestreInfo ? trimestreInfo.al : null
        };
      }
      
      // Se tem justificativa, criar solicitação
      const dadosSolicitacao = {
        tipo: 'inclusao',
        tipoItem: 'pessoa',
        itemId: null, // Ainda não tem ID, será gerado após aprovação
        clubeNome: clube,
        usuarioEmail: usuarioEmail,
        trimestreSolicitado: trimestreTexto,
        alSolicitado: alTexto,
        justificativa: justificativa,
        dadosAnteriores: null,
        dadosNovos: dados
      };

      const resultado = await criarSolicitacaoAlteracao(dadosSolicitacao);
      
      if (resultado.sucesso) {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `A data de ${dataAssociadoDesde ? 'posse no clube' : 'início como Pré LEO'} está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. Sua solicitação de inclusão foi enviada para aprovação da Secretaria Distrital.`,
          solicitacaoId: resultado.id
        };
      } else {
        return {
          sucesso: false,
          erro: 'Erro ao criar solicitação de alteração: ' + (resultado.erro || 'Erro desconhecido')
        };
      }
    }
    
    // Está no trimestre vigente, permitir criação direta
    return await criarPessoaRTMA(clube, dados);

  } catch (error) {
    console.error('Erro ao criar pessoa com verificação:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Editar pessoa RTMA com verificação de trimestre
 * @param {string} clube - Nome do clube
 * @param {string} pessoaId - ID da pessoa
 * @param {Object} dados - Novos dados da pessoa
 * @param {string} usuarioEmail - Email do usuário
 * @param {string} justificativa - Justificativa (se requer aprovação)
 * @return {Object} Resultado da operação
 */
async function editarPessoaComVerificacao(clube, pessoaId, dados, usuarioEmail, justificativa = '') {
  try {
    // Buscar pessoa original para comparar datas
    const pessoaOriginal = await buscarPessoaPorIdRTMA(clube, pessoaId);
    if (!pessoaOriginal) {
      return { sucesso: false, erro: 'Pessoa não encontrada' };
    }
    
    // Verificar se está editando datas relevantes
    const dataAssociadoDesdeOriginal = pessoaOriginal.associadoDesde || null;
    const dataInicioPreLeoOriginal = pessoaOriginal.dataInicioPreLeo || null;
    const dataDesligamentoOriginal = pessoaOriginal.dataDesligamento || null;
    
    const dataAssociadoDesdeNova = dados.associadoDesde !== undefined ? dados.associadoDesde : dataAssociadoDesdeOriginal;
    const dataInicioPreLeoNova = dados.dataInicioPreLeo !== undefined ? dados.dataInicioPreLeo : dataInicioPreLeoOriginal;
    const dataDesligamentoNova = dados.dataDesligamento !== undefined ? dados.dataDesligamento : dataDesligamentoOriginal;
    
    // Verificar se as datas mudaram
    const associadoDesdeMudou = dataAssociadoDesdeOriginal !== dataAssociadoDesdeNova;
    const dataInicioPreLeoMudou = dataInicioPreLeoOriginal !== dataInicioPreLeoNova;
    const dataDesligamentoMudou = dataDesligamentoOriginal !== dataDesligamentoNova;
    
    if (!associadoDesdeMudou && !dataInicioPreLeoMudou && !dataDesligamentoMudou) {
      // Datas não mudaram, permitir edição direta (outros campos podem ser editados livremente)
      return await editarPessoaRTMA(clube, pessoaId, dados);
    }
    
    // Se mudou alguma data, verificar se está no trimestre vigente
    // Usar a data nova para verificação
    const dataParaVerificar = dataDesligamentoMudou
      ? dataDesligamentoNova
      : (dataAssociadoDesdeNova || dataInicioPreLeoNova);
    
    if (!dataParaVerificar) {
      // Se removeu as datas, permitir (pode ser um erro, mas não bloqueamos)
      console.warn('Pessoa editada removendo data de posse ou início pré LEO');
      return await editarPessoaRTMA(clube, pessoaId, dados);
    }

    // Verificar se está no trimestre vigente
    const verificacao = await verificarSeNoTrimestreVigente(dataParaVerificar);

    if (!verificacao.noTrimestreVigente) {
      // Não está no trimestre vigente
      let trimestreInfo = await determinarTrimestreDaData(dataParaVerificar);
      
      const trimestreTexto = trimestreInfo ? `${trimestreInfo.trimestre}º Trimestre` : 'Trimestre desconhecido';
      const alTexto = trimestreInfo ? trimestreInfo.al : 'AL desconhecido';
      
      // Se não tem justificativa, retornar que requer aprovação (para mostrar modal)
      if (!justificativa || justificativa.trim() === '') {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `A nova data de ${dataDesligamentoMudou ? 'desligamento' : (dataAssociadoDesdeNova ? 'posse no clube' : 'início como Pré LEO')} está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. É necessária aprovação da Secretaria Distrital.`,
          trimestre: trimestreInfo ? trimestreInfo.trimestre : null,
          al: trimestreInfo ? trimestreInfo.al : null
        };
      }
      
      // Se tem justificativa, criar solicitação
      const dadosSolicitacao = {
        tipo: 'edicao',
        tipoItem: 'pessoa',
        itemId: pessoaId,
        clubeNome: clube,
        usuarioEmail: usuarioEmail,
        trimestreSolicitado: trimestreTexto,
        alSolicitado: alTexto,
        justificativa: justificativa,
        dadosAnteriores: pessoaOriginal,
        dadosNovos: dados
      };

      const resultado = await criarSolicitacaoAlteracao(dadosSolicitacao);
      
      if (resultado.sucesso) {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `A nova data de ${dataDesligamentoMudou ? 'desligamento' : (dataAssociadoDesdeNova ? 'posse no clube' : 'início como Pré LEO')} está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. Sua solicitação de edição foi enviada para aprovação da Secretaria Distrital.`,
          solicitacaoId: resultado.id
        };
      } else {
        return {
          sucesso: false,
          erro: 'Erro ao criar solicitação de alteração: ' + (resultado.erro || 'Erro desconhecido')
        };
      }
    }
    
    // Está no trimestre vigente, permitir edição direta
    return await editarPessoaRTMA(clube, pessoaId, dados);

  } catch (error) {
    console.error('Erro ao editar pessoa com verificação:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Desligar pessoa RTMA com verificação de trimestre
 * @param {string} clube - Nome do clube
 * @param {string} pessoaId - ID da pessoa
 * @param {string} dataDesligamento - Data de desligamento
 * @param {string} usuarioEmail - Email do usuário
 * @param {string} justificativa - Justificativa (se requer aprovação)
 * @return {Object} Resultado da operação
 */
async function desligarPessoaComVerificacao(clube, pessoaId, dataDesligamento, usuarioEmail, justificativa = '') {
  try {
    if (!dataDesligamento) {
      return { sucesso: false, erro: 'Data de desligamento não informada' };
    }

    const pessoaOriginal = await buscarPessoaPorIdRTMA(clube, pessoaId);
    if (!pessoaOriginal) {
      return { sucesso: false, erro: 'Pessoa não encontrada' };
    }

    const verificacao = await verificarSeNoTrimestreVigente(dataDesligamento);
    if (!verificacao.noTrimestreVigente) {
      const trimestreInfo = await determinarTrimestreDaData(dataDesligamento);
      const trimestreTexto = trimestreInfo ? `${trimestreInfo.trimestre}º Trimestre` : 'Trimestre desconhecido';
      const alTexto = trimestreInfo ? trimestreInfo.al : 'AL desconhecido';

      if (!justificativa || justificativa.trim() === '') {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `A data de desligamento está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. É necessária aprovação da Secretaria Distrital.`,
          trimestre: trimestreInfo ? trimestreInfo.trimestre : null,
          al: trimestreInfo ? trimestreInfo.al : null
        };
      }

      const dadosSolicitacao = {
        tipo: 'exclusao',
        tipoItem: 'pessoa',
        itemId: pessoaId,
        clubeNome: clube,
        usuarioEmail: usuarioEmail,
        trimestreSolicitado: trimestreTexto,
        alSolicitado: alTexto,
        justificativa: justificativa,
        dadosAnteriores: pessoaOriginal,
        dadosNovos: { status: 'Inativo', dataDesligamento: dataDesligamento }
      };

      const resultado = await criarSolicitacaoAlteracao(dadosSolicitacao);
      if (resultado.sucesso) {
        return {
          sucesso: false,
          requerAprovacao: true,
          mensagem: `A data de desligamento está no ${trimestreTexto} (${alTexto}), que não é o trimestre vigente. Sua solicitação de exclusão foi enviada para aprovação da Secretaria Distrital.`,
          solicitacaoId: resultado.id
        };
      }
      return { sucesso: false, erro: 'Erro ao criar solicitação de alteração: ' + (resultado.erro || 'Erro desconhecido') };
    }

    return await desligarPessoaRTMA(clube, pessoaId, dataDesligamento);
  } catch (error) {
    console.error('Erro ao desligar pessoa com verificação:', error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Buscar pessoa por ID no RTMA
 * @param {string} clube - Nome do clube
 * @param {string} pessoaId - ID da pessoa
 * @return {Object|null} Dados da pessoa ou null se não encontrada
 */
async function buscarPessoaPorIdRTMA(clube, pessoaId) {
  try {
    // Verificar se é UUID (Supabase) ou número de linha (planilha)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pessoaId);

    // Usar Supabase se configurado e se o ID for UUID
    if ((typeof RTMA_USAR_SUPABASE !== 'undefined' && RTMA_USAR_SUPABASE === true) || isUUID) {
      // Buscar no Supabase usando função do rtma_supabase.js
      if (typeof buscarPessoasDoSupabase === 'function') {
        const pessoas = await buscarPessoasDoSupabase(clube);
        if (pessoas && pessoas.sucesso && pessoas.dados) {
          const pessoa = pessoas.dados.find(p => p.id === pessoaId);
          return pessoa || null;
        }
        if (Array.isArray(pessoas)) {
          const pessoa = pessoas.find(p => p.id === pessoaId);
          if (pessoa) return pessoa;
        }
      }
      // Fallback: buscar diretamente por ID (sem filtrar por clube)
      if (isUUID && typeof buscarPessoaPorIdSupabase === 'function') {
        const pessoa = await buscarPessoaPorIdSupabase(pessoaId);
        if (pessoa) return pessoa;
      }
      return null;
    }

    // Código legado para planilhas - usar função buscarPessoasRTMA que já existe
    if (typeof buscarPessoasRTMA === 'function') {
      const todasPessoas = await buscarPessoasRTMA(clube);
      const pessoa = todasPessoas.find(p => p.id === pessoaId || p.id === parseInt(pessoaId));
      if (pessoa) {
        return pessoa;
      }
    }
    
    return null;
    
  } catch (error) {
    console.error('Erro ao buscar pessoa por ID:', error);
    return null;
  }
}

// === AGENDA GOOGLE CALENDAR (RESUMO DASHBOARD) ===
/**
 * Lista os calendários Google a que o dono do script tem acesso (para seleção na agenda do portal).
 * @return {Array<{id: string, name: string}>}
 */
function listarCalendariosGoogle() {
  try {
    const calendars = CalendarApp.getAllCalendars();
    return (calendars || []).map(function(cal) {
      return {
        id: String(cal.getId()),
        name: String(cal.getName() || cal.getId())
      };
    });
  } catch (e) {
    console.error('listarCalendariosGoogle:', e);
    return [];
  }
}

/**
 * Lista eventos de um calendário em um período (para exibir na agenda do resumo).
 * @param {string} calendarId - ID do calendário (ex: xxx@group.calendar.google.com)
 * @param {string} dataInicio - YYYY-MM-DD
 * @param {string} dataFim - YYYY-MM-DD
 * @return {Array<{titulo: string, inicio: string, fim: string, allDay: boolean}>}
 */
function listarEventosCalendario(calendarId, dataInicio, dataFim) {
  try {
    if (!calendarId || !dataInicio || !dataFim) return [];
    const cal = CalendarApp.getCalendarById(calendarId);
    if (!cal) return [];
    const start = new Date(dataInicio + 'T00:00:00');
    const end = new Date(dataFim + 'T23:59:59');
    const events = cal.getEvents(start, end);
    return (events || []).map(function(ev) {
      const allDay = ev.isAllDayEvent();
      const inicio = ev.getStartTime();
      const fim = ev.getEndTime();
      function fmt(d) {
        var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
        if (allDay) return day + '/' + m + '/' + y;
        var h = String(d.getHours()).padStart(2, '0'), min = String(d.getMinutes()).padStart(2, '0');
        return day + '/' + m + '/' + y + ' ' + h + ':' + min;
      }
      return {
        titulo: String(ev.getTitle() || 'Sem título'),
        inicio: fmt(inicio),
        fim: fmt(fim),
        allDay: allDay
      };
    });
  } catch (e) {
    console.error('listarEventosCalendario:', e);
    return [];
  }
}

// ─── Event-staff token actions ─────────────────────────────────────────────
// validarAcessoStaffEvento: PUBLIC action — scanner/camisas pages can call this before
// showing the UI to confirm their URL token is valid. Returns no data beyond validity.
async function validarAcessoStaffEvento(eventoId, token) {
  try {
    const { validEventStaffToken } = require('./event-staff-auth');
    return { sucesso: validEventStaffToken(eventoId, token) };
  } catch (e) {
    return { sucesso: false };
  }
}

// obterLinkAcessoStaffEvento: JWT-protected admin action.
// Call it with an eventoId to get a shareable scanner/camisas link bearing the HMAC token.
async function obterLinkAcessoStaffEvento(eventoId) {
  if (!eventoId) return { sucesso: false, erro: 'eventoId obrigatório' };
  try {
    const { computeEventStaffToken } = require('./event-staff-auth');
    const token = computeEventStaffToken(String(eventoId));
    const id = encodeURIComponent(String(eventoId));
    return {
      sucesso: true,
      tokenScanner: token,
      linkScanner: '/scanner?evento=' + id + '&token=' + token,
      linkCamisas: '/camisas?evento=' + id + '&token=' + token,
    };
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }
}

module.exports = {
  obterServiceRoleKeySupabaseUnificado,
  buscarTodosDirigentes,
  buscarDirigentesNominataGabineteOuDistrito,
  rtmaBuscarMapaClubeOrigemPorVinculosNominata_,
  listarCargosNominataPorAL,
  listarCalendariosGoogle,
  listarEventosCalendarioGoogle,
  listarCalendariosParaAgenda,
  adicionarCalendarioUsuario,
  removerCalendarioUsuario,
  listarEventosAgendasUsuario,
  listarClubesParaDirigenteGabinete,
  listarPessoasParaDirigenteGabinete,
  listarPessoasParaNominataClube,
  buscarNomesPorClube,
  uploadFotoDirigenteParaSupabase,
  normalizarVinculoDirigente,
  salvarDirigente,
  editarDirigente,
  removerDirigente,
  testarSistemaCampanhasCompleto,
  validarSistemaComentarios,
  validarEstruturaCampanhasCompleta,
  verificarAutenticacao,
  verificarLogin,
  obterAlAtual,
  buscarEmailAmigoConselheiroPorId,
  buscarEmailPessoasPorId,
  buscarEmailPessoaRtmParaDirigente,
  buscarEmailNaNominataPorNome,
  buscarCargoNaNominata,
  determinarTipoAcessoPorCargo,
  gerarSenhaProvisoria,
  criarUsuarioAuthComSenhaProvisoria,
  enviarEmailSenhaProvisoria,
  enviarEmailAcessoNominataUsuarioExistente,
  upsertUsuariosAcessosAposNominata,
  excluirUsuarioAuthSupabase,
  revogarAcessoPortalAposExcluirNominata,
  provisionarAcessoPortalAposNominata,
  validarAcessoPorCargo,
  criarUsuarioComSenhaProvisoria,
  getAtividadePorId,
  deletarAtividadeComVerificacao,
  editarCampanhaComVerificacao,
  deletarCampanhaComVerificacao,
  registrarAtividadeComVerificacao,
  registrarCampanhaComVerificacao,
  deletarAtividade,
  editarAtividadeComVerificacao,
  editarAtividade,
  gerarIdUnico,
  gerarIdsAutomaticosAtividades,
  adicionarIdNovaAtividade,
  obterConfiguracaoRelatorio,
  definirArquivoRelatorio,
  obterAtividadesNaoReportadas,
  adicionarIdUnicoSeNecessario,
  validarIntegridadeUpload,
  portalNormalizarTextoBasico,
  portalUploadArquivoParaStorageLocal,
  uploadArquivo,
  obterUrlFotoPorRegistroId,
  portalBuscarArquivosCampanha,
  portalBuscarArquivosAtividade,
  atualizarReferenciaArquivo,
  testarCorrecoesUpload,
  migrarRegistrosExistentes,
  migrarCampanhasDoClube,
  migrarAtividadesDoClube,
  testarMigracaoIds,
  validarEstruturasPlanilhas,
  corrigirEstruturasPlanilhas,
  limparColunasExtras,
  migracaoEmergenciaEstruturaCampanhas,
  analisarConflitoColunaParceria,
  corrigirEstruturaCampanhasCompleta,
  analisarStatusCampanhas,
  limparIdsAntigos_EntidadeParceira,
  analisarEstruturasAtuais,
  analisarEstruturaCunhaPora,
  migrarEstruturaFormularioParaSistema,
  testarMigracaoClubePiloto,
  testarOrdenacaoCronologica,
  criarBackupCompleto,
  criarPastaBackupPrincipal,
  criarSubpastaBackup,
  fazerBackupCampanhas,
  fazerBackupAtividades,
  testarSistemaUnificado,
  testarVisaoGerencial,
  criarAcessoGerencial,
  filtrarDadosPorRegiao,
  analisarEstruturaReal,
  getDadosGerenciais,
  getClubes,
  getAssociadosLEO,
  getPreLeos,
  getLeoLeao,
  getAmigosConselheiros,
  contarAmigosLeoSelecionados,
  listarPessoasParaEventos,
  listarPessoasRTMAParaEventos,
  registrarInscricaoEventoComComprovante,
  isFormularioConvidadosAtivo,
  setFormularioConvidadosAtivo,
  setFormularioConvidadosHabilitadoEvento,
  obterInfoFormularioConvidado,
  obterUrlFormularioConvidados,
  getUrlScannerRefeicoes,
  obterSheetCamisas,
  normalizarNumeroCamisa,
  listarCamisasEnumeradas,
  salvarCamisaEnumerada,
  enviarComprovanteCamisaParaDrive,
  obterUrlFormularioCamisas,
  registrarInscricaoConvidadoExterno,
  registrarInscricoesEventoEmLoteInterno_,
  registrarInscricoesEventoEmLote,
  registrarInscricoesEventoEmLoteComForm,
  gerarRelatorioInscritosEventoExcel,
  excluirInscricoesEventoPorEnvio,
  editarLoteEnvioInscricoes,
  obterDetalhesEnvioEvento,
  atualizarInscricoesEnvioLotes,
  trocarInscricaoEvento,
  atualizarCargaRefeicoesPassaporte,
  atualizarCargaRefeicoesLotePassaporte,
  consumirRefeicaoPassaporte,
  validarSaldoRefeicaoPassaporte,
  obterCacheValidacaoAlimentacao,
  gerarAnexosPassaportes,
  enviarEmailResumoInscricoesEvento,
  criarRascunhoEmailPassaportesClube,
  solicitarPermissaoGmail,
  criarRascunhoEmailPassaportesClubeTeste,
  consumirRefeicoesPassaporteLote,
  credenciarInscricoesModalidadeLote,
  validarCredenciamentoPlenaria,
  credenciarPlenaria,
  credenciarPlenariaLote,
  listarCredenciadosPlenaria,
  removerCredenciamentoPlenaria,
  listarPastPresidentes,
  atualizarPastPresidente,
  salvarPastPresidente,
  removerPastPresidente,
  listarNomesPessoasClube,
  obterCachePlenaria,
  listarModalidades,
  criarModalidade,
  atualizarModalidade,
  excluirModalidade,
  listarModalidadesEvento,
  obterAptoEModalidadesPassaporte,
  listarCredenciadosModalidade,
  removerCredenciamentoModalidade,
  vincularModalidadeEvento,
  removerModalidadeEvento,
  listarBloqueiosModalidade,
  criarBloqueioModalidade,
  removerBloqueioModalidade,
  validarCredenciamentoModalidade,
  _normalizarNomeParaComparacao,
  _unificarSeparadoresCargoExcel,
  _obterMapaCargosNominataClubeAlMult,
  _obterMapaCargoNominataClube,
  _ehPreLeo,
  _ehApenasLeoLeao,
  _calcularIdadeEmData,
  _idadeEmData,
  obterCacheValidacaoCredenciamento,
  obterAptoACompetirInscricao,
  credenciarInscricaoModalidade,
  listarTrocasInscricaoEvento,
  listarTrocasPendentesPorClube,
  processarTrocaInscricaoSolicitacao,
  processarTransferenciaPessoaSolicitacao,
  criarSolicitacaoTransferenciaPessoa,
  listarTransferenciasPendentesPorClube,
  adicionarComprovanteEnvio,
  uploadFotoEvento,
  excluirComprovanteEnvio,
  excluirEnvioEvento,
  migrarEnviosEventos,
  gerarRelatorioInscritosEventoDados,
  getEventoDataCorteCompetidores,
  atualizarDataCorteCompetidoresEvento,
  gerarRelatorioInscritosEventoConsolidadoDados,
  getCampanhasDoClube,
  criarAbaCampanhas,
  getEixos,
  listarEixosCampanha,
  salvarEixoCampanha,
  excluirEixoCampanha,
  montarChaveIdempotencia,
  lerResultadoIdempotente,
  salvarResultadoIdempotente,
  registrarCampanha,
  getCampanhaPorId,
  deletarCampanha,
  editarCampanha,
  excluirMidiaCampanha,
  excluirMidiaAtividade,
  obterDadosResumoClube,
  getAtividadesDoClube,
  buscarDadosParaRankingAtividades,
  buscarDadosParaRankingCampanhas,
  getAtividadesGabinete,
  criarAbaAtividades,
  registrarAtividade,
  formatarHoras,
  calcularDuracaoMinutos,
  validarFormatoEmail,
  sanitizarString,
  converterDataParaISO,
  adicionarComentarioCampanha,
  adicionarComentarioAtividade,
  obterComentarioCampanha,
  obterComentarioAtividade,
  validarDadosCampanha,
  validarDadosAtividade,
  logOperacao,
  testarDriveCunhaPora,
  testarAcessoDrive,
  obterArquivosDrive,
  testeComunicacao,
  carregarArquivosDriveNovo,
  obterPastaClubeId,
  uploadArquivoDrive,
  obterMimeTypePorExtensao,
  obterUrlArquivo,
  excluirArquivoDrive,
  obterListaClubesComDrive,
  testarDriveClube,
  atualizarDriveIdClube,
  configurarCunhaPora,
  obterArquivosDriveReal,
  obterArquivosDriveDebug,
  obterArquivosDriveSimplificado,
  obterArquivosDriveGabinete,
  listarArquivosDriveCompartilhado,
  obterProprietarioItem,
  formatarTamanhoArquivo,
  obterThumbnailItem,
  obterCaminhoPastaItem,
  criarPastaDriveCompartilhado,
  uploadArquivoDriveCompartilhado,
  excluirItemDriveCompartilhado,
  renomearItemDriveCompartilhado,
  obterLinkDownloadDriveCompartilhado,
  buscarArquivosDriveCompartilhado,
  determinarTipoArquivo,
  obterInformacoesPastaCompartilhada,
  formatarTamanho,
  baixarArquivoDriveCompartilhado,
  testarAcessoDriveCompartilhado,
  identificarPlaceholders,
  mapearDadosCampanha,
  buscarTodasCampanhasDistrito,
  transferirDados,
  gerarRelatorioDMComOpcao,
  executarGeracaoRelatorio,
  configurarArquivoRelatorio,
  gerarRankingGabinete,
  leoObterUrlWebAppRecuperacaoSenha,
  obterUrlBaseScript,
  _cors,
  getRtmaHtml,
  buscarOpcoesFiltros,
  buscarOpcoesFiltrosDistritoPessoas,
  listarConteudoPasta,
  obterCaminhoPasta,
  obterProprietarioDrive,
  obterThumbnailDrive,
  criarPasta,
  excluirItem,
  renomearItem,
  obterLinkDownload,
  copiarArquivo,
  buscarArquivos,
  formatarTamanhoDrive,
  gerarCertificadosCampanhas,
  copiarSlide,
  substituirPlaceholders,
  formatarEixo,
  extrairAnoLeonistico,
  processarRelatoriosCampanhas,
  adicionarCampanhaSelecionada,
  removerCampanhaSelecionada,
  verificarCampanhaSelecionada,
  buscarCampanhasSelecionadas,
  obterCampanhasFiltradas,
  atualizarCampanhaFiltrada,
  deletarCampanhaFiltrada,
  buscarCampanhaPorId,
  listarConfiguracoes,
  salvarConfiguracao,
  ativarConfiguracao,
  excluirConfiguracao,
  buscarConfiguracaoAtiva,
  listarAcessos,
  formatarDataFundacaoBR,
  listarClubesSupabase,
  obterMapaRegiaoClubes,
  obterResumoDelegadosClubes,
  obterEmailClubeSupabase,
  atualizarEmailClubeSupabase,
  atualizarClubeSupabase,
  inserirClube,
  excluirClube,
  criarClubeComAcesso,
  atualizarStatusAcesso,
  obterDatasTrimestreParaDM,
  formatarDataParaISO,
  determinarTrimestreDaData,
  verificarSeNoTrimestreVigente,
  criarSolicitacaoAlteracao,
  verificarEProcessarAlteracao,
  processarSolicitacaoAprovada,
  listarSolicitacoesAlteracao,
  listarSolicitacoesAlteracaoPorClube,
  aprovarSolicitacaoAlteracao,
  rejeitarSolicitacaoAlteracao,
  buscarSolicitacaoPorId,
  obterTrimestreAtualWrapper,
  obterDatasTrimestreParaDMWrapper,
  obterTodosClubesRTMA,
  calcularResumoDMComFiltrosDashboardWrapper,
  criarPessoaComVerificacao,
  editarPessoaComVerificacao,
  desligarPessoaComVerificacao,
  buscarPessoaPorIdRTMA,
  listarEventosCalendario,
  validarAcessoStaffEvento,
  obterLinkAcessoStaffEvento,
};
// Bridge code.js's own exports so rtma_*.js can find them by bare name (same GAS global-scope pattern)
bridgeModuleExportsToGlobal(module.exports);
