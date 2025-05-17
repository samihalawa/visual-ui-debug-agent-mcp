# MCP Connection Troubleshooting Guide

## Step 1: Create MCP Configuration Directory

```bash
mkdir -p ~/.mcp
```

## Step 2: Create Configuration File

Create a `config.json` file in the `~/.mcp/` directory:

```bash
cat > ~/.mcp/config.json << EOF
{
  "server": {
    "port": 8080,
    "host": "localhost"
  },
  "auth": {
    "enabled": false
  }
}
EOF
```

## Step 3: Verify MCP Server Status

Check if the MCP server is running on port 8080:

```bash
lsof -i :8080
```

If not running, start the MCP server:

```bash
mcp serve
```

## Step 4: Test Connection

Test the connection using the MCP command:

```bash
mcp status
```

If the connection is successful, you should see a response confirming the connection status.