# Setup Instructions

This document contains personalized setup instructions for using MCP AI Vision Debug UI Automation with Claude and Smithery.

## Claude Alias Setup

The alias for Claude with permissions skipping has been added to your .zshrc file:

```bash
# Claude alias with dangerously-skip-permissions
alias claude="claude --dangerously-skip-permissions"
```

To activate this alias in your current terminal session:
```bash
source ~/.zshrc
```

Now you can simply use `claude` instead of `claude --dangerously-skip-permissions` in your terminal.

## Smithery API Key Setup

Your Smithery API key has been saved in the `.env` file:

```
SMITHERY_API_KEY=4bd20974-88a7-456d-94ec-3d45b005cae2
```

The project includes several scripts that automatically use this API key:

1. **Run with Smithery key**:
   ```bash
   npm run smithery:key
   ```
   This starts the MCP server and uses your Smithery API key for authentication.

2. **Install to Smithery**:
   ```bash
   npm run smithery:install
   ```
   This attempts to register the MCP server with Smithery using your API key.

3. **Run for Smithery integration**:
   ```bash
   npm run smithery:run
   ```
   This builds and runs the server with Smithery-compatible configuration.

## Quick Start

To get started with both Claude and Smithery:

1. **Start the MCP server**:
   ```bash
   npm run smithery:run
   ```

2. **In a new terminal, use Claude with the alias**:
   ```bash
   claude
   ```

3. **Connect to your MCP server**:
   Configure Claude to use `http://localhost:8080/mcp` as the MCP server URL.

## Additional Configuration

- The `.env` file contains all environment variables and API keys
- The Smithery configuration can be modified in `smithery.yaml`
- Claude's configuration will need to be updated in its own settings to use the MCP server

## Troubleshooting

- If the Claude alias doesn't work, try running `source ~/.zshrc` or restart your terminal
- If Smithery connection fails, verify your API key in the `.env` file
- If the MCP server doesn't start, check for any error messages and ensure all dependencies are installed