#!/usr/bin/env bash
set -e

# Script to run the MCP server for Smithery integration

echo "🚀 Starting MCP AI Vision Debug UI Automation for Smithery"
echo "=========================================================="

# Ensure the project is built
echo "🔨 Building the project..."
npm run build

# Start the server with Smithery configuration
echo "⚙️ Starting with Smithery configuration..."
npm run smithery

# The server will remain running. Press Ctrl+C to stop.