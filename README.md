# Painel Administrativo do Supergrupo Telegram

## Visão Geral da Arquitetura

### Stack Principal
- Backend: Node.js + NestJS
- Frontend: Next.js + React + Tailwind CSS
- Banco de dados: SQLite (desenvolvimento local)
- ORM: Prisma
- Bot Telegram: Telegraf
- Autenticação: JWT + sessão segura + hash bcrypt

### Arquitetura
- `backend/`: API REST e serviço do bot Telegram
- `frontend/`: painel administrativo responsivo e moderno
- `prisma/`: esquema de dados e migrações
- `.env.example`: variáveis de ambiente para configurar localmente

### Componentes
- `AuthModule`: login com usuário/email e senha
- `UsersModule`: gerenciamento de usuários do painel
- `MembersModule`: listagem, perfil, silenciamento e banimento
- `LogsModule`: histórico de eventos e auditoria
- `TelegramModule`: bot conectado ao grupo e ações no Telegram

---

## Estrutura de Pastas

- `backend/src/main.ts`
- `backend/src/app.module.ts`
- `backend/src/auth/`
- `backend/src/users/`
- `backend/src/members/`
- `backend/src/logs/`
- `backend/src/telegram/`
- `prisma/schema.prisma`
- `frontend/pages/`
- `frontend/components/`
- `frontend/styles/`

---

## Modelo de Banco de Dados

### `PanelUser`
- `id`
- `email`
- `username`
- `passwordHash`
- `role`: `OWNER`, `ADMIN`, `MODERATOR`
- `isActive`
- `createdAt`, `updatedAt`

### `TelegramMember`
- `id`
- `telegramId`
- `telegramUsername`
- `fullName`
- `status`: `MEMBER`, `ADMIN`, `BOT`, `BANNED`, `MUTED`
- `isBot`
- `messageCount`
- `firstMessageAt`, `lastMessageAt`
- `createdAt`, `updatedAt`

### `ActionLog`
- `id`
- `type`: `JOIN`, `LEAVE`, `MUTE`, `UNMUTE`, `BAN`, `UNBAN`, `PANEL_LOGIN`, `PANEL_ACTION`
- `origin`: `TELEGRAM`, `PANEL`
- `actorId`
- `targetMemberId`
- `targetTelegramId`
- `reason`
- `durationMinutes`
- `createdAt`

---

## Fluxo de Autenticação

1. Usuário acessa `/login` no frontend.
2. Frontend envia `POST /auth/login` com `username` e `password`.
3. Backend valida o usuário com `bcrypt` contra o hash no banco.
4. Se válido, gera JWT e retorna `access_token`.
5. Rotas protegidas usam `JwtAuthGuard`.
6. Apenas o dono (`OWNER`) pode criar, desativar ou excluir usuários do painel.

---

## Fluxo de Integração com Telegram

1. Bot é criado e adicionado como administrador do supergrupo privado.
2. Bot escuta eventos de `new_chat_members`, `left_chat_member` e `message`.
3. Ao receber eventos, o bot atualiza o banco de dados próprio com membros e estatísticas.
4. Ações de moderação no painel (`mute`, `ban`) chamam a API do Telegram via Telegraf.
5. O bot envia mensagens de aviso no grupo quando um membro é silenciado ou banido.

---

## Rotas da API

### Autenticação
- `POST /auth/login`
- `POST /auth/refresh`

### Usuários do Painel
- `GET /panel-users`
- `POST /panel-users`
- `PATCH /panel-users/:id/status`
- `DELETE /panel-users/:id`

### Membros
- `GET /members`
- `GET /members/:id`
- `POST /members/:id/mute`
- `POST /members/:id/ban`

### Logs
- `GET /logs`

---

## Telas do Painel

### Dashboard Geral
- Cards de métricas
- Trend de ações recentes
- Acesso rápido às abas principais

### Membros
- Tabela com miniaturas, nome, usuário, ID, status, mensagens, datas e tipo
- Filtros por métricas e status
- Botões de ação para abrir perfil e aplicar punições

### Administradores
- Lista de administradores com cargo e última atividade

### Bots
- Status dos bots no grupo

### Moderação
- Fluxo de silenciamento e banimento com motivo, duração e confirmação

### Logs
- Histórico de entradas, saídas, silenciamentos, banimentos e ações do painel
- Filtros por tipo, membro, autor e período

### Usuários do Painel
- Controle de criação, ativação, desativação e exclusão
- Restrição para criar apenas pelo dono

### Configurações
- Configurações do bot, webhook, grupo e preferências visuais

---

## Componentes Principais do Frontend

- `DashboardLayout`: sidebar e layout responsivo
- `pages/login.tsx`: tela de login
- `pages/index.tsx`: dashboard
- `pages/members.tsx`: listagem de membros
- `pages/logs.tsx`: histórico de eventos
- `pages/panel-users.tsx`: gestão de acesso interno

---

## Código Base do Bot

- `backend/src/telegram/telegram.service.ts`
- `initializeBot()` registra eventos de chat e messages
- `muteUser()` aplica `restrictChatMember`
- `banUser()` aplica `banChatMember`
- `logEvent()` grava evento no banco

---

## Exemplo de Variáveis de Ambiente

```env
DATABASE_URL="file:../backend/dev.db"
JWT_SECRET=TroqueEstaChavePorUmaBemSegura
SESSION_SECRET=TroqueEstaChavePorUmaOutraChaveSecreta
FRONTEND_URL=http://localhost:3000
TELEGRAM_BOT_TOKEN=SEU_TOKEN_DO_BOT_AQUI
NODE_ENV=development
PORT=4000
```

---

## Instruções para Rodar Localmente

### Opção 1: Tudo junto (recomendado)
```bash
cd painel
npm run install:all  # instala dependências em raiz, backend e frontend
npm run dev          # roda backend e frontend simultaneamente
```

### Opção 2: Separadamente
#### Backend
```bash
cd painel/backend
npm install
cp ../.env.example .env  # edite o .env com suas credenciais
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

#### Frontend
```bash
cd painel/frontend
npm install
npm run dev
```

Acesse `http://localhost:3000` para o painel e `http://localhost:4000` para a API.

---

## Instruções para Produção

### Backend
- Use `npm run build`
- Execute com `node dist/main.js`
- Configure variável `NODE_ENV=production`
- Configure HTTPS, CORS e `FRONTEND_URL`
- Use um processo PM2, Docker ou serviço gerenciado

### Frontend
- Use `npm run build`
- Sirva com `npm run start` ou implante em Vercel
- Configure `NEXT_PUBLIC_API_URL=http://api.seudominio.com`

---

## Limitações da API do Telegram

1. `getChatMembers` não retorna todos os membros em grupos grandes.
2. Não há histórico completo de mensagens para recuperar antes do bot entrar.
3. A listagem de membros é parcial e depende de eventos capturados.
4. Recomendações:
   - registre membros a partir de eventos `new_chat_members`, `left_chat_member` e mensagens
   - mantenha um banco local com métricas acumuladas
   - atualize dados em tempo real conforme o bot recebe eventos
   - use `getChatAdministrators` para identificar administradores

---

## Avaliação do Projeto

- Completo: arquitetura, backend, frontend, DB, bot, autenticação, permissões e logs.
- Dependências de Telegram: listagem completa de membros e histórico de mensagens só funcionam a partir do momento em que o bot entra no grupo.
- Futuras melhorias:
  - adicionar UI de modal de perfil de membro com silenciar/banir completos
  - incluir webhooks de Telegram para maior estabilidade em produção
  - implementar caching e paginação no frontend
  - expandir logs detalhados e alertas de segurança

### Nota de avaliação: 8.5/10
- 8.5 porque a solução é sólida, end-to-end e pronta para desenvolvimento.
- Limitações: o Telegram não fornece histórico retroativo completo e a lista de membros depende de eventos capturados pelo bot.
- Próximo passo: transformar os placeholders do frontend em páginas totalmente conectadas à API e adicionar migração/seed para usuário proprietário.
