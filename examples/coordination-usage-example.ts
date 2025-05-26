// Example: Coordination between Coding and Interaction Contexts
// This example demonstrates how to use the coordination module to manage
// the interaction between coding tasks and planning/approval workflows

import { 
  CoordinationContext, 
  SyncCodingProgressTool, 
  RequestFileOpApprovalTool, 
  ConsolidatePromptsTool 
} from '../src/core/contexts/interaction';

console.log('🔄 Context Coordination Usage Example');
console.log('=====================================\n');

console.log('🎯 Purpose:');
console.log('The coordination module bridges coding and interaction contexts to:');
console.log('• Automatically sync coding progress with plan items');
console.log('• Request approval for risky file operations');
console.log('• Consolidate prompts to avoid information overload');
console.log('• Manage workflow integration between different capabilities\n');

console.log('🛠️ Coordination Tools:');
console.log(`• ${SyncCodingProgressTool.name}: ${SyncCodingProgressTool.description}`);
console.log(`• ${RequestFileOpApprovalTool.name}: ${RequestFileOpApprovalTool.description}`);
console.log(`• ${ConsolidatePromptsTool.name}: ${ConsolidatePromptsTool.description}\n`);

console.log('📊 Context Information:');
console.log(`Context ID: ${CoordinationContext.id}`);
console.log(`Description: ${CoordinationContext.description}\n`);

console.log('🔄 Workflow Examples:');
console.log('');

console.log('1. Starting a coding task with auto-plan creation:');
console.log('   sync_coding_progress({');
console.log('     status: "started",');
console.log('     filePath: "src/components/UserAuth.tsx",');
console.log('     operation: "create",');
console.log('     codingTaskId: "auth_implementation"');
console.log('   })');
console.log('   → Auto-creates plan item if autoCreatePlansForCoding is enabled');
console.log('');

console.log('2. Requesting approval for risky file operation:');
console.log('   request_file_op_approval({');
console.log('     operation: "delete",');
console.log('     filePath: "src/legacy/old-auth.ts",');
console.log('     reason: "Removing deprecated authentication module",');
console.log('     riskLevel: "high"');
console.log('   })');
console.log('   → Requests user approval if requireApprovalForFileOps is enabled');
console.log('');

console.log('3. Updating plan progress after coding completion:');
console.log('   sync_coding_progress({');
console.log('     planItemId: "plan-item-123",');
console.log('     status: "completed",');
console.log('     filePath: "src/components/UserAuth.tsx",');
console.log('     operation: "create"');
console.log('   })');
console.log('   → Updates plan item status and moves to completed');
console.log('');

console.log('4. Consolidating prompts when multiple contexts are active:');
console.log('   consolidate_prompts({');
console.log('     contextIds: ["coding_gemini", "plan-context", "interactive-context"],');
console.log('     priority: "coding"');
console.log('   })');
console.log('   → Creates focused prompt prioritizing coding context');
console.log('');

console.log('⚙️ Integration Settings:');
console.log('• autoCreatePlansForCoding: Automatically create plan items for coding tasks');
console.log('• requireApprovalForFileOps: Require approval for file operations');
console.log('• syncCodingProgress: Sync coding progress with plan status');
console.log('• consolidatePrompts: Consolidate prompts from multiple contexts');
console.log('');

console.log('🎯 Best Practices:');
console.log('• Use sync_coding_progress at the start and end of coding tasks');
console.log('• Request approval for delete, execute, and high-risk operations');
console.log('• Consolidate prompts when working with multiple contexts');
console.log('• Configure integration settings based on your workflow needs');
console.log('• Monitor active workflows to avoid conflicts');
console.log('');

console.log('🔄 Typical Workflow:');
console.log('1. Agent receives coding task');
console.log('2. sync_coding_progress("started") → auto-creates plan item');
console.log('3. request_file_op_approval() for risky operations');
console.log('4. Perform coding operations');
console.log('5. sync_coding_progress("completed") → updates plan status');
console.log('6. consolidate_prompts() for next task planning');
console.log('');

console.log('✅ Coordination module is ready for seamless context integration!'); 