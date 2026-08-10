FROM mcr.microsoft.com/playwright:v1.62.1-noble

LABEL org.opencontainers.image.title="VUDA"
LABEL org.opencontainers.image.description="Visual UI testing and debugging MCP server"
LABEL org.opencontainers.image.source="https://github.com/samihalawa/visual-ui-debug-agent-mcp"
LABEL org.opencontainers.image.licenses="ISC"

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts

COPY src ./src
COPY prompts ./prompts
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/index.js"]
