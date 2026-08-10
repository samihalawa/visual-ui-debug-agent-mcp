# Contributing to VUDA

Thanks for improving VUDA. Focused bug fixes, documentation improvements, and well-scoped tool enhancements are welcome.

## Development

Requirements: Node.js 20 or 22, npm, and Chromium for Playwright.

```bash
npm ci
npx playwright install chromium
npm test
npm audit
npm pack --dry-run
```

## Issues

Before opening an issue, search existing issues and confirm the problem against the latest `main` branch. Include:

- the VUDA and Node.js versions;
- the MCP client and operating system;
- exact reproduction steps, expected behavior, and actual behavior;
- the smallest useful error or log excerpt with secrets removed.

## Pull requests

- Keep each pull request focused on one outcome.
- Add or update direct verification for behavioral changes.
- Keep stdout reserved for MCP protocol messages.
- Run the full command set above and complete the pull-request checklist.
- Update `README.md` and `CHANGELOG.md` when user-visible behavior changes.
