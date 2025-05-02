#!/usr/bin/env node

// Script to verify the MCP server is running with Smithery configuration
import fetch from 'node-fetch';
import { exec } from 'child_process';
import { setTimeout } from 'timers/promises';

// Configuration
const SERVER_URL = 'http://localhost:8080';
const TEST_URL = 'https://example.com';

async function startServer() {
  console.log('Starting server with Smithery configuration...');
  const serverProcess = exec('npm run build && npm run smithery');
  
  // Wait for server to start
  console.log('Waiting for server to start...');
  await setTimeout(5000);
  
  return serverProcess;
}

async function testServer() {
  console.log(`Testing server at ${SERVER_URL}...`);
  
  try {
    // Test health endpoint
    const healthResponse = await fetch(`${SERVER_URL}/health`);
    const healthData = await healthResponse.json();
    
    console.log('Health check response:', healthData);
    
    if (healthData.status !== 'ok') {
      throw new Error('Health check failed');
    }
    
    console.log('✅ Health check passed!');
    
    // Test screenshot tool
    console.log('Testing screenshot_url tool...');
    
    const screenshotResponse = await fetch(`${SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: 'screenshot_url',
        parameters: {
          url: TEST_URL,
          fullPage: true
        }
      })
    });
    
    const screenshotData = await screenshotResponse.json();
    
    if (!screenshotData.result) {
      throw new Error('Screenshot test failed');
    }
    
    console.log('✅ Screenshot test passed!');
    console.log('All tests passed! Server is working correctly with Smithery configuration.');
    
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Main function
async function main() {
  const serverProcess = await startServer();
  
  try {
    await testServer();
  } finally {
    // Cleanup: terminate server
    console.log('Stopping server...');
    serverProcess.kill();
  }
}

// Run main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});