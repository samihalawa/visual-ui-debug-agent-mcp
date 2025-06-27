#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { chromium, devices, request } from 'playwright';
import Jimp from 'jimp';
let TEMP_DIR = path.join(os.tmpdir(), 'ai-vision-debug');
const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads');
// Configurable timeout settings for better flexibility
const TIMEOUT_CONFIG = {
    // Default page and navigation timeouts (increased from 4000ms to 15000ms)
    DEFAULT_TIMEOUT: parseInt(process.env.VUDA_DEFAULT_TIMEOUT || '15000'),
    NAVIGATION_TIMEOUT: parseInt(process.env.VUDA_NAVIGATION_TIMEOUT || '15000'),
    // Element waiting timeouts (increased from 4000ms to 12000ms)
    SELECTOR_TIMEOUT: parseInt(process.env.VUDA_SELECTOR_TIMEOUT || '12000'),
    // Fixed waits for stability (increased from 3000ms to 5000ms)
    STABILITY_WAIT: parseInt(process.env.VUDA_STABILITY_WAIT || '5000'),
    // Quick waits for UI updates (kept reasonable)
    UI_UPDATE_WAIT: parseInt(process.env.VUDA_UI_UPDATE_WAIT || '1000'),
    // Performance monitoring threshold (increased from 4000ms)
    PERFORMANCE_THRESHOLD: parseInt(process.env.VUDA_PERFORMANCE_THRESHOLD || '15000'),
    // Small delays for element interactions
    INTERACTION_DELAY: parseInt(process.env.VUDA_INTERACTION_DELAY || '500'),
};
// Set up logging to a file instead of console
const logDir = path.join(os.tmpdir(), 'ai-vision-debug-logs');
try {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
}
catch (error) {
    console.error(`Failed to create directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    // Use fallback temporary directory
    const fallbackDir = path.join(os.tmpdir(), 'fallback-debug');
    try {
        fs.mkdirSync(fallbackDir, { recursive: true });
        TEMP_DIR = fallbackDir;
    }
    catch (fallbackError) {
        throw new Error(`Critical: Cannot create any temp directories: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
    }
}
const logFile = path.join(logDir, 'ai-vision-debug.log');
function logToFile(message) {
    try {
        fs.appendFileSync(logFile, `${new Date().toISOString()} - ${message}\n`);
    }
    catch (error) {
        console.error(`Failed to write to log file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
// Simple UUID generator
function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
// Initialize debug session
const debugSession = {
    currentUrl: null,
    lastScreenshotPath: null,
    debugHistory: []
};
// Browser Manager for proper resource cleanup
class BrowserManager {
    constructor() {
        this.browser = null;
        this.contexts = new Set();
        this.pages = new Set();
        this.apiContext = null;
    }
    async getBrowser() {
        if (!this.browser) {
            const { chromium } = await import('playwright');
            this.browser = await chromium.launch({ headless: true });
        }
        return this.browser;
    }
    async getContext() {
        const browser = await this.getBrowser();
        const context = await browser.newContext();
        this.contexts.add(context);
        return context;
    }
    async getPage() {
        const context = await this.getContext();
        const page = await context.newPage();
        this.pages.add(page);
        return page;
    }
    async cleanup() {
        // Close all pages
        for (const page of this.pages) {
            try {
                await page.close();
            }
            catch (error) {
                console.error('Error closing page:', error);
            }
        }
        this.pages.clear();
        // Close all contexts
        for (const context of this.contexts) {
            try {
                await context.close();
            }
            catch (error) {
                console.error('Error closing context:', error);
            }
        }
        this.contexts.clear();
        // Close browser
        if (this.browser) {
            try {
                await this.browser.close();
            }
            catch (error) {
                console.error('Error closing browser:', error);
            }
            this.browser = null;
        }
        // Close API context
        if (this.apiContext) {
            try {
                await this.apiContext.dispose();
            }
            catch (error) {
                console.error('Error disposing API context:', error);
            }
            this.apiContext = null;
        }
    }
}
// Global browser manager instance
const browserManager = new BrowserManager();
// Add cleanup handlers
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, cleaning up...');
    await browserManager.cleanup();
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('Received SIGINT, cleaning up...');
    await browserManager.cleanup();
    process.exit(0);
});
process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    await browserManager.cleanup();
    process.exit(1);
});
// Legacy compatibility - these will be removed in tool implementations
let browserInstance = null;
let browserContext = null;
let activePage = null;
let apiContext = null;
// Store console logs and screenshots for resource access
const consoleLogs = [];
const screenshots = new Map();
// Debug memory storage
const debugMemory = new Map();
const tunnelUrls = new Map();
// Add schema for enhanced page analyzer
const EnhancedPageAnalyzerSchema = z.object({
    url: z.string().describe("URL to analyze (e.g., http://localhost:4999, https://example.com)"),
    includeConsole: z.boolean().optional().default(true).describe("Whether to include console logs. Default: true"),
    mapElements: z.boolean().optional().default(true).describe("Whether to map interactive elements. Default: true"),
    fullPage: z.boolean().optional().default(false).describe("Whether to capture full page or just viewport. Default: false"),
    waitForSelector: z.string().optional().describe("Optional CSS selector to wait for before analysis"),
    device: z.string().optional().describe("Optional device to emulate (e.g., 'iPhone 13', 'Pixel 5')")
});
// Add schema for API endpoint tester
const ApiEndpointTesterSchema = z.object({
    url: z.string().describe("Base URL of the API (e.g., http://localhost:5000/api)"),
    endpoints: z.array(z.object({
        path: z.string().describe("Endpoint path (e.g., /users)"),
        method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).describe("HTTP method"),
        data: z.any().optional().describe("Request body data for POST/PUT"),
        headers: z.record(z.string()).optional().describe("Request headers")
    })).describe("List of endpoints to test"),
    authToken: z.string().optional().describe("Optional auth token to include in all requests")
});
// Add schema for navigation flow validator
const NavigationFlowValidatorSchema = z.object({
    startUrl: z.string().describe("URL to start the navigation flow from"),
    steps: z.array(z.object({
        action: z.enum(["click", "fill", "select", "hover", "wait", "navigate", "evaluate"]).describe("Action to perform"),
        selector: z.string().optional().describe("CSS selector for the element to interact with"),
        value: z.string().optional().describe("Value to input (for fill or select action)"),
        url: z.string().optional().describe("URL to navigate to (for navigate action)"),
        script: z.string().optional().describe("JavaScript to evaluate (for evaluate action)")
    })).describe("Sequence of steps to perform"),
    captureScreenshots: z.boolean().optional().default(true).describe("Whether to capture screenshots after each step. Default: true"),
    includeConsole: z.boolean().optional().default(true).describe("Whether to include console logs. Default: true"),
    device: z.string().optional().describe("Optional device to emulate (e.g., 'iPhone 13', 'Pixel 5')")
});
// Add schema for screenshot URL
const ScreenshotUrlSchema = z.object({
    url: z.string().describe("URL to capture a screenshot of (e.g., http://localhost:4999, https://example.com)"),
    fullPage: z.boolean().optional().default(false).describe("Whether to capture full page or just viewport. Default: false"),
    selector: z.string().optional().describe("Optional CSS selector to screenshot only that element"),
    waitForSelector: z.string().optional().describe("Optional CSS selector to wait for before taking screenshot"),
    device: z.string().optional().describe("Optional device to emulate (e.g., 'iPhone 13', 'Pixel 5')")
});
// Add schema for DOM inspection
const DomInspectorSchema = z.object({
    url: z.string().describe("URL to inspect (e.g., http://localhost:4999, https://example.com)"),
    selector: z.string().describe("CSS selector to inspect"),
    includeChildren: z.boolean().optional().default(false).describe("Whether to include children elements. Default: false"),
    includeStyles: z.boolean().optional().default(true).describe("Whether to include computed styles. Default: true")
});
// Add schema for console monitor
const ConsoleMonitorSchema = z.object({
    url: z.string().describe("URL to monitor console logs from"),
    filterTypes: z.array(z.enum(["log", "info", "warning", "error"])).optional().describe("Types of console messages to capture"),
    duration: z.number().optional().describe("How long to monitor in milliseconds. Default: 5000 (configurable via VUDA_STABILITY_WAIT)"),
    interactionSelector: z.string().optional().describe("Optional element to click before monitoring")
});
// Add schema for accessibility check
const AccessibilityCheckSchema = z.object({
    url: z.string().describe("URL to check for accessibility issues"),
    standard: z.enum(["WCAG2A", "WCAG2AA", "WCAG2AAA"]).optional().describe("Accessibility standard to check against. Default: WCAG2AA"),
    includeScreenshot: z.boolean().optional().describe("Whether to include a screenshot with issues highlighted. Default: true")
});
// Add schema for performance analysis
const PerformanceAnalysisSchema = z.object({
    url: z.string().describe("URL to analyze performance for"),
    iterations: z.number().optional().describe("Number of test iterations to run. Default: 1"),
    waitForNetworkIdle: z.boolean().optional().describe("Whether to wait for network to be idle. Default: true"),
    device: z.string().optional().describe("Optional device to emulate (e.g., 'iPhone 13', 'Pixel 5')")
});
// Add schema for visual comparison
const VisualComparisonSchema = z.object({
    url1: z.string().describe("First URL to compare"),
    url2: z.string().describe("Second URL to compare"),
    threshold: z.number().optional().describe("Difference threshold (0.0-1.0). Default: 0.1"),
    fullPage: z.boolean().optional().describe("Whether to capture full page. Default: false"),
    selector: z.string().optional().describe("Optional CSS selector to limit comparison")
});
// <<< START INSERTION: UI Workflow Validator Schema >>>
const UIWorkflowValidatorSchema = z.object({
    startUrl: z.string().url().describe("Initial URL for the workflow"),
    taskDescription: z.string().describe("High-level description of the user task being simulated"),
    steps: z.array(z.object({
        description: z.string().describe("Description of the user action for this step"),
        action: z.enum([
            "navigate", "click", "fill", "select", "hover", "wait", "evaluate", "screenshot",
            "verifyText", "verifyElementVisible", "verifyElementNotVisible", "verifyUrl"
        ]).describe("Playwright action or verification to perform"),
        selector: z.string().optional().describe("CSS selector for interaction or verification"),
        value: z.string().optional().describe("Value for fill/select or text/URL to verify"),
        url: z.string().optional().describe("URL for navigate action or verification"),
        script: z.string().optional().describe("JavaScript for evaluate action"),
        isOptional: z.boolean().optional().default(false).describe("If true, failure of this step won't stop the workflow")
    })).min(1).describe("Sequence of steps representing the user workflow (minimum 1 step)"),
    captureScreenshots: z.enum(["all", "failure", "none"]).optional().default("failure").describe("When to capture screenshots"),
    device: z.string().optional().describe("Optional device to emulate (e.g., 'iPhone 13', 'Pixel 5')")
});
// <<< END INSERTION: UI Workflow Validator Schema >>>
// Add schema for tunnel helper
const TunnelHelperSchema = z.object({
    localPort: z.number().describe("Local port number to expose (e.g., 3000, 8080)"),
    action: z.enum(["guide", "store", "retrieve"]).describe("Action to perform: 'guide' shows instructions, 'store' saves tunnel URL, 'retrieve' gets saved URL"),
    tunnelUrl: z.string().optional().describe("Tunnel URL to store (only for 'store' action)")
});
// Add schema for batch screenshot URLs
const BatchScreenshotUrlsSchema = z.object({
    urls: z.array(z.string()).describe("Array of URLs to capture screenshots of"),
    fullPage: z.boolean().optional().default(false).describe("Whether to capture full page or just viewport. Default: false"),
    gridSize: z.number().optional().default(2).describe("Number of screenshots per row in the grid layout. Default: 2"),
    device: z.string().optional().describe("Optional device to emulate (e.g., 'iPhone 13', 'Pixel 5')")
});
// Add schema for debug memory
const DebugMemorySchema = z.object({
    action: z.enum(["save", "retrieve", "list", "clear"]).describe("Memory action to perform"),
    key: z.string().optional().describe("Memory key for save/retrieve operations"),
    value: z.any().optional().describe("Value to save (for 'save' action)"),
    category: z.enum(["env", "urls", "selectors", "issues", "fixes", "general"]).optional().describe("Category of memory item")
});
// Create a class to manage the debug state and tools
class AIVisionDebugServer {
    constructor() {
        this.server = new Server({
            name: 'ai-vision-debug',
            version: '1.0.0',
        }, {
            capabilities: {
                resources: { listChanged: true },
                tools: { listChanged: true },
            },
        });
        this.setupRequestHandlers();
        this.server.onerror = (error) => logToFile(`[MCP Error] ${error}`);
        process.on('SIGINT', async () => {
            await this.cleanup();
            process.exit(0);
        });
    }
    async cleanup() {
        try {
            if (activePage) {
                await activePage.close().catch(() => { });
                activePage = null;
            }
            if (browserContext) {
                await browserContext.close().catch(() => { });
                browserContext = null;
            }
            if (browserInstance) {
                await browserInstance.close().catch(() => { });
                browserInstance = null;
            }
            if (apiContext) {
                await apiContext.dispose().catch(() => { });
                apiContext = null;
            }
            await this.server.close();
        }
        catch (error) {
            logToFile(`Cleanup error: ${error}`);
        }
    }
    /**
     * Ensure browser is initialized
     */
    async ensureBrowser(viewportWidth = 1280, viewportHeight = 800, deviceName) {
        try {
            if (!browserInstance) {
                logToFile('Initializing browser...');
                browserInstance = await chromium.launch({
                    headless: true
                });
            }
            // Always create a new context with the specified settings
            if (browserContext) {
                await browserContext.close().catch(() => { });
            }
            const contextOptions = {};
            if (deviceName && devices[deviceName]) {
                contextOptions.userAgent = devices[deviceName].userAgent;
                contextOptions.viewport = devices[deviceName].viewport;
                contextOptions.deviceScaleFactor = devices[deviceName].deviceScaleFactor;
                contextOptions.isMobile = devices[deviceName].isMobile;
                contextOptions.hasTouch = devices[deviceName].hasTouch;
            }
            else {
                contextOptions.viewport = { width: viewportWidth, height: viewportHeight };
                contextOptions.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36';
            }
            browserContext = await browserInstance.newContext(contextOptions);
            // Create a new page
            if (activePage) {
                await activePage.close().catch(() => { });
            }
            activePage = await browserContext.newPage();
            // Set default timeout using configurable values for better flexibility
            activePage.setDefaultTimeout(TIMEOUT_CONFIG.DEFAULT_TIMEOUT);
            activePage.setDefaultNavigationTimeout(TIMEOUT_CONFIG.NAVIGATION_TIMEOUT);
            // Set up console logging
            activePage.on('console', (message) => {
                const logEntry = `[${message.type()}] ${message.text()}`;
                consoleLogs.push(logEntry);
            });
            return activePage;
        }
        catch (error) {
            logToFile(`Error ensuring browser: ${error}`);
            throw error;
        }
    }
    /**
     * Ensure API context is initialized
     */
    async ensureApiContext(baseUrl) {
        try {
            if (!apiContext) {
                const options = {};
                if (baseUrl) {
                    options.baseURL = baseUrl;
                }
                apiContext = await request.newContext(options);
            }
            return apiContext;
        }
        catch (error) {
            logToFile(`Error ensuring API context: ${error}`);
            throw error;
        }
    }
    /**
     * Take a screenshot of a URL using Playwright
     */
    async screenshotUrl(url, fullPage = false, selector, waitForSelector, deviceName) {
        try {
            logToFile(`Taking screenshot of URL: ${url}`);
            // Ensure browser is initialized with proper viewport
            const page = await this.ensureBrowser(1280, 800, deviceName);
            // Navigate to the URL with configurable timeout
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: TIMEOUT_CONFIG.NAVIGATION_TIMEOUT
            });
            // Wait for specified time
            await page.waitForTimeout(TIMEOUT_CONFIG.STABILITY_WAIT); // Configurable stability wait
            // Wait for selector if specified
            if (waitForSelector) {
                await page.waitForSelector(waitForSelector, { timeout: TIMEOUT_CONFIG.SELECTOR_TIMEOUT });
            }
            // Generate a UUID for the file
            const fileUuid = randomUUID();
            const screenshotPath = path.join(TEMP_DIR, `screenshot_${fileUuid}.png`);
            // Take the screenshot
            if (selector) {
                const element = await page.$(selector);
                if (!element) {
                    throw new Error(`Element not found: ${selector}`);
                }
                await element.screenshot({ path: screenshotPath });
            }
            else {
                await page.screenshot({
                    path: screenshotPath,
                    fullPage: fullPage
                });
            }
            // Get the base64 data of the screenshot
            const buffer = await fsPromises.readFile(screenshotPath);
            const base64Data = buffer.toString('base64');
            // Update the debug session
            debugSession.currentUrl = url;
            debugSession.lastScreenshotPath = screenshotPath;
            debugSession.debugHistory.push(`Screenshot taken of ${url}`);
            // Add to screenshots collection for resource access
            const screenshotName = `Screenshot_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            screenshots.set(screenshotName, base64Data);
            logToFile(`Screenshot saved to ${screenshotPath}`);
            return { path: screenshotPath, fileUuid, base64Data };
        }
        catch (error) {
            logToFile(`Error taking screenshot: ${error}`);
            throw new Error(`Failed to take screenshot of URL ${url}: ${error.message}`);
        }
    }
    /**
     * Enhanced Page Analyzer tool that combines screenshot, console logs, and interactive element mapping
     */
    async enhancedPageAnalyzer(url, includeConsole = true, mapElements = true, fullPage = false, waitForSelector, deviceName) {
        try {
            logToFile(`Analyzing page: ${url}`);
            // Ensure browser is initialized with proper viewport
            const page = await this.ensureBrowser(1280, 800, deviceName);
            let consoleMessages = [];
            // Capture console output if requested
            if (includeConsole) {
                const originalConsoleLog = console.log;
                page.on('console', (message) => {
                    consoleMessages.push({
                        type: message.type(),
                        text: message.text(),
                        location: {
                            url: message.location()?.url,
                            lineNumber: message.location()?.lineNumber,
                            columnNumber: message.location()?.columnNumber
                        }
                    });
                });
            }
            // Measure page load time and capture resource information
            const resourcesRequested = new Set();
            const resourcesFailed = new Set();
            const resourcesReceived = new Set();
            page.on('request', (request) => resourcesRequested.add(request.url()));
            page.on('requestfailed', (request) => resourcesFailed.add(request.url()));
            page.on('response', (response) => {
                const status = response.status();
                const url = response.url();
                if (status >= 400) {
                    resourcesFailed.add(`${url} (${status})`);
                }
                else {
                    resourcesReceived.add(url);
                }
            });
            // Measure page load time
            const startTime = Date.now();
            // Navigate to the URL with configurable timeout
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: TIMEOUT_CONFIG.NAVIGATION_TIMEOUT
            });
            const loadTime = Date.now() - startTime;
            // Wait for specified time
            await page.waitForTimeout(TIMEOUT_CONFIG.STABILITY_WAIT); // Configurable stability wait
            // Wait for selector if specified
            if (waitForSelector) {
                await page.waitForSelector(waitForSelector, { timeout: TIMEOUT_CONFIG.SELECTOR_TIMEOUT });
            }
            // Get page title
            const title = await page.title();
            // Generate a UUID for the file
            const fileUuid = randomUUID();
            const screenshotPath = path.join(TEMP_DIR, `analysis_${fileUuid}.png`);
            // Take the screenshot
            await page.screenshot({
                path: screenshotPath,
                fullPage: fullPage
            });
            // Get the base64 data of the screenshot
            const buffer = await fsPromises.readFile(screenshotPath);
            const base64Data = buffer.toString('base64');
            // Collect performance metrics
            const performanceMetrics = await page.evaluate(() => {
                const performance = window.performance;
                if (!performance)
                    return null;
                const timing = performance.timing || {};
                const memory = performance.memory || {};
                const navigation = performance.navigation || {};
                // Get important timing measures
                const pageLoadTime = timing.loadEventEnd - timing.navigationStart;
                const dnsLookupTime = timing.domainLookupEnd - timing.domainLookupStart;
                const tcpConnectionTime = timing.connectEnd - timing.connectStart;
                const serverResponseTime = timing.responseEnd - timing.requestStart;
                const domInteractive = timing.domInteractive - timing.navigationStart;
                const domContentLoaded = timing.domContentLoadedEventEnd - timing.navigationStart;
                // Get resource performance entries if available
                let resources = [];
                try {
                    resources = performance.getEntriesByType('resource').map(entry => {
                        const e = entry;
                        return {
                            name: e.name,
                            entryType: e.entryType,
                            startTime: e.startTime,
                            duration: e.duration,
                            initiatorType: e.initiatorType,
                            transferSize: e.transferSize,
                            encodedBodySize: e.encodedBodySize,
                            decodedBodySize: e.decodedBodySize
                        };
                    });
                }
                catch (e) {
                    // Ignore if not available
                }
                return {
                    pageLoadTime,
                    dnsLookupTime,
                    tcpConnectionTime,
                    serverResponseTime,
                    domInteractive,
                    domContentLoaded,
                    redirectCount: navigation.redirectCount,
                    navigationType: navigation.type,
                    memory: {
                        jsHeapSizeLimit: memory.jsHeapSizeLimit,
                        totalJSHeapSize: memory.totalJSHeapSize,
                        usedJSHeapSize: memory.usedJSHeapSize
                    },
                    resources: resources.slice(0, 20) // Limit to first 20 resources to avoid excessive data
                };
            });
            let interactiveElements = [];
            let annotatedScreenshot;
            // Map interactive elements if requested
            if (mapElements) {
                interactiveElements = await page.evaluate(() => {
                    function isVisible(element) {
                        if (!element.getBoundingClientRect)
                            return false;
                        const rect = element.getBoundingClientRect();
                        return (rect.width > 0 &&
                            rect.height > 0 &&
                            window.getComputedStyle(element).visibility !== 'hidden' &&
                            window.getComputedStyle(element).display !== 'none');
                    }
                    function getElementPath(element) {
                        if (!element)
                            return '';
                        if (element === document.body)
                            return 'body';
                        if (element === document.documentElement)
                            return 'html';
                        let path = element.tagName.toLowerCase();
                        if (element.id) {
                            path += `#${element.id}`;
                        }
                        else if (element.className && typeof element.className === 'string') {
                            path += `.${element.className.trim().replace(/\s+/g, '.')}`;
                        }
                        return `${getElementPath(element.parentElement)} > ${path}`;
                    }
                    // Find interactive elements
                    const interactiveElements = [];
                    let index = 0;
                    // Helper function to collect interactive elements
                    function collectElements(element) {
                        // Check if element is interactive
                        const tagName = element.tagName.toLowerCase();
                        const isButton = tagName === 'button' ||
                            (tagName === 'input' && element.type === 'button') ||
                            (tagName === 'input' && element.type === 'submit');
                        const isLink = tagName === 'a' && element.href;
                        const hasClickListener = element.hasAttribute('onclick') ||
                            element.hasAttribute('ng-click') ||
                            element.hasAttribute('@click');
                        const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
                        if ((isButton || isLink || hasClickListener || isInput) && isVisible(element)) {
                            const rect = element.getBoundingClientRect();
                            let text = '';
                            if (element.textContent) {
                                text = element.textContent.trim().substring(0, 50);
                            }
                            let type = 'unknown';
                            if (isButton)
                                type = 'button';
                            else if (isLink)
                                type = 'link';
                            else if (isInput)
                                type = 'input';
                            else if (hasClickListener)
                                type = 'clickable';
                            interactiveElements.push({
                                index: ++index,
                                tagName,
                                id: element.id || '',
                                className: typeof element.className === 'string' ? element.className : '',
                                text,
                                bounds: {
                                    x: rect.left,
                                    y: rect.top,
                                    width: rect.width,
                                    height: rect.height,
                                },
                                path: getElementPath(element),
                                visible: isVisible(element),
                                type
                            });
                        }
                        // Process children
                        for (const child of Array.from(element.children)) {
                            collectElements(child);
                        }
                    }
                    // Start from body
                    collectElements(document.body);
                    return interactiveElements;
                });
                // Create annotated screenshot with numbered interactive elements
                if (interactiveElements.length > 0) {
                    try {
                        const image = await Jimp.read(screenshotPath);
                        const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
                        // Draw numbered boxes around interactive elements
                        for (const element of interactiveElements) {
                            const { x, y, width, height } = element.bounds;
                            // Draw rectangle
                            for (let i = 0; i < width; i++) {
                                if (x + i < image.getWidth()) {
                                    if (y < image.getHeight())
                                        image.setPixelColor(0xFF0000FF, x + i, y); // Top
                                    if (y + height - 1 < image.getHeight())
                                        image.setPixelColor(0xFF0000FF, x + i, y + height - 1); // Bottom
                                }
                            }
                            for (let i = 0; i < height; i++) {
                                if (y + i < image.getHeight()) {
                                    if (x < image.getWidth())
                                        image.setPixelColor(0xFF0000FF, x, y + i); // Left
                                    if (x + width - 1 < image.getWidth())
                                        image.setPixelColor(0xFF0000FF, x + width - 1, y + i); // Right
                                }
                            }
                            // Draw label background (small square)
                            for (let i = 0; i < 20; i++) {
                                for (let j = 0; j < 20; j++) {
                                    if (x + i < image.getWidth() && y + j < image.getHeight()) {
                                        image.setPixelColor(0xFF0000FF, x + i, y + j);
                                    }
                                }
                            }
                            // Print element index
                            if (x + 5 < image.getWidth() && y + 2 < image.getHeight()) {
                                image.print(font, x + 5, y + 2, element.index.toString());
                            }
                        }
                        const annotatedPath = path.join(TEMP_DIR, `annotated_${fileUuid}.png`);
                        await image.writeAsync(annotatedPath);
                        const annotatedBuffer = await fsPromises.readFile(annotatedPath);
                        annotatedScreenshot = {
                            path: annotatedPath,
                            base64Data: annotatedBuffer.toString('base64')
                        };
                        // Add to screenshots collection for resource access
                        const annotatedName = `Annotated_${new Date().toISOString().replace(/[:.]/g, '-')}`;
                        screenshots.set(annotatedName, annotatedScreenshot.base64Data);
                    }
                    catch (error) {
                        logToFile(`Error creating annotated screenshot: ${error}`);
                        // Continue without annotated screenshot
                    }
                }
            }
            // Run a basic accessibility check
            const accessibilityViolations = await page.evaluate(() => {
                // Simple accessibility checks we can run directly
                const violations = [];
                // Check for images without alt attributes
                const imagesWithoutAlt = document.querySelectorAll('img:not([alt])');
                if (imagesWithoutAlt.length > 0) {
                    violations.push({
                        rule: 'Images must have alt attributes',
                        elements: Array.from(imagesWithoutAlt).map(el => ({
                            html: el.outerHTML.substring(0, 100),
                            location: el.getBoundingClientRect()
                        })).slice(0, 5) // Limit to 5 examples
                    });
                }
                // Check for insufficient color contrast (basic check)
                const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, button, label');
                const lowContrastElements = [];
                for (const el of Array.from(textElements)) {
                    const style = window.getComputedStyle(el);
                    const bgColor = style.backgroundColor;
                    const color = style.color;
                    // This is a very basic check - a real implementation would calculate actual contrast ratios
                    if (bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)') {
                        continue; // Skip elements with transparent backgrounds
                    }
                    if (color === bgColor) {
                        lowContrastElements.push({
                            html: el.outerHTML.substring(0, 100),
                            location: el.getBoundingClientRect(),
                            foreground: color,
                            background: bgColor
                        });
                    }
                }
                if (lowContrastElements.length > 0) {
                    violations.push({
                        rule: 'Text should have sufficient contrast with its background',
                        elements: lowContrastElements.slice(0, 5) // Limit to 5 examples
                    });
                }
                // Check for missing form labels
                const inputsWithoutLabels = [];
                const inputs = document.querySelectorAll('input, select, textarea');
                for (const input of Array.from(inputs)) {
                    const id = input.id;
                    if (!id) {
                        inputsWithoutLabels.push({
                            html: input.outerHTML.substring(0, 100),
                            location: input.getBoundingClientRect()
                        });
                        continue;
                    }
                    const label = document.querySelector(`label[for="${id}"]`);
                    if (!label) {
                        inputsWithoutLabels.push({
                            html: input.outerHTML.substring(0, 100),
                            location: input.getBoundingClientRect()
                        });
                    }
                }
                if (inputsWithoutLabels.length > 0) {
                    violations.push({
                        rule: 'Form inputs should have associated labels',
                        elements: inputsWithoutLabels.slice(0, 5) // Limit to 5 examples
                    });
                }
                // Check for missing lang attribute
                if (!document.documentElement.hasAttribute('lang')) {
                    violations.push({
                        rule: 'HTML element should have a lang attribute',
                        elements: [{
                                html: document.documentElement.outerHTML.substring(0, 100)
                            }]
                    });
                }
                return violations;
            });
            // Add to screenshots collection for resource access
            const screenshotName = `Screenshot_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            screenshots.set(screenshotName, base64Data);
            // Return the results
            return {
                screenshot: { path: screenshotPath, base64Data },
                annotatedScreenshot,
                consoleMessages: includeConsole ? consoleMessages : undefined,
                interactiveElements: mapElements ? interactiveElements : undefined,
                accessibility: accessibilityViolations,
                performance: performanceMetrics,
                pageInfo: {
                    title,
                    url: page.url(),
                    loadTime,
                    resources: {
                        requested: Array.from(resourcesRequested).slice(0, 20),
                        failed: Array.from(resourcesFailed),
                        received: Array.from(resourcesReceived).slice(0, 20)
                    }
                }
            };
        }
        catch (error) {
            logToFile(`Error analyzing page: ${error}`);
            throw new Error(`Failed to analyze page ${url}: ${error.message}`);
        }
    }
    /**
     * API Endpoint Tester tool
     */
    async testApiEndpoints(baseUrl, endpoints, authToken) {
        try {
            logToFile(`Testing API endpoints at base URL: ${baseUrl}`);
            // Ensure API context
            const apiContext = await this.ensureApiContext(baseUrl);
            const results = [];
            // Process each endpoint
            for (const endpoint of endpoints) {
                try {
                    const fullUrl = endpoint.path.startsWith('http')
                        ? endpoint.path
                        : new URL(endpoint.path, baseUrl).toString();
                    logToFile(`Testing endpoint: ${endpoint.method} ${fullUrl}`);
                    const startTime = Date.now();
                    // Prepare headers
                    const headers = {
                        'Content-Type': 'application/json',
                        ...endpoint.headers
                    };
                    // Add auth token if provided
                    if (authToken) {
                        headers['Authorization'] = `Bearer ${authToken}`;
                    }
                    // Process request body for non-GET requests
                    let requestBody = null;
                    if (endpoint.data) {
                        requestBody = typeof endpoint.data === 'object'
                            ? JSON.stringify(endpoint.data)
                            : endpoint.data;
                    }
                    // Make the request
                    const requestOptions = {
                        method: endpoint.method,
                        headers
                    };
                    if (requestBody && endpoint.method !== 'GET') {
                        requestOptions.data = requestBody;
                    }
                    const response = await apiContext.fetch(endpoint.path, requestOptions);
                    const responseTime = Date.now() - startTime;
                    // Parse response data
                    let responseData;
                    let responseText = '';
                    try {
                        responseText = await response.text();
                        responseData = responseText ? JSON.parse(responseText) : null;
                    }
                    catch (e) {
                        // Response wasn't JSON
                        responseData = responseText || null;
                    }
                    // Add to results
                    results.push({
                        endpoint: endpoint.path,
                        method: endpoint.method,
                        status: response.status(),
                        responseTime,
                        responseData,
                        requestHeaders: headers,
                        requestBody
                    });
                }
                catch (error) {
                    // Handle errors for this endpoint
                    results.push({
                        endpoint: endpoint.path,
                        method: endpoint.method,
                        status: 0,
                        responseTime: 0,
                        error: error.message,
                        requestHeaders: endpoint.headers,
                        requestBody: endpoint.data
                    });
                }
            }
            // Calculate success rate and average response time
            const successfulRequests = results.filter(r => r.status >= 200 && r.status < 300).length;
            const successRate = (successfulRequests / results.length) * 100;
            const totalResponseTime = results.reduce((total, r) => total + r.responseTime, 0);
            const averageResponseTime = results.length > 0 ? totalResponseTime / results.length : 0;
            // Analyze errors by type
            const errorSummary = {
                serverErrors: results.filter(r => r.status >= 500 && r.status < 600).length,
                clientErrors: results.filter(r => r.status >= 400 && r.status < 500).length,
                connectionErrors: results.filter(r => r.status === 0).length,
                responseTimeouts: results.filter(r => r.responseTime > TIMEOUT_CONFIG.PERFORMANCE_THRESHOLD).length,
            };
            logToFile(`API testing completed with ${successfulRequests}/${results.length} successful endpoints`);
            return {
                results,
                successRate,
                averageResponseTime,
                errorSummary
            };
        }
        catch (error) {
            logToFile(`Error testing API endpoints: ${error}`);
            throw new Error(`Failed to test API endpoints: ${error.message}`);
        }
    }
    /**
     * Navigation Flow Validator tool
     */
    async validateNavigationFlow(startUrl, steps, captureScreenshots = true, includeConsole = true, deviceName) {
        try {
            logToFile(`Validating navigation flow starting at: ${startUrl}`);
            // Ensure browser is initialized with proper viewport
            const page = await this.ensureBrowser(1280, 800, deviceName);
            let consoleMessages = [];
            // Capture console output if requested
            if (includeConsole) {
                page.on('console', (message) => {
                    consoleMessages.push({
                        type: message.type(),
                        text: message.text(),
                        location: {
                            url: message.location()?.url,
                            lineNumber: message.location()?.lineNumber,
                            columnNumber: message.location()?.columnNumber
                        }
                    });
                });
            }
            // Navigate to the starting URL
            await page.goto(startUrl, { waitUntil: 'networkidle' });
            // Initialize results
            const stepResults = [];
            // Track overall success
            let overallSuccess = true;
            // Process each step
            for (const [index, currentStep] of steps.entries()) {
                const stepNumber = index + 1;
                consoleMessages = [];
                try {
                    // Log step
                    logToFile(`Executing step ${stepNumber}: ${currentStep.action}`);
                    // Fix variable declarations at the beginning of the try block in validateNavigationFlow
                    let success = false;
                    // Declare stepEvaluationResult outside the switch statement to use it later in the code
                    let stepEvaluationResult;
                    // Perform action based on step type
                    switch (currentStep.action) {
                        case 'click':
                            if (!currentStep.selector)
                                throw new Error('Selector is required for click action');
                            await page.click(currentStep.selector);
                            stepEvaluationResult = true;
                            success = true;
                            break;
                        case 'fill':
                            if (!currentStep.selector)
                                throw new Error('Selector is required for fill action');
                            if (!currentStep.value)
                                throw new Error('Value is required for fill action');
                            await page.fill(currentStep.selector, currentStep.value);
                            success = true;
                            break;
                        case 'select':
                            if (!currentStep.selector)
                                throw new Error('Selector is required for select action');
                            if (!currentStep.value)
                                throw new Error('Value is required for select action');
                            await page.selectOption(currentStep.selector, currentStep.value);
                            success = true;
                            break;
                        case 'hover':
                            if (!currentStep.selector)
                                throw new Error('Selector is required for hover action');
                            await page.hover(currentStep.selector);
                            success = true;
                            break;
                        case 'wait':
                            await page.waitForTimeout(TIMEOUT_CONFIG.STABILITY_WAIT); // Configurable stability wait
                            success = true;
                            break;
                        case 'navigate':
                            if (!currentStep.url)
                                throw new Error('URL is required for navigate action');
                            await page.goto(currentStep.url, {
                                waitUntil: 'domcontentloaded',
                                timeout: TIMEOUT_CONFIG.NAVIGATION_TIMEOUT
                            });
                            success = true;
                            break;
                        case 'evaluate':
                            if (!currentStep.script)
                                throw new Error('Script is required for evaluate action');
                            const evaluationResult = await page.evaluate(currentStep.script);
                            // Store the evaluation result for inclusion in the step result
                            stepEvaluationResult = evaluationResult;
                            success = true;
                            break;
                        default:
                            throw new Error(`Unknown action: ${currentStep.action}`);
                    }
                    // Wait for any potential navigation or Ajax calls
                    await page.waitForTimeout(TIMEOUT_CONFIG.STABILITY_WAIT);
                    // Capture screenshot if requested
                    let screenshotPath, screenshotBase64;
                    if (captureScreenshots) {
                        const fileUuid = randomUUID();
                        screenshotPath = path.join(TEMP_DIR, `step_${stepNumber}_${fileUuid}.png`);
                        await page.screenshot({ path: screenshotPath });
                        const buffer = await fsPromises.readFile(screenshotPath);
                        screenshotBase64 = buffer.toString('base64');
                        // Add to screenshots collection for resource access
                        const screenshotName = `Step_${stepNumber}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
                        screenshots.set(screenshotName, screenshotBase64);
                    }
                    // Add to results
                    stepResults.push({
                        stepNumber,
                        action: currentStep.action,
                        success,
                        screenshotPath: screenshotPath || undefined,
                        screenshotBase64: screenshotBase64 || undefined,
                        consoleMessages,
                        url: await page.url(),
                        selector: currentStep.selector,
                        value: currentStep.value,
                        evaluationResult: stepEvaluationResult
                    });
                }
                catch (error) {
                    // Handle error and add failed step to results array
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    logToFile(`Step ${stepNumber} failed: ${errorMessage}`);
                    stepResults.push({
                        stepNumber,
                        action: currentStep.action,
                        success: false,
                        error: errorMessage,
                        url: await page.url(),
                        selector: currentStep.selector,
                        value: currentStep.value
                    });
                    // Stop execution on failure
                    overallSuccess = false;
                    break;
                }
            }
            logToFile(`Navigation flow validation completed with ${overallSuccess ? 'success' : 'failure'}`);
            return {
                success: overallSuccess,
                steps: stepResults
            };
        }
        catch (error) {
            logToFile(`Error validating navigation flow: ${error}`);
            throw new Error(`Failed to validate navigation flow: ${error.message}`);
        }
    }
    /**
     * Batch Screenshot URLs tool
     */
    async batchScreenshotUrls(urls, fullPage = false, gridSize = 2, deviceName) {
        try {
            logToFile(`Taking batch screenshots of ${urls.length} URLs`);
            const screenshots = [];
            // Take individual screenshots
            for (const url of urls) {
                try {
                    const screenshot = await this.screenshotUrl(url, fullPage, undefined, undefined, deviceName);
                    screenshots.push({
                        url,
                        path: screenshot.path,
                        base64Data: screenshot.base64Data
                    });
                }
                catch (error) {
                    logToFile(`Error taking screenshot of ${url}: ${error.message}`);
                    screenshots.push({
                        url,
                        path: '',
                        base64Data: '',
                        error: error.message
                    });
                }
            }
            // Create grid layout if we have successful screenshots
            const successfulScreenshots = screenshots.filter(s => !s.error);
            let gridImagePath;
            let gridImageBase64;
            if (successfulScreenshots.length > 1) {
                try {
                    // Create a simple grid layout using HTML and then screenshot it
                    const gridHtml = this.createGridHtml(successfulScreenshots, gridSize);
                    const gridPage = await browserInstance.newPage();
                    try {
                        await gridPage.setContent(gridHtml);
                        await gridPage.waitForTimeout(TIMEOUT_CONFIG.UI_UPDATE_WAIT); // Wait for images to load
                        const gridScreenshot = await gridPage.screenshot({
                            fullPage: true,
                            type: 'png'
                        });
                        const gridFileUuid = generateUuid();
                        gridImagePath = path.join(process.cwd(), `grid_screenshot_${gridFileUuid}.png`);
                        fs.writeFileSync(gridImagePath, gridScreenshot);
                        gridImageBase64 = gridScreenshot.toString('base64');
                    }
                    finally {
                        await gridPage.close();
                    }
                }
                catch (error) {
                    logToFile(`Error creating grid layout: ${error.message}`);
                }
            }
            return {
                screenshots,
                gridImagePath,
                gridImageBase64
            };
        }
        catch (error) {
            logToFile(`Error in batch screenshot: ${error.message}`);
            throw error;
        }
    }
    createGridHtml(screenshots, gridSize) {
        const gridItems = screenshots.map(screenshot => `
      <div class="grid-item">
        <img src="data:image/png;base64,${screenshot.base64Data}" alt="Screenshot" />
        <div class="url-label">${screenshot.url}</div>
      </div>
    `).join('');
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { 
            margin: 20px; 
            font-family: Arial, sans-serif; 
            background: white;
          }
          .grid-container {
            display: grid;
            grid-template-columns: repeat(${gridSize}, 1fr);
            gap: 20px;
            max-width: 1200px;
          }
          .grid-item {
            border: 2px solid #ddd;
            border-radius: 8px;
            overflow: hidden;
            background: white;
          }
          .grid-item img {
            width: 100%;
            height: auto;
            display: block;
          }
          .url-label {
            padding: 10px;
            background: #f5f5f5;
            font-size: 12px;
            word-break: break-all;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="grid-container">
          ${gridItems}
        </div>
      </body>
      </html>
    `;
    }
    /**
     * DOM Inspector tool
     */
    async inspectDomElement(url, selector, includeChildren = false, includeStyles = true) {
        try {
            logToFile(`Inspecting DOM element: ${selector} at ${url}`);
            // Ensure browser is initialized
            const page = await this.ensureBrowser();
            // Navigate to the URL with configurable timeout
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: TIMEOUT_CONFIG.NAVIGATION_TIMEOUT
            });
            // Wait for specified time
            await page.waitForTimeout(TIMEOUT_CONFIG.STABILITY_WAIT); // Configurable stability wait
            // Check if element exists
            const elementHandle = await page.$(selector);
            if (!elementHandle) {
                throw new Error(`Element not found: ${selector}`);
            }
            // Get element details using a type safe approach
            const elementInfo = await page.evaluate(
            // Explicitly define the function signature expecting a single object
            (args) => {
                const { selector, includeChildren, includeStyles } = args;
                const element = document.querySelector(selector);
                if (!element)
                    return null;
                const attributes = {};
                for (const attr of Array.from(element.attributes)) {
                    attributes[attr.name] = attr.value;
                }
                // Get computed styles if requested
                let computedStyles;
                if (includeStyles) {
                    computedStyles = {};
                    const styles = window.getComputedStyle(element);
                    for (const style of Array.from(styles)) {
                        computedStyles[style] = styles.getPropertyValue(style);
                    }
                }
                // Get children if requested
                let children;
                if (includeChildren) {
                    children = Array.from(element.children).map(child => {
                        // Get child attributes
                        const childAttributes = {};
                        if (child.attributes) {
                            for (const attr of Array.from(child.attributes)) {
                                childAttributes[attr.name] = attr.value;
                            }
                        }
                        return {
                            tagName: child.tagName,
                            id: child.id || '',
                            className: typeof child.className === 'string' ? child.className : '',
                            attributes: childAttributes,
                            textContent: child.textContent ? child.textContent.trim() : '',
                            html: child.outerHTML
                        };
                    });
                }
                // Get element bounds
                const bounds = element.getBoundingClientRect();
                // Basic accessibility info
                const accessibility = {
                    ariaLabel: element.getAttribute('aria-label') || '',
                    ariaRole: element.getAttribute('role') || '',
                    tabIndex: element.getAttribute('tabindex') || '',
                    hasKeyboardFocus: element === document.activeElement
                };
                return {
                    tagName: element.tagName,
                    id: element.id || '',
                    className: typeof element.className === 'string' ? element.className : '',
                    attributes,
                    textContent: element.textContent ? element.textContent.trim() : '',
                    html: element.outerHTML,
                    computedStyles,
                    children,
                    bounds: {
                        x: bounds.x,
                        y: bounds.y,
                        width: bounds.width,
                        height: bounds.height
                    },
                    accessibility
                };
            }, { selector, includeChildren, includeStyles } // Pass the single object argument
            );
            if (!elementInfo) {
                throw new Error(`Failed to extract information from element: ${selector}`);
            }
            // Take a screenshot of the element
            const boundingBox = await elementHandle.boundingBox();
            if (!boundingBox) {
                throw new Error(`Element has no bounding box: ${selector}`);
            }
            const fileUuid = randomUUID();
            const screenshotPath = path.join(TEMP_DIR, `element_${fileUuid}.png`);
            await elementHandle.screenshot({ path: screenshotPath });
            const buffer = await fsPromises.readFile(screenshotPath);
            const base64Data = buffer.toString('base64');
            // Add to screenshots collection for resource access
            const screenshotName = `Element_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            screenshots.set(screenshotName, base64Data);
            return {
                element: elementInfo,
                screenshot: { path: screenshotPath, base64Data }
            };
        }
        catch (error) {
            logToFile(`Error inspecting DOM element: ${error}`);
            throw new Error(`Failed to inspect DOM element: ${error.message}`);
        }
    }
    /**
     * Console Monitor tool
     */
    async monitorConsole(url, filterTypes = ['log', 'info', 'warning', 'error'], duration = TIMEOUT_CONFIG.STABILITY_WAIT, interactionSelector) {
        try {
            logToFile(`Monitoring console at ${url}`);
            // Ensure browser is initialized
            const page = await this.ensureBrowser();
            // Store console messages
            const messages = [];
            // Set up console monitoring
            page.on('console', (message) => {
                if (filterTypes.includes('all') || filterTypes.includes(message.type())) {
                    messages.push({
                        type: message.type(),
                        text: message.text(),
                        location: {
                            url: message.location()?.url,
                            lineNumber: message.location()?.lineNumber,
                            columnNumber: message.location()?.columnNumber
                        }
                    });
                }
            });
            // Navigate to the URL with configurable timeout
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: TIMEOUT_CONFIG.NAVIGATION_TIMEOUT
            });
            // Perform interaction if requested
            if (interactionSelector) {
                try {
                    await page.click(interactionSelector);
                }
                catch (error) {
                    logToFile(`Error clicking interaction element: ${error}`);
                    // Continue monitoring even if interaction fails
                }
            }
            // Wait for specified duration
            await page.waitForTimeout(duration);
            // Take a screenshot
            const fileUuid = randomUUID();
            const screenshotPath = path.join(TEMP_DIR, `console_${fileUuid}.png`);
            await page.screenshot({ path: screenshotPath });
            const buffer = await fsPromises.readFile(screenshotPath);
            const base64Data = buffer.toString('base64');
            // Add to screenshots collection for resource access
            const screenshotName = `Console_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            screenshots.set(screenshotName, base64Data);
            // Calculate statistics
            const statistics = {
                total: messages.length,
                byType: {}
            };
            for (const message of messages) {
                statistics.byType[message.type] = (statistics.byType[message.type] || 0) + 1;
            }
            return {
                messages,
                statistics,
                screenshot: { path: screenshotPath, base64Data }
            };
        }
        catch (error) {
            logToFile(`Error monitoring console: ${error}`);
            throw new Error(`Failed to monitor console: ${error.message}`);
        }
    }
    /**
     * Performance Analysis tool
     */
    async analyzePerformance(url, iterations = 1, waitForNetworkIdle = true, deviceName) {
        try {
            logToFile(`Analyzing performance for ${url}`);
            // Store metrics from all iterations
            const iterationResults = [];
            let totalLoadTime = 0;
            let totalResources = 0;
            for (let i = 0; i < iterations; i++) {
                logToFile(`Running performance iteration ${i + 1}/${iterations}`);
                // Start with a fresh browser instance for each iteration
                if (browserContext) {
                    await browserContext.close().catch(() => { });
                    browserContext = null;
                }
                if (activePage) {
                    await activePage.close().catch(() => { });
                    activePage = null;
                }
                // Ensure browser is initialized with proper viewport
                const page = await this.ensureBrowser(1280, 800, deviceName);
                // Collect performance metrics
                const resourcesRequested = new Set();
                const resourcesByType = {};
                let totalSize = 0;
                page.on('request', (request) => resourcesRequested.add(request.url()));
                page.on('response', (response) => {
                    const headers = response.headers();
                    const contentLength = headers['content-length'] ? parseInt(headers['content-length']) : 0;
                    if (contentLength) {
                        totalSize += contentLength;
                    }
                });
                // Measure page load time
                const startTime = Date.now();
                // Navigate to the URL
                await page.goto(url, {
                    waitUntil: waitForNetworkIdle ? 'networkidle' : 'load'
                });
                const loadTime = Date.now() - startTime;
                totalLoadTime += loadTime;
                // Collect performance metrics
                const performanceMetrics = await page.evaluate(() => {
                    const performance = window.performance;
                    if (!performance)
                        return null;
                    const timing = performance.timing;
                    if (!timing)
                        return null;
                    // Basic timing metrics
                    const navigationStart = timing.navigationStart;
                    const responseStart = timing.responseStart;
                    const responseEnd = timing.responseEnd;
                    const domInteractive = timing.domInteractive;
                    const domContentLoaded = timing.domContentLoadedEventEnd;
                    const loadEventEnd = timing.loadEventEnd;
                    // Calculate performance metrics
                    return {
                        pageLoadTime: loadEventEnd - navigationStart,
                        timeToFirstByte: responseStart - navigationStart,
                        domProcessingTime: domInteractive - responseEnd,
                        domContentLoadedTime: domContentLoaded - navigationStart,
                        resourceLoadTime: responseEnd - responseStart,
                        memoryInfo: performance.memory ? {
                            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                            totalJSHeapSize: performance.memory.totalJSHeapSize,
                            usedJSHeapSize: performance.memory.usedJSHeapSize
                        } : null
                    };
                });
                // Add to iteration results
                iterationResults.push({
                    iteration: i + 1,
                    loadTime,
                    resourceCount: resourcesRequested.size,
                    resourcesByType,
                    totalSize,
                    performanceMetrics
                });
                totalResources += resourcesRequested.size;
            }
            // Calculate average metrics
            const avgLoadTime = totalLoadTime / iterations;
            const avgResourceCount = totalResources / iterations;
            // Combine resources by type across all iterations
            const combinedResourcesByType = {};
            let combinedSize = 0;
            for (const result of iterationResults) {
                for (const [type, count] of Object.entries(result.resourcesByType || {})) {
                    combinedResourcesByType[type] = (combinedResourcesByType[type] || 0) + count;
                }
                combinedSize += result.totalSize || 0;
            }
            // Average out the resource counts
            for (const type in combinedResourcesByType) {
                if (combinedResourcesByType[type] !== undefined) {
                    combinedResourcesByType[type] = Math.round(combinedResourcesByType[type] / iterations);
                }
            }
            // Generate recommendations
            const recommendations = [];
            if (avgLoadTime > TIMEOUT_CONFIG.PERFORMANCE_THRESHOLD) {
                recommendations.push('Page load time exceeds 3 seconds. Consider optimizing for faster loading.');
            }
            if (avgResourceCount > 50) {
                recommendations.push('High number of resources detected. Consider bundling or reducing resource count.');
            }
            if ((combinedResourcesByType['image'] || 0) > 10) {
                recommendations.push('High number of image resources. Consider image optimization or lazy loading.');
            }
            if ((combinedResourcesByType['script'] || 0) > 15) {
                recommendations.push('High number of script resources. Consider bundling or async loading.');
            }
            if (combinedSize > 3 * 1024 * 1024) { // 3MB
                recommendations.push('Total resource size exceeds 3MB. Consider optimizing resource size.');
            }
            // Return performance analysis results
            return {
                metrics: {
                    loadTime: avgLoadTime,
                    resourceSummary: {
                        totalResources: avgResourceCount,
                        totalSize: combinedSize / iterations,
                        resourcesByType: combinedResourcesByType
                    },
                    memoryUsage: iterationResults[0]?.performanceMetrics?.memoryInfo
                },
                iterations: iterationResults.map(r => ({
                    iteration: r.iteration,
                    loadTime: r.loadTime,
                    resourceCount: r.resourceCount
                })),
                recommendations
            };
        }
        catch (error) {
            logToFile(`Error analyzing performance: ${error}`);
            throw new Error(`Failed to analyze performance: ${error.message}`);
        }
    }
    /**
     * Visual Comparison tool
     */
    async compareVisually(url1, url2, threshold = 0.1, fullPage = false, selector) {
        try {
            logToFile(`Comparing ${url1} with ${url2}`);
            // Take screenshots of both URLs
            const page = await this.ensureBrowser();
            // Take screenshot of first URL
            await page.goto(url1, { waitUntil: 'networkidle' });
            await page.waitForTimeout(TIMEOUT_CONFIG.STABILITY_WAIT);
            const fileUuid1 = randomUUID();
            const screenshotPath1 = path.join(TEMP_DIR, `compare1_${fileUuid1}.png`);
            if (selector) {
                const element = await page.$(selector);
                if (!element) {
                    throw new Error(`Element not found: ${selector} on ${url1}`);
                }
                await element.screenshot({ path: screenshotPath1 });
            }
            else {
                await page.screenshot({
                    path: screenshotPath1,
                    fullPage
                });
            }
            // Take screenshot of second URL
            await page.goto(url2, { waitUntil: 'networkidle' });
            await page.waitForTimeout(TIMEOUT_CONFIG.STABILITY_WAIT);
            const fileUuid2 = randomUUID();
            const screenshotPath2 = path.join(TEMP_DIR, `compare2_${fileUuid2}.png`);
            if (selector) {
                const element = await page.$(selector);
                if (!element) {
                    throw new Error(`Element not found: ${selector} on ${url2}`);
                }
                await element.screenshot({ path: screenshotPath2 });
            }
            else {
                await page.screenshot({
                    path: screenshotPath2,
                    fullPage
                });
            }
            // Read the screenshots
            const image1 = await Jimp.read(screenshotPath1);
            const image2 = await Jimp.read(screenshotPath2);
            // Resize the second image to match the first if they're different sizes
            if (image1.getWidth() !== image2.getWidth() || image1.getHeight() !== image2.getHeight()) {
                image2.resize(image1.getWidth(), image1.getHeight());
            }
            // Compare images
            const diff = Jimp.diff(image1, image2, threshold);
            const diffPercentage = diff.percent;
            // Save diff image
            const diffPath = path.join(TEMP_DIR, `diff_${fileUuid1}_${fileUuid2}.png`);
            await diff.image.writeAsync(diffPath);
            // Get base64 data of all images
            const buffer1 = await fsPromises.readFile(screenshotPath1);
            const buffer2 = await fsPromises.readFile(screenshotPath2);
            const diffBuffer = await fsPromises.readFile(diffPath);
            const base64Data1 = buffer1.toString('base64');
            const base64Data2 = buffer2.toString('base64');
            const diffBase64Data = diffBuffer.toString('base64');
            // Add to screenshots collection for resource access
            const screenshot1Name = `Compare1_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            const screenshot2Name = `Compare2_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            const diffName = `Diff_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            screenshots.set(screenshot1Name, base64Data1);
            screenshots.set(screenshot2Name, base64Data2);
            screenshots.set(diffName, diffBase64Data);
            // Find differences
            const differences = [];
            if (diffPercentage > 0) {
                const diffImage = diff.image;
                const width = diffImage.getWidth();
                const height = diffImage.getHeight();
                // Find regions with differences
                const visited = new Set();
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const key = `${x},${y}`;
                        if (visited.has(key))
                            continue;
                        const pixel = Jimp.intToRGBA(diffImage.getPixelColor(x, y));
                        // If pixel is red (diff marker)
                        if (pixel.r > 0 && pixel.g === 0 && pixel.b === 0) {
                            // Find the bounds of this difference region
                            let minX = x, maxX = x, minY = y, maxY = y;
                            const toVisit = [`${x},${y}`];
                            visited.add(`${x},${y}`);
                            while (toVisit.length > 0) {
                                const current = toVisit.pop();
                                const [cx, cy] = current.split(',').map(Number);
                                // Update bounds
                                minX = Math.min(minX, cx || minX);
                                maxX = Math.max(maxX, cx || maxX);
                                minY = Math.min(minY, cy || minY);
                                maxY = Math.max(maxY, cy || maxY);
                                // Check neighbors
                                const neighbors = [
                                    `${(cx ?? 0) + 1},${cy ?? 0}`, `${(cx ?? 0) - 1},${cy ?? 0}`,
                                    `${cx ?? 0},${(cy ?? 0) + 1}`, `${cx ?? 0},${(cy ?? 0) - 1}`
                                ];
                                for (const neighbor of neighbors) {
                                    if (visited.has(neighbor))
                                        continue;
                                    const [nx, ny] = neighbor.split(',').map(Number);
                                    if ((nx === undefined) || (ny === undefined) || nx < 0 || nx >= width || ny < 0 || ny >= height)
                                        continue;
                                    const nPixel = Jimp.intToRGBA(diffImage.getPixelColor(nx, ny));
                                    if (nPixel.r > 0 && nPixel.g === 0 && nPixel.b === 0) {
                                        toVisit.push(neighbor);
                                        visited.add(neighbor);
                                    }
                                }
                            }
                            // Add this difference region
                            if (maxX - minX > 3 && maxY - minY > 3) { // Filter out tiny differences
                                differences.push({
                                    x: minX,
                                    y: minY,
                                    width: maxX - minX,
                                    height: maxY - minY
                                });
                            }
                        }
                    }
                }
            }
            return {
                diffPercentage,
                imagesMatch: diffPercentage < threshold,
                screenshots: {
                    url1: { path: screenshotPath1, base64Data: base64Data1 },
                    url2: { path: screenshotPath2, base64Data: base64Data2 },
                    diff: { path: diffPath, base64Data: diffBase64Data }
                },
                differences: differences.length > 0 ? differences : undefined
            };
        }
        catch (error) {
            logToFile(`Error comparing visually: ${error}`);
            throw new Error(`Failed to compare visually: ${error.message}`);
        }
    }
    setupRequestHandlers() {
        // List resources handler
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
            resources: [
                {
                    uri: "console://logs",
                    mimeType: "text/plain",
                    name: "Browser console logs",
                },
                {
                    uri: "prompt://visual-debugging",
                    mimeType: "text/markdown",
                    name: "Visual Debugging Protocol Guide",
                    description: "Core workflow patterns and best practices for visual UI debugging"
                },
                {
                    uri: "prompt://ui-debug",
                    mimeType: "text/markdown",
                    name: "Comprehensive UI/UX Debugging Prompt",
                    description: "5-section debugging process for thorough UI/UX testing"
                },
                {
                    uri: "prompt://iterative-debug-loop",
                    mimeType: "text/markdown",
                    name: "VUDA Iterative Debug Loop Protocol",
                    description: "Automatic execution loop for systematic debugging with task management"
                },
                ...Array.from(screenshots.keys()).map(name => ({
                    uri: `screenshot://${name}`,
                    mimeType: "image/png",
                    name: `Screenshot: ${name}`,
                })),
            ],
        }));
        // Read resource handler
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const uri = request.params.uri.toString();
            if (uri === "console://logs") {
                return {
                    contents: [{
                            uri,
                            mimeType: "text/plain",
                            text: consoleLogs.join("\n"),
                        }],
                };
            }
            if (uri.startsWith("screenshot://")) {
                const name = uri.split("://")[1] || "";
                const screenshot = screenshots.get(name);
                if (screenshot) {
                    return {
                        contents: [{
                                uri,
                                mimeType: "image/png",
                                blob: screenshot,
                            }],
                    };
                }
            }
            if (uri.startsWith("prompt://")) {
                const promptName = uri.replace("prompt://", "");
                let promptContent;
                try {
                    switch (promptName) {
                        case "visual-debugging":
                            promptContent = await fsPromises.readFile(path.join(__dirname, "../prompts/visual-debugging.md"), "utf-8");
                            break;
                        case "ui-debug":
                            promptContent = await fsPromises.readFile(path.join(__dirname, "../src/prompt-templates/ui-debug-prompt.md"), "utf-8");
                            break;
                        case "iterative-debug-loop":
                            promptContent = await fsPromises.readFile(path.join(__dirname, "../prompts/iterative-debug-loop.md"), "utf-8");
                            break;
                        default:
                            throw new Error(`Unknown prompt: ${promptName}`);
                    }
                    return {
                        contents: [{
                                uri,
                                mimeType: "text/markdown",
                                text: promptContent,
                            }],
                    };
                }
                catch (error) {
                    logToFile(`Error reading prompt file: ${error}`);
                    throw new Error(`Failed to read prompt: ${promptName}`);
                }
            }
            throw new Error(`Resource not found: ${uri}`);
        });
        // List tools handler
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                // === CORE VISUAL DEBUGGING TOOLS ===
                {
                    name: 'enhanced_page_analyzer',
                    description: 'Analyze a page with screenshots, console logs, interactive element mapping, and performance metrics',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: {
                                type: 'string',
                                description: 'URL to analyze (e.g., http://localhost:4999, https://example.com)'
                            },
                            includeConsole: {
                                type: 'boolean',
                                description: 'Whether to include console logs. Default: true'
                            },
                            mapElements: {
                                type: 'boolean',
                                description: 'Whether to map interactive elements. Default: true'
                            },
                            fullPage: {
                                type: 'boolean',
                                description: 'Whether to capture full page or just viewport. Default: false'
                            },
                            waitForSelector: {
                                type: 'string',
                                description: 'Optional CSS selector to wait for before analysis'
                            },
                            device: {
                                type: 'string',
                                description: 'Optional device to emulate (e.g., "iPhone 13", "Pixel 5")'
                            }
                        },
                        required: ['url']
                    }
                },
                // === API & BACKEND TESTING TOOLS ===
                {
                    name: 'api_endpoint_tester',
                    description: 'Test multiple API endpoints and verify responses',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: {
                                type: 'string',
                                description: 'Base URL of the API (e.g., http://localhost:5000/api)'
                            },
                            endpoints: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        path: {
                                            type: 'string',
                                            description: 'Endpoint path (e.g., /users)'
                                        },
                                        method: {
                                            type: 'string',
                                            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                                            description: 'HTTP method'
                                        },
                                        data: {
                                            type: 'object',
                                            description: 'Request body data for POST/PUT/PATCH'
                                        },
                                        headers: {
                                            type: 'object',
                                            description: 'Request headers'
                                        }
                                    },
                                    required: ['path', 'method']
                                },
                                description: 'List of endpoints to test'
                            },
                            authToken: {
                                type: 'string',
                                description: 'Optional auth token to include in all requests'
                            }
                        },
                        required: ['url', 'endpoints']
                    }
                },
                // === USER FLOW & INTERACTION TESTING ===
                {
                    name: 'navigation_flow_validator',
                    description: 'Test a sequence of user actions across multiple pages',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            startUrl: {
                                type: 'string',
                                description: 'URL to start the navigation flow from'
                            },
                            steps: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        action: {
                                            type: 'string',
                                            enum: ['click', 'fill', 'select', 'hover', 'wait', 'navigate', 'evaluate'],
                                            description: 'Action to perform'
                                        },
                                        selector: {
                                            type: 'string',
                                            description: 'CSS selector for the element to interact with'
                                        },
                                        value: {
                                            type: 'string',
                                            description: 'Value to input (for fill or select action)'
                                        },
                                        url: {
                                            type: 'string',
                                            description: 'URL to navigate to (for navigate action)'
                                        },
                                        script: {
                                            type: 'string',
                                            description: 'JavaScript to evaluate (for evaluate action)'
                                        },
                                    },
                                    required: ['action']
                                },
                                description: 'Sequence of steps to perform'
                            },
                            captureScreenshots: {
                                type: 'boolean',
                                description: 'Whether to capture screenshots after each step. Default: true'
                            },
                            includeConsole: {
                                type: 'boolean',
                                description: 'Whether to include console logs. Default: true'
                            },
                            device: {
                                type: 'string',
                                description: 'Optional device to emulate (e.g., "iPhone 13", "Pixel 5")'
                            }
                        },
                        required: ['startUrl', 'steps']
                    }
                },
                // === SCREENSHOT & VISUAL CAPTURE TOOLS ===
                {
                    name: 'screenshot_url',
                    description: 'Take a screenshot of a URL',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: {
                                type: 'string',
                                description: 'URL to capture a screenshot of'
                            },
                            fullPage: {
                                type: 'boolean',
                                description: 'Whether to capture full page or just viewport. Default: false'
                            },
                            selector: {
                                type: 'string',
                                description: 'Optional CSS selector to screenshot only that element'
                            },
                            waitForSelector: {
                                type: 'string',
                                description: 'Optional CSS selector to wait for before taking screenshot'
                            },
                            device: {
                                type: 'string',
                                description: 'Optional device to emulate (e.g., "iPhone 13", "Pixel 5")'
                            }
                        },
                        required: ['url']
                    }
                },
                // === DOM & ELEMENT INSPECTION TOOLS ===
                {
                    name: 'dom_inspector',
                    description: 'Inspect DOM elements and their properties',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: {
                                type: 'string',
                                description: 'URL to inspect'
                            },
                            selector: {
                                type: 'string',
                                description: 'CSS selector to inspect'
                            },
                            includeChildren: {
                                type: 'boolean',
                                description: 'Whether to include children elements. Default: false'
                            },
                            includeStyles: {
                                type: 'boolean',
                                description: 'Whether to include computed styles. Default: true'
                            },
                        },
                        required: ['url', 'selector']
                    }
                },
                {
                    name: 'batch_screenshot_urls',
                    description: 'Capture screenshots of multiple URLs in a grid layout for easy comparison',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            urls: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Array of URLs to capture screenshots of'
                            },
                            fullPage: {
                                type: 'boolean',
                                description: 'Whether to capture full page or just viewport. Default: false'
                            },
                            gridSize: {
                                type: 'number',
                                description: 'Number of screenshots per row in the grid layout. Default: 2'
                            },
                            device: {
                                type: 'string',
                                description: 'Optional device to emulate (e.g., "iPhone 13", "Pixel 5")'
                            }
                        },
                        required: ['urls']
                    }
                },
                // === CONSOLE & DEBUGGING TOOLS ===
                {
                    name: 'console_monitor',
                    description: 'Monitor console logs on a page',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: {
                                type: 'string',
                                description: 'URL to monitor console logs from'
                            },
                            filterTypes: {
                                type: 'array',
                                items: {
                                    type: 'string',
                                    enum: ['log', 'info', 'warning', 'error']
                                },
                                description: 'Types of console messages to capture'
                            },
                            duration: {
                                type: 'number',
                                description: 'How long to monitor in milliseconds. Default: 5000 (configurable via VUDA_STABILITY_WAIT)'
                            },
                            interactionSelector: {
                                type: 'string',
                                description: 'Optional element to click before monitoring'
                            }
                        },
                        required: ['url']
                    }
                },
                {
                    name: 'performance_analysis',
                    description: 'Analyze page performance metrics',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: {
                                type: 'string',
                                description: 'URL to analyze performance for'
                            },
                            iterations: {
                                type: 'number',
                                description: 'Number of test iterations to run. Default: 1'
                            },
                            waitForNetworkIdle: {
                                type: 'boolean',
                                description: 'Whether to wait for network to be idle. Default: true'
                            },
                            device: {
                                type: 'string',
                                description: 'Optional device to emulate (e.g., "iPhone 13", "Pixel 5")'
                            }
                        },
                        required: ['url']
                    }
                },
                {
                    name: 'visual_comparison',
                    description: 'Compare two URLs visually and highlight differences',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url1: {
                                type: 'string',
                                description: 'First URL to compare'
                            },
                            url2: {
                                type: 'string',
                                description: 'Second URL to compare'
                            },
                            threshold: {
                                type: 'number',
                                description: 'Difference threshold (0.0-1.0). Default: 0.1'
                            },
                            fullPage: {
                                type: 'boolean',
                                description: 'Whether to capture full page. Default: false'
                            },
                            selector: {
                                type: 'string',
                                description: 'Optional CSS selector to limit comparison'
                            }
                        },
                        required: ['url1', 'url2']
                    }
                },
                {
                    name: 'batch_screenshot_urls',
                    description: 'Take screenshots of multiple URLs and display them in a grid',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            urls: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                },
                                description: 'Array of URLs to capture screenshots of'
                            },
                            paths: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                },
                                description: 'Optional array of paths to label the screenshots with'
                            },
                            fullPage: {
                                type: 'boolean',
                                description: 'Whether to capture full page or just viewport. Default: false'
                            },
                            waitTime: {
                                type: 'number',
                                description: 'Time to wait in milliseconds before taking each screenshot. Default: 5000 (configurable via VUDA_STABILITY_WAIT)'
                            },
                            gridSize: {
                                type: 'number',
                                description: 'Size of grid (2 for 2x2, 4 for 4x4). Default: 2'
                            }
                        },
                        required: ['urls']
                    }
                },
                {
                    name: 'screenshot_local_files',
                    description: 'Take screenshots of local HTML files in a directory',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            directory: {
                                type: 'string',
                                description: 'Directory containing HTML files to screenshot (defaults to current directory)'
                            },
                            pattern: {
                                type: 'string',
                                description: 'Glob pattern to match HTML files (default: "*.html")'
                            },
                            fullPage: {
                                type: 'boolean',
                                description: 'Whether to capture full page or just viewport. Default: false'
                            },
                            gridSize: {
                                type: 'number',
                                description: 'Size of grid (2 for 2x2, 4 for 4x4). Default: 2'
                            }
                        },
                        required: []
                    }
                },
                // <<< START INSERTED PLAYWRIGHT TOOL DEFINITIONS >>>
                {
                    name: 'playwright_navigate',
                    description: 'Navigate to a URL',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: { type: 'string', description: 'URL to navigate to' },
                            waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle', 'commit'], description: 'Navigation wait condition', optional: true },
                            timeout: { type: 'number', description: 'Navigation timeout in milliseconds', optional: true }
                        },
                        required: ['url']
                    }
                },
                {
                    name: 'playwright_click',
                    description: 'Click an element on the page',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: { type: 'string', description: 'CSS selector for the element to click' }
                        },
                        required: ['selector']
                    }
                },
                {
                    name: 'playwright_iframe_click',
                    description: 'Click an element in an iframe on the page',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            iframeSelector: { type: 'string', description: 'CSS selector for the iframe containing the element to click' },
                            selector: { type: 'string', description: 'CSS selector for the element to click within the iframe' }
                        },
                        required: ['iframeSelector', 'selector']
                    }
                },
                {
                    name: 'playwright_fill',
                    description: 'Fill out an input field',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: { type: 'string', description: 'CSS selector for input field' },
                            value: { type: 'string', description: 'Value to fill' }
                        },
                        required: ['selector', 'value']
                    }
                },
                {
                    name: 'playwright_select',
                    description: 'Select an option in a dropdown',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: { type: 'string', description: 'CSS selector for the select element' },
                            value: { type: 'string', description: 'Value or label of the option to select' }
                        },
                        required: ['selector', 'value']
                    }
                },
                {
                    name: 'playwright_hover',
                    description: 'Hover over an element on the page',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: { type: 'string', description: 'CSS selector for element to hover' }
                        },
                        required: ['selector']
                    }
                },
                {
                    name: 'playwright_evaluate',
                    description: 'Execute JavaScript in the browser console context',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            script: { type: 'string', description: 'JavaScript code to execute' }
                        },
                        required: ['script']
                    }
                },
                {
                    name: 'playwright_console_logs',
                    description: 'Retrieve console logs captured so far',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            clear: { type: 'boolean', description: 'Whether to clear logs after retrieval', optional: true },
                            limit: { type: 'number', description: 'Maximum number of logs to return', optional: true },
                            type: { type: 'string', enum: ['all', 'error', 'warning', 'log', 'info', 'debug'], description: 'Type of logs to retrieve', optional: true }
                        },
                        required: []
                    }
                },
                {
                    name: 'playwright_get_visible_text',
                    description: 'Get the visible text content of the current page',
                    inputSchema: {
                        type: 'object', properties: {}, required: [] // No arguments needed
                    }
                },
                {
                    name: 'playwright_get_visible_html',
                    description: 'Get the HTML content of the current page',
                    inputSchema: {
                        type: 'object', properties: {}, required: [] // No arguments needed
                    }
                },
                {
                    name: 'playwright_go_back',
                    description: 'Navigate back in browser history',
                    inputSchema: {
                        type: 'object', properties: {}, required: [] // No arguments needed
                    }
                },
                {
                    name: 'playwright_go_forward',
                    description: 'Navigate forward in browser history',
                    inputSchema: {
                        type: 'object', properties: {}, required: [] // No arguments needed
                    }
                },
                {
                    name: 'playwright_press_key',
                    description: 'Press a keyboard key (optionally focusing an element first)',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            key: { type: 'string', description: "Key to press (e.g. 'Enter', 'ArrowDown', 'a')" },
                            selector: { type: 'string', description: 'Optional CSS selector to focus before pressing key', optional: true }
                        },
                        required: ['key']
                    }
                },
                {
                    name: 'playwright_drag',
                    description: 'Drag an element to a target location',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            sourceSelector: { type: 'string', description: 'CSS selector for the element to drag' },
                            targetSelector: { type: 'string', description: 'CSS selector for the target location' }
                        },
                        required: ['sourceSelector', 'targetSelector']
                    }
                },
                // <<< END INSERTED PLAYWRIGHT TOOL DEFINITIONS >>>
                // <<< START INSERTED PLAYWRIGHT TOOL DEFINITION >>>
                {
                    name: 'playwright_screenshot',
                    description: 'Take a screenshot of the current page or a specific element',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Name for the screenshot resource (will be used in the URI)' },
                            selector: { type: 'string', description: 'Optional CSS selector for element to screenshot', optional: true },
                            fullPage: { type: 'boolean', description: 'Store screenshot of the entire page (default: false)', optional: true },
                            // Removed storeBase64, savePng, downloadsDir as they are handled server-side
                        },
                        required: ['name']
                    }
                },
                // <<< END INSERTED PLAYWRIGHT TOOL DEFINITION >>>
                // <<< START INSERTION: UI Workflow Validator Tool Definition >>>
                {
                    name: 'ui_workflow_validator',
                    description: 'Execute and validate a sequence of UI interactions simulating a user workflow.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            startUrl: { type: 'string', description: 'Initial URL for the workflow' },
                            taskDescription: { type: 'string', description: 'High-level description of the user task being simulated' },
                            steps: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        description: { type: 'string', description: 'Description of the user action for this step' },
                                        action: {
                                            type: 'string',
                                            enum: [
                                                "navigate", "click", "fill", "select", "hover", "wait", "evaluate", "screenshot",
                                                "verifyText", "verifyElementVisible", "verifyElementNotVisible", "verifyUrl"
                                            ],
                                            description: 'Playwright action or verification to perform'
                                        },
                                        selector: { type: 'string', description: 'CSS selector for interaction or verification', optional: true },
                                        value: { type: 'string', description: 'Value for fill/select or text/URL to verify', optional: true },
                                        url: { type: 'string', description: 'URL for navigate action or verification', optional: true },
                                        script: { type: 'string', description: 'JavaScript for evaluate action', optional: true },
                                        isOptional: { type: 'boolean', description: 'If true, failure of this step won\'t stop the workflow', optional: true, default: false }
                                    },
                                    required: ['description', 'action']
                                },
                                minItems: 1,
                                description: 'Sequence of steps representing the user workflow (minimum 1 step)'
                            },
                            captureScreenshots: {
                                type: 'string',
                                enum: ['all', 'failure', 'none'],
                                description: 'When to capture screenshots (default: failure)',
                                optional: true
                            },
                            device: { type: 'string', description: 'Optional device to emulate (e.g., \'iPhone 13\', \'Pixel 5\')', optional: true }
                        },
                        required: ['startUrl', 'taskDescription', 'steps']
                    }
                },
                // <<< END INSERTION: UI Workflow Validator Tool Definition >>>
                // === DEVELOPMENT & UTILITY TOOLS ===
                {
                    name: 'tunnel_helper',
                    description: 'Guide user to expose local ports via Cloudflare tunnel or manage tunnel URLs',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            localPort: {
                                type: 'number',
                                description: 'Local port number to expose (e.g., 3000, 8080)'
                            },
                            action: {
                                type: 'string',
                                enum: ['guide', 'store', 'retrieve'],
                                description: 'Action: guide (show instructions), store (save tunnel URL), retrieve (get saved URL)'
                            },
                            tunnelUrl: {
                                type: 'string',
                                description: 'Tunnel URL to store (only for store action)',
                                optional: true
                            }
                        },
                        required: ['localPort', 'action']
                    }
                },
                {
                    name: 'debug_memory',
                    description: 'Save and retrieve debugging context including .env variables, selectors, and issues',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            action: {
                                type: 'string',
                                enum: ['save', 'retrieve', 'list', 'clear'],
                                description: 'Memory action to perform'
                            },
                            key: {
                                type: 'string',
                                description: 'Memory key for save/retrieve operations',
                                optional: true
                            },
                            value: {
                                type: 'object',
                                description: 'Value to save (for save action)',
                                optional: true
                            },
                            category: {
                                type: 'string',
                                enum: ['env', 'urls', 'selectors', 'issues', 'fixes', 'general'],
                                description: 'Category of memory item',
                                optional: true
                            }
                        },
                        required: ['action']
                    }
                },
                {
                    name: 'sitemap_crawler',
                    description: 'Crawl a website recursively to generate a comprehensive sitemap with all endpoints, links, and visible text content. Perfect for detecting inconsistent content, broken links, and navigation issues.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: {
                                type: 'string',
                                description: 'Starting URL to crawl (e.g., http://localhost:3000, https://example.com)'
                            },
                            maxDepth: {
                                type: 'number',
                                description: 'Maximum depth to crawl (default: 3)',
                                optional: true
                            },
                            includeText: {
                                type: 'boolean',
                                description: 'Include visible text content from each page (default: true)',
                                optional: true
                            },
                            sameDomainOnly: {
                                type: 'boolean',
                                description: 'Only crawl links from the same domain (default: true)',
                                optional: true
                            },
                            outputFormat: {
                                type: 'string',
                                enum: ['json', 'markdown', 'text'],
                                description: 'Output format for the sitemap (default: markdown)',
                                optional: true
                            }
                        },
                        required: ['url']
                    }
                }
            ]
        }));
        // Call tool handler
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            // Helper function to ensure active page
            const ensureActivePage = () => {
                if (!activePage) {
                    // Use InvalidRequest as PreconditionFailed is not available
                    throw new McpError(ErrorCode.InvalidRequest, "Browser is not active or page not loaded. Use a navigation tool first.");
                }
                return activePage;
            };
            switch (request.params.name) {
                case 'enhanced_page_analyzer': {
                    try {
                        const args = request.params.arguments;
                        if (!args.url) {
                            throw new McpError(ErrorCode.InvalidParams, 'URL is required');
                        }
                        // Validate URL format
                        try {
                            new URL(args.url);
                        }
                        catch (error) {
                            throw new McpError(ErrorCode.InvalidParams, `Invalid URL format: ${args.url}`);
                        }
                        // Analyze the page
                        const result = await this.enhancedPageAnalyzer(args.url, args.includeConsole !== false, args.mapElements !== false, args.fullPage || false, args.waitForSelector, args.device);
                        // Create content array
                        const content = [
                            {
                                type: "text",
                                text: `# Page Analysis: ${result.pageInfo.title}\n\nURL: ${result.pageInfo.url}\nLoad Time: ${result.pageInfo.loadTime}ms\n`
                            }
                        ];
                        // Add screenshots
                        content.push({
                            type: "text",
                            text: "## Screenshot"
                        });
                        content.push({
                            type: "image",
                            data: result.screenshot.base64Data,
                            mimeType: "image/png"
                        });
                        // Add annotated screenshot if available
                        if (result.annotatedScreenshot) {
                            content.push({
                                type: "text",
                                text: "## Annotated Screenshot with Interactive Elements"
                            });
                            content.push({
                                type: "image",
                                data: result.annotatedScreenshot.base64Data,
                                mimeType: "image/png"
                            });
                        }
                        // Add interactive elements if available
                        if (result.interactiveElements && result.interactiveElements.length > 0) {
                            content.push({
                                type: "text",
                                text: `## Interactive Elements (${result.interactiveElements.length})\n\nThe numbered elements in the screenshot correspond to:`
                            });
                            // Create a table of elements
                            let elementsTable = "| Index | Type | Text | Element |\n";
                            elementsTable += "| ----- | ---- | ---- | ------- |\n";
                            for (const element of result.interactiveElements) {
                                elementsTable += `| ${element.index} | ${element.type} | ${element.text || '(no text)'} | ${element.tagName}${element.id ? `#${element.id}` : ''} |\n`;
                            }
                            content.push({
                                type: "text",
                                text: elementsTable
                            });
                        }
                        // Add console messages if available
                        if (result.consoleMessages && result.consoleMessages.length > 0) {
                            const errors = result.consoleMessages.filter(m => m.type === 'error');
                            const warnings = result.consoleMessages.filter(m => m.type === 'warning');
                            const info = result.consoleMessages.filter(m => m.type !== 'error' && m.type !== 'warning');
                            content.push({
                                type: "text",
                                text: `## Console Output (${result.consoleMessages.length} messages)`
                            });
                            if (errors.length > 0) {
                                content.push({
                                    type: "text",
                                    text: `### Errors (${errors.length})\n\n` +
                                        errors.map(m => `- 🔴 ${m.text}`).join('\n')
                                });
                            }
                            if (warnings.length > 0) {
                                content.push({
                                    type: "text",
                                    text: `### Warnings (${warnings.length})\n\n` +
                                        warnings.map(m => `- ⚠️ ${m.text}`).join('\n')
                                });
                            }
                            if (info.length > 0 && info.length <= 10) {
                                content.push({
                                    type: "text",
                                    text: `### Info (${info.length})\n\n` +
                                        info.map(m => `- ℹ️ ${m.text}`).join('\n')
                                });
                            }
                            else if (info.length > 10) {
                                content.push({
                                    type: "text",
                                    text: `### Info (${info.length}, showing first 10)\n\n` +
                                        info.slice(0, 10).map(m => `- ℹ️ ${m.text}`).join('\n') +
                                        `\n\n...and ${info.length - 10} more info messages.`
                                });
                            }
                        }
                        // Add accessibility issues if available
                        if (result.accessibility && result.accessibility.length > 0) {
                            content.push({
                                type: "text",
                                text: `## Accessibility Issues (${result.accessibility.length})\n\n` +
                                    result.accessibility.map((issue) => `### ${issue.rule}\n` +
                                        `Found ${issue.elements.length} instance(s):\n` +
                                        issue.elements.map((el) => `- \`${el.html}\``).join('\n')).join('\n\n')
                            });
                        }
                        // Add performance metrics if available
                        if (result.performance) {
                            content.push({
                                type: "text",
                                text: "## Performance Metrics\n\n" +
                                    "| Metric | Value |\n" +
                                    "| ------ | ----- |\n" +
                                    `| Page Load Time | ${result.performance.pageLoadTime}ms |\n` +
                                    `| Time to First Byte | ${result.performance.timeToFirstByte}ms |\n` +
                                    `| DOM Processing | ${result.performance.domProcessingTime}ms |\n` +
                                    `| DOMContentLoaded | ${result.performance.domContentLoadedTime}ms |\n` +
                                    `| Resource Loading | ${result.performance.resourceLoadTime}ms |\n`
                            });
                            // Add memory info if available
                            if (result.performance.memory) {
                                content.push({
                                    type: "text",
                                    text: "### Memory Usage\n\n" +
                                        "| Metric | Value |\n" +
                                        "| ------ | ----- |\n" +
                                        `| Total JS Heap | ${(result.performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(2)} MB |\n` +
                                        `| Used JS Heap | ${(result.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2)} MB |\n` +
                                        `| JS Heap Limit | ${(result.performance.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(2)} MB |\n`
                                });
                            }
                            // Add resource information
                            if (result.pageInfo.resources) {
                                content.push({
                                    type: "text",
                                    text: "### Resource Summary\n\n" +
                                        `Total Requested: ${result.pageInfo.resources.requested.length}\n` +
                                        `Failed Resources: ${result.pageInfo.resources.failed.length}\n\n` +
                                        (result.pageInfo.resources.failed.length > 0 ?
                                            "#### Failed Resources\n" +
                                                result.pageInfo.resources.failed.map((r) => `- ${r}`).join('\n') + "\n\n" : "")
                                });
                            }
                        }
                        return { content };
                    }
                    catch (error) {
                        throw new McpError(ErrorCode.InternalError, `Failed to analyze page: ${error?.message || 'Unknown error'}`);
                    }
                }
                case 'api_endpoint_tester': {
                    try {
                        const args = request.params.arguments;
                        if (!args.url) {
                            throw new McpError(ErrorCode.InvalidParams, 'Base URL is required');
                        }
                        if (!args.endpoints || !Array.isArray(args.endpoints) || args.endpoints.length === 0) {
                            throw new McpError(ErrorCode.InvalidParams, 'At least one endpoint is required');
                        }
                        // Test the endpoints
                        const result = await this.testApiEndpoints(args.url, args.endpoints, args.authToken);
                        // Create content array
                        const content = [
                            {
                                type: "text",
                                text: `# API Endpoint Testing Results\n\nBase URL: ${args.url}\nSuccess Rate: ${result.successRate.toFixed(1)}%\nAverage Response Time: ${result.averageResponseTime.toFixed(1)}ms\n`
                            }
                        ];
                        // Create a table of results
                        let resultsTable = "| Method | Endpoint | Status | Response Time | Result |\n";
                        resultsTable += "| ------ | -------- | ------ | ------------- | ------ |\n";
                        for (const endpoint of result.results) {
                            const status = endpoint.status >= 200 && endpoint.status < 300
                                ? `✅ ${endpoint.status}`
                                : `❌ ${endpoint.status || 'Failed'}`;
                            const outcome = endpoint.error
                                ? `Error: ${endpoint.error.substring(0, 30)}...`
                                : 'Success';
                            resultsTable += `| ${endpoint.method} | ${endpoint.endpoint} | ${status} | ${endpoint.responseTime}ms | ${outcome} |\n`;
                        }
                        content.push({
                            type: "text",
                            text: resultsTable
                        });
                        // Add error summary if there are any issues
                        if (result.errorSummary) {
                            content.push({
                                type: "text",
                                text: "## Error Summary\n\n" +
                                    "| Error Type | Count |\n" +
                                    "| ---------- | ----- |\n" +
                                    `| Server Errors (5xx) | ${result.errorSummary.serverErrors} |\n` +
                                    `| Client Errors (4xx) | ${result.errorSummary.clientErrors} |\n` +
                                    `| Connection Errors | ${result.errorSummary.connectionErrors} |\n` +
                                    `| Response Timeouts | ${result.errorSummary.responseTimeouts} |\n`
                            });
                        }
                        // Add detailed information for each endpoint
                        content.push({
                            type: "text",
                            text: "## Detailed Results"
                        });
                        for (const endpoint of result.results) {
                            content.push({
                                type: "text",
                                text: `### ${endpoint.method} ${endpoint.endpoint}\n\n` +
                                    `Status: ${endpoint.status || 'Failed'}\n` +
                                    `Response Time: ${endpoint.responseTime}ms\n` +
                                    (endpoint.error ? `Error: ${endpoint.error}\n` : '') +
                                    (endpoint.responseData ? `\nResponse Data:\n\`\`\`json\n${typeof endpoint.responseData === 'string' ? endpoint.responseData : JSON.stringify(endpoint.responseData, null, 2)}\n\`\`\`\n` : '')
                            });
                        }
                        return { content };
                    }
                    catch (error) {
                        throw new McpError(ErrorCode.InternalError, `Failed to test API endpoints: ${error?.message || 'Unknown error'}`);
                    }
                }
                case 'navigation_flow_validator': {
                    try {
                        const args = request.params.arguments;
                        if (!args.startUrl) {
                            throw new McpError(ErrorCode.InvalidParams, 'Start URL is required');
                        }
                        if (!args.steps || !Array.isArray(args.steps) || args.steps.length === 0) {
                            throw new McpError(ErrorCode.InvalidParams, 'At least one step is required');
                        }
                        // Validate URL format
                        try {
                            new URL(args.startUrl);
                        }
                        catch (error) {
                            throw new McpError(ErrorCode.InvalidParams, `Invalid URL format: ${args.startUrl}`);
                        }
                        // Validate the steps
                        for (const step of args.steps) {
                            if (!step.action) {
                                throw new McpError(ErrorCode.InvalidParams, 'Each step must have an action');
                            }
                            switch (step.action) {
                                case 'click':
                                    if (!step.selector) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Selector is required for click action');
                                    }
                                    break;
                                case 'fill':
                                    if (!step.selector) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Selector is required for fill action');
                                    }
                                    if (!step.value) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Value is required for fill action');
                                    }
                                    break;
                                case 'select':
                                    if (!step.selector) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Selector is required for select action');
                                    }
                                    if (!step.value) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Value is required for select action');
                                    }
                                    break;
                                case 'hover':
                                    if (!step.selector) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Selector is required for hover action');
                                    }
                                    break;
                                case 'navigate':
                                    if (!step.url) {
                                        throw new McpError(ErrorCode.InvalidParams, 'URL is required for navigate action');
                                    }
                                    try {
                                        new URL(step.url);
                                    }
                                    catch (error) {
                                        throw new McpError(ErrorCode.InvalidParams, `Invalid URL format in navigate action: ${step.url}`);
                                    }
                                    break;
                                case 'evaluate':
                                    if (!step.script) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Script is required for evaluate action');
                                    }
                                    break;
                                default:
                                    throw new Error(`Unknown action: ${step.action}`);
                            }
                        }
                        // Validate the navigation flow
                        const result = await this.validateNavigationFlow(args.startUrl, args.steps, args.captureScreenshots !== false, args.includeConsole !== false, args.device);
                        // Create content array
                        const content = [
                            {
                                type: "text",
                                text: `# Navigation Flow Validation ${result.success ? '✅' : '❌'}\n\nStarting URL: ${args.startUrl}\nSteps: ${args.steps.length}\nResult: ${result.success ? 'Success' : 'Failed'}\n`
                            }
                        ];
                        // Add a summary table
                        let summaryTable = "| Step | Action | Status | Details |\n";
                        summaryTable += "| ---- | ------ | ------ | ------- |\n";
                        for (const step of result.steps) {
                            const status = step.success ? '✅' : '❌';
                            const details = step.error ||
                                (step.action === 'navigate' ? `Navigated to ${step.url}` :
                                    step.action === 'click' ? `Clicked ${step.selector}` :
                                        step.action === 'fill' ? `Filled ${step.selector} with "${step.value}"` :
                                            step.action === 'select' ? `Selected ${step.selector} with "${step.value}"` :
                                                step.action === 'hover' ? `Hovered ${step.selector}` :
                                                    step.action === 'evaluate' ? 'Executed JavaScript' :
                                                        'Completed');
                            summaryTable += `| ${step.stepNumber} | ${step.action} | ${status} | ${details} |\n`;
                        }
                        content.push({
                            type: "text",
                            text: summaryTable
                        });
                        // Add results for each step
                        content.push({
                            type: "text",
                            text: "## Detailed Steps"
                        });
                        for (const step of result.steps) {
                            // Step header with status
                            content.push({
                                type: "text",
                                text: `### Step ${step.stepNumber}: ${step.action} ${step.success ? '✅' : '❌'}\n\n` +
                                    (step.url ? `Current URL: ${step.url}\n\n` : '') +
                                    (step.error ? `Error: ${step.error}\n\n` : '')
                            });
                            // Add step details
                            if (step.selector) {
                                content.push({
                                    type: "text",
                                    text: `Selector: \`${step.selector}\`\n`
                                });
                            }
                            if (step.value) {
                                content.push({
                                    type: "text",
                                    text: `Value: \`${step.value}\`\n`
                                });
                            }
                            // Add screenshot if available
                            if (step.screenshotBase64) {
                                content.push({
                                    type: "image",
                                    data: step.screenshotBase64,
                                    mimeType: "image/png"
                                });
                            }
                            // Add console errors if available and there are some
                            if (step.consoleMessages && step.consoleMessages.length > 0) {
                                const errors = step.consoleMessages.filter(m => m.type === 'error');
                                if (errors.length > 0) {
                                    content.push({
                                        type: "text",
                                        text: `#### Console Errors (${errors.length})\n\n` +
                                            errors.map(m => `- 🔴 ${m.text}`).join('\n')
                                    });
                                }
                            }
                            // Add evaluation result if available
                            if (step.evaluationResult) {
                                content.push({
                                    type: "text",
                                    text: `#### Evaluation Result\n\n\`\`\`json\n${JSON.stringify(step.evaluationResult, null, 2)}\n\`\`\``
                                });
                            }
                        }
                        // Add summary of console errors if available
                        if (result.steps.some(s => s.consoleMessages && s.consoleMessages.length > 0)) {
                            const allErrors = result.steps
                                .flatMap(s => s.consoleMessages || [])
                                .filter(m => m.type === 'error');
                            if (allErrors.length > 0) {
                                content.push({
                                    type: "text",
                                    text: `## All Console Errors (${allErrors.length})\n\n` +
                                        allErrors.map(m => `- 🔴 ${m.text}`).join('\n')
                                });
                            }
                        }
                        return { content };
                    }
                    catch (error) {
                        throw new McpError(ErrorCode.InternalError, `Failed to validate navigation flow: ${error?.message || 'Unknown error'}`);
                    }
                }
                case 'screenshot_url': {
                    try {
                        const args = request.params.arguments;
                        if (!args.url) {
                            throw new McpError(ErrorCode.InvalidParams, 'URL is required');
                        }
                        // Validate URL format
                        try {
                            new URL(args.url);
                        }
                        catch (unknownError) {
                            const errorMessage = unknownError instanceof Error
                                ? unknownError.message
                                : String(unknownError);
                            throw new McpError(ErrorCode.InvalidParams, `Invalid URL format: ${errorMessage}`);
                        }
                        // Take screenshot
                        const screenshot = await this.screenshotUrl(args.url, args.fullPage || false, args.selector, args.waitForSelector, args.device);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Screenshot captured from URL: ${args.url}${args.selector ? ` (selector: ${args.selector})` : ''}`
                                },
                                {
                                    type: "image",
                                    data: screenshot.base64Data,
                                    mimeType: "image/png"
                                },
                                {
                                    type: "text",
                                    text: `Screenshot saved at: ${screenshot.path}`
                                }
                            ]
                        };
                    }
                    catch (error) {
                        throw new McpError(ErrorCode.InternalError, `Failed to capture screenshot: ${error?.message || 'Unknown error'}`);
                    }
                }
                case 'batch_screenshot_urls': {
                    try {
                        const args = BatchScreenshotUrlsSchema.parse(request.params.arguments);
                        if (!args.urls || args.urls.length === 0) {
                            throw new McpError(ErrorCode.InvalidParams, 'URLs array is required and cannot be empty');
                        }
                        // Validate URL formats
                        for (const url of args.urls) {
                            try {
                                new URL(url);
                            }
                            catch (error) {
                                throw new McpError(ErrorCode.InvalidParams, `Invalid URL format: ${url}`);
                            }
                        }
                        const result = await this.batchScreenshotUrls(args.urls, args.fullPage || false, args.gridSize || 2, args.device);
                        const content = [
                            {
                                type: "text",
                                text: `# Batch Screenshot Results\n\nProcessed ${result.screenshots.length} URLs\nSuccessful: ${result.screenshots.filter(s => !s.error).length}\nFailed: ${result.screenshots.filter(s => s.error).length}\n`
                            }
                        ];
                        // Add grid image if available
                        if (result.gridImageBase64) {
                            content.push({
                                type: "image",
                                data: result.gridImageBase64,
                                mimeType: "image/png"
                            });
                        }
                        // Add individual screenshots
                        for (const screenshot of result.screenshots) {
                            if (screenshot.error) {
                                content.push({
                                    type: "text",
                                    text: `❌ **${screenshot.url}**: ${screenshot.error}`
                                });
                            }
                            else {
                                content.push({
                                    type: "text",
                                    text: `✅ **${screenshot.url}**`
                                });
                                content.push({
                                    type: "image",
                                    data: screenshot.base64Data,
                                    mimeType: "image/png"
                                });
                            }
                        }
                        return { content };
                    }
                    catch (error) {
                        if (error instanceof McpError) {
                            throw error;
                        }
                        throw new McpError(ErrorCode.InternalError, `Failed to capture batch screenshots: ${error?.message || 'Unknown error'}`);
                    }
                }
                case 'dom_inspector': {
                    try {
                        const args = request.params.arguments;
                        if (!args.url) {
                            throw new McpError(ErrorCode.InvalidParams, 'URL is required');
                        }
                        if (!args.selector) {
                            throw new McpError(ErrorCode.InvalidParams, 'Selector is required');
                        }
                        // Validate URL format
                        try {
                            new URL(args.url);
                        }
                        catch (unknownError) {
                            const errorMessage = unknownError instanceof Error
                                ? unknownError.message
                                : String(unknownError);
                            throw new McpError(ErrorCode.InvalidParams, `Invalid URL format: ${errorMessage}`);
                        }
                        // Inspect DOM element
                        const result = await this.inspectDomElement(args.url, args.selector, args.includeChildren || false, args.includeStyles !== false);
                        // Create content array
                        const content = [
                            {
                                type: "text",
                                text: `# DOM Element Inspection: \`${args.selector}\`\n\nURL: ${args.url}\nElement: ${result.element.tagName}${result.element.id ? `#${result.element.id}` : ''}\n`
                            }
                        ];
                        // Add screenshot
                        if (result.screenshot) {
                            content.push({
                                type: "text",
                                text: "## Element Screenshot"
                            });
                            content.push({
                                type: "image",
                                data: result.screenshot.base64Data,
                                mimeType: "image/png"
                            });
                        }
                        // Add element details
                        content.push({
                            type: "text",
                            text: "## Element Details\n\n" +
                                "| Property | Value |\n" +
                                "| -------- | ----- |\n" +
                                `| Tag Name | ${result.element.tagName} |\n` +
                                `| ID | ${result.element.id || '(none)'} |\n` +
                                `| Class | ${result.element.className || '(none)'} |\n` +
                                `| Text | ${result.element.textContent ? result.element.textContent.substring(0, 100) + (result.element.textContent.length > 100 ? '...' : '') : '(none)'} |\n` +
                                `| Dimensions | ${result.element.bounds.width}×${result.element.bounds.height} px |\n` +
                                `| Position | (${result.element.bounds.x}, ${result.element.bounds.y}) |\n`
                        });
                        // Add attributes
                        const attributes = result.element.attributes;
                        if (Object.keys(attributes).length > 0) {
                            let attributesTable = "## Attributes\n\n" +
                                "| Name | Value |\n" +
                                "| ---- | ----- |\n";
                            for (const [name, value] of Object.entries(attributes)) {
                                attributesTable += `| ${name} | ${value} |\n`;
                            }
                            content.push({
                                type: "text",
                                text: attributesTable
                            });
                        }
                        // Add accessibility information
                        if (result.element.accessibility) {
                            const a11y = result.element.accessibility;
                            content.push({
                                type: "text",
                                text: "## Accessibility\n\n" +
                                    "| Property | Value |\n" +
                                    "| -------- | ----- |\n" +
                                    `| ARIA Label | ${a11y.ariaLabel || '(none)'} |\n` +
                                    `| ARIA Labelledby | ${a11y.ariaLabelledby || '(none)'} |\n` +
                                    `| ARIA Describedby | ${a11y.ariaDescribedby || '(none)'} |\n` +
                                    `| ARIA Role | ${a11y.ariaRole || '(none)'} |\n` +
                                    `| Tab Index | ${a11y.tabIndex || '(not set)'} |\n` +
                                    `| Has Accessible Name | ${a11y.hasAccessibleName ? 'Yes' : 'No'} |\n`
                            });
                        }
                        // Add computed styles if available
                        if (result.element.computedStyles) {
                            const styles = result.element.computedStyles;
                            const importantStyles = [
                                'display', 'position', 'width', 'height', 'margin', 'padding',
                                'color', 'background-color', 'font-family', 'font-size',
                                'z-index', 'opacity', 'visibility', 'overflow'
                            ];
                            let stylesTable = "## Key Computed Styles\n\n" +
                                "| Property | Value |\n" +
                                "| -------- | ----- |\n";
                            for (const prop of importantStyles) {
                                if (styles[prop]) {
                                    stylesTable += `| ${prop} | ${styles[prop]} |\n`;
                                }
                            }
                            content.push({
                                type: "text",
                                text: stylesTable
                            });
                        }
                        // Add children if available
                        if (result.element.children && result.element.children.length > 0) {
                            let childrenTable = `## Children (${result.element.children.length})\n\n` +
                                "| Tag | ID | Class | Text |\n" +
                                "| --- | -- | ----- | ---- |\n";
                            for (const child of result.element.children) {
                                childrenTable += `| ${child.tagName} | ${child.id || ''} | ${child.className || ''} | ${child.textContent ? child.textContent.substring(0, 30) + (child.textContent.length > 30 ? '...' : '') : ''} |\n`;
                            }
                            content.push({
                                type: "text",
                                text: childrenTable
                            });
                        }
                        // Add HTML
                        content.push({
                            type: "text",
                            text: `## HTML\n\n\`\`\`html\n${result.element.html}\n\`\`\``
                        });
                        return { content };
                    }
                    catch (error) {
                        throw new McpError(ErrorCode.InternalError, `Failed to inspect DOM element: ${error?.message || 'Unknown error'}`);
                    }
                }
                case 'console_monitor': {
                    try {
                        const args = request.params.arguments;
                        if (!args.url) {
                            throw new McpError(ErrorCode.InvalidParams, 'URL is required');
                        }
                        // Validate URL format
                        try {
                            new URL(args.url);
                        }
                        catch (unknownError) {
                            const errorMessage = unknownError instanceof Error
                                ? unknownError.message
                                : String(unknownError);
                            throw new McpError(ErrorCode.InvalidParams, `Invalid URL format: ${errorMessage}`);
                        }
                        // Monitor console
                        const result = await this.monitorConsole(args.url, args.filterTypes || ['log', 'info', 'warning', 'error'], args.duration || TIMEOUT_CONFIG.STABILITY_WAIT, args.interactionSelector);
                        // Create content array
                        const content = [
                            {
                                type: "text",
                                text: `# Console Monitoring: ${args.url}\n\nMonitored for ${args.duration || TIMEOUT_CONFIG.STABILITY_WAIT}ms\nCaptured ${result.messages.length} console messages\n`
                            }
                        ];
                        // Add screenshot
                        if (result.screenshot) {
                            content.push({
                                type: "image",
                                data: result.screenshot.base64Data,
                                mimeType: "image/png"
                            });
                        }
                        // Add statistics
                        content.push({
                            type: "text",
                            text: "## Message Statistics\n\n" +
                                "| Type | Count |\n" +
                                "| ---- | ----- |\n" +
                                Object.entries(result.statistics.byType)
                                    .map(([type, count]) => `| ${type} | ${count} |`)
                                    .join('\n')
                        });
                        // Add messages by type
                        if (result.messages.length > 0) {
                            const errors = result.messages.filter(m => m.type === 'error');
                            const warnings = result.messages.filter(m => m.type === 'warning');
                            const info = result.messages.filter(m => m.type === 'info');
                            const logs = result.messages.filter(m => m.type === 'log');
                            // Add errors
                            if (errors.length > 0) {
                                content.push({
                                    type: "text",
                                    text: `## Errors (${errors.length})\n\n` +
                                        errors.map(m => `- 🔴 ${m.text}`).join('\n')
                                });
                            }
                            // Add warnings
                            if (warnings.length > 0) {
                                content.push({
                                    type: "text",
                                    text: `## Warnings (${warnings.length})\n\n` +
                                        warnings.map(m => `- ⚠️ ${m.text}`).join('\n')
                                });
                            }
                            // Add info and logs
                            if (info.length > 0 || logs.length > 0) {
                                content.push({
                                    type: "text",
                                    text: `## Info & Logs (${info.length + logs.length})\n\n` +
                                        [...info, ...logs].map(m => `- ℹ️ ${m.text}`).join('\n')
                                });
                            }
                        }
                        return { content };
                    }
                    catch (error) {
                        throw new McpError(ErrorCode.InternalError, `Failed to monitor console: ${error?.message || 'Unknown error'}`);
                    }
                }
                case 'performance_analysis': {
                    try {
                        const args = request.params.arguments;
                        if (!args.url) {
                            throw new McpError(ErrorCode.InvalidParams, 'URL is required');
                        }
                        // Validate URL format
                        try {
                            new URL(args.url);
                        }
                        catch (unknownError) {
                            const errorMessage = unknownError instanceof Error
                                ? unknownError.message
                                : String(unknownError);
                            throw new McpError(ErrorCode.InvalidParams, `Invalid URL format: ${errorMessage}`);
                        }
                        // Analyze performance
                        const result = await this.analyzePerformance(args.url, args.iterations || 1, args.waitForNetworkIdle !== false, args.device);
                        // Create content array
                        const content = [
                            {
                                type: "text",
                                text: `# Performance Analysis: ${args.url}\n\nIterations: ${args.iterations || 1}\nAverage Load Time: ${result.metrics.loadTime.toFixed(2)}ms\n`
                            }
                        ];
                        // Add summary metrics
                        content.push({
                            type: "text",
                            text: "## Performance Metrics\n\n" +
                                "| Metric | Value |\n" +
                                "| ------ | ----- |\n" +
                                `| Page Load Time | ${result.metrics.loadTime.toFixed(2)}ms |\n` +
                                (result.metrics.firstContentfulPaint ? `| First Contentful Paint | ${result.metrics.firstContentfulPaint.toFixed(2)}ms |\n` : '') +
                                (result.metrics.largestContentfulPaint ? `| Largest Contentful Paint | ${result.metrics.largestContentfulPaint.toFixed(2)}ms |\n` : '') +
                                (result.metrics.timeToInteractive ? `| Time to Interactive | ${result.metrics.timeToInteractive.toFixed(2)}ms |\n` : '') +
                                (result.metrics.totalBlockingTime ? `| Total Blocking Time | ${result.metrics.totalBlockingTime.toFixed(2)}ms |\n` : '') +
                                `| Total Resources | ${result.metrics.resourceSummary.totalResources.toFixed(0)} |\n` +
                                `| Total Size | ${(result.metrics.resourceSummary.totalSize / (1024 * 1024)).toFixed(2)} MB |\n`
                        });
                        // Add resource summary
                        if (Object.keys(result.metrics.resourceSummary.resourcesByType).length > 0) {
                            content.push({
                                type: "text",
                                text: "## Resources by Type\n\n" +
                                    "| Type | Count |\n" +
                                    "| ---- | ----- |\n" +
                                    Object.entries(result.metrics.resourceSummary.resourcesByType)
                                        .map(([type, count]) => `| ${type} | ${count} |`)
                                        .join('\n')
                            });
                        }
                        // Add memory usage if available
                        if (result.metrics.memoryUsage) {
                            content.push({
                                type: "text",
                                text: "## Memory Usage\n\n" +
                                    "| Metric | Value |\n" +
                                    "| ------ | ----- |\n" +
                                    `| Total JS Heap | ${(result.metrics.memoryUsage.totalJSHeapSize / (1024 * 1024)).toFixed(2)} MB |\n` +
                                    `| Used JS Heap | ${(result.metrics.memoryUsage.usedJSHeapSize / (1024 * 1024)).toFixed(2)} MB |\n` +
                                    `| JS Heap Limit | ${(result.metrics.memoryUsage.jsHeapSizeLimit / (1024 * 1024)).toFixed(2)} MB |\n`
                            });
                        }
                        // Add iteration results
                        if (result.iterations.length > 1) {
                            content.push({
                                type: "text",
                                text: "## Test Iterations\n\n" +
                                    "| Iteration | Load Time | Resource Count |\n" +
                                    "| --------- | --------- | -------------- |\n" +
                                    result.iterations.map(i => `| ${i.iteration} | ${i.loadTime}ms | ${i.resourceCount} |`).join('\n')
                            });
                        }
                        // Add recommendations
                        if (result.recommendations.length > 0) {
                            content.push({
                                type: "text",
                                text: "## Recommendations\n\n" +
                                    result.recommendations.map(r => `- ${r}`).join('\n')
                            });
                        }
                        return { content };
                    }
                    catch (error) {
                        throw new McpError(ErrorCode.InternalError, `Failed to analyze performance: ${error?.message || 'Unknown error'}`);
                    }
                }
                case 'visual_comparison': {
                    try {
                        const args = request.params.arguments;
                        if (!args.url1 || !args.url2) {
                            throw new McpError(ErrorCode.InvalidParams, 'Both URLs are required');
                        }
                        // Validate URL formats
                        try {
                            new URL(args.url1);
                            new URL(args.url2);
                        }
                        catch (unknownError) {
                            const errorMessage = unknownError instanceof Error
                                ? unknownError.message
                                : String(unknownError);
                            throw new McpError(ErrorCode.InvalidParams, `Invalid URL format: ${errorMessage}`);
                        }
                        // Compare visually
                        const result = await this.compareVisually(args.url1, args.url2, args.threshold || 0.1, args.fullPage || false, args.selector);
                        // Create content array
                        const content = [
                            {
                                type: "text",
                                text: `# Visual Comparison\n\n` +
                                    `URL 1: ${args.url1}\n` +
                                    `URL 2: ${args.url2}\n` +
                                    `Threshold: ${args.threshold || 0.1}\n` +
                                    `Difference: ${(result.diffPercentage * 100).toFixed(2)}%\n` +
                                    `${result.imagesMatch ? '✅ Images match within threshold' : '❌ Images differ beyond threshold'}\n`
                            }
                        ];
                        // Add first screenshot
                        content.push({
                            type: "text",
                            text: "## URL 1"
                        });
                        content.push({
                            type: "image",
                            data: result.screenshots.url1.base64Data,
                            mimeType: "image/png"
                        });
                        // Add second screenshot
                        content.push({
                            type: "text",
                            text: "## URL 2"
                        });
                        content.push({
                            type: "image",
                            data: result.screenshots.url2.base64Data,
                            mimeType: "image/png"
                        });
                        // Add diff screenshot
                        if (result.screenshots.diff) {
                            content.push({
                                type: "text",
                                text: "## Difference (highlighted in red)"
                            });
                            content.push({
                                type: "image",
                                data: result.screenshots.diff.base64Data,
                                mimeType: "image/png"
                            });
                        }
                        // Add difference details
                        if (result.differences && result.differences.length > 0) {
                            content.push({
                                type: "text",
                                text: `## Difference Details (${result.differences.length} regions)\n\n` +
                                    "| Region | Position | Size |\n" +
                                    "| ------ | -------- | ---- |\n" +
                                    result.differences.map((diff, i) => `| Region ${i + 1} | (${diff.x}, ${diff.y}) | ${diff.width}×${diff.height} px |`).join('\n')
                            });
                        }
                        return { content };
                    }
                    catch (error) {
                        throw new McpError(ErrorCode.InternalError, `Failed to compare visually: ${error?.message || 'Unknown error'}`);
                    }
                }
                // <<< START INSERTED PLAYWRIGHT TOOL HANDLERS >>>
                case 'playwright_navigate': {
                    try {
                        const args = request.params.arguments;
                        if (!args.url)
                            throw new McpError(ErrorCode.InvalidParams, 'URL is required');
                        // Ensure browser is launched (this also creates a page)
                        const page = await this.ensureBrowser();
                        await page.goto(args.url, {
                            waitUntil: args.waitUntil || 'networkidle',
                            timeout: args.timeout || TIMEOUT_CONFIG.NAVIGATION_TIMEOUT // Configurable default timeout
                        });
                        debugSession.currentUrl = page.url(); // Update current URL
                        return { content: [{ type: 'text', text: `Navigated to ${page.url()}` }] };
                    }
                    catch (error) {
                        logToFile(`Playwright navigate error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Navigation failed: ${error.message}`);
                    }
                }
                case 'playwright_click': {
                    try {
                        const args = request.params.arguments;
                        if (!args.selector)
                            throw new McpError(ErrorCode.InvalidParams, 'Selector is required');
                        const page = ensureActivePage();
                        await page.click(args.selector);
                        await page.waitForTimeout(TIMEOUT_CONFIG.INTERACTION_DELAY); // Configurable delay for UI updates
                        return { content: [{ type: 'text', text: `Clicked element: ${args.selector}` }] };
                    }
                    catch (error) {
                        logToFile(`Playwright click error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Click failed for selector "${request.params.arguments?.selector}": ${error.message}`);
                    }
                }
                case 'playwright_iframe_click': {
                    try {
                        const args = request.params.arguments;
                        if (!args.iframeSelector || !args.selector)
                            throw new McpError(ErrorCode.InvalidParams, 'iframeSelector and selector are required');
                        const page = ensureActivePage();
                        const frame = page.frameLocator(args.iframeSelector);
                        if (!frame)
                            throw new Error(`Iframe not found: ${args.iframeSelector}`);
                        await frame.locator(args.selector).click();
                        await page.waitForTimeout(TIMEOUT_CONFIG.INTERACTION_DELAY);
                        return { content: [{ type: 'text', text: `Clicked element: ${args.selector} in iframe: ${args.iframeSelector}` }] };
                    }
                    catch (error) {
                        logToFile(`Playwright iframe click error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Iframe click failed: ${error.message}`);
                    }
                }
                case 'playwright_fill': {
                    try {
                        const args = request.params.arguments;
                        if (!args.selector || args.value === undefined)
                            throw new McpError(ErrorCode.InvalidParams, 'Selector and value are required');
                        const page = ensureActivePage();
                        await page.fill(args.selector, args.value);
                        await page.waitForTimeout(TIMEOUT_CONFIG.INTERACTION_DELAY);
                        return { content: [{ type: 'text', text: `Filled element ${args.selector}` }] };
                    }
                    catch (error) {
                        logToFile(`Playwright fill error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Fill failed for selector "${request.params.arguments?.selector}": ${error.message}`);
                    }
                }
                case 'playwright_select': {
                    try {
                        const args = request.params.arguments;
                        if (!args.selector || !args.value)
                            throw new McpError(ErrorCode.InvalidParams, 'Selector and value are required');
                        const page = ensureActivePage();
                        await page.selectOption(args.selector, args.value);
                        await page.waitForTimeout(TIMEOUT_CONFIG.INTERACTION_DELAY);
                        return { content: [{ type: 'text', text: `Selected option in ${args.selector}` }] };
                    }
                    catch (error) {
                        logToFile(`Playwright select error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Select failed for selector "${request.params.arguments?.selector}": ${error.message}`);
                    }
                }
                case 'playwright_hover': {
                    try {
                        const args = request.params.arguments;
                        if (!args.selector)
                            throw new McpError(ErrorCode.InvalidParams, 'Selector is required');
                        const page = ensureActivePage();
                        await page.hover(args.selector);
                        await page.waitForTimeout(TIMEOUT_CONFIG.INTERACTION_DELAY);
                        return { content: [{ type: 'text', text: `Hovered over element: ${args.selector}` }] };
                    }
                    catch (error) {
                        logToFile(`Playwright hover error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Hover failed for selector "${request.params.arguments?.selector}": ${error.message}`);
                    }
                }
                case 'playwright_evaluate': {
                    try {
                        const args = request.params.arguments;
                        if (!args.script)
                            throw new McpError(ErrorCode.InvalidParams, 'Script is required');
                        const page = ensureActivePage();
                        const result = await page.evaluate(args.script);
                        return { content: [{ type: 'text', text: `Executed script. Result:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`` }] };
                    }
                    catch (error) {
                        logToFile(`Playwright evaluate error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Script evaluation failed: ${error.message}`);
                    }
                }
                case 'playwright_console_logs': {
                    try {
                        const args = request.params.arguments;
                        let logsToReturn = [...consoleLogs]; // Operate on a copy
                        // Filter by type
                        if (args.type && args.type !== 'all') {
                            logsToReturn = logsToReturn.filter(log => log.startsWith(`[${args.type}]`));
                        }
                        // Apply limit
                        if (args.limit && args.limit > 0) {
                            logsToReturn = logsToReturn.slice(-args.limit);
                        }
                        // Clear logs if requested
                        if (args.clear) {
                            consoleLogs.length = 0; // Clear the original array
                            logToFile('Console logs cleared by request.');
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Console Logs (${logsToReturn.length}):\n\n${logsToReturn.join('\n') || '(No logs found)'}`
                                }]
                        };
                    }
                    catch (error) {
                        logToFile(`Playwright console logs error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Failed to retrieve console logs: ${error.message}`);
                    }
                }
                case 'playwright_get_visible_text': {
                    try {
                        const page = ensureActivePage();
                        const text = await page.locator('body').textContent(); // Get text from body
                        return { content: [{ type: 'text', text: `Visible text:\n\n${text || '(No text found)'}` }] };
                    }
                    catch (error) {
                        logToFile(`Playwright get visible text error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Failed to get visible text: ${error.message}`);
                    }
                }
                case 'playwright_get_visible_html': {
                    try {
                        const page = ensureActivePage();
                        const html = await page.content(); // Get full page HTML
                        return { content: [{ type: 'text', text: `Current page HTML:\n\n\`\`\`html\n${html}\n\`\`\`` }] };
                    }
                    catch (error) {
                        logToFile(`Playwright get visible html error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Failed to get HTML: ${error.message}`);
                    }
                }
                case 'playwright_go_back': {
                    try {
                        const page = ensureActivePage();
                        await page.goBack();
                        await page.waitForLoadState('networkidle'); // Wait for navigation
                        debugSession.currentUrl = page.url();
                        return { content: [{ type: 'text', text: `Navigated back to ${page.url()}` }] };
                    }
                    catch (error) {
                        logToFile(`Playwright go back error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Failed to go back: ${error.message}`);
                    }
                }
                case 'playwright_go_forward': {
                    try {
                        const page = ensureActivePage();
                        await page.goForward();
                        await page.waitForLoadState('networkidle'); // Wait for navigation
                        debugSession.currentUrl = page.url();
                        return { content: [{ type: 'text', text: `Navigated forward to ${page.url()}` }] };
                    }
                    catch (error) {
                        logToFile(`Playwright go forward error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Failed to go forward: ${error.message}`);
                    }
                }
                case 'playwright_press_key': {
                    try {
                        const args = request.params.arguments;
                        if (!args.key)
                            throw new McpError(ErrorCode.InvalidParams, 'Key is required');
                        const page = ensureActivePage();
                        if (args.selector) {
                            await page.press(args.selector, args.key);
                        }
                        else {
                            await page.keyboard.press(args.key);
                        }
                        await page.waitForTimeout(TIMEOUT_CONFIG.INTERACTION_DELAY);
                        return { content: [{ type: 'text', text: `Pressed key: ${args.key}` + (args.selector ? ` on ${args.selector}` : '') }] };
                    }
                    catch (error) {
                        logToFile(`Playwright press key error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Failed to press key "${request.params.arguments?.key}": ${error.message}`);
                    }
                }
                case 'playwright_drag': {
                    try {
                        const args = request.params.arguments;
                        if (!args.sourceSelector || !args.targetSelector)
                            throw new McpError(ErrorCode.InvalidParams, 'Source and target selectors are required');
                        const page = ensureActivePage();
                        await page.dragAndDrop(args.sourceSelector, args.targetSelector);
                        await page.waitForTimeout(TIMEOUT_CONFIG.INTERACTION_DELAY);
                        return { content: [{ type: 'text', text: `Dragged ${args.sourceSelector} to ${args.targetSelector}` }] };
                    }
                    catch (error) {
                        logToFile(`Playwright drag error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Drag failed: ${error.message}`);
                    }
                }
                // <<< END INSERTED PLAYWRIGHT TOOL HANDLERS >>>
                // <<< START INSERTED playwright_screenshot TOOL HANDLER >>>
                case 'playwright_screenshot': {
                    try {
                        const args = request.params.arguments;
                        if (!args.name)
                            throw new McpError(ErrorCode.InvalidParams, 'Screenshot name is required');
                        const page = ensureActivePage();
                        const screenshotName = args.name.replace(/[^a-zA-Z0-9_-]/g, '_'); // Sanitize name
                        const screenshotPath = path.join(TEMP_DIR, `${screenshotName}_${randomUUID()}.png`);
                        let screenshotData;
                        if (args.selector) {
                            const element = await page.$(args.selector);
                            if (!element) {
                                throw new Error(`Element not found: ${args.selector}`);
                            }
                            screenshotData = await element.screenshot({ path: screenshotPath });
                        }
                        else {
                            screenshotData = await page.screenshot({
                                path: screenshotPath,
                                fullPage: args.fullPage || false
                            });
                        }
                        // Get the base64 data of the screenshot
                        // If screenshot returns buffer directly (Playwright >= 1.15), use it, else read file
                        const base64Data = screenshotData ? screenshotData.toString('base64') : (await fsPromises.readFile(screenshotPath)).toString('base64');
                        // Add to screenshots collection for resource access
                        screenshots.set(screenshotName, base64Data);
                        logToFile(`Screenshot '${screenshotName}' saved to ${screenshotPath}`);
                        // Clean up the temporary file
                        await fsPromises.unlink(screenshotPath).catch(err => logToFile(`Failed to delete temp screenshot file ${screenshotPath}: ${err}`));
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Screenshot '${screenshotName}' captured. Resource URI: screenshot://${screenshotName}`
                                },
                                {
                                    type: "image",
                                    data: base64Data,
                                    mimeType: "image/png"
                                }
                            ]
                        };
                    }
                    catch (error) {
                        logToFile(`Playwright screenshot error: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Failed to take screenshot: ${error.message}`);
                    }
                }
                // <<< END INSERTED playwright_screenshot TOOL HANDLER >>>
                // <<< START INSERTION: UI Workflow Validator Implementation >>>
                case 'ui_workflow_validator': {
                    try {
                        const args = request.params.arguments;
                        if (!args.startUrl) {
                            throw new McpError(ErrorCode.InvalidParams, 'Start URL is required');
                        }
                        if (!args.taskDescription) {
                            throw new McpError(ErrorCode.InvalidParams, 'Task description is required');
                        }
                        if (!args.steps || !Array.isArray(args.steps) || args.steps.length === 0) {
                            throw new McpError(ErrorCode.InvalidParams, 'At least one step is required');
                        }
                        // Validate URL format
                        try {
                            new URL(args.startUrl);
                        }
                        catch (error) {
                            throw new McpError(ErrorCode.InvalidParams, `Invalid URL format: ${args.startUrl}`);
                        }
                        // Validate the steps
                        for (const step of args.steps) {
                            if (!step.action) {
                                throw new McpError(ErrorCode.InvalidParams, 'Each step must have an action');
                            }
                            switch (step.action) {
                                case 'navigate':
                                    if (!step.url) {
                                        throw new McpError(ErrorCode.InvalidParams, 'URL is required for navigate');
                                    }
                                    try {
                                        new URL(step.url);
                                    }
                                    catch (error) {
                                        throw new McpError(ErrorCode.InvalidParams, `Invalid URL format in navigate action: ${step.url}`);
                                    }
                                    break;
                                case 'click':
                                    if (!step.selector) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Selector is required for click');
                                    }
                                    break;
                                case 'fill':
                                    if (!step.selector || step.value === undefined) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Selector and value are required for fill');
                                    }
                                    break;
                                case 'select':
                                    if (!step.selector || step.value === undefined) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Selector and value are required for select');
                                    }
                                    break;
                                case 'hover':
                                    if (!step.selector) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Selector is required for hover');
                                    }
                                    break;
                                case 'wait':
                                    // Wait action uses fixed 3 second timeout
                                    break;
                                case 'evaluate':
                                    if (!step.script) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Script is required for evaluate action');
                                    }
                                    break;
                                case 'screenshot':
                                    if (!step.description) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Description is required for screenshot action');
                                    }
                                    break;
                                case 'verifyText':
                                    if (!step.selector || step.value === undefined) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Selector and value are required for verifyText');
                                    }
                                    break;
                                case 'verifyElementVisible':
                                    if (!step.selector) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Selector is required for verifyElementVisible');
                                    }
                                    break;
                                case 'verifyElementNotVisible':
                                    if (!step.selector) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Selector is required for verifyElementNotVisible');
                                    }
                                    break;
                                case 'verifyUrl':
                                    if (!step.value) {
                                        throw new McpError(ErrorCode.InvalidParams, 'Expected URL value is required for verifyUrl');
                                    }
                                    break;
                                default:
                                    throw new Error(`Unsupported action: ${step.action}`);
                            }
                        }
                        // Validate the navigation flow
                        const result = await this.validateUIWorkflow(args.startUrl, args.taskDescription, args.steps, args.captureScreenshots, args.device);
                        // Create content array
                        const content = [
                            {
                                type: "text",
                                text: `# UI Workflow Validation ${result.overallStatus === "Success" ? '✅' : '❌'}\n\nStarting URL: ${args.startUrl}\nTask: ${args.taskDescription}\nOverall Status: ${result.overallStatus}\n`
                            }
                        ];
                        // Add a summary table
                        let summaryTable = "| Step | Action | Status | Details |\n";
                        summaryTable += "| ---- | ------ | ------ | ------- |\n";
                        for (const step of result.steps) {
                            const status = step.status === "Success" ? '✅' : step.status === "Skipped" ? '⚠️' : '❌';
                            // Fix: Access original step data from args for summary table details if needed, or simplify details
                            let details = step.error || step.details || step.description; // Simplified details
                            // Example of accessing original args if complex details were needed:
                            // const originalStep = args.steps[step.stepNumber -1] // Assuming stepNumber is 1-based
                            // details = step.error ? `Error: ${step.error}` : `Action: ${originalStep?.action}, Selector: ${originalStep?.selector}`
                            summaryTable += `| ${step.stepNumber} | ${step.action} | ${status} | ${details.substring(0, 100)}${details.length > 100 ? '...' : ''} |\n`; // Limit details length
                        }
                        content.push({
                            type: "text",
                            text: summaryTable
                        });
                        // Add results for each step
                        content.push({
                            type: "text",
                            text: "## Detailed Steps"
                        });
                        for (const step of result.steps) {
                            // Step header with status
                            content.push({
                                type: "text",
                                text: `### Step ${step.stepNumber}: ${step.action} ${step.status === "Success" ? '✅' : step.status === "Skipped" ? '⚠️' : '❌'}\n\n` +
                                    (step.status === "Skipped" ? `Skipped: ${step.description}\n\n` : '') +
                                    (step.status === "Failure" ? `Failed: ${step.error}\n\n` : '') +
                                    (step.status === "Success" ? `Success: ${step.description}\n\n` : '')
                            });
                            // Add step details
                            // Fix: Access original step data from args for details if needed
                            const originalStepForDetails = args.steps[step.stepNumber - 1]; // Assuming stepNumber is 1-based
                            if (originalStepForDetails?.selector) {
                                content.push({
                                    type: "text",
                                    text: `Selector: \`${originalStepForDetails.selector}\`\n`
                                });
                            }
                            if (originalStepForDetails?.value !== undefined) { // Check explicitly for undefined
                                content.push({
                                    type: "text",
                                    text: `Value: \`${originalStepForDetails.value}\`\n`
                                });
                            }
                            // Add screenshot if available
                            if (step.screenshotBase64) {
                                content.push({
                                    type: "image",
                                    data: step.screenshotBase64,
                                    mimeType: "image/png"
                                });
                            }
                            // Add details
                            if (step.details) {
                                content.push({
                                    type: "text",
                                    text: `Details: ${step.details}\n\n`
                                });
                            }
                        }
                        // Add summary of console errors if available
                        if (result.steps.some(s => s.error)) {
                            const allErrors = result.steps
                                .filter(s => s.error)
                                .map(s => `- ${s.error}\n`);
                            if (allErrors.length > 0) {
                                content.push({
                                    type: "text",
                                    text: `## All Errors (${allErrors.length})\n\n` +
                                        allErrors.join('\n')
                                });
                            }
                        }
                        return { content };
                    }
                    catch (error) {
                        throw new McpError(ErrorCode.InternalError, `Failed to validate UI workflow: ${error?.message || 'Unknown error'}`);
                    }
                }
                // <<< END INSERTION: UI Workflow Validator Implementation >>>
                case 'tunnel_helper': {
                    try {
                        const args = TunnelHelperSchema.parse(request.params.arguments);
                        const { localPort, action, tunnelUrl } = args;
                        switch (action) {
                            case 'guide': {
                                // Generate instructions for the user
                                const instructions = `
# Expose Local Port ${localPort} for Remote Access

Since VUDA is running remotely, you need to expose your local port. Here are 3 options:

## Option 1: Cloudflare Tunnel (Recommended - No account needed)
\`\`\`bash
# Install cloudflared (if not already installed)
# macOS: brew install cloudflared
# Linux: Download from https://github.com/cloudflare/cloudflared/releases

# Run the tunnel
cloudflared tunnel --url http://localhost:${localPort}
\`\`\`

This will output a URL like: https://example-random.trycloudflare.com

## Option 2: ngrok (Requires free account)
\`\`\`bash
# Install ngrok from https://ngrok.com/download
# Run the tunnel
ngrok http ${localPort}
\`\`\`

## Option 3: localtunnel (npm package)
\`\`\`bash
# Install localtunnel
npm install -g localtunnel

# Run the tunnel
lt --port ${localPort}
\`\`\`

## Next Steps:
1. Copy the generated tunnel URL
2. Use tunnel_helper with action='store' to save it:
   tunnel_helper({ localPort: ${localPort}, action: 'store', tunnelUrl: 'YOUR_TUNNEL_URL' })
3. VUDA will use this URL for all subsequent operations on port ${localPort}
`;
                                return {
                                    content: [{
                                            type: 'text',
                                            text: instructions
                                        }]
                                };
                            }
                            case 'store': {
                                if (!tunnelUrl) {
                                    throw new McpError(ErrorCode.InvalidParams, 'tunnelUrl is required for store action');
                                }
                                // Store the tunnel URL
                                tunnelUrls.set(localPort, tunnelUrl);
                                // Also save to debug memory for persistence
                                debugMemory.set(`tunnel_${localPort}`, {
                                    port: localPort,
                                    url: tunnelUrl,
                                    timestamp: new Date().toISOString()
                                });
                                return {
                                    content: [{
                                            type: 'text',
                                            text: `✅ Tunnel URL stored for port ${localPort}: ${tunnelUrl}\n\nYou can now use this URL in place of http://localhost:${localPort} for all VUDA operations.`
                                        }]
                                };
                            }
                            case 'retrieve': {
                                const storedUrl = tunnelUrls.get(localPort);
                                if (!storedUrl) {
                                    return {
                                        content: [{
                                                type: 'text',
                                                text: `No tunnel URL stored for port ${localPort}. Use action='guide' for instructions on creating a tunnel.`
                                            }]
                                    };
                                }
                                return {
                                    content: [{
                                            type: 'text',
                                            text: `Tunnel URL for port ${localPort}: ${storedUrl}`
                                        }]
                                };
                            }
                        }
                    }
                    catch (error) {
                        logToFile(`Error in tunnel_helper: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Tunnel helper failed: ${error.message}`);
                    }
                }
                case 'debug_memory': {
                    try {
                        const args = DebugMemorySchema.parse(request.params.arguments);
                        const { action, key, value, category } = args;
                        switch (action) {
                            case 'save': {
                                if (!key) {
                                    throw new McpError(ErrorCode.InvalidParams, 'key is required for save action');
                                }
                                const memoryItem = {
                                    key,
                                    value,
                                    category: category || 'general',
                                    timestamp: new Date().toISOString()
                                };
                                debugMemory.set(key, memoryItem);
                                return {
                                    content: [{
                                            type: 'text',
                                            text: `✅ Saved to debug memory:\nKey: ${key}\nCategory: ${memoryItem.category}\nTimestamp: ${memoryItem.timestamp}`
                                        }]
                                };
                            }
                            case 'retrieve': {
                                if (!key) {
                                    throw new McpError(ErrorCode.InvalidParams, 'key is required for retrieve action');
                                }
                                const item = debugMemory.get(key);
                                if (!item) {
                                    return {
                                        content: [{
                                                type: 'text',
                                                text: `No memory found for key: ${key}`
                                            }]
                                    };
                                }
                                return {
                                    content: [{
                                            type: 'text',
                                            text: JSON.stringify(item, null, 2)
                                        }]
                                };
                            }
                            case 'list': {
                                const items = [];
                                const categoryFilter = category;
                                debugMemory.forEach((item, key) => {
                                    if (!categoryFilter || item.category === categoryFilter) {
                                        items.push({
                                            key,
                                            category: item.category,
                                            timestamp: item.timestamp,
                                            preview: typeof item.value === 'string'
                                                ? item.value.substring(0, 50) + (item.value.length > 50 ? '...' : '')
                                                : JSON.stringify(item.value).substring(0, 50) + '...'
                                        });
                                    }
                                });
                                if (items.length === 0) {
                                    return {
                                        content: [{
                                                type: 'text',
                                                text: categoryFilter
                                                    ? `No items found in category: ${categoryFilter}`
                                                    : 'Debug memory is empty'
                                            }]
                                    };
                                }
                                return {
                                    content: [{
                                            type: 'text',
                                            text: `Debug Memory Items${categoryFilter ? ` (${categoryFilter})` : ''}:\n\n${items.map(item => `📝 ${item.key}\n   Category: ${item.category}\n   Saved: ${item.timestamp}\n   Preview: ${item.preview}`).join('\n\n')}`
                                        }]
                                };
                            }
                            case 'clear': {
                                const size = debugMemory.size;
                                if (category) {
                                    // Clear only specific category
                                    const keysToDelete = [];
                                    debugMemory.forEach((item, key) => {
                                        if (item.category === category) {
                                            keysToDelete.push(key);
                                        }
                                    });
                                    keysToDelete.forEach(key => debugMemory.delete(key));
                                    return {
                                        content: [{
                                                type: 'text',
                                                text: `✅ Cleared ${keysToDelete.length} items from category: ${category}`
                                            }]
                                    };
                                }
                                else {
                                    // Clear all
                                    debugMemory.clear();
                                    return {
                                        content: [{
                                                type: 'text',
                                                text: `✅ Cleared all ${size} items from debug memory`
                                            }]
                                    };
                                }
                            }
                        }
                    }
                    catch (error) {
                        logToFile(`Error in debug_memory: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Debug memory operation failed: ${error.message}`);
                    }
                }
                case 'sitemap_crawler': {
                    try {
                        const args = request.params.arguments;
                        const { url, maxDepth = 3, includeText = true, sameDomainOnly = true, outputFormat = 'markdown' } = args;
                        logToFile(`Starting sitemap crawl from: ${url}`);
                        // Initialize crawler data
                        const visitedUrls = new Set();
                        const brokenLinks = new Set();
                        const sitemapData = new Map();
                        // Parse base URL for domain checking
                        const baseUrl = new URL(url);
                        const baseDomain = baseUrl.hostname;
                        // Recursive crawl function
                        async function crawlUrl(pageUrl, depth) {
                            if (depth > maxDepth || visitedUrls.has(pageUrl)) {
                                return;
                            }
                            visitedUrls.add(pageUrl);
                            try {
                                // Create new page for each crawl to avoid conflicts
                                const crawlPage = await browserInstance.newPage();
                                try {
                                    // Navigate with configurable timeout
                                    const response = await crawlPage.goto(pageUrl, {
                                        waitUntil: 'domcontentloaded',
                                        timeout: TIMEOUT_CONFIG.NAVIGATION_TIMEOUT
                                    });
                                    const status = response?.status() || 0;
                                    if (status >= 400) {
                                        brokenLinks.add(pageUrl);
                                    }
                                    // Wait a bit for dynamic content
                                    await crawlPage.waitForTimeout(TIMEOUT_CONFIG.UI_UPDATE_WAIT);
                                    // Get page title
                                    const title = await crawlPage.title();
                                    // Get all links
                                    const links = await crawlPage.evaluate(() => {
                                        const anchors = Array.from(document.querySelectorAll('a[href]'));
                                        return anchors
                                            .map(a => {
                                            const href = a.href;
                                            try {
                                                const url = new URL(href);
                                                return url.href;
                                            }
                                            catch {
                                                return null;
                                            }
                                        })
                                            .filter(href => href !== null);
                                    });
                                    // Get visible text if requested
                                    let pageText = '';
                                    if (includeText) {
                                        pageText = await crawlPage.evaluate(() => {
                                            // Remove script and style elements
                                            const scripts = document.querySelectorAll('script, style');
                                            scripts.forEach(el => el.remove());
                                            // Get text content
                                            const text = document.body.innerText || document.body.textContent || '';
                                            // Clean up whitespace
                                            return text
                                                .split('\n')
                                                .map(line => line.trim())
                                                .filter(line => line.length > 0)
                                                .join('\n');
                                        });
                                    }
                                    // Store page data
                                    sitemapData.set(pageUrl, {
                                        title,
                                        links,
                                        text: pageText,
                                        status
                                    });
                                    // Filter links for crawling
                                    const linksToVisit = links.filter((link) => {
                                        try {
                                            const linkUrl = new URL(link);
                                            // Skip non-http(s) protocols
                                            if (!link.startsWith('http://') && !link.startsWith('https://')) {
                                                return false;
                                            }
                                            // Check same domain if required
                                            if (sameDomainOnly && linkUrl.hostname !== baseDomain) {
                                                return false;
                                            }
                                            // Skip already visited
                                            if (visitedUrls.has(link)) {
                                                return false;
                                            }
                                            // Skip anchors on same page
                                            if (linkUrl.href.split('#')[0] === pageUrl.split('#')[0]) {
                                                return false;
                                            }
                                            return true;
                                        }
                                        catch {
                                            return false;
                                        }
                                    });
                                    // Recursively crawl linked pages
                                    for (const link of linksToVisit) {
                                        await crawlUrl(link, depth + 1);
                                    }
                                }
                                finally {
                                    await crawlPage.close();
                                }
                            }
                            catch (error) {
                                logToFile(`Error crawling ${pageUrl}: ${error.message}`);
                                sitemapData.set(pageUrl, {
                                    title: 'Error',
                                    links: [],
                                    status: 0,
                                    error: error.message
                                });
                                brokenLinks.add(pageUrl);
                            }
                        }
                        // Start crawling
                        await crawlUrl(url, 0);
                        // Generate output based on format
                        let output = '';
                        if (outputFormat === 'json') {
                            const result = {
                                totalPages: sitemapData.size,
                                brokenLinks: Array.from(brokenLinks),
                                pages: Object.fromEntries(sitemapData)
                            };
                            output = JSON.stringify(result, null, 2);
                        }
                        else if (outputFormat === 'text') {
                            output = `SITEMAP REPORT\n`;
                            output += `==============\n\n`;
                            output += `Total Pages Crawled: ${sitemapData.size}\n`;
                            output += `Broken Links Found: ${brokenLinks.size}\n\n`;
                            for (const [pageUrl, data] of sitemapData) {
                                output += `URL: ${pageUrl}\n`;
                                output += `Title: ${data.title}\n`;
                                output += `Status: ${data.status}\n`;
                                output += `Links: ${data.links.length}\n`;
                                if (data.error) {
                                    output += `Error: ${data.error}\n`;
                                }
                                if (includeText && data.text) {
                                    output += `Text Preview: ${data.text.substring(0, 200)}...\n`;
                                }
                                output += `\n`;
                            }
                        }
                        else { // markdown
                            output = `# Sitemap Report\n\n`;
                            output += `## Summary\n\n`;
                            output += `- **Total Pages Crawled**: ${sitemapData.size}\n`;
                            output += `- **Broken Links Found**: ${brokenLinks.size}\n`;
                            output += `- **Start URL**: ${url}\n`;
                            output += `- **Max Depth**: ${maxDepth}\n\n`;
                            if (brokenLinks.size > 0) {
                                output += `## ⚠️ Broken Links\n\n`;
                                for (const brokenLink of brokenLinks) {
                                    output += `- ${brokenLink}\n`;
                                }
                                output += `\n`;
                            }
                            output += `## Page Details\n\n`;
                            // Sort pages by URL for consistent output
                            const sortedPages = Array.from(sitemapData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                            for (const [pageUrl, data] of sortedPages) {
                                output += `### ${data.title || 'Untitled Page'}\n\n`;
                                output += `- **URL**: ${pageUrl}\n`;
                                output += `- **Status**: ${data.status || 'Unknown'}\n`;
                                output += `- **Total Links**: ${data.links.length}\n`;
                                if (data.error) {
                                    output += `- **Error**: ${data.error}\n`;
                                }
                                if (data.links.length > 0) {
                                    output += `\n**Outgoing Links**:\n`;
                                    // Limit to first 10 links to avoid huge output
                                    const displayLinks = data.links.slice(0, 10);
                                    for (const link of displayLinks) {
                                        output += `  - ${link}\n`;
                                    }
                                    if (data.links.length > 10) {
                                        output += `  - ... and ${data.links.length - 10} more\n`;
                                    }
                                }
                                if (includeText && data.text) {
                                    output += `\n**Page Content Preview**:\n\n`;
                                    output += `\`\`\`\n${data.text.substring(0, 500)}${data.text.length > 500 ? '...' : ''}\n\`\`\`\n`;
                                }
                                output += `\n---\n\n`;
                            }
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: output
                                }]
                        };
                    }
                    catch (error) {
                        logToFile(`Error in sitemap_crawler: ${error}`);
                        throw new McpError(ErrorCode.InternalError, `Sitemap crawl failed: ${error.message}`);
                    }
                }
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool ${request.params.name}`);
            }
        });
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
    // <<< START INSERTION: UI Workflow Validator Implementation >>>
    async validateUIWorkflow(startUrl, taskDescription, steps, captureScreenshots, // Removed default value assignment
    deviceName) {
        logToFile(`Starting UI Workflow Validation: ${taskDescription}`);
        const page = await this.ensureBrowser(1280, 800, deviceName);
        const stepResults = [];
        let overallStatus = "Success";
        try {
            // Initial navigation
            logToFile(`Navigating to start URL: ${startUrl}`);
            await page.goto(startUrl, { waitUntil: 'networkidle' });
            debugSession.currentUrl = page.url();
            // Process each step
            for (const [index, step] of steps.entries()) {
                const stepNumber = index + 1;
                let stepStatus = "Success";
                let stepError;
                let stepDetails;
                let stepScreenshotPath;
                let stepScreenshotBase64;
                logToFile(`Executing Step ${stepNumber}: ${step.description} (${step.action})`);
                try {
                    // Perform action or verification
                    switch (step.action) {
                        case 'navigate':
                            if (!step.url)
                                throw new Error('URL is required for navigate');
                            await page.goto(step.url, { waitUntil: 'networkidle' });
                            debugSession.currentUrl = page.url();
                            stepDetails = `Navigated to ${page.url()}`;
                            break;
                        case 'click':
                            if (!step.selector)
                                throw new Error('Selector is required for click');
                            await page.click(step.selector);
                            stepDetails = `Clicked: ${step.selector}`;
                            break;
                        case 'fill':
                            if (!step.selector || step.value === undefined)
                                throw new Error('Selector and value required for fill');
                            await page.fill(step.selector, step.value);
                            stepDetails = `Filled ${step.selector}`;
                            break;
                        case 'select':
                            if (!step.selector || step.value === undefined)
                                throw new Error('Selector and value required for select');
                            await page.selectOption(step.selector, step.value);
                            stepDetails = `Selected in ${step.selector}`;
                            break;
                        case 'hover':
                            if (!step.selector)
                                throw new Error('Selector is required for hover');
                            await page.hover(step.selector);
                            stepDetails = `Hovered ${step.selector}`;
                            break;
                        case 'wait':
                            await page.waitForTimeout(TIMEOUT_CONFIG.STABILITY_WAIT); // Configurable stability wait
                            stepDetails = `Waited 3000ms`;
                            break;
                        case 'evaluate':
                            if (!step.script)
                                throw new Error('Script is required for evaluate');
                            const result = await page.evaluate(step.script);
                            stepDetails = `Evaluated script. Result: ${JSON.stringify(result)}`;
                            break;
                        case 'screenshot':
                            const name = step.description.replace(/[^a-zA-Z0-9_-]/g, '_') || `step_${stepNumber}`;
                            const { base64Data, path } = await this._takePlaywrightScreenshot(page, name, false, step.selector);
                            stepScreenshotBase64 = base64Data;
                            stepScreenshotPath = path; // Store path for potential later use if needed
                            stepDetails = `Took screenshot: ${name}`;
                            break;
                        case 'verifyText':
                            if (!step.selector || step.value === undefined)
                                throw new Error('Selector and value required for verifyText');
                            const elementText = await page.textContent(step.selector);
                            if (elementText === null || !elementText.includes(step.value)) {
                                throw new Error(`Verification failed: Expected text "${step.value}" not found in ${step.selector}. Actual: "${elementText}"`);
                            }
                            stepDetails = `Verified text "${step.value}" in ${step.selector}`;
                            break;
                        case 'verifyElementVisible':
                            if (!step.selector)
                                throw new Error('Selector is required for verifyElementVisible');
                            await page.waitForSelector(step.selector, { state: 'visible', timeout: TIMEOUT_CONFIG.SELECTOR_TIMEOUT });
                            stepDetails = `Verified element visible: ${step.selector}`;
                            break;
                        case 'verifyElementNotVisible':
                            if (!step.selector)
                                throw new Error('Selector is required for verifyElementNotVisible');
                            await page.waitForSelector(step.selector, { state: 'hidden', timeout: TIMEOUT_CONFIG.SELECTOR_TIMEOUT });
                            stepDetails = `Verified element not visible: ${step.selector}`;
                            break;
                        case 'verifyUrl':
                            if (!step.value)
                                throw new Error('Expected URL value is required for verifyUrl');
                            const currentUrl = page.url();
                            if (!currentUrl.includes(step.value)) {
                                throw new Error(`URL verification failed: Expected URL to include "${step.value}", but was "${currentUrl}"`);
                            }
                            stepDetails = `Verified URL includes "${step.value}"`;
                            break;
                        default:
                            throw new Error(`Unsupported action: ${step.action}`);
                    }
                    await page.waitForTimeout(TIMEOUT_CONFIG.INTERACTION_DELAY); // Configurable delay after action
                }
                catch (error) {
                    stepStatus = "Failure";
                    stepError = error.message;
                    logToFile(`Step ${stepNumber} failed: ${stepError}`);
                    if (!step.isOptional) {
                        overallStatus = "Failure";
                    }
                }
                // Capture screenshot based on status and configuration
                if (captureScreenshots === "all" || (captureScreenshots === "failure" && stepStatus === "Failure")) {
                    if (!stepScreenshotBase64) { // Avoid taking screenshot twice if action was 'screenshot'
                        try {
                            const name = `step_${stepNumber}_${stepStatus}`.toLowerCase();
                            const { base64Data, path } = await this._takePlaywrightScreenshot(page, name, false);
                            stepScreenshotBase64 = base64Data;
                            stepScreenshotPath = path;
                        }
                        catch (screenshotError) {
                            logToFile(`Failed to take screenshot for step ${stepNumber}: ${screenshotError.message}`);
                            // Don't fail the step itself for a screenshot error, just log it
                        }
                    }
                }
                stepResults.push({
                    stepNumber,
                    description: step.description,
                    action: step.action,
                    status: stepStatus,
                    error: stepError,
                    screenshotPath: stepScreenshotPath, // Keep path for internal use if needed
                    screenshotBase64: stepScreenshotBase64,
                    details: stepDetails,
                });
                // Stop processing if a non-optional step failed
                if (overallStatus === "Failure" && !step.isOptional) {
                    logToFile(`Workflow stopped due to failure at non-optional Step ${stepNumber}`);
                    break;
                }
            }
        }
        catch (initialError) {
            logToFile(`Workflow failed during initial setup or navigation: ${initialError.message}`);
            overallStatus = "Failure";
            // Add a step indicating the initial failure
            stepResults.push({
                stepNumber: 0,
                description: "Workflow Initialization",
                action: "setup",
                status: "Failure",
                error: initialError.message,
            });
        }
        logToFile(`UI Workflow Validation finished with status: ${overallStatus}`);
        return {
            taskDescription,
            overallStatus,
            steps: stepResults,
        };
    }
    // Helper function for taking Playwright screenshots and managing resources
    async _takePlaywrightScreenshot(page, name, fullPage = false, selector) {
        const screenshotName = name.replace(/[^a-zA-Z0-9_-]/g, '_'); // Sanitize name
        const fileUuid = randomUUID();
        const screenshotPath = path.join(TEMP_DIR, `${screenshotName}_${fileUuid}.png`);
        let screenshotBuffer;
        if (selector) {
            const element = await page.$(selector);
            if (!element) {
                throw new Error(`Element not found for screenshot: ${selector}`);
            }
            screenshotBuffer = await element.screenshot({ path: screenshotPath });
        }
        else {
            screenshotBuffer = await page.screenshot({
                path: screenshotPath,
                fullPage: fullPage
            });
        }
        const base64Data = screenshotBuffer ? screenshotBuffer.toString('base64') : (await fsPromises.readFile(screenshotPath)).toString('base64');
        const resourceUri = `screenshot://${screenshotName}_${fileUuid}`;
        screenshots.set(resourceUri.replace('screenshot://', ''), base64Data); // Use URI as key
        logToFile(`Screenshot '${screenshotName}' saved to ${screenshotPath}. Resource URI: ${resourceUri}`);
        // Clean up the temporary file
        await fsPromises.unlink(screenshotPath).catch(err => logToFile(`Failed to delete temp screenshot file ${screenshotPath}: ${err}`));
        return { path: screenshotPath, base64Data, resourceUri };
    }
}
// Start the server
new AIVisionDebugServer().run().catch((error) => {
    console.error('[AIVisionDebugServer]', error);
    process.exit(1);
});
