# GitHub Actions Guide

This guide explains the GitHub Actions workflows available for this project.

## Available Workflows

### 1. Build and Test

Triggers automatically on pushes to `main`, pull requests, and manual triggers. Builds and tests the project with Node.js 18 and 20.

**Manual trigger:** Go to Actions tab → Build and Test → Run workflow

### 2. NPM Publishing

Publishes the package to npm when a new release is created or triggered manually.

**Required secret:** `NPM_TOKEN`

**Manual trigger:** Actions tab → Publish NPM Package → Run workflow → Enter version → Run

### 3. Docker Publishing

Builds and publishes Docker images for multiple platforms.

**Required secrets:** `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`

**Manual trigger:** Actions tab → Publish Docker Image → Run workflow → Enter tag and push option → Run

### 4. Smithery Publishing

Packages and publishes the project to Smithery.

**Required secret:** `SMITHERY_API_KEY`

**Manual trigger:** Actions tab → Publish to Smithery → Run workflow

## Setup

1. Go to repository Settings → Secrets and variables → Actions
2. Add required secrets:
   - `NPM_TOKEN`
   - `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`
   - `SMITHERY_API_KEY`

## Creating a Release

Creating a GitHub release will automatically trigger publishing workflows:

1. Go to Releases → Create a new release
2. Choose or create a tag (e.g., v1.0.3)
3. Fill in title and description
4. Click "Publish release"