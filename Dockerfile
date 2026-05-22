# Use the official Bun image
FROM oven/bun:1 as base
WORKDIR /app

# Install dependencies using bun
COPY package.json bun.lock ./
RUN bun install

# Copy source code
COPY . .

# Build the application
# (Notice we REMOVED the ENV DB_PATH=/tmp/tutor.db from here)
RUN bun run build

# Production image
FROM oven/bun:1 as runner
WORKDIR /app

# Copy built assets from base
COPY --from=base /app/build ./build
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./

# Create data directory for SQLite
RUN mkdir -p /data

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=80
ENV HOST=0.0.0.0
# Only set the absolute path here in the final runner stage
ENV DB_PATH=/data/tutor.db

# Expose port
EXPOSE 80

# Start the application
CMD ["bun", "run", "build/index.js"]