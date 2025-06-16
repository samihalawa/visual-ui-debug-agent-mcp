# Visual UI Debugging & Remote Access

## Visual Debug Protocol
**Pattern**: Always screenshot before clicks. Never assume selectors.

### Core Workflow:
1. **Screenshot First**: Capture current state before any interaction
2. **Analyze Visual State**: Identify elements, layout, accessibility 
3. **Precise Targeting**: Use visual confirmation for element selection
4. **Action Validation**: Screenshot after action to verify results

### Remote Access Setup:
```bash
# Before using remote debugging (VUDA is remote):
cloudflare tunnel --url http://localhost:{port}
```

### Browser Automation Priority:
1. **BrowserMCP** - Primary choice for UI automation
2. **AppleScript refresh** - If BrowserMCP fails: `osascript -e 'tell application "Chrome" to reload active tab'`
3. **Alternative tools** - Fallback options

### Visual Debugging Best Practices:
- Screenshot before every click/interaction
- Validate element visibility and state
- Check responsive behavior across viewports
- Verify accessibility attributes
- Document visual changes with before/after shots

### Common Visual Debug Scenarios:
- Form interaction debugging
- Responsive layout verification  
- Dynamic content loading
- Cross-browser compatibility
- Mobile device simulation