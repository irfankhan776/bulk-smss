FROM node:20-slim

RUN apt-get update -y && \
    apt-get install -y openssl libssl-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./
COPY backend/prisma/ ./prisma/
COPY backend/src/ ./src/
COPY backend/barber-template.html ./

RUN npm install
RUN npx prisma generate --schema=src/prisma/schema.prisma

# Wrangler for Cloudflare Pages site deployments
RUN npm install -g wrangler

# Prisma migrations run automatically on start
CMD ["sh", "-c", "npx prisma migrate deploy --schema=src/prisma/schema.prisma && node server.js"]
