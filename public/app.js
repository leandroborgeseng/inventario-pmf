(function () {
  const TOKEN_KEY = 'inv_token_url';
  const SENHA_KEY = 'inv_senha';
  const SEC_OPCOES_KEY = 'inv_secretarias_opcao';

  function normToken(t) {
    if (t == null) return null;
    let x = String(t).trim();
    if (!x) return null;
    try {
      x = decodeURIComponent(x);
    } catch (_) {}
    x = String(x).trim();
    return x || null;
  }

  const pathMatch = window.location.pathname.match(/^\/inventario\/([^/]+)\/?$/);
  const tokenFromUrl = pathMatch ? normToken(pathMatch[1]) : null;

  const $ = (id) => document.getElementById(id);

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.toggle('active', s.id === id);
    });
  }

  function showErr(elId, msg) {
    const el = $(elId);
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('show', !!msg);
  }

  function getAuth() {
    const stored = sessionStorage.getItem(TOKEN_KEY);
    const token = tokenFromUrl || normToken(stored) || stored;
    const senha = sessionStorage.getItem(SENHA_KEY);
    return { token, senha };
  }

  function setAuth(token, senha) {
    const nt = normToken(token);
    sessionStorage.setItem(TOKEN_KEY, nt || token);
    sessionStorage.setItem(SENHA_KEY, senha == null ? '' : String(senha).trim());
  }

  function clearAuth() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SENHA_KEY);
    sessionStorage.removeItem(SEC_OPCOES_KEY);
  }

  function guardarOpcoesSecretarias(list) {
    try {
      sessionStorage.setItem(
        SEC_OPCOES_KEY,
        JSON.stringify(Array.isArray(list) ? list : [])
      );
    } catch (_) {
      /* ignora quota */
    }
  }

  function lerOpcoesSecretarias() {
    try {
      const raw = sessionStorage.getItem(SEC_OPCOES_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function preencherSelectSecretaria(wrapId, selId, list, cur) {
    const wrap = $(wrapId);
    const sel = $(selId);
    if (!wrap || !sel) return;
    const curTok = normToken(cur);
    if (list.length <= 1) {
      wrap.hidden = true;
      sel.innerHTML = '';
      return;
    }
    wrap.hidden = false;
    sel.innerHTML = '';
    for (const s of list) {
      const t = normToken(s.token);
      if (!t) continue;
      const o = document.createElement('option');
      o.value = t;
      o.textContent = s.nome || t;
      sel.appendChild(o);
    }
    const match = [...sel.options].some((o) => normToken(o.value) === curTok);
    if (match) sel.value = curTok || sel.options[0].value;
    else if (sel.options[0]) sel.selectedIndex = 0;
  }

  function populateFiltroSecretaria() {
    const list = lerOpcoesSecretarias();
    const cur = tokenFromUrl;
    preencherSelectSecretaria('inv-wrap-filtro-secretaria', 'inv-filtro-secretaria', list, cur);
    preencherSelectSecretaria(
      'inv-wrap-filtro-secretaria-mon',
      'inv-filtro-secretaria-mon',
      list,
      cur
    );
    preencherSelectSecretaria(
      'inv-wrap-filtro-secretaria-rel',
      'inv-filtro-secretaria-rel',
      list,
      cur
    );
  }

  function copyMainToAux(suffix) {
    const mLoc = $('inv-filtro-local');
    const aLoc = $('inv-filtro-local-' + suffix);
    if (mLoc && aLoc && aLoc.options.length) {
      const v = mLoc.value;
      if ([...aLoc.options].some((o) => o.value === v)) aLoc.value = v;
      else aLoc.value = '';
    }
    const mB = $('inv-busca');
    const aB = $('inv-busca-' + suffix);
    if (mB && aB) aB.value = mB.value;
    const mS = $('inv-filtro-secretaria');
    const aS = $('inv-filtro-secretaria-' + suffix);
    if (mS && aS && aS.options.length) {
      const v = mS.value;
      if ([...aS.options].some((o) => o.value === v)) aS.value = v;
    }
  }

  function copyAuxToMain(suffix) {
    const mLoc = $('inv-filtro-local');
    const aLoc = $('inv-filtro-local-' + suffix);
    if (mLoc && aLoc) mLoc.value = aLoc.value;
    const mB = $('inv-busca');
    const aB = $('inv-busca-' + suffix);
    if (mB && aB) mB.value = aB.value;
    const mS = $('inv-filtro-secretaria');
    const aS = $('inv-filtro-secretaria-' + suffix);
    if (mS && aS && aS.options.length) mS.value = aS.value;
  }

  let monitoresPainelUltimoJson = null;
  let relatorioVistoriaUltimoJson = null;

  function onTrocarSecretaria() {
    const sel = $('inv-filtro-secretaria');
    if (!sel) return;
    const newTok = normToken(sel.value);
    if (!newTok || newTok === normToken(tokenFromUrl)) return;
    const senha = sessionStorage.getItem(SENHA_KEY) || '';
    if (!senha.trim()) return;
    setAuth(newTok, senha);
    window.location.href =
      '/inventario/' + encodeURIComponent(newTok);
  }

  async function apiAuditoria(body) {
    const r = await fetch('/api/auditoria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro ao salvar');
    return j;
  }

  async function apiAuditoriaLote(body) {
    const r = await fetch('/api/auditoria-lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro ao salvar lote');
    return j;
  }

  async function apiMonitoresLista() {
    const { token, senha } = getAuth();
    const r = await fetch(
      '/api/monitores/' + encodeURIComponent(token) + '?lista=1',
      { headers: { 'X-Senha': senha } }
    );
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro ao carregar monitores');
    return j;
  }

  async function apiMonitoresComputador(computadorId) {
    const { token, senha } = getAuth();
    const r = await fetch(
      '/api/monitores/' +
        encodeURIComponent(token) +
        '?computador_id=' +
        encodeURIComponent(computadorId),
      { headers: { 'X-Senha': senha } }
    );
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro ao carregar monitores');
    return j;
  }

  async function apiAuditoriaMonitoresPorIds(auditoriaId, monitorIds) {
    const { token, senha } = getAuth();
    const r = await fetch('/api/auditoria-monitores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        senha,
        auditoria_id: auditoriaId,
        monitor_ids: monitorIds,
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro ao salvar monitores');
    return j;
  }

  async function loadComputadores() {
    const { token, senha } = getAuth();
    const loc = valorFiltroLocal();
    const qRaw = ($('inv-busca') && $('inv-busca').value) || '';
    const qs = [];
    if (loc) qs.push('local=' + encodeURIComponent(loc));
    if (String(qRaw).trim())
      qs.push('q=' + encodeURIComponent(String(qRaw).trim()));
    const qstr = qs.length ? '?' + qs.join('&') : '';
    const r = await fetch(
      '/api/computadores/' + encodeURIComponent(token) + qstr,
      { headers: { 'X-Senha': senha } }
    );
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Não autorizado');
    return j;
  }

  function valorBuscaParaApi() {
    const scrMon = $('screen-monitores-painel');
    if (scrMon && scrMon.classList.contains('active')) {
      const b = $('inv-busca-mon') || $('inv-busca');
      return b ? b.value || '' : '';
    }
    const scrRel = $('screen-relatorio-vistoria');
    if (scrRel && scrRel.classList.contains('active')) {
      const b = $('inv-busca-rel') || $('inv-busca');
      return b ? b.value || '' : '';
    }
    const m = $('inv-busca');
    return m ? m.value || '' : '';
  }

  function invQueryLocalQ() {
    const p = new URLSearchParams();
    const loc = valorFiltroLocalParaApi();
    if (loc) p.set('local', loc);
    const qb = valorBuscaParaApi();
    if (String(qb).trim()) p.set('q', String(qb).trim());
    const s = p.toString();
    return s ? '?' + s : '';
  }

  async function apiMonitoresPainel() {
    const { token, senha } = getAuth();
    const r = await fetch(
      '/api/monitores-painel/' +
        encodeURIComponent(token) +
        invQueryLocalQ(),
      { headers: { 'X-Senha': senha } }
    );
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro ao carregar monitores');
    return j;
  }

  async function apiInventarioMonitorNaoEncontrado(monitorId, cancelar) {
    const { token, senha } = getAuth();
    const r = await fetch('/api/inventario-monitor-nao-encontrado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        senha,
        monitor_id: monitorId,
        cancelar: !!cancelar,
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro ao registar');
    if (!j.ok) throw new Error(j.error || 'Erro ao registar');
    return j;
  }

  async function apiInventarioMonitorNaoEncontradoLote(monitorIds) {
    const { token, senha } = getAuth();
    const r = await fetch('/api/inventario-monitor-nao-encontrado-lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, senha, monitor_ids: monitorIds }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro ao registar lote');
    if (!j.ok) throw new Error(j.error || 'Erro ao registar lote');
    return j;
  }

  function badgeMonVistoria(vistoriaPc) {
    if (vistoriaPc === 'confirmado')
      return '<span class="badge ok">Computador vistoriado (confirmado)</span>';
    if (vistoriaPc === 'outro_local')
      return '<span class="badge move">PC · outro local</span>';
    if (vistoriaPc === 'nao_encontrado')
      return '<span class="badge no">PC · não encontrado</span>';
    return (
      '<span class="badge pending">' +
      escapeHtml(vistoriaPc || '—') +
      '</span>'
    );
  }

  function renderMonitoresPainel(data) {
    monitoresPainelUltimoJson = data;
    const sub = $('mon-painel-sub');
    const hint = $('mon-painel-hint');
    const resumo = $('mon-painel-resumo');
    const lista = $('mon-painel-lista');
    const selLocMon = $('inv-filtro-local-mon') || $('inv-filtro-local');
    const locSel = selLocMon ? selLocMon.value || '' : '';
    const locLabel = (() => {
      if (!selLocMon || !locSel) return '';
      const opt = selLocMon.options[selLocMon.selectedIndex];
      return opt ? opt.textContent.trim() : '';
    })();
    const items = data.monitores || [];

    if (sub) {
      sub.textContent =
        (secretariaNome || 'Secretaria') +
        ' · ' +
        (!items.length
          ? 'Nenhum monitor com os filtros atuais'
          : items.length + ' monitor(es) nesta lista');
    }
    if (hint) {
      if (!locSel) {
        hint.textContent =
          '«Não ligado»: ainda não foi escolhido na vistoria de nenhum computador. «Ligado»: associado ao gravar monitores após confirmar um PC. Use «Não encontrado» quando o equipamento não existir no local.';
      } else {
        hint.textContent =
          'Filtro «' +
          locLabel +
          '»: monitores cujo local de cadastro ou o local do PC ligado coincidem. Monitores sem esse local em nenhum dos dois não aparecem.';
      }
    }

    let nSem = 0;
    let nLigConfirm = 0;
    let nLigOutro = 0;
    let nLigNao = 0;
    let nDeclaradosNao = 0;
    for (const it of items) {
      if (it.inventario_nao_encontrado) {
        nDeclaradosNao++;
        continue;
      }
      if (!it.vinculo) nSem++;
      else if (it.vinculo.vistoria_pc === 'confirmado') nLigConfirm++;
      else if (it.vinculo.vistoria_pc === 'outro_local') nLigOutro++;
      else if (it.vinculo.vistoria_pc === 'nao_encontrado') nLigNao++;
    }
    if (resumo) {
      let inner =
        '<div class="inv-mon-resumo-inner">' +
        '<span><strong>' +
        nSem +
        '</strong> sem vínculo</span> · <span><strong>' +
        nLigConfirm +
        '</strong> ligados · vistoria OK</span> · <span class="warn-num"><strong>' +
        (nLigOutro + nLigNao) +
        '</strong> ligados · PC outro local / não encontrado</span>';
      if (nDeclaradosNao > 0) {
        inner +=
          ' · <span><strong>' +
          nDeclaradosNao +
          '</strong> declarados não encontrados</span>';
      }
      inner += '</div>';
      resumo.innerHTML = inner;
    }

    if (lista) {
      lista.innerHTML = '';
      if (!items.length) {
        lista.innerHTML =
          '<p class="muted">Nenhum monitor com os filtros atuais (local ou texto de busca). Ajuste ou limpe os filtros.</p>';
        updateMonBatchUi();
        return;
      }
      for (const it of items) {
        const div = document.createElement('div');
        div.className = 'card inv-mon-card';
        const pat = escapeHtml(it.patrimonio || '—');
        const mod = it.modelo ? escapeHtml(it.modelo) : '';
        const v = it.vinculo;
        const selRow =
          !it.inventario_nao_encontrado
            ? '<div class="inv-card-select"><label><input type="checkbox" class="inv-mon-check" data-monitor-id="' +
              it.id +
              '" data-mon-vinculo="' +
              (v ? '1' : '0') +
              '" /> Incluir no lote</label></div>'
            : '';
        const locMon = it.localizacao
          ? '<p class="meta">Local (monitor): <strong>' +
            escapeHtml(String(it.localizacao)) +
            '</strong></p>'
          : '';
        let corpo = '';
        if (it.inventario_nao_encontrado) {
          corpo =
            '<p class="meta">Inventário físico</p>' +
            '<span class="badge no">Não encontrado na vistoria</span>' +
            '<p class="muted inv-mon-explica">Registado como não localizado no inventário (cadastro mantido).</p>';
        } else if (!v) {
          corpo =
            '<p class="meta">Ligação à vistoria</p>' +
            '<span class="badge pending">Não ligado a computador</span>' +
            '<p class="muted inv-mon-explica">Este monitor ainda não foi associado ao confirmar um PC (etapa dos monitores).</p>';
        } else {
          const locPc = escapeHtml(String(v.localizacao || '—'));
          const nm = escapeHtml(String(v.nome_maquina || '(sem nome)'));
          const pp = escapeHtml(String(v.pc_patrimonio || '—'));
          corpo =
            '<p class="meta">Ligado ao computador</p>' +
            '<p class="card-title" style="font-size:0.98rem">' +
            nm +
            '</p>' +
            '<p class="meta">Patrim. PC: ' +
            pp +
            ' · Local: ' +
            locPc +
            '</p>' +
            '<p class="meta">Estado da vistoria do PC</p>' +
            badgeMonVistoria(v.vistoria_pc);
        }
        div.innerHTML =
          selRow +
          '<p class="card-title">' +
          pat +
          (mod ? ' · ' + mod : '') +
          '</p>' +
          locMon +
          corpo;

        const actions = document.createElement('div');
        actions.className = 'pc-actions-mini';
        const mid = it.id;
        if (it.inventario_nao_encontrado) {
          const btnAnul = document.createElement('button');
          btnAnul.type = 'button';
          btnAnul.className = 'btn btn-ghost btn-inline';
          btnAnul.textContent = 'Anular «não encontrado»';
          btnAnul.addEventListener('click', async () => {
            if (
              !window.confirm(
                'Anular o registo «não encontrado»? Poderá voltar a associar este monitor a um PC na vistoria.'
              )
            )
              return;
            showErr('mon-painel-err', '');
            try {
              await apiInventarioMonitorNaoEncontrado(mid, true);
              await refreshData();
              const data = await apiMonitoresPainel();
              renderMonitoresPainel(data);
            } catch (e) {
              showErr('mon-painel-err', e.message);
            }
          });
          actions.appendChild(btnAnul);
        } else {
          const btnNao = document.createElement('button');
          btnNao.type = 'button';
          btnNao.className = 'btn btn-ghost btn-inline';
          btnNao.textContent = 'Não encontrado';
          btnNao.addEventListener('click', async () => {
            let msg =
              'Registrar este monitor como não encontrado no inventário (não existe mais neste local ou não foi localizado)?';
            if (v)
              msg +=
                '\n\nEste monitor está associado a um computador na vistoria. Ao confirmar, essa associação será removida.';
            if (!window.confirm(msg)) return;
            showErr('mon-painel-err', '');
            try {
              await apiInventarioMonitorNaoEncontrado(mid, false);
              await refreshData();
              const data = await apiMonitoresPainel();
              renderMonitoresPainel(data);
            } catch (e) {
              showErr('mon-painel-err', e.message);
            }
          });
          actions.appendChild(btnNao);
        }
        div.appendChild(actions);
        lista.appendChild(div);
      }
      updateMonBatchUi();
    } else {
      updateMonBatchUi();
    }
  }

  function getSelectedMonLoteIds() {
    return [
      ...document.querySelectorAll('#mon-painel-lista .inv-mon-check:checked'),
    ]
      .map((cb) => parseInt(cb.getAttribute('data-monitor-id'), 10))
      .filter((n) => !Number.isNaN(n) && n > 0);
  }

  function updateMonBatchUi() {
    const wrap = $('mon-batch-wrap');
    const cnt = $('mon-batch-count');
    if (!wrap || !cnt) return;
    const nBox = document.querySelectorAll('#mon-painel-lista .inv-mon-check')
      .length;
    wrap.hidden = nBox === 0;
    cnt.textContent = String(
      document.querySelectorAll('#mon-painel-lista .inv-mon-check:checked')
        .length
    );
  }

  async function openMonitoresPainel() {
    showErr('mon-painel-err', '');
    const lista = $('mon-painel-lista');
    if (lista) {
      lista.innerHTML = '<p class="muted">A carregar…</p>';
      updateMonBatchUi();
    }
    copyMainToAux('mon');
    showScreen('screen-monitores-painel');
    try {
      const data = await apiMonitoresPainel();
      renderMonitoresPainel(data);
    } catch (e) {
      showErr('mon-painel-err', e.message);
      if (lista) lista.innerHTML = '';
      updateMonBatchUi();
    }
  }

  function badgeHtml(audit) {
    if (!audit) return '<span class="badge pending">Pendente</span>';
    if (audit.confirmado === 'confirmado')
      return '<span class="badge ok">Confirmado</span>';
    if (audit.confirmado === 'nao_encontrado')
      return '<span class="badge no">Não encontrado</span>';
    if (audit.confirmado === 'outro_local')
      return '<span class="badge move">Outro local</span>';
    return (
      '<span class="badge pending">' +
      escapeHtml(audit.confirmado) +
      '</span>'
    );
  }

  async function apiRelatorioVistoria() {
    const { token, senha } = getAuth();
    const r = await fetch(
      '/api/relatorio-vistoria/' +
        encodeURIComponent(token) +
        invQueryLocalQ(),
      { headers: { 'X-Senha': senha } }
    );
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro ao carregar relatório');
    return j;
  }

  function renderRelatorioVistoria(data) {
    relatorioVistoriaUltimoJson = data;
    const sub = $('rel-vistoria-sub');
    const lista = $('rel-vistoria-lista');
    const selLocRel = $('inv-filtro-local-rel') || $('inv-filtro-local');
    const locSel = selLocRel ? selLocRel.value || '' : '';
    const locLabel = (() => {
      if (!selLocRel || !locSel) return '';
      const opt = selLocRel.options[selLocRel.selectedIndex];
      return opt ? opt.textContent.trim() : '';
    })();
    const itens = data.itens || [];
    const nTot = data.total != null ? data.total : itens.length;

    if (sub) {
      let html =
        '<span>' +
        escapeHtml(data.secretaria && data.secretaria.nome ? data.secretaria.nome : '') +
        '</span> · <strong>' +
        escapeHtml(String(nTot)) +
        '</strong> equipamento(s) com vistoria registada';
      if (locSel) {
        html +=
          ' · filtro de local: <strong>' + escapeHtml(locLabel) + '</strong>';
      }
      sub.innerHTML = html;
    }

    if (!lista) return;
    lista.innerHTML = '';
    if (!itens.length) {
      lista.innerHTML =
        '<p class="muted">Nenhum equipamento com vistoria com os filtros atuais (local ou busca), ou ainda não há registos nesta secretaria.</p>';
      return;
    }

    for (const it of itens) {
      const div = document.createElement('div');
      div.className = 'card inv-rel-vistoria-card';
      const mons = it.monitores || [];
      let monBlock = '';
      if (it.vistoria === 'confirmado') {
        monBlock += '<p class="inv-rel-mon-title">Monitores associados</p>';
        if (!mons.length) {
          monBlock +=
            '<p class="muted inv-rel-mon-empty">Nenhum monitor escolhido nesta vistoria (ou ainda não gravado).</p>';
        } else {
          monBlock += '<ul class="inv-rel-mon-list">';
          for (const m of mons) {
            const line =
              escapeHtml(m.patrimonio || '—') +
              (m.modelo ? ' — ' + escapeHtml(m.modelo) : '') +
              (m.localizacao
                ? ' · Local: ' + escapeHtml(m.localizacao)
                : '');
            monBlock += '<li>' + line + '</li>';
          }
          monBlock += '</ul>';
        }
      } else {
        monBlock +=
          '<p class="muted">Para «outro local» ou «não encontrado», a vistoria não mantém monitores ligados neste fluxo.</p>';
      }

      let obs = '';
      if (it.observacao && String(it.observacao).trim()) {
        obs =
          '<p class="meta">Observação: ' +
          escapeHtml(it.observacao) +
          '</p>';
      }

      div.innerHTML =
        '<p class="card-title">' +
        escapeHtml(it.nome_maquina || '(sem nome)') +
        '</p>' +
        '<p class="meta">Património: ' +
        escapeHtml(it.patrimonio || '—') +
        '</p>' +
        '<p class="meta">Local: ' +
        escapeHtml(it.localizacao || '—') +
        '</p>' +
        '<div class="inv-rel-badge-row">' +
        badgeHtml({ confirmado: it.vistoria }) +
        '</div>' +
        obs +
        monBlock;
      lista.appendChild(div);
    }
  }

  async function openRelatorioVistoria() {
    showErr('rel-vistoria-err', '');
    const lista = $('rel-vistoria-lista');
    if (lista) lista.innerHTML = '<p class="muted">A carregar…</p>';
    copyMainToAux('rel');
    showScreen('screen-relatorio-vistoria');
    try {
      const d = await apiRelatorioVistoria();
      renderRelatorioVistoria(d);
    } catch (e) {
      showErr('rel-vistoria-err', e.message);
      if (lista) lista.innerHTML = '';
    }
  }

  async function reloadMonitoresPainelIfActive() {
    const scr = $('screen-monitores-painel');
    if (!scr || !scr.classList.contains('active')) return;
    showErr('mon-painel-err', '');
    const lista = $('mon-painel-lista');
    if (lista) {
      lista.innerHTML = '<p class="muted">A carregar…</p>';
      updateMonBatchUi();
    }
    try {
      const data = await apiMonitoresPainel();
      renderMonitoresPainel(data);
    } catch (e) {
      showErr('mon-painel-err', e.message);
      if (lista) lista.innerHTML = '';
      updateMonBatchUi();
    }
  }

  async function reloadRelatorioVistoriaIfActive() {
    const scr = $('screen-relatorio-vistoria');
    if (!scr || !scr.classList.contains('active')) return;
    showErr('rel-vistoria-err', '');
    const lista = $('rel-vistoria-lista');
    if (lista) lista.innerHTML = '<p class="muted">A carregar…</p>';
    try {
      const d = await apiRelatorioVistoria();
      renderRelatorioVistoria(d);
    } catch (e) {
      showErr('rel-vistoria-err', e.message);
      if (lista) lista.innerHTML = '';
    }
  }

  function setupAuxFiltros(suffix) {
    const loc = $('inv-filtro-local-' + suffix);
    if (loc) {
      loc.addEventListener('change', () => {
        copyAuxToMain(suffix);
        if (suffix === 'mon') reloadMonitoresPainelIfActive();
        else reloadRelatorioVistoriaIfActive();
      });
    }
    const sec = $('inv-filtro-secretaria-' + suffix);
    if (sec) {
      sec.addEventListener('change', () => {
        copyAuxToMain(suffix);
        onTrocarSecretaria();
      });
    }
    const busca = $('inv-busca-' + suffix);
    if (busca) {
      let t = null;
      busca.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          copyAuxToMain(suffix);
          if (suffix === 'mon') reloadMonitoresPainelIfActive();
          else reloadRelatorioVistoriaIfActive();
        }, 220);
      });
    }
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  /** Apenas letras (ASCII) e números, maiúsculas — remove hífens, espaços, acentos. */
  function normalizeNomeMaquinaInput(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase();
  }

  let detailNomePrimeiroFoco = false;
  let ajusteNomePrimeiroFoco = false;

  let computadoresCache = [];
  let secretariaNome = '';
  let currentTab = 'pendente';
  let buscaTimer = null;
  let monitorOptsCache = [];
  let detailPc = null;
  /** PC com auditoria já confirmada — só correção de nome */
  let ajusteNomePc = null;
  /** Locais distintos vindos da API (PC + monitores da secretaria) para o select de filtro */
  let locaisFiltroExtra = [];
  /** Algum PC da secretaria sem local no cadastro — opção «(sem local definido)» no filtro */
  let temPcSemLocalNoCadastro = false;
  /** Último resumo global da secretaria (contadores das abas não dependem do filtro) */
  let lastResumo = null;

  const LOCAL_FILTRO_VAZIO = '__sem_local__';

  function valorFiltroLocal() {
    const sel = $('inv-filtro-local');
    return sel ? sel.value || '' : '';
  }

  /** Select de local do ecrã visível — evita pedir à API com o valor errado quando se usa -mon / -rel. */
  function selectFiltroLocalAtivo() {
    const scrMon = $('screen-monitores-painel');
    if (scrMon && scrMon.classList.contains('active')) return $('inv-filtro-local-mon');
    const scrRel = $('screen-relatorio-vistoria');
    if (scrRel && scrRel.classList.contains('active')) return $('inv-filtro-local-rel');
    return $('inv-filtro-local');
  }

  function valorFiltroLocalParaApi() {
    const sel = selectFiltroLocalAtivo();
    return sel ? sel.value || '' : '';
  }

  function populateFiltroLocal() {
    const sel = $('inv-filtro-local');
    if (!sel) return;
    const prev = sel.value;
    const sorted = [...locaisFiltroExtra].sort((a, b) =>
      String(a || '').localeCompare(String(b || ''), 'pt', {
        sensitivity: 'base',
      })
    );

    sel.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = 'Todos os locais';
    sel.appendChild(optAll);
    for (const loc of sorted) {
      const t = String(loc || '').trim();
      if (!t) continue;
      const o = document.createElement('option');
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
    }
    if (temPcSemLocalNoCadastro) {
      const o = document.createElement('option');
      o.value = LOCAL_FILTRO_VAZIO;
      o.textContent = '(sem local definido)';
      sel.appendChild(o);
    }

    const retains = [...sel.options].some((opt) => opt.value === prev);
    if (retains) sel.value = prev;
    else sel.value = '';
    syncFiltroLocalAuxiliares();
  }

  function syncFiltroLocalAuxiliares() {
    const main = $('inv-filtro-local');
    if (!main) return;
    const v = main.value;
    for (const suf of ['mon', 'rel']) {
      const aux = $('inv-filtro-local-' + suf);
      if (!aux) continue;
      aux.innerHTML = '';
      for (let i = 0; i < main.options.length; i++) {
        const o = main.options[i];
        const no = document.createElement('option');
        no.value = o.value;
        no.textContent = o.text;
        aux.appendChild(no);
      }
      if ([...aux.options].some((opt) => opt.value === v)) aux.value = v;
      else aux.value = '';
    }
  }

  function isPendente(c) {
    return !c.auditoria;
  }

  function isFeito(c) {
    return !!c.auditoria;
  }

  function updateTabCounts() {
    if (
      lastResumo &&
      lastResumo.computadores_total != null &&
      Number(lastResumo.computadores_total) > 0
    ) {
      const feitos =
        (lastResumo.confirmados || 0) +
        (lastResumo.nao_encontrado || 0) +
        (lastResumo.outro_local || 0);
      $('cnt-pend').textContent = String(lastResumo.pendentes || 0);
      $('cnt-feitos').textContent = String(feitos);
      return;
    }
    const pend = computadoresCache.filter(isPendente).length;
    const feitos = computadoresCache.filter(isFeito).length;
    $('cnt-pend').textContent = String(pend);
    $('cnt-feitos').textContent = String(feitos);
  }

  function renderResumo(r) {
    const wrap = $('inv-dashboard');
    if (!wrap) return;
    if (!r || typeof r !== 'object') {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;

    const total = r.computadores_total || 0;
    const pct = Math.max(0, Math.min(100, Number(r.percent_vistoria_feita) || 0));
    const bar = $('inv-dash-bar-fill');
    const barTrack = $('inv-dash-progressbar');
    const cap = $('inv-dash-caption');
    const stats = $('inv-dash-stats');
    const statsMon = $('inv-dash-stats-mon');
    const monEl = $('inv-dash-mon');
    const alertEl = $('inv-dash-alert');

    if (bar) bar.style.width = pct + '%';
    if (barTrack) {
      barTrack.setAttribute('aria-valuenow', String(Math.round(pct)));
      barTrack.setAttribute('aria-valuemax', '100');
    }

    if (cap) {
      if (total === 0) {
        cap.textContent =
          'Nenhum equipamento listado para esta secretaria. Se acabou de importar, confira no admin.';
      } else {
        const reg =
          (r.confirmados || 0) +
          (r.nao_encontrado || 0) +
          (r.outro_local || 0);
        const mTot = r.monitores_total != null ? Number(r.monitores_total) : 0;
        const mFalta =
          r.monitores_sem_vinculo != null ? Number(r.monitores_sem_vinculo) : 0;
        let t =
          reg +
          ' de ' +
          total +
          ' computadores já têm registo de vistoria (' +
          pct +
          '%). ';
        if (r.pendentes) {
          t +=
            'Faltam **' +
            r.pendentes +
            ' computador(es)** por inventariar (aba «A vistoriar»). ';
        } else {
          t += 'Todos os computadores foram tratados. ';
        }
        if (mTot > 0) {
          if (mFalta > 0) {
            t +=
              'Faltam associar **' +
              mFalta +
              ' de ' +
              mTot +
              ' monitor(es)** na vistoria (ligação ao confirmar cada PC). ';
          } else {
            t +=
              'Todos os **' +
              mTot +
              ' monitor(es)** do cadastro já têm vínculo na vistoria. ';
          }
        }
        cap.innerHTML = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      }
    }

    if (stats) {
      if (total === 0) {
        stats.innerHTML = '';
      } else {
        function cell(n, lbl, cls) {
          return (
            '<div class="inv-dash-stat' +
            (cls ? ' ' + cls : '') +
            '"><span class="inv-dash-num">' +
            escapeHtml(String(n)) +
            '</span><span class="inv-dash-lbl">' +
            escapeHtml(lbl) +
            '</span></div>'
          );
        }
        stats.innerHTML =
          cell(r.pendentes || 0, 'Por inventariar', 'stat-pend') +
          cell(r.confirmados || 0, 'Confirmados', 'stat-ok') +
          cell(r.outro_local || 0, 'Outro local', 'stat-warn') +
          cell(r.nao_encontrado || 0, 'Não encontrado', 'stat-no');
      }
    }

    if (statsMon) {
      const m = r.monitores_total != null ? Number(r.monitores_total) : 0;
      if (m === 0) {
        statsMon.innerHTML = '';
      } else {
        function cellMon(n, lbl, cls) {
          return (
            '<div class="inv-dash-stat' +
            (cls ? ' ' + cls : '') +
            '"><span class="inv-dash-num">' +
            escapeHtml(String(n)) +
            '</span><span class="inv-dash-lbl">' +
            escapeHtml(lbl) +
            '</span></div>'
          );
        }
        const falta =
          r.monitores_sem_vinculo != null ? Number(r.monitores_sem_vinculo) : m;
        const ok =
          r.monitores_com_vinculo != null
            ? Number(r.monitores_com_vinculo)
            : Math.max(0, m - falta);
        statsMon.innerHTML =
          cellMon(falta, 'Falta inventariar (sem vínculo)', 'stat-pend') +
          cellMon(ok, 'Já associados a um PC', 'stat-ok');
      }
    }

    if (alertEl) {
      const nAlert =
        r.pcs_confirmados_sem_monitor != null
          ? Number(r.pcs_confirmados_sem_monitor)
          : 0;
      if (nAlert > 0) {
        alertEl.hidden = false;
        alertEl.innerHTML =
          '<strong>Atenção:</strong> ' +
          escapeHtml(String(nAlert)) +
          ' computador(es) está(ão) <strong>confirmado(s)</strong> mas <strong>sem monitor escolhido</strong> na vistoria. Abra «Ajustar monitores» em cada um ou use a lista «Já inventariados».';
      } else {
        alertEl.hidden = true;
        alertEl.innerHTML = '';
      }
    }

    if (monEl) {
      const m = r.monitores_total != null ? Number(r.monitores_total) : 0;
      const pMon =
        r.percent_monitores_vinculados != null &&
        r.percent_monitores_vinculados !== ''
          ? Number(r.percent_monitores_vinculados)
          : null;
      if (m === 0) {
        monEl.textContent =
          'Nenhum monitor no cadastro desta secretaria. O pormenor dos vínculos está em «Ver monitores».';
      } else {
        monEl.textContent =
          'Cadastro: ' +
          m +
          ' monitor(es)' +
          (pMon != null && !Number.isNaN(pMon)
            ? ' · ' + pMon + '% já associados a um PC na vistoria.'
            : '.') +
          ' Pormenor: «Ver monitores».';
      }
    }
  }

  function updateDatalist() {
    const dl = $('inv-datalist');
    if (!dl) return;
    dl.innerHTML = '';
    const pool = computadoresCache.filter((c) => isPendente(c));
    const seen = new Set();
    let n = 0;
    for (const c of pool) {
      const pat = String(c.patrimonio || '').trim();
      const nom = String(c.nome_maquina || '').trim();
      const line =
        (pat ? 'Pat. ' + pat : '') + (pat && nom ? ' — ' : '') + (nom || '(sem nome)');
      if (!line.trim()) continue;
      if (seen.has(line)) continue;
      seen.add(line);
      const opt = document.createElement('option');
      opt.value = line;
      dl.appendChild(opt);
      if (++n >= 50) break;
    }
  }

  function renderLista() {
    $('titulo-secretaria').textContent = secretariaNome || 'Vistoria';
    const root = $('lista-computadores');
    root.innerHTML = '';

    const list = computadoresCache.filter((c) => {
      if (currentTab === 'pendente' && !isPendente(c)) return false;
      if (currentTab === 'feitos' && !isFeito(c)) return false;
      return true;
    });

    if (list.length === 0) {
      root.innerHTML =
        '<p class="muted">Nenhum equipamento nesta lista com os filtros atuais.</p>';
      return;
    }

    list.forEach((c) => {
      const div = document.createElement('div');
      div.className = 'card';
      div.dataset.pcId = String(c.id);

      const audit = c.auditoria;
      const quick = !audit;

      const selRow = quick
        ? '<div class="inv-card-select"><label><input type="checkbox" class="inv-pc-check" data-pc-id="' +
          c.id +
          '" /> Incluir no lote</label></div>'
        : '';

      div.innerHTML =
        selRow +
        '<p class="card-title">' +
        escapeHtml(c.nome_maquina || '(sem nome)') +
        '</p>' +
        '<p class="meta">Patrimônio: ' +
        escapeHtml(c.patrimonio || '—') +
        '</p>' +
        '<p class="meta">Local: ' +
        escapeHtml(c.localizacao || '—') +
        '</p>' +
        (c.status_ad ? '<p class="meta">AD: ' + escapeHtml(c.status_ad) + '</p>' : '') +
        badgeHtml(audit) +
        (quick
          ? '<div class="pc-actions-mini">' +
            '<button type="button" class="btn btn-primary btn-inline" data-act="abrir">Vistoriar</button>' +
            '<button type="button" class="btn btn-ghost btn-inline" data-act="nao_encontrado">Não encontrado</button>' +
            '<button type="button" class="btn btn-ghost btn-inline" data-act="outro_local">Outro local</button>' +
            '</div>'
          : '<div class="pc-actions-mini">' +
            (audit.confirmado === 'confirmado'
              ? '<button type="button" class="btn btn-ghost btn-inline" data-act="ajuste-nome">Ajustar nome</button>' +
                '<button type="button" class="btn btn-success btn-inline" data-act="monitores">Ajustar monitores</button>'
              : '<button type="button" class="btn btn-ghost btn-inline" data-act="ver-resumo">Ver registro</button>') +
            '</div>');

      div.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-act');
          if (act === 'abrir') openDetail(c);
          else if (act === 'ajuste-nome') openAjustarNome(c);
          else if (act === 'monitores') openMonitoresFlow(c);
          else if (act === 'ver-resumo') verResumoAuditoria(c);
          else onQuickAction(c, act);
        });
      });
      root.appendChild(div);
    });
    updateBatchUi();
  }

  function getSelectedPendenteIds() {
    return [
      ...document.querySelectorAll('#lista-computadores .inv-pc-check:checked'),
    ]
      .map((cb) => parseInt(cb.getAttribute('data-pc-id'), 10))
      .filter((n) => !Number.isNaN(n) && n > 0);
  }

  function updateBatchUi() {
    const wrap = $('inv-batch-wrap');
    const cnt = $('inv-batch-count');
    if (!wrap || !cnt) return;
    const onPend = currentTab === 'pendente';
    wrap.hidden = !onPend;
    cnt.textContent = String(
      onPend
        ? document.querySelectorAll('#lista-computadores .inv-pc-check:checked')
            .length
        : 0
    );
  }

  function openDetail(c) {
    detailPc = c;
    showErr('detail-err', '');
    const pat = c.patrimonio || '—';
    const loc = c.localizacao || '—';
    const resumo =
      'Patrimônio <strong>' +
      escapeHtml(pat) +
      '</strong> · Local: ' +
      escapeHtml(loc);
    $('detail-resumo').innerHTML = resumo;

    $('detail-nome').value = c.nome_maquina || '';
    detailNomePrimeiroFoco = true;
    $('detail-nome').readOnly = false;

    $('detail-confirm').style.display = 'inline-flex';
    $('detail-nao').style.display = 'inline-flex';
    $('detail-outro').style.display = 'inline-flex';

    showScreen('screen-detail');
  }

  function verResumoAuditoria(c) {
    const a = c.auditoria;
    if (!a) return;
    let t = 'Status: ' + a.confirmado;
    if (a.observacao) t += '\nObservação: ' + a.observacao;
    if (a.data) t += '\nData: ' + a.data;
    window.alert(t);
  }

  async function onQuickAction(c, act) {
    showErr('list-err', '');
    const { token, senha } = getAuth();
    let observacao = null;
    if (act === 'outro_local')
      observacao = window.prompt('Observação (opcional):', '') || null;
    if (act === 'nao_encontrado' || act === 'outro_local') {
      if (!window.confirm('Registrar este equipamento como ' + (act === 'nao_encontrado' ? 'não encontrado' : 'em outro local') + '?')) return;
    }
    try {
      await apiAuditoria({
        token,
        senha,
        computador_id: c.id,
        confirmado: act,
        observacao,
      });
      await refreshData();
    } catch (e) {
      showErr('list-err', e.message);
    }
  }

  $('detail-confirm').onclick = async () => {
    showErr('detail-err', '');
    const nome = normalizeNomeMaquinaInput($('detail-nome').value);
    if (!nome) {
      showErr(
        'detail-err',
        'Informe o nome da máquina (somente letras e números, em maiúsculas).'
      );
      return;
    }
    const { token, senha } = getAuth();
    const c = detailPc;
    if (!c) return;
    try {
      const res = await apiAuditoria({
        token,
        senha,
        computador_id: c.id,
        confirmado: 'confirmado',
        nome_maquina: nome,
      });
      c.nome_maquina = nome;
      c.auditoria = {
        id: res.auditoria_id,
        confirmado: 'confirmado',
        data: new Date().toISOString(),
      };
      await openMonitoresFlow({ ...c, auditoria: c.auditoria });
    } catch (e) {
      showErr('detail-err', e.message);
    }
  };

  $('detail-nao').onclick = async () => {
    if (!detailPc) return;
    if (!window.confirm('Confirmar que o equipamento não foi encontrado?')) return;
    showErr('detail-err', '');
    try {
      const a = getAuth();
      await apiAuditoria({
        token: a.token,
        senha: a.senha,
        computador_id: detailPc.id,
        confirmado: 'nao_encontrado',
      });
      await refreshData();
      showScreen('screen-list');
    } catch (e) {
      showErr('detail-err', e.message);
    }
  };

  $('detail-outro').onclick = async () => {
    if (!detailPc) return;
    const observacao = window.prompt('Observação (opcional):', '') || null;
    if (!window.confirm('Registrar como em outro local?')) return;
    showErr('detail-err', '');
    try {
      const a = getAuth();
      await apiAuditoria({
        token: a.token,
        senha: a.senha,
        computador_id: detailPc.id,
        confirmado: 'outro_local',
        observacao,
      });
      await refreshData();
      showScreen('screen-list');
    } catch (e) {
      showErr('detail-err', e.message);
    }
  };

  $('btn-voltar-detail').onclick = () => {
    showScreen('screen-list');
    detailPc = null;
  };

  function openAjustarNome(c) {
    if (!c.auditoria || c.auditoria.confirmado !== 'confirmado') return;
    ajusteNomePc = c;
    showErr('nome-ajuste-err', '');
    const pat = c.patrimonio || '—';
    const sub =
      'Patrimônio <strong>' +
      escapeHtml(pat) +
      '</strong> · Local: ' +
      escapeHtml(c.localizacao || '—');
    $('nome-ajuste-sub').innerHTML = sub;
    $('nome-ajuste-input').value = c.nome_maquina || '';
    ajusteNomePrimeiroFoco = true;
    showScreen('screen-ajuste-nome');
  }

  $('btn-voltar-nome').onclick = () => {
    ajusteNomePc = null;
    showScreen('screen-list');
  };

  $('btn-salvar-nome').onclick = async () => {
    showErr('nome-ajuste-err', '');
    const c = ajusteNomePc;
    if (!c) return;
    const nome = normalizeNomeMaquinaInput($('nome-ajuste-input').value);
    if (!nome) {
      showErr(
        'nome-ajuste-err',
        'Informe o nome da máquina (somente letras e números, em maiúsculas).'
      );
      return;
    }
    const { token, senha } = getAuth();
    try {
      await apiAuditoria({
        token,
        senha,
        computador_id: c.id,
        confirmado: 'confirmado',
        nome_maquina: nome,
      });
      c.nome_maquina = nome;
      ajusteNomePc = null;
      await refreshData();
      showScreen('screen-list');
    } catch (e) {
      showErr('nome-ajuste-err', e.message);
    }
  };

  function fillMonitorSelects(preselect) {
    const s1 = $('mon-sel-1');
    const s2 = $('mon-sel-2');
    const pres = preselect || [null, null];
    s1.innerHTML = '<option value="">— Nenhum —</option>';
    s2.innerHTML = '<option value="">— Nenhum —</option>';
    monitorOptsCache.forEach((m) => {
      const t =
        (m.patrimonio || m.id) + (m.modelo ? ' — ' + m.modelo : '');
      [s1, s2].forEach((sel) => {
        const o = document.createElement('option');
        o.value = String(m.id);
        o.textContent = t;
        sel.appendChild(o);
      });
    });
    s1.value = pres[0] != null ? String(pres[0]) : '';
    s2.value = pres[1] != null ? String(pres[1]) : '';
    if (s1.value && s1.value === s2.value) s2.value = '';
  }

  let monitorCtx = { computadorId: null, auditoriaId: null, label: '' };

  async function openMonitoresFlow(c) {
    showErr('mon-err', '');
    const aid = c.auditoria && c.auditoria.id;
    if (!aid) {
      showErr('list-err', 'Confirme o equipamento com o nome da máquina antes dos monitores.');
      return;
    }
    monitorCtx = {
      computadorId: c.id,
      auditoriaId: aid,
      label:
        (c.nome_maquina || '') + ' · Pat. ' + (c.patrimonio || '—'),
    };
    $('mon-pc-label').textContent = monitorCtx.label;

    try {
      if (!monitorOptsCache.length) {
        const L = await apiMonitoresLista();
        monitorOptsCache = L.monitores || [];
      }

      const data = await apiMonitoresComputador(c.id);
      monitorCtx.auditoriaId = data.auditoria_id || aid;
      const ativos = (data.monitores || [])
        .filter((m) => m.confirmado)
        .map((m) => m.id)
        .slice(0, 2);
      fillMonitorSelects([ativos[0] || null, ativos[1] || null]);

      if (!(data.monitores && data.monitores.length) && !monitorOptsCache.length) {
        showErr('mon-err', 'Nenhum monitor cadastrado para esta secretaria.');
      }
      showScreen('screen-monitors');
    } catch (e) {
      showErr('list-err', e.message);
    }
  }

  $('btn-salvar-mon').onclick = async () => {
    showErr('mon-err', '');
    const id1 = parseInt($('mon-sel-1').value, 10);
    const id2 = parseInt($('mon-sel-2').value, 10);
    const ids = [];
    if (!Number.isNaN(id1) && id1 > 0) ids.push(id1);
    if (!Number.isNaN(id2) && id2 > 0 && id2 !== id1) ids.push(id2);
    try {
      await apiAuditoriaMonitoresPorIds(monitorCtx.auditoriaId, ids);
      await refreshData();
      showScreen('screen-list');
    } catch (e) {
      showErr('mon-err', e.message);
    }
  };

  $('btn-voltar-mon').onclick = async () => {
    try {
      await refreshData();
    } catch (_) {}
    showScreen('screen-list');
  };

  async function refreshData() {
    showErr('list-err', '');
    const data = await loadComputadores();
    secretariaNome = data.secretaria && data.secretaria.nome;
    computadoresCache = data.computadores;
    locaisFiltroExtra = Array.isArray(data.locais_filtro) ? data.locais_filtro : [];
    temPcSemLocalNoCadastro = !!data.tem_pc_sem_local;
    lastResumo = data.resumo || null;
    renderResumo(data.resumo);
    populateFiltroLocal();
    updateTabCounts();
    updateDatalist();
    renderLista();
  }

  document.querySelectorAll('.inv-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.inv-tab').forEach((b) => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      currentTab = btn.getAttribute('data-tab');
      renderLista();
    });
  });

  const listaRoot = $('lista-computadores');
  if (listaRoot) {
    listaRoot.addEventListener('change', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('inv-pc-check'))
        updateBatchUi();
    });
  }

  const monListaRoot = $('mon-painel-lista');
  if (monListaRoot) {
    monListaRoot.addEventListener('change', (e) => {
      if (
        e.target &&
        e.target.classList &&
        e.target.classList.contains('inv-mon-check')
      )
        updateMonBatchUi();
    });
  }

  const btnMonClear = $('btn-mon-batch-clear');
  if (btnMonClear) {
    btnMonClear.onclick = () => {
      document
        .querySelectorAll('#mon-painel-lista .inv-mon-check')
        .forEach((cb) => {
          cb.checked = false;
        });
      updateMonBatchUi();
    };
  }

  const btnMonSelAll = $('btn-mon-batch-sel-all');
  if (btnMonSelAll) {
    btnMonSelAll.onclick = () => {
      document
        .querySelectorAll('#mon-painel-lista .inv-mon-check')
        .forEach((cb) => {
          cb.checked = true;
        });
      updateMonBatchUi();
    };
  }

  const btnMonBatchNao = $('btn-mon-batch-nao');
  if (btnMonBatchNao) {
    btnMonBatchNao.onclick = async () => {
      showErr('mon-painel-err', '');
      const ids = getSelectedMonLoteIds();
      if (!ids.length) {
        showErr('mon-painel-err', 'Marque ao menos um monitor.');
        return;
      }
      const anyV = [
        ...document.querySelectorAll(
          '#mon-painel-lista .inv-mon-check:checked'
        ),
      ].some((cb) => cb.getAttribute('data-mon-vinculo') === '1');
      let msg =
        'Registrar ' +
        ids.length +
        ' monitor(es) como não encontrado no inventário?';
      if (anyV)
        msg +=
          '\n\nAlguns estão associados a computadores na vistoria. As associações serão removidas.';
      if (!window.confirm(msg)) return;
      try {
        await apiInventarioMonitorNaoEncontradoLote(ids);
        await refreshData();
        const data = await apiMonitoresPainel();
        renderMonitoresPainel(data);
      } catch (e) {
        showErr('mon-painel-err', e.message);
      }
    };
  }

  $('btn-batch-clear').onclick = () => {
    document.querySelectorAll('#lista-computadores .inv-pc-check').forEach((cb) => {
      cb.checked = false;
    });
    updateBatchUi();
  };

  $('btn-batch-sel-all').onclick = () => {
    if (currentTab !== 'pendente') return;
    document.querySelectorAll('#lista-computadores .inv-pc-check').forEach((cb) => {
      cb.checked = true;
    });
    updateBatchUi();
  };

  $('btn-batch-outro').onclick = async () => {
    showErr('list-err', '');
    const ids = getSelectedPendenteIds();
    if (!ids.length) {
      showErr('list-err', 'Marque ao menos um equipamento pendente.');
      return;
    }
    const observacao = window.prompt('Observação (opcional) para todos:', '') || null;
    if (
      !window.confirm(
        'Registrar ' +
          ids.length +
          ' equipamento(s) como em outro local?'
      )
    )
      return;
    try {
      const { token, senha } = getAuth();
      await apiAuditoriaLote({
        token,
        senha,
        computador_ids: ids,
        confirmado: 'outro_local',
        observacao,
      });
      await refreshData();
    } catch (e) {
      showErr('list-err', e.message);
    }
  };

  $('btn-batch-nao').onclick = async () => {
    showErr('list-err', '');
    const ids = getSelectedPendenteIds();
    if (!ids.length) {
      showErr('list-err', 'Marque ao menos um equipamento pendente.');
      return;
    }
    if (
      !window.confirm(
        'Registrar ' +
          ids.length +
          ' equipamento(s) como não encontrado (não existe mais neste local)?'
      )
    )
      return;
    try {
      const { token, senha } = getAuth();
      await apiAuditoriaLote({
        token,
        senha,
        computador_ids: ids,
        confirmado: 'nao_encontrado',
        observacao: null,
      });
      await refreshData();
    } catch (e) {
      showErr('list-err', e.message);
    }
  };

  const buscaEl = $('inv-busca');
  if (buscaEl) {
    buscaEl.addEventListener('input', () => {
      clearTimeout(buscaTimer);
      buscaTimer = setTimeout(() => {
        refreshData().catch((e) => showErr('list-err', e.message));
      }, 220);
    });
  }

  const filtroLocalEl = $('inv-filtro-local');
  if (filtroLocalEl) {
    filtroLocalEl.addEventListener('change', () => {
      refreshData().catch((e) => showErr('list-err', e.message));
    });
  }

  const filtroSecEl = $('inv-filtro-secretaria');
  if (filtroSecEl) {
    filtroSecEl.addEventListener('change', () => onTrocarSecretaria());
  }

  setupAuxFiltros('mon');
  setupAuxFiltros('rel');

  async function afterLogin() {
    showErr('list-err', '');
    monitorOptsCache = [];
    try {
      await refreshData();
      populateFiltroSecretaria();
      showScreen('screen-list');
    } catch (e) {
      clearAuth();
      showErr('login-err', e.message || 'Falha ao carregar inventário.');
      showScreen('screen-login');
    }
  }

  $('btn-login').onclick = async () => {
    showErr('login-err', '');
    const senha = ($('senha').value || '').trim();
    if (!tokenFromUrl) {
      showErr('login-err', 'Link inválido.');
      return;
    }
    if (!senha) {
      showErr('login-err', 'Digite a senha.');
      return;
    }
    try {
      const r = await fetch('/api/login-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenFromUrl, senha: senha }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Login inválido');
      setAuth(tokenFromUrl, senha);
      guardarOpcoesSecretarias(j.secretarias_mesma_senha);
      await afterLogin();
    } catch (e) {
      showErr('login-err', e.message);
    }
  };

  const btnMonPainel = $('btn-monitores-painel');
  if (btnMonPainel) btnMonPainel.onclick = () => openMonitoresPainel();

  const btnRelVistoria = $('btn-relatorio-vistoria');
  if (btnRelVistoria) btnRelVistoria.onclick = () => openRelatorioVistoria();

  const btnVoltarRelVistoria = $('btn-voltar-relatorio-vistoria');
  if (btnVoltarRelVistoria)
    btnVoltarRelVistoria.onclick = () => {
      copyAuxToMain('rel');
      showScreen('screen-list');
    };

  const btnVoltarMonPainel = $('btn-voltar-mon-painel');
  if (btnVoltarMonPainel)
    btnVoltarMonPainel.onclick = () => {
      copyAuxToMain('mon');
      showScreen('screen-list');
    };

  $('btn-sair').onclick = () => {
    clearAuth();
    $('senha').value = '';
    detailPc = null;
    ajusteNomePc = null;
    showScreen('screen-login');
  };

  function init() {
    if (!tokenFromUrl) {
      $('login-sub').textContent = 'Link inválido. Use o endereço enviado pela TI.';
      $('btn-login').disabled = true;
      return;
    }
    const storedTok = normToken(sessionStorage.getItem(TOKEN_KEY));
    if (storedTok && storedTok !== tokenFromUrl) {
      clearAuth();
    }
    const { token, senha } = getAuth();
    if (normToken(token) === tokenFromUrl && senha) {
      afterLogin();
    }
  }

  const elDetailNome = $('detail-nome');
  const elAjusteNome = $('nome-ajuste-input');
  if (elDetailNome) {
    elDetailNome.addEventListener('focus', () => {
      if (detailNomePrimeiroFoco) {
        elDetailNome.value = '';
        detailNomePrimeiroFoco = false;
      }
    });
    elDetailNome.addEventListener('input', () => {
      const norm = normalizeNomeMaquinaInput(elDetailNome.value);
      if (elDetailNome.value !== norm) elDetailNome.value = norm;
    });
  }
  if (elAjusteNome) {
    elAjusteNome.addEventListener('focus', () => {
      if (ajusteNomePrimeiroFoco) {
        elAjusteNome.value = '';
        ajusteNomePrimeiroFoco = false;
      }
    });
    elAjusteNome.addEventListener('input', () => {
      const norm = normalizeNomeMaquinaInput(elAjusteNome.value);
      if (elAjusteNome.value !== norm) elAjusteNome.value = norm;
    });
  }

  init();
})();
