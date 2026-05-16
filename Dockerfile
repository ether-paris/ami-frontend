# builder
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build   # SvelteKit builds to /app/build
# runtime
FROM node:20-slim AS runtime
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev   # only production deps
COPY --from=builder /app/build ./build
ENV PORT=80
ENV HOST=0.0.0.0
EXPOSE 80
CMD ["node", "build/index.js"]