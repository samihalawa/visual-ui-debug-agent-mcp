// Simple script to run the MCP server
import { spawn } from 'child_process';

// Get path to installed binary
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mcpBinPath = join(__dirname, 'node_modules', '.bin', 'mcp-ai-vision-debug-ui-automation');

console.log(`MCP binary path: ${mcpBinPath}`);
console.log(`Binary exists: ${fs.existsSync(mcpBinPath)}`);

// Run the server
const mcpProcess = spawn(mcpBinPath, [], { 
  stdio: 'pipe',
  env: { ...process.env, PORT: '8080' } 
});

console.log('Started MCP server process');

mcpProcess.stdout.on('data', (data) => {
  console.log(`MCP stdout: ${data}`);
});

mcpProcess.stderr.on('data', (data) => {
  console.log(`MCP stderr: ${data}`);
});

mcpProcess.on('close', (code) => {
  console.log(`MCP process exited with code ${code}`);
});

// Keep running for a bit then exit
setTimeout(() => {
  console.log('Stopping MCP server');
  mcpProcess.kill();
  process.exit(0);
}, 5000);