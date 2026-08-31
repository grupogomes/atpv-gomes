import test from 'node:test';
import assert from 'node:assert/strict';
import { bancoTemporario, CPF_A } from './ajuda.js';

bancoTemporario();
process.env.REDES_AUTORIZADAS = '127.0.0.1/32';

const { config } = await import('../src/config.js');
const { criarServidor } = await import('../src/http/servidor.js');
const { registrarEmpregador } = await import('../src/servicos/empregador.js');
const { salvarTrabalhador, registrarConsentimento } = await import('../src/servicos/trabalhadores.js');
const { cadastrarTemplate } = await import('../src/servicos/biometria.js');
const { provisionarPosto } = await import('../src/servicos/postos.js');
const { criarSimulador } = await import('../src/biometria/simulador.js');
const { definirDriver } = await import('../src/biometria/index.js');
const { criarUsuario, autenticar } = await import('../src/servicos/usuarios.js');
const { TERMO_BIOMETRIA } = await import('../src/dominio/termo.js');

registrarEmpregador({ tipoIdentificador: 1, documento: '11222333000181', razaoSocial: 'TESTE LTDA' }, 'teste');
const ana = salvarTrabalhador({ cpf: CPF_A, nome: 'Ana Souza' }, 'teste');
registrarConsentimento({
  trabalhadorId: ana.id, versaoTermo: TERMO_BIOMETRIA.versao,
  textoTermo: TERMO_BIOMETRIA.texto, finalidade: 'ponto', ator: 'teste'
});

const simulador = criarSimulador();
definirDriver(simulador);
simulador.apresentarDedo('ana-polegar');
const captura = await simulador.capturar();
cadastrarTemplate({
  trabalhadorId: ana.id, dedo: 'polegar_direito', template: captura.template,
  qualidade: 90, modelo: 'Simulador', ator: 'teste'
});

let posto = provisionarPosto({ id: 'RECEPCAO-01', nome: 'Recepcao', ator: 'teste' });
criarUsuario({ login: 'rh.joana', nome: 'Joana', senha: 'senha-bem-longa-1', papel: 'rh' }, 'teste');

const servidor = criarServidor().listen(0);
const base = `http://127.0.0.1:${servidor.address().port}`;
test.after(() => servidor.close());

const pedir = (rota, opcoes = {}) => fetch(`${base}${rota}`, {
  ...opcoes,
  headers: { 'content-type': 'application/json', ...(opcoes.headers || {}) }
});

test('marcar sem credencial de posto e recusado', async () => {
  const resposta = await pedir('/api/ponto/marcar', { method: 'POST', body: '{}' });
  assert.equal(resposta.status, 403);
  assert.equal((await resposta.json()).codigo, 'POSTO_NAO_AUTORIZADO');
});

test('marcar com token de posto errado e recusado', async () => {
  const resposta = await pedir('/api/ponto/marcar', {
    method: 'POST', body: '{}',
    headers: { 'x-posto-id': 'RECEPCAO-01', 'x-posto-token': 'token-inventado' }
  });
  assert.equal(resposta.status, 403);
});

test('marcar de fora das redes autorizadas e recusado', async () => {
  // Simula o celular do trabalhador em casa: rede de origem nao autorizada.
  const original = config.redesAutorizadas;
  config.redesAutorizadas = ['203.0.113.0/24'];
  try {
    const resposta = await pedir('/api/ponto/marcar', {
      method: 'POST', body: '{}',
      headers: { 'x-posto-id': 'RECEPCAO-01', 'x-posto-token': posto.token }
    });
    assert.equal(resposta.status, 403);
    assert.equal((await resposta.json()).codigo, 'REDE_NAO_AUTORIZADA');
  } finally {
    config.redesAutorizadas = original;
  }
});

test('cabecalho X-Forwarded-For nao burla a checagem de rede', async () => {
  const original = config.redesAutorizadas;
  config.redesAutorizadas = ['203.0.113.0/24'];
  try {
    const resposta = await pedir('/api/ponto/marcar', {
      method: 'POST', body: '{}',
      headers: {
        'x-posto-id': 'RECEPCAO-01', 'x-posto-token': posto.token,
        'x-forwarded-for': '203.0.113.9', 'x-real-ip': '203.0.113.9'
      }
    });
    assert.equal(resposta.status, 403);
    assert.equal((await resposta.json()).codigo, 'REDE_NAO_AUTORIZADA');
  } finally {
    config.redesAutorizadas = original;
  }
});

test('posto valido em rede valida registra o ponto pela digital', async () => {
  simulador.apresentarDedo('ana-polegar');
  const resposta = await pedir('/api/ponto/marcar', {
    method: 'POST', body: '{}',
    headers: { 'x-posto-id': 'RECEPCAO-01', 'x-posto-token': posto.token }
  });
  assert.equal(resposta.status, 200);
  const dados = await resposta.json();
  assert.equal(dados.ok, true);
  assert.equal(dados.marcacao.trabalhadorNome, 'Ana Souza');
  assert.equal(dados.marcacao.hash.length, 64);
  assert.match(dados.comprovanteTexto, /COMPROVANTE DE REGISTRO DE PONTO/);
});

test('posto desativado deixa de registrar imediatamente', async () => {
  const { desativarPosto } = await import('../src/servicos/postos.js');
  desativarPosto('RECEPCAO-01', 'teste');
  const resposta = await pedir('/api/ponto/marcar', {
    method: 'POST', body: '{}',
    headers: { 'x-posto-id': 'RECEPCAO-01', 'x-posto-token': posto.token }
  });
  assert.equal(resposta.status, 403);
  // Reativar reemite o token: o antigo nao serve mais, de proposito.
  const reativado = provisionarPosto({ id: 'RECEPCAO-01', nome: 'Recepcao', ator: 'teste' });
  const comTokenAntigo = await pedir('/api/ponto/marcar', {
    method: 'POST', body: '{}',
    headers: { 'x-posto-id': 'RECEPCAO-01', 'x-posto-token': posto.token }
  });
  assert.equal(comTokenAntigo.status, 403);
  posto = reativado;
});

test('o portal do trabalhador nao expoe nenhuma rota de marcacao', async () => {
  for (const rota of ['/api/portal/marcar', '/api/portal/marcacoes/nova', '/api/portal/ponto']) {
    const resposta = await pedir(rota, { method: 'POST', body: '{}' });
    assert.equal(resposta.status, 404, `${rota} nao deveria existir`);
  }
});

test('comprovante so e verificavel com NSR e hash corretos', async () => {
  const { lerRegistro } = await import('../src/dominio/livro.js');
  const { db } = await import('../src/db/index.js');
  const nsr = db().prepare("SELECT nsr FROM registro WHERE tipo='7' ORDER BY nsr DESC LIMIT 1").get().nsr;
  const registro = lerRegistro(nsr);

  const certo = await pedir('/api/portal/verificar', {
    method: 'POST', body: JSON.stringify({ nsr, hash: registro.hash })
  });
  assert.equal((await certo.json()).autentico, true);

  const errado = await pedir('/api/portal/verificar', {
    method: 'POST', body: JSON.stringify({ nsr, hash: 'f'.repeat(64) })
  });
  assert.equal((await errado.json()).autentico, false);
});

test('rotas administrativas exigem sessao', async () => {
  const resposta = await pedir('/api/admin/trabalhadores');
  assert.equal(resposta.status, 401);
});

test('sessao administrativa da acesso e o AFD sai do endpoint fiscal', async () => {
  const sessao = autenticar('rh.joana', 'senha-bem-longa-1');
  assert.ok(sessao);

  const lista = await pedir('/api/admin/trabalhadores', { headers: { 'x-sessao': sessao.token } });
  assert.equal(lista.status, 200);

  const afd = await pedir('/api/admin/afd?de=2026-01-01&ate=2036-12-31', {
    headers: { 'x-sessao': sessao.token }
  });
  assert.equal(afd.status, 200);
  const texto = await afd.text();
  assert.match(texto.split('\r\n')[0], /^0000000001/);
  assert.ok(texto.includes('TESTE LTDA'));
});

test('modo de teste permite marcar sem leitor, pela senha de dedo', async () => {
  // E o caminho de quem esta conferindo o sistema num computador que ainda
  // nao tem o leitor plugado.
  simulador.apresentarDedo('outra-coisa');

  const definir = await pedir('/api/ponto/simulador/dedo', {
    method: 'POST',
    headers: { 'x-posto-id': 'RECEPCAO-01', 'x-posto-token': posto.token },
    body: JSON.stringify({ semente: 'ana-polegar' })
  });
  assert.equal(definir.status, 200);

  const marcacao = await pedir('/api/ponto/marcar', {
    method: 'POST', body: '{}',
    headers: { 'x-posto-id': 'RECEPCAO-01', 'x-posto-token': posto.token }
  });
  assert.equal(marcacao.status, 200);
  assert.equal((await marcacao.json()).marcacao.trabalhadorNome, 'Ana Souza');
});

test('a rota de teste exige a senha de dedo e o posto autenticado', async () => {
  const semSemente = await pedir('/api/ponto/simulador/dedo', {
    method: 'POST',
    headers: { 'x-posto-id': 'RECEPCAO-01', 'x-posto-token': posto.token },
    body: '{}'
  });
  assert.equal(semSemente.status, 400);

  const semPosto = await pedir('/api/ponto/simulador/dedo', {
    method: 'POST', body: JSON.stringify({ semente: 'ana-polegar' })
  });
  assert.equal(semPosto.status, 403);
});

test('com o driver real a rota de teste nao existe', async () => {
  // Nao pode haver caminho para injetar identidade num sistema em producao.
  const { config } = await import('../src/config.js');
  const original = config.biometria.driver;
  config.biometria.driver = 'agente';
  try {
    const resposta = await pedir('/api/ponto/simulador/dedo', {
      method: 'POST',
      headers: { 'x-posto-id': 'RECEPCAO-01', 'x-posto-token': posto.token },
      body: JSON.stringify({ semente: 'ana-polegar' })
    });
    assert.equal(resposta.status, 404);
  } finally {
    config.biometria.driver = original;
  }
});

test('supervisor e obrigatorio na marcacao por credencial alternativa', async () => {
  const resposta = await pedir('/api/ponto/marcar-alternativo', {
    method: 'POST',
    headers: { 'x-posto-id': 'RECEPCAO-01', 'x-posto-token': posto.token },
    body: JSON.stringify({ cpf: CPF_A, justificativa: 'curativo no dedo' })
  });
  assert.equal(resposta.status, 403);
  assert.equal((await resposta.json()).codigo, 'SUPERVISOR');
});
