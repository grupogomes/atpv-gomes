import { criarServidor } from './http/servidor.js';
import { config } from './config.js';
import { verificarIntegridade } from './dominio/livro.js';
import { situacaoAssinatura } from './fiscal/assinatura.js';
import { existeAdmin } from './servicos/usuarios.js';

const app = criarServidor();

app.listen(config.porta, config.host, () => {
  console.log(`REP-P no ar em http://${config.host}:${config.porta}`);
  console.log(`  Quiosque .......... /kiosk/`);
  console.log(`  Administracao ..... /admin/`);
  console.log(`  Portal ............ /portal/`);
  console.log(`  Identificacao REP . ${config.rep.identificacao}`);
  console.log(`  Redes autorizadas . ${config.redesAutorizadas.join(', ')}`);

  // Autoteste na subida: se a cadeia de hash estiver rompida, quem opera
  // precisa saber agora, nao no dia da fiscalizacao.
  const integridade = verificarIntegridade();
  console.log(`  Livro-razao ....... ${integridade.total} registros, ` +
    (integridade.integro ? 'integro' : `${integridade.problemas.length} PROBLEMA(S)`));
  if (!integridade.integro) {
    for (const problema of integridade.problemas.slice(0, 10)) {
      console.error(`    ! NSR ${problema.nsr}: ${problema.erro}`);
    }
  }

  const assinatura = situacaoAssinatura();
  if (!assinatura.ativa) console.warn(`  ! ${assinatura.alerta}`);
  if (config.biometria.driver === 'simulador') {
    console.warn('  ! Driver biometrico em modo SIMULADOR — nao usar em producao.');
  }
  if (!existeAdmin()) {
    console.warn('  ! Nenhum administrador cadastrado. Rode: npm run seed');
  }
});
