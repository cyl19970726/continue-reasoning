// Example: How to use the Plan module in HHH-AGI
// This example demonstrates the planning workflow and agent stop functionality

import { PlanContext, PlanManagementTool, AgentStopTool } from '../src/core/contexts/interaction';

console.log('🎯 Plan Module Usage Example');
console.log('============================\n');

// Example workflow:
console.log('📋 Planning Workflow:');
console.log('1. Create execution plans to organize tasks');
console.log('2. Update step status as work progresses');
console.log('3. Complete steps and track progress');
console.log('4. Complete plan and stop agent when done\n');

console.log('🛠️ Available Tools:');
console.log(`• ${PlanManagementTool.name}: ${PlanManagementTool.description}`);
console.log(`• ${AgentStopTool.name}: ${AgentStopTool.description}\n`);

console.log('📊 Context Information:');
console.log(`Context ID: ${PlanContext.id}`);
console.log(`Description: ${PlanContext.description}\n`);

console.log('💡 Usage Examples:');
console.log('');

console.log('1. Create a plan:');
console.log('   plan_management({');
console.log('     command: "create",');
console.log('     title: "Implement user authentication",');
console.log('     description: "Add login/logout functionality with JWT tokens",');
console.log('     steps: [');
console.log('       {');
console.log('         title: "Design authentication flow",');
console.log('         description: "Plan the login/logout process",');
console.log('         toolsToCall: ["file_operations"]');
console.log('       },');
console.log('       {');
console.log('         title: "Implement JWT handling",');
console.log('         description: "Add token generation and validation",');
console.log('         toolsToCall: ["coding_tools", "file_operations"]');
console.log('       }');
console.log('     ]');
console.log('   })');
console.log('');

console.log('2. Update step status:');
console.log('   plan_management({');
console.log('     command: "update_step",');
console.log('     stepId: "step-id",');
console.log('     status: "in_progress"');
console.log('   })');
console.log('');

console.log('3. Complete a step:');
console.log('   plan_management({');
console.log('     command: "complete_step",');
console.log('     stepId: "step-id"');
console.log('   })');
console.log('');

console.log('4. Complete the plan:');
console.log('   plan_management({');
console.log('     command: "complete_plan"');
console.log('   })');
console.log('');

console.log('5. Stop agent when done:');
console.log('   agent_stop({');
console.log('     reason: "All planned tasks completed successfully"');
console.log('   })');
console.log('');

console.log('🎯 Best Practices:');
console.log('• Break down complex tasks into clear steps');
console.log('• Specify which tools each step will use');
console.log('• Update step status regularly to track progress');
console.log('• Complete steps in order when possible');
console.log('• Always complete the plan and stop the agent when work is done');
console.log('');

console.log('✅ Plan module is ready for use!'); 