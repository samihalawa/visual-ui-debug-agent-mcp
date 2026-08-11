import * as fs from 'fs';
import * as path from 'path';
import type { BrowserContext } from 'playwright';

type SetCookieParam = Parameters<BrowserContext['addCookies']>[0][number];

export type BrowserProvider = 'local' | 'browserbase' | 'anchor' | 'cdp';

export interface BrowserProviderConfig {
  provider: BrowserProvider;
  cdpUrl?: string;
  browserbaseApiKey?: string;
  browserbaseProjectId?: string;
  browserbaseContextId?: string;
  browserbaseSession: Record<string, unknown>;
  anchorApiKey?: string;
  anchorSession: Record<string, unknown>;
  cookiesJson?: string;
  cookiesFile?: string;
  storageStatePath?: string;
  persistStorageState: boolean;
}

export interface RemoteSession {
  provider: Exclude<BrowserProvider, 'local'>;
  cdpUrl: string;
  sessionId?: string;
  liveViewUrl?: string;
}

type Fetch = typeof fetch;

function parseObject(value: string | undefined, variable: string): Record<string, unknown> {
  if (!value) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${variable} must contain valid JSON`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${variable} must contain a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function enabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').toLowerCase());
}

export function loadBrowserProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd()
): BrowserProviderConfig {
  const provider = (env.VUDA_BROWSER_PROVIDER ?? 'local').toLowerCase();
  if (!['local', 'browserbase', 'anchor', 'cdp'].includes(provider)) {
    throw new Error('VUDA_BROWSER_PROVIDER must be local, browserbase, anchor, or cdp');
  }

  const resolveOptionalPath = (value: string | undefined) =>
    value ? path.resolve(cwd, value) : undefined;

  return {
    provider: provider as BrowserProvider,
    cdpUrl: env.VUDA_CDP_URL,
    browserbaseApiKey: env.BROWSERBASE_API_KEY,
    browserbaseProjectId: env.BROWSERBASE_PROJECT_ID,
    browserbaseContextId: env.BROWSERBASE_CONTEXT_ID,
    browserbaseSession: parseObject(env.VUDA_BROWSERBASE_SESSION_JSON, 'VUDA_BROWSERBASE_SESSION_JSON'),
    anchorApiKey: env.ANCHOR_API_KEY ?? env.ANCHORBROWSER_API_KEY,
    anchorSession: parseObject(env.VUDA_ANCHOR_SESSION_JSON, 'VUDA_ANCHOR_SESSION_JSON'),
    cookiesJson: env.VUDA_COOKIES_JSON,
    cookiesFile: resolveOptionalPath(env.VUDA_COOKIES_FILE),
    storageStatePath: resolveOptionalPath(env.VUDA_STORAGE_STATE_PATH),
    persistStorageState: enabled(env.VUDA_PERSIST_STORAGE_STATE),
  };
}

function parseCookies(value: string, source: string): SetCookieParam[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${source} must contain valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${source} must contain a JSON array of Playwright cookies`);
  }
  return parsed as SetCookieParam[];
}

export function loadConfiguredCookies(config: BrowserProviderConfig): SetCookieParam[] {
  const cookies: SetCookieParam[] = [];
  if (config.cookiesFile) {
    cookies.push(...parseCookies(fs.readFileSync(config.cookiesFile, 'utf8'), 'VUDA_COOKIES_FILE'));
  }
  if (config.cookiesJson) {
    cookies.push(...parseCookies(config.cookiesJson, 'VUDA_COOKIES_JSON'));
  }
  if (config.storageStatePath && fs.existsSync(config.storageStatePath)) {
    const state = JSON.parse(fs.readFileSync(config.storageStatePath, 'utf8')) as { cookies?: SetCookieParam[] };
    if (Array.isArray(state.cookies)) cookies.push(...state.cookies);
  }
  return cookies;
}

async function jsonResponse(response: Response, provider: string): Promise<any> {
  const text = await response.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${provider} returned a non-JSON response (${response.status})`);
  }
  if (!response.ok) {
    const message = body?.error?.message ?? body?.message ?? response.statusText;
    throw new Error(`${provider} session request failed (${response.status}): ${message}`);
  }
  return body;
}

export async function createRemoteSession(
  config: BrowserProviderConfig,
  fetchImpl: Fetch = fetch
): Promise<RemoteSession> {
  if (config.provider === 'cdp') {
    if (!config.cdpUrl) throw new Error('VUDA_CDP_URL is required when VUDA_BROWSER_PROVIDER=cdp');
    return { provider: 'cdp', cdpUrl: config.cdpUrl };
  }

  if (config.provider === 'browserbase') {
    if (!config.browserbaseApiKey) {
      throw new Error('BROWSERBASE_API_KEY is required when VUDA_BROWSER_PROVIDER=browserbase');
    }
    const requestBody: Record<string, unknown> = { ...config.browserbaseSession };
    if (config.browserbaseProjectId) requestBody.projectId = config.browserbaseProjectId;
    if (config.browserbaseContextId) {
      const existingBrowserSettings = requestBody.browserSettings;
      const browserSettings = existingBrowserSettings && !Array.isArray(existingBrowserSettings) && typeof existingBrowserSettings === 'object'
        ? { ...existingBrowserSettings as Record<string, unknown> }
        : {};
      const existingContext = browserSettings.context;
      const context = existingContext && !Array.isArray(existingContext) && typeof existingContext === 'object'
        ? { ...existingContext as Record<string, unknown> }
        : {};
      browserSettings.context = { ...context, id: config.browserbaseContextId, persist: true };
      requestBody.browserSettings = browserSettings;
    }
    const response = await fetchImpl('https://api.browserbase.com/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BB-API-Key': config.browserbaseApiKey,
      },
      body: JSON.stringify(requestBody),
    });
    const body = await jsonResponse(response, 'Browserbase');
    if (!body.id || !body.connectUrl) throw new Error('Browserbase response omitted id or connectUrl');
    return { provider: 'browserbase', sessionId: body.id, cdpUrl: body.connectUrl };
  }

  if (!config.anchorApiKey) {
    throw new Error('ANCHOR_API_KEY is required when VUDA_BROWSER_PROVIDER=anchor');
  }
  const response = await fetchImpl('https://api.anchorbrowser.io/v1/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anchor-api-key': config.anchorApiKey,
    },
    body: JSON.stringify(config.anchorSession),
  });
  const body = await jsonResponse(response, 'Anchor Browser');
  if (!body?.data?.id || !body?.data?.cdp_url) {
    throw new Error('Anchor Browser response omitted data.id or data.cdp_url');
  }
  return {
    provider: 'anchor',
    sessionId: body.data.id,
    cdpUrl: body.data.cdp_url,
    liveViewUrl: body.data.live_view_url,
  };
}

export async function releaseRemoteSession(
  config: BrowserProviderConfig,
  session: RemoteSession | null,
  fetchImpl: Fetch = fetch
): Promise<void> {
  if (!session?.sessionId) return;
  if (session.provider === 'browserbase' && config.browserbaseApiKey) {
    const response = await fetchImpl(`https://api.browserbase.com/v1/sessions/${session.sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BB-API-Key': config.browserbaseApiKey,
      },
      body: JSON.stringify({ status: 'REQUEST_RELEASE', ...(config.browserbaseProjectId ? { projectId: config.browserbaseProjectId } : {}) }),
    });
    await jsonResponse(response, 'Browserbase');
  }
  if (session.provider === 'anchor' && config.anchorApiKey) {
    const response = await fetchImpl(`https://api.anchorbrowser.io/v1/sessions/${session.sessionId}`, {
      method: 'DELETE',
      headers: { 'anchor-api-key': config.anchorApiKey },
    });
    await jsonResponse(response, 'Anchor Browser');
  }
}

export async function applyConfiguredCookies(
  context: BrowserContext,
  config: BrowserProviderConfig
): Promise<number> {
  const cookies = loadConfiguredCookies(config);
  if (cookies.length) await context.addCookies(cookies);
  return cookies.length;
}

export function browserProviderStatus(
  config: BrowserProviderConfig,
  session: RemoteSession | null,
  connected: boolean
) {
  return {
    provider: config.provider,
    connected,
    sessionId: session?.sessionId ?? null,
    liveViewAvailable: Boolean(session?.liveViewUrl),
    cookiesConfigured: Boolean(config.cookiesFile || config.cookiesJson),
    storageStateConfigured: Boolean(config.storageStatePath),
    persistentStorageState: config.persistStorageState,
  };
}
