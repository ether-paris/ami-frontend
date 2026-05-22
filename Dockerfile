# builder
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
# Install bun first since package.json uses bun scripts
RUN npm install -g bun
# Install dependencies (ci automatically skips optional deps which is fine for production)
RUN npm ci
COPY . .
# Build the application
RUN npm run build

# runtime
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
ENV HOST=0.0.0.0
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/build ./build
EXPOSE 80
CMD ["node", "build/index.js"]
