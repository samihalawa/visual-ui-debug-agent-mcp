#!/usr/bin/env bash
set -e

# MCP AI Vision Debug UI Automation
# Docker build and publish script

IMAGE_NAME="samihalawa/mcp-ai-vision-debug-ui-automation"
VERSION=$(node -p "require('./package.json').version")

# Parse command-line arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --tag) TAG="$2"; shift ;;
    --platform) PLATFORMS="$2"; shift ;;
    --push) PUSH=true ;;
    --help) HELP=true ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

# Show help
if [ "$HELP" = true ]; then
  echo "Docker build and publish script for MCP AI Vision Debug UI Automation"
  echo ""
  echo "Usage: ./scripts/docker-publish.sh [options]"
  echo ""
  echo "Options:"
  echo "  --tag TAG         Specify a custom tag (default: version from package.json)"
  echo "  --platform PLAT   Specify platforms to build for (default: linux/amd64,linux/arm64)"
  echo "  --push            Push the image to Docker Hub after building"
  echo "  --help            Show this help message"
  echo ""
  echo "Examples:"
  echo "  ./scripts/docker-publish.sh --tag latest --push"
  echo "  ./scripts/docker-publish.sh --platform linux/amd64 --tag v1.0.0"
  exit 0
fi

# Set defaults
TAG=${TAG:-$VERSION}
PLATFORMS=${PLATFORMS:-"linux/amd64,linux/arm64"}

echo "🚀 Building Docker image for MCP AI Vision Debug UI Automation"
echo "   Version: $VERSION"
echo "   Tag: $TAG"
echo "   Platforms: $PLATFORMS"

# Build the Docker image
if [ -x "$(command -v docker buildx)" ]; then
  echo "🔨 Building multi-platform image with buildx..."
  
  # Create and use a new builder instance if it doesn't exist
  if ! docker buildx inspect mcp-builder > /dev/null 2>&1; then
    echo "🔧 Creating new buildx builder instance..."
    docker buildx create --name mcp-builder --use
  else
    docker buildx use mcp-builder
  fi
  
  # Build command
  BUILD_CMD="docker buildx build --platform $PLATFORMS -t $IMAGE_NAME:$TAG ."
  
  # Add push flag if requested
  if [ "$PUSH" = true ]; then
    BUILD_CMD="$BUILD_CMD --push"
    echo "🚢 Image will be pushed to Docker Hub"
  else
    BUILD_CMD="$BUILD_CMD --load"
  fi
  
  # Execute the build
  echo "⚙️ Executing: $BUILD_CMD"
  eval $BUILD_CMD
  
  # Also tag as latest if it's a version tag
  if [[ $TAG =~ ^v?[0-9]+\.[0-9]+\.[0-9]+ ]] && [ "$PUSH" = true ]; then
    echo "🏷️ Also tagging as latest..."
    docker buildx build --platform $PLATFORMS -t $IMAGE_NAME:latest . --push
  fi
else
  echo "⚠️ Docker buildx not available, falling back to standard build..."
  docker build -t $IMAGE_NAME:$TAG .
  
  if [ "$PUSH" = true ]; then
    echo "🚢 Pushing image to Docker Hub..."
    docker push $IMAGE_NAME:$TAG
    
    # Also tag as latest if it's a version tag
    if [[ $TAG =~ ^v?[0-9]+\.[0-9]+\.[0-9]+ ]]; then
      echo "🏷️ Also tagging as latest..."
      docker tag $IMAGE_NAME:$TAG $IMAGE_NAME:latest
      docker push $IMAGE_NAME:latest
    fi
  fi
fi

echo "✅ Docker image build completed!"
if [ "$PUSH" = true ]; then
  echo "📦 Image pushed to Docker Hub: $IMAGE_NAME:$TAG"
else
  echo "💡 To push the image to Docker Hub, run:"
  echo "   docker push $IMAGE_NAME:$TAG"
fi