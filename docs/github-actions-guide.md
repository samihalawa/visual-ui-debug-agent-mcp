# GitHub Actions

The repository has three workflows:

- `Build and Test` runs on pushes and pull requests to `main`, tests Node.js 20 and 22, installs Chromium, exercises the MCP server and browser, and audits production dependencies.
- `Publish npm package` runs for GitHub releases or manual dispatches, builds the package, inspects the tarball, and publishes with `NPM_TOKEN`.
- `Publish container image` builds multi-architecture images and publishes them to GitHub Container Registry for releases or manual dispatches.

Keep `NPM_TOKEN` in GitHub Actions secrets. No other publishing secret is required.
