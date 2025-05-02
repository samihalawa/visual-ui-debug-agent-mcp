#!/usr/bin/env node

// Simple script to run the MCP server using the Smithery configuration
import fs from 'fs';
import { exec } from 'child_process';
import path from 'path';

// Read Smithery config
const smitheryConfig = fs.readFileSync('smithery.yaml', 'utf8');

// For our specific file, we know the function is at these lines
// Hard code it for simplicity
const commandFunctionStr = `(config) => ({ 
  command: 'node', 
  args: ['build/index.js'], 
  env: { 
    PORT: config.port?.toString(), 
    DEBUG: config.debug ? "true" : "false",
    HEADLESS: config.headless ? "true" : "false",
    MAX_CONCURRENT_SESSIONS: config.maxConcurrentSessions?.toString(),
    SCREENSHOT_DIR: config.screenshotDir
  } 
})`;

console.log('Using commandFunction:', commandFunctionStr);

// Create a default config based on schema
const defaultConfig = {
  port: 8080,
  debug: false,
  headless: true,
  maxConcurrentSessions: 5,
  screenshotDir: './temp'
};

// Evaluate the command function to get the command
const commandFn = eval(`(${commandFunctionStr})`);
const { command, args, env } = commandFn(defaultConfig);

// Print command information
console.log('🚀 Running MCP AI Vision Debug UI Automation with Smithery configuration');
console.log('=================================================================');
console.log(`Command: ${command} ${args.join(' ')}`);
console.log('Environment variables:');
Object.entries(env).forEach(([key, value]) => {
  console.log(`  ${key}: ${value}`);
});
console.log('=================================================================');

// Execute the command
const processEnv = { ...process.env, ...env };
const childProcess = exec(`${command} ${args.join(' ')}`, { env: processEnv });

// Handle output
childProcess.stdout.on('data', (data) => {
  console.log(data.toString().trim());
});

childProcess.stderr.on('data', (data) => {
  console.error(data.toString().trim());
});

childProcess.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
});

// Handle termination signals
const signals = ['SIGINT', 'SIGTERM'];
signals.forEach(signal => {
  process.on(signal, () => {
    console.log(`\nReceived ${signal}, shutting down server...`);
    childProcess.kill();
    process.exit(0);
  });
});

console.log('Server is running. Press Ctrl+C to stop.');