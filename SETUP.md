# Painel Administrativo admdotcbot

Guia rápido para subir o painel e o bot do Telegram em ambiente local.

## Requisitos

- Node.js 18 ou superior
- npm
- Um bot do Telegram criado no `@BotFather`

## 1. Instalar dependências

```bash
cd c:\Users\Gustavo\Documents\painel
npm run install:all
```

## 2. Configurar o ambiente

O projeto usa SQLite no ambiente local. Não é necessário instalar PostgreSQL.

Copie o arquivo de exemplo para o backend:

```bash
cd backend
copy ..\.env.example .env
```

Edite `backend/.env` com os seus dados:

```env
DATABASE_URL="file:../backend/dev.db"
JWT_SECRET=TroqueEstaChavePorUmaBemSegura
SESSION_SECRET=TroqueEstaChavePorUmaOutraChaveSecreta
FRONTEND_URL=http://localhost:3000,http://localhost:3001,http://localhost:3002
TELEGRAM_BOT_TOKEN=SEU_TOKEN_DO_BOT_AQUI
OWNER_TELEGRAM_ID=123456789
OWNER_USERNAME=admin
OWNER_PASSWORD=troque-esta-senha
OWNER_EMAIL=owner@painel.local
NODE_ENV=development
PORT=4000
```

## 3. Preparar o banco

Ainda dentro de `backend/`:

```bash
npm run prisma:generate
```

Se você estiver começando do zero, isso já é suficiente porque o banco local atual do projeto já está pronto para uso.

Se você estiver aproveitando um banco antigo do projeto, rode também as migrações auxiliares:

```bash
node .\scripts\migrate-telegram-ids-to-text.js
node .\scripts\add-telegram-media-and-duration-columns.js
```

Esses passos corrigem:

- erros `500` causados por IDs grandes do Telegram que não cabem em `INT`
- colunas novas de foto de membro e duração detalhada das punições

## 4. Subir o projeto

Na raiz do projeto:

```bash
cd ..
npm run dev
```

Endpoints locais:

- Painel: `http://localhost:3000`
- API: `http://localhost:4000`

## 5. Entrar no painel

Use as credenciais configuradas em `backend/.env`.

Exemplo:

- Usuário: `admin`
- Senha: `troque-esta-senha`

## 6. Conectar o bot ao supergrupo

1. Adicione o bot ao supergrupo.
2. Promova o bot para administrador.
3. Garanta permissão para banir usuários, restringir membros e ler eventos do grupo.
4. Abra o painel e clique em sincronizar.

Depois disso, o painel passa a consumir os dados registrados pelo bot.

## O que o bot sincroniza

- Grupo salvo no banco
- Administradores detectados pelo Telegram
- Contagem de membros do grupo
- Entrada e saída de membros
- Estatísticas de mensagens capturadas a partir da presença do bot

## Limitações importantes do Telegram

- O Telegram não entrega o histórico completo de mensagens anteriores à entrada do bot.
- Em grupos grandes, o bot não consegue listar todos os membros retroativamente.
- A base de membros melhora conforme o bot recebe eventos e mensagens novas.

## Solução de problemas

### O painel mostra erro `500` em `/group/stats`, `/logs` ou `/bot/sync`

- Verifique se o backend foi reiniciado após a migração do banco.
- Rode `node .\scripts\migrate-telegram-ids-to-text.js` se o banco for antigo.
- Rode `npm run prisma:generate` dentro de `backend/`.

### O bot está online, mas a sincronização falha

- Confirme se o bot está no supergrupo correto.
- Confirme se ele é administrador.
- Verifique se o token em `TELEGRAM_BOT_TOKEN` é o mesmo do bot ativo.
- Veja o campo de último erro no painel e os logs do backend.

### O bot entra em conflito com outra instância

- Feche outras execuções usando o mesmo token.
- Reinicie o backend para que o serviço tente limpar webhook e retomar o polling.

## Comandos úteis

```bash
# Raiz
npm run dev
npm run build

# Backend
cd backend
npm run prisma:generate
npm run build

# Frontend
cd frontend
npm run build
```
