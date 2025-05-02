#!/usr/bin/env bash
set -e

# Script to publish the MCP server to Smithery
# This uses the API key from the .env file

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

# Ensure the project is built
echo "🔨 Building the project..."
npm run build

# Create a temporary package for Smithery
echo "📦 Creating Smithery package..."
TEMP_DIR=$(mktemp -d)
PACKAGE_DIR="$TEMP_DIR/mcp-ai-vision-debug-ui-automation"
mkdir -p "$PACKAGE_DIR"

# Copy necessary files to the package directory
echo "📋 Copying files..."
cp -R build "$PACKAGE_DIR/"
cp -R publicresources "$PACKAGE_DIR/"
cp smithery.yaml "$PACKAGE_DIR/"
cp package.json README.md LICENSE "$PACKAGE_DIR/"

# Copy scripts needed for execution
mkdir -p "$PACKAGE_DIR/scripts"
cp scripts/run-with-smithery.js "$PACKAGE_DIR/scripts/"

# Create a dedicated package.json for Smithery
echo "📝 Creating Smithery-specific package.json..."
cat > "$PACKAGE_DIR/smithery.json" << EOL
{
  "name": "mcp-ai-vision-debug-ui-automation",
  "version": "1.0.2",
  "description": "MCP AI Vision Debug UI Automation - MCP server for visual analysis and automated UI testing",
  "smithery": {
    "displayName": "AI Vision Debug UI Automation",
    "description": "Visual analysis and UI testing for AI models",
    "icon": "publicresources/icon.svg",
    "startCommand": {
      "type": "stdio",
      "command": "node",
      "args": ["scripts/run-with-smithery.js"]
    }
  }
}
EOL

# Create a tarball of the package
echo "📦 Creating tarball..."
cd "$TEMP_DIR"
tar -czf mcp-ai-vision-debug-ui-automation.tgz mcp-ai-vision-debug-ui-automation
TARBALL_PATH="$TEMP_DIR/mcp-ai-vision-debug-ui-automation.tgz"

# Attempt to publish to Smithery
echo "🚀 Publishing to Smithery..."
cd -  # Return to original directory

# Try different Smithery CLI commands for publishing
echo "🔄 Attempting to publish with Smithery CLI..."

# Method 1: Try using the direct package install
echo "Method 1: Using direct package install..."
npx @smithery/cli install "$PACKAGE_DIR" --id mcp-ai-vision-debug-ui-automation --client claude --key $SMITHERY_API_KEY

if [ $? -ne 0 ]; then
  # Method 2: Try using the tarball
  echo "Method 2: Using tarball install..."
  npx @smithery/cli install "$TARBALL_PATH" --id mcp-ai-vision-debug-ui-automation --client claude --key $SMITHERY_API_KEY
fi

if [ $? -ne 0 ]; then
  # Method 3: Try to find a publish command if it exists
  echo "Method 3: Looking for publish command..."
  PUBLISH_CMD=$(npx @smithery/cli --help | grep -i publish || echo "")
  
  if [ ! -z "$PUBLISH_CMD" ]; then
    echo "Found publish command: $PUBLISH_CMD"
    npx @smithery/cli publish "$PACKAGE_DIR" --key $SMITHERY_API_KEY
  else
    echo "⚠️ No direct publish command found in Smithery CLI"
  fi
fi

# Clean up
echo "🧹 Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

echo "📌 NOTE: If none of the publishing methods worked automatically,"
echo "    you may need to use the Smithery web interface to publish the package."
echo "    API: https://api.smithery.ai/v1/teams/default/servers"
echo "    Key: $SMITHERY_API_KEY"
echo ""
echo "✅ Process completed. Check above for successful publication status."