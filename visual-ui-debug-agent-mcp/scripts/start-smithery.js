#!/usr/bin/env node

// Script to properly handle Smithery integration
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Default configuration
const defaultConfig = {
  port: 8080,
  debug: false,
  headless: true,
  maxConcurrentSessions: 5,
  screenshotDir: path.join(rootDir, 'temp')
};

// Parse command line arguments
const args = process.argv.slice(2);
const config = { ...defaultConfig };

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--port' && i + 1 < args.length) {
    config.port = parseInt(args[i + 1], 10);
    i++;
  } else if (arg === '--debug') {
    config.debug = true;
  } else if (arg === '--headless=false') {
    config.headless = false;
  } else if (arg === '--max-sessions' && i + 1 < args.length) {
    config.maxConcurrentSessions = parseInt(args[i + 1], 10);
    i++;
  } else if (arg === '--screenshot-dir' && i + 1 < args.length) {
    config.screenshotDir = args[i + 1];
    i++;
  }
}

// Ensure screenshot directory exists
if (!fs.existsSync(config.screenshotDir)) {
  fs.mkdirSync(config.screenshotDir, { recursive: true });
}

// Create environment variables for the process
const env = {
  ...process.env,
  PORT: config.port.toString(),
  DEBUG: config.debug ? "true" : "false",
  HEADLESS: config.headless ? "true" : "false",
  MAX_CONCURRENT_SESSIONS: config.maxConcurrentSessions.toString(),
  SCREENSHOT_DIR: config.screenshotDir
};

// Print startup message
console.log('🚀 Starting MCP AI Vision Debug UI Automation');
console.log('==============================================');
console.log('Configuration:');
Object.entries(config).forEach(([key, value]) => {
  console.log(`  ${key}: ${value}`);
});
console.log('==============================================');

// Start the MCP server
const serverProcess = spawn('node', [path.join(rootDir, 'build', 'index.js')], {
  env,
  stdio: 'inherit'
});

// Handle process exit
serverProcess.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

// Handle process errors
serverProcess.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Handle termination signals
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down server...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down server...');
  serverProcess.kill('SIGTERM');
});