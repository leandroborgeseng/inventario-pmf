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

### Formato esperado (PMF / patrimônio)

- **Computadores:** primeira aba com cabeçalho na linha que contém **Placa** e **Bem Patrimonial** (linhas iniciais com fórmulas são ignoradas). Colunas usadas: **Placa** (patrimônio), **Bem Patrimonial** (nome do bem), **Setor** (localização), **Secretária** (obrigatória — não use a coluna Setor como secretaria), **MAIS DE 10 ANOS** / **Dt. Aquisição** quando existirem.
- **Monitores:** coluna **Secretaria** pode estar vazia; o import infere a secretaria pelo texto de **Setor** (palavras-chave: SAÚDE, EDUCAÇÃO, RH, etc.). Códigos numéricos isolados (ex.: `20500`) são mapeados em `server/codigo-monitores.json` — **revise** com a TI se os totais por secretaria não baterem.

## Railway (produção)

**Checklist — sem volume persistente, cada deploy pode apagar todas as vistorias:**

1. **Volume:** adicione um **Volume** no serviço e monte em **`/data`**. Com variáveis típicas do Railway, o banco padrão é **`/data/database.sqlite`** (ou defina `DB_PATH` dentro do volume).
2. Variáveis: `ADMIN_SENHA` (forte), `PORT` (automático). **`IMPORT_DEFAULT_SENHA`** — senha das secretarias novas no primeiro import.
3. Opcional **`REQUIRE_PERSISTENT_DB=true`:** se `DB_PATH` cair fora de `/data`, o processo **não sobe** — evita produção sem disco persistente.
4. **`PUBLIC_URL`** / **`PUBLIC_BASE_URL`:** links completos no admin.
5. **Backup:** no admin, **«Backup do banco (.sqlite)»** — guarde cópias fora do Railway (recomendado após marcos ou antes de «Reimportar planilhas»).
6. Tokens por secretaria são **determinísticos** (`SECRETARIA_TOKEN_SALT` opcional). Os dados de auditoria ficam só no SQLite persistido (e nos backups).
7. **Importar o Excel no servidor:** garanta os `.xlsx` e rode o import, por exemplo:
   - [Railway CLI](https://docs.railway.com/develop/cli): `railway run --service <nome> -- npm run import`
   - Prefira planilhas no volume (ex.: `/data/`) e `COMPUTADORES_XLSX` / `MONITORES_XLSX` apontando para esses caminhos.

Ou importe **uma vez na sua máquina** com `DB_PATH` apontando para uma cópia do banco e faça upload desse `.sqlite` para o volume (menos ideal, mas possível).
