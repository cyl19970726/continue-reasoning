// Example: How to use the Plan module in HHH-AGI
// This example demonstrates the planning workflow and agent stop functionality

import { PlanContext, CreatePlanTool, UpdatePlanStatusTool, ListPlansTool, AgentStopTool } from '../src/core/contexts/interaction';

console.log('🎯 Plan Module Usage Example');
console.log('============================\n');

// Example workflow:
console.log('📋 Planning Workflow:');
console.log('1. Create plan items to organize tasks');
console.log('2. Update status as work progresses');
console.log('3. Track completion and duration');
console.log('4. Stop agent when all tasks are done\n');

console.log('🛠️ Available Tools:');
console.log(`• ${CreatePlanTool.name}: ${CreatePlanTool.description}`);
console.log(`• ${UpdatePlanStatusTool.name}: ${UpdatePlanStatusTool.description}`);
console.log(`• ${ListPlansTool.name}: ${ListPlansTool.description}`);
console.log(`• ${AgentStopTool.name}: ${AgentStopTool.description}\n`);

console.log('📊 Context Information:');
console.log(`Context ID: ${PlanContext.id}`);
console.log(`Description: ${PlanContext.description}\n`);

console.log('💡 Usage Examples:');
console.log('');

console.log('1. Create a plan item:');
console.log('   create_plan({');
console.log('     title: "Implement user authentication",');
console.log('     description: "Add login/logout functionality with JWT tokens",');
console.log('     priority: "high",');
console.log('     estimatedDuration: 120,');
console.log('     tags: ["backend", "security"]');
console.log('   })');
console.log('');

console.log('2. Update plan status:');
console.log('   update_plan_status({');
console.log('     planId: "plan-item-id",');
console.log('     status: "completed",');
console.log('     actualDuration: 95');
console.log('   })');
console.log('');

console.log('3. List current plans:');
console.log('   list_plans({');
console.log('     includeCompleted: true');
console.log('   })');
console.log('');

console.log('4. Stop agent when done:');
console.log('   agent_stop({');
console.log('     reason: "All planned tasks completed successfully"');
console.log('   })');
console.log('');

console.log('🎯 Best Practices:');
console.log('• Break down complex tasks into smaller, manageable items');
console.log('• Set realistic time estimates and priorities');
console.log('• Update status regularly to track progress');
console.log('• Use dependencies to manage task order');
console.log('• Use tags for better organization');
console.log('• Always stop the agent when work is complete');
console.log('');

console.log('✅ Plan module is ready for use!'); 