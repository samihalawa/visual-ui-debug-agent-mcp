# Using with Smithery

This guide outlines how to use the MCP AI Vision Debug UI Automation package with Smithery.

## Prerequisites

1. You must have a Smithery account and API key
2. The Smithery CLI must be installed (`npm install -g @smithery/cli`)
3. Your package must have a valid `smithery.yaml` configuration file (already included in this project)

## Installing from Published Package

The easiest way to use this package with Smithery is to install it from npm:

1. **Install the package globally first**:
   ```bash
   npm install -g mcp-ai-vision-debug-ui-automation
   ```

2. **Run the package locally**:
   You can run the package directly:
   ```bash
   mcp-ai-vision-debug-ui-automation
   ```

3. **Configure Smithery to use it (if available)**:
   Check the Smithery documentation for the latest instructions on integrating local MCP servers:
   ```bash
   # Example (actual commands may vary)
   npx @smithery/cli install local:mcp-ai-vision-debug-ui-automation --client claude --key YOUR_SMITHERY_API_KEY
   ```
   Replace `YOUR_SMITHERY_API_KEY` with your actual Smithery API key.

4. **Verify available servers**:
   ```bash
   npx @smithery/cli list servers --key YOUR_SMITHERY_API_KEY
   ```

## Direct Installation (If Available in Smithery Registry)

If the package becomes available directly in the Smithery registry:

```bash
npx @smithery/cli install mcp-ai-vision-debug-ui-automation --client claude --key YOUR_SMITHERY_API_KEY
```

## Running with Smithery

Users can run the registered server using:

```bash
npx @smithery/cli run mcp-ai-vision-debug-ui-automation --key YOUR_SMITHERY_API_KEY
```

## Configuration

The server can be configured when running by providing a JSON configuration:

```bash
npx @smithery/cli run mcp-ai-vision-debug-ui-automation --config '{"port":9090,"debug":true}' --key YOUR_SMITHERY_API_KEY
```

## Testing Locally

You can test the Smithery configuration locally without registration:

```bash
npm run smithery
```

This runs the package using the Smithery configuration defined in `smithery.yaml`.

## Alternative: Using NPM Global Installation

If you prefer not to use Smithery registration, you can simply:

1. Install the package globally:
   ```bash
   npm install -g mcp-ai-vision-debug-ui-automation
   ```

2. Run it directly:
   ```bash
   mcp-ai-vision-debug-ui-automation
   ```

3. Configure via environment variables:
   ```bash
   PORT=9090 DEBUG=true HEADLESS=false mcp-ai-vision-debug-ui-automation
   ```

## Notes

- The process for registering packages with Smithery may change
- Check the Smithery documentation for the most up-to-date instructions at https://smithery.ai/docs/
- If you need help with Smithery integration, contact Smithery support