'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');

const PORT = process.env.PORT || 3000;

const DB_PATH =
  process.env.DB_PATH ||
  path.join(__dirname, 'database.sqlite');

function ensureDbDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDbDir();

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Erro ao abrir SQLite:', err.message);
    process.exit(1);
  }
});

const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/** Token na URL ou no corpo pode vir com espaços/encoding; compara senha com trim. */
function normalizeClientToken(raw) {
  if (raw == null) return '';
  let t = String(raw).trim();
  if (!t) return '';
  try {
    t = decodeURIComponent(t);
  } catch (_) {
    /* já decodificado */
  }
  return String(t).trim();
}

async function getSecretariaByToken(rawToken) {
  const token = normalizeClientToken(rawToken);
  if (!token) return null;
  let row = await dbGet('SELECT * FROM secretarias WHERE token = ?', [token]);
  if (row) return row;
  return dbGet(
    'SELECT * FROM secretarias WHERE LOWER(TRIM(token)) = LOWER(?)',
    [token]
  );
}

async function validateSecretariaAccess(rawToken, rawSenha) {
  const s = await getSecretariaByToken(rawToken);
  if (!s) return null;
  const a = rawSenha == null ? '' : String(rawSenha).trim();
  const b = s.senha == null ? '' : String(s.senha).trim();
  if (a !== b) return null;
  return s;
}

function validateAdmin(req) {
  const pwd =
    req.headers['x-admin-password'] ||
    req.query?.adminSenha ||
    req.body?.adminSenha;
  const expected = process.env.ADMIN_SENHA || '';
  return Boolean(expected && pwd === expected);
}

/** URL pública para links no admin (Railway, etc.). Aceita vários nomes de variável. */
function resolveStaticPublicUrl() {
  const raw =
    process.env.PUBLIC_BASE_URL ||
    process.env.PUBLIC_URL ||
    process.env.APP_URL ||
    process.env.BASE_URL ||
    process.env.FRONTEND_URL ||
    '';
  let u = String(raw).trim().replace(/\/$/, '');
  if (u && !/^https?:\/\//i.test(u))
    u = 'https://' + u.replace(/^\/*/, '');
  if (u) return u;

  const rDom = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  if (rDom) {
    const host = rDom.replace(/^https?:\/\//, '').split('/')[0];
    if (host) return `https://${host}`;
  }

  const rUrl = String(
    process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_URL || ''
  ).trim();
  if (rUrl) {
    let x = rUrl.replace(/\/$/, '');
    if (!/^https?:\/\//i.test(x)) x = 'https://' + x.replace(/^\/*/, '');
    return x;
  }

  return '';
}

function publicBaseUrl(req) {
  const fixed = resolveStaticPublicUrl();
  if (fixed) return fixed;
  const proto =
    req.get('x-forwarded-proto') ||
    (req.secure ? 'https' : 'http');
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost';
  return `${proto}://${host}`;
}

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

app.get('/inventario/:token', (req, res) => {
  res.sendFile(path.join(publicDir, 'inventario.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

/** POST /api/login-token { token, senha } */
app.post('/api/login-token', async (req, res) => {
  try {
    const { token, senha } = req.body || {};
    const s = await validateSecretariaAccess(token, senha);
    if (!s) {
      try {
        const n = await dbGet('SELECT COUNT(*) AS c FROM secretarias');
        if (n && n.c === 0) {
          return res.status(401).json({
            ok: false,
            error:
              'Nenhuma secretaria cadastrada. No painel admin use «Reimportar planilhas» ou rode o import no servidor.',
          });
        }
      } catch (_) {
        /* ignora */
      }
      return res.status(401).json({
        ok: false,
        error:
          'Token ou senha incorretos. Confira o link completo (copie de novo do admin), a senha atual (sem espaço no começo/fim) e se a base foi importada.',
      });
    }
    res.json({
      ok: true,
      secretaria: { id: s.id, nome: s.nome },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /api/computadores/:token — header X-Senha */
app.get('/api/computadores/:token', async (req, res) => {
  try {
    const senha = req.headers['x-senha'] || req.query.senha;
    const s = await validateSecretariaAccess(req.params.token, senha);
    if (!s) return res.status(401).json({ error: 'Não autorizado' });

    const rows = await dbAll(
      `SELECT c.id, c.nome_maquina, c.patrimonio, c.localizacao, c.status_ad,
              a.id AS auditoria_id, a.confirmado AS audit_confirmado,
              a.observacao AS audit_observacao, a.data AS audit_data
       FROM computadores c
       LEFT JOIN auditoria a ON a.computador_id = c.id
       WHERE c.secretaria_id = ?
       ORDER BY c.nome_maquina COLLATE NOCASE, c.patrimonio`,
      [s.id]
    );

    const list = rows.map((r) => ({
      id: r.id,
      nome_maquina: r.nome_maquina,
      patrimonio: r.patrimonio,
      localizacao: r.localizacao,
      status_ad: r.status_ad,
      auditoria: r.auditoria_id
        ? {
            id: r.auditoria_id,
            confirmado: r.audit_confirmado,
            observacao: r.audit_observacao,
            data: r.audit_data,
          }
        : null,
    }));

    res.json({ ok: true, secretaria: { nome: s.nome }, computadores: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/monitores/:token — X-Senha. Query lista=1 lista só equipamentos; senão computador_id obrigatório */
app.get('/api/monitores/:token', async (req, res) => {
  try {
    const senha = req.headers['x-senha'] || req.query.senha;
    const s = await validateSecretariaAccess(req.params.token, senha);
    if (!s) return res.status(401).json({ error: 'Não autorizado' });

    const monitores = await dbAll(
      `SELECT m.id, m.patrimonio, m.modelo
       FROM monitores m
       WHERE m.secretaria_id = ?
       ORDER BY m.patrimonio COLLATE NOCASE`,
      [s.id]
    );

    const lista = req.query.lista === '1' || req.query.lista === 'true';
    if (lista) {
      return res.json({
        ok: true,
        monitores: monitores.map((m) => ({
          id: m.id,
          patrimonio: m.patrimonio,
          modelo: m.modelo,
          label:
            (m.patrimonio || '') +
            (m.modelo ? ' — ' + m.modelo : ''),
        })),
      });
    }

    const computadorId = parseInt(req.query.computador_id, 10);
    if (!computadorId)
      return res.status(400).json({ error: 'computador_id ou lista=1 obrigatório' });

    const pc = await dbGet(
      'SELECT id FROM computadores WHERE id = ? AND secretaria_id = ?',
      [computadorId, s.id]
    );
    if (!pc) return res.status(404).json({ error: 'Computador não encontrado' });

    const aud = await dbGet(
      'SELECT id FROM auditoria WHERE computador_id = ?',
      [computadorId]
    );
    let checks = {};
    if (aud) {
      const am = await dbAll(
        'SELECT monitor_id, confirmado FROM auditoria_monitores WHERE auditoria_id = ?',
        [aud.id]
      );
      am.forEach((row) => {
        checks[row.monitor_id] = row.confirmado === 1;
      });
    }

    const list = monitores.map((m) => ({
      id: m.id,
      patrimonio: m.patrimonio,
      modelo: m.modelo,
      confirmado: checks[m.id] === true,
    }));

    res.json({
      ok: true,
      auditoria_id: aud ? aud.id : null,
      monitores: list,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/auditoria — body: ..., nome_maquina obrigatório se confirmado=confirmado */
app.post('/api/auditoria', async (req, res) => {
  try {
    const {
      token,
      senha,
      computador_id,
      confirmado,
      observacao,
      nome_maquina,
    } = req.body || {};
    const s = await validateSecretariaAccess(token, senha);
    if (!s) return res.status(401).json({ ok: false, error: 'Não autorizado' });

    const allowed = ['confirmado', 'nao_encontrado', 'outro_local'];
    if (!allowed.includes(confirmado))
      return res.status(400).json({ ok: false, error: 'confirmado inválido' });

    const pc = await dbGet(
      'SELECT id FROM computadores WHERE id = ? AND secretaria_id = ?',
      [computador_id, s.id]
    );
    if (!pc)
      return res.status(404).json({ ok: false, error: 'Computador não encontrado' });

    if (confirmado === 'confirmado') {
      const nm = String(nome_maquina || '').trim();
      if (!nm)
        return res.status(400).json({
          ok: false,
          error: 'Nome da máquina é obrigatório para confirmar o equipamento.',
        });
      await dbRun('UPDATE computadores SET nome_maquina = ? WHERE id = ?', [
        nm,
        computador_id,
      ]);
    }

    const now = new Date().toISOString();

    const existing = await dbGet(
      'SELECT id FROM auditoria WHERE computador_id = ?',
      [computador_id]
    );

    let auditoriaId;
    if (existing) {
      await dbRun(
        `UPDATE auditoria SET confirmado = ?, observacao = ?, data = ?, secretaria_id = ?
         WHERE id = ?`,
        [
          confirmado,
          observacao || null,
          now,
          s.id,
          existing.id,
        ]
      );
      auditoriaId = existing.id;
      if (confirmado !== 'confirmado') {
        await dbRun('DELETE FROM auditoria_monitores WHERE auditoria_id = ?', [
          auditoriaId,
        ]);
      }
    } else {
      const r = await dbRun(
        `INSERT INTO auditoria (secretaria_id, computador_id, confirmado, observacao, data)
         VALUES (?, ?, ?, ?, ?)`,
        [s.id, computador_id, confirmado, observacao || null, now]
      );
      auditoriaId = r.lastID;
    }

    res.json({ ok: true, auditoria_id: auditoriaId });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/auditoria-monitores
 * - monitores: [{ monitor_id, confirmado }] (lista completa), ou
 * - monitor_ids: [id1, id2] até 2 ids marcados como ligados a este PC
 */
app.post('/api/auditoria-monitores', async (req, res) => {
  try {
    const { token, senha, auditoria_id, monitores: monsIn, monitor_ids } =
      req.body || {};
    const s = await validateSecretariaAccess(token, senha);
    if (!s) return res.status(401).json({ ok: false, error: 'Não autorizado' });

    const aud = await dbGet(
      `SELECT a.id, a.computador_id, c.secretaria_id
       FROM auditoria a
       JOIN computadores c ON c.id = a.computador_id
       WHERE a.id = ?`,
      [auditoria_id]
    );
    if (!aud || aud.secretaria_id !== s.id)
      return res.status(404).json({ ok: false, error: 'Auditoria inválida' });

    let mons = monsIn;
    if (Array.isArray(monitor_ids)) {
      const raw = [
        ...new Set(
          monitor_ids
            .map((x) => parseInt(x, 10))
            .filter((n) => !Number.isNaN(n) && n > 0)
        ),
      ];
      if (raw.length > 2)
        return res.status(400).json({
          ok: false,
          error: 'Selecione no máximo 2 monitores para este computador.',
        });
      const allMon = await dbAll(
        'SELECT id FROM monitores WHERE secretaria_id = ?',
        [s.id]
      );
      mons = allMon.map((row) => ({
        monitor_id: row.id,
        confirmado: raw.includes(row.id),
      }));
    }

    if (!Array.isArray(mons))
      return res.status(400).json({
        ok: false,
        error: 'Envie monitores ou monitor_ids (até 2)',
      });

    for (const m of mons) {
      const mon = await dbGet(
        'SELECT id FROM monitores WHERE id = ? AND secretaria_id = ?',
        [m.monitor_id, s.id]
      );
      if (!mon) continue;

      const conf = m.confirmado ? 1 : 0;
      await dbRun(
        `INSERT INTO auditoria_monitores (auditoria_id, monitor_id, confirmado)
         VALUES (?, ?, ?)
         ON CONFLICT(auditoria_id, monitor_id) DO UPDATE SET confirmado = excluded.confirmado`,
        [auditoria_id, m.monitor_id, conf]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /api/admin/secretarias — links e senhas */
app.get('/api/admin/secretarias', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ error: 'Não autorizado' });

    const base = publicBaseUrl(req);
    const rows = await dbAll(
      `SELECT id, nome, token, senha FROM secretarias ORDER BY nome COLLATE NOCASE`
    );
    const secretarias = rows.map((s) => {
      const path = `/inventario/${s.token}`;
      return {
        id: s.id,
        nome: s.nome,
        token: s.token,
        senha: s.senha,
        path,
        url: base + path,
      };
    });
    const fromEnv = resolveStaticPublicUrl();
    res.json({
      ok: true,
      baseUrl: base,
      publicUrlFromEnv: fromEnv || null,
      secretarias,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/admin/importar-planilhas — reexecuta import.js (apaga equipamentos e auditoria).
 * Requer mesmo corpo/header de admin que os outros endpoints.
 */
app.post('/api/admin/importar-planilhas', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ ok: false, error: 'Não autorizado' });

    const comp =
      process.env.COMPUTADORES_XLSX ||
      path.join(__dirname, '..', 'computadores.xlsx');
    const mon =
      process.env.MONITORES_XLSX ||
      path.join(__dirname, '..', 'monitores.xlsx');
    if (!fs.existsSync(comp))
      return res.status(400).json({
        ok: false,
        error: 'computadores.xlsx não encontrado em: ' + comp,
      });
    if (!fs.existsSync(mon))
      return res
        .status(400)
        .json({ ok: false, error: 'monitores.xlsx não encontrado em: ' + mon });

    const ok = runImportSubprocess();
    if (!ok)
      return res.status(500).json({
        ok: false,
        error: 'import.js falhou — veja os logs do servidor',
      });

    const totalPc = await dbGet('SELECT COUNT(*) AS n FROM computadores');
    const totalMon = await dbGet('SELECT COUNT(*) AS n FROM monitores');
    res.json({
      ok: true,
      computadores: totalPc.n,
      monitores: totalMon.n,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** PATCH /api/admin/secretaria/:id — { adminSenha, senha } */
app.patch('/api/admin/secretaria/:id', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ ok: false, error: 'Não autorizado' });
    const { senha } = req.body || {};
    if (!senha || String(senha).trim() === '')
      return res.status(400).json({ ok: false, error: 'senha obrigatória' });
    const id = parseInt(req.params.id, 10);
    const r = await dbRun('UPDATE secretarias SET senha = ? WHERE id = ?', [
      String(senha),
      id,
    ]);
    if (r.changes === 0)
      return res.status(404).json({ ok: false, error: 'Secretaria não encontrada' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

function adminListParams(req) {
  const secretariaId = req.query.secretaria_id
    ? parseInt(req.query.secretaria_id, 10)
    : null;
      const q = (req.query.q || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  return { secretariaId, q, limit, offset };
}

/** GET /api/admin/computador/:id */
app.get('/api/admin/computador/:id', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ error: 'Não autorizado' });
    const id = parseInt(req.params.id, 10);
    const r = await dbGet(
      `SELECT c.id, c.nome_maquina, c.patrimonio, c.localizacao, c.status_ad,
              c.secretaria_id, s.nome AS secretaria_nome,
              COALESCE(a.confirmado, '') AS audit_status
       FROM computadores c
       JOIN secretarias s ON s.id = c.secretaria_id
       LEFT JOIN auditoria a ON a.computador_id = c.id
       WHERE c.id = ?`,
      [id]
    );
    if (!r) return res.status(404).json({ error: 'Não encontrado' });
    res.json({
      ok: true,
      computador: {
        id: r.id,
        nome_maquina: r.nome_maquina,
        patrimonio: r.patrimonio,
        localizacao: r.localizacao,
        status_ad: r.status_ad,
        secretaria_id: r.secretaria_id,
        secretaria_nome: r.secretaria_nome,
        auditoria_status: r.audit_status || null,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/admin/monitor/:id */
app.get('/api/admin/monitor/:id', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ error: 'Não autorizado' });
    const id = parseInt(req.params.id, 10);
    const r = await dbGet(
      `SELECT m.id, m.patrimonio, m.modelo, m.secretaria_id, s.nome AS secretaria_nome
       FROM monitores m
       JOIN secretarias s ON s.id = m.secretaria_id
       WHERE m.id = ?`,
      [id]
    );
    if (!r) return res.status(404).json({ error: 'Não encontrado' });
    res.json({ ok: true, monitor: r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/admin/computadores */
app.get('/api/admin/computadores', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ error: 'Não autorizado' });

    const { secretariaId, q, limit, offset } = adminListParams(req);
    const params = [];
    let where = '1=1';
    if (secretariaId) {
      where += ' AND c.secretaria_id = ?';
      params.push(secretariaId);
    }
    if (q) {
      where +=
        ' AND (c.nome_maquina LIKE ? OR c.patrimonio LIKE ? OR c.localizacao LIKE ?)';
      const like = '%' + q.replace(/%/g, '\\%') + '%';
      params.push(like, like, like);
    }

    const totalRow = await dbGet(
      `SELECT COUNT(*) AS n FROM computadores c WHERE ${where}`,
      params
    );
    params.push(limit, offset);
    const rows = await dbAll(
      `SELECT c.id, c.nome_maquina, c.patrimonio, c.localizacao, c.status_ad,
              c.secretaria_id, s.nome AS secretaria_nome,
              COALESCE(a.confirmado, '') AS audit_status
       FROM computadores c
       JOIN secretarias s ON s.id = c.secretaria_id
       LEFT JOIN auditoria a ON a.computador_id = c.id
       WHERE ${where}
       ORDER BY s.nome COLLATE NOCASE, c.nome_maquina COLLATE NOCASE
       LIMIT ? OFFSET ?`,
      params
    );

    res.json({
      ok: true,
      total: totalRow.n,
      limit,
      offset,
      computadores: rows.map((r) => ({
        id: r.id,
        nome_maquina: r.nome_maquina,
        patrimonio: r.patrimonio,
        localizacao: r.localizacao,
        status_ad: r.status_ad,
        secretaria_id: r.secretaria_id,
        secretaria_nome: r.secretaria_nome,
        auditoria_status: r.audit_status || null,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/admin/monitores */
app.get('/api/admin/monitores', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ error: 'Não autorizado' });

    const { secretariaId, q, limit, offset } = adminListParams(req);
    const params = [];
    let where = '1=1';
    if (secretariaId) {
      where += ' AND m.secretaria_id = ?';
      params.push(secretariaId);
    }
    if (q) {
      where += ' AND (m.patrimonio LIKE ? OR m.modelo LIKE ?)';
      const like = '%' + q.replace(/%/g, '\\%') + '%';
      params.push(like, like);
    }

    const totalRow = await dbGet(
      `SELECT COUNT(*) AS n FROM monitores m WHERE ${where}`,
      params
    );
    params.push(limit, offset);
    const rows = await dbAll(
      `SELECT m.id, m.patrimonio, m.modelo, m.secretaria_id, s.nome AS secretaria_nome
       FROM monitores m
       JOIN secretarias s ON s.id = m.secretaria_id
       WHERE ${where}
       ORDER BY s.nome COLLATE NOCASE, m.patrimonio COLLATE NOCASE
       LIMIT ? OFFSET ?`,
      params
    );

    res.json({
      ok: true,
      total: totalRow.n,
      limit,
      offset,
      monitores: rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/admin/secretarias-ids — lista mínima para selects */
app.get('/api/admin/secretarias-opcoes', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ error: 'Não autorizado' });
    const rows = await dbAll(
      'SELECT id, nome FROM secretarias ORDER BY nome COLLATE NOCASE'
    );
    res.json({ ok: true, secretarias: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/admin/computador */
app.post('/api/admin/computador', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ ok: false, error: 'Não autorizado' });
    const b = req.body || {};
    const sid = parseInt(b.secretaria_id, 10);
    if (!sid)
      return res.status(400).json({ ok: false, error: 'secretaria_id obrigatório' });
    const ex = await dbGet('SELECT id FROM secretarias WHERE id = ?', [sid]);
    if (!ex) return res.status(400).json({ ok: false, error: 'Secretaria inválida' });
    const r = await dbRun(
      `INSERT INTO computadores (nome_maquina, patrimonio, secretaria_id, localizacao, status_ad)
       VALUES (?, ?, ?, ?, ?)`,
      [
        b.nome_maquina || null,
        b.patrimonio || null,
        sid,
        b.localizacao || null,
        b.status_ad || null,
      ]
    );
    res.json({ ok: true, id: r.lastID });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** PATCH /api/admin/computador/:id */
app.patch('/api/admin/computador/:id', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ ok: false, error: 'Não autorizado' });
    const id = parseInt(req.params.id, 10);
    const b = req.body || {};
    const pc = await dbGet(
      'SELECT * FROM computadores WHERE id = ?',
      [id]
    );
    if (!pc) return res.status(404).json({ ok: false, error: 'Não encontrado' });

    let sid = pc.secretaria_id;
    if (b.secretaria_id !== undefined && b.secretaria_id !== null) {
      sid = parseInt(b.secretaria_id, 10);
      const ex = await dbGet('SELECT id FROM secretarias WHERE id = ?', [sid]);
      if (!ex) return res.status(400).json({ ok: false, error: 'Secretaria inválida' });
    }

    const nome =
      b.nome_maquina !== undefined ? b.nome_maquina : pc.nome_maquina;
    const pat =
      b.patrimonio !== undefined ? b.patrimonio : pc.patrimonio;
    const loc =
      b.localizacao !== undefined ? b.localizacao : pc.localizacao;
    const ad =
      b.status_ad !== undefined ? b.status_ad : pc.status_ad;

    await dbRun(
      `UPDATE computadores SET nome_maquina = ?, patrimonio = ?, secretaria_id = ?,
         localizacao = ?, status_ad = ? WHERE id = ?`,
      [nome, pat, sid, loc, ad, id]
    );
    if (
      b.secretaria_id !== undefined &&
      b.secretaria_id !== null &&
      sid !== pc.secretaria_id
    ) {
      await dbRun(
        'UPDATE auditoria SET secretaria_id = ? WHERE computador_id = ?',
        [sid, id]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** DELETE /api/admin/computador/:id */
app.delete('/api/admin/computador/:id', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ ok: false, error: 'Não autorizado' });
    const id = parseInt(req.params.id, 10);
    const aud = await dbAll('SELECT id FROM auditoria WHERE computador_id = ?', [
      id,
    ]);
    for (const a of aud) {
      await dbRun('DELETE FROM auditoria_monitores WHERE auditoria_id = ?', [a.id]);
    }
    await dbRun('DELETE FROM auditoria WHERE computador_id = ?', [id]);
    const r = await dbRun('DELETE FROM computadores WHERE id = ?', [id]);
    if (r.changes === 0)
      return res.status(404).json({ ok: false, error: 'Não encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /api/admin/monitor */
app.post('/api/admin/monitor', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ ok: false, error: 'Não autorizado' });
    const b = req.body || {};
    const sid = parseInt(b.secretaria_id, 10);
    if (!sid)
      return res.status(400).json({ ok: false, error: 'secretaria_id obrigatório' });
    const ex = await dbGet('SELECT id FROM secretarias WHERE id = ?', [sid]);
    if (!ex) return res.status(400).json({ ok: false, error: 'Secretaria inválida' });
    const r = await dbRun(
      `INSERT INTO monitores (patrimonio, modelo, secretaria_id) VALUES (?, ?, ?)`,
      [b.patrimonio || null, b.modelo || null, sid]
    );
    res.json({ ok: true, id: r.lastID });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** PATCH /api/admin/monitor/:id */
app.patch('/api/admin/monitor/:id', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ ok: false, error: 'Não autorizado' });
    const id = parseInt(req.params.id, 10);
    const b = req.body || {};
    const row = await dbGet('SELECT * FROM monitores WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ ok: false, error: 'Não encontrado' });

    let sid = row.secretaria_id;
    if (b.secretaria_id !== undefined && b.secretaria_id !== null) {
      sid = parseInt(b.secretaria_id, 10);
      const ex = await dbGet('SELECT id FROM secretarias WHERE id = ?', [sid]);
      if (!ex) return res.status(400).json({ ok: false, error: 'Secretaria inválida' });
    }
    const pat =
      b.patrimonio !== undefined ? b.patrimonio : row.patrimonio;
    const mod =
      b.modelo !== undefined ? b.modelo : row.modelo;

    await dbRun(
      `UPDATE monitores SET patrimonio = ?, modelo = ?, secretaria_id = ? WHERE id = ?`,
      [pat, mod, sid, id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** DELETE /api/admin/monitor/:id */
app.delete('/api/admin/monitor/:id', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ ok: false, error: 'Não autorizado' });
    const id = parseInt(req.params.id, 10);
    await dbRun('DELETE FROM auditoria_monitores WHERE monitor_id = ?', [id]);
    const r = await dbRun('DELETE FROM monitores WHERE id = ?', [id]);
    if (r.changes === 0)
      return res.status(404).json({ ok: false, error: 'Não encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /api/relatorio — admin */
app.get('/api/relatorio', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ error: 'Não autorizado' });

    const totalPc = await dbGet('SELECT COUNT(*) AS n FROM computadores');
    const byStatus = await dbAll(
      `SELECT confirmado, COUNT(*) AS n FROM auditoria GROUP BY confirmado`
    );
    const map = { confirmado: 0, nao_encontrado: 0, outro_local: 0 };
    byStatus.forEach((r) => {
      map[r.confirmado] = r.n;
    });

    const semAuditoria = await dbGet(
      `SELECT COUNT(*) AS n FROM computadores c
       LEFT JOIN auditoria a ON a.computador_id = c.id
       WHERE a.id IS NULL`
    );

    const porSecretaria = await dbAll(
      `SELECT s.nome, s.token,
        COUNT(c.id) AS total_pc,
        COALESCE(SUM(CASE WHEN a.confirmado = 'confirmado' THEN 1 ELSE 0 END), 0) AS confirmados,
        COALESCE(SUM(CASE WHEN a.confirmado = 'nao_encontrado' THEN 1 ELSE 0 END), 0) AS nao_encontrados,
        COALESCE(SUM(CASE WHEN a.confirmado = 'outro_local' THEN 1 ELSE 0 END), 0) AS outro_local,
        COALESCE(SUM(CASE WHEN a.id IS NULL THEN 1 ELSE 0 END), 0) AS pendentes
       FROM secretarias s
       LEFT JOIN computadores c ON c.secretaria_id = s.id
       LEFT JOIN auditoria a ON a.computador_id = c.id
       GROUP BY s.id
       ORDER BY s.nome COLLATE NOCASE`
    );

    res.json({
      ok: true,
      totais: {
        computadores: totalPc.n,
        confirmados: map.confirmado,
        nao_encontrados: map.nao_encontrado,
        outro_local: map.outro_local,
        pendentes: semAuditoria.n,
      },
      porSecretaria,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/export — admin — arquivo inventario-auditado.xlsx */
app.get('/api/export', async (req, res) => {
  try {
    if (!validateAdmin(req))
      return res.status(401).json({ error: 'Não autorizado' });

    const rows = await dbAll(
      `SELECT c.nome_maquina, c.patrimonio AS pc_patrimonio, c.localizacao,
              s.nome AS secretaria,
              COALESCE(a.confirmado, 'pendente') AS status,
              a.observacao,
              a.data AS data_auditoria,
              a.id AS auditoria_id
       FROM computadores c
       JOIN secretarias s ON s.id = c.secretaria_id
       LEFT JOIN auditoria a ON a.computador_id = c.id
       ORDER BY s.nome COLLATE NOCASE, c.nome_maquina`
    );

    const out = [];
    for (const r of rows) {
      let monitoresTxt = '';
      if (r.auditoria_id) {
        const ms = await dbAll(
          `SELECT m.patrimonio, m.modelo, am.confirmado
           FROM auditoria_monitores am
           JOIN monitores m ON m.id = am.monitor_id
           WHERE am.auditoria_id = ? AND am.confirmado = 1
           ORDER BY m.patrimonio`,
          [r.auditoria_id]
        );
        monitoresTxt = ms
          .map((m) => `${m.patrimonio}${m.modelo ? ` (${m.modelo})` : ''}`)
          .join('; ');
      }
      out.push({
        computador: r.nome_maquina || '',
        patrimonio_pc: r.pc_patrimonio || '',
        localizacao: r.localizacao || '',
        secretaria: r.secretaria,
        status: r.status,
        observacao: r.observacao || '',
        data_auditoria: r.data_auditoria || '',
        monitores_confirmados: monitoresTxt,
      });
    }

    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventário');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="inventario-auditado.xlsx"'
    );
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function runImportSubprocess() {
  const rootDir = path.join(__dirname, '..');
  const importScript = path.join(__dirname, 'import.js');
  if (!fs.existsSync(importScript)) {
    console.error('[import] Script não encontrado:', importScript);
    return false;
  }
  console.log('[import] Executando node import.js (cwd:', rootDir + ')');
  const r = spawnSync(process.execPath, [importScript], {
    env: process.env,
    cwd: rootDir,
    stdio: 'inherit',
  });
  if (r.status !== 0)
    console.error('[import] import.js saiu com código', r.status);
  return r.status === 0;
}

async function maybeAutoImportFromExcel() {
  const off = String(process.env.AUTO_IMPORT_ON_START || '')
    .toLowerCase();
  if (off === '0' || off === 'false' || off === 'no') {
    console.log('[import] AUTO_IMPORT_ON_START desligado — não importa ao subir.');
    return;
  }

  let n = 0;
  try {
    const row = await dbGet('SELECT COUNT(*) AS n FROM computadores');
    n = row ? row.n : 0;
  } catch (e) {
    console.warn('[import] Não foi possível contar computadores:', e.message);
    return;
  }

  if (n > 0) {
    console.log(
      '[import] Banco já tem',
      n,
      'computador(es). Import automático ignorado (use npm run import ou limpe o DB).'
    );
    return;
  }

  const comp =
    process.env.COMPUTADORES_XLSX ||
    path.join(__dirname, '..', 'computadores.xlsx');
  const mon =
    process.env.MONITORES_XLSX ||
    path.join(__dirname, '..', 'monitores.xlsx');

  if (!fs.existsSync(comp)) {
    console.warn('[import] Planilha não encontrada:', comp);
    return;
  }
  if (!fs.existsSync(mon)) {
    console.warn('[import] Planilha não encontrada:', mon);
    return;
  }

  runImportSubprocess();
}

function startServer() {
  db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA journal_mode = WAL');
    db.exec(schemaSql, (err) => {
      if (err) {
        console.error('Erro ao aplicar schema:', err.message);
        process.exit(1);
      }
      const pub = resolveStaticPublicUrl();
      if (pub) console.log('[app] URL pública (env):', pub);
      else
        console.log(
          '[app] Defina PUBLIC_URL ou PUBLIC_BASE_URL no Railway para links fixos no admin.'
        );

      app.listen(PORT, () => {
        console.log(`SQLite: ${DB_PATH}`);
        console.log(`Servidor ouvindo na porta ${PORT}`);
        setImmediate(() => {
          maybeAutoImportFromExcel().catch((e) =>
            console.error('[import] Erro no import automático:', e)
          );
        });
      });
    });
  });
}

startServer();
