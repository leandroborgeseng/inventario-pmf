# inventario-pmf

Aplicação web para auditoria de inventário (computadores e monitores). Node.js, Express e SQLite.

## Uso rápido

```bash
npm install
export ADMIN_SENHA='sua_senha'
npm start
```

Importação das planilhas (com `computadores.xlsx` e `monitores.xlsx` na raiz do projeto):

```bash
npm run import
```

Deploy: configure `PORT`, `ADMIN_SENHA` e `DB_PATH` (ex.: `/data/database.sqlite` no Railway com volume em `/data`).
