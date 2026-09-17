'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const code = require('../lib/code.js');

// Configurações como a secretaria cadastra: um registro por gestão, com as datas dos
// 4 trimestres. O AL é gravado com barra; a nominata usa traço.
const CONFIGS = [
  {
    al: '2024/2025',
    trimestre1Inicio: '2024-07-01', trimestre1Fim: '2024-09-30',
    trimestre2Inicio: '2024-10-01', trimestre2Fim: '2024-12-31',
    trimestre3Inicio: '2025-01-01', trimestre3Fim: '2025-03-31',
    trimestre4Inicio: '2025-04-01', trimestre4Fim: '2025-06-30'
  },
  {
    al: '2025/2026',
    trimestre1Inicio: '2025-07-01', trimestre1Fim: '2025-09-30',
    trimestre2Inicio: '2025-10-01', trimestre2Fim: '2025-12-31',
    trimestre3Inicio: '2026-01-01', trimestre3Fim: '2026-03-31',
    trimestre4Inicio: '2026-04-01', trimestre4Fim: '2026-06-30'
  },
  {
    al: '2026/2027',
    trimestre1Inicio: '2026-07-01', trimestre1Fim: '2026-09-30',
    trimestre2Inicio: '2026-10-01', trimestre2Fim: '2026-12-31',
    trimestre3Inicio: '2027-01-01', trimestre3Fim: '2027-03-31',
    trimestre4Inicio: '2027-04-01', trimestre4Fim: '2027-06-30'
  }
];

describe('_resolverAlPorConfiguracoes', () => {
  it('devolve o AL cadastrado que contém a data, já com traço', () => {
    const data = code._dataMeioDiaLocal('2025-11-14');
    assert.equal(code._resolverAlPorConfiguracoes(data, CONFIGS), '2025-2026');
  });

  it('separa gestões vizinhas na virada de 30/06 para 01/07', () => {
    assert.equal(code._resolverAlPorConfiguracoes(code._dataMeioDiaLocal('2026-06-30'), CONFIGS), '2025-2026');
    assert.equal(code._resolverAlPorConfiguracoes(code._dataMeioDiaLocal('2026-07-01'), CONFIGS), '2026-2027');
  });

  it('devolve vazio quando a data não cai em nenhuma gestão cadastrada', () => {
    assert.equal(code._resolverAlPorConfiguracoes(code._dataMeioDiaLocal('2030-03-10'), CONFIGS), '');
  });
});

describe('_obterDataReferenciaEvento', () => {
  it('usa a data de início do evento', () => {
    const d = code._obterDataReferenciaEvento({
      dataInicio: '2025-11-14T00:00:00.000Z',
      dataFim: '2025-11-16T00:00:00.000Z'
    });
    assert.equal(d.getFullYear(), 2025);
    assert.equal(d.getMonth() + 1, 11);
    assert.equal(d.getDate(), 14);
  });

  it('cai para dataEvento e depois dataFim quando não há início', () => {
    assert.equal(code._obterDataReferenciaEvento({ dataEvento: '2024-08-10' }).getMonth() + 1, 8);
    assert.equal(code._obterDataReferenciaEvento({ dataFim: '2024-09-20' }).getDate(), 20);
  });
});

describe('_obterAlDoEvento', () => {
  let original;

  beforeEach(() => {
    original = global.portalListarConfiguracoes;
    global.portalListarConfiguracoes = async () => CONFIGS;
  });

  afterEach(() => {
    global.portalListarConfiguracoes = original;
  });

  it('traz a gestão anterior para um evento realizado nela', async () => {
    const al = await code._obterAlDoEvento({ dataInicio: '2025-11-14T00:00:00.000Z' });
    assert.equal(al, '2025-2026');
  });

  it('traz a gestão vigente para um evento realizado nela', async () => {
    const al = await code._obterAlDoEvento({ dataInicio: '2026-09-12T00:00:00.000Z' });
    assert.equal(al, '2026-2027');
  });

  it('usa a regra julho–junho quando a data não está em nenhuma gestão cadastrada', async () => {
    assert.equal(await code._obterAlDoEvento({ dataInicio: '2030-03-10' }), '2029-2030');
    assert.equal(await code._obterAlDoEvento({ dataInicio: '2030-08-10' }), '2030-2031');
  });

  it('não quebra quando a listagem de configurações falha', async () => {
    global.portalListarConfiguracoes = async () => { throw new Error('supabase fora do ar'); };
    assert.equal(await code._obterAlDoEvento({ dataInicio: '2025-11-14' }), '2025-2026');
  });

  it('evento sem data nenhuma cai na gestão vigente', async () => {
    const esperado = code._resolverAlPorConfiguracoes(code._dataMeioDiaLocal(new Date()), CONFIGS)
      || code._alPelaRegraJulhoJunho(new Date());
    assert.equal(await code._obterAlDoEvento({ nome: 'Evento sem datas' }), esperado);
  });
});

// Relatório de inscritos do Gabinete Distrital: o "pessoaTipo" gravado na inscrição já é o
// cargo que a pessoa tem NO GABINETE/DISTRITO (ex.: "Diretor(a) de Zona 1"), escolhido na
// nominata distrital no momento da inscrição — não deve ser trocado pelo cargo que ela tem
// na nominata do PRÓPRIO clube dela (usada só para achar posse/RTMA/contato), senão os dois
// papéis se misturam no relatório.
describe('_cargoVemDaInscricaoGD', () => {
  it('reconhece o clube "Gabinete Distrital" (com variação de maiúsculas/espaços)', () => {
    assert.equal(code._cargoVemDaInscricaoGD('Gabinete Distrital'), true);
    assert.equal(code._cargoVemDaInscricaoGD('GABINETE DISTRITAL'), true);
    assert.equal(code._cargoVemDaInscricaoGD('  Gabinete Distrital  '), true);
  });

  it('não confunde um clube comum com o Gabinete Distrital', () => {
    assert.equal(code._cargoVemDaInscricaoGD('Ômega Cunha Porã'), false);
    assert.equal(code._cargoVemDaInscricaoGD(''), false);
    assert.equal(code._cargoVemDaInscricaoGD(null), false);
    assert.equal(code._cargoVemDaInscricaoGD(undefined), false);
  });
});
