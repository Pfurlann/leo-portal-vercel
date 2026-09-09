'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const RankingAssociacao = require('../public/js/ranking-associacao.js');

const HOJE = new Date(2026, 8, 9); // 9 set 2026

describe('RankingAssociacao.tipoEfetivo — Camila Crivelatti', () => {
  it('mostra Pré LEO mesmo com tipo gravado Associado LEO/Leão sem posse no Lions', () => {
    const camila = {
      nome: 'Camila Joana Crivelatti',
      status: 'Ativo',
      tipo: 'Associado LEO/Leão',
      dataInicioPreLeo: '12/04/2026',
      associadoDesde: null,
      dataPosseLions: null,
      dataNascimento: '25/01/2006',
      dataDesligamento: null
    };
    assert.equal(RankingAssociacao.tipoEfetivo(camila, HOJE), 'Pré LEO');
  });
});

describe('RankingAssociacao.resolverPessoas — Maiara Schultz duplicada', () => {
  it('escolhe o cadastro Associado LEO e ignora o Pré LEO com início no futuro', () => {
    const duplicatas = [
      {
        nome: 'Maiara Schultz',
        status: 'Ativo',
        tipo: 'Pré LEO',
        dataInicioPreLeo: '21/12/2026',
        associadoDesde: null,
        dataPosseLions: null,
        dataNascimento: '25/01/1999',
        dataDesligamento: null,
        created_at: '2026-03-27T23:32:43.064468+00:00'
      },
      {
        nome: 'Maiara Schultz',
        status: 'Ativo',
        tipo: 'Associado LEO',
        dataInicioPreLeo: '21/12/2025',
        associadoDesde: '12/04/2026',
        dataPosseLions: null,
        dataNascimento: '25/01/1999',
        dataDesligamento: null,
        numeroAssociado: '27290951',
        created_at: '2026-03-27T23:40:24.307331+00:00'
      }
    ];
    const resolvidas = RankingAssociacao.resolverPessoas(duplicatas, HOJE);
    assert.equal(resolvidas.length, 1);
    assert.equal(resolvidas[0].tipo, 'Associado LEO');
    assert.equal(resolvidas[0].numeroAssociado, '27290951');
  });
});

describe('RankingAssociacao — Ômega Guaraciaba', () => {
  it('reclassifica Gustavo Brustolin para Associado LEO/Leão após 31 anos com posse Lions', () => {
    const gustavo = {
      nome: 'Gustavo Brustolin',
      status: 'Ativo',
      tipo: 'Associado LEO e LEO/Leão',
      dataInicioPreLeo: '01/03/2021',
      associadoDesde: '16/05/2021',
      dataPosseLions: '04/12/2025',
      dataNascimento: '09/12/1994',
      dataDesligamento: null
    };
    assert.equal(RankingAssociacao.tipoEfetivo(gustavo, HOJE), 'Associado LEO/Leão');
  });

  it('exclui Kevin Mateus Ledur (Ativo no banco, mas com data de desligamento)', () => {
    const kevin = {
      nome: 'Kevin Mateus Ledur',
      status: 'Ativo',
      tipo: 'Associado LEO',
      dataInicioPreLeo: '01/09/2024',
      associadoDesde: '14/12/2024',
      dataDesligamento: '27/03/2026',
      dataNascimento: '29/04/2002'
    };
    assert.equal(RankingAssociacao.tipoEfetivo(kevin, HOJE), null);
    assert.equal(RankingAssociacao.resolverPessoas([kevin], HOJE).length, 0);
  });

  it('exclui pessoas inativas do ranking mesmo com tipo gravado', () => {
    const gabrieli = {
      nome: 'Gabrieli Luisa Mota',
      status: 'Inativo',
      tipo: 'Associado LEO',
      dataInicioPreLeo: '07/09/2024',
      associadoDesde: '01/03/2025',
      dataDesligamento: '11/04/2026',
      dataNascimento: '16/11/2006'
    };
    assert.equal(RankingAssociacao.resolverPessoas([gabrieli], HOJE).length, 0);
  });
});

describe('RankingAssociacao.resolverPessoas — filtro de tipo', () => {
  it('filtra pela tipo efetivo, não pelo valor gravado', () => {
    const pessoas = [
      {
        nome: 'Camila Joana Crivelatti',
        status: 'Ativo',
        tipo: 'Associado LEO/Leão',
        dataInicioPreLeo: '12/04/2026',
        dataNascimento: '25/01/2006'
      },
      {
        nome: 'Maiara Schultz',
        status: 'Ativo',
        tipo: 'Pré LEO',
        dataInicioPreLeo: '21/12/2026'
      },
      {
        nome: 'Maiara Schultz',
        status: 'Ativo',
        tipo: 'Associado LEO',
        dataInicioPreLeo: '21/12/2025',
        associadoDesde: '12/04/2026',
        dataNascimento: '25/01/1999',
        numeroAssociado: '27290951'
      }
    ];
    const resolvidas = RankingAssociacao.resolverPessoas(pessoas, HOJE);
    const tipos = resolvidas.map(p => p.tipo).sort();
    assert.deepEqual(tipos, ['Associado LEO', 'Pré LEO']);
    const porTipo = RankingAssociacao.filtrarPorTipo(resolvidas, 'Pré LEO');
    assert.equal(porTipo.length, 1);
    assert.equal(porTipo[0].nome, 'Camila Joana Crivelatti');
  });
});
