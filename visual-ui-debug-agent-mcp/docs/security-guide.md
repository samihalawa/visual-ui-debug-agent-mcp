# Security Guide

## CI/CD Security

This guide covers security considerations for the GitHub Actions workflows.

### Required Secrets

The following secrets need to be configured in GitHub:

1. `NPM_TOKEN`: For publishing to npm registry
2. `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`: For Docker image builds
3. `SMITHERY_API_KEY`: For Smithery deployments

To add these secrets:
1. Go to your repository on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"

### Best Practices

1. Never hardcode secrets in any files
2. Avoid using tokens or credentials in log output
3. Rotate secrets periodically
4. Use GitHub Secret Scanning to detect exposed secrets

### Dealing with Exposed Secrets

If you accidentally commit a secret:

1. Revoke and regenerate the exposed token immediately
2. Update the corresponding GitHub secret
3. Use the `scripts/clean-git-history.sh` script if needed

If you need help with security issues, contact the repository maintainer.