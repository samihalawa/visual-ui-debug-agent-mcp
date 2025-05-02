#!/usr/bin/env bash
set -e

# MCP AI Vision Debug UI Automation
# Local MCP installation script

echo "🚀 Installing MCP AI Vision Debug UI Automation to local MCP environment"
echo "=================================================================="

# Determine target directory
DEFAULT_MCP_DIR="/Users/samihalawa/Documents/MCP"
MCP_DIR=${1:-$DEFAULT_MCP_DIR}

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --mcp-dir) MCP_DIR="$2"; shift ;;
    --help) 
      echo "Usage: ./scripts/install-local-mcp.sh [--mcp-dir PATH]"
      echo ""
      echo "Options:"
      echo "  --mcp-dir PATH    Path to MCP installation directory (default: $DEFAULT_MCP_DIR)"
      echo "  --help            Show this help message"
      exit 0
      ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

# Verify MCP directory exists
if [ ! -d "$MCP_DIR" ]; then
  echo "❌ Error: MCP directory $MCP_DIR doesn't exist"
  exit 1
fi

echo "📂 Using MCP directory: $MCP_DIR"

# Build the project first
echo "🔨 Building the project..."
npm run build

# Check if mcp-dockmaster exists
DOCKMASTER_DIR="$MCP_DIR/mcp-dockmaster"
if [ -d "$DOCKMASTER_DIR" ]; then
  echo "✅ Found MCP Dockmaster at: $DOCKMASTER_DIR"
  
  # Create target directory if not exists
  MCP_SERVERS_DIR="$DOCKMASTER_DIR/servers"
  mkdir -p "$MCP_SERVERS_DIR"
  
  # Create target directory for our server
  SERVER_DIR="$MCP_SERVERS_DIR/mcp-ai-vision-debug-ui-automation"
  mkdir -p "$SERVER_DIR"
  
  # Copy files
  echo "📋 Copying files to MCP Dockmaster..."
  cp -R build "$SERVER_DIR/"
  cp package.json README.md LICENSE "$SERVER_DIR/"
  cp -R publicresources "$SERVER_DIR/"
  cp mcp-configs/dockmaster.json "$SERVER_DIR/mcp.json"
  
  echo "✅ Successfully installed to MCP Dockmaster!"
fi

# Check for the config directory
CONFIG_DIR="$MCP_DIR/config"
if [ -d "$CONFIG_DIR" ]; then
  echo "✅ Found MCP config directory at: $CONFIG_DIR"
  
  # Generate a config entry
  echo "📝 Creating configuration entry..."
  CONFIG_FILE="$CONFIG_DIR/mcp-ai-vision-debug-ui-automation.json"
  
  # Create JSON configuration
  cat > "$CONFIG_FILE" << EOL
{
  "name": "mcp-ai-vision-debug-ui-automation",
  "displayName": "MCP AI Vision Debug UI Automation",
  "description": "MCP server for visual analysis and automated UI testing",
  "version": "$(node -p "require('./package.json').version")",
  "type": "server",
  "startCommand": "node build/index.js",
  "env": {
    "PORT": "8080",
    "DEBUG": "false"
  },
  "path": "$MCP_DIR/mcp-server-ai-vision"
}
EOL
  
  echo "✅ Configuration installed at: $CONFIG_FILE"
fi

echo "🎉 Installation completed successfully!"
echo ""
echo "You can now use MCP AI Vision Debug UI Automation through:"
echo "- MCP Dockmaster (if available)"
echo "- Direct configuration in your MCP client"
echo ""
echo "To start the server directly, run: npm start"