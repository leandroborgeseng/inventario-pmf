(function () {
  const TOKEN_KEY = 'inv_token_url';
  const SENHA_KEY = 'inv_senha';

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
    const r = await fetch('/api/computadores/' + encodeURIComponent(token), {
      headers: { 'X-Senha': senha },
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Não autorizado');
    return j;
  }

  async function apiMonitoresPainel() {
    const { token, senha } = getAuth();
    const loc = valorFiltroLocal();
    const q = loc ? '?local=' + encodeURIComponent(loc) : '';
    const r = await fetch(
      '/api/monitores-painel/' + encodeURIComponent(token) + q,
      { headers: { 'X-Senha': senha } }
    );
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro ao carregar monitores');
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
    const sub = $('mon-painel-sub');
    const hint = $('mon-painel-hint');
    const resumo = $('mon-painel-resumo');
    const lista = $('mon-painel-lista');
    const locSel = valorFiltroLocal();
    const locLabel = (() => {
      const sel = $('inv-filtro-local');
      if (!sel || !locSel) return '';
      const opt = sel.options[sel.selectedIndex];
      return opt ? opt.textContent.trim() : '';
    })();

    if (sub) {
      sub.textContent =
        (secretariaNome || 'Secretaria') +
        ' · ' +
        (data.monitores && data.monitores.length
          ? data.monitores.length + ' monitor(es) nesta lista'
          : 'Nenhum monitor nesta lista');
    }
    if (hint) {
      if (!locSel) {
        hint.textContent =
          '«Não ligado»: ainda não foi escolhido na vistoria de nenhum computador. «Ligado»: associado ao gravar monitores após confirmar um PC.';
      } else {
        hint.textContent =
          'Filtro «' +
          locLabel +
          '»: monitores cujo local de cadastro ou o local do PC ligado coincidem. Monitores sem esse local em nenhum dos dois não aparecem.';
      }
    }

    const items = data.monitores || [];
    let nSem = 0;
    let nLigConfirm = 0;
    let nLigOutro = 0;
    let nLigNao = 0;
    for (const it of items) {
      if (!it.vinculo) nSem++;
      else if (it.vinculo.vistoria_pc === 'confirmado') nLigConfirm++;
      else if (it.vinculo.vistoria_pc === 'outro_local') nLigOutro++;
      else if (it.vinculo.vistoria_pc === 'nao_encontrado') nLigNao++;
    }
    if (resumo) {
      resumo.innerHTML =
        '<div class="inv-mon-resumo-inner">' +
        '<span><strong>' +
        nSem +
        '</strong> sem vínculo</span> · <span><strong>' +
        nLigConfirm +
        '</strong> ligados · vistoria OK</span> · <span class="warn-num"><strong>' +
        (nLigOutro + nLigNao) +
        '</strong> ligados · PC outro local / não encontrado</span></div>';
    }

    if (lista) {
      lista.innerHTML = '';
      if (!items.length) {
        lista.innerHTML =
          '<p class="muted">Nenhum monitor para mostrar. Ajuste o filtro de local ou confira o cadastro.</p>';
        return;
      }
      for (const it of items) {
        const div = document.createElement('div');
        div.className = 'card inv-mon-card';
        const pat = escapeHtml(it.patrimonio || '—');
        const mod = it.modelo ? escapeHtml(it.modelo) : '';
        const v = it.vinculo;
        let corpo = '';
        if (!v) {
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
        const locMon = it.localizacao
          ? '<p class="meta">Local (monitor): <strong>' +
            escapeHtml(String(it.localizacao)) +
            '</strong></p>'
          : '';
        div.innerHTML =
          '<p class="card-title">' +
          pat +
          (mod ? ' · ' + mod : '') +
          '</p>' +
          locMon +
          corpo;
        lista.appendChild(div);
      }
    }
  }

  async function openMonitoresPainel() {
    showErr('mon-painel-err', '');
    const lista = $('mon-painel-lista');
    if (lista) lista.innerHTML = '<p class="muted">A carregar…</p>';
    showScreen('screen-monitores-painel');
    try {
      const data = await apiMonitoresPainel();
      renderMonitoresPainel(data);
    } catch (e) {
      showErr('mon-painel-err', e.message);
      if (lista) lista.innerHTML = '';
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
    const loc = valorFiltroLocal();
    const q = loc ? '?local=' + encodeURIComponent(loc) : '';
    const r = await fetch(
      '/api/relatorio-vistoria/' + encodeURIComponent(token) + q,
      { headers: { 'X-Senha': senha } }
    );
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro ao carregar relatório');
    return j;
  }

  function renderRelatorioVistoria(data) {
    const sub = $('rel-vistoria-sub');
    const lista = $('rel-vistoria-lista');
    const locSel = valorFiltroLocal();
    const locLabel = (() => {
      const sel = $('inv-filtro-local');
      if (!sel || !locSel) return '';
      const opt = sel.options[sel.selectedIndex];
      return opt ? opt.textContent.trim() : '';
    })();

    if (sub) {
      let html =
        '<span>' +
        escapeHtml(data.secretaria && data.secretaria.nome ? data.secretaria.nome : '') +
        '</span> · <strong>' +
        escapeHtml(String(data.total != null ? data.total : 0)) +
        '</strong> equipamento(s) com vistoria registada';
      if (locSel) {
        html +=
          ' · filtro de local: <strong>' + escapeHtml(locLabel) + '</strong>';
      }
      sub.innerHTML = html;
    }

    if (!lista) return;
    lista.innerHTML = '';
    const itens = data.itens || [];
    if (!itens.length) {
      lista.innerHTML =
        '<p class="muted">Nenhum equipamento com vistoria neste filtro. Noutros casos, use «Todos os locais» ou confira se já existem registos na aba «Já inventariados».</p>';
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
    showScreen('screen-relatorio-vistoria');
    try {
      const d = await apiRelatorioVistoria();
      renderRelatorioVistoria(d);
    } catch (e) {
      showErr('rel-vistoria-err', e.message);
      if (lista) lista.innerHTML = '';
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

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
  }

  function matchesBusca(c, qRaw) {
    const q = norm(qRaw.trim());
    if (!q) return true;
    return [c.nome_maquina, c.patrimonio, c.localizacao, c.status_ad]
      .map((x) => norm(x))
      .some((t) => t.includes(q));
  }

  const LOCAL_FILTRO_VAZIO = '__sem_local__';

  function valorFiltroLocal() {
    const sel = $('inv-filtro-local');
    return sel ? sel.value || '' : '';
  }

  function matchesLocal(c, localSel) {
    if (!localSel) return true;
    const loc = String(c.localizacao || '').trim();
    if (localSel === LOCAL_FILTRO_VAZIO) return !loc;
    return loc === localSel;
  }

  function populateFiltroLocal() {
    const sel = $('inv-filtro-local');
    if (!sel) return;
    const prev = sel.value;
    const unique = new Set();
    let temSemLocal = false;
    for (const c of computadoresCache) {
      const t = String(c.localizacao || '').trim();
      if (!t) temSemLocal = true;
      else unique.add(t);
    }
    for (const x of locaisFiltroExtra) {
      const t = String(x || '').trim();
      if (t) unique.add(t);
    }
    const sorted = [...unique].sort((a, b) =>
      a.localeCompare(b, 'pt', { sensitivity: 'base' })
    );

    sel.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = 'Todos os locais';
    sel.appendChild(optAll);
    for (const loc of sorted) {
      const o = document.createElement('option');
      o.value = loc;
      o.textContent = loc;
      sel.appendChild(o);
    }
    if (temSemLocal) {
      const o = document.createElement('option');
      o.value = LOCAL_FILTRO_VAZIO;
      o.textContent = '(sem local definido)';
      sel.appendChild(o);
    }

    const retains = [...sel.options].some((opt) => opt.value === prev);
    if (retains) sel.value = prev;
    else sel.value = '';
  }

  function isPendente(c) {
    return !c.auditoria;
  }

  function isFeito(c) {
    return !!c.auditoria;
  }

  function updateTabCounts() {
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
    const q = norm($('inv-busca').value);
    const locF = valorFiltroLocal();
    const pool = computadoresCache.filter(
      (c) =>
        isPendente(c) &&
        matchesLocal(c, locF) &&
        (q ? matchesBusca(c, $('inv-busca').value) : true)
    );
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

    const q = $('inv-busca') ? $('inv-busca').value : '';
    const locF = valorFiltroLocal();
    const list = computadoresCache.filter((c) => {
      if (currentTab === 'pendente' && !isPendente(c)) return false;
      if (currentTab === 'feitos' && !isFeito(c)) return false;
      if (!matchesLocal(c, locF)) return false;
      return matchesBusca(c, q);
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
    const data = await loadComputadores();
    secretariaNome = data.secretaria && data.secretaria.nome;
    computadoresCache = data.computadores;
    locaisFiltroExtra = Array.isArray(data.locais_filtro) ? data.locais_filtro : [];
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
        updateDatalist();
        renderLista();
      }, 180);
    });
  }

  const filtroLocalEl = $('inv-filtro-local');
  if (filtroLocalEl) {
    filtroLocalEl.addEventListener('change', () => {
      updateDatalist();
      renderLista();
    });
  }

  async function afterLogin() {
    showErr('list-err', '');
    monitorOptsCache = [];
    try {
      await refreshData();
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
    btnVoltarRelVistoria.onclick = () => showScreen('screen-list');

  const btnVoltarMonPainel = $('btn-voltar-mon-painel');
  if (btnVoltarMonPainel)
    btnVoltarMonPainel.onclick = () => showScreen('screen-list');

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
