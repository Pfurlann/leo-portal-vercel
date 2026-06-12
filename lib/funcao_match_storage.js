'use strict';

const { UrlFetchApp, PropertiesService, CacheService, LockService, Utilities, Session, ScriptApp, Logger, MimeType, DriveApp } = require('./gas-compat');
const { gasStyleFetch } = require('./async-fetch-helper');

/**
 * FUNÇÃO PARA FAZER MATCH ENTRE ARQUIVOS DO STORAGE E REGISTROS DO BACKUP
 *
 * Esta função lista os arquivos do Supabase Storage e atualiza
 * a tabela backup_urls_google_drive com as URLs corretas do Storage
 */

async function fazerMatchStorageComBackup() {
  console.log('Iniciando match entre Storage e Backup...');

  // Buscar todos os registros pendentes do backup
  const backupRecords = await buscarRegistrosBackupPendentes();
  console.log(`Encontrados ${backupRecords.length} registros pendentes`);

  let atualizados = 0;
  let erros = 0;

  // Processar cada registro
  for (let index = 0; index < backupRecords.length; index++) {
    const record = backupRecords[index];
    try {
      console.log(`\n[${index + 1}/${backupRecords.length}] Processando: ${record.tabela_origem}.${record.campo_url} - ID: ${record.registro_id}`);

      // Buscar arquivo no Storage baseado na estrutura esperada
      const urlStorage = await buscarArquivoNoStorage(record);

      if (urlStorage) {
        // Atualizar registro no backup
        const sucesso = await atualizarUrlNoBackup(record.id, urlStorage);
        if (sucesso) {
          atualizados++;
          console.log(`URL atualizada: ${urlStorage.substring(0, 80)}...`);
        } else {
          erros++;
          console.log(`Erro ao atualizar URL no backup`);
        }
      } else {
        console.log(`Arquivo não encontrado no Storage`);
        // Marcar como erro se não encontrado
        await marcarBackupComoErro(record.id, 'Arquivo não encontrado no Storage');
        erros++;
      }

    } catch (error) {
      console.error(`Erro ao processar registro ${record.id}:`, error);
      await marcarBackupComoErro(record.id, error.message);
      erros++;
    }
  }

  console.log(`\nProcesso concluído!`);
  console.log(`   - Atualizados: ${atualizados}`);
  console.log(`   - Erros: ${erros}`);
  console.log(`   - Total: ${backupRecords.length}`);

  return {
    sucesso: true,
    atualizados: atualizados,
    erros: erros,
    total: backupRecords.length
  };
}

/**
 * Busca registros pendentes do backup
 */
async function buscarRegistrosBackupPendentes() {
  try {
    const url = `backup_urls_google_drive?status_migracao=eq.pendente&select=*&order=tabela_origem.asc,campo_url.asc`;
    const resp = await portalSupabaseFetch(url, { method: 'GET' });

    if (resp.getResponseCode() === 200) {
      return JSON.parse(resp.getContentText() || '[]');
    }
    return [];
  } catch (error) {
    console.error('Erro ao buscar registros do backup:', error);
    return [];
  }
}

/**
 * Busca arquivo no Storage baseado no registro do backup
 */
async function buscarArquivoNoStorage(record) {
  try {
    let bucket, caminhoBase, clubeNome, registroId;

    // portalNormalizarNomeClubeParaBucketLegacy comes from portal_supabase module
    // Use dynamic require to avoid circular dependency
    let portalSupabase;
    try { portalSupabase = require('./portal_supabase'); } catch (e) {}
    const clubeParaBucket = (portalSupabase && typeof portalSupabase.portalNormalizarNomeClubeParaBucketLegacy === 'function')
      ? portalSupabase.portalNormalizarNomeClubeParaBucketLegacy
      : (portalSupabase && typeof portalSupabase.portalNormalizarNomeClubeParaBucket === 'function')
        ? portalSupabase.portalNormalizarNomeClubeParaBucket
        : (s) => s;

    const PORTAL_SUPABASE_CONFIG = portalSupabase && portalSupabase.PORTAL_SUPABASE_CONFIG
      ? portalSupabase.PORTAL_SUPABASE_CONFIG
      : { url: 'https://bqkttaflhtsdkamgscnf.supabase.co', serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY };

    if (record.tabela_origem === 'atividades') {
      const atividade = await buscarAtividadePorId(record.registro_id);
      if (!atividade) return null;

      bucket = 'atividades-fotos';
      clubeNome = atividade.clube_nome;
      registroId = atividade.id_unico_original || atividade.id;
      caminhoBase = `atividades/${clubeParaBucket(clubeNome)}/${registroId}/foto_oficial/`;

    } else if (record.tabela_origem === 'campanhas') {
      const campanha = await buscarCampanhaPorId(record.registro_id);
      if (!campanha) return null;

      clubeNome = campanha.clube_nome;
      registroId = campanha.id_unico_original || campanha.id;

      if (record.campo_url === 'foto_oficial_url') {
        bucket = 'campanhas-fotos';
        caminhoBase = `campanhas/${clubeParaBucket(clubeNome)}/${registroId}/foto_oficial/`;
      } else if (record.campo_url === 'video_url') {
        bucket = 'campanhas-videos';
        caminhoBase = `campanhas/${clubeParaBucket(clubeNome)}/${registroId}/video/`;
      } else if (record.campo_url === 'outras_fotos_url') {
        bucket = 'campanhas-fotos';
        caminhoBase = `campanhas/${clubeParaBucket(clubeNome)}/${registroId}/outras_fotos/`;
      } else {
        return null;
      }

    } else if (record.tabela_origem === 'nominata_dirigentes') {
      const dirigente = await buscarDirigentePorId(record.registro_id);
      if (!dirigente) return null;

      bucket = 'dirigentes-fotos';
      clubeNome = dirigente.clube;
      registroId = dirigente.id;
      caminhoBase = `dirigentes/${clubeParaBucket(clubeNome)}/${registroId}/foto/`;
    } else {
      return null;
    }

    const urlList = `${PORTAL_SUPABASE_CONFIG.url}/storage/v1/object/list/${bucket}`;
    const payload = JSON.stringify({ prefix: caminhoBase, limit: 10 });
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
        const arquivo = arquivos[0];
        const nomeArquivo = (typeof arquivo === 'object' && arquivo !== null && arquivo.name) ? arquivo.name : String(arquivo);
        const caminhoCompleto = nomeArquivo.indexOf('/') >= 0 ? nomeArquivo : caminhoBase.replace(/\/$/, '') + '/' + nomeArquivo;
        return `${PORTAL_SUPABASE_CONFIG.url}/storage/v1/object/public/${bucket}/${caminhoCompleto}`;
      }
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar arquivo no Storage:', error);
    return null;
  }
}

// Helper: portalSupabaseFetch — delegates to portal_supabase if loaded, otherwise uses direct fetch
async function portalSupabaseFetch(path, options) {
  let portalSupabase;
  try { portalSupabase = require('./portal_supabase'); } catch (e) {}
  if (portalSupabase && typeof portalSupabase.portalSupabaseFetch === 'function') {
    return portalSupabase.portalSupabaseFetch(path, options);
  }
  const url = `https://bqkttaflhtsdkamgscnf.supabase.co/rest/v1/${path}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return await gasStyleFetch(url, {
    method: options.method || 'GET',
    headers: Object.assign({ 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, options.headers || {}),
    payload: options.payload,
    muteHttpExceptions: true
  });
}

/**
 * Busca atividade por ID
 */
async function buscarAtividadePorId(id) {
  try {
    const url = `atividades?id=eq.${encodeURIComponent(String(id))}&select=*&limit=1`;
    const resp = await portalSupabaseFetch(url, { method: 'GET' });

    if (resp.getResponseCode() === 200) {
      const dados = JSON.parse(resp.getContentText() || '[]');
      return dados.length > 0 ? dados[0] : null;
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar atividade:', error);
    return null;
  }
}

/**
 * Busca campanha por ID
 */
async function buscarCampanhaPorId(id) {
  try {
    const url = `campanhas?id=eq.${encodeURIComponent(String(id))}&select=*&limit=1`;
    const resp = await portalSupabaseFetch(url, { method: 'GET' });

    if (resp.getResponseCode() === 200) {
      const dados = JSON.parse(resp.getContentText() || '[]');
      return dados.length > 0 ? dados[0] : null;
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar campanha:', error);
    return null;
  }
}

/**
 * Busca dirigente por ID
 */
async function buscarDirigentePorId(id) {
  try {
    const url = `nominata_dirigentes?id=eq.${encodeURIComponent(String(id))}&select=*&limit=1`;
    const resp = await portalSupabaseFetch(url, { method: 'GET' });

    if (resp.getResponseCode() === 200) {
      const dados = JSON.parse(resp.getContentText() || '[]');
      return dados.length > 0 ? dados[0] : null;
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar dirigente:', error);
    return null;
  }
}

/**
 * Atualiza URL no backup
 */
async function atualizarUrlNoBackup(backupId, urlNova) {
  try {
    const url = `backup_urls_google_drive?id=eq.${encodeURIComponent(String(backupId))}`;
    const payload = JSON.stringify({
      url_nova: urlNova,
      status_migracao: 'migrado',
      data_migracao: new Date().toISOString()
    });

    const resp = await portalSupabaseFetch(url, {
      method: 'PATCH',
      payload: payload
    });

    return resp.getResponseCode() === 200 || resp.getResponseCode() === 204;
  } catch (error) {
    console.error('Erro ao atualizar backup:', error);
    return false;
  }
}

/**
 * Marca registro do backup como erro
 */
async function marcarBackupComoErro(backupId, motivo) {
  try {
    const url = `backup_urls_google_drive?id=eq.${encodeURIComponent(String(backupId))}`;
    const payload = JSON.stringify({
      status_migracao: 'erro',
      observacoes: motivo
    });

    const resp = await portalSupabaseFetch(url, {
      method: 'PATCH',
      payload: payload
    });

    return resp.getResponseCode() === 200 || resp.getResponseCode() === 204;
  } catch (error) {
    console.error('Erro ao marcar backup como erro:', error);
    return false;
  }
}

module.exports = {
  fazerMatchStorageComBackup,
  buscarRegistrosBackupPendentes,
  buscarArquivoNoStorage,
  buscarAtividadePorId,
  buscarCampanhaPorId,
  buscarDirigentePorId,
  atualizarUrlNoBackup,
  marcarBackupComoErro
};
