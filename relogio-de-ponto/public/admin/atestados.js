/* ---------------------------------------------------------------------------
 * Painel de atestados.
 *
 * Os graficos sao HTML e CSS puros — sem biblioteca. Sao poucas series e
 * poucas categorias, e desenhar a mao mantem o quiosque leve, a politica de
 * seguranca fechada (nenhum script externo) e o visual igual ao resto do painel.
 *
 * Paleta: azul para DIAS, laranja para HORAS, nos dois modos. Foi validada
 * contra os criterios de daltonismo e contraste antes de entrar aqui.
 * ------------------------------------------------------------------------- */

(() => {
  const $ = (id) => document.getElementById(id);
  const R = () => window.REPP;

  let naturezas = {};
  let ultimoPainel = null;

  /* --- formatos --------------------------------------------------------- */

  /** "6 dias" / "1 dia" / "—" */
  function emDias(n) {
    if (!n) return '—';
    return `${n} ${n === 1 ? 'dia' : 'dias'}`;
  }

  /** Minutos em "3h20" / "45min" / "—" */
  function emHoras(minutos) {
    if (!minutos) return '—';
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (!h) return `${m}min`;
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  }

  /** "2026-08" -> "ago/26" */
  function mesCurto(iso) {
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                   'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${meses[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
  }

  /* --- dica flutuante (hover) ------------------------------------------- */

  const dica = $('dica');

  function ligarDicas(raiz) {
    for (const alvo of raiz.querySelectorAll('[data-dica]')) {
      alvo.addEventListener('mouseenter', () => {
        dica.innerHTML = alvo.dataset.dica;
        dica.style.display = 'block';
      });
      alvo.addEventListener('mousemove', (evento) => {
        // Mantem a dica dentro da janela mesmo perto das bordas.
        const largura = dica.offsetWidth;
        const altura = dica.offsetHeight;
        const x = Math.min(evento.clientX + 14, window.innerWidth - largura - 8);
        const y = Math.max(evento.clientY - altura - 12, 8);
        dica.style.left = `${x}px`;
        dica.style.top = `${y}px`;
      });
      alvo.addEventListener('mouseleave', () => { dica.style.display = 'none'; });
    }
  }

  /* --- graficos --------------------------------------------------------- */

  /**
   * Barras horizontais ordenadas, uma serie so.
   * Serie unica nao leva legenda: o titulo ja diz o que esta plotado.
   * O valor vai direto na ponta da barra — rotulo direto antes de eixo.
   */
  function barras({ titulo, subtitulo, serie, itens, formatar, vazio }) {
    if (!itens.length) {
      return `<div class="viz">
        <div class="viz-titulo">${R().esc(titulo)}</div>
        <div class="viz-sub">${R().esc(subtitulo)}</div>
        <div class="viz-vazio">${R().esc(vazio)}</div>
      </div>`;
    }
    const maximo = Math.max(...itens.map((i) => i.valor)) || 1;
    return `<div class="viz">
      <div class="viz-titulo">${R().esc(titulo)}</div>
      <div class="viz-sub">${R().esc(subtitulo)}</div>
      ${itens.map((item) => `
        <div class="barra-linha" data-dica="${R().esc(item.dica)}">
          <div class="barra-rotulo" title="${R().esc(item.rotulo)}">${R().esc(item.rotulo)}</div>
          <div class="barra-trilho">
            <div class="barra-marca ${serie}" style="width:${(item.valor / maximo) * 100}%"></div>
          </div>
          <div class="barra-valor">${R().esc(formatar(item.valor))}</div>
        </div>`).join('')}
    </div>`;
  }

  /** Colunas por mes — serie unica, valor na cabeca da coluna. */
  function colunas({ titulo, subtitulo, itens }) {
    if (itens.length < 2) return '';
    const maximo = Math.max(...itens.map((i) => i.valor)) || 1;
    return `<div class="viz">
      <div class="viz-titulo">${R().esc(titulo)}</div>
      <div class="viz-sub">${R().esc(subtitulo)}</div>
      <div class="colunas">
        ${itens.map((item) => `
          <div class="coluna-item" data-dica="${R().esc(item.dica)}">
            <div class="coluna-valor">${item.valor || ''}</div>
            <div class="coluna-marca" style="height:${(item.valor / maximo) * 100}%"></div>
          </div>`).join('')}
      </div>
      <div class="colunas-rotulos">
        ${itens.map((item) => `<span>${R().esc(item.rotulo)}</span>`).join('')}
      </div>
    </div>`;
  }

  /* --- montagem do painel ----------------------------------------------- */

  function pintarPainel(painel) {
    ultimoPainel = painel;
    const t = painel.totais;

    $('at-alertas').innerHTML = painel.alertas.length
      ? painel.alertas.map((a) =>
          `<div class="alerta ${a.nivel === 'critical' ? 'erro' : ''}">${R().esc(a.texto)}</div>`).join('')
      : '<div class="alerta ok">Nenhuma pendência de atestado no período.</div>';

    $('at-indicadores').innerHTML = `
      <div class="indicador">
        <div class="rotulo">Atestados no período</div>
        <div class="valor">${t.atestados}</div>
        <div class="nota">${t.aceitos} aceito(s) · ${t.pendentes} pendente(s)${t.recusados ? ` · ${t.recusados} recusado(s)` : ''}</div>
      </div>
      <div class="indicador">
        <div class="rotulo"><span class="ponto dias"></span>Dias abonados</div>
        <div class="valor">${t.dias}</div>
        <div class="nota">dias inteiros, apenas atestados aceitos</div>
      </div>
      <div class="indicador">
        <div class="rotulo"><span class="ponto horas"></span>Horas abonadas</div>
        <div class="valor">${emHoras(t.minutos)}</div>
        <div class="nota">saídas parciais, apenas atestados aceitos</div>
      </div>
      <div class="indicador">
        <div class="rotulo">Pessoas com atestado</div>
        <div class="valor">${t.pessoas}</div>
        <div class="nota">de ${R().pessoas().filter((p) => p.ativo).length} ativo(s)</div>
      </div>`;

    const comDias = painel.ranking.filter((r) => r.dias > 0)
      .map((r) => ({
        rotulo: r.nome, valor: r.dias,
        dica: `<b>${r.nome}</b><br>${emDias(r.dias)} no período<br>` +
              `${r.quantidade} atestado(s)<br>` +
              `maior afastamento contínuo: ${emDias(r.maiorSequencia)}`
      }));

    const comHoras = painel.ranking.filter((r) => r.minutos > 0)
      .sort((a, b) => b.minutos - a.minutos)
      .map((r) => ({
        rotulo: r.nome, valor: r.minutos,
        dica: `<b>${r.nome}</b><br>${emHoras(r.minutos)} no período<br>${r.quantidade} atestado(s)`
      }));

    $('at-graficos').innerHTML =
      barras({
        titulo: 'Dias de atestado por funcionário',
        subtitulo: 'dias inteiros abonados — atestados aceitos',
        serie: 'dias', itens: comDias, formatar: emDias,
        vazio: 'Nenhum atestado de dias no período.'
      }) +
      barras({
        titulo: 'Horas de atestado por funcionário',
        subtitulo: 'ausências parciais abonadas — atestados aceitos',
        serie: 'horas', itens: comHoras, formatar: emHoras,
        vazio: 'Nenhum atestado de horas no período.'
      }) +
      colunas({
        titulo: 'Dias de atestado por mês',
        subtitulo: 'evolução no período selecionado',
        itens: painel.serieMensal.map((m) => ({
          rotulo: mesCurto(m.mes), valor: m.dias,
          dica: `<b>${mesCurto(m.mes)}</b><br>${emDias(m.dias)}<br>` +
                `${emHoras(m.minutos)} em ausências parciais<br>${m.quantidade} atestado(s)`
        }))
      });

    ligarDicas($('at-graficos'));
    pintarTabela(painel.atestados);
  }

  function pintarTabela(atestados) {
    if (!atestados.length) {
      $('at-tabela').innerHTML = '<tr><td class="legenda">Nenhum atestado no período.</td></tr>';
      $('at-fundamento').textContent = '';
      return;
    }
    $('at-tabela').innerHTML = `
      <tr><th>Trabalhador</th><th>Tipo</th><th>Período</th><th>Abono</th>
          <th>Natureza</th><th>Emitente</th><th>Situação</th><th></th></tr>
      ${atestados.map((a) => `
        <tr>
          <td>${R().esc(a.nome)}</td>
          <td>${a.tipo === 'dias' ? 'Dias' : 'Horas'}</td>
          <td class="nao-quebra">${R().dataBr(a.data_inicio)}${
            a.tipo === 'dias' && a.data_fim !== a.data_inicio
              ? ` a ${R().dataBr(a.data_fim)}`
              : (a.tipo === 'horas' ? ` · ${R().esc(a.hora_inicio)}–${R().esc(a.hora_fim)}` : '')
          }</td>
          <td class="nao-quebra">${a.tipo === 'dias' ? emDias(a.dias) : emHoras(a.minutos)}</td>
          <td>${R().esc(naturezas[a.natureza]?.rotulo || a.natureza)}</td>
          <td>${R().esc(a.emitente)}${a.conselho ? ` · ${R().esc(a.conselho)}` : ''}</td>
          <td><span class="selo ${a.situacao}">${a.situacao}</span>${
            a.motivo_recusa ? `<div class="legenda">${R().esc(a.motivo_recusa)}</div>` : ''
          }</td>
          <td class="nao-quebra">
            ${a.situacao === 'pendente'
              ? `<button class="leve" data-aceitar="${a.id}">Aceitar</button>
                 <button class="leve perigo" data-recusar="${a.id}">Recusar</button>`
              : ''}
            ${a.temCid ? `<button class="leve" data-cid="${a.id}">Ver CID</button>` : ''}
          </td>
        </tr>`).join('')}`;

    // O fundamento legal das naturezas presentes fica visivel: o RH nao
    // precisa decorar nem procurar em outro lugar na hora de decidir.
    const presentes = [...new Set(atestados.map((a) => a.natureza))];
    $('at-fundamento').innerHTML = presentes
      .map((n) => naturezas[n]
        ? `<strong>${R().esc(naturezas[n].rotulo)}</strong>: ${R().esc(naturezas[n].fundamento)}. ` +
          R().esc(naturezas[n].observacao || '')
        : '')
      .filter(Boolean).join('<br>');

    for (const botao of $('at-tabela').querySelectorAll('[data-aceitar]')) {
      botao.addEventListener('click', () => avaliar(botao.dataset.aceitar, 'aceito'));
    }
    for (const botao of $('at-tabela').querySelectorAll('[data-recusar]')) {
      botao.addEventListener('click', () => {
        const motivo = prompt('Motivo da recusa (fica registrado e é informado ao trabalhador):');
        if (motivo) avaliar(botao.dataset.recusar, 'recusado', motivo);
      });
    }
    for (const botao of $('at-tabela').querySelectorAll('[data-cid]')) {
      botao.addEventListener('click', async () => {
        const r = await R().api(`/atestados/${botao.dataset.cid}/cid`);
        alert(r.cid ? `CID: ${r.cid}\n\nEste acesso foi registrado na auditoria.` : r.aviso);
      });
    }
  }

  async function avaliar(id, situacao, motivo = '') {
    try {
      await R().api(`/atestados/${id}/avaliar`, {
        method: 'POST', body: JSON.stringify({ situacao, motivo })
      });
      carregar();
    } catch (erro) { alert(erro.message); }
  }

  /* --- carga ------------------------------------------------------------ */

  async function carregar() {
    if (!$('at-de').value) {
      const hoje = new Date();
      // Padrao: os ultimos 6 meses, que e o horizonte util para ver padrao
      // de faltas sem virar histórico.
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
      $('at-de').value = inicio.toISOString().slice(0, 10);
      $('at-ate').value = hoje.toISOString().slice(0, 10);
    }

    if (!Object.keys(naturezas).length) {
      naturezas = await R().api('/naturezas');
      $('at-natureza').innerHTML = Object.entries(naturezas)
        .map(([chave, n]) => `<option value="${chave}">${R().esc(n.rotulo)}</option>`).join('');
    }
    if (!R().pessoas().length) await R().carregarPessoas();
    $('at-trabalhador').innerHTML = R().pessoas()
      .map((p) => `<option value="${p.id}">${R().esc(p.nome)}</option>`).join('');

    const painel = await R().api(
      `/painel-atestados?de=${$('at-de').value}&ate=${$('at-ate').value}`);
    pintarPainel(painel);
  }

  /* --- formulario ------------------------------------------------------- */

  function alternarTipo() {
    const porHoras = $('at-tipo').value === 'horas';
    $('campo-fim').hidden = porHoras;
    $('campo-horas').hidden = !porHoras;
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('at-tipo').addEventListener('change', alternarTipo);
    $('btn-painel').addEventListener('click', () => carregar().catch((e) => alert(e.message)));

    $('btn-salvar-atestado').addEventListener('click', async () => {
      $('at-erro').hidden = true;
      try {
        await R().api('/atestados', {
          method: 'POST',
          body: JSON.stringify({
            trabalhadorId: Number($('at-trabalhador').value),
            tipo: $('at-tipo').value,
            natureza: $('at-natureza').value,
            dataInicio: $('at-inicio').value,
            dataFim: $('at-fim').value || $('at-inicio').value,
            horaInicio: $('at-hora-inicio').value,
            horaFim: $('at-hora-fim').value,
            emitente: $('at-emitente').value,
            conselho: $('at-conselho').value,
            cid: $('at-cid').value,
            observacao: $('at-obs').value
          })
        });
        for (const campo of ['at-emitente', 'at-conselho', 'at-cid', 'at-obs']) $(campo).value = '';
        $('at-lancar').open = false;
        carregar();
      } catch (erro) {
        $('at-erro').textContent = erro.message;
        $('at-erro').hidden = false;
      }
    });
  });

  window.painelAtestados = { carregar, painel: () => ultimoPainel };
})();
