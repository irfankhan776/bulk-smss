FROM node:20-slim

# Install system dependencies
RUN apt-get update -y && \
    apt-get install -y openssl libssl-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the code
COPY . .

# Generate Prisma client
# Note: We point to the schema location
RUN npx prisma generate --schema=src/prisma/schema.prisma

# Railway injects PORT at runtime — server.js reads process.env.PORT
EXPOSE 8080

# Start the application (prestart will handle DB sync)
CMD ["npm", "start"]
