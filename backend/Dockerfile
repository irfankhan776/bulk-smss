FROM node:20-slim

RUN apt-get update -y && \
    apt-get install -y openssl libssl-dev ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY src/ ./src/
COPY prisma/ ./prisma/
COPY barber-template.html ./

RUN npm install
RUN npx prisma generate --schema=src/prisma/schema.prisma

# Install Wrangler CLI for Cloudflare Pages deployments
RUN npm install -g wrangler

EXPOSE 8080

CMD ["npm", "start"]
