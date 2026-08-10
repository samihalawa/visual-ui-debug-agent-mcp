# Visual Debug Protocol

Use screenshots and rendered state as evidence for browser interactions.

1. Capture the current page before interacting.
2. Inspect visible text, interactive elements, console messages, and the relevant DOM.
3. Target an element using a selector confirmed on the current page.
4. Perform one interaction.
5. Capture or inspect the resulting state and verify the expected change.
6. Record the URL, action, observed result, and any remaining error.

For multi-step journeys, preserve the browser session and validate each important transition. Check both desktop and mobile viewports when layout behavior can differ.
