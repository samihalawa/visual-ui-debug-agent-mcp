# Publishing

VUDA is published as the `visual-ui-debug-agent-mcp` npm package.

## Release checklist

1. Start from a clean `main` branch.
2. Run `npm ci`, `npm test`, `npm audit`, and `npm pack --dry-run`.
3. Create a GitHub release with a semantic version tag.
4. Confirm the `Publish npm package` workflow completed for that tag.
5. Verify the published version with `npm view visual-ui-debug-agent-mcp version`.
6. Run `npx -y visual-ui-debug-agent-mcp@<version>` from a clean directory and connect with an MCP client.

The publish workflow requires the repository secret `NPM_TOKEN`. Manual workflow runs accept `patch`, `minor`, `major`, or an exact semantic version.

GitHub releases also build the Dockerfile for `linux/amd64` and `linux/arm64` and publish versioned images to `ghcr.io/samihalawa/visual-ui-debug-agent-mcp`. This uses the workflow's `GITHUB_TOKEN` and does not require a separate registry secret.
