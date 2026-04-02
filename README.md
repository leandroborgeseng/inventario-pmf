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

## Railway

1. Variáveis: `ADMIN_SENHA`, `DB_PATH=/data/database.sqlite`, `PORT` (o Railway define automaticamente).
2. Volume: monte um disco em **`/data`** para o SQLite persistir entre deploys.
3. **Importar o Excel no servidor:** os `.xlsx` não vão no Git (estão no `.gitignore`). Depois do deploy, coloque os arquivos no ambiente e rode o import com os mesmos caminhos, por exemplo:
   - [Railway CLI](https://docs.railway.com/develop/cli): `railway run --service <nome> -- npm run import`
   - Antes disso, envie `computadores.xlsx` e `monitores.xlsx` para um caminho no volume (ex.: `/data/`) e configure `COMPUTADORES_XLSX` e `MONITORES_XLSX` nas variáveis do serviço apontando para esses caminhos.

Ou importe **uma vez na sua máquina** com `DB_PATH` apontando para uma cópia do banco e faça upload desse `.sqlite` para o volume (menos ideal, mas possível).
