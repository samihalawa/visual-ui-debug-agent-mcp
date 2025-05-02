# Using MCP AI Vision Debug UI Automation with Smithery

This guide explains how to set up and use the MCP AI Vision Debug UI Automation package with Smithery.

## Option 1: Direct Installation from Source

1. **Clone the repository**:
   ```bash
   git clone https://github.com/samihalawa/mcp-ai-vision-debug-ui-automation.git
   cd mcp-ai-vision-debug-ui-automation
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

4. **Run with Smithery configuration**:
   ```bash
   npm run smithery
   ```

This will start the MCP server on port 8080 (by default) with Smithery-compatible configuration.

## Option 2: Using with Smithery CLI (Manual Setup)

1. **Start the MCP server** using the method above or any other method.

2. **Configure Smithery to use the server**:
   
   Create a JSON file with the configuration:
   ```json
   {
     "name": "mcp-ai-vision-debug-ui-automation",
     "url": "http://localhost:8080/mcp"
   }
   ```

3. **Use the URL in your Smithery-compatible client**:
   
   - For Claude: Configure the MCP server URL to point to http://localhost:8080/mcp
   - For other clients: Follow their specific instructions for adding external MCP servers

## Smithery Configuration Details

The MCP AI Vision Debug UI Automation package includes a valid `smithery.yaml` file with the following configuration:

```yaml
startCommand:
  type: stdio
  configSchema:
    type: object
    required:
      - port
    properties:
      port:
        type: number
        description: Port number for the MCP server
        default: 8080
      debug:
        type: boolean
        description: Enable debug mode
        default: false
      headless:
        type: boolean
        description: Run browser in headless mode
        default: true
      # ...additional properties...
```

## Using with Advanced Smithery APIs

For advanced integration with Smithery, you can use the `mcp-ai-vision-debug-ui-automation-smithery` binary that is included in the package:

1. **Install the package locally or globally** (if available on npm):
   ```bash
   npm install -g mcp-ai-vision-debug-ui-automation
   ```

2. **Run the Smithery-specific binary**:
   ```bash
   mcp-ai-vision-debug-ui-automation-smithery
   ```

3. **Configure with command-line options**:
   ```bash
   mcp-ai-vision-debug-ui-automation-smithery --port 9090 --debug --headless=false
   ```

## Troubleshooting

- **Server not starting**: Ensure dependencies are installed and the build process completed successfully
- **Connection issues**: Verify that the server is running and accessible at the configured port
- **Authentication errors**: Some Smithery operations may require an API key from the Smithery service
- **Configuration not applying**: Check environment variables or command-line parameters for proper formatting

## Getting Help

If you encounter issues with Smithery integration, consult:
- [Smithery Documentation](https://smithery.ai/docs/)
- [MCP AI Vision Debug UI Automation Repository](https://github.com/samihalawa/mcp-ai-vision-debug-ui-automation)