'use strict';

const path = require('path');

function isRailwayLike() {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_SERVICE_ID ||
      process.env.RAILWAY_STATIC_URL
  );
}

/**
 * Caminho do SQLite. No Railway (detectado por variáveis típicas), o padrão é
 * /data/database.sqlite — use um Volume montado em /data para persistir vistorias.
 */
function resolveDbPath() {
  const explicit = process.env.DB_PATH && String(process.env.DB_PATH).trim();
  if (explicit) return path.resolve(explicit);
  if (isRailwayLike()) return path.join('/data', 'database.sqlite');
  return path.join(__dirname, 'database.sqlite');
}

/** Heurística: caminhos usuais de volume montado (Linux / Railway). */
function dbPathLooksPersistent(dbPath) {
  const n = path.normalize(dbPath).replace(/\\/g, '/');
  if (process.platform === 'win32') return true;
  return (
    n.startsWith('/data/') ||
    n === '/data' ||
    n.startsWith('/mnt/') ||
    n.startsWith('/persist/')
  );
}

function logDbPersistenceAndMaybeExit(dbPath) {
  if (!isRailwayLike()) {
    console.log(`[db] Caminho: ${dbPath}`);
    return;
  }
  if (dbPathLooksPersistent(dbPath)) {
    console.log(`[db] ${dbPath}`);
    console.log(
      '[db] É obrigatório um disco persistente (Railway: Volume montado em /data). Sem isso, /data some a cada deploy como qualquer outra pasta da imagem.'
    );
    return;
  }
  const msg =
    '[db] CRÍTICO: o banco está fora de /data (disco da imagem). Cada deploy APAGA as vistorias. ' +
    'Defina DB_PATH=/data/database.sqlite e adicione um Volume em /data.';
  console.error(msg);
  const strict = ['1', 'true', 'yes'].includes(
    String(process.env.REQUIRE_PERSISTENT_DB || '').toLowerCase()
  );
  if (strict) {
    console.error('[db] REQUIRE_PERSISTENT_DB=1 — encerrando.');
    process.exit(1);
  }
}

module.exports = {
  resolveDbPath,
  isRailwayLike,
  dbPathLooksPersistent,
  logDbPersistenceAndMaybeExit,
};
