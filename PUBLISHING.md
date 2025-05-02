# Publishing MCP AI Vision Debug UI Automation

This document details all the publishing options available for the MCP AI Vision Debug UI Automation package.

## NPM Publishing

The package has already been successfully published to npm as `mcp-ai-vision-debug-ui-automation` version 1.0.1.

To publish updates to npm:

```bash
# Update version number
npm version patch  # or minor, major

# Publish to npm
npm run deploy:npm
```

## Smithery Publishing Options

There are multiple ways to publish to Smithery, depending on what's working at the time:

### Option 1: Direct CLI Installation

This is the simplest method if Smithery's CLI supports direct installation:

```bash
npx @smithery/cli install . --id mcp-ai-vision-debug-ui-automation --client claude --key YOUR_SMITHERY_API_KEY
```

### Option 2: Pre-packaged Installation

This method uses a pre-packaged version for Smithery:

```bash
npm run smithery:publish
```

This script:
1. Builds the project
2. Creates a temporary package with Smithery-specific configuration
3. Attempts multiple methods of publishing to Smithery
4. Cleans up temporary files

### Option 3: Direct API Publishing

If the Smithery CLI doesn't work, you can try direct API publishing:

```bash
npm run smithery:api-publish
```

This script:
1. Builds the project
2. Packages everything needed for Smithery
3. Sends a direct API request to Smithery's server registration endpoint
4. Reports the results

### Option 4: Manual Publishing via Smithery Dashboard

If automated methods fail, you may need to use the Smithery web dashboard:

1. Package the MCP server:
   ```bash
   # Create package.tar.gz
   tar -czf package.tar.gz \
     --exclude="node_modules" \
     --exclude=".git" \
     --exclude="temp" \
     build publicresources scripts smithery.yaml package.json README.md LICENSE
   ```

2. Go to the Smithery dashboard
3. Navigate to "Add Server" or "Register Server" section
4. Upload the package.tar.gz file
5. Set the ID to "mcp-ai-vision-debug-ui-automation"
6. Complete the registration process

## Docker Publishing

To publish the Docker image to Docker Hub:

```bash
npm run deploy:docker
```

This will:
1. Build the Docker image with appropriate tags
2. Push the image to Docker Hub as `samihalawa/mcp-ai-vision-debug-ui-automation`

## MCP Dockmaster Integration

To install directly to a local MCP Dockmaster instance:

```bash
npm run install:local
```

This will:
1. Copy the built files to the MCP Dockmaster directory
2. Configure the MCP server in the Dockmaster registry

## Cross-Platform Publishing

To publish platform-specific versions:

```bash
npm run deploy:cross-platform
```

This creates and publishes separate packages for:
- macOS (x64, arm64)
- Linux (x64, arm64)
- Windows (x64)

## Complete Publishing

To publish to all available platforms at once:

```bash
npm run deploy:all -- --version X.Y.Z
```

This combines all the above publishing methods into a single operation.

## Troubleshooting

If you encounter issues with Smithery publishing:

1. Verify the API key is correct and has the necessary permissions
2. Ensure the Smithery service is operational
3. Check for rate limits or access restrictions
4. Try using a different method from the options above
5. Contact Smithery support if problems persist