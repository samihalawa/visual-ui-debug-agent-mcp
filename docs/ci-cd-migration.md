# CI/CD Migration Guide

This document explains the migration from script-based deployment to GitHub Actions for CI/CD.

## Overview

We've replaced manual bash scripts with GitHub Actions workflows, offering:
- Automatic workflow triggers on code changes and releases
- Consistent build environments
- Better visibility of build and deployment status
- Secure secrets management

## Workflow Files

All workflows are in `.github/workflows/`:
- `build-and-test.yml`: Basic build validation
- `npm-publish.yml`: NPM package publishing 
- `docker-publish.yml`: Docker image building
- `smithery-publish.yml`: Smithery deployment

## Original Scripts Mapping

| Previous Script | GitHub Actions Workflow |
|-----------------|-------------------------|
| `build-publish.sh` | `build-and-test.yml` + `npm-publish.yml` |
| `docker-publish.sh` | `docker-publish.yml` |
| `mcp-deploy.sh` | All workflows combined |
| `publish-to-smithery.sh` | `smithery-publish.yml` |

## Secret Management

Required GitHub Secrets:
- `NPM_TOKEN`: For npm publishing
- `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`: For Docker
- `SMITHERY_API_KEY`: For Smithery

## Local Development

The original scripts in `/scripts` remain available for local development:

```bash
# Local build and test
npm run build
npm run test

# Local Smithery testing
npm run smithery
```