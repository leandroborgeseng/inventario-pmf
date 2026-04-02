'use strict';

/**
 * Importa computadores.xlsx e monitores.xlsx (raiz do projeto) para SQLite.
 * Colunas esperadas (cabeçalhos flexíveis, ver NORMALIZE abaixo):
 * computadores: nome_maquina, patrimonio, secretaria, localizacao, status_ad
 * monitores: patrimonio, modelo, secretaria
 *
 * Secretarias existentes (mesmo nome) mantêm token e senha.
 * Novas secretarias recebem token aleatório e senha IMPORT_DEFAULT_SENHA.
 *
 * Uso: npm run import
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

const rootDir = path.join(__dirname, '..');
const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, 'database.sqlite');

const COMPUTADORES_XLSX = path.join(rootDir, 'computadores.xlsx');
const MONITORES_XLSX = path.join(rootDir, 'monitores.xlsx');

function ensureDbDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normKey(s) {
  if (s == null) return '';
  return String(s)
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function makeTokenForNome(nome) {
  const s = normKey(nome).replace(/_/g, '-') || 'sec';
  return `${s}-${uuidv4().slice(0, 8)}`;
}

function pickRow(row, aliases) {
  const keys = Object.keys(row);
  const map = {};
  keys.forEach((k) => {
    map[normKey(k)] = row[k];
  });
  for (const a of aliases) {
    const nk = normKey(a);
    if (map[nk] != null && String(map[nk]).trim() !== '')
      return String(map[nk]).trim();
  }
  return '';
}

function sheetToJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error('Arquivo não encontrado:', filePath);
    process.exit(1);
  }
  const wb = XLSX.readFile(filePath);
  const name = wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
}

function openDb() {
  ensureDbDir();
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID });
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function ensureSchema(db) {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await new Promise((resolve, reject) => {
    db.exec(schema, (err) => (err ? reject(err) : resolve()));
  });
}

async function getOrCreateSecretaria(db, nomeCompleto) {
  const nome = String(nomeCompleto || '').trim();
  if (!nome) throw new Error('Linha com secretaria vazia');

  let row = await dbGet(db, 'SELECT id, token, senha FROM secretarias WHERE nome = ?', [
    nome,
  ]);
  if (row) return row;

  const token = makeTokenForNome(nome);
  const senha =
    process.env.IMPORT_DEFAULT_SENHA || 'mudar123';

  await dbRun(db, 'INSERT INTO secretarias (nome, token, senha) VALUES (?, ?, ?)', [
    nome,
    token,
    senha,
  ]);
  row = await dbGet(db, 'SELECT id, token, senha FROM secretarias WHERE nome = ?', [nome]);
  return row;
}

async function main() {
  const db = await openDb();
  db.run('PRAGMA foreign_keys = ON');
  await ensureSchema(db);

  console.log('Limpando auditoria e equipamentos (mantendo secretarias)...');
  await dbRun(db, 'DELETE FROM auditoria_monitores');
  await dbRun(db, 'DELETE FROM auditoria');
  await dbRun(db, 'DELETE FROM monitores');
  await dbRun(db, 'DELETE FROM computadores');

  const rowsPc = sheetToJson(COMPUTADORES_XLSX);
  const rowsMon = sheetToJson(MONITORES_XLSX);

  const aliasNome = [
    'nome_maquina',
    'nome maquina',
    'computador',
    'hostname',
    'maquina',
    'host',
  ];
  const aliasPat = ['patrimonio', 'patrimônio', 'bem', 'numero_patrimonio'];
  const aliasSec = ['secretaria', 'secretaria_nome', 'setor', 'orgao', 'órgão', 'departamento'];
  const aliasLoc = ['localizacao', 'localização', 'local', 'sala'];
  const aliasAd = ['status_ad', 'status ad', 'ad', 'status', 'no_ad'];

  let nPc = 0;
  for (const r of rowsPc) {
    const secretariaNome = pickRow(r, aliasSec);
    if (!secretariaNome) continue;

    const sec = await getOrCreateSecretaria(db, secretariaNome);
    const nome_maquina = pickRow(r, aliasNome);
    const patrimonio = pickRow(r, aliasPat);
    const localizacao = pickRow(r, aliasLoc);
    const status_ad = pickRow(r, aliasAd);

    await dbRun(
      db,
      `INSERT INTO computadores (nome_maquina, patrimonio, secretaria_id, localizacao, status_ad)
       VALUES (?, ?, ?, ?, ?)`,
      [nome_maquina || null, patrimonio || null, sec.id, localizacao || null, status_ad || null]
    );
    nPc++;
  }

  const aliasMod = ['modelo', 'descricao', 'descrição', 'tipo'];
  let nMon = 0;
  for (const r of rowsMon) {
    const secretariaNome = pickRow(r, aliasSec);
    if (!secretariaNome) continue;

    const sec = await getOrCreateSecretaria(db, secretariaNome);
    const patrimonio = pickRow(r, aliasPat);
    const modelo = pickRow(r, aliasMod);

    await dbRun(
      db,
      `INSERT INTO monitores (patrimonio, modelo, secretaria_id) VALUES (?, ?, ?)`,
      [patrimonio || null, modelo || null, sec.id]
    );
    nMon++;
  }

  const secretarias = await dbAll(
    db,
    'SELECT id, nome, token, senha FROM secretarias ORDER BY nome COLLATE NOCASE'
  );

  console.log('\nImportação concluída.');
  console.log('Computadores:', nPc, '| Monitores:', nMon);
  console.log('\nSecretarias e acessos (guarde os tokens):');
  secretarias.forEach((s) => {
    console.log(
      `  ${s.nome}\n    URL: /inventario/${s.token}\n    Senha: ${s.senha}\n`
    );
  });

  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
