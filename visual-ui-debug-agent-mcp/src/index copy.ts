#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { chromium } from 'playwright';

const TEMP_DIR = path.join(os.tmpdir(), 'ai-vision-debug');
const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads');

// Set up logging to a file instead of console
const logDir = path.join(os.tmpdir(), 'ai-vision-debug-logs');
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (error) {
  // Silently fail if we can't create the log directory
}

const logFile = path.join(logDir, 'ai-vision-debug.log');

function logToFile(message: string): void {
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} - ${message}\n`);
  } catch (error) {
    // Silently fail if we can't write to the log file
  }
}

// Session state to track current debugging session
interface DebugSession {
  currentUrl: string | null;
  lastScreenshotPath: string | null;
  debugHistory: string[];
}

// Initialize debug session
const debugSession: DebugSession = {
  currentUrl: null,
  lastScreenshotPath: null,
  debugHistory: []
};

// Add schema for URL screenshot
const ScreenshotUrlRequestSchema = z.object({
  url: z.string().describe("URL to capture a screenshot of (e.g., http://localhost:4999, https://google.com)"),
  fullPage: z.boolean().optional().describe("Whether to capture full page or just viewport. Default: false"),
  waitForSelector: z.string().optional().describe("Optional CSS selector to wait for before taking screenshot"),
  waitTime: z.number().optional().describe("Time to wait in milliseconds before taking screenshot. Default: 1000")
});

// Define interface for batch screenshots
interface BatchScreenshotItem {
  url: string;
  path?: string;
  screenshotPath?: string;
  base64Data?: string;
}

// Add schema for batch screenshots
const BatchScreenshotUrlsRequestSchema = z.object({
  urls: z.array(z.string()).describe("List of URLs to capture screenshots of"),
  paths: z.array(z.string()).optional().describe("Optional list of paths to label the screenshots with"),
  fullPage: z.boolean().optional().describe("Whether to capture full page or just viewport. Default: false"),
  waitTime: z.number().optional().describe("Time to wait in milliseconds before taking each screenshot. Default: 1000"),
  gridSize: z.number().optional().describe("Size of the grid (e.g., 2 for 2x2, 4 for 4x4). Default: 2")
});

class AIVisionDebugServer {
  private server: Server;
  private browserInstance: any = null;
  private browserContext: any = null;

  constructor() {
    this.server = new Server(
      {
        name: 'ai-vision-debug',
        version: '0.2.0',
      },
      {
        capabilities: {
          tools: {
            screenshot_url: true,
            display_last_screenshot: true,
            batch_screenshot_urls: true,
            screenshot_local_files: true
          },
        },
      }
    );

    this.setupToolHandlers();
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  private async ensureTempDir() {
    try {
      await fsPromises.access(TEMP_DIR);
    } catch {
      await fsPromises.mkdir(TEMP_DIR, { recursive: true });
    }
  }

  private async cleanup() {
    if (this.browserInstance) {
      await this.browserInstance.close();
    }
    await this.server.close();
  }

  /**
   * Take a screenshot of a URL using Playwright
   */
  private async screenshotUrl(
    url: string,
    fullPage: boolean = false,
    waitForSelector?: string,
    waitTime: number = 1000
  ): Promise<{ path: string, fileUuid: string, base64Data: string }> {
    try {
      logToFile(`Taking screenshot of URL: ${url}`);
      
      // Initialize browser if not already done
      if (!this.browserInstance) {
        logToFile('Initializing browser...');
        this.browserInstance = await chromium.launch({
          headless: true
        });
        this.browserContext = await this.browserInstance.newContext({
          viewport: { width: 1280, height: 800 },
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
        });
      }

      // Create a new page
      const page = await this.browserContext.newPage();
      
      // Navigate to the URL
      await page.goto(url, { waitUntil: 'networkidle' });
      
      // Wait for specified time
      await page.waitForTimeout(waitTime);
      
      // Wait for selector if specified
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 10000 });
      }
      
      // Ensure the temp directory exists
      await this.ensureTempDir();
      
      // Generate a UUID for the file
      const fileUuid = randomUUID();
      const screenshotPath = path.join(TEMP_DIR, `screenshot_${fileUuid}.png`);
      
      // Take the screenshot
      await page.screenshot({
        path: screenshotPath,
        fullPage: fullPage
      });
      
      // Get the base64 data of the screenshot
      const buffer = await fsPromises.readFile(screenshotPath);
      const base64Data = buffer.toString('base64');
      
      // Close the page but keep browser open for future requests
      await page.close();
      
      // Update the debug session
      debugSession.currentUrl = url;
      debugSession.lastScreenshotPath = screenshotPath;
      debugSession.debugHistory.push(`Screenshot taken of ${url}`);
      
      logToFile(`Screenshot saved to ${screenshotPath}`);
      
      return { path: screenshotPath, fileUuid, base64Data };
    } catch (error: any) {
      logToFile(`Error taking screenshot: ${error}`);
      throw new Error(`Failed to take screenshot of URL ${url}: ${error.message}`);
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'screenshot_url',
          description: 'Take a screenshot of a URL using a web browser',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL to capture a screenshot of (e.g., http://localhost:4999, https://google.com)'
              },
              fullPage: {
                type: 'boolean',
                description: 'Whether to capture full page or just viewport. Default: false'
              },
              waitForSelector: {
                type: 'string',
                description: 'Optional CSS selector to wait for before taking screenshot'
              },
              waitTime: {
                type: 'number',
                description: 'Time to wait in milliseconds before taking screenshot. Default: 1000'
              }
            },
            required: ['url']
          }
        },
        {
          name: 'display_last_screenshot',
          description: 'Display the last screenshot taken',
          inputSchema: {
            type: 'object',
            properties: {
              random_string: {
                type: 'string',
                description: 'Dummy parameter for no-parameter tools'
              }
            },
            required: []
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
                description: 'Time to wait in milliseconds before taking each screenshot. Default: 1000'
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
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'screenshot_url': {
          try {
            const args = request.params.arguments as { 
              url: string; 
              fullPage?: boolean;
              waitForSelector?: string;
              waitTime?: number;
            };

            if (!args.url) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'URL is required'
              );
            }
            
            // Validate URL format
            try {
              new URL(args.url);
            } catch (error) {
              throw new McpError(
                ErrorCode.InvalidParams,
                `Invalid URL format: ${args.url}`
              );
            }
            
            // Take screenshot
            const screenshot = await this.screenshotUrl(
              args.url, 
              args.fullPage || false,
              args.waitForSelector,
              args.waitTime || 1000
            );
            
            return {
              content: [
                {
                  type: 'text',
                  text: `Screenshot captured from URL: ${args.url}`
                },
                {
                  type: 'image',
                  data: screenshot.base64Data,
                  mimeType: 'image/png'
                },
                {
                  type: 'text',
                  text: `Screenshot saved to: ${screenshot.path}`
                }
              ]
            };
          } catch (error: any) {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to capture screenshot: ${error?.message || 'Unknown error'}`
            );
          }
        }
        
        case 'display_last_screenshot': {
          try {
            if (!debugSession.lastScreenshotPath) {
            return {
              content: [
                {
                  type: 'text',
                    text: 'No screenshot available. Please use screenshot_url to take a screenshot first.'
                  }
                ]
              };
            }
            
            const buffer = await fsPromises.readFile(debugSession.lastScreenshotPath);
            const base64Data = buffer.toString('base64');
            
            return {
              content: [
                {
                  type: 'text',
                  text: `Last screenshot from: ${debugSession.currentUrl || 'Unknown URL'}`
                },
                {
                  type: 'image',
                  data: base64Data,
                  mimeType: 'image/png'
                },
                {
                  type: 'text',
                  text: `Screenshot location: ${debugSession.lastScreenshotPath}`
                }
              ]
            };
          } catch (error: any) {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to display screenshot: ${error?.message || 'Unknown error'}`
            );
          }
        }

        case 'batch_screenshot_urls': {
          try {
            const args = request.params.arguments as { 
              urls: string[];
              paths?: string[];
              fullPage?: boolean;
              waitTime?: number;
              gridSize?: number;
            };
            
            if (!args.urls || !Array.isArray(args.urls) || args.urls.length === 0) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'At least one URL is required'
              );
            }

            // Limit the number of URLs to prevent abuse
            const maxUrls = 16; // Maximum 4x4 grid
            const urls = args.urls.slice(0, maxUrls);
            
            // Process paths if provided
            let paths: string[] = [];
            if (args.paths && Array.isArray(args.paths)) {
              paths = args.paths.slice(0, urls.length);
            } else {
              // Generate default paths based on URL
              paths = urls.map(url => {
                try {
                  const urlObj = new URL(url);
                  return urlObj.pathname === '/' ? urlObj.hostname : urlObj.pathname;
                } catch (e) {
                  return url;
                }
              });
            }
            
            // Set up batch items
            const batchItems: BatchScreenshotItem[] = urls.map((url, index) => ({
              url,
              path: paths[index] || url
            }));
            
            // Take screenshots in sequence
            for (const item of batchItems) {
              try {
                const screenshot = await this.screenshotUrl(
                  item.url, 
                  args.fullPage || false,
                  undefined,
                  args.waitTime || 1000
                );
                
                item.screenshotPath = screenshot.path;
                item.base64Data = screenshot.base64Data;
              } catch (error: any) {
                logToFile(`Error taking screenshot of ${item.url}: ${error}`);
                // Continue with other URLs even if one fails
              }
            }
            
            // Filter out items without screenshots
            const successfulItems = batchItems.filter(item => item.base64Data);
            
            if (successfulItems.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                    text: 'Failed to take any screenshots. Please check the URLs and try again.'
                  }
                ]
              };
            }
            
            // Create content array with intro text
            const content: any[] = [
              {
                type: 'text',
                text: `Captured ${successfulItems.length} screenshots out of ${urls.length} URLs requested:`
                }
            ];
            
            // Determine grid size
            const gridSize = args.gridSize || 2;
            const rowSize = Math.min(gridSize, 4); // Maximum 4 columns
            
            // Add images grouped by row
            for (let i = 0; i < successfulItems.length; i += rowSize) {
              const rowItems = successfulItems.slice(i, i + rowSize);
              
              // Add row separator
              if (i > 0) {
                content.push({
                  type: 'text',
                  text: '\n---\n'
                });
              }
              
              // Add row of images
              for (const item of rowItems) {
                content.push({
                  type: 'text',
                  text: `[${item.path}]`
                });
                content.push({
                  type: 'image',
                  data: item.base64Data!,
                  mimeType: 'image/png'
                });
              }
            }
            
            // Add summary text
            content.push({
              type: 'text',
              text: `\nScreenshots completed. ${successfulItems.length} successful, ${urls.length - successfulItems.length} failed.`
            });
            
            return { content };
          } catch (error: any) {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to capture batch screenshots: ${error?.message || 'Unknown error'}`
            );
          }
        }
        
        case 'screenshot_local_files': {
          try {
            const args = request.params.arguments as { 
              directory?: string;
              pattern?: string;
              fullPage?: boolean;
              gridSize?: number;
            };
            
            // Use current directory if not specified
            const directory = args.directory || process.cwd();
            
            // Find HTML files
            const htmlFiles = await this.findHtmlFiles(directory, args.pattern || '*.html');
            
            if (htmlFiles.length === 0) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `No HTML files found in directory: ${directory}`
                  }
                ]
              };
            }
            
            // Convert file paths to URLs
            const fileUrls = htmlFiles.map(file => `file://${file}`);
            const filePaths = htmlFiles.map(file => path.basename(file));
            
            // Use batch screenshot logic with found files
            const batchItems: BatchScreenshotItem[] = fileUrls.map((url, index) => ({
              url,
              path: filePaths[index]
            }));
            
            // Take screenshots in sequence
            for (const item of batchItems) {
              try {
                const screenshot = await this.screenshotUrl(
                  item.url, 
                  args.fullPage || false,
                  undefined,
                  1000
                );
                
                item.screenshotPath = screenshot.path;
                item.base64Data = screenshot.base64Data;
              } catch (error: any) {
                logToFile(`Error taking screenshot of ${item.url}: ${error}`);
                // Continue with other files even if one fails
              }
            }
            
            // Filter out items without screenshots
            const successfulItems = batchItems.filter(item => item.base64Data);
            
            if (successfulItems.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                    text: 'Failed to take any screenshots of HTML files.'
                  }
                ]
              };
            }
            
            // Create content array with intro text
            const content: any[] = [
              {
                type: 'text',
                text: `Captured ${successfulItems.length} screenshots out of ${htmlFiles.length} HTML files in ${directory}:`
                }
            ];
            
            // Determine grid size
            const gridSize = args.gridSize || 2;
            const rowSize = Math.min(gridSize, 4); // Maximum 4 columns
            
            // Add images grouped by row
            for (let i = 0; i < successfulItems.length; i += rowSize) {
              const rowItems = successfulItems.slice(i, i + rowSize);
              
              // Add row separator
              if (i > 0) {
                content.push({
                  type: 'text',
                  text: '\n---\n'
                });
              }
              
              // Add row of images
              for (const item of rowItems) {
                content.push({
                  type: 'text',
                  text: `[${item.path}]`
                });
                content.push({
                  type: 'image',
                  data: item.base64Data!,
                  mimeType: 'image/png'
                });
              }
            }
            
            // Add summary text
            content.push({
              type: 'text',
              text: `\nScreenshots completed. ${successfulItems.length} successful, ${htmlFiles.length - successfulItems.length} failed.`
            });
            
            return { content };
          } catch (error: any) {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to capture local HTML screenshots: ${error?.message || 'Unknown error'}`
            );
          }
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool ${request.params.name}`
          );
      }
    });
  }

  /**
   * Find HTML files in a directory
   */
  private async findHtmlFiles(directory: string, pattern: string = '*.html'): Promise<string[]> {
    try {
      const dirPath = path.resolve(directory);
      
      // Check if directory exists
      try {
        await fsPromises.access(dirPath);
      } catch (error) {
        throw new Error(`Directory not found: ${dirPath}`);
      }
      
      // Read all files in the directory
      const files = await fsPromises.readdir(dirPath);
      
      // Filter HTML files (simple implementation, not using glob)
      let htmlFiles: string[] = [];
      
      if (pattern === '*.html') {
        htmlFiles = files.filter(file => file.endsWith('.html'));
      } else {
        // Very basic glob-like matching
        const patternRegex = new RegExp(pattern.replace('*', '.*'));
        htmlFiles = files.filter(file => patternRegex.test(file));
      }
      
      // Convert to full paths
      return htmlFiles.map(file => path.join(dirPath, file));
    } catch (error: any) {
      logToFile(`Error finding HTML files: ${error}`);
      throw new Error(`Failed to find HTML files: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Start the server
new AIVisionDebugServer().run().catch((error) => {
  console.error('[AIVisionDebugServer]', error);
  process.exit(1);
});
