import express from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { exigirPosto } from './middleware.js';
import { novoToken } from '../seguranca/cripto.js';
import { paraDH, deDH } from '../dominio/datas.js';
import { driver } from '../biometria/index.js';
import { candidatosAtivos } from '../servicos/biometria.js';
import { buscarPorId, buscarPorCpf } from '../servicos/trabalhadores.js';
import { marcacoesDoTrabalhador } from '../servicos/marcacao.js';
import { espelhoDePonto } from '../servicos/jornada.js';
import { comprovantePdf } from '../fiscal/comprovante.js';
import { lerRegistro } from '../dominio/livro.js';
import { formatarCpf } from '../dominio/cpf.js';
import { registrarAuditoria } from '../servicos/auditoria.js';

export const rotasTrabalhador = express.Router();

const DURACAO_MS = 15 * 60 * 1000;

/**
 * Portal do trabalhador — SOMENTE LEITURA.
 *
 * Aqui nao existe nenhuma rota que grave marcacao. E uma separacao proposital:
 * mesmo que alguem consiga uma sessao de portal, nao ha como bater ponto por
 * ela. Marcar ponto so acontece em /api/ponto, atras do posto autenticado.
 */

/** Abre sessao de leitura: exige dedo no leitor do posto. */
rotasTrabalhador.post('/abrir-sessao', exigirPosto, async (req, res) => {
  try {
    const captura = await driver().capturar({ timeoutMs: 20000 });
    const resultado = await driver().identificar(captura.template, candidatosAtivos());
    if (!resultado.encontrado || (resultado.score ?? 0) < config.biometria.scoreMinimo) {
      return res.status(401).json({ erro: 'Digital nao reconhecida.' });
    }
    const token = novoToken(24);
    const agora = new Date();
    db().prepare(`
      INSERT INTO sessao_trabalhador (token, trabalhador_id, criado_em, expira_em)
      VALUES (?, ?, ?, ?)
    `).run(token, resultado.trabalhadorId, paraDH(agora), paraDH(new Date(agora.getTime() + DURACAO_MS)));

    const trabalhador = buscarPorId(resultado.trabalhadorId);
    registrarAuditoria({
      ator: trabalhador.cpf, acao: 'portal.sessao', alvo: `posto:${req.posto.id}`, ip: req.ipOrigem
    });
    res.json({ token, expiraEm: paraDH(new Date(agora.getTime() + DURACAO_MS)), nome: trabalhador.nome });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

function exigirTrabalhador(req, res, proximo) {
  const token = req.get('x-sessao-trabalhador') || req.query.t;
  const linha = token && db().prepare('SELECT * FROM sessao_trabalhador WHERE token = ?').get(token);
  if (!linha || deDH(linha.expira_em) < new Date()) {
    return res.status(401).json({ erro: 'Sessao expirada. Encoste o dedo no leitor novamente.' });
  }
  req.trabalhador = buscarPorId(linha.trabalhador_id);
  return proximo();
}

/** Minhas marcacoes do periodo. */
rotasTrabalhador.get('/marcacoes', exigirTrabalhador, (req, res) => {
  const de = req.query.de || paraDH(new Date(Date.now() - 30 * 86400000)).slice(0, 10);
  const ate = req.query.ate || paraDH(new Date()).slice(0, 10);
  const fuso = config.fuso.replace(':', '');
  const registros = marcacoesDoTrabalhador(req.trabalhador.cpf, {
    inicio: `${de}T00:00:00${fuso}`, fim: `${ate}T23:59:59${fuso}`
  });
  res.json({
    trabalhador: { nome: req.trabalhador.nome, cpf: formatarCpf(req.trabalhador.cpf) },
    periodo: { de, ate },
    marcacoes: registros.map((r) => ({
      nsr: r.nsr, dh: r.dh, hash: r.hash, metodo: r.conteudo.metodo, posto: r.conteudo.postoId
    }))
  });
});

/** Meu espelho de ponto do periodo. */
rotasTrabalhador.get('/espelho', exigirTrabalhador, (req, res) => {
  const de = req.query.de || paraDH(new Date(Date.now() - 30 * 86400000)).slice(0, 10);
  const ate = req.query.ate || paraDH(new Date()).slice(0, 10);
  res.json(espelhoDePonto(req.trabalhador.id, { de, ate }));
});

/** Comprovante em PDF de uma marcacao minha. */
rotasTrabalhador.get('/comprovante/:nsr.pdf', exigirTrabalhador, async (req, res) => {
  const registro = lerRegistro(Number(req.params.nsr));
  if (!registro || registro.tipo !== '7' || registro.conteudo.cpf !== req.trabalhador.cpf) {
    return res.status(404).json({ erro: 'Comprovante nao encontrado.' });
  }
  const pdf = await comprovantePdf({
    nsr: registro.nsr, dh: registro.dh, hash: registro.hash,
    cpf: registro.conteudo.cpf, nome: req.trabalhador.nome,
    metodo: registro.conteudo.metodo, postoId: registro.conteudo.postoId
  });
  res.type('application/pdf')
    .set('content-disposition', `inline; filename="comprovante-${registro.nsr}.pdf"`)
    .send(pdf);
});

/**
 * Verificacao de autenticidade de um comprovante.
 *
 * Quem tem o papel na mao confere se ele bate com o que o sistema guarda.
 * Exige NSR **e** hash: sem o hash correto nada e revelado, entao a rota nao
 * serve para varrer os registros de terceiros.
 */
rotasTrabalhador.post('/verificar', express.json(), (req, res) => {
  const nsr = Number(req.body?.nsr);
  const hash = String(req.body?.hash || '').trim().toLowerCase();
  const registro = lerRegistro(nsr);
  if (!registro || registro.tipo !== '7' || registro.hash !== hash) {
    return res.json({ autentico: false, mensagem: 'Comprovante nao confere com os registros do sistema.' });
  }
  const trabalhador = buscarPorCpf(registro.conteudo.cpf);
  res.json({
    autentico: true,
    nsr: registro.nsr,
    dataHora: registro.dh,
    // Devolvemos apenas o que ja consta do papel que a pessoa tem em maos.
    cpf: formatarCpf(registro.conteudo.cpf),
    nome: trabalhador?.nome || '',
    mensagem: 'Comprovante autentico e integro.'
  });
});
