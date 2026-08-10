# MCP connection troubleshooting

VUDA is a stdio MCP server. It does not listen on an HTTP port.

1. Confirm Node.js 20 or newer with `node --version`.
2. Run `npx -y visual-ui-debug-agent-mcp` and confirm the process stays open while waiting for MCP input.
3. Use `command: "npx"` and `args: ["-y", "visual-ui-debug-agent-mcp"]` in the client configuration.
4. Restart the MCP client after editing its configuration.
5. If browser tools fail, run `npx playwright install chromium` once.
6. Check the VUDA diagnostic log under the operating system's temporary directory in `vuda-logs/vuda.log`.

For a source checkout, `npm test` verifies the stdio handshake, complete tool inventory, resource reads, stateful tool calls, and a browser screenshot.
