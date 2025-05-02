#!/usr/bin/env bash
set -e

# Script to install the MCP server in Smithery using the configured API key
# This automatically applies the API key from .env

# Load environment variables from .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Check if SMITHERY_API_KEY is set
if [ -z "$SMITHERY_API_KEY" ]; then
  echo "❌ Error: SMITHERY_API_KEY is not set in .env file"
  exit 1
fi

echo "🔑 Using Smithery API key: ${SMITHERY_API_KEY:0:8}... (truncated for security)"

# Check if the client is specified
CLIENT=${1:-claude}
echo "🔮 Installing for client: $CLIENT"

# Try local installation first
echo "📦 Trying to install local server with Smithery..."

# Create a temporary directory for Smithery installation
TEMP_DIR=$(mktemp -d)
echo "📂 Created temporary directory: $TEMP_DIR"

# Create a package.json in the temp directory
cat > $TEMP_DIR/package.json << EOL
{
  "name": "mcp-ai-vision-debug-ui-automation-local",
  "version": "1.0.0",
  "private": true,
  "smithery": {
    "startCommand": {
      "type": "stdio",
      "command": "$(pwd)/scripts/run-with-smithery.js"
    }
  }
}
EOL

echo "📝 Created minimal package.json for Smithery"

# Try to install the local directory in Smithery
echo "📥 Attempting to install with Smithery CLI..."
npx @smithery/cli install $TEMP_DIR --id mcp-ai-vision-debug-ui-automation --client $CLIENT --key $SMITHERY_API_KEY

# Clean up temporary directory
rm -rf $TEMP_DIR
echo "🧹 Cleaned up temporary directory"

echo "✅ Installation completed"
echo "You can now use the MCP server with Smithery!"
echo "To run it directly: npx @smithery/cli run mcp-ai-vision-debug-ui-automation --key $SMITHERY_API_KEY"