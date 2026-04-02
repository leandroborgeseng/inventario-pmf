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

  async function apiMonitores(computadorId) {
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

  async function apiAuditoriaMonitores(auditoriaId, monitores) {
    const { token, senha } = getAuth();
    const r = await fetch('/api/auditoria-monitores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        senha,
        auditoria_id: auditoriaId,
        monitores,
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
    if (!audit)
      return '<span class="badge pending">Pendente</span>';
    if (audit.confirmado === 'confirmado')
      return '<span class="badge ok">Confirmado</span>';
    if (audit.confirmado === 'nao_encontrado')
      return '<span class="badge no">Não encontrado</span>';
    if (audit.confirmado === 'outro_local')
      return '<span class="badge move">Outro local</span>';
    return '<span class="badge pending">' + escapeHtml(audit.confirmado) + '</span>';
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  let computadoresCache = [];

  function renderLista(data) {
    $('titulo-secretaria').textContent = data.secretaria.nome;
    const root = $('lista-computadores');
    root.innerHTML = '';
    computadoresCache = data.computadores;
    data.computadores.forEach((c) => {
      const div = document.createElement('div');
      div.className = 'card';
      div.dataset.pcId = String(c.id);
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
        (c.status_ad
          ? '<p class="meta">AD: ' + escapeHtml(c.status_ad) + '</p>'
          : '') +
        badgeHtml(c.auditoria) +
        '<div class="btn-row side">' +
        '<button type="button" class="btn btn-success" data-act="confirmado">Confirmar</button>' +
        '<button type="button" class="btn btn-danger" data-act="nao_encontrado">Não encontrado</button>' +
        '</div>' +
        '<div class="btn-row">' +
        '<button type="button" class="btn btn-warn" data-act="outro_local">Outro local</button>' +
        (c.auditoria && c.auditoria.confirmado === 'confirmado'
          ? '<button type="button" class="btn btn-ghost" data-act="monitores">Monitores…</button>'
          : '') +
        '</div>';

      div.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', () =>
          onPcAction(c, btn.getAttribute('data-act'))
        );
      });
      root.appendChild(div);
    });
  }

  let monitorCtx = { computadorId: null, auditoriaId: null, label: '' };

  async function onPcAction(c, act) {
    showErr('list-err', '');
    const { token, senha } = getAuth();
    if (act === 'monitores') {
      await openMonitores(c);
      return;
    }
    let observacao = null;
    if (act === 'outro_local') {
      observacao = window.prompt('Observação (opcional):', '') || null;
    }
    try {
      const res = await apiAuditoria({
        token,
        senha,
        computador_id: c.id,
        confirmado: act,
        observacao,
      });
      c.auditoria = {
        id: res.auditoria_id,
        confirmado: act,
        observacao,
        data: new Date().toISOString(),
      };
      if (act === 'confirmado') {
        await openMonitores({ ...c, auditoria: c.auditoria });
      } else {
        const data = await loadComputadores();
        renderLista(data);
      }
    } catch (e) {
      showErr('list-err', e.message);
    }
  }

  async function openMonitores(c) {
    showErr('mon-err', '');
    const aid = c.auditoria && c.auditoria.id;
    if (!aid) {
      showErr('list-err', 'Salve o computador como confirmado antes.');
      return;
    }
    monitorCtx = {
      computadorId: c.id,
      auditoriaId: aid,
      label:
        (c.nome_maquina || '') +
        ' · Pat. ' +
        (c.patrimonio || '—'),
    };
    $('mon-pc-label').textContent = monitorCtx.label;
    try {
      const data = await apiMonitores(c.id);
      monitorCtx.auditoriaId = data.auditoria_id || aid;
      const ul = $('lista-monitores');
      ul.innerHTML = '';
      if (!data.monitores || data.monitores.length === 0) {
        const li = document.createElement('li');
        li.className = 'check-item muted';
        li.textContent = 'Nenhum monitor cadastrado para esta secretaria.';
        ul.appendChild(li);
      } else {
        data.monitores.forEach((m) => {
          const li = document.createElement('li');
          li.className = 'check-item';
          const id = 'mon-' + m.id;
          li.innerHTML =
            '<input type="checkbox" id="' +
            id +
            '" data-mid="' +
            m.id +
            '"' +
            (m.confirmado ? ' checked' : '') +
            ' />' +
            '<label for="' +
            id +
            '">Monitor patrimônio ' +
            escapeHtml(m.patrimonio || m.id) +
            (m.modelo ? ' — ' + escapeHtml(m.modelo) : '') +
            '</label>';
          ul.appendChild(li);
        });
      }
      showScreen('screen-monitors');
    } catch (e) {
      showErr('list-err', e.message);
    }
  }

  $('btn-salvar-mon').onclick = async () => {
    showErr('mon-err', '');
    const items = $('lista-monitores').querySelectorAll('input[type=checkbox][data-mid]');
    const monitores = [];
    items.forEach((inp) => {
      monitores.push({
        monitor_id: parseInt(inp.getAttribute('data-mid'), 10),
        confirmado: inp.checked,
      });
    });
    try {
      await apiAuditoriaMonitores(monitorCtx.auditoriaId, monitores);
      const data = await loadComputadores();
      renderLista(data);
      showScreen('screen-list');
    } catch (e) {
      showErr('mon-err', e.message);
    }
  };

  $('btn-voltar-mon').onclick = async () => {
    try {
      const data = await loadComputadores();
      renderLista(data);
    } catch (_) {}
    showScreen('screen-list');
  };

  async function afterLogin() {
    showErr('list-err', '');
    try {
      const data = await loadComputadores();
      renderLista(data);
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
