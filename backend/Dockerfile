FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .

ENV NODE_ENV=production

RUN npx prisma generate --schema src/prisma/schema.prisma

EXPOSE 4000

CMD ["node", "server.js"]

