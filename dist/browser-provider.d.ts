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
export declare function loadBrowserProviderConfig(env?: NodeJS.ProcessEnv, cwd?: string): BrowserProviderConfig;
export declare function loadConfiguredCookies(config: BrowserProviderConfig): SetCookieParam[];
export declare function createRemoteSession(config: BrowserProviderConfig, fetchImpl?: Fetch): Promise<RemoteSession>;
export declare function releaseRemoteSession(config: BrowserProviderConfig, session: RemoteSession | null, fetchImpl?: Fetch): Promise<void>;
export declare function applyConfiguredCookies(context: BrowserContext, config: BrowserProviderConfig): Promise<number>;
export declare function browserProviderStatus(config: BrowserProviderConfig, session: RemoteSession | null, connected: boolean): {
    provider: BrowserProvider;
    connected: boolean;
    sessionId: string;
    liveViewAvailable: boolean;
    cookiesConfigured: boolean;
    storageStateConfigured: boolean;
    persistentStorageState: boolean;
};
export {};
