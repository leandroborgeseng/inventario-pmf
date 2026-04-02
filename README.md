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

## Railway

1. Variáveis: `ADMIN_SENHA`, `DB_PATH=/data/database.sqlite`, `PORT` (o Railway define automaticamente). **Defina `IMPORT_DEFAULT_SENHA`** com o valor que as secretarias vão usar (é a senha criada no primeiro import de cada secretaria nova; import seguinte mantém token e senha já gravados).
2. **`PUBLIC_URL`** (ou `PUBLIC_BASE_URL`): URL fixa do app (`https://seu-dominio.up.railway.app`) — o admin monta os links completos; sem isso o domínio ainda costuma ser estável no Railway.
3. Volume: monte um disco em **`/data`** para o SQLite persistir entre deploys (recomendado: assim não perde vistorias; tokens novos no código usam hash estável do nome, mas dados ficam no banco).
4. Tokens por secretaria são **determinísticos** (nome na planilha + `SECRETARIA_TOKEN_SALT` opcional): deploy com banco vazio + mesmo Excel + mesma `IMPORT_DEFAULT_SENHA` (e mesmo salt, se usar) → **mesmos caminhos** `/inventario/...` e mesmas senhas iniciais.
5. **Importar o Excel no servidor:** depois do deploy, garanta os `.xlsx` no ambiente e rode o import, por exemplo:
   - [Railway CLI](https://docs.railway.com/develop/cli): `railway run --service <nome> -- npm run import`
   - Antes disso, envie `computadores.xlsx` e `monitores.xlsx` para um caminho no volume (ex.: `/data/`) e configure `COMPUTADORES_XLSX` e `MONITORES_XLSX` nas variáveis do serviço apontando para esses caminhos.

Ou importe **uma vez na sua máquina** com `DB_PATH` apontando para uma cópia do banco e faça upload desse `.sqlite` para o volume (menos ideal, mas possível).
