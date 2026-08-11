#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright';

const profileDirectory = mkdtempSync(join(tmpdir(), 'vuda-cdp-profile-'));

async function removeProfileDirectory() {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await rm(profileDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      if (error?.code !== 'ENOTEMPTY' || attempt === 9) return;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}
const chromeCandidates = [
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const chromeExecutable = chromeCandidates.find(existsSync);
if (!chromeExecutable) throw new Error('No Chromium-compatible executable is available for the external CDP test');

const chrome = spawn(chromeExecutable, [
  '--headless=new',
  '--no-sandbox',
  '--remote-debugging-port=0',
  `--user-data-dir=${profileDirectory}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const cdpUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('External Chromium did not publish a CDP URL')), 10000);
  let output = '';
  chrome.stderr.on('data', chunk => {
    output += chunk.toString();
    const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) {
      clearTimeout(timer);
      resolve(match[1]);
    }
  });
  chrome.once('exit', code => {
    clearTimeout(timer);
    reject(new Error(`External Chromium exited before CDP connection (${code})`));
  });
  chrome.once('error', error => {
    clearTimeout(timer);
    reject(error);
  });
});

const client = new Client({ name: 'vuda-cdp-test', version: '1.0.0' }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  cwd: process.cwd(),
  env: {
    ...process.env,
    VUDA_BROWSER_PROVIDER: 'cdp',
    VUDA_CDP_URL: cdpUrl,
    VUDA_STABILITY_WAIT: '50',
  },
  stderr: 'pipe',
});

try {
  await client.connect(transport);
  const screenshot = await client.callTool({
    name: 'screenshot_url',
    arguments: { url: 'data:text/html,<h1>External CDP works</h1>' },
  });
  assert.equal(screenshot.isError, undefined);
  assert.ok(screenshot.content.some(item => item.type === 'image' && item.data.length > 100));

  const status = await client.readResource({ uri: 'browser://status' });
  const state = JSON.parse(status.contents[0]?.text ?? '{}');
  assert.equal(state.provider, 'cdp');
  assert.equal(state.connected, true);
  assert.equal(state.sessionId, null);
  assert.equal(state.liveViewAvailable, false);

  console.log('PASS external browser: VUDA connected over CDP and returned a real PNG');
  console.log('PASS browser status: provider=cdp, connected=true');
} finally {
  await client.close().catch(() => {});
  if (chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    await Promise.race([
      once(chrome, 'exit'),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
  }
  await removeProfileDirectory();
}
