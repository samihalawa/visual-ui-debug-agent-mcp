#!/usr/bin/env node

// MCP AI Vision Debug UI Automation - Test Script
import fetch from 'node-fetch';

// Configuration
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:8080';
const TEST_URL = process.env.TEST_URL || 'https://example.com';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Helper function to print colored output
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Helper function to format JSON
function formatJSON(json) {
  return JSON.stringify(json, null, 2);
}

// Main test function
async function runTests() {
  log('🚀 MCP AI Vision Debug UI Automation - Test Runner', 'bright');
  log('=====================================================', 'bright');
  log(`🔗 MCP Server URL: ${MCP_SERVER_URL}`);
  log(`🌐 Test URL: ${TEST_URL}`);
  log('\n');

  try {
    // Test connection to server
    log('📡 Testing connection to MCP server...', 'blue');
    const healthCheck = await fetch(`${MCP_SERVER_URL}/health`).then(res => res.json()).catch(() => null);
    
    if (healthCheck && healthCheck.status === 'ok') {
      log('✅ Connection successful!', 'green');
    } else {
      log('❌ Failed to connect to MCP server', 'red');
      log('   Make sure the server is running at: ' + MCP_SERVER_URL, 'yellow');
      process.exit(1);
    }

    // Test MCP tools
    log('\n📝 Testing MCP tools...', 'blue');

    // Test screenshot_url tool
    log('\n🔍 Testing screenshot_url tool...', 'cyan');
    const screenshotParams = {
      tool: 'screenshot_url',
      parameters: {
        url: TEST_URL,
        fullPage: true
      }
    };
    
    const screenshotResult = await fetch(`${MCP_SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(screenshotParams)
    }).then(res => res.json());
    
    if (screenshotResult && screenshotResult.result) {
      log('✅ screenshot_url tool test successful!', 'green');
      log(`   Screenshot data: ${screenshotResult.result.substring(0, 50)}...`, 'yellow');
    } else {
      log('❌ screenshot_url tool test failed', 'red');
      log(`   Error: ${formatJSON(screenshotResult)}`, 'yellow');
    }

    // Test enhanced_page_analyzer tool
    log('\n🔍 Testing enhanced_page_analyzer tool...', 'cyan');
    const analyzerParams = {
      tool: 'enhanced_page_analyzer',
      parameters: {
        url: TEST_URL,
        includeConsole: true,
        mapElements: true
      }
    };
    
    const analyzerResult = await fetch(`${MCP_SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(analyzerParams)
    }).then(res => res.json());
    
    if (analyzerResult && analyzerResult.result) {
      log('✅ enhanced_page_analyzer tool test successful!', 'green');
      log(`   Found ${analyzerResult.result.interactiveElements?.length || 0} interactive elements`, 'yellow');
    } else {
      log('❌ enhanced_page_analyzer tool test failed', 'red');
      log(`   Error: ${formatJSON(analyzerResult)}`, 'yellow');
    }

    log('\n🎉 All tests completed!', 'green');
  } catch (error) {
    log(`\n❌ Test failed with error: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Run the tests
runTests();