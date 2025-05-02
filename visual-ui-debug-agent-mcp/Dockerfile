FROM node:18-slim

LABEL name="MCP AI Vision Debug UI Automation"
LABEL description="MCP server for visual analysis and automated UI testing"
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

# Create app directory
WORKDIR /usr/src/app

# Copy app source
COPY . .

# Install app dependencies
RUN npm install

# Install Playwright browsers
RUN npx playwright install --with-deps chromium

# Build the app
RUN npm run build

# Expose port
EXPOSE 8080

# Set environment
ENV NODE_ENV=production

# Define command to run the app
CMD ["npm", "start"] 