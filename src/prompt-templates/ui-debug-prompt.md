# USE_ME: Comprehensive UI/UX Debugging Prompt

## Primary Directive
Thoroughly debug the web application to identify and fix all UI/UX issues, broken functionality, network problems, and visual inconsistencies. Ensure the application is production-ready with no broken paths or non-functional elements.

## Core Debugging Process
1. **Initial Site Analysis**
   - Navigate to all main pages and create a site map
   - Document all interactive elements and their expected behaviors
   - Screenshot key pages for baseline comparison

2. **Interactive Element Validation**
   - Test ALL clickable elements (buttons, links, tabs, dropdowns)
   - Verify form submissions with various input combinations
   - Check navigation flows between pages/sections
   - Ensure modals/dialogs function correctly

3. **Visual Consistency Verification**
   - Compare visual appearance across pages/components
   - Verify responsive layouts at multiple breakpoints
   - Check for visual regressions against baseline screenshots
   - Ensure consistent styling (colors, spacing, typography)

4. **Network/API Validation**
   - Monitor network requests during user interactions
   - Test all API endpoints for proper responses
   - Verify data loading states and error handling
   - Check for redundant or excessive requests

5. **Common Error Detection**
   - Check console for JavaScript errors
   - Verify proper error handling for user inputs
   - Test offline behavior and recovery
   - Validate edge cases (rapid clicks, back/forward navigation)

## Implementation Guidelines
- Always replace dummy/placeholder content with proper content
- Use CDN resources for all assets when possible
- Remove or properly implement social network links
- Ensure all async operations have proper loading indicators
- Optimize image sizes and formats for performance

## Common Issues to Address

### UI Rendering Problems
- Broken layouts on specific screen sizes
- Z-index conflicts causing element overlap
- Flashing/flickering content during transitions
- Improper text truncation or overflow
- Inconsistent spacing between elements

### Interactive Element Failures
- Buttons that don't trigger actions
- Form submissions that don't process
- Dropdowns/menus that don't open or close properly
- Links pointing to non-existent pages (404s)
- SVG/icon rendering issues

### Performance Issues
- Slow initial page load
- Delayed response to user interactions
- Jank during scrolling or animations
- Excessive re-renders
- Memory leaks with prolonged use

### API/Data Failures
- Failed API requests
- Inconsistent data between pages
- Stale data not refreshing
- Missing error handling for API failures
- Race conditions causing UI inconsistencies

## Playwright-Specific Techniques
- Use `playwright_navigate` to load pages while maintaining browser state
- Employ `ui_workflow_validator` to test complete user journeys
- Verify DOM structure with `dom_inspector` before interactions
- Monitor console logs continuously with `console_monitor`
- Use `performance_analysis` to identify bottlenecks
- Compare visual state across pages with `visual_comparison`
- Screenshot critical workflows with `batch_screenshot_urls`
- Validate visible text content to ensure proper rendering

## Iterative Debugging Approach
1. Map the entire application structure
2. Systematically test each component
3. Document all issues discovered
4. Prioritize fixes by severity
5. Implement fixes iteratively
6. Re-test after each significant change
7. Perform comprehensive validation tests before completion

Remember to maintain a persistent browser session between navigations by using the appropriate Playwright commands to ensure efficient debugging and testing of multi-page workflows.