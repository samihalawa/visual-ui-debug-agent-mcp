interface UserFlowStep {
    action: string;
    target?: string;
    selector?: string;
    value?: string;
    description: string;
    waitBefore?: number;
    retries?: number;
    alternativeSelectors?: string[];
    verifyText?: string;
    custom?: string;
    optional?: boolean;
}
interface UserFlow {
    id: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    status: 'not-tested' | 'in-progress' | 'passed' | 'failed' | 'error' | 'adjusted';
    steps: UserFlowStep[];
    expectedResult: string;
    actualResult: string;
    success: boolean | null;
    notes: string;
    fallbackSteps?: UserFlowStep[];
}
interface TestPlanOptions {
    minFlows?: number;
    includeAuth?: boolean;
    includeNavigation?: boolean;
    includeFormInteractions?: boolean;
    includeDataManipulation?: boolean;
    includeErrorCases?: boolean;
}
interface FlowReport {
    total: number;
    passed: number;
    failed: number;
    notTested: number;
    inProgress: number;
    adjusted: number;
    coverage: number;
    flows: Array<{
        id: string;
        description: string;
        status: string;
        success: boolean | null;
        priority: string;
    }>;
}
export declare class UserFlowDebugger {
    private flows;
    private currentFlowIndex;
    private isRunning;
    /**
     * Generate a comprehensive test plan based on the UI
     * @param options Configuration options
     * @returns Generated test flows
     */
    generateTestPlan(options?: TestPlanOptions): UserFlow[];
    /**
     * Execute a specific flow or the current flow in the queue
     * @param flowId Optional flow ID to run
     * @returns Result of the flow execution
     */
    executeFlow(flowId?: string | null): Promise<UserFlow | null>;
    /**
     * Execute all flows in sequence
     * @returns Results of all flow executions
     */
    executeAllFlows(): Promise<UserFlow[] | null>;
    /**
     * Adjust a flow to make it more likely to succeed
     * @param flowId The ID of the flow to adjust
     * @returns The adjusted flow
     */
    adjustFlow(flowId: string): UserFlow | null;
    /**
     * Get a summary report of all flows
     * @returns Summary report
     */
    getReport(): FlowReport;
    /**
     * Export the flows as a structured markdown report
     * @returns Markdown formatted report
     */
    exportMarkdownReport(): string;
}
export {};
