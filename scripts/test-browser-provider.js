#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createRemoteSession,
  loadBrowserProviderConfig,
  loadConfiguredCookies,
  releaseRemoteSession,
} from '../dist/browser-provider.js';

const tempDirectory = mkdtempSync(join(tmpdir(), 'vuda-provider-test-'));

try {
  const cookieFile = join(tempDirectory, 'cookies.json');
  writeFileSync(cookieFile, JSON.stringify([{ name: 'session', value: 'file', domain: 'example.com', path: '/' }]));
  const config = loadBrowserProviderConfig({
    VUDA_BROWSER_PROVIDER: 'browserbase',
    BROWSERBASE_API_KEY: 'test-browserbase-key',
    BROWSERBASE_PROJECT_ID: 'project-1',
    BROWSERBASE_CONTEXT_ID: 'context-1',
    VUDA_BROWSERBASE_SESSION_JSON: '{"region":"eu-central-1"}',
    VUDA_COOKIES_FILE: cookieFile,
    VUDA_COOKIES_JSON: '[{"name":"inline","value":"cookie","domain":"example.com","path":"/"}]',
  }, tempDirectory);

  assert.equal(config.provider, 'browserbase');
  assert.equal(loadConfiguredCookies(config).length, 2);

  const browserbaseRequests = [];
  const browserbaseFetch = async (url, init) => {
    browserbaseRequests.push({ url, init });
    if (url.endsWith('/sessions')) {
      return new Response(JSON.stringify({ id: 'bb-session', connectUrl: 'ws://browserbase.test/cdp' }), { status: 201 });
    }
    return new Response(JSON.stringify({ id: 'bb-session', status: 'COMPLETED' }), { status: 200 });
  };
  const browserbaseSession = await createRemoteSession(config, browserbaseFetch);
  assert.equal(browserbaseSession.cdpUrl, 'ws://browserbase.test/cdp');
  const createBody = JSON.parse(browserbaseRequests[0].init.body);
  assert.deepEqual(createBody, {
    region: 'eu-central-1',
    projectId: 'project-1',
    browserSettings: {
      context: { id: 'context-1', persist: true },
    },
  });
  assert.equal(browserbaseRequests[0].init.headers['X-BB-API-Key'], 'test-browserbase-key');
  await releaseRemoteSession(config, browserbaseSession, browserbaseFetch);
  assert.equal(browserbaseRequests[1].init.method, 'POST');
  assert.equal(JSON.parse(browserbaseRequests[1].init.body).status, 'REQUEST_RELEASE');

  const anchorConfig = loadBrowserProviderConfig({
    VUDA_BROWSER_PROVIDER: 'anchor',
    ANCHOR_API_KEY: 'test-anchor-key',
    VUDA_ANCHOR_SESSION_JSON: '{"browser":{"profile":{"name":"vuda","persist":true}}}',
  });
  const anchorRequests = [];
  const anchorFetch = async (url, init) => {
    anchorRequests.push({ url, init });
    if (init.method === 'POST') {
      return new Response(JSON.stringify({
        data: { id: 'anchor-session', cdp_url: 'ws://anchor.test/cdp', live_view_url: 'https://anchor.test/live' },
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: { status: 'ended' } }), { status: 200 });
  };
  const anchorSession = await createRemoteSession(anchorConfig, anchorFetch);
  assert.equal(anchorSession.liveViewUrl, 'https://anchor.test/live');
  assert.equal(anchorRequests[0].init.headers['anchor-api-key'], 'test-anchor-key');
  assert.deepEqual(JSON.parse(anchorRequests[0].init.body), {
    browser: { profile: { name: 'vuda', persist: true } },
  });
  await releaseRemoteSession(anchorConfig, anchorSession, anchorFetch);
  assert.equal(anchorRequests[1].init.method, 'DELETE');

  const cdpConfig = loadBrowserProviderConfig({
    VUDA_BROWSER_PROVIDER: 'cdp',
    VUDA_CDP_URL: 'ws://localhost:9222/devtools/browser/test',
  });
  assert.equal((await createRemoteSession(cdpConfig)).cdpUrl, cdpConfig.cdpUrl);

  assert.throws(
    () => loadBrowserProviderConfig({ VUDA_BROWSER_PROVIDER: 'unsupported' }),
    /local, browserbase, anchor, or cdp/
  );

  console.log('PASS browser providers: local configuration, Browserbase, Anchor Browser, and direct CDP');
  console.log('PASS account state: cookie file plus inline cookie injection');
  console.log('PASS remote lifecycle: create and release request shapes');
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
