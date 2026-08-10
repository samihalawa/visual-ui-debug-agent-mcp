# Iterative UI Debugging Loop

## Establish a baseline

- Identify the main routes and the workflow under test.
- Capture the initial rendered state.
- Inspect console output and relevant network or API behavior.
- List reproducible defects with expected and observed results.

## Fix and verify

For each defect:

1. Reproduce it from a known state.
2. Inspect the element, console, and request evidence that explains the failure.
3. Apply the smallest targeted fix in the application under test.
4. Repeat the same interaction.
5. Capture the corrected state and check adjacent workflow steps for regressions.

## Completion evidence

Summarize the tested URLs and viewports, the exact interactions exercised, defects fixed, remaining reproducible failures, console errors, and before/after visual evidence.
