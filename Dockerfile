FROM node:18-slim

LABEL name="VUDA: Visual UI Debug Agent"
LABEL description="An autonomous MCP agent for visual testing and debugging of user interfaces"
LABEL maintainer="samihalawa"

# Install dependencies for Playwright
RUN apt-get update && apt-get install -y \
    libgtk-3-0 \
    libasound2 \
    libx11-xcb1 \
    libnss3 \
    libxss1 \
    libasound2 \
    libxtst6 \
    libgbm1 \
    fonts-liberation \
    fonts-noto-color-emoji \
    xvfb \
    wget \
    xauth \
    fonts-freefont-ttf \
    fonts-kacst \
    fonts-thai-tlwg \
    fontconfig \
    libfontconfig1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy source code
COPY src/ ./src/
COPY smithery.yaml ./

# Install dependencies
RUN npm install

# Install Playwright browsers
RUN npx playwright install --with-deps chromium

# Build the app
RUN npm run build

# Create temp directory for screenshots
RUN mkdir -p ./temp && chmod 755 ./temp

# Set environment
ENV NODE_ENV=production

# Start the server with stdio transport
CMD ["node", "dist/index.js"] 