-- Secretarias (acesso por token + senha)
CREATE TABLE IF NOT EXISTS secretarias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS computadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_maquina TEXT,
  patrimonio TEXT,
  secretaria_id INTEGER NOT NULL,
  localizacao TEXT,
  status_ad TEXT,
  FOREIGN KEY (secretaria_id) REFERENCES secretarias(id)
);

CREATE INDEX IF NOT EXISTS idx_computadores_secretaria ON computadores(secretaria_id);

CREATE TABLE IF NOT EXISTS monitores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patrimonio TEXT,
  modelo TEXT,
  secretaria_id INTEGER NOT NULL,
  FOREIGN KEY (secretaria_id) REFERENCES secretarias(id)
);

CREATE INDEX IF NOT EXISTS idx_monitores_secretaria ON monitores(secretaria_id);

-- Um registro de auditoria por computador (atualizado incrementalmente)
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  secretaria_id INTEGER NOT NULL,
  computador_id INTEGER NOT NULL UNIQUE,
  confirmado TEXT NOT NULL,
  observacao TEXT,
  data TEXT NOT NULL,
  FOREIGN KEY (secretaria_id) REFERENCES secretarias(id),
  FOREIGN KEY (computador_id) REFERENCES computadores(id)
);

CREATE INDEX IF NOT EXISTS idx_auditoria_secretaria ON auditoria(secretaria_id);

CREATE TABLE IF NOT EXISTS auditoria_monitores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auditoria_id INTEGER NOT NULL,
  monitor_id INTEGER NOT NULL,
  confirmado INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (auditoria_id) REFERENCES auditoria(id) ON DELETE CASCADE,
  FOREIGN KEY (monitor_id) REFERENCES monitores(id),
  UNIQUE(auditoria_id, monitor_id)
);
