import express from 'express';
import { exigirPosto, limitar } from './middleware.js';
import { baterPontoPorBiometria, registrarMarcacao, ErroMarcacao } from '../servicos/marcacao.js';
import { comprovanteTexto, comprovantePdf, dadosComprovante } from '../fiscal/comprovante.js';
import { driver } from '../biometria/index.js';
import { ErroBiometria } from '../biometria/driver.js';
import { buscarPorCpf } from '../servicos/trabalhadores.js';
import { sessaoValida } from '../servicos/usuarios.js';
import { registrarAuditoria } from '../servicos/auditoria.js';
import { lerRegistro } from '../dominio/livro.js';

export const rotasPonto = express.Router();

// Todas as rotas de marcacao exigem posto autorizado + rede autorizada.
rotasPonto.use(exigirPosto);

/** Estado do leitor, para o quiosque exibir "pronto" ou "leitor offline". */
rotasPonto.get('/status', async (req, res) => {
  const estado = await driver().status();
  res.json({ posto: { id: req.posto.id, nome: req.posto.nome }, leitor: estado });
});

/**
 * Marcacao por biometria — o caminho normal, e o unico que o trabalhador usa.
 * Nao recebe CPF nem matricula: quem diz quem e a pessoa e a digital dela.
 */
rotasPonto.post('/marcar', limitar({ janelaMs: 60000, maximo: 60 }), async (req, res) => {
  try {
    const marcacao = await baterPontoPorBiometria({ postoId: req.posto.id });
    res.json({
      ok: true,
      repetida: marcacao.repetida === true,
      marcacao: dadosComprovante(marcacao),
      comprovanteTexto: comprovanteTexto(marcacao)
    });
  } catch (erro) {
    responderErro(res, erro);
  }
});

/**
 * Marcacao por credencial alternativa. So existe para nao deixar ninguem sem
 * registrar quando a digital nao le — corte no dedo, desgaste, curativo.
 * Exige supervisor autenticado no momento e justificativa; gera evento
 * sensivel no AFD. E deliberadamente incomodo: e uma excecao, nao um atalho.
 */
rotasPonto.post('/marcar-alternativo', limitar({ janelaMs: 60000, maximo: 10 }), (req, res) => {
  try {
    const supervisor = sessaoValida(req.body?.sessaoSupervisor);
    if (!supervisor || !['admin', 'rh', 'supervisor'].includes(supervisor.papel)) {
      return res.status(403).json({
        erro: 'Esta marcação precisa ser autorizada por um supervisor.',
        codigo: 'SUPERVISOR'
      });
    }
    const trabalhador = buscarPorCpf(req.body?.cpf);
    if (!trabalhador) {
      return res.status(404).json({ erro: 'CPF não encontrado no cadastro.' });
    }

    const marcacao = registrarMarcacao({
      trabalhadorId: trabalhador.id,
      postoId: req.posto.id,
      metodo: 'alternativo',
      justificativa: req.body?.justificativa,
      autorizadoPor: supervisor.login
    });

    res.json({
      ok: true,
      marcacao: dadosComprovante(marcacao),
      comprovanteTexto: comprovanteTexto(marcacao)
    });
  } catch (erro) {
    responderErro(res, erro);
  }
});

/** Comprovante em PDF da ultima marcacao emitida no posto. */
rotasPonto.get('/comprovante/:nsr.pdf', async (req, res) => {
  const registro = lerRegistro(Number(req.params.nsr));
  if (!registro || registro.tipo !== '7') {
    return res.status(404).json({ erro: 'Marcação não encontrada.' });
  }
  const trabalhador = buscarPorCpf(registro.conteudo.cpf);
  const pdf = await comprovantePdf({
    nsr: registro.nsr, dh: registro.dh, hash: registro.hash,
    cpf: registro.conteudo.cpf, nome: trabalhador?.nome || '',
    metodo: registro.conteudo.metodo, postoId: registro.conteudo.postoId
  });
  res.type('application/pdf')
    .set('content-disposition', `inline; filename="comprovante-${registro.nsr}.pdf"`)
    .send(pdf);
});

function responderErro(res, erro) {
  if (erro instanceof ErroBiometria || erro instanceof ErroMarcacao) {
    registrarAuditoria({ ator: 'quiosque', acao: 'marcacao.erro', detalhe: `${erro.codigo}: ${erro.message}` });
    return res.status(400).json({ erro: erro.message, codigo: erro.codigo });
  }
  console.error('[ponto]', erro);
  return res.status(500).json({ erro: 'Falha interna ao registrar o ponto.' });
}
