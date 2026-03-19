FROM node:20-alpine

# Build tools required by better-sqlite3 (native module)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for better layer caching
# (npm install only re-runs when package.json changes)
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Ensure persistent directories exist
RUN mkdir -p /app/uploads /app/db

EXPOSE 3500

CMD ["node", "server.js"]
