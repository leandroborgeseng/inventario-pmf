(function () {
  const TOKEN_KEY = 'inv_token_url';
  const SENHA_KEY = 'inv_senha';

  const pathMatch = window.location.pathname.match(/^\/inventario\/([^/]+)\/?$/);
  const tokenFromUrl = pathMatch ? pathMatch[1] : null;

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
    const token = tokenFromUrl || sessionStorage.getItem(TOKEN_KEY);
    const senha = sessionStorage.getItem(SENHA_KEY);
    return { token, senha };
  }

  function setAuth(token, senha) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(SENHA_KEY, senha);
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

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  let computadoresCache = [];
  let secretariaNome = '';
  let currentTab = 'pendente';
  let buscaTimer = null;
  let monitorOptsCache = [];
  let detailPc = null;

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

  function updateDatalist() {
    const dl = $('inv-datalist');
    if (!dl) return;
    dl.innerHTML = '';
    const q = norm($('inv-busca').value);
    const pool = computadoresCache.filter(
      (c) => isPendente(c) && (q ? matchesBusca(c, $('inv-busca').value) : true)
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
    const list = computadoresCache.filter((c) => {
      if (currentTab === 'pendente' && !isPendente(c)) return false;
      if (currentTab === 'feitos' && !isFeito(c)) return false;
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

      div.innerHTML =
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
              ? '<button type="button" class="btn btn-success btn-inline" data-act="monitores">Ajustar monitores</button>'
              : '<button type="button" class="btn btn-ghost btn-inline" data-act="ver-resumo">Ver registro</button>') +
            '</div>');

      div.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-act');
          if (act === 'abrir') openDetail(c);
          else if (act === 'monitores') openMonitoresFlow(c);
          else if (act === 'ver-resumo') verResumoAuditoria(c);
          else onQuickAction(c, act);
        });
      });
      root.appendChild(div);
    });
  }

  function openDetail(c) {
    detailPc = c;
    showErr('detail-err', '');
    const pat = c.patrimonio || '—';
    const loc = c.localizacao || '—';
    $('detail-resumo').innerHTML =
      'Patrimônio <strong>' +
      escapeHtml(pat) +
      '</strong> · Local: ' +
      escapeHtml(loc);

    $('detail-nome').value = c.nome_maquina || '';
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
    const nome = ($('detail-nome').value || '').trim();
    if (!nome) {
      showErr('detail-err', 'Informe o nome da máquina.');
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
    const senha = $('senha').value;
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
        body: JSON.stringify({ token: tokenFromUrl, senha }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Login inválido');
      setAuth(tokenFromUrl, senha);
      await afterLogin();
    } catch (e) {
      showErr('login-err', e.message);
    }
  };

  $('btn-sair').onclick = () => {
    clearAuth();
    $('senha').value = '';
    detailPc = null;
    showScreen('screen-login');
  };

  function init() {
    if (!tokenFromUrl) {
      $('login-sub').textContent = 'Link inválido. Use o endereço enviado pela TI.';
      $('btn-login').disabled = true;
      return;
    }
    const { token, senha } = getAuth();
    if (token === tokenFromUrl && senha) {
      afterLogin();
    }
  }

  init();
})();
