# Use the official Bun image (following Ether pattern)
FROM oven/bun:1 as base
WORKDIR /app

    # Install dependencies using bun (following Ether pattern)
    COPY package.json bun.lock ./
    RUN bun install --frozen-lockfile

    # Copy source code
    COPY . .

# Build the application
RUN bun run build

# Production image (following Ether pattern)
FROM oven/bun:1 as runner
WORKDIR /app

# Copy built assets from base (following Ether pattern)
COPY --from=base /app/build ./build
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./

# Create data directory for SQLite (following Ether pattern)
RUN mkdir -p /data

# Set environment variables (following Ether pattern)
ENV NODE_ENV=production
ENV PORT=80
ENV HOST=0.0.0.0
ENV DB_PATH=/data/tutor.db

# Expose port
EXPOSE 80

# Start the application (following Ether pattern)
CMD ["bun", "run", "build/index.js"]
