FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# Run build (skip linting - already validated locally)
RUN npm run build

FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache tini

COPY package*.json ./
RUN npm ci --production && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set production environment
ENV NODE_ENV=production
ENV PORT=3005
ENV USE_ENHANCED_MODE=true

# Expose ports
EXPOSE 3005 9090

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3005/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Switch to non-root user
USER nodejs

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Default to HTTP mode for Azure Container Apps (Copilot Studio)
CMD ["node", "dist/index.js"]

# For stdio mode (Claude Desktop), run with: docker run ... node dist/index.js --stdio
