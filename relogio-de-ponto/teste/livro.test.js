import test from 'node:test';
import assert from 'node:assert/strict';
import { bancoTemporario } from './ajuda.js';

bancoTemporario();

const { db } = await import('../src/db/index.js');
const { acrescentar, verificarIntegridade, lerRegistro, HASH_GENESIS } =
  await import('../src/dominio/livro.js');

test('o livro-razao encadeia os registros por hash', () => {
  const a = acrescentar({ tipo: '7', conteudo: { cpf: '52998224725', postoId: 'P1' } });
  const b = acrescentar({ tipo: '7', conteudo: { cpf: '52998224725', postoId: 'P1' } });

  assert.equal(a.nsr, 1);
  assert.equal(b.nsr, 2);
  assert.equal(a.hashAnterior, HASH_GENESIS);
  assert.equal(b.hashAnterior, a.hash);
  assert.equal(lerRegistro(1).hash, a.hash);
  assert.ok(verificarIntegridade().integro);
});

test('o banco recusa alterar uma marcacao ja registrada', () => {
  acrescentar({ tipo: '7', conteudo: { cpf: '52998224725', postoId: 'P1' } });
  assert.throws(
    () => db().prepare("UPDATE registro SET dh = '2020-01-01T00:00:00-0300' WHERE nsr = 1").run(),
    /imutavel/i
  );
});

test('o banco recusa excluir uma marcacao ja registrada', () => {
  assert.throws(() => db().prepare('DELETE FROM registro WHERE nsr = 1').run(), /nao pode ser excluido/i);
});

test('adulteracao direta no banco e detectada pela verificacao de integridade', () => {
  // Contornamos os gatilhos como um invasor faria: desligando-os. A cadeia de
  // hash continua denunciando a alteracao.
  const banco = db();
  banco.exec('DROP TRIGGER registro_imutavel_update');
  banco.prepare(`UPDATE registro SET conteudo = '{"cpf":"11144477735","postoId":"P1"}' WHERE nsr = 2`).run();

  const resultado = verificarIntegridade();
  assert.equal(resultado.integro, false);
  assert.ok(resultado.problemas.some((p) => p.nsr === 2 && /adulterado/.test(p.erro)));
});
