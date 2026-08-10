<p align="center">
  <img src="publicresources/vuda-banner.svg" alt="VUDA — Visual UI Debug Agent" width="100%">
</p>

<p align="center">
  <a href="https://github.com/samihalawa/visual-ui-debug-agent-mcp/actions/workflows/build-and-test.yml"><img src="https://img.shields.io/github/actions/workflow/status/samihalawa/visual-ui-debug-agent-mcp/build-and-test.yml?branch=main&style=flat-square" alt="Build status"></a>
  <a href="https://www.npmjs.com/package/visual-ui-debug-agent-mcp"><img src="https://img.shields.io/npm/v/visual-ui-debug-agent-mcp.svg?style=flat-square&color=58a6ff" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/visual-ui-debug-agent-mcp"><img src="https://img.shields.io/npm/dm/visual-ui-debug-agent-mcp.svg?style=flat-square&color=3fb950" alt="npm downloads"></a>
  <a href="https://github.com/samihalawa/visual-ui-debug-agent-mcp/stargazers"><img src="https://img.shields.io/github/stars/samihalawa/visual-ui-debug-agent-mcp?style=flat-square&color=f0883e" alt="GitHub stars"></a>
  <a href="https://github.com/samihalawa/visual-ui-debug-agent-mcp/commits/main"><img src="https://img.shields.io/github/last-commit/samihalawa/visual-ui-debug-agent-mcp?style=flat-square&color=2ea043" alt="Last commit"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/visual-ui-debug-agent-mcp.svg?style=flat-square&color=a371f7" alt="ISC license"></a>
</p>

<p align="center">
  <strong>Give an MCP-compatible AI client a browser, screenshots, DOM inspection, workflow validation, console capture, API checks, and visual comparison.</strong><br>
  <sub>29 MCP tools · Node.js 20+ · TypeScript · Playwright</sub>
</p>

## What VUDA does

VUDA (Visual UI Debug Agent) is a local [Model Context Protocol](https://modelcontextprotocol.io/) server for inspecting and testing web interfaces with Playwright. It runs over standard input/output, so it works with MCP clients that can launch local commands.

- Capture full-page, viewport, element, local-file, and batch screenshots.
- Map interactive elements and inspect rendered DOM and computed styles.
- Execute multi-step UI workflows while preserving browser state.
- Monitor console output and analyze page performance.
- Compare two rendered states and return a visual diff.
- Crawl sitemaps and exercise API endpoints.
- Emulate supported Playwright devices.

<p align="center">
  <img src="publicresources/features.svg" alt="VUDA capabilities: screenshots, workflows, performance, API testing, and visual comparison" width="92%">
</p>

## Quick start

### 1. Run VUDA

```bash
npx -y visual-ui-debug-agent-mcp
```

Playwright needs a Chromium-compatible browser. If one is not already available, install the matching browser once:

```bash
npx playwright install chromium
```

### 2. Add it to an MCP client

```json
{
  "mcpServers": {
    "vuda": {
      "command": "npx",
      "args": ["-y", "visual-ui-debug-agent-mcp"]
    }
  }
}
```

Restart the client after changing its MCP configuration. The server writes protocol messages to stdout and diagnostics to its temporary log file.

Docker users can use the same stdio transport:

```json
{
  "mcpServers": {
    "vuda": {
      "command": "docker",
      "args": ["run", "--interactive", "--rm", "ghcr.io/samihalawa/visual-ui-debug-agent-mcp:latest"]
    }
  }
}
```

### 3. Try it

Ask your client to:

```text
Use VUDA to inspect https://example.com, capture a screenshot, list the
interactive elements, and report console errors and obvious layout issues.
```

## Tool reference

### Analysis and capture

| Tool | Purpose |
| --- | --- |
| `enhanced_page_analyzer` | Screenshot, console, performance, and interactive-element analysis |
| `screenshot_url` | Capture a URL, viewport, full page, or selected element |
| `batch_screenshot_urls` | Capture multiple URLs for side-by-side review |
| `screenshot_local_files` | Render and capture local HTML files |
| `dom_inspector` | Return element properties, children, and computed styles |
| `visual_comparison` | Compare two rendered pages or elements |

### Workflows, diagnostics, and APIs

| Tool | Purpose |
| --- | --- |
| `ui_workflow_validator` | Execute and verify a described user journey |
| `navigation_flow_validator` | Validate a sequence of browser actions |
| `console_monitor` | Capture browser console messages over a time window |
| `performance_analysis` | Collect navigation and page performance metrics |
| `api_endpoint_tester` | Exercise multiple HTTP endpoints |
| `sitemap_crawler` | Discover and inspect pages from a sitemap |
| `tunnel_helper` | Store or retrieve a remote tunnel URL and setup guidance |
| `debug_memory` | Keep small debugging notes during one server session |

### Direct Playwright controls

`playwright_navigate`, `playwright_click`, `playwright_iframe_click`, `playwright_fill`, `playwright_select`, `playwright_hover`, `playwright_evaluate`, `playwright_console_logs`, `playwright_get_visible_text`, `playwright_get_visible_html`, `playwright_go_back`, `playwright_go_forward`, `playwright_press_key`, `playwright_drag`, and `playwright_screenshot`.

## Configuration

All settings are optional environment variables:

| Variable | Default | Purpose |
| --- | ---: | --- |
| `VUDA_DEFAULT_TIMEOUT` | `15000` | General Playwright timeout in milliseconds |
| `VUDA_NAVIGATION_TIMEOUT` | `15000` | Navigation timeout |
| `VUDA_SELECTOR_TIMEOUT` | `12000` | Selector wait timeout |
| `VUDA_STABILITY_WAIT` | `5000` | Delay after navigation before capture |
| `VUDA_UI_UPDATE_WAIT` | `1000` | Delay for short UI updates |
| `VUDA_PERFORMANCE_THRESHOLD` | `15000` | Slow-page threshold |
| `VUDA_INTERACTION_DELAY` | `500` | Delay between direct interactions |

Example:

```json
{
  "mcpServers": {
    "vuda": {
      "command": "npx",
      "args": ["-y", "visual-ui-debug-agent-mcp"],
      "env": {
        "VUDA_NAVIGATION_TIMEOUT": "30000",
        "VUDA_STABILITY_WAIT": "2000"
      }
    }
  }
}
```

## Development

```bash
git clone https://github.com/samihalawa/visual-ui-debug-agent-mcp.git
cd visual-ui-debug-agent-mcp
npm ci
npm test
```

`npm test` builds the TypeScript server, starts it through the MCP stdio transport, verifies the exact 29-tool inventory, reads a bundled resource, exercises a stateful tool call, and captures a real browser screenshot.

Before opening a pull request, also run:

```bash
npm audit
npm pack --dry-run
```

## Architecture

<p align="center">
  <img src="publicresources/architecture.svg" alt="VUDA architecture" width="90%">
</p>

VUDA keeps one interactive Playwright page for direct controls, creates isolated contexts for page-level analyses, returns screenshots as MCP image content, and exposes generated screenshots and debugging prompts as MCP resources.

## Contributing

Issues and focused pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and review checklist. Release history is recorded in [CHANGELOG.md](CHANGELOG.md).

## License

[ISC](LICENSE) © 2023–2026 Sami Halawa and contributors.
