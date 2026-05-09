FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
RUN npm install && cd backend && npm install && cd ../frontend && npm install

COPY . .
RUN cd backend && npm run build
RUN cd frontend && npm run build

FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app ./

EXPOSE 3000 4000
CMD ["npm", "run", "start:prod"]
