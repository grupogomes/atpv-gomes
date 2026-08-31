import express from 'express';
import { exigirUsuario, limitar } from './middleware.js';
import { autenticar, encerrarSessao, criarUsuario, listarUsuarios } from '../servicos/usuarios.js';
import {
  salvarTrabalhador, listarTrabalhadores, buscarPorId,
  registrarConsentimento, consentimentoVigente, revogarConsentimento
} from '../servicos/trabalhadores.js';
import { provisionarPosto, listarPostos, desativarPosto } from '../servicos/postos.js';
import { cadastrarTemplate, revogarTemplate, resumoPorTrabalhador } from '../servicos/biometria.js';
import { driver } from '../biometria/index.js';
import { espelhoDePonto, lancarTratamento } from '../servicos/jornada.js';
import { gerarAfd, nomeArquivoAfd, conferirAfd } from '../fiscal/afd.js';
import { gerarAej, nomeArquivoAej } from '../fiscal/aej.js';
import { assinarSePossivel, situacaoAssinatura } from '../fiscal/assinatura.js';
import { verificarIntegridade } from '../dominio/livro.js';
import { listarAuditoria, registrarAuditoria } from '../servicos/auditoria.js';
import { empregadorAtual, registrarEmpregador } from '../servicos/empregador.js';
import { db } from '../db/index.js';
import { paraDH } from '../dominio/datas.js';
import { sha256 } from '../seguranca/cripto.js';
import { config } from '../config.js';
import { TERMO_BIOMETRIA } from '../dominio/termo.js';
import { NATUREZAS } from '../dominio/naturezas.js';
import { definirDedoSimulado, simuladorAtivo } from './simulador.js';
import {
  salvarAtestado, avaliarAtestado, listarAtestados, buscarAtestado,
  lerCid, resumoDashboard
} from '../servicos/atestados.js';

export const rotasAdmin = express.Router();

// --------------------------------------------------------------------------
// Sessao
// --------------------------------------------------------------------------
rotasAdmin.post('/login', limitar({ janelaMs: 300000, maximo: 10 }), (req, res) => {
  const sessao = autenticar(req.body?.login, req.body?.senha, req.ip);
  if (!sessao) return res.status(401).json({ erro: 'Login ou senha inválidos.' });
  res.json(sessao);
});

rotasAdmin.post('/logout', exigirUsuario(), (req, res) => {
  encerrarSessao(req.get('x-sessao'));
  res.json({ ok: true });
});

rotasAdmin.get('/eu', exigirUsuario(), (req, res) => res.json(req.usuario));

// --------------------------------------------------------------------------
// Empregador
// --------------------------------------------------------------------------
rotasAdmin.get('/empregador', exigirUsuario(), (req, res) => res.json(empregadorAtual()));

rotasAdmin.put('/empregador', exigirUsuario(['admin']), (req, res) => {
  res.json(registrarEmpregador(req.body, req.usuario.login, req.ipOrigem));
});

// --------------------------------------------------------------------------
// Trabalhadores
// --------------------------------------------------------------------------
rotasAdmin.get('/trabalhadores', exigirUsuario(), (req, res) => {
  const lista = listarTrabalhadores({ incluirInativos: req.query.todos === '1' });
  const biometrias = new Map(resumoPorTrabalhador().map((b) => [b.trabalhador_id, b.dedos]));
  res.json(lista.map((t) => ({
    ...t,
    dedosCadastrados: biometrias.get(t.id) || 0,
    consentimento: Boolean(consentimentoVigente(t.id))
  })));
});

rotasAdmin.post('/trabalhadores', exigirUsuario(['admin', 'rh']), (req, res) => {
  try {
    res.json(salvarTrabalhador(req.body, req.usuario.login, req.ipOrigem));
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// --------------------------------------------------------------------------
// Escala contratual
// --------------------------------------------------------------------------
rotasAdmin.put('/trabalhadores/:id/escala', exigirUsuario(['admin', 'rh']), (req, res) => {
  const trabalhadorId = Number(req.params.id);
  const { vigenciaInicio, dias } = req.body || {};
  if (!vigenciaInicio || !Array.isArray(dias)) {
    return res.status(400).json({ erro: 'Informe vigenciaInicio e a lista de dias.' });
  }
  const inserir = db().prepare(`
    INSERT INTO escala (trabalhador_id, vigencia_inicio, vigencia_fim, dia_semana, entrada, saida, intervalo_min)
    VALUES (?, ?, NULL, ?, ?, ?, ?)
    ON CONFLICT (trabalhador_id, vigencia_inicio, dia_semana) DO UPDATE SET
      entrada = excluded.entrada, saida = excluded.saida, intervalo_min = excluded.intervalo_min
  `);
  db().transaction(() => {
    for (const dia of dias) {
      inserir.run(trabalhadorId, vigenciaInicio, dia.diaSemana, dia.entrada || null,
        dia.saida || null, Number(dia.intervaloMin || 0));
    }
  })();
  registrarAuditoria({ ator: req.usuario.login, acao: 'escala.atualizacao', alvo: `trabalhador:${trabalhadorId}`, ip: req.ipOrigem });
  res.json({ ok: true });
});

// --------------------------------------------------------------------------
// Biometria — cadastro assistido pelo RH, no leitor da empresa
// --------------------------------------------------------------------------
rotasAdmin.get('/termo-biometria', exigirUsuario(), (req, res) => {
  res.json({ versao: TERMO_BIOMETRIA.versao, texto: TERMO_BIOMETRIA.texto, hash: sha256(TERMO_BIOMETRIA.texto) });
});

rotasAdmin.post('/trabalhadores/:id/consentimento', exigirUsuario(['admin', 'rh']), (req, res) => {
  const trabalhador = buscarPorId(Number(req.params.id));
  if (!trabalhador) return res.status(404).json({ erro: 'Trabalhador não encontrado.' });
  registrarConsentimento({
    trabalhadorId: trabalhador.id,
    versaoTermo: TERMO_BIOMETRIA.versao,
    textoTermo: TERMO_BIOMETRIA.texto,
    finalidade: 'Registro eletronico de jornada de trabalho (CLT art. 74; Portaria MTP 671/2021)',
    ator: req.usuario.login,
    ip: req.ipOrigem
  });
  res.json({ ok: true });
});

rotasAdmin.delete('/trabalhadores/:id/consentimento', exigirUsuario(['admin', 'rh']), (req, res) => {
  const id = Number(req.params.id);
  revogarConsentimento(id, req.usuario.login, req.ipOrigem);
  // Revogado o consentimento, o dado biometrico e eliminado (LGPD art. 18, VI).
  for (const linha of db().prepare('SELECT dedo FROM biometria WHERE trabalhador_id = ? AND revogado_em IS NULL').all(id)) {
    revogarTemplate({ trabalhadorId: id, dedo: linha.dedo, ator: req.usuario.login, ip: req.ipOrigem });
  }
  res.json({ ok: true, aviso: 'Biometria eliminada. Cadastre uma credencial alternativa para este trabalhador.' });
});

rotasAdmin.post('/simulador/dedo', exigirUsuario(['admin', 'rh']), definirDedoSimulado);

rotasAdmin.post('/trabalhadores/:id/biometria', exigirUsuario(['admin', 'rh']), async (req, res) => {
  try {
    const trabalhador = buscarPorId(Number(req.params.id));
    if (!trabalhador) return res.status(404).json({ erro: 'Trabalhador não encontrado.' });
    if (!consentimentoVigente(trabalhador.id)) {
      return res.status(412).json({
        erro: 'Registre primeiro o consentimento informado do trabalhador (LGPD art. 11).',
        codigo: 'SEM_CONSENTIMENTO'
      });
    }
    const dedo = String(req.body?.dedo || '').trim();
    if (!dedo) return res.status(400).json({ erro: 'Informe qual dedo está sendo cadastrado.' });

    const captura = await driver().capturar({ timeoutMs: 25000 });
    if (captura.qualidade < 50) {
      return res.status(422).json({
        erro: `Qualidade da captura insuficiente (${captura.qualidade}). Limpe o sensor e repita.`
      });
    }
    cadastrarTemplate({
      trabalhadorId: trabalhador.id, dedo, template: captura.template,
      qualidade: captura.qualidade, modelo: captura.modelo,
      ator: req.usuario.login, ip: req.ipOrigem
    });
    res.json({ ok: true, qualidade: captura.qualidade, modelo: captura.modelo });
  } catch (erro) {
    res.status(400).json({ erro: erro.message, codigo: erro.codigo });
  }
});

rotasAdmin.delete('/trabalhadores/:id/biometria/:dedo', exigirUsuario(['admin', 'rh']), (req, res) => {
  const removido = revogarTemplate({
    trabalhadorId: Number(req.params.id), dedo: req.params.dedo,
    ator: req.usuario.login, ip: req.ipOrigem
  });
  res.json({ ok: removido });
});

// --------------------------------------------------------------------------
// Postos
// --------------------------------------------------------------------------
rotasAdmin.get('/postos', exigirUsuario(), (req, res) => res.json(listarPostos()));

rotasAdmin.post('/postos', exigirUsuario(['admin']), (req, res) => {
  try {
    const resultado = provisionarPosto({
      id: req.body?.id, nome: req.body?.nome, local: req.body?.local,
      ator: req.usuario.login, ip: req.ipOrigem
    });
    res.json({
      ...resultado,
      aviso: 'Guarde o token agora: ele não pode ser consultado depois, apenas reemitido.'
    });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

rotasAdmin.delete('/postos/:id', exigirUsuario(['admin']), (req, res) => {
  desativarPosto(req.params.id, req.usuario.login, req.ipOrigem);
  res.json({ ok: true });
});

// --------------------------------------------------------------------------
// Espelho de ponto e tratamento
// --------------------------------------------------------------------------
rotasAdmin.get('/espelho/:id', exigirUsuario(), (req, res) => {
  const { de, ate } = req.query;
  if (!de || !ate) return res.status(400).json({ erro: 'Informe de e até (AAAA-MM-DD).' });
  res.json(espelhoDePonto(Number(req.params.id), { de, ate }));
});

rotasAdmin.post('/tratamento', exigirUsuario(['admin', 'rh']), (req, res) => {
  try {
    lancarTratamento({ ...req.body, autorizadoPor: req.usuario.login });
    registrarAuditoria({
      ator: req.usuario.login, acao: 'jornada.tratamento',
      alvo: `trabalhador:${req.body?.trabalhadorId}`,
      detalhe: `${req.body?.tipo} em ${req.body?.data}: ${req.body?.motivo}`, ip: req.ipOrigem
    });
    res.json({ ok: true });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// --------------------------------------------------------------------------
// Arquivos fiscais
// --------------------------------------------------------------------------
rotasAdmin.get('/afd', exigirUsuario(['admin', 'rh']), (req, res) => {
  try {
    const inicio = new Date(`${req.query.de}T00:00:00${config.fuso}`);
    const fim = new Date(`${req.query.ate}T23:59:59${config.fuso}`);
    const afd = gerarAfd({ inicio, fim });
    const conteudo = assinarSePossivel(Buffer.from(afd.conteudo, 'latin1'), { tipo: 'cades' });
    const nome = nomeArquivoAfd(inicio, fim);

    db().prepare(`
      INSERT INTO exportacao (tipo, inicio, fim, nsr_inicial, nsr_final, arquivo, sha256, gerado_por, gerado_em)
      VALUES ('AFD', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.query.de, req.query.ate, afd.nsrInicial, afd.nsrFinal, nome, afd.sha256,
      req.usuario.login, paraDH(new Date()));
    registrarAuditoria({ ator: req.usuario.login, acao: 'afd.exportacao', detalhe: nome, ip: req.ipOrigem });

    res.type('text/plain; charset=iso-8859-1')
      .set('content-disposition', `attachment; filename="${nome}"`)
      .set('x-sha256', afd.sha256)
      .send(conteudo);
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

rotasAdmin.get('/aej', exigirUsuario(['admin', 'rh']), (req, res) => {
  try {
    const { de, ate } = req.query;
    const aej = gerarAej({ de, ate });
    const conteudo = assinarSePossivel(Buffer.from(aej.conteudo, 'latin1'), { tipo: 'cades' });
    const nome = nomeArquivoAej(de, ate);
    db().prepare(`
      INSERT INTO exportacao (tipo, inicio, fim, arquivo, sha256, gerado_por, gerado_em)
      VALUES ('AEJ', ?, ?, ?, ?, ?, ?)
    `).run(de, ate, nome, aej.sha256, req.usuario.login, paraDH(new Date()));
    registrarAuditoria({ ator: req.usuario.login, acao: 'aej.exportacao', detalhe: nome, ip: req.ipOrigem });
    res.type('text/plain; charset=iso-8859-1')
      .set('content-disposition', `attachment; filename="${nome}"`)
      .send(conteudo);
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

rotasAdmin.post('/afd/conferir', exigirUsuario(), express.text({ limit: '50mb' }), (req, res) => {
  res.json(conferirAfd(String(req.body || '')));
});

rotasAdmin.get('/exportacoes', exigirUsuario(), (req, res) => {
  res.json(db().prepare('SELECT * FROM exportacao ORDER BY id DESC LIMIT 100').all());
});

// --------------------------------------------------------------------------
// Saude, integridade e auditoria
// --------------------------------------------------------------------------
rotasAdmin.get('/saude', exigirUsuario(), async (req, res) => {
  const integridade = verificarIntegridade();
  const leitor = await driver().status();
  const assinatura = situacaoAssinatura();
  const semBiometria = db().prepare(`
    SELECT t.cpf, t.nome FROM trabalhador t
     WHERE t.ativo = 1 AND NOT EXISTS (
       SELECT 1 FROM biometria b WHERE b.trabalhador_id = t.id AND b.revogado_em IS NULL
     )
  `).all();

  const alertas = [];
  if (!integridade.integro) alertas.push('Cadeia de registros com inconsistências — investigue imediatamente.');
  if (!leitor.disponivel) alertas.push('Leitor biométrico indisponível.');
  if (!assinatura.ativa) alertas.push(assinatura.alerta);
  if (semBiometria.length) alertas.push(`${semBiometria.length} trabalhador(es) ativo(s) sem biometria cadastrada.`);
  if (config.biometria.driver === 'simulador') {
    alertas.push('Driver biométrico em modo SIMULADOR: não usar em produção.');
  }

  res.json({
    integridade, leitor, assinatura, semBiometria, alertas,
    rep: config.rep, modoTeste: simuladorAtivo()
  });
});

rotasAdmin.get('/auditoria', exigirUsuario(['admin', 'rh']), (req, res) => {
  res.json(listarAuditoria({ inicio: req.query.de, fim: req.query.ate, limite: 500 }));
});

// --------------------------------------------------------------------------
// Usuarios administrativos
// --------------------------------------------------------------------------
rotasAdmin.get('/usuarios', exigirUsuario(['admin']), (req, res) => res.json(listarUsuarios()));

rotasAdmin.post('/usuarios', exigirUsuario(['admin']), (req, res) => {
  try {
    criarUsuario(req.body, req.usuario.login, req.ipOrigem);
    res.json({ ok: true });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// --------------------------------------------------------------------------
// Atestados e painel de ausencias
// --------------------------------------------------------------------------

/** Catalogo de naturezas, com o fundamento legal de cada uma. */
rotasAdmin.get('/naturezas', exigirUsuario(), (req, res) => res.json(NATUREZAS));

rotasAdmin.get('/atestados', exigirUsuario(), (req, res) => {
  res.json(listarAtestados({
    de: req.query.de, ate: req.query.ate,
    trabalhadorId: req.query.trabalhador ? Number(req.query.trabalhador) : null,
    situacao: req.query.situacao || null
  }));
});

rotasAdmin.post('/atestados', exigirUsuario(['admin', 'rh']), (req, res) => {
  try {
    res.json(salvarAtestado(req.body, req.usuario.login, req.ipOrigem));
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

rotasAdmin.post('/atestados/:id/avaliar', exigirUsuario(['admin', 'rh']), (req, res) => {
  try {
    res.json(avaliarAtestado({
      id: Number(req.params.id),
      situacao: req.body?.situacao,
      motivo: req.body?.motivo
    }, req.usuario.login, req.ipOrigem));
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

/**
 * Leitura do CID — dado de saude, portanto sensivel (LGPD art. 5º, II).
 * Restrito a admin e RH, e cada acesso vai para a auditoria.
 */
rotasAdmin.get('/atestados/:id/cid', exigirUsuario(['admin', 'rh']), (req, res) => {
  const atestado = buscarAtestado(Number(req.params.id));
  if (!atestado) return res.status(404).json({ erro: 'Atestado não encontrado.' });
  const cid = lerCid(Number(req.params.id), req.usuario.login, req.ipOrigem);
  if (!cid) return res.json({ cid: null, aviso: 'Nenhum CID informado neste atestado.' });
  res.json({ cid });
});

/** Números já agregados do painel de atestados. */
rotasAdmin.get('/painel-atestados', exigirUsuario(), (req, res) => {
  const { de, ate } = req.query;
  if (!de || !ate) return res.status(400).json({ erro: 'Informe de e até (AAAA-MM-DD).' });
  try {
    res.json(resumoDashboard({ de, ate }));
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});
