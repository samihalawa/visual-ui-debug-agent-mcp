#!/usr/bin/env bash
set -e

# MCP AI Vision Debug UI Automation
# Build and publish script

echo "🚀 Building MCP AI Vision Debug UI Automation for publishing..."

# Parse command line arguments
VERSION=""
PUBLISH=false
PUBLISH_DOCKER=false
TAG="latest"

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --version) VERSION="$2"; shift ;;
    --publish) PUBLISH=true ;;
    --publish-docker) PUBLISH_DOCKER=true ;;
    --tag) TAG="$2"; shift ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf build

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Update version if specified
if [ ! -z "$VERSION" ]; then
  echo "🔖 Updating version to $VERSION..."
  npm version $VERSION --no-git-tag-version
fi

# Publish to npm if requested
if [ "$PUBLISH" = true ]; then
  echo "📦 Publishing to npm..."
  npm publish
  echo "✅ Published to npm successfully!"
fi

# Build and publish Docker image if requested
if [ "$PUBLISH_DOCKER" = true ]; then
  echo "🐳 Building and publishing Docker image..."
  
  # Build the Docker image
  echo "🔨 Building Docker image with tag $TAG..."
  docker build -t samihalawa/mcp-ai-vision-debug-ui-automation:$TAG .
  
  # Push the Docker image
  echo "🚢 Pushing Docker image to Docker Hub..."
  docker push samihalawa/mcp-ai-vision-debug-ui-automation:$TAG
  
  # Also tag as latest if it's a version tag
  if [[ $TAG =~ ^v?[0-9]+\.[0-9]+\.[0-9]+ ]] && [ "$TAG" != "latest" ]; then
    echo "🏷️ Also tagging and pushing as latest..."
    docker tag samihalawa/mcp-ai-vision-debug-ui-automation:$TAG samihalawa/mcp-ai-vision-debug-ui-automation:latest
    docker push samihalawa/mcp-ai-vision-debug-ui-automation:latest
  fi
  
  echo "✅ Published to Docker Hub successfully!"
fi

echo "✅ Build completed successfully!"
echo ""
echo "Usage examples:"
echo "  ./scripts/build-publish.sh --version 1.0.1 --publish                # Build and publish to npm"
echo "  ./scripts/build-publish.sh --publish-docker --tag latest            # Build and publish Docker image"
echo "  ./scripts/build-publish.sh --version 1.0.1 --publish --publish-docker --tag 1.0.1  # Do it all"