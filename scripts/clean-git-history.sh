#!/usr/bin/env bash
set -e

# Script to remove sensitive information from git history
# WARNING: This rewrites git history - only use on branches that haven't been shared

echo "⚠️ WARNING: This script will rewrite git history. ⚠️"
echo "Only use this on branches that haven't been shared with others."
echo "This will help remove sensitive information like API keys and tokens."
echo ""
read -p "Are you sure you want to continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Operation cancelled."
    exit 1
fi

# Check if BFG is installed
if ! command -v bfg &> /dev/null
then
    echo "BFG Repo-Cleaner is not installed. Attempting to install..."
    
    # Check if we're on macOS with Homebrew
    if command -v brew &> /dev/null
    then
        echo "Installing BFG via Homebrew..."
        brew install bfg
    else
        echo "Please install BFG manually and try again:"
        echo "https://rtyley.github.io/bfg-repo-cleaner/"
        exit 1
    fi
fi

echo "🧹 Creating a fresh clone for cleaning..."
REPO_DIR=$(pwd)
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Create mirror clone
git clone --mirror "$REPO_DIR/.git" repo-mirror.git
cd repo-mirror.git

# Create a file with patterns to replace
cat > sensitive-patterns.txt << EOL
npm_[a-zA-Z0-9]{32}
Bearer [a-zA-Z0-9_\-\.]{50,}
[a-zA-Z0-9_\-]{32,}\.[a-zA-Z0-9_\-]{32,}\.[a-zA-Z0-9_\-]{32,}
EOL

echo "🔄 Replacing sensitive patterns in repository history..."
bfg --replace-text sensitive-patterns.txt

echo "🧹 Cleaning up repository..."
git reflog expire --expire=now --all && git gc --prune=now --aggressive

echo "⏳ Reapplying changes to original repository..."
cd "$REPO_DIR"
git remote add temp "$TEMP_DIR/repo-mirror.git"
git fetch temp
git reset temp/main

echo "🧹 Cleaning up temporary files..."
rm -rf "$TEMP_DIR"
git remote remove temp

echo "✅ Complete! The repository history has been cleaned."
echo "You will need to force push to update the remote repository:"
echo "git push --force origin main"
echo ""
echo "NOTE: This only removes the sensitive information from git history."
echo "If the token is still valid, consider revoking and regenerating it."