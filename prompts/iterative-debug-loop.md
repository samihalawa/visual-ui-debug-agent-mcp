# VUDA Iterative Debug Loop Protocol

## 🔄 AUTOMATIC EXECUTION LOOP

This prompt should be read and executed automatically at the start of each debugging session and after each major fix.

---

## **PHASE 1: REPOSITORY RECONNAISSANCE** (Execute First)

Thoroughly analyze this repository to understand the current state:

1. **Project Structure Analysis**
   ```bash
   tree -I 'node_modules|.git|dist|build|coverage' | head -50
   ```

2. **Endpoint & Route Discovery**
   ```bash
   grep -r "app\.get\|app\.post\|router\." --include="*.js" --include="*.ts" | head -20
   grep -r "@Get\|@Post\|@Put\|@Delete" --include="*.ts" | head -20
   ```

3. **Function & Class Mapping**
   ```bash
   grep -r "function\|const.*=.*=>\|class\|export" --include="*.js" --include="*.ts" | head -30
   ```

4. **Configuration Discovery**
   ```bash
   find . -name "*.json" -o -name "*.env*" -o -name "*.config.*" -not -path "*/node_modules/*" | head -20
   ```

5. **Entry Points & Main Files**
   ```bash
   ls -la src/ | grep -E "(index|main|app)\.(js|ts|jsx|tsx)"
   find . -name "package.json" -exec grep -H "main\|start\|entry" {} \;
   ```

---

## **PHASE 2: VISUAL DEBUG INITIALIZATION**

### Setup Browser Session
1. Use `enhanced_page_analyzer` on main URL to establish baseline
2. Capture initial screenshots of all key pages
3. Map all interactive elements with their expected behaviors
4. Document current visual state for comparison

### Create Debug Task List
```markdown
## Debug Tasks (Update continuously)

### 🔴 Critical Issues
- [ ] Issue 1: [Description]
- [ ] Issue 2: [Description]

### 🟡 Important Issues  
- [ ] Issue 3: [Description]
- [ ] Issue 4: [Description]

### 🟢 Minor Issues
- [ ] Issue 5: [Description]

### ✅ Completed
- [x] Fixed: [Description of fix]
```

---

## **PHASE 3: PARALLEL DEBUGGING STRATEGY**

Deploy multiple debugging approaches simultaneously:

### **Debug Stream 1: UI/UX Testing**
```javascript
// Test every interactive element
const uiTests = [
  { action: "click", target: "all buttons", validate: "proper response" },
  { action: "fill", target: "all forms", validate: "submission works" },
  { action: "navigate", target: "all links", validate: "no 404s" },
  { action: "hover", target: "dropdowns", validate: "menus appear" }
];
```

### **Debug Stream 2: Visual Consistency**
- Screenshot each major view/page
- Compare visual elements across pages
- Check responsive behavior at breakpoints: 320px, 768px, 1024px, 1440px
- Verify no visual regressions after fixes

### **Debug Stream 3: Console & Network Monitoring**
- Monitor console for JavaScript errors
- Track all API calls and responses
- Identify failed network requests
- Check for performance bottlenecks

### **Debug Stream 4: Workflow Validation**
- Test complete user journeys end-to-end
- Verify data persistence across pages
- Check state management consistency
- Validate error handling flows

---

## **PHASE 4: ITERATIVE FIX LOOP**

### For Each Issue Found:

1. **Document**
   ```markdown
   ### Issue: [Name]
   - **Severity**: Critical/High/Medium/Low
   - **Location**: [File:Line or URL]
   - **Description**: [What's broken]
   - **Expected**: [What should happen]
   - **Actual**: [What happens]
   - **Screenshot**: [If applicable]
   ```

2. **Analyze Root Cause**
   - Use `dom_inspector` to examine element structure
   - Check `console_monitor` for errors
   - Review network requests with `api_endpoint_tester`
   - Compare with working examples using `visual_comparison`

3. **Implement Fix**
   - Make targeted code changes
   - Test fix in isolation
   - Verify no regressions introduced

4. **Validate Fix**
   - Re-run the specific test that found the issue
   - Screenshot the fixed state
   - Update task list with completion
   - Check for any side effects

5. **Loop Back**
   - If more issues exist, continue to next
   - If all critical issues fixed, run comprehensive validation
   - Update progress report

---

## **PHASE 5: COMPREHENSIVE VALIDATION**

After all fixes are implemented:

1. **Full Regression Test**
   ```javascript
   await ui_workflow_validator({
     startUrl: baseUrl,
     taskDescription: "Complete application validation",
     steps: comprehensiveTestSteps,
     captureScreenshots: "all"
   });
   ```

2. **Performance Verification**
   - Page load times < 3 seconds
   - Interactive elements respond < 100ms
   - No memory leaks during extended use

3. **Cross-Browser Check**
   - Test in Chrome, Firefox, Safari (if available)
   - Verify mobile responsiveness
   - Check accessibility compliance

---

## **PHASE 6: FINAL REPORT GENERATION**

### Debug Summary Template:
```markdown
# Debug Session Report - [Date]

## Overview
- **Total Issues Found**: X
- **Critical Fixed**: X/X
- **High Priority Fixed**: X/X  
- **Medium/Low Fixed**: X/X

## Key Fixes Applied
1. [Fix description and impact]
2. [Fix description and impact]

## Remaining Issues
- [Any unresolved issues with reasoning]

## Performance Metrics
- Initial Load Time: Xs → Xs
- API Response Times: Improved by X%
- Error Rate: X% → 0%

## Visual Evidence
- Before/After screenshots attached
- Test recordings available

## Recommendations
- [Future improvements]
- [Maintenance suggestions]
```

---

## **🔁 AUTOMATIC RE-EXECUTION TRIGGER**

This prompt should automatically re-execute when:
1. A new debugging session starts
2. After completing a major fix milestone
3. When switching to a different area of the application
4. Every 30 minutes during extended debugging sessions

**Remember**: Always maintain the browser session between iterations for efficiency. Update the task list continuously. Screenshot everything before and after changes.