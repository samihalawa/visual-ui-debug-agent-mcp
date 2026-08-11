#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const expectedTools = [
  'api_endpoint_tester',
  'batch_screenshot_urls',
  'console_monitor',
  'debug_memory',
  'dom_inspector',
  'enhanced_page_analyzer',
  'navigation_flow_validator',
  'performance_analysis',
  'playwright_click',
  'playwright_console_logs',
  'playwright_drag',
  'playwright_evaluate',
  'playwright_fill',
  'playwright_get_visible_html',
  'playwright_get_visible_text',
  'playwright_go_back',
  'playwright_go_forward',
  'playwright_hover',
  'playwright_iframe_click',
  'playwright_navigate',
  'playwright_press_key',
  'playwright_screenshot',
  'playwright_select',
  'screenshot_local_files',
  'screenshot_url',
  'sitemap_crawler',
  'tunnel_helper',
  'ui_workflow_validator',
  'visual_comparison'
];

const packageVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;

const client = new Client(
  { name: 'vuda-smoke-test', version: '1.0.0' },
  { capabilities: {} }
);

function startFixtureServer(label) {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ server: label }));
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

const fixtureA = await startFixtureServer('A');
const fixtureB = await startFixtureServer('B');

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  cwd: process.cwd(),
  env: {
    ...process.env,
    VUDA_STABILITY_WAIT: '50',
    VUDA_DEFAULT_TIMEOUT: '5000',
    VUDA_NAVIGATION_TIMEOUT: '5000',
    VUDA_COOKIES_JSON: JSON.stringify([{
      name: 'vuda_session',
      value: 'injected',
      url: fixtureA.url,
    }]),
  },
  stderr: 'pipe'
});

let stderr = '';
transport.stderr?.on('data', chunk => {
  stderr += chunk.toString();
});

try {
  await client.connect(transport);

  const serverVersion = client.getServerVersion();
  assert.equal(serverVersion?.name, 'vuda');
  assert.equal(serverVersion?.version, packageVersion);

  const { tools } = await client.listTools();
  const actualTools = tools.map(tool => tool.name).sort();
  assert.equal(new Set(actualTools).size, actualTools.length, 'tool names must be unique');
  assert.deepEqual(actualTools, expectedTools);

  const { resources } = await client.listResources();
  assert.ok(resources.some(resource => resource.uri === 'browser://status'), 'browser status resource must be listed');
  const browserStatus = await client.readResource({ uri: 'browser://status' });
  const browserStatusJson = JSON.parse(browserStatus.contents[0]?.text ?? '{}');
  assert.equal(browserStatusJson.provider, process.env.EXPECTED_BROWSER_PROVIDER ?? 'local');
  assert.equal(browserStatusJson.connected, false);
  const promptUris = [
    'prompt://visual-debugging',
    'prompt://ui-debug',
    'prompt://iterative-debug-loop'
  ];
  for (const uri of promptUris) {
    assert.ok(resources.some(resource => resource.uri === uri), `${uri} must be listed`);
    const prompt = await client.readResource({ uri });
    assert.match(prompt.contents[0]?.text ?? '', /^# .+/);
  }

  await client.callTool({
    name: 'debug_memory',
    arguments: { action: 'save', key: 'smoke-test', value: 'working' }
  });
  const memory = await client.callTool({
    name: 'debug_memory',
    arguments: { action: 'retrieve', key: 'smoke-test' }
  });
  assert.match(memory.content[0]?.text ?? '', /"value": "working"/);

  for (const fixture of [fixtureA, fixtureB]) {
    const apiResult = await client.callTool({
      name: 'api_endpoint_tester',
      arguments: {
        url: fixture.url,
        endpoints: [{ path: '/', method: 'GET' }]
      }
    });
    const responseText = apiResult.content.map(item => item.text ?? '').join('\n');
    assert.match(responseText, new RegExp(`"server": "${fixture === fixtureA ? 'A' : 'B'}"`));
  }

  await client.callTool({
    name: 'playwright_navigate',
    arguments: { url: fixtureA.url, waitUntil: 'domcontentloaded' }
  });
  const injectedCookie = await client.callTool({
    name: 'playwright_evaluate',
    arguments: { script: 'document.cookie' }
  });
  assert.match(injectedCookie.content[0]?.text ?? '', /vuda_session=injected/);

  const screenshot = await client.callTool({
    name: 'screenshot_url',
    arguments: {
      url: 'data:text/html,<main><h1>VUDA smoke test</h1></main>',
      fullPage: true
    }
  });
  assert.equal(screenshot.isError, undefined);
  assert.ok(
    screenshot.content.some(item => item.type === 'image' && item.mimeType === 'image/png' && item.data.length > 100),
    'screenshot tool must return a PNG image'
  );

  const analysis = await client.callTool({
    name: 'enhanced_page_analyzer',
    arguments: {
      url: 'data:text/html,<button id="save">Save</button>',
      includeConsole: true,
      mapElements: true
    }
  });
  assert.equal(analysis.isError, undefined);
  assert.ok(
    analysis.content.some(item => item.type === 'image' && item.data.length > 100),
    'page analyzer must return image evidence'
  );

  const sitemap = await client.callTool({
    name: 'sitemap_crawler',
    arguments: { url: fixtureA.url, maxDepth: 0 }
  });
  assert.equal(sitemap.isError, undefined);
  assert.match(sitemap.content[0]?.text ?? '', /Total Pages[^\n]*1/);

  const comparison = await client.callTool({
    name: 'visual_comparison',
    arguments: {
      url1: 'data:text/html,<main style="color:red">Before</main>',
      url2: 'data:text/html,<main style="color:blue">After</main>'
    }
  });
  assert.equal(comparison.isError, undefined);
  assert.ok(
    comparison.content.some(item => item.type === 'image' && item.data.length > 100),
    'visual comparison must return image evidence'
  );

  console.log(`PASS MCP handshake: ${serverVersion.name}@${serverVersion.version}`);
  console.log(`PASS tool inventory: ${actualTools.length} unique tools`);
  console.log(`PASS resource reads: ${promptUris.length} prompts`);
  console.log('PASS tool call: debug_memory save/retrieve');
  console.log('PASS API calls: independent base URLs');
  console.log('PASS browser account state: configured cookie reached the page');
  console.log('PASS browser call: screenshot_url returned PNG');
  console.log('PASS analyzer call: interactive-element annotation');
  console.log('PASS comparison call: visual diff image');
  console.log('PASS crawler call: initializes its own browser page');
} catch (error) {
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.close();
  fixtureA.server.close();
  fixtureB.server.close();
}
