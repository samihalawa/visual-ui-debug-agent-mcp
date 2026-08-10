# Comprehensive UI debugging prompt

Thoroughly inspect the web application for broken interactions, visual regressions, console errors, network failures, and inconsistent responsive behavior.

## Workflow

1. Map the main pages and interactive elements.
2. Capture baseline screenshots of key desktop and mobile states.
3. Exercise buttons, links, menus, forms, dialogs, and navigation flows.
4. Inspect console output, failed requests, loading states, and error states.
5. Compare related pages for spacing, typography, overflow, overlap, and responsive drift.
6. Re-run the affected workflows after every fix.

Use VUDA's page analyzer, DOM inspector, console monitor, workflow validator, performance analyzer, visual comparison, and screenshot tools as appropriate. Keep the browser session active when a workflow depends on prior navigation or authentication state.

Report each issue with the affected URL or state, reproduction steps, observed result, expected result, and verification evidence after the fix.
