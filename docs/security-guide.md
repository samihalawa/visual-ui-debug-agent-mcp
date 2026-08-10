# Maintainer security notes

- Keep the npm publishing token only in the `NPM_TOKEN` GitHub Actions secret.
- Never commit service credentials, local environment files, browser profiles, or captured authentication data.
- Run `npm audit` and `npm test` before releases.
- Review workflow permission changes and package tarball contents before publishing.
- Revoke and replace any credential that was committed or printed in logs.

VUDA returns request metadata from `api_endpoint_tester`, but redacts the generated `Authorization` header from tool output.
