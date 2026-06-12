// === INTEGRAÇÃO COM SUPABASE - DISTRITO LEO LD-8 ===
const { gasStyleFetch } = require('./async-fetch-helper');
const { logInfo, logWarn, logError, arrayValido, respostaSucesso, respostaErro } = require('./rtma_utils');
const { limparCacheClube } = require('./rtma_cache');

const RTMA_SUPABASE_CONFIG = {
  url: process.env.SUPABASE_URL || 'https://bqkttaflhtsdkamgscnf.supabase.co',
  anonKey: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxa3R0YWZsaHRzZGthbWdzY25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTA4MjEsImV4cCI6MjA4Mjc2NjgyMX0.yGxyrn2nMTEbl6w8Lk8HwsblgqNzGS36ckZBGXAIitQ',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY  // sem fallback — segredo deve vir do env
};

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[CONFIG] SUPABASE_SERVICE_ROLE_KEY ausente — chamadas Supabase autenticadas vão falhar.');
}

const RTMA_USAR_SUPABASE = true;

let MAPA_CLUBES_CACHE = null;
let MAPA_CLUBES_CACHE_TIMESTAMP = null;
const CACHE_DURACAO_CLUBES = 5 * 60 * 1000;

let MAPA_STATUS_CLUBES_CACHE = null;
let MAPA_STATUS_CLUBES_CACHE_TIMESTAMP = null;

async function obterMapaClubesSupabase() {
  const funcao = 'obterMapaClubesSupabase';
  try {
    const agora = new Date().getTime();
    if (MAPA_CLUBES_CACHE && MAPA_CLUBES_CACHE_TIMESTAMP &&
        (agora - MAPA_CLUBES_CACHE_TIMESTAMP) < CACHE_DURACAO_CLUBES) {
      return MAPA_CLUBES_CACHE;
    }
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/clubes?select=id,nome`;
    const response = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (response.getResponseCode() !== 200) {
      logError(funcao, 'Erro ao buscar clubes do Supabase', response.getContentText());
      return {};
    }
    const clubes = JSON.parse(response.getContentText());
    const mapa = {};
    clubes.forEach(clube => { mapa[clube.nome] = clube.id; });
    MAPA_CLUBES_CACHE = mapa;
    MAPA_CLUBES_CACHE_TIMESTAMP = agora;
    logInfo(funcao, `Mapa de clubes obtido: ${Object.keys(mapa).length} clubes`);
    return mapa;
  } catch (error) {
    logError(funcao, 'Erro ao obter mapa de clubes', error.message);
    return {};
  }
}

async function obterMapaClubesIdParaNomeSupabase() {
  const funcao = 'obterMapaClubesIdParaNomeSupabase';
  try {
    const nomeParaId = await obterMapaClubesSupabase();
    const mapa = {};
    Object.keys(nomeParaId || {}).forEach(function (nome) {
      const id = nomeParaId[nome];
      if (id == null || id === '') return;
      mapa[String(id)] = String(nome).trim();
    });
    return mapa;
  } catch (error) {
    logError(funcao, 'Erro ao montar mapa id->nome', error.message);
    return {};
  }
}

async function obterMapaStatusClubesSupabase() {
  const funcao = 'obterMapaStatusClubesSupabase';
  try {
    const agora = new Date().getTime();
    if (MAPA_STATUS_CLUBES_CACHE && MAPA_STATUS_CLUBES_CACHE_TIMESTAMP &&
        (agora - MAPA_STATUS_CLUBES_CACHE_TIMESTAMP) < CACHE_DURACAO_CLUBES) {
      return MAPA_STATUS_CLUBES_CACHE;
    }
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/clubes?select=nome,status`;
    const response = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (response.getResponseCode() !== 200) {
      logError(funcao, 'Erro ao buscar status dos clubes', response.getContentText());
      return {};
    }
    const clubes = JSON.parse(response.getContentText() || '[]');
    const mapa = {};
    clubes.forEach(clube => {
      const nome = clube && clube.nome ? String(clube.nome).trim() : '';
      if (!nome) return;
      mapa[nome] = (clube && clube.status ? String(clube.status).trim() : '') || 'Sem status';
    });
    MAPA_STATUS_CLUBES_CACHE = mapa;
    MAPA_STATUS_CLUBES_CACHE_TIMESTAMP = agora;
    return mapa;
  } catch (error) {
    logError(funcao, 'Erro ao obter status dos clubes', error.message);
    return {};
  }
}

function rtmaConverterDataSupabaseParaBR(dataSupabase) {
  if (!dataSupabase) return null;
  if (typeof dataSupabase === 'string' && dataSupabase.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    return dataSupabase;
  }
  if (typeof dataSupabase === 'string' && dataSupabase.includes('T')) {
    const dataISO = new Date(dataSupabase);
    if (!isNaN(dataISO.getTime())) {
      const d = String(dataISO.getUTCDate()).padStart(2,'0');
      const m = String(dataISO.getUTCMonth()+1).padStart(2,'0');
      const y = dataISO.getUTCFullYear();
      return `${d}/${m}/${y}`;
    }
  }
  if (typeof dataSupabase === 'string' && dataSupabase.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const partes = dataSupabase.split('-');
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return dataSupabase;
}

function rtmaNormalizarTipoPessoa(tipo) {
  const v = (tipo == null ? '' : String(tipo).trim());
  if (v === 'Apenas LEO/Leão' || v === 'Leão' || v === 'Leo/Leão') return 'Associado LEO/Leão';
  if (v === 'Pre LEO' || v === 'Pré-LEO' || v === 'Pre-LEO') return 'Pré LEO';
  if (v === 'LEO e LEO/Leão' || v === 'Associado LEO/Leão e LEO') return 'Associado LEO e LEO/Leão';
  return v;
}

function rtmaNormalizarPessoaSupabase(item, clubeFallback) {
  const safeTrim = (valor) => (valor == null ? '' : String(valor).trim());
  return {
    id: item.id || item.linha_original?.toString() || '',
    clube: safeTrim(item.clube_nome) || safeTrim(clubeFallback),
    status: safeTrim(item.status) || 'Ativo',
    tipo: rtmaNormalizarTipoPessoa(item.tipo),
    numeroAssociado: safeTrim(item.numero_associado),
    nome: safeTrim(item.nome),
    cargo: safeTrim(item.cargo),
    formacao: safeTrim(item.formacao),
    profissao: safeTrim(item.profissao),
    dataInicioPreLeo: rtmaConverterDataSupabaseParaBR(item.data_inicio_pre_leo),
    associadoDesde: rtmaConverterDataSupabaseParaBR(item.associado_desde),
    dataDesligamento: rtmaConverterDataSupabaseParaBR(item.data_desligamento),
    dataPosseLions: rtmaConverterDataSupabaseParaBR(item.data_posse_lions),
    dataNascimento: rtmaConverterDataSupabaseParaBR(item.data_nascimento),
    telefone: safeTrim(item.telefone),
    email: safeTrim(item.email),
    logradouro: safeTrim(item.logradouro),
    cidade: safeTrim(item.cidade),
    cep: safeTrim(item.cep),
    acaoTrimestre: safeTrim(item.acao_trimestre),
    foraneo: item.foraneo || false,
    restricaoAlimentar: safeTrim(item.restricao_alimentar),
    linhaOriginal: item.linha_original || null
  };
}

async function buscarPessoasDoSupabase(clubeNome) {
  const funcao = 'buscarPessoasDoSupabase';
  try {
    const clubeNomeLimpo = (clubeNome == null ? '' : String(clubeNome)).trim();
    const clubesMap = await obterMapaClubesSupabase();
    const clubeId = clubesMap[clubeNomeLimpo];
    let url = null;
    if (clubeId) {
      url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/pessoas_rtma?clube_id=eq.${encodeURIComponent(clubeId)}&select=id,clube_nome,status,tipo,numero_associado,nome,cargo,formacao,profissao,data_inicio_pre_leo,associado_desde,data_desligamento,data_posse_lions,data_nascimento,telefone,email,logradouro,cidade,cep,acao_trimestre,foraneo,restricao_alimentar,linha_original&order=created_at.asc`;
    } else {
      logWarn(funcao, `Clube não encontrado na tabela clubes (fallback por clube_nome)`, { clubeNome: clubeNomeLimpo });
      url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/pessoas_rtma?clube_nome=eq.${encodeURIComponent(clubeNomeLimpo)}&select=id,clube_nome,status,tipo,numero_associado,nome,cargo,formacao,profissao,data_inicio_pre_leo,associado_desde,data_desligamento,data_posse_lions,data_nascimento,telefone,email,logradouro,cidade,cep,acao_trimestre,foraneo,restricao_alimentar,linha_original&order=created_at.asc`;
    }
    let response = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (response.getResponseCode() === 200 && !clubeId) {
      try {
        const dadosTmp = JSON.parse(response.getContentText() || '[]');
        if (Array.isArray(dadosTmp) && dadosTmp.length === 0) {
          const urlIlike = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/pessoas_rtma?clube_nome=ilike.${encodeURIComponent(clubeNomeLimpo)}&select=id,clube_nome,status,tipo,numero_associado,nome,cargo,formacao,profissao,data_inicio_pre_leo,associado_desde,data_desligamento,data_posse_lions,data_nascimento,telefone,email,logradouro,cidade,cep,acao_trimestre,foraneo,restricao_alimentar,linha_original&order=created_at.asc`;
          response = await gasStyleFetch(urlIlike, {
            method: 'GET',
            headers: {
              'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
              'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
              'Content-Type': 'application/json'
            }
          });
        }
      } catch (e) { /* segue com resposta atual */ }
    }
    if (response.getResponseCode() !== 200) {
      logError(funcao, 'Erro ao buscar pessoas do Supabase', response.getContentText());
      return [];
    }
    const dados = JSON.parse(response.getContentText());
    const pessoas = dados.map(item => rtmaNormalizarPessoaSupabase(item, clubeNomeLimpo));
    logInfo(funcao, `Pessoas obtidas do Supabase: ${pessoas.length}`, { clube: clubeNome });
    return pessoas;
  } catch (error) {
    logError(funcao, 'Erro ao buscar pessoas do Supabase', error.message);
    return [];
  }
}

async function buscarPessoaPorIdSupabase(pessoaId) {
  const funcao = 'buscarPessoaPorIdSupabase';
  try {
    if (!pessoaId) return null;
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/pessoas_rtma?id=eq.${encodeURIComponent(String(pessoaId))}&select=*`;
    const response = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (response.getResponseCode() !== 200) {
      logError(funcao, 'Erro ao buscar pessoa por ID no Supabase', response.getContentText());
      return null;
    }
    const dados = JSON.parse(response.getContentText() || '[]');
    const item = Array.isArray(dados) && dados.length > 0 ? dados[0] : null;
    if (!item) return null;
    return rtmaNormalizarPessoaSupabase(item, item.clube_nome || '');
  } catch (error) {
    logError(funcao, 'Erro ao buscar pessoa por ID no Supabase', error.message);
    return null;
  }
}

async function buscarPessoasMultiplosClubesDoSupabase(clubesNomes) {
  const funcao = 'buscarPessoasMultiplosClubesDoSupabase';
  try {
    if (!arrayValido(clubesNomes)) return [];
    const clubesMap = await obterMapaClubesSupabase();
    const ids = clubesNomes
      .map(n => (n == null ? '' : String(n)).trim())
      .map(n => clubesMap[n])
      .filter(Boolean);
    let baseUrl;
    if (ids.length > 0) {
      const inList = ids.map(id => encodeURIComponent(id)).join(',');
      baseUrl = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/pessoas_rtma?clube_id=in.(${inList})&select=id,clube_nome,status,tipo,numero_associado,nome,cargo,formacao,profissao,data_inicio_pre_leo,associado_desde,data_desligamento,data_posse_lions,data_nascimento,telefone,email,logradouro,cidade,cep,acao_trimestre,foraneo,restricao_alimentar,linha_original&order=clube_nome.asc,created_at.asc`;
    } else {
      // Charset seguro: letras (incluindo acentuadas), dígitos, espaço, hífen e pontuação básica.
      // Nomes fora do charset ou ausentes no mapa de clubes são descartados para evitar
      // injeção no agrupamento or=(...) do PostgREST (A2-05).
      const NOME_CLUBE_SAFE = /^[\w \-À-ÿ.]+$/;
      const nomesSeguros = clubesNomes
        .map(n => (n == null ? '' : String(n)).trim())
        .filter(n => n && NOME_CLUBE_SAFE.test(n));
      if (nomesSeguros.length === 0) {
        logWarn(funcao, 'Todos os nomes de clube rejeitados pela validação de charset — retornando vazio');
        return [];
      }
      const filtros = nomesSeguros.map(nome => `clube_nome.eq.${encodeURIComponent(nome)}`).join(',');
      baseUrl = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/pessoas_rtma?or=(${filtros})&select=id,clube_nome,status,tipo,numero_associado,nome,cargo,formacao,profissao,data_inicio_pre_leo,associado_desde,data_desligamento,data_posse_lions,data_nascimento,telefone,email,logradouro,cidade,cep,acao_trimestre,foraneo,restricao_alimentar,linha_original&order=clube_nome.asc,created_at.asc`;
    }
    const todosRegistros = [];
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;
    logInfo(funcao, 'Iniciando busca paginada de pessoas de múltiplos clubes', { totalClubes: clubesNomes.length });
    while (hasMore) {
      try {
        const url = `${baseUrl}&limit=${pageSize}&offset=${offset}`;
        const response = await gasStyleFetch(url, {
          method: 'GET',
          headers: {
            'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
            'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
            'Content-Type': 'application/json',
            'Range': `${offset}-${offset + pageSize - 1}`
          }
        });
        if (response.getResponseCode() !== 200 && response.getResponseCode() !== 206) {
          logError(funcao, `Erro ao buscar página ${offset}-${offset + pageSize - 1}`, response.getContentText());
          break;
        }
        const dados = JSON.parse(response.getContentText() || '[]');
        todosRegistros.push(...dados);
        logInfo(funcao, `Página ${Math.floor(offset / pageSize) + 1} carregada`, {
          registrosNaPagina: dados.length,
          totalAcumulado: todosRegistros.length
        });
        if (dados.length < pageSize) {
          hasMore = false;
        } else {
          offset += pageSize;
        }
      } catch (error) {
        logError(funcao, `Erro ao processar página ${offset}-${offset + pageSize - 1}`, error.message);
        hasMore = false;
      }
    }
    logInfo(funcao, 'Busca paginada concluída', { totalRegistros: todosRegistros.length });
    const pessoas = todosRegistros.map(item => ({
      id: item.id || item.linha_original?.toString() || '',
      clube: item.clube_nome || '',
      status: item.status || 'Ativo',
      tipo: rtmaNormalizarTipoPessoa(item.tipo),
      numeroAssociado: item.numero_associado || '',
      nome: item.nome || '',
      cargo: item.cargo || '',
      formacao: item.formacao || '',
      profissao: item.profissao || '',
      dataInicioPreLeo: rtmaConverterDataSupabaseParaBR(item.data_inicio_pre_leo),
      associadoDesde: rtmaConverterDataSupabaseParaBR(item.associado_desde),
      dataDesligamento: rtmaConverterDataSupabaseParaBR(item.data_desligamento),
      dataPosseLions: rtmaConverterDataSupabaseParaBR(item.data_posse_lions),
      dataNascimento: rtmaConverterDataSupabaseParaBR(item.data_nascimento),
      telefone: item.telefone || '',
      email: item.email || '',
      logradouro: item.logradouro || '',
      cidade: item.cidade || '',
      cep: item.cep || '',
      acaoTrimestre: item.acao_trimestre || '',
      foraneo: item.foraneo || false,
      restricaoAlimentar: (item.restricao_alimentar || '').trim(),
      linhaOriginal: item.linha_original || null
    }));
    logInfo(funcao, `Pessoas obtidas do Supabase: ${pessoas.length}`, { totalClubes: clubesNomes.length });
    return pessoas;
  } catch (error) {
    logError(funcao, 'Erro ao buscar pessoas do Supabase', error.message);
    return [];
  }
}

async function buscarAmigosDoSupabase(clubeNome) {
  const funcao = 'buscarAmigosDoSupabase';
  try {
    const clubeNomeLimpo = (clubeNome == null ? '' : String(clubeNome)).trim();
    const clubesMap = await obterMapaClubesSupabase();
    const clubeId = clubesMap[clubeNomeLimpo];
    let url = null;
    if (clubeId) {
      url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/amigos_conselheiros?clube_id=eq.${encodeURIComponent(clubeId)}&select=*&order=created_at.asc`;
    } else {
      logWarn(funcao, `Clube não encontrado na tabela clubes (fallback por clube_nome)`, { clubeNome: clubeNomeLimpo });
      url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/amigos_conselheiros?clube_nome=eq.${encodeURIComponent(clubeNomeLimpo)}&select=*&order=created_at.asc`;
    }
    const response = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (response.getResponseCode() !== 200) {
      logError(funcao, 'Erro ao buscar amigos do Supabase', response.getContentText());
      return [];
    }
    const dados = JSON.parse(response.getContentText());
    const amigos = dados.map(item => {
      const rawLions = item.Lions_Clube != null ? item.Lions_Clube : (item.lions_clube ?? '');
      let lionsClube = (typeof rawLions === 'string' ? rawLions : String(rawLions || '')).trim();
      if (lionsClube && lionsClube.match(/^\d{4}-\d{2}-\d{2}T/)) lionsClube = '';
      const rawData = item.Data_Nascimento != null ? item.Data_Nascimento : item.data_nascimento;
      let dataNascimento = null;
      if (rawData) {
        try { dataNascimento = rtmaConverterDataSupabaseParaBR(rawData); }
        catch (e) { dataNascimento = rawData; }
      }
      const email = (item.Email != null ? item.Email : item.email) || '';
      const logradouro = (item.Endereco != null ? item.Endereco : item.logradouro) || '';
      const cidade = (item.Cidade != null ? item.Cidade : item.cidade) || '';
      const cep = (item.CEP != null ? item.CEP : item.cep) || '';
      const telefone = (item.campolivre != null ? item.campolivre : item.telefone) || '';
      return {
        id: item.id || item.linha_original?.toString() || '',
        clube: item.clube_nome || clubeNomeLimpo,
        nome: item.nome || '',
        tipo: item.tipo || '',
        lionsClube: lionsClube,
        dataNascimento: dataNascimento,
        telefone: telefone,
        email: email,
        logradouro: logradouro,
        cidade: cidade,
        cep: cep,
        linhaOriginal: item.linha_original || null
      };
    });
    logInfo(funcao, `Amigos obtidos do Supabase: ${amigos.length}`, { clube: clubeNome });
    return amigos;
  } catch (error) {
    logError(funcao, 'Erro ao buscar amigos do Supabase', error.message);
    return [];
  }
}

async function buscarUsuarioNoSupabase(email, senha) {
  const funcao = 'buscarUsuarioNoSupabase';
  try {
    const emailLower = email.toLowerCase().trim();
    // select explícito: exclui colunas não usadas; senha incluída pois é necessária para verificação local (A2-03).
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/usuarios_acessos?email=eq.${encodeURIComponent(emailLower)}&select=id,clube_nome,clube_id,email,tipo_acesso,ativo,senha`;
    const response = await gasStyleFetch(url, {
      method: 'GET',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (response.getResponseCode() !== 200) {
      logError(funcao, 'Erro ao buscar usuário no Supabase', response.getContentText());
      return respostaErro('Erro ao acessar dados de autenticação');
    }
    const dados = JSON.parse(response.getContentText());
    if (!arrayValido(dados) || dados.length === 0) return respostaErro('Credenciais inválidas');
    const usuario = dados[0];
    if (usuario.hasOwnProperty('ativo') && (usuario.ativo === false || usuario.ativo === null)) {
      logWarn(funcao, `Tentativa de login com acesso inativo: ${emailLower}`);
      return respostaErro('Acesso inativo. Entre em contato com a administração do sistema.');
    }
    if (usuario.senha !== senha) return respostaErro('Credenciais inválidas');
    const usuarioNormalizado = {
      id: usuario.id || '',
      clube: usuario.clube_nome || '',
      email: usuario.email || '',
      regiao: '',
      tipoAcesso: usuario.tipo_acesso || '',
      driveId: '',
      ativo: usuario.ativo !== undefined ? usuario.ativo : true
    };
    return respostaSucesso(usuarioNormalizado, 'Usuário encontrado');
  } catch (error) {
    logError(funcao, 'Erro ao buscar usuário no Supabase', error.message);
    return respostaErro('Erro ao acessar dados de autenticação');
  }
}

async function rtmaDiagnosticoSupabase(clubeNome) {
  const funcao = 'rtmaDiagnosticoSupabase';
  try {
    const safe = (s) => (s == null ? '' : String(s));
    const clube = safe(clubeNome).trim();
    const headers = {
      'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
      'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'count=exact'
    };
    const fetchCount = async (path) => {
      const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/${path}`;
      const resp = await gasStyleFetch(url, { method: 'GET', headers });
      const code = resp.getResponseCode();
      const cr = resp.getHeaders()['Content-Range'] || resp.getHeaders()['content-range'] || '';
      let count = null;
      if (cr && cr.includes('/')) {
        const parts = cr.split('/');
        count = parseInt(parts[1], 10);
        if (isNaN(count)) count = null;
      }
      const body = resp.getContentText() || '';
      return { url, code, contentRange: cr, count, sample: body.substring(0, 300) };
    };
    const clubesResp = await fetchCount('clubes?select=id,nome');
    const pessoasResp = clube
      ? await fetchCount(`pessoas_rtma?clube_nome=eq.${encodeURIComponent(clube)}&select=id`)
      : await fetchCount('pessoas_rtma?select=id');
    const amigosResp = clube
      ? await fetchCount(`amigos_conselheiros?clube_nome=eq.${encodeURIComponent(clube)}&select=id`)
      : await fetchCount('amigos_conselheiros?select=id');
    logInfo(funcao, 'Diagnóstico RTMA Supabase executado', { clube: clube || '(todos)' });
    return { ok: true, clube: clube || null, clubes: clubesResp, pessoas_rtma: pessoasResp, amigos_conselheiros: amigosResp };
  } catch (e) {
    logError(funcao, 'Erro no diagnóstico Supabase', e && e.message ? e.message : String(e));
    return { ok: false, error: String(e) };
  }
}

function converterDataParaSQL(dataInput) {
  if (!dataInput) return null;
  try {
    if (dataInput instanceof Date) {
      const ano = dataInput.getFullYear();
      const mes = dataInput.getMonth() + 1;
      const dia = dataInput.getDate();
      if (isNaN(ano) || isNaN(mes) || isNaN(dia) || ano < 1900 || ano > 2100) return null;
      return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }
    if (typeof dataInput === 'string') {
      const dataString = dataInput.trim();
      if (!dataString) return null;
      const partes = dataString.split('/');
      if (partes.length === 3) {
        const dia = parseInt(partes[0]);
        const mes = parseInt(partes[1]);
        const ano = parseInt(partes[2]);
        if (!isNaN(dia) && !isNaN(mes) && !isNaN(ano)) {
          if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && ano >= 1900 && ano <= 2100) {
            return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
          }
        }
      }
      if (dataString.match(/^\d{4}-\d{2}-\d{2}$/)) return dataString;
      const dataISO = new Date(dataString);
      if (!isNaN(dataISO.getTime())) {
        const ano = dataISO.getFullYear();
        const mes = dataISO.getMonth() + 1;
        const dia = dataISO.getDate();
        return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      }
    }
    return null;
  } catch (error) {
    logWarn('converterDataParaSQL', `Erro ao converter data: ${dataInput}`, error.message);
    return null;
  }
}

async function criarPessoaNoSupabase(clubeNome, dados) {
  const funcao = 'criarPessoaNoSupabase';
  try {
    const clubesMap = await obterMapaClubesSupabase();
    const clubeId = clubesMap[clubeNome];
    if (!clubeId) return respostaErro(`Clube ${clubeNome} não encontrado no Supabase`);
    const dadosSupabase = {
      clube_id: clubeId, clube_nome: clubeNome, status: dados.status || 'Ativo',
      tipo: dados.tipo || null, numero_associado: dados.numeroAssociado || null,
      nome: dados.nome, cargo: dados.cargo || null, formacao: dados.formacao || null,
      profissao: dados.profissao || null,
      data_inicio_pre_leo: converterDataParaSQL(dados.dataInicioPreLeo),
      associado_desde: converterDataParaSQL(dados.associadoDesde),
      data_desligamento: converterDataParaSQL(dados.dataDesligamento),
      data_posse_lions: converterDataParaSQL(dados.dataPosseLions),
      data_nascimento: converterDataParaSQL(dados.dataNascimento),
      telefone: dados.telefone || null, email: dados.email || null,
      logradouro: dados.logradouro || null, cidade: dados.cidade || null, cep: dados.cep || null,
      acao_trimestre: dados.acaoTrimestre || null, foraneo: dados.foraneo || false,
      restricao_alimentar: (dados.restricaoAlimentar || '').trim() || null
    };
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/pessoas_rtma`;
    const response = await gasStyleFetch(url, {
      method: 'POST',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation'
      },
      payload: JSON.stringify(dadosSupabase)
    });
    if (response.getResponseCode() !== 201) {
      const erro = response.getContentText();
      logError(funcao, 'Erro ao criar pessoa no Supabase', erro);
      return respostaErro(`Erro ao criar pessoa: ${erro}`);
    }
    const resultado = JSON.parse(response.getContentText());
    limparCacheClube(clubeNome);
    return respostaSucesso(resultado[0] || resultado, 'Pessoa criada com sucesso');
  } catch (error) {
    logError(funcao, 'Erro ao criar pessoa no Supabase', error.message);
    return respostaErro(error.message);
  }
}

async function editarPessoaNoSupabase(clubeNome, pessoaId, dados) {
  const funcao = 'editarPessoaNoSupabase';
  if (!pessoaId) {
    logError(funcao, 'pessoaId ausente - operação cancelada para evitar PATCH sem filtro');
    return respostaErro('ID da pessoa é obrigatório para edição');
  }
  try {
    const dadosSupabase = {};
    if (dados.status !== undefined) dadosSupabase.status = dados.status;
    if (dados.tipo !== undefined) dadosSupabase.tipo = dados.tipo || null;
    if (dados.numeroAssociado !== undefined) dadosSupabase.numero_associado = dados.numeroAssociado || null;
    if (dados.nome !== undefined) dadosSupabase.nome = dados.nome;
    if (dados.cargo !== undefined) dadosSupabase.cargo = dados.cargo || null;
    if (dados.formacao !== undefined) dadosSupabase.formacao = dados.formacao || null;
    if (dados.profissao !== undefined) dadosSupabase.profissao = dados.profissao || null;
    if (dados.dataInicioPreLeo !== undefined) dadosSupabase.data_inicio_pre_leo = converterDataParaSQL(dados.dataInicioPreLeo);
    if (dados.associadoDesde !== undefined) dadosSupabase.associado_desde = converterDataParaSQL(dados.associadoDesde);
    if (dados.dataDesligamento !== undefined) dadosSupabase.data_desligamento = converterDataParaSQL(dados.dataDesligamento);
    if (dados.dataPosseLions !== undefined) dadosSupabase.data_posse_lions = converterDataParaSQL(dados.dataPosseLions);
    if (dados.dataNascimento !== undefined) dadosSupabase.data_nascimento = converterDataParaSQL(dados.dataNascimento);
    if (dados.telefone !== undefined) dadosSupabase.telefone = dados.telefone || null;
    if (dados.email !== undefined) dadosSupabase.email = dados.email || null;
    if (dados.logradouro !== undefined) dadosSupabase.logradouro = dados.logradouro || null;
    if (dados.cidade !== undefined) dadosSupabase.cidade = dados.cidade || null;
    if (dados.cep !== undefined) dadosSupabase.cep = dados.cep || null;
    if (dados.acaoTrimestre !== undefined) dadosSupabase.acao_trimestre = dados.acaoTrimestre || null;
    if (dados.foraneo !== undefined) dadosSupabase.foraneo = dados.foraneo || false;
    if (dados.clubeNome !== undefined) dadosSupabase.clube_nome = dados.clubeNome || null;
    if (dados.clubeId !== undefined) dadosSupabase.clube_id = dados.clubeId || null;
    if (dados.historicoClubes !== undefined) {
      const hc = Array.isArray(dados.historicoClubes) ? dados.historicoClubes : [];
      dadosSupabase.historico_clubes = hc.length > 0 ? JSON.stringify(hc) : null;
    }
    if (dados.restricaoAlimentar !== undefined) dadosSupabase.restricao_alimentar = (dados.restricaoAlimentar || '').trim() || null;
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/pessoas_rtma?id=eq.${encodeURIComponent(pessoaId)}`;
    const response = await gasStyleFetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation'
      },
      payload: JSON.stringify(dadosSupabase)
    });
    if (response.getResponseCode() !== 200 && response.getResponseCode() !== 204) {
      const erro = response.getContentText();
      logError(funcao, 'Erro ao editar pessoa no Supabase', erro);
      return respostaErro(`Erro ao editar pessoa: ${erro}`);
    }
    limparCacheClube(clubeNome);
    if (dadosSupabase.clube_nome && dadosSupabase.clube_nome !== clubeNome) {
      limparCacheClube(dadosSupabase.clube_nome);
    }
    return respostaSucesso(null, 'Pessoa editada com sucesso');
  } catch (error) {
    logError(funcao, 'Erro ao editar pessoa no Supabase', error.message);
    return respostaErro(error.message);
  }
}

async function transferirPessoaParaClubeSupabase(pessoaId, clubeOrigemNome, clubeDestinoNome, historicoAtual) {
  const funcao = 'transferirPessoaParaClubeSupabase';
  try {
    if (!pessoaId || !clubeDestinoNome) return respostaErro('Pessoa e clube destino são obrigatórios.');
    const clubesMap = await obterMapaClubesSupabase();
    const clubeIdDestino = clubesMap[clubeDestinoNome] || null;
    const historico = Array.isArray(historicoAtual) ? historicoAtual : [];
    const hoje = new Date().toISOString().slice(0, 10);
    if (clubeOrigemNome) historico.push({ clube: clubeOrigemNome, ate: hoje });
    const dadosSupabase = { clube_nome: clubeDestinoNome, clube_id: clubeIdDestino, historico_clubes: historico };
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/pessoas_rtma?id=eq.${encodeURIComponent(pessoaId)}`;
    const response = await gasStyleFetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation'
      },
      payload: JSON.stringify(dadosSupabase)
    });
    if (response.getResponseCode() !== 200 && response.getResponseCode() !== 204) {
      logError(funcao, 'Erro ao transferir pessoa', response.getContentText());
      return respostaErro('Erro ao transferir pessoa no Supabase.');
    }
    limparCacheClube(clubeOrigemNome || '');
    limparCacheClube(clubeDestinoNome);
    return respostaSucesso(null, 'Pessoa transferida com sucesso.');
  } catch (error) {
    logError(funcao, 'Erro ao transferir pessoa', error.message);
    return respostaErro(error.message);
  }
}

async function desligarPessoaNoSupabase(clubeNome, pessoaId, dataDesligamento) {
  const funcao = 'desligarPessoaNoSupabase';
  if (!pessoaId) {
    logError(funcao, 'pessoaId ausente - operação cancelada para evitar PATCH sem filtro');
    return respostaErro('ID da pessoa é obrigatório para desligamento');
  }
  try {
    const dadosSupabase = { status: 'Inativo', data_desligamento: converterDataParaSQL(dataDesligamento) };
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/pessoas_rtma?id=eq.${encodeURIComponent(pessoaId)}`;
    const response = await gasStyleFetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation'
      },
      payload: JSON.stringify(dadosSupabase)
    });
    if (response.getResponseCode() !== 200 && response.getResponseCode() !== 204) {
      const erro = response.getContentText();
      logError(funcao, 'Erro ao desligar pessoa no Supabase', erro);
      return respostaErro(`Erro ao desligar pessoa: ${erro}`);
    }
    limparCacheClube(clubeNome);
    return respostaSucesso(null, 'Pessoa desligada com sucesso');
  } catch (error) {
    logError(funcao, 'Erro ao desligar pessoa no Supabase', error.message);
    return respostaErro(error.message);
  }
}

async function criarAmigoNoSupabase(clubeNome, dados) {
  const funcao = 'criarAmigoNoSupabase';
  try {
    const clubesMap = await obterMapaClubesSupabase();
    const clubeId = clubesMap[clubeNome];
    if (!clubeId) return respostaErro(`Clube ${clubeNome} não encontrado no Supabase`);
    let tipoNormalizado = null;
    if (dados.tipo) {
      const tipoLower = dados.tipo.trim().toLowerCase();
      if (tipoLower.includes('conselheiro') || tipoLower.includes('conselheira')) tipoNormalizado = 'Conselheiro(a)';
      else if (tipoLower.includes('amigo') || tipoLower.includes('amiga')) tipoNormalizado = 'Amigo(a) LEO';
    }
    const dadosSupabase = {
      clube_id: clubeId, clube_nome: clubeNome, nome: dados.nome, tipo: tipoNormalizado,
      Lions_Clube: dados.lionsClube || null, Data_Nascimento: converterDataParaSQL(dados.dataNascimento),
      campolivre: dados.telefone || null, Email: dados.email || null,
      Endereco: dados.logradouro || null, Cidade: dados.cidade || null, CEP: dados.cep || null
    };
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/amigos_conselheiros`;
    const response = await gasStyleFetch(url, {
      method: 'POST',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation'
      },
      payload: JSON.stringify(dadosSupabase)
    });
    if (response.getResponseCode() !== 201) {
      const erro = response.getContentText();
      logError(funcao, 'Erro ao criar amigo no Supabase', erro);
      return respostaErro(`Erro ao criar amigo: ${erro}`);
    }
    const resultado = JSON.parse(response.getContentText());
    limparCacheClube(clubeNome);
    return respostaSucesso(resultado[0] || resultado, 'Amigo criado com sucesso');
  } catch (error) {
    logError(funcao, 'Erro ao criar amigo no Supabase', error.message);
    return respostaErro(error.message);
  }
}

async function editarAmigoNoSupabase(clubeNome, amigoId, dados) {
  const funcao = 'editarAmigoNoSupabase';
  try {
    const dadosSupabase = {};
    if (dados.nome !== undefined) dadosSupabase.nome = dados.nome;
    if (dados.tipo !== undefined) {
      let tipoNormalizado = null;
      if (dados.tipo) {
        const tipoLower = dados.tipo.trim().toLowerCase();
        if (tipoLower.includes('conselheiro') || tipoLower.includes('conselheira')) tipoNormalizado = 'Conselheiro(a)';
        else if (tipoLower.includes('amigo') || tipoLower.includes('amiga')) tipoNormalizado = 'Amigo(a) LEO';
      }
      dadosSupabase.tipo = tipoNormalizado;
    }
    if (dados.lionsClube !== undefined) dadosSupabase.Lions_Clube = dados.lionsClube || null;
    if (dados.dataNascimento !== undefined) dadosSupabase.Data_Nascimento = converterDataParaSQL(dados.dataNascimento);
    if (dados.telefone !== undefined) dadosSupabase.campolivre = dados.telefone || null;
    if (dados.email !== undefined) dadosSupabase.Email = dados.email || null;
    if (dados.logradouro !== undefined) dadosSupabase.Endereco = dados.logradouro || null;
    if (dados.cidade !== undefined) dadosSupabase.Cidade = dados.cidade || null;
    if (dados.cep !== undefined) dadosSupabase.CEP = dados.cep || null;
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/amigos_conselheiros?id=eq.${encodeURIComponent(amigoId)}`;
    const response = await gasStyleFetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation'
      },
      payload: JSON.stringify(dadosSupabase)
    });
    if (response.getResponseCode() !== 200 && response.getResponseCode() !== 204) {
      const erro = response.getContentText();
      logError(funcao, 'Erro ao editar amigo no Supabase', erro);
      return respostaErro(`Erro ao editar amigo: ${erro}`);
    }
    limparCacheClube(clubeNome);
    return respostaSucesso(null, 'Amigo editado com sucesso');
  } catch (error) {
    logError(funcao, 'Erro ao editar amigo no Supabase', error.message);
    return respostaErro(error.message);
  }
}

async function excluirAmigoNoSupabase(clubeNome, amigoId) {
  const funcao = 'excluirAmigoNoSupabase';
  if (!amigoId) {
    logError(funcao, 'amigoId ausente - operação cancelada para evitar DELETE sem filtro');
    return respostaErro('ID do amigo é obrigatório para exclusão');
  }
  try {
    const url = `${RTMA_SUPABASE_CONFIG.url}/rest/v1/amigos_conselheiros?id=eq.${encodeURIComponent(amigoId)}`;
    const response = await gasStyleFetch(url, {
      method: 'DELETE',
      headers: {
        'apikey': RTMA_SUPABASE_CONFIG.serviceRoleKey,
        'Authorization': `Bearer ${RTMA_SUPABASE_CONFIG.serviceRoleKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (response.getResponseCode() !== 200 && response.getResponseCode() !== 204) {
      const erro = response.getContentText();
      logError(funcao, 'Erro ao excluir amigo do Supabase', erro);
      return respostaErro(`Erro ao excluir amigo: ${erro}`);
    }
    limparCacheClube(clubeNome);
    return respostaSucesso(null, 'Amigo excluído com sucesso');
  } catch (error) {
    logError(funcao, 'Erro ao excluir amigo do Supabase', error.message);
    return respostaErro(error.message);
  }
}

module.exports = {
  RTMA_SUPABASE_CONFIG, RTMA_USAR_SUPABASE,
  obterMapaClubesSupabase, obterMapaClubesIdParaNomeSupabase, obterMapaStatusClubesSupabase,
  rtmaConverterDataSupabaseParaBR, rtmaNormalizarTipoPessoa, rtmaNormalizarPessoaSupabase,
  buscarPessoasDoSupabase, buscarPessoaPorIdSupabase, buscarPessoasMultiplosClubesDoSupabase,
  buscarAmigosDoSupabase, buscarUsuarioNoSupabase, rtmaDiagnosticoSupabase,
  converterDataParaSQL,
  criarPessoaNoSupabase, editarPessoaNoSupabase, transferirPessoaParaClubeSupabase,
  desligarPessoaNoSupabase, criarAmigoNoSupabase, editarAmigoNoSupabase, excluirAmigoNoSupabase,
};
