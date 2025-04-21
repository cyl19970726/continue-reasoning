import { createTool, ContextHelper, createContext } from "../utils";
import { z } from "zod";
import { IAgent, IMemoryManager, MemoryData } from "../interfaces";
import { randomUUID } from "crypto";

// --- Define Container IDs --- 
const PLAN_CONTAINER_ID = "conscious-plans-container";
const PROBLEM_CONTAINER_ID = "conscious-problems-container"; // Define EARLIER

// Define IDs locally
export const ConsciousContextId = "ConsciousContext";
export const CreatePlanToolId = "CreatePlanTool";
export const GoalToolId = "GoalTool";
export const ProblemToolId = "ProblemTool";
export const ReflectToolId = "ReflectTool";

// --- Define Problem Schema ---
export const ProblemInfo = z.object({
    id: z.string().describe("Unique identifier for this specific problem instance."),
    memoryId: z.string().describe("The key used to store/retrieve this problem's full details from memory, if applicable."),
    description: z.string().describe("A concise summary or description of the problem."),
    priority: z.number().describe("Numerical priority of the problem (e.g., 10 is highest). Higher priority problems may preempt lower priority ones."),
    status: z.enum(["pending", "resolved", "rejected"]).describe("The current status of resolving the problem (e.g., pending, resolved, rejected)."),
    createdAt: z.date().describe("Timestamp when the plan was initially created."),
    updatedAt: z.date().describe("Timestamp when the plan was last modified."),
});

export const ProblemDataSchema = ProblemInfo.extend({
    resolvePlan: z.string().describe("The proposed plan designed to resolve this specific problem. Should outline the steps, potential solutions considered, and the chosen approach."),
    process: z.array(z.string()).describe("A detailed log of the process followed to resolve the problem based on the resolvePlan. This should include successes, errors, unforeseen issues, and any modifications made to the original plan during execution."),
    result: z.string().describe("The outcome or final result produced by executing this step."),
});

export const StepSchema = z.object({
    id: z.number().describe("Sequential identifier for the step within the plan, typically assigned based on order during creation."),
    dependencySteps: z.array(z.number()).optional().describe("An optional list of step IDs that must be completed before this step can begin execution."),
    status: z.enum(["waiting","pending", "completed", "failed"]).describe("The execution status of this step (e.g., waiting, pending, completed, failed)."),
    task: z.string().describe("A description of the specific action or goal to be achieved in this step."),
    problems: z.array(z.string()).optional().describe("An optional list of problems ids encountered during the execution of this step."),
    process: z.string().describe("A detailed description of the workflow executed for this step, including encountered problems and how they were addressed."),
    result: z.string().describe("The outcome or final result produced by executing this step."),
});


export const PlanInfoSchema = z.object({ 
    id: z.string().describe("Unique identifier for the plan this info relates to."),
    memoryId: z.string().describe("The key used to store/retrieve this plan's full details from memory, if applicable."),
    description: z.string().describe("A concise summary or description of the overall plan."),
    priority: z.number().describe("Numerical priority of the plan (e.g., 10 is highest). Higher priority plans may preempt lower priority ones."),
    status: z.enum(["pending", "resolved", "rejected"]).describe("The current high-level status of the plan."),
    createdAt: z.date().describe("Timestamp when the plan was initially created."),
    updatedAt: z.date().describe("Timestamp when the plan was last modified."),
});

export const PlanDataSchema = PlanInfoSchema.extend({
    currentSteps: z.array(z.number()).describe("The IDs of the steps currently being executed or actively waiting for asynchronous results."),
    steps: z.array(StepSchema).describe("The list of sequential or parallel steps required to complete the plan."),
    completedSteps: z.array(z.number()).describe("The IDs of the steps that have been completed."),
    failedSteps: z.array(z.number()).describe("The IDs of the steps that have failed."),
});


export const PlanDataWithoutMemorySchema = PlanDataSchema.omit({memoryId: true});
export const createPlanInputSchema = PlanDataWithoutMemorySchema.omit({id: true});

export const PlanStorageSchema = z.object({
    activePlans: z.array(PlanDataSchema).max(1).describe("The plan currently being executed. Only one plan is active at a time to maintain context focus and improve execution quality."),
    inactivePlanList: z.array(PlanDataSchema).describe("A list containing information about plans that are not currently active, typically those with lower priority. Use 'transferActivePlan' tool to switch an inactive plan to active if its priority warrants it."),
});

export const ProblemStorageSchema = z.object({
    activeProblems: z.array(ProblemDataSchema).describe("A list of problems encountered during"),
    inactiveProblemList: z.array(ProblemDataSchema).describe("A list of problems encountered during"),
});

export const ConsciousDataSchema = z.object({
    planStorage: PlanStorageSchema,
    problemsStorage: ProblemStorageSchema,
    goal: z.object({
        id: z.string(),
        status: z.enum(["pending", "completed", "failed"]),
        createdAt: z.date(),
        updatedAt: z.date(),
    }),
});

const ConsciousContext = createContext({
    id: ConsciousContextId,
    description: "A context for conscious tools, managing goals, plans (with potentially concurrent steps), and problems.",
    dataSchema: ConsciousDataSchema,
    initialData:{
        planStorage:{
            activePlan: { 
                 id: `init-plan-${Date.now()}`,
                 info: { 
                     id: `init-plan-${Date.now()}`,
                     description: "Initial empty plan", 
                     relatedGoalId: [], 
                     priority: 0, 
                     status: "pending",
                     createdAt: new Date(), 
                     updatedAt: new Date() 
                 },
                 trace: { status: "pending", currentSteps: [], steps: [], completedSteps: [], failedSteps: [] }
            },
            inactivePlanList: [],
        },
        goal: { // Example default goal
            id: `init-goal-${Date.now()}`,
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date()
        }
    },
    renderPromptFn: (data: z.infer<typeof ConsciousDataSchema>) => {
        // Find tasks for all current steps
        const currentStepTasks = data.planStorage.activePlans[0].currentSteps
            .map(stepId => {
                const step = data.planStorage.activePlans[0].steps.find(s => s.id === stepId);
                return step ? `  - Step ${stepId}: ${step.task} (Status: ${step.status})` : `  - Step ${stepId}: (Details not found)`;
            })
            .join("\n");
            
        // Check if there are any current steps
        const currentStepsDisplay = data.planStorage.activePlans[0].currentSteps.length > 0
            ? data.planStorage.activePlans[0].currentSteps.join(', ')
            : '(None - Plan likely completed or needs initiation)';
        const currentTasksDisplay = data.planStorage.activePlans[0].currentSteps.length > 0
            ? currentStepTasks
            : '  (No steps currently active)';

        return `
        --- Conscious Context (Goals, Plans, Problems) ---
        Active Plan: ${data.planStorage.activePlans[0].description} (ID: ${data.planStorage.activePlans[0].id}, Priority: ${data.planStorage.activePlans[0].priority})
        Goal ID: ${data.goal.id} (Status: ${data.goal.status})
        
        Steps Info: ${data.planStorage.activePlans[0].steps.map(step => {return `Step ${step.id}: ${step.task}, dependencySteps: ${step.dependencySteps}`}).join(', ')}
        Completed Steps: ${data.planStorage.activePlans[0].steps.filter(step => step.status === "completed").map(step => {return `Step ${step.id}: ${step.task}`}).join(',\n')}
        Failed Steps: ${data.planStorage.activePlans[0].steps.filter(step => step.status === "failed").map(step => {return `Step ${step.id}: ${step.task}`}).join(',\n')}

        Focus on the currently active steps:
        Currently Active Steps in Plan ${data.planStorage.activePlans.id}:
        IDs: [${currentStepsDisplay}]
        Tasks:
${currentTasksDisplay}

        Inactive Plans Count: ${data.planStorage.inactivePlanList.length}

        Available Tools: CreatePlanTool, GoalTool, ProblemTool, ReflectTool 
        (Potentially others like UpdatePlanTool, TransferActivePlanTool may exist)

        Instructions:
        *   Analyze the status of all 'Currently Active Steps'.
        *   If a step is 'waiting', check if its dependencies are met and consider initiating it.
        *   If a step is 'pending' or running via an async tool, await its completion or monitor for problems.
        *   If a step has 'failed', use ProblemTool to document the issue or ReflectTool to analyze.
        *   Once a step is 'completed', update its status and potentially initiate dependent steps.
        *   Use GoalTool to manage the overall goal status.
        *   Use CreatePlanTool only for entirely new goals/plans.
        `;
    },
    toolListFn: () => [
        CreatePlanTool, 
        LoadPlanTool, 
        MarkStepCompletedTool, 
        MarkStepFailedTool,
        StartStepTool,
        UpdatePlanStatusTool,
        CreateProblemTool, 
        LoadProblemTool,
        UpdateProblemProcessTool,
        UpdateResolvePlanTool 
        /*, GoalTool, ProblemTool, ReflectTool */ 
    ], 
});


export const CreatePlanTool = createTool({
    name: CreatePlanToolId,
    description: "Saves a new plan to memory and registers it. If it has higher priority than the active plan, it replaces it; otherwise, its info is added to the inactive list.",
    inputSchema: createPlanInputSchema, // Input is the plan data WITHOUT memoryId
    outputSchema: z.object({
        success: z.boolean(),
        message: z.string(),
        planId: z.string(),
        memoryId: z.string(),
        isActive: z.boolean(), // Indicates if the new plan became active
    }),
    async: false,
    execute: async (newPlanData, agent) => {
        // Generate ID here
        const planId = randomUUID(); 
        if (!agent) {
            return { success: false, message: "Agent context is missing.", planId, memoryId: 'error', isActive: false };
        }
        
        let memoryId: string | undefined;
        try {
            // Fix findContext generics
            const context = ContextHelper.findContext<typeof ConsciousDataSchema>(
                agent, 
                ConsciousContextId
            );
            // Remove checks for removed context methods
            if (!context || !context.setData || !context.getData) { 
                throw new Error("ConsciousContext not found or is missing required methods (setData, getData).");
            }

            // --- Step 1: Save new plan data to memory --- 
            // Use memoryManager directly, no context.getContainerId needed here
            const containerId = PLAN_CONTAINER_ID; 
            
            const planToSave = {
                ...newPlanData,
                id: planId, // Add the generated ID
            };

            try {
                // Use memoryManager directly, no context.saveMemory
                memoryId = agent.memoryManager.saveMemory({ 
                    description: `Stored plan: ${planToSave.description}`,
                    data: planToSave 
                }, containerId);
                
                // **Validate memoryId against the ID we generated and added**
                if (typeof memoryId !== 'string' || memoryId !== planId) { 
                    throw new Error(`SaveMemory returned invalid ID ('${memoryId}') for plan ${planId}. Expected '${planId}'.`);
                }
            } catch (saveError: any) {
                 console.error(`Failed to save plan ${planId} to memory:`, saveError);
                 return { success: false, message: `Failed to save plan to memory: ${saveError.message}`, planId: planId, memoryId: 'error', isActive: false };
            }
            
            const planWithMemory: z.infer<typeof PlanDataSchema> = {
                ...planToSave, // Use the object that includes the generated ID
                memoryId: memoryId, 
            };

            // Get current state and prepare mutable copy
            const currentData = context.getData();
            const planStorage = JSON.parse(JSON.stringify(currentData.planStorage)); 
            const oldActivePlan = planStorage.activePlan;
            let message = "";
            let isActive = false;

            planStorage.inactivePlanList = planStorage.inactivePlanList ?? [];

            // --- Step 2: Compare priority and update lists --- 
            if (!oldActivePlan || planWithMemory.priority > oldActivePlan.info.priority) {
                 message = `Plan ${planWithMemory.id} saved (memoryId: ${memoryId}) and activated (Priority: ${planWithMemory.priority}).`;
                if (oldActivePlan) {
                    message += ` Old plan ${oldActivePlan.id} moved to inactive list.`;
                     if (!planStorage.inactivePlanList.some((pInfo: z.infer<typeof PlanInfoSchema>) => pInfo.id === oldActivePlan.id)) {
                        planStorage.inactivePlanList.push(oldActivePlan.info);
                    }                    
                }
                planStorage.activePlan = planWithMemory; 
                isActive = true;
                planStorage.inactivePlanList = planStorage.inactivePlanList.filter(
                    (pInfo: z.infer<typeof PlanInfoSchema>) => pInfo.id !== planWithMemory.id 
                );
            } else {
                message = `Plan ${planWithMemory.id} saved (memoryId: ${memoryId}). Priority lower/equal to active plan ${oldActivePlan.id}. Adding info to inactive list.`;
                 // Create a PlanInfo object from planWithMemory
                 const planInfoForList: z.infer<typeof PlanInfoSchema> = PlanInfoSchema.parse(planWithMemory); 
                 if (!planStorage.inactivePlanList.some((pInfo: z.infer<typeof PlanInfoSchema>) => pInfo.id === planWithMemory.id)) {
                    planStorage.inactivePlanList.push(planInfoForList); // Push the PlanInfo object
                }
                isActive = false;
            }

            // Persist the updated plan storage
            context.setData({ planStorage: planStorage });

            console.log(message);
            // Now memoryId is guaranteed to be string here
            return {
                success: true,
                message: message,
                planId: planWithMemory.id,
                memoryId: memoryId, 
                isActive: isActive,
            };

        } catch (error) { // Catch errors from context fetching or other logic
            console.error(`Error in CreatePlanTool (outside save attempt): ${error}`);
            const errorMsg = (error instanceof Error) ? error.message : String(error);
            // Use the potentially undefined memoryId if save succeeded before this error
            return { success: false, message: errorMsg, planId: planId, memoryId: typeof memoryId === 'string' ? memoryId : 'error', isActive: false }; 
        }
    },
});

export const LoadPlanToolId = "LoadPlanTool";

// --- Load Plan Tool ---
const LoadPlanInputSchema = z.object({
    planId: z.string().describe("The unique ID of the plan to load from memory."),
});

const LoadPlanOutputSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    loadedPlan: PlanDataSchema.optional().describe("The full plan object retrieved from memory."),
});

export const LoadPlanTool = createTool({
    name: LoadPlanToolId,
    description: "Loads a complete plan object from memory using its unique ID.",
    inputSchema: LoadPlanInputSchema,
    outputSchema: LoadPlanOutputSchema,
    async: false, // Loading is typically synchronous enough
    execute: async (input, agent) => {
        const { planId } = input;
        if (!agent) {
            return { success: false, message: "Agent context is missing." };
        }

        try {
            // Remove context finding, as it's not needed for memory ops
            // const context = ContextHelper.findContext<typeof ConsciousDataSchema>(
            //     agent, ConsciousContextId
            // );
            // if (!context) { throw new Error("ConsciousContext not found."); }

            // Use memoryManager directly
            const containerId = PLAN_CONTAINER_ID; 
            console.log(`Attempting to load plan ${planId} from container ${containerId}...`);
            
            const memoryData = agent.memoryManager.loadMemory<z.infer<typeof PlanDataSchema>>(
                planId, 
                containerId
            );

            // Assuming loadMemory throws on failure, otherwise check loadedPlanData
            if (!memoryData || !memoryData.data) {
                 throw new Error(`Plan with ID ${planId} not found in memory.`);
            }

            console.log(`Successfully loaded plan ${planId}.`);
            return {
                success: true,
                loadedPlan: memoryData.data,
                message: `Plan ${planId} loaded successfully.`
            };

        } catch (error) {
            console.error(`Error in LoadPlanTool for planId ${planId}:`, error);
            const errorMsg = (error instanceof Error) ? error.message : String(error);
            return { success: false, message: errorMsg };
        }
    },
});
    
export const UpdatePlanExecTraceToolId = "UpdatePlanExecTraceTool";

export const UpdatePlanExecTraceTool = createTool({
    name: UpdatePlanExecTraceToolId,
    description: "A tool for setting goals",
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    async: false,


    execute: async (input) => {},
});

export const ProblemTool = createTool({
    name: ProblemToolId,
    description: "A tool for setting problems",
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    async: false,
    execute: async (input) => {},
});


export const ReflectTool = createTool({
    name: ReflectToolId,
    description: "A tool for reflecting",
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    async: false,
    execute: async (input) => {},
});

export const MarkStepCompletedToolId = "MarkStepCompletedTool";

const MarkStepCompletedInputSchema = z.object({
    planId: z.string().describe("The ID of the plan containing the step to mark as completed."),
    stepId: z.number().describe("The ID of the step to mark as completed."),
    result: z.string().describe("A description of the outcome or final result produced by completing this step."),
});

const MarkStepCompletedOutputSchema = z.object({
    success: z.boolean(),
    message: z.string().describe("A message indicating the outcome of the operation."),
});

export const MarkStepCompletedTool = createTool({
    name: MarkStepCompletedToolId,
    description: "Marks a specific step within a given plan as 'completed', records its result, and updates the plan's execution trace.",
    inputSchema: MarkStepCompletedInputSchema,
    outputSchema: MarkStepCompletedOutputSchema,
    async: false,
    execute: async (input, agent) => {
        const { planId, stepId, result } = input;
        if (!agent) { return { success: false, message: "Agent context is missing." }; }

        try {
            const containerId = PLAN_CONTAINER_ID;
            
            // --- Load the plan directly using Memory Manager --- 
            console.log(`[${MarkStepCompletedToolId}] Loading plan ${planId}...`);
            const memoryData = agent.memoryManager.loadMemory<z.infer<typeof PlanDataSchema>>(planId, containerId);
            if (!memoryData || !memoryData.data) {
                throw new Error(`Plan with ID ${planId} not found in memory.`);
            }
            const planToUpdate = memoryData.data;

            // --- Modify the plan trace --- 
            const stepIndex = planToUpdate.steps.findIndex(s => s.id === stepId);
            if (stepIndex === -1) { throw new Error(`Step ${stepId} not found in plan ${planId}.`); }

            planToUpdate.steps[stepIndex].status = "completed";
            planToUpdate.steps[stepIndex].result = result;
            console.log(`[${MarkStepCompletedToolId}] Marked step ${stepId} as completed.`);

            planToUpdate.currentSteps = planToUpdate.currentSteps.filter(id => id !== stepId);
            if (!planToUpdate.completedSteps) planToUpdate.completedSteps = [];
            if (!planToUpdate.completedSteps.includes(stepId)) { planToUpdate.completedSteps.push(stepId); }

            // --- Save the updated plan directly using Memory Manager --- 
            console.log(`[${MarkStepCompletedToolId}] Saving updated plan ${planId}...`);
            const updatedMemoryData: MemoryData<z.infer<typeof PlanDataSchema>> = { description: memoryData.description, data: planToUpdate };
            agent.memoryManager.saveMemory(updatedMemoryData, containerId);

            // --- Update active plan in CONTEXT if necessary --- 
            const context = ContextHelper.findContext<typeof ConsciousDataSchema>(agent, ConsciousContextId);
            if (context?.getData && context.setData) {
                 const currentContextData = context.getData();
                 const activePlanInfo = currentContextData.planStorage.activePlans[0] as z.infer<typeof PlanInfoSchema> | undefined;
                 if (activePlanInfo && activePlanInfo.id === planId) { 
                     console.log(`[${MarkStepCompletedToolId}] Updating active plan in context.`);
                     const newPlanStorage = { ...currentContextData.planStorage, activePlan: planToUpdate };
                     context.setData({ planStorage: newPlanStorage });
                 }
            }

            return { success: true, message: `Step ${stepId} marked as completed.` };
        } catch (error) {
            console.error(`[${MarkStepCompletedToolId}] Error:`, error);
            const errorMsg = (error instanceof Error) ? error.message : String(error);
            return { success: false, message: errorMsg };
        }
    },
});

export const MarkStepFailedToolId = "MarkStepFailedTool";

const MarkStepFailedInputSchema = z.object({
    planId: z.string().describe("The ID of the plan containing the step to mark as failed."),
    stepId: z.number().describe("The ID of the step to mark as failed."),
    problem: ProblemDataSchema.describe("A detailed description of the problem encountered that caused the step to fail. Should include attempted solutions if any."),
});

const MarkStepFailedOutputSchema = z.object({
    success: z.boolean(),
    message: z.string().describe("A message indicating the outcome of the operation."),
});

export const MarkStepFailedTool = createTool({
    name: MarkStepFailedToolId,
    description: "Marks a specific step within a given plan as 'failed', records the associated problem, and updates the plan's execution trace.",
    inputSchema: MarkStepFailedInputSchema,
    outputSchema: MarkStepFailedOutputSchema,
    async: false,
    execute: async (input, agent) => {
        const { planId, stepId, problem } = input;
        if (!agent) { return { success: false, message: "Agent context is missing." }; }

        try {
            const containerId = PLAN_CONTAINER_ID;
            
            // --- Load the plan directly using Memory Manager --- 
            console.log(`[${MarkStepFailedToolId}] Loading plan ${planId}...`);
            const memoryData = agent.memoryManager.loadMemory<z.infer<typeof PlanSchema>>(planId, containerId);
            if (!memoryData || !memoryData.data) { throw new Error(`Plan ${planId} not found.`); }
            const planToUpdate = memoryData.data;

            // --- Modify Trace --- 
            const stepIndex = planToUpdate.steps.findIndex(s => s.id === stepId);
            if (stepIndex === -1) { throw new Error(`Step ${stepId} not found.`); }

            planToUpdate.steps[stepIndex].status = "failed";
            if (!planToUpdate.steps[stepIndex].problems) planToUpdate.steps[stepIndex].problems = [];
            const problemWithId = { ...problem, id: problem.id || `prob-${stepId}-${randomUUID()}` };
            planToUpdate.steps[stepIndex].problems!.push(problemWithId);
            console.log(`[${MarkStepFailedToolId}] Marked step ${stepId} as failed.`);

            planToUpdate.currentSteps = planToUpdate.currentSteps.filter(id => id !== stepId);
            if (!planToUpdate.failedSteps) planToUpdate.failedSteps = []; 
            if (!planToUpdate.failedSteps.includes(stepId)) { planToUpdate.failedSteps.push(stepId); }

            // --- Save the updated plan directly using Memory Manager --- 
            console.log(`[${MarkStepFailedToolId}] Saving updated plan ${planId}...`);
            const updatedMemoryData: MemoryData<z.infer<typeof PlanDataSchema>> = { description: memoryData.description, data: planToUpdate };
            agent.memoryManager.saveMemory(updatedMemoryData, containerId);

            // --- Update active plan in CONTEXT if necessary --- 
            const context = ContextHelper.findContext<typeof ConsciousDataSchema>(agent, ConsciousContextId);
            if (context?.getData && context.setData) {
                 const currentContextData = context.getData();
                 const activePlanInfo = currentContextData.planStorage.activePlans[0] as z.infer<typeof PlanInfoSchema> | undefined;
                 if (activePlanInfo && activePlanInfo.id === planId) { 
                     console.log(`[${MarkStepFailedToolId}] Updating active plan in context.`);
                     const newPlanStorage = { ...currentContextData.planStorage, activePlan: planToUpdate };
                     context.setData({ planStorage: newPlanStorage });
                 }
            }

            return { success: true, message: `Step ${stepId} marked as failed.` };
        } catch (error) {
            console.error(`[${MarkStepFailedToolId}] Error:`, error);
            const errorMsg = (error instanceof Error) ? error.message : String(error);
            return { success: false, message: errorMsg };
        }
    },
});

export const StartStepToolId = "StartStepTool";

const StartStepInputSchema = z.object({
    planId: z.string().describe("The ID of the plan containing the step to start."),
    stepId: z.number().describe("The ID of the step to mark as started (pending)."),
});

const StartStepOutputSchema = z.object({
    success: z.boolean(),
    message: z.string().describe("A message indicating the outcome of the operation."),
});

export const StartStepTool = createTool({
    name: StartStepToolId,
    description: "Marks a specific step within a given plan as 'pending' (started) and adds it to the list of currently active steps.",
    inputSchema: StartStepInputSchema,
    outputSchema: StartStepOutputSchema,
    async: false,
    execute: async (input, agent) => {
        const { planId, stepId } = input;
        if (!agent) { return { success: false, message: "Agent context is missing." }; }

        try {
            const containerId = PLAN_CONTAINER_ID;

            // --- Load Plan --- 
            console.log(`[${StartStepToolId}] Loading plan ${planId}...`);
            const memoryData = agent.memoryManager.loadMemory<z.infer<typeof PlanDataSchema>>(planId, containerId);
            if (!memoryData || !memoryData.data) { throw new Error(`Plan ${planId} not found.`); }
            const planToUpdate = memoryData.data;

            // --- Modify planToUpdate --- 
            const stepIndex = planToUpdate.steps.findIndex(s => s.id === stepId);
            if (stepIndex === -1) { throw new Error(`Step ${stepId} not found.`); }

            // Check dependencies (optional but good practice)
            const dependencies = planToUpdate.steps[stepIndex].dependencySteps || [];
            const completed = planToUpdate.completedSteps || [];
            const allDepsMet = dependencies.every(depId => completed.includes(depId));
            if (!allDepsMet) {
                 console.warn(`[${StartStepToolId}] Attempted to start step ${stepId} before dependencies (${dependencies.join(', ')}) were met.`);
                 // Decide: throw error or proceed? For now, proceed but warn.
                 // throw new Error(`Cannot start step ${stepId}: Dependencies (${dependencies.join(', ')}) not met.`);
            }

            planToUpdate.steps[stepIndex].status = "pending";
            console.log(`[${StartStepToolId}] Marked step ${stepId} as pending.`);

            if (!planToUpdate.currentSteps) planToUpdate.currentSteps = [];
            if (!planToUpdate.currentSteps.includes(stepId)) { planToUpdate.currentSteps.push(stepId); }

            // --- Save Plan --- 
            console.log(`[${StartStepToolId}] Saving updated plan ${planId}...`);
            const updatedMemoryData: MemoryData<z.infer<typeof PlanSchema>> = { id: planId, description: memoryData.description, data: planToUpdate };
            agent.memoryManager.saveMemory(updatedMemoryData, containerId);

            // --- Update Context if Active --- 
            const context = ContextHelper.findContext<typeof ConsciousDataSchema>(agent, ConsciousContextId);
             if (context?.getData && context.setData) {
                 const currentContextData = context.getData();
                 const activePlanInfo = currentContextData.planStorage.activePlans?.info as z.infer<typeof PlanInfoSchema> | undefined;
                 if (activePlanInfo && activePlanInfo.id === planId) {
                    console.log(`[${StartStepToolId}] Updating active plan in context.`);
                    const newPlanStorage = { ...currentContextData.planStorage, activePlan: planToUpdate };
                    context.setData({ planStorage: newPlanStorage });
                }
            }

            return { success: true, message: `Step ${stepId} started.` };
        } catch (error) {
            console.error(`[${StartStepToolId}] Error:`, error);
            const errorMsg = (error instanceof Error) ? error.message : String(error);
            return { success: false, message: errorMsg };
        }
    },
});

export const UpdatePlanStatusToolId = "UpdatePlanStatusTool";

const UpdatePlanStatusInputSchema = z.object({
    planId: z.string().describe("The ID of the plan whose overall status needs updating."),
    // Use the enum defined in PlanInfo schema for consistency
    newStatus: z.enum(["pending", "resolved", "rejected"])
                 .describe("The new overall status for the plan (e.g., 'resolved' if all steps succeeded, 'rejected' if failed or abandoned)."),
});

const UpdatePlanStatusOutputSchema = z.object({
    success: z.boolean(),
    message: z.string().describe("A message indicating the outcome of the operation."),
});

export const UpdatePlanStatusTool = createTool({
    name: UpdatePlanStatusToolId,
    description: "Updates the overall status of a specific plan (e.g., to 'resolved' or 'rejected').",
    inputSchema: UpdatePlanStatusInputSchema,
    outputSchema: UpdatePlanStatusOutputSchema,
    async: false,
    execute: async (input, agent) => {
        const { planId, newStatus } = input;
        if (!agent) { return { success: false, message: "Agent context is missing." }; }

        try {
            const containerId = PLAN_CONTAINER_ID;

            // --- Load Plan --- 
            console.log(`[${UpdatePlanStatusToolId}] Loading plan ${planId}...`);
            const memoryData = agent.memoryManager.loadMemory<z.infer<typeof PlanDataSchema>>(planId, containerId);
            if (!memoryData || !memoryData.data) { throw new Error(`Plan ${planId} not found.`); }
            const planToUpdate = memoryData.data;

            // --- Modify Plan Status --- 
            planToUpdate.status = newStatus;
            if (planToUpdate.status) { planToUpdate.status = newStatus; } 
            else { console.warn(`Plan ${planId} trace missing!`); }
            console.log(`[${UpdatePlanStatusToolId}] Updated status to ${newStatus}.`);

            // --- Save Plan --- 
            console.log(`[${UpdatePlanStatusToolId}] Saving updated plan ${planId}...`);
            const updatedMemoryData: MemoryData<z.infer<typeof PlanDataSchema>> = { description: memoryData.description, data: planToUpdate };
            agent.memoryManager.saveMemory(updatedMemoryData, containerId);

            // --- Update Context if Active --- 
             const context = ContextHelper.findContext<typeof ConsciousDataSchema>(agent, ConsciousContextId);
             if (context?.getData && context.setData) {
                 const currentContextData = context.getData();
                 const activePlanInfo = currentContextData.planStorage.activePlans[0] as z.infer<typeof PlanInfoSchema> | undefined;
                 if (activePlanInfo && activePlanInfo.id === planId) {
                    console.log(`[${UpdatePlanStatusToolId}] Updating active plan in context.`);
                    const newPlanStorage = { ...currentContextData.planStorage, activePlan: planToUpdate };
                    context.setData({ planStorage: newPlanStorage });
                }
            }

            return { success: true, message: `Status updated to ${newStatus}.` };
        } catch (error) {
            console.error(`[${UpdatePlanStatusToolId}] Error:`, error);
            const errorMsg = (error instanceof Error) ? error.message : String(error);
            return { success: false, message: errorMsg };
        }
    },
});

// #region Problem Management Tools

export const CreateProblemToolId = "CreateProblemTool";

// Correct the omit call - only omit fields generated internally
const CreateProblemInputSchema = ProblemDataSchema.omit({
    id: true, 
    memoryId: true,
    status: true, 
    description: true,
    resolvePlan: true,
    result: true // Result starts empty
});

const CreateProblemOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    problemId: z.string().describe("The unique ID assigned to the newly created problem."),
    memoryId: z.string().describe("The ID used to store the problem in memory (same as problemId)."),
});

export const CreateProblemTool = createTool({
    name: CreateProblemToolId,
    description: "Creates a new problem record, assigns it a unique ID, saves it to memory, and sets its initial status to 'pending'.",
    inputSchema: CreateProblemInputSchema,
    outputSchema: CreateProblemOutputSchema,
    async: false,
    // Ensure input type is correctly inferred
    execute: async (input: z.infer<typeof CreateProblemInputSchema>, agent) => { 
        const problemId = randomUUID();
        if (!agent) {
            return { success: false, message: "Agent context is missing.", problemId: 'error', memoryId: 'error' };
        }

        try {
            // Prepare the full problem object, ensuring all fields are present
            const newProblem: z.infer<typeof ProblemDataSchema> = {
                ...input, // Contains description, resolvePlan
                id: problemId,
                memoryId: problemId, // Use the same ID for memory key
                status: "pending", 
                process: [], // Initialize process log as empty array
                result: "" // Initialize result as empty
            };

            // --- Save Problem to Memory --- 
            console.log(`[${CreateProblemToolId}] Saving problem ${problemId} to container ${PROBLEM_CONTAINER_ID}...`);
            const memoryData: MemoryData<z.infer<typeof ProblemDataSchema>> = {
                description: `Problem: ${input.description.substring(0, 50)}...`,
                data: newProblem
            };
            const savedMemoryId = agent.memoryManager.saveMemory(memoryData, PROBLEM_CONTAINER_ID);
            
            if (savedMemoryId !== problemId) {
                throw new Error(`Failed to save problem ${problemId}: Memory manager returned unexpected ID ${savedMemoryId}`);
            }

            // ... (Optional context update) ...

            console.log(`[${CreateProblemToolId}] Problem ${problemId} created and saved successfully.`);
            return {
                success: true,
                message: `Problem ${problemId} created successfully.`,
                problemId: problemId,
                memoryId: savedMemoryId,
            };

        } catch (error) {
            console.error(`[${CreateProblemToolId}] Error:`, error);
            const errorMsg = (error instanceof Error) ? error.message : String(error);
            // Include problemId in error return
            return { success: false, message: errorMsg, problemId: problemId, memoryId: 'error' }; 
        }
    },
});

export const LoadProblemToolId = "LoadProblemTool";

const LoadProblemInputSchema = z.object({
    problemId: z.string().describe("The unique ID of the problem to load from memory."),
});

// Output schema should return the full ProblemSchema object
const LoadProblemOutputSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    loadedProblem: ProblemDataSchema.optional().describe("The full problem object retrieved from memory."),
});

export const LoadProblemTool = createTool({
    name: LoadProblemToolId,
    description: "Loads a complete problem object from memory using its unique ID.",
    inputSchema: LoadProblemInputSchema,
    outputSchema: LoadProblemOutputSchema,
    async: false,
    execute: async (input, agent) => {
        const { problemId } = input;
        if (!agent) {
            return { success: false, message: "Agent context is missing." };
        }

        try {
            // Use memoryManager directly to load the specific problem
            console.log(`[${LoadProblemToolId}] Loading problem ${problemId} from container ${PROBLEM_CONTAINER_ID}...`);
            
            const memoryData = agent.memoryManager.loadMemory<z.infer<typeof ProblemDataSchema>>(
                problemId, // Use problemId as the memory key
                PROBLEM_CONTAINER_ID
            );

            if (!memoryData || !memoryData.data) {
                 throw new Error(`Problem with ID ${problemId} not found in memory container ${PROBLEM_CONTAINER_ID}.`);
            }

            console.log(`[${LoadProblemToolId}] Successfully loaded problem ${problemId}.`);
            return {
                success: true,
                loadedProblem: memoryData.data, // Return the data part of MemoryData
                message: `Problem ${problemId} loaded successfully.`
            };

        } catch (error) {
            console.error(`[${LoadProblemToolId}] Error loading problem ${problemId}:`, error);
            const errorMsg = (error instanceof Error) ? error.message : String(error);
            return { success: false, message: errorMsg };
        }
    },
});

export const UpdateProblemProcessToolId = "UpdateProblemProcessTool";

const UpdateProblemProcessInputSchema = z.object({
    problemId: z.string().describe("The unique ID of the problem whose process log needs updating."),
    logEntry: z.string().describe("The new log entry detailing part of the problem-solving process."),
});

const UpdateProblemProcessOutputSchema = z.object({
    success: z.boolean(),
    message: z.string().describe("A message indicating the outcome of the operation."),
});

export const UpdateProblemProcessTool = createTool({
    name: UpdateProblemProcessToolId,
    description: "Adds a new entry to the process log of a specific problem stored in memory.",
    inputSchema: UpdateProblemProcessInputSchema,
    outputSchema: UpdateProblemProcessOutputSchema,
    async: false,
    execute: async (input, agent) => {
        const { problemId, logEntry } = input;
        if (!agent) {
            return { success: false, message: "Agent context is missing." };
        }

        try {
            // --- Load the Problem --- 
            console.log(`[${UpdateProblemProcessToolId}] Loading problem ${problemId} from container ${PROBLEM_CONTAINER_ID}...`);
            const memoryData = agent.memoryManager.loadMemory<z.infer<typeof ProblemSchema>>(
                problemId, 
                PROBLEM_CONTAINER_ID
            );
            if (!memoryData || !memoryData.data) {
                 throw new Error(`Problem with ID ${problemId} not found in memory.`);
            }
            const problemToUpdate = memoryData.data;

            // --- Update Process Log --- 
            // Ensure the process array exists and append the new entry
            if (!problemToUpdate.process) problemToUpdate.process = []; // Initialize if needed
            problemToUpdate.process.push(`[${new Date().toISOString()}] ${logEntry}`); // Add timestamp
            console.log(`[${UpdateProblemProcessToolId}] Appended to process log for problem ${problemId}.`);

            // --- Save Updated Problem --- 
            console.log(`[${UpdateProblemProcessToolId}] Saving updated problem ${problemId}...`);
            // Reconstruct MemoryData for saving
            const updatedMemoryData: MemoryData<z.infer<typeof ProblemSchema>> = {
                id: problemId,
                description: memoryData.description, // Keep original description or update if needed
                data: problemToUpdate
            };
            agent.memoryManager.saveMemory(updatedMemoryData, PROBLEM_CONTAINER_ID);
            
            return {
                success: true,
                message: `Process log updated for problem ${problemId}.`            };

        } catch (error) {
            console.error(`[${UpdateProblemProcessToolId}] Error updating process for problem ${problemId}:`, error);
            const errorMsg = (error instanceof Error) ? error.message : String(error);
            return { success: false, message: errorMsg };
        }
    },
});

export const UpdateResolvePlanToolId = "UpdateResolvePlanTool";

const UpdateResolvePlanInputSchema = z.object({
    problemId: z.string().describe("The unique ID of the problem whose resolution plan needs updating."),
    newResolvePlan: z.string().describe("The new or updated plan for resolving the problem."),
});

const UpdateResolvePlanOutputSchema = z.object({
    success: z.boolean(),
    message: z.string().describe("A message indicating the outcome of the operation."),
});

export const UpdateResolvePlanTool = createTool({
    name: UpdateResolvePlanToolId,
    description: "Updates the resolution plan (resolvePlan field) for a specific problem stored in memory.",
    inputSchema: UpdateResolvePlanInputSchema,
    outputSchema: UpdateResolvePlanOutputSchema,
    async: false,
    execute: async (input, agent) => {
        const { problemId, newResolvePlan } = input;
        if (!agent) {
            return { success: false, message: "Agent context is missing." };
        }

        try {
            // --- Load the Problem --- 
            console.log(`[${UpdateResolvePlanToolId}] Loading problem ${problemId} from container ${PROBLEM_CONTAINER_ID}...`);
            const memoryData = agent.memoryManager.loadMemory<z.infer<typeof ProblemSchema>>(
                problemId, 
                PROBLEM_CONTAINER_ID
            );
            if (!memoryData || !memoryData.data) {
                 throw new Error(`Problem with ID ${problemId} not found in memory.`);
            }
            const problemToUpdate = memoryData.data;

            // --- Update Resolve Plan --- 
            problemToUpdate.resolvePlan = newResolvePlan;
            console.log(`[${UpdateResolvePlanToolId}] Updated resolvePlan for problem ${problemId}.`);

            // --- Save Updated Problem --- 
            console.log(`[${UpdateResolvePlanToolId}] Saving updated problem ${problemId}...`);
            const updatedMemoryData: MemoryData<z.infer<typeof ProblemSchema>> = {
                id: problemId,
                description: memoryData.description, // Keep original description
                data: problemToUpdate
            };
            agent.memoryManager.saveMemory(updatedMemoryData, PROBLEM_CONTAINER_ID);
            
            return {
                success: true,
                message: `Resolution plan updated for problem ${problemId}.`
            };

        } catch (error) {
            console.error(`[${UpdateResolvePlanToolId}] Error updating resolve plan for problem ${problemId}:`, error);
            const errorMsg = (error instanceof Error) ? error.message : String(error);
            return { success: false, message: errorMsg };
        }
    },
});

// #endregion Problem Management Tools



