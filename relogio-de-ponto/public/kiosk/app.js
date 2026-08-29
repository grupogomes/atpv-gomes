/* ---------------------------------------------------------------------------
 * Quiosque de marcacao de ponto.
 *
 * Roda no navegador do computador da empresa, em tela cheia. As credenciais do
 * posto ficam no localStorage DESTA maquina: e o que amarra o terminal ao lugar
 * fisico. Copiar a URL para outro dispositivo nao adianta — sem as credenciais
 * o servidor recusa, e mesmo com elas ainda e preciso o dedo da pessoa.
 * ------------------------------------------------------------------------- */

const CHAVE_POSTO = 'repp.posto';
const $ = (id) => document.getElementById(id);

let deslocamentoRelogio = 0; // ms entre o relogio do servidor e o desta maquina

function posto() {
  try { return JSON.parse(localStorage.getItem(CHAVE_POSTO) || 'null'); }
  catch { return null; }
}

function cabecalhosPosto() {
  const p = posto();
  return p ? { 'x-posto-id': p.id, 'x-posto-token': p.token } : {};
}

/* --- relogio ------------------------------------------------------------ */

async function sincronizarRelogio() {
  try {
    const antes = Date.now();
    const resposta = await fetch('/api/hora');
    const { agora } = await resposta.json();
    const latencia = (Date.now() - antes) / 2;
    deslocamentoRelogio = new Date(agora).getTime() + latencia - Date.now();
  } catch { /* mantem o deslocamento anterior */ }
}

function pintarRelogio() {
  const agora = new Date(Date.now() + deslocamentoRelogio);
  $('relogio').textContent = agora.toLocaleTimeString('pt-BR');
  $('data').textContent = agora.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}

/* --- telas -------------------------------------------------------------- */

function mostrar(qual) {
  for (const tela of ['tela-config', 'tela-marcar']) $(tela).hidden = tela !== qual;
  $('tela-resultado').classList.toggle('visivel', qual === 'tela-resultado');
  if (qual === 'tela-resultado') {
    $('tela-config').hidden = true;
    $('tela-marcar').hidden = true;
  }
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function mostrarSucesso(dados, repetida) {
  $('tela-resultado').className = 'cartao resultado visivel sucesso';
  $('selo').textContent = '✓';
  $('corpo-resultado').innerHTML = `
    <div class="nome">${escapar(dados.trabalhadorNome)}</div>
    <div class="horario">${escapar(dados.horaLegivel)}</div>
    <div class="detalhe">${escapar(dados.dataLegivel)} · NSR ${escapar(dados.nsr)} · ${escapar(dados.metodo)}</div>
    ${repetida ? '<div class="detalhe">Marcacao ja registrada ha instantes — este e o mesmo comprovante.</div>' : ''}
    <div class="detalhe" style="margin-top:12px">Codigo de autenticidade:</div>
    <div class="hash">${escapar(dados.hash)}</div>
    <a class="detalhe" href="/api/ponto/comprovante/${encodeURIComponent(Number(dados.nsr))}.pdf" target="_blank" rel="noopener">Abrir comprovante em PDF</a>
  `;
  mostrar('tela-resultado');
  clearTimeout(mostrarSucesso.timer);
  mostrarSucesso.timer = setTimeout(voltar, 12000);
}

function mostrarFalha(mensagem) {
  $('tela-resultado').className = 'cartao resultado visivel falha';
  $('selo').textContent = '✕';
  $('corpo-resultado').innerHTML = `<p class="mensagem-erro">${escapar(mensagem)}</p>`;
  mostrar('tela-resultado');
  clearTimeout(mostrarSucesso.timer);
  mostrarSucesso.timer = setTimeout(voltar, 8000);
}

function voltar() {
  clearTimeout(mostrarSucesso.timer);
  mostrar(posto() ? 'tela-marcar' : 'tela-config');
}

/* --- acoes -------------------------------------------------------------- */

async function marcar() {
  $('btn-marcar').disabled = true;
  $('btn-marcar').textContent = 'Encoste o dedo no leitor…';
  try {
    const resposta = await fetch('/api/ponto/marcar', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...cabecalhosPosto() },
      body: '{}'
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      if (dados.codigo === 'POSTO_NAO_AUTORIZADO') {
        localStorage.removeItem(CHAVE_POSTO);
        mostrar('tela-config');
        $('erro-config').textContent = dados.erro;
        return;
      }
      mostrarFalha(dados.erro || 'Nao foi possivel registrar.');
      return;
    }
    mostrarSucesso(dados.marcacao, dados.repetida);
  } catch {
    mostrarFalha('Sem comunicacao com o servidor de ponto. Avise o supervisor.');
  } finally {
    $('btn-marcar').disabled = false;
    $('btn-marcar').textContent = 'Registrar ponto';
  }
}

async function verificarLeitor() {
  if (!posto()) return;
  try {
    const resposta = await fetch('/api/ponto/status', { headers: cabecalhosPosto() });
    if (!resposta.ok) {
      if (resposta.status === 403) { localStorage.removeItem(CHAVE_POSTO); mostrar('tela-config'); }
      return;
    }
    const { posto: p, leitor } = await resposta.json();
    $('txt-posto').textContent = `${p.nome} (${p.id})`;
    $('luz-leitor').className = `ponto ${leitor.disponivel ? 'on' : 'off'}`;
    $('txt-leitor').textContent = leitor.disponivel
      ? `leitor pronto${leitor.modelo ? ` · ${leitor.modelo}` : ''}`
      : 'leitor indisponivel';
    $('btn-marcar').disabled = !leitor.disponivel;
  } catch {
    $('luz-leitor').className = 'ponto off';
    $('txt-leitor').textContent = 'servidor fora do ar';
  }
}

async function salvarPosto() {
  const id = $('posto-id').value.trim();
  const token = $('posto-token').value.trim();
  if (!id || !token) { $('erro-config').textContent = 'Preencha os dois campos.'; return; }

  const resposta = await fetch('/api/ponto/status', {
    headers: { 'x-posto-id': id, 'x-posto-token': token }
  });
  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => ({}));
    $('erro-config').textContent = dados.erro || 'Credenciais recusadas.';
    return;
  }
  localStorage.setItem(CHAVE_POSTO, JSON.stringify({ id, token }));
  $('posto-token').value = '';
  $('erro-config').textContent = '';
  mostrar('tela-marcar');
  verificarLeitor();
}

async function meusRegistros() {
  $('btn-meus-registros').disabled = true;
  $('btn-meus-registros').textContent = 'Encoste o dedo para identificar…';
  try {
    const resposta = await fetch('/api/portal/abrir-sessao', {
      method: 'POST', headers: { 'content-type': 'application/json', ...cabecalhosPosto() }, body: '{}'
    });
    const dados = await resposta.json();
    if (!resposta.ok) { mostrarFalha(dados.erro); return; }
    sessionStorage.setItem('repp.trabalhador', dados.token);
    window.location.href = '/portal/';
  } catch {
    mostrarFalha('Sem comunicacao com o servidor.');
  } finally {
    $('btn-meus-registros').disabled = false;
    $('btn-meus-registros').textContent = 'Ver meus registros';
  }
}

/* --- inicializacao ------------------------------------------------------ */

$('btn-marcar').addEventListener('click', marcar);
$('btn-voltar').addEventListener('click', voltar);
$('btn-salvar-posto').addEventListener('click', salvarPosto);
$('btn-meus-registros').addEventListener('click', meusRegistros);

pintarRelogio();
setInterval(pintarRelogio, 250);
sincronizarRelogio();
setInterval(sincronizarRelogio, 300000);

mostrar(posto() ? 'tela-marcar' : 'tela-config');
verificarLeitor();
setInterval(verificarLeitor, 20000);
