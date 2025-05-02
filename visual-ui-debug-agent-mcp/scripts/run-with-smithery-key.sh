#!/usr/bin/env bash
set -e

# Script to run the MCP server with Smithery using the configured API key
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

# Now run the actual Smithery command
echo "🚀 Starting MCP AI Vision Debug UI Automation with Smithery"

# Example of listing available clients
npx @smithery/cli list clients --key $SMITHERY_API_KEY

# Example of running the server (if configured)
# npx @smithery/cli run mcp-ai-vision-debug-ui-automation --key $SMITHERY_API_KEY

# For now, since we don't have the server registered in Smithery yet, run locally
node scripts/run-with-smithery.js