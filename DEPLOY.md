# Deploy do painel

## Servidor recomendado

Para este projeto, a opção grátis mais adequada é uma VM Always Free da Oracle Cloud, porque o bot precisa ficar ligado continuamente e o banco SQLite precisa de disco persistente.

Render/Vercel são bons para sites e APIs, mas planos gratuitos podem dormir ou ter limitações de banco. Para não perder dados, use uma VM com volume persistente e backups.

## Passo a passo com Docker

1. Crie uma VM Ubuntu na Oracle Cloud Always Free.
2. Instale Docker e Docker Compose:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER
```

3. Baixe o projeto:

```bash
git clone <seu-repositorio> painel
cd painel
```

4. Copie o arquivo de produção:

```bash
cp backend/.env.production.example backend/.env
nano backend/.env
```

5. Crie também um `.env` na raiz do projeto para o Docker Compose usar no build do frontend:

```bash
nano .env
```

Exemplo usando IP público:

```env
FRONTEND_URL=http://IP-DO-SERVIDOR:3000
NEXT_PUBLIC_API_URL=http://IP-DO-SERVIDOR:4000
DATABASE_URL=file:/app/data/dev.db
```

6. Preencha as variáveis reais em `backend/.env`, principalmente:

```env
DATABASE_URL="file:/app/data/dev.db"
JWT_SECRET="uma-chave-longa"
SESSION_SECRET="outra-chave-longa"
FRONTEND_URL="http://IP-DO-SERVIDOR:3000"
TELEGRAM_BOT_TOKEN="token-do-bot"
OWNER_TELEGRAM_ID="7402861984"
SUB_OWNER_TELEGRAM_IDS="6939836527,7741800942"
```

7. Suba o projeto:

```bash
docker compose up -d --build
```

8. Abra no navegador:

```text
http://IP-DO-SERVIDOR:3000
```

## Backup

No Windows:

```powershell
npm run backup:db
```

No Linux:

```bash
sh scripts/backup-database.sh
```

Para backup diário no Linux:

```bash
crontab -e
```

Adicione:

```cron
0 3 * * * cd /caminho/painel && sh scripts/backup-database.sh >> backups/backup.log 2>&1
```

## Observações de produção

- Mantenha `backend/.env` fora de repositórios públicos.
- Use senhas fortes em `OWNER_PASSWORD`, `JWT_SECRET` e `SESSION_SECRET`.
- A pasta `backups/` deve ser copiada periodicamente para outro lugar.
- Se usar domínio, coloque o domínio em `FRONTEND_URL` e ajuste `NEXT_PUBLIC_API_URL` no `docker-compose.yml`.
