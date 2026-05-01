# syntax=docker/dockerfile:1.6
# HWPX MCP Server — HTTP (remote) mode image
# Builds a minimal Node image that runs the MCP server with a StreamableHTTP transport.
# Local stdio mode is unaffected and does not use this image.

FROM node:20-alpine AS build
WORKDIR /app

# Install deps using the committed lockfile for reproducible builds
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Compile TypeScript -> dist/
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop devDependencies for the runtime image
RUN npm prune --omit=dev


FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    MCP_MODE=http \
    MCP_PORT=13701 \
    MCP_PATH=/mcp

# Non-root runtime user
RUN addgroup -S mcp && adduser -S -G mcp mcp

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER mcp
EXPOSE 13701

# Minimal healthcheck hitting the unauthenticated /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.MCP_PORT||'13701')+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
