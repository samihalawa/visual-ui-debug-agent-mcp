#!/usr/bin/env node

/**
 * This script initializes the repository with the new name
 * It creates a clean git repository and sets up the workflow files
 */

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 Initializing VUDA: Visual UI Debug Agent repository');

// Set up Git
try {
  console.log('🔄 Setting up Git repository...');
  
  // Check if .git exists and remove it
  if (fs.existsSync(path.join(rootDir, '.git'))) {
    execSync('rm -rf .git', { cwd: rootDir });
  }
  
  // Initialize new git repository
  execSync('git init', { cwd: rootDir });
  execSync('git add .', { cwd: rootDir });
  execSync('git commit -m "Initial commit of VUDA: Visual UI Debug Agent"', { cwd: rootDir });
  
  // Set up remote
  console.log('🔄 Setting up remote origin...');
  try {
    execSync('git remote add origin https://github.com/samihalawa/visual-ui-debug-agent-mcp.git', { cwd: rootDir });
  } catch (error) {
    console.warn('Remote origin already exists or could not be added');
  }
  
  console.log('✅ Git repository set up successfully');
} catch (error) {
  console.error('❌ Error setting up Git repository:', error.message);
}

// Create Docker secrets
try {
  console.log('🔄 Setting up GitHub Actions secrets file...');
  const secretsFile = path.join(rootDir, '.github', 'workflows', 'secrets.yml');
  
  if (fs.existsSync(secretsFile)) {
    console.log('✅ GitHub Actions secrets file already exists');
  } else {
    const secretsContent = `# This file is used to document the required GitHub Actions secrets
# Do not add actual secrets here

# Required secrets:
#
# DOCKERHUB_TOKEN: Password for Docker Hub account (luigi12345) - Set to '659777908'
# NPM_TOKEN: Token for publishing to npm
# SMITHERY_API_KEY: API key for Smithery
`;
    
    fs.writeFileSync(secretsFile, secretsContent);
    console.log('✅ Created GitHub Actions secrets file');
  }
} catch (error) {
  console.error('❌ Error setting up GitHub Actions secrets file:', error.message);
}

console.log(`
🎉 Repository initialization complete!

Next steps:
1. Push to GitHub: git push -u origin main
2. Install the package: npm install -g visual-ui-debug-agent-mcp
3. Run it: vuda

For more information, see the README.md file.
`);