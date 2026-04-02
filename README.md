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

- **Computadores:** primeira aba com cabeçalho na linha que contém **Placa** e **Bem Patrimonial** (linhas iniciais com fórmulas são ignoradas). Colunas usadas: **Placa** (patrimônio), **Bem Patrimonial** (nome do bem), **Setor** (localização), **Secretária** (obrigatória — não use a coluna Setor como secretaria), **MAIS DE 10 ANOS** / **Dt. Aquisição** (ou **Data aquisição**, **dt aquisição**, etc.) — `data_aquisicao` no banco; na interface a **idade** é só **anos completos** (ex.: `7 anos`, `Menos de 1 ano`). Demais colunas da planilha não são importadas.
- **Monitores:** coluna **Secretaria** pode estar vazia; o import infere a secretaria pelo texto de **Setor** (palavras-chave: SAÚDE, EDUCAÇÃO, RH, etc.). Códigos numéricos isolados (ex.: `20500`) são mapeados em `server/codigo-monitores.json` — **revise** com a TI se os totais por secretaria não baterem.

## Railway (produção)

### Criar o volume (passo a passo)

A interface do Railway muda com o tempo; o essencial é **um disco persistente montado em `/data`**, onde ficará `database.sqlite`.

1. Abra o **projeto** e o **serviço** que executa esta app Node.
2. Vá a **Settings** (Configurações) do serviço e procure **Volumes** (ou **Add volume** / **Persistent storage**).
3. Crie um volume novo e defina o **caminho de montagem (mount path)** exatamente como **`/data`**.
4. Escolha o tamanho (ex.: 1–5 GB, conforme espaço para Excel + SQLite + margem).
5. Guarde e faça um **Redeploy** do serviço, se o Railway pedir, para o volume entrar em vigor.
6. Variáveis (mínimo): `ADMIN_SENHA`, `IMPORT_DEFAULT_SENHA`, `PUBLIC_URL` (recomendado). Não é obrigatório definir `DB_PATH` se usar o padrão: com deteção Railway o ficheiro é **`/data/database.sqlite`**.
7. **Primeira subida com banco vazio:** o import automático ao arrancar está **desligado por defeito** no Railway. Ou define **`AUTO_IMPORT_ON_START=true`** temporariamente, ou corre `npm run import` via [Railway CLI](https://docs.railway.com/develop/cli), ou usa **«Reimportar planilhas»** no admin (com Excel disponível no container/volume).
8. Opcional: **`REQUIRE_PERSISTENT_DB=true`** — o processo **não arranca** se o `DB_PATH` não for reconhecido como caminho persistente (ex.: ainda a apontar para disco da imagem).

**Verificação:** após vistoriar um equipamento, faça um novo deploy; os dados devem manter-se. Use **`GET /api/health`** (resposta `db: true`) em monitorização ou health check.

### Comportamento de segurança e carga

- Limite de falhas por IP em **`/api/login-token`** e nas rotas de **admin** (HTTP 429 após várias senhas erradas; configurável por `LOGIN_FAIL_*` e `ADMIN_FAIL_*`).
- **`GET /api/health`:** `ok`, `db`, `version`, `uptime` — sem autenticação.
- **`ADMIN_SENHA`:** no Railway, aviso no log se for curta; com **`ENFORCE_STRONG_ADMIN_SENHA=true`** o arranque falha abaixo de `ADMIN_SENHA_MIN_LENGTH` (predefinição 12).
- **Export Excel:** até **`EXPORT_MAX_ROWS`** linhas (predefinição 100000); acima disso responde 413.

**Checklist rápido**

1. Volume em **`/data`** + redeploy.
2. `ADMIN_SENHA` forte; opcional `ENFORCE_STRONG_ADMIN_SENHA=true`.
3. `IMPORT_DEFAULT_SENHA`, `PUBLIC_URL`.
4. Primeiro import manual ou `AUTO_IMPORT_ON_START=true` só quando necessário.
5. Backups periódicos pelo admin (**Backup do banco .sqlite**).

**Importar o Excel no servidor** (após volume e variáveis):

1. Garanta os `.xlsx` e rode o import, por exemplo:
   - [Railway CLI](https://docs.railway.com/develop/cli): `railway run --service <nome> -- npm run import`
   - Prefira planilhas no volume (ex.: `/data/`) e `COMPUTADORES_XLSX` / `MONITORES_XLSX` apontando para esses caminhos.

Ou importe **uma vez na sua máquina** com `DB_PATH` apontando para uma cópia do banco e faça upload desse `.sqlite` para o volume (menos ideal, mas possível).
