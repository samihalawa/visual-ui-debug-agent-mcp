#!/usr/bin/env bash
set -e

# MCP AI Vision Debug UI Automation
# Cross-platform build and publish script

echo "🚀 Building MCP AI Vision Debug UI Automation for multiple platforms..."

# Parse command line arguments
PUBLISH=false
VERSION=""

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --publish) PUBLISH=true ;;
    --version) VERSION="$2"; shift ;;
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

# Build for current platform
echo "🔨 Building TypeScript..."
npm run build

# Determine current platform
PLATFORM=$(node -p "process.platform")
ARCH=$(node -p "process.arch")
echo "💻 Current platform: $PLATFORM-$ARCH"

# Update version if specified
if [ ! -z "$VERSION" ]; then
  echo "🔖 Updating version to $VERSION..."
  npm version $VERSION --no-git-tag-version
fi

# Function to build and publish platform-specific package
build_platform_package() {
  PLAT="$1"
  ARCHITECTURE="$2"
  
  echo "📄 Creating package for $PLAT-$ARCHITECTURE..."
  
  # Create a temporary package.json for this platform
  TEMP_PKG=$(node -e "
    const pkg = require('./package.json');
    pkg.name = 'mcp-ai-vision-debug-ui-automation-$PLAT-$ARCHITECTURE';
    pkg.os = ['$PLAT'];
    pkg.cpu = ['$ARCHITECTURE'];
    console.log(JSON.stringify(pkg, null, 2));
  ")
  
  # Save original package.json content
  ORIGINAL_PKG=$(cat package.json)
  
  # Replace package.json with platform-specific version
  echo "$TEMP_PKG" > package.json
  
  # Publish if requested
  if [ "$PUBLISH" = true ]; then
    echo "📦 Publishing $PLAT-$ARCHITECTURE package to npm..."
    npm publish
  else
    echo "💡 Would publish $PLAT-$ARCHITECTURE package (use --publish to actually publish)"
  fi
  
  # Restore original package.json
  echo "$ORIGINAL_PKG" > package.json
  
  echo "✅ Platform package for $PLAT-$ARCHITECTURE processed!"
}

# Process platform-specific packages
echo "🌐 Processing platform-specific packages..."
build_platform_package "darwin" "x64"
build_platform_package "darwin" "arm64"
build_platform_package "linux" "x64"
build_platform_package "linux" "arm64"
build_platform_package "win32" "x64"

# Publish universal package if requested
if [ "$PUBLISH" = true ]; then
  echo "📦 Publishing universal package to npm..."
  npm publish
else
  echo "💡 Would publish universal package (use --publish to actually publish)"
fi

echo "✅ Cross-platform build completed successfully!"
echo ""
echo "Usage examples:"
echo "  ./scripts/cross-platform-build.sh                   # Build only (no publishing)"
echo "  ./scripts/cross-platform-build.sh --publish         # Build and publish to npm"
echo "  ./scripts/cross-platform-build.sh --version 1.0.1   # Build with specific version"
echo "  ./scripts/cross-platform-build.sh --version 1.0.1 --publish  # Build and publish with version"