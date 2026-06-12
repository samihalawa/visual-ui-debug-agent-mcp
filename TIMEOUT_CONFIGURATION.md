# VUDA Timeout Configuration

This document describes the timeout configuration improvements made to the Visual UI Debug Agent (VUDA) MCP server for better flexibility and reliability.

## Overview

VUDA now supports configurable timeouts through environment variables, with significantly increased default values to handle slow-loading applications and high-latency environments.

## Environment Variables

You can customize timeout behavior by setting these environment variables:

### Core Timeouts
- `VUDA_DEFAULT_TIMEOUT` - Default page timeout (default: 15000ms)
- `VUDA_NAVIGATION_TIMEOUT` - Page navigation timeout (default: 15000ms)
- `VUDA_SELECTOR_TIMEOUT` - Element selector timeout (default: 12000ms)

### Stability & Performance
- `VUDA_STABILITY_WAIT` - Wait time for page stability (default: 5000ms)
- `VUDA_UI_UPDATE_WAIT` - Wait time for UI updates (default: 1000ms)
- `VUDA_PERFORMANCE_THRESHOLD` - Performance monitoring threshold (default: 15000ms)
- `VUDA_INTERACTION_DELAY` - Delay between interactions (default: 500ms)

### Flow Testing
- `VUDA_FLOW_STEP_DELAY` - Delay between flow steps (default: 1000ms)
- `VUDA_ACTION_WAIT_BEFORE` - Wait before actions in flows (default: 2000ms)

## Usage Examples

### Basic Usage (Default Values)
```bash
# Run with default timeout values
node dist/index.js
```

### Custom Timeout Configuration
```bash
# Increase timeouts for slow applications
export VUDA_DEFAULT_TIMEOUT=30000
export VUDA_NAVIGATION_TIMEOUT=30000
export VUDA_SELECTOR_TIMEOUT=20000
export VUDA_STABILITY_WAIT=10000

node dist/index.js
```

### High-Latency Environment
```bash
# Configuration for high-latency/slow networks
export VUDA_DEFAULT_TIMEOUT=60000
export VUDA_NAVIGATION_TIMEOUT=60000
export VUDA_SELECTOR_TIMEOUT=45000
export VUDA_STABILITY_WAIT=15000
export VUDA_UI_UPDATE_WAIT=5000

node dist/index.js
```

### Fast Local Testing
```bash
# Reduced timeouts for fast local development
export VUDA_DEFAULT_TIMEOUT=10000
export VUDA_NAVIGATION_TIMEOUT=8000
export VUDA_SELECTOR_TIMEOUT=6000
export VUDA_STABILITY_WAIT=2000

node dist/index.js
```

## Timeout Improvements Summary

| Timeout Type | Old Default | New Default | Improvement |
|-------------|-------------|-------------|-------------|
| Default/Navigation | 4000ms | 15000ms | +275% |
| Selector Wait | 4000ms | 12000ms | +200% |
| Stability Wait | 3000ms | 5000ms | +67% |
| Performance Threshold | 4000ms | 15000ms | +275% |

## Backward Compatibility

All changes are backward compatible. If no environment variables are set, the new default values will be used, which provide much better reliability for most use cases.

## Benefits

1. **Improved Reliability** - Fewer timeout failures on slow applications
2. **Flexibility** - Configure timeouts per environment
3. **Better SPA Support** - Longer waits for heavy JavaScript applications
4. **Mobile Device Testing** - Accommodates slower mobile emulation
5. **Network Resilience** - Works better in high-latency environments

## Migration Notes

- No code changes required for existing users
- Environment variables are optional
- Default values provide better out-of-box experience
- All hardcoded 4000ms timeouts have been eliminated

## Troubleshooting

If you experience timeout issues:
1. Increase `VUDA_NAVIGATION_TIMEOUT` for slow page loads
2. Increase `VUDA_SELECTOR_TIMEOUT` for dynamic content
3. Increase `VUDA_STABILITY_WAIT` for applications with heavy JavaScript
4. Monitor console output for specific timeout errors

For very fast applications, you can reduce timeouts to speed up testing, but ensure reliability is maintained.