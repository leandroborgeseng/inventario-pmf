'use strict';

const path = require('path');
const fs = require('fs');
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

async function getSecretariaByToken(token) {
  if (!token) return null;
  return dbGet('SELECT * FROM secretarias WHERE token = ?', [token]);
}

async function validateSecretariaAccess(token, senha) {
  const s = await getSecretariaByToken(token);
  if (!s || s.senha !== senha) return null;
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

const app = express();
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
    if (!s)
      return res.status(401).json({ ok: false, error: 'Token ou senha inválidos' });
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

/** GET /api/monitores/:token — header X-Senha, query computador_id */
app.get('/api/monitores/:token', async (req, res) => {
  try {
    const senha = req.headers['x-senha'] || req.query.senha;
    const s = await validateSecretariaAccess(req.params.token, senha);
    if (!s) return res.status(401).json({ error: 'Não autorizado' });

    const computadorId = parseInt(req.query.computador_id, 10);
    if (!computadorId)
      return res.status(400).json({ error: 'computador_id obrigatório' });

    const pc = await dbGet(
      'SELECT id FROM computadores WHERE id = ? AND secretaria_id = ?',
      [computadorId, s.id]
    );
    if (!pc) return res.status(404).json({ error: 'Computador não encontrado' });

    const monitores = await dbAll(
      `SELECT m.id, m.patrimonio, m.modelo
       FROM monitores m
       WHERE m.secretaria_id = ?
       ORDER BY m.patrimonio COLLATE NOCASE`,
      [s.id]
    );

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

/** POST /api/auditoria — body: token, senha, computador_id, confirmado, observacao? */
app.post('/api/auditoria', async (req, res) => {
  try {
    const { token, senha, computador_id, confirmado, observacao } = req.body || {};
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

/** POST /api/auditoria-monitores — body: token, senha, auditoria_id, monitores: [{monitor_id, confirmado}] */
app.post('/api/auditoria-monitores', async (req, res) => {
  try {
    const { token, senha, auditoria_id, monitores: mons } = req.body || {};
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

    if (!Array.isArray(mons))
      return res.status(400).json({ ok: false, error: 'monitores inválido' });

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

function startServer() {
  db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA journal_mode = WAL');
    db.exec(schemaSql, (err) => {
      if (err) {
        console.error('Erro ao aplicar schema:', err.message);
        process.exit(1);
      }
      app.listen(PORT, () => {
        console.log(`Servidor em http://localhost:${PORT}`);
        console.log(`SQLite: ${DB_PATH}`);
      });
    });
  });
}

startServer();
