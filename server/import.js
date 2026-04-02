'use strict';

/**
 * Importa computadores.xlsx e monitores.xlsx (raiz do projeto) para SQLite.
 * Colunas esperadas (cabeçalhos flexíveis, ver NORMALIZE abaixo):
 * computadores: nome_maquina, patrimonio, secretaria, localizacao, status_ad, data_aquisicao
 * monitores: patrimonio, modelo, secretaria
 *
 * Secretarias existentes (mesmo nome) mantêm token e senha.
 * Novas secretarias recebem token estável (hash do nome + slug) e senha IMPORT_DEFAULT_SENHA.
 * Assim, novo banco + mesmo Excel + mesma IMPORT_DEFAULT_SENHA = mesmos links e senhas após cada deploy.
 *
 * Uso: npm run import
 *
 * Caminho do SQLite: server/db-config.js (Railway sem DB_PATH → /data/database.sqlite).
 * Opcional: COMPUTADORES_XLSX, MONITORES_XLSX, IMPORT_DEFAULT_SENHA,
 * SECRETARIA_TOKEN_SALT (fixe no Railway; se mudar, os tokens mudam)
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const { resolveDbPath } = require('./db-config');

const rootDir = path.join(__dirname, '..');
const DB_PATH = resolveDbPath();

const COMPUTADORES_XLSX =
  process.env.COMPUTADORES_XLSX ||
  path.join(rootDir, 'computadores.xlsx');
const MONITORES_XLSX =
  process.env.MONITORES_XLSX || path.join(rootDir, 'monitores.xlsx');

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

/** Token determinístico: mesmo nome de secretaria → mesmo token em qualquer import/deploy. */
function makeTokenForNome(nome) {
  const raw = String(nome || '').trim();
  let slug = normKey(nome).replace(/_/g, '-') || 'sec';
  if (slug.length > 48) slug = slug.slice(0, 48);
  const salt = String(
    process.env.SECRETARIA_TOKEN_SALT || process.env.IMPORT_TOKEN_SALT || ''
  );
  const payload = salt ? `${raw}\u0000${salt}` : raw;
  const h = crypto.createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 12);
  return `${slug}-${h}`;
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

/**
 * Número serial de data do Excel → YYYY-MM-DD.
 * pickRow() converte células numéricas para string; "44927" deve ser reconhecido.
 */
function parseExcelSerialAsIso(n) {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  const whole = Math.floor(n);
  if (whole < 1 || whole >= 10000000) return null;
  if (XLSX.SSF && typeof XLSX.SSF.parse_date_code === 'function') {
    try {
      const dc = XLSX.SSF.parse_date_code(n);
      if (dc && dc.y >= 1900 && dc.y <= 2100) {
        const mm = String(dc.m).padStart(2, '0');
        const dd = String(dc.d).padStart(2, '0');
        return `${dc.y}-${mm}-${dd}`;
      }
    } catch (_) {
      /* continua */
    }
  }
  const epochMs = Date.UTC(1899, 11, 30);
  const ms = epochMs + whole * 86400000;
  const dt = new Date(ms);
  if (!isNaN(dt.getTime())) {
    const y = dt.getUTCFullYear();
    if (y >= 1900 && y <= 2100) return dt.toISOString().slice(0, 10);
  }
  return null;
}

/** Normaliza data de aquisição da planilha para YYYY-MM-DD ou null. */
function parseDataAquisicaoVal(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !isNaN(+raw))
    return raw.toISOString().slice(0, 10);
  if (typeof raw === 'number' && isFinite(raw)) {
    return parseExcelSerialAsIso(raw);
  }

  const s = String(raw).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (br) {
    const day = parseInt(br[1], 10);
    const month = parseInt(br[2], 10);
    let year = parseInt(br[3], 10);
    if (year < 100) year += 2000;
    const dt = new Date(year, month - 1, day);
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  /* Só período com ano (ex.: coluna "Ano") */
  const yOnly = s.match(/^(\d{4})$/);
  if (yOnly) {
    const y = parseInt(yOnly[1], 10);
    if (y >= 1900 && y <= 2100) return `${y}-01-01`;
  }

  /*
   * Só dígitos (e opcional parte decimal): típico serial Excel como texto —
   * antes isto falhava porque vínha "44927" após pickRow().
   */
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    const isoSerial = parseExcelSerialAsIso(n);
    if (isoSerial) return isoSerial;
  }

  const tryDt = new Date(s);
  if (!isNaN(tryDt.getTime())) return tryDt.toISOString().slice(0, 10);
  return null;
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

/**
 * Planilhas exportadas do patrimônio costumam ter linhas iniciais com fórmulas ou vazias.
 * Procura a linha de cabeçalho que contém "Placa" e descrição do bem.
 */
function findHeaderRowIndex(aoa, maxScan = 80) {
  for (let i = 0; i < Math.min(aoa.length, maxScan); i++) {
    const row = aoa[i] || [];
    const lowered = row.map((c) => String(c).toLowerCase().trim());
    const hasPlaca = lowered.some((c) => c === 'placa' || /^placa\b/.test(c));
    const hasBem = lowered.some(
      (c) =>
        (c.includes('bem') && c.includes('patrimonial')) ||
        c.includes('bem patrimonial')
    );
    if (hasPlaca && hasBem) return i;
  }
  return -1;
}

function aoaToObjects(aoa, headerIdx) {
  const rawHeaders = (aoa[headerIdx] || []).map((h) => String(h).trim());
  const rows = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const line = aoa[r] || [];
    if (line.every((c) => c === '' || c == null)) continue;
    const obj = {};
    rawHeaders.forEach((h, j) => {
      if (!h) return;
      let key = h;
      if (Object.prototype.hasOwnProperty.call(obj, key)) key = `${h} (${j})`;
      obj[key] = line[j] != null && line[j] !== '' ? line[j] : '';
    });
    rows.push(obj);
  }
  return rows;
}

/** Lê a primeira aba com cabeçalho válido (Placa + Bem Patrimonial) ou a Planilha1. */
function sheetToJsonPatrimonio(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error('Arquivo não encontrado:', filePath);
    process.exit(1);
  }
  const wb = XLSX.readFile(filePath);
  const preferred = ['Planilha1', 'Dados', 'Computadores'];
  const sheetOrder = [
    ...preferred.filter((n) => wb.SheetNames.includes(n)),
    ...wb.SheetNames,
  ];
  const tried = new Set();
  for (const name of sheetOrder) {
    if (tried.has(name)) continue;
    tried.add(name);
    const sh = wb.Sheets[name];
    if (!sh) continue;
    const aoa = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
    const headerIdx = findHeaderRowIndex(aoa);
    if (headerIdx >= 0) {
      if (name !== 'Planilha1')
        console.warn('Usando aba:', name);
      return aoaToObjects(aoa, headerIdx);
    }
  }
  console.error(
    'Não foi encontrada linha de cabeçalho (Placa / Bem Patrimonial) em',
    filePath
  );
  process.exit(1);
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

function loadCodigoMonitoresMap() {
  const p = path.join(__dirname, 'codigo-monitores.json');
  if (!fs.existsSync(p)) return {};
  try {
    const o = JSON.parse(fs.readFileSync(p, 'utf8'));
    delete o._comment;
    return o;
  } catch (e) {
    console.warn('codigo-monitores.json inválido:', e.message);
    return {};
  }
}

function normalizaBusca(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase();
}

/** Reconhece secretaria pelo texto do Setor (planilha de monitores). */
function inferSecretariaFromText(u) {
  const rules = [
    [/\bPROCURADORIA\b/i, 'PROCURADORIA GERAL DO MUNICÍPIO'],
    [
      /\bGABINETE\b|PREFEITO|VICE\s+PREFEITO|FUSSOL|FUNDO\s+SOCIAL/i,
      'GABINETE DO PREFEITO',
    ],
    [
      /EDUCACAO|EDUCA(C|Ç)O|\bEMEB\b|\bEMEI\b|CRECHE|\bESCOLA\b|\bUAB\b|UNIVERSIDADE\s+ABERTA/i,
      'SECRETARIA MUN. DE EDUCAÇÃO',
    ],
    [
      /SAUDE|SAÚDE|\bUBS\b|\bUPA\b|\bSAMU\b|PRONTO|LABORAT|FARMAC|CAPS\b|PSF\b|HOSPITAL|AUDITIVA|CEREST|CDI\b|VIGIL(A|Â)NCIA/i,
      'SECRETARIA MUN. DE SAÚDE',
    ],
    [
      /SEGURAN(C|Ç)A|BOMBEIRO|PROCON|TIRO\s+DE\s+GUERRA|POL[IÍ]CIA/i,
      'SECRETARIA MUN. DE SEGURANÇA',
    ],
    [
      /\bRH\b|RECURSOS\s+HUMANOS|PATRIMON|BAIXA\s+PATRIMON|ARQUIVO\s+CENTRAL|PROTOCOLO|HARDWARE|SIAS|ZELADORIA|INSERVIVEIS/i,
      'SECRETARIA MUN. DE ADMINISTRAÇÃO E RECURSOS HUMANOS',
    ],
    [/FINAN(C|Ç)AS|TRIBUTA(C|Ç)O|CONTABIL/i, 'SECRETARIA MUN. DE FINANÇAS'],
    [
      /A(C|Ç)O\s+SOCIAL|CRAS|CREAS|CENTRO\s+POP|CADASTRO\s+UNICO|COZINHALIMENTO/i,
      'SECRETARIA MUN. DE AÇÃO SOCIAL',
    ],
    [/ESPORTE|CULTURA/i, 'SECRETARIA MUN. DE ESPORTE E CULTURA'],
    [
      /INFRAESTRUTURA|PARCELAMENTO|USO(\s+DE)?\s+SOLO|ALMOXARIFADO/i,
      'SECRETARIA MUN. DE INFRAESTRUTURA',
    ],
    [
      /INOVA(C|Ç)O|DESENVOLVIMENTO|EMPREENDEDOR|CAMINHO\s+PARA\s+O\s+EMPREGO/i,
      'SECRETARIA MUN. DE INOVAÇÃO E DESENVOLVIMENTO',
    ],
    [/MEIO\s+AMBIENTE|PARQUE|FERNANDO\s+COSTA/i, 'SECRETARIA MUN. DE MEIO AMBIENTE'],
    [/CORREGEDORIA/i, 'GABINETE DO PREFEITO'],
    [/CONTRATOS/i, 'SECRETARIA MUN. DE ADMINISTRAÇÃO E RECURSOS HUMANOS'],
  ];

  for (const [re, nome] of rules) {
    if (re.test(u)) return nome;
  }
  return null;
}

/**
 * Planilha de monitores: coluna Secretaria vazia; usa Setor (texto ou código).
 */
function inferSecretariaFromSetorMonitor(setor, codigoMap) {
  const raw = String(setor || '').trim();
  if (!raw) return null;

  const u = normalizaBusca(raw);

  const fromText = inferSecretariaFromText(u);
  if (fromText) return fromText;

  if (/^\d{5}$/.test(raw)) {
    const nome = codigoMap[raw];
    if (nome) return nome;
    console.warn(
      `Import monitores: código "${raw}" sem mapeamento em codigo-monitores.json — linha ignorada.`
    );
    return null;
  }

  const m = raw.match(/^(\d{5})[\s\-–]+(.+)$/s);
  if (m) {
    const rest = inferSecretariaFromText(normalizaBusca(m[2]));
    if (rest) return rest;
    const nome = codigoMap[m[1]];
    if (nome) return nome;
  }

  return null;
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

  const rowsPc = sheetToJsonPatrimonio(COMPUTADORES_XLSX);
  const rowsMon = sheetToJson(MONITORES_XLSX);
  const codigoMap = loadCodigoMonitoresMap();

  const aliasNome = [
    'nome_maquina',
    'nome maquina',
    'bem_patrimonial',
    'bem patrimonial',
    'descricao',
    'descricao_bem',
    'computador',
    'hostname',
    'maquina',
    'host',
  ];
  const aliasPat = [
    'placa',
    'patrimonio',
    'patrimônio',
    'bem',
    'numero_patrimonio',
    'n_bem',
    'nbem',
  ];
  /** Só colunas de secretaria — não usar "setor" (evita confundir com local). */
  const aliasSecPc = ['secretaria', 'secretária', 'secretaria_nome'];
  const aliasLoc = [
    'localizacao',
    'localização',
    'local',
    'sala',
    'setor',
  ];
  const aliasAd = [
    'status_ad',
    'status ad',
    'ad',
    'status',
    'no_ad',
    'mais_de_10_anos',
    'mais de 10 anos',
  ];
  const aliasDataAquisicao = [
    'data_aquisicao',
    'data aquisicao',
    'data aquisição',
    'data_da_aquisicao',
    'data da aquisicao',
    'data da aquisição',
    'dt_aquisicao',
    'dt aquisicao',
    'dt aquisição',
    'dt_aquisição',
    'dt. aquisicao',
    'dt. aquisição',
    'data_de_aquisicao',
    'data de aquisicao',
    'data de aquisição',
    'dt aquis',
    'dtaquisicao',
    'dmaquisicao',
    'dtcompra',
    'dt compra',
    'data_compra',
    'data compra',
    'dt_entrada',
    'dt entrada',
    'data_entrada',
    'data entrada',
    'ano_aquisicao',
    'ano aquisicao',
    'ano aquisição',
    'período aquisição',
    'periodo aquisicao',
    'data cadastro',
    'dt_cadastro',
  ];

  let nPc = 0;
  let nPcSkip = 0;
  let nPcComData = 0;
  for (const r of rowsPc) {
    const secretariaNome = pickRow(r, aliasSecPc);
    if (!secretariaNome) {
      nPcSkip++;
      continue;
    }

    const sec = await getOrCreateSecretaria(db, secretariaNome);
    const nome_maquina = pickRow(r, aliasNome);
    const patrimonio = pickRow(r, aliasPat);
    const localizacao = pickRow(r, aliasLoc);
    const status_ad = pickRow(r, aliasAd);
    const dataRaw = pickRow(r, aliasDataAquisicao);
    const data_aquisicao = dataRaw
      ? parseDataAquisicaoVal(dataRaw)
      : null;
    if (data_aquisicao) nPcComData++;

    await dbRun(
      db,
      `INSERT INTO computadores (nome_maquina, patrimonio, secretaria_id, localizacao, status_ad, data_aquisicao)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        nome_maquina || null,
        patrimonio || null,
        sec.id,
        localizacao || null,
        status_ad || null,
        data_aquisicao || null,
      ]
    );
    nPc++;
  }

  const aliasMod = [
    'modelo',
    'descricao',
    'descrição',
    'tipo',
    'bem_patrimonial',
    'bem patrimonial',
  ];
  let nMon = 0;
  let nMonSkip = 0;
  for (const r of rowsMon) {
    let secretariaNome = pickRow(r, ['secretaria', 'secretária']);
    if (!secretariaNome) {
      const setor = pickRow(r, ['setor', 'local']);
      secretariaNome = inferSecretariaFromSetorMonitor(setor, codigoMap);
    }
    if (!secretariaNome) {
      nMonSkip++;
      continue;
    }

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
  console.log(
    'Computadores:',
    nPc,
    nPcSkip ? `(ignorados sem Secretária: ${nPcSkip})` : ''
  );
  console.log(
    '  → Com data de aquisição (idade no app):',
    nPcComData,
    'de',
    nPc,
    nPc ? '(' + Math.round((nPcComData / nPc) * 100) + '%)' : ''
  );
  if (nPc > 0 && nPcComData === 0) {
    console.warn(
      '  ⚠ Nenhuma data importada — confira o cabeçalho da coluna (ex.: «Data aquisição», «Dt. Aquisição») e se as células estão como data/número no Excel, não como texto inválido.'
    );
  }
  console.log(
    'Monitores:',
    nMon,
    nMonSkip ? `(ignorados sem secretaria inferida: ${nMonSkip})` : ''
  );
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
