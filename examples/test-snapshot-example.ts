#!/usr/bin/env node
/**
 * Snapshot Testing Example
 * This script demonstrates how to use ApplyWholeFileEdit tool to create and edit files
 * while testing the new modular SnapshotManager's diff generation and state continuity features
 */

import { ApplyWholeFileEditTool, DeleteTool } from '../packages/agents/contexts/coding/snapshot/snapshot-enhanced-tools';
import { BashCommandTool } from '../packages/agents/contexts/coding/toolsets/bash';
import { SnapshotManager } from '../packages/agents/contexts/coding/snapshot/snapshot-manager';
import { CodingAgent } from '../packages/agents';
import { LogLevel } from '../packages/core/dist/utils/logger';
import { OPENAI_MODELS } from '../packages/core/dist/models';
import path from 'path';
import fs from 'fs';
import { ListSnapshotsTool } from '../packages/agents/contexts/coding/snapshot/snapshot-manager-tools';

async function runSnapshotTest() {

    const workspacePath = path.join(process.cwd(), 'examples/test-snapshot-example');
    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
    }

    console.log(`🏠 Workspace directory: ${workspacePath}`);

    // 🆕 Use CodingAgent with new modular snapshot system
    const agent = new CodingAgent(
        'snapshot-demo',
        'Snapshot Demo Coding Agent',
        'Coding agent for demonstrating snapshot saving with modular system',
        workspacePath,
        5, // Run 5 steps to generate enough examples
        LogLevel.DEBUG,
        {
            model: OPENAI_MODELS.GPT_4O_MINI,
            enableParallelToolCalls: true,
            temperature: 0.1,
            promptProcessorOptions: {
                type: 'enhanced'
            }
        },
        [],
    );
    await agent.setup();
    
    console.log('=== Snapshot Testing Example ===');
    
    // Step 1: Use ApplyWholeFileEdit to create write.py file
    console.log('\nStep 1: Creating write.py file with text.txt creation logic...');
    
    const writeFileContent1 = `#!/usr/bin/env python3
"""
Snapshot Testing Example - Version 1
This script demonstrates file creation operations tracked by the snapshot system.
"""

def main():
    # Create and write to text.txt
    print("Creating text.txt and writing 'agi is coming'...")
    
    with open('text.txt', 'w', encoding='utf-8') as f:
        f.write('agi is coming')
    
    print("Successfully created text.txt")
    
    # Read and display the content to verify
    with open('text.txt', 'r', encoding='utf-8') as f:
        content = f.read()
        print(f"Content of text.txt: '{content}'")

if __name__ == "__main__":
    main()`;

    try {
        const result1 = await ApplyWholeFileEditTool.execute({
            path: 'write.py',
            content: writeFileContent1,
            goal: 'Create write.py script that creates text.txt with "agi is coming"'
        }, agent);
        
        console.log('✅ Step 1 result:', result1.message);
        if (result1.snapshotId) {
            console.log('📸 Generated snapshot ID:', result1.snapshotId);
        }
    } catch (error) {
        console.error('❌ Step 1 failed:', error);
        return;
    }

    // Step 2: Run write.py (this will create text.txt in the filesystem)
    console.log('\nStep 2: Running python write.py to create text.txt...');
    console.log(`📁 Execution directory: ${workspacePath}`);
    
    try {
        const bashResult1 = await BashCommandTool.execute({
            command: 'python write.py',
            cwd: workspacePath,
            timeout_ms: 30000,
            allow_network: false
        }, agent);
        
        if (bashResult1.success) {
            console.log('✅ Successfully executed python write.py');
            console.log('📤 Output:', bashResult1.stdout);
            if (bashResult1.stderr) {
                console.log('⚠️  Error output:', bashResult1.stderr);  
            }
        } else {
            console.error('❌ Failed to execute python write.py');
            console.error('📤 Output:', bashResult1.stdout);
            console.error('❌ Error:', bashResult1.stderr);
            console.error('🔢 Exit code:', bashResult1.exit_code);
        }
    } catch (error) {
        console.error('❌ Step 2 failed:', error);
        // Continue execution, don't exit
    }

    // Step 3: Update write.py to append to text.txt and create txt2.txt
    console.log('\nStep 3: Updating write.py to append to text.txt and create txt2.txt...');
    console.log('🔍 System will automatically detect files created by external script and handle unknown changes...');
    
    const writeFileContent2 = `#!/usr/bin/env python3
"""
Snapshot Testing Example - Version 2
This script demonstrates file creation operations tracked by the snapshot system.
Now appends to text.txt and creates txt2.txt files.
"""

def main():
    
    # Read and display the content to verify
    with open('text.txt', 'r', encoding='utf-8') as f:
        content = f.read()
        print(f"Content of text.txt: '{content}'")
    
    # NEW: Create and write to txt2.txt
    print("Creating txt2.txt and writing 'I want to create the best coding agent'...")
    
    with open('txt2.txt', 'w', encoding='utf-8') as f:
        f.write('I want to create the best coding agent')
    
    print("Successfully created txt2.txt")
    
    # Read and display the content to verify
    with open('txt2.txt', 'r', encoding='utf-8') as f:
        content = f.read()
        print(f"Content of txt2.txt: '{content}'")

if __name__ == "__main__":
    main()`;

    try {
        const result2 = await ApplyWholeFileEditTool.execute({
            path: 'write.py',
            content: writeFileContent2,
            goal: 'Update write.py to append to text.txt and create txt2.txt with "I want to create the best coding agent"'
        }, agent);
        
        console.log('✅ Step 3 result:', result2.message);
        if (result2.snapshotId) {
            console.log('📸 Generated snapshot ID:', result2.snapshotId);
        }
    } catch (error) {
        console.error('❌ Step 3 failed:', error);
        return;
    }

    // Step 4: Run the updated write.py again
    console.log('\nStep 4: Running updated python write.py...');
    console.log(`📁 Execution directory: ${workspacePath}`);
    
    try {
        const bashResult2 = await BashCommandTool.execute({
            command: 'python write.py',
            cwd: workspacePath,
            timeout_ms: 30000,
            allow_network: false
        }, agent);
        
        if (bashResult2.success) {
            console.log('✅ Successfully executed updated python write.py');
            console.log('📤 Output:', bashResult2.stdout);
            if (bashResult2.stderr) {
                console.log('⚠️  Error output:', bashResult2.stderr);
            }
        } else {
            console.error('❌ Failed to execute updated python write.py');
            console.error('📤 Output:', bashResult2.stdout);
            console.error('❌ Error:', bashResult2.stderr);  
            console.error('🔢 Exit code:', bashResult2.exit_code);
        }
    } catch (error) {
        console.error('❌ Step 4 failed:', error);
        // Continue execution, don't exit
    }

    // Step 5: Delete all created files using DeleteTool
    console.log('\nStep 5: Cleaning up - deleting all created files...');
    
    // Delete write.py
    try {
        const deleteWritePyResult = await DeleteTool.execute({
            path: 'write.py',
            goal: 'Clean up test files - delete write.py script'
        }, agent);
        
        if (deleteWritePyResult.success) {
            console.log('✅ Step 5a result:', deleteWritePyResult.message);
            if (deleteWritePyResult.snapshotId) {
                console.log('📸 Generated snapshot ID:', deleteWritePyResult.snapshotId);
            }
        } else {
            console.error('❌ Failed to delete write.py:', deleteWritePyResult.message);
        }
    } catch (error) {
        console.error('❌ Step 5a failed:', error);
    }

    // Delete text.txt
    try {
        const deleteTextResult = await DeleteTool.execute({
            path: 'text.txt',
            goal: 'Clean up test files - delete text.txt output file'
        }, agent);
        
        if (deleteTextResult.success) {
            console.log('✅ Step 5b result:', deleteTextResult.message);
            if (deleteTextResult.snapshotId) {
                console.log('📸 Generated snapshot ID:', deleteTextResult.snapshotId);
            }
        } else {
            console.error('❌ Failed to delete text.txt:', deleteTextResult.message);
        }
    } catch (error) {
        console.error('❌ Step 5b failed:', error);
    }

    // Delete txt2.txt
    try {
        const deleteTxt2Result = await DeleteTool.execute({
            path: 'txt2.txt',
            goal: 'Clean up test files - delete txt2.txt output file'
        }, agent);
        
        if (deleteTxt2Result.success) {
            console.log('✅ Step 5c result:', deleteTxt2Result.message);
            if (deleteTxt2Result.snapshotId) {
                console.log('📸 Generated snapshot ID:', deleteTxt2Result.snapshotId);
            }
        } else {
            console.error('❌ Failed to delete txt2.txt:', deleteTxt2Result.message);
        }
    } catch (error) {
        console.error('❌ Step 5c failed:', error);
    }

    // Show final snapshot list after cleanup
    console.log('\n📸 Final snapshot list after cleanup:');
    try {
        const finalListResult = await ListSnapshotsTool.execute({
            includeDiffs: false
        }, agent);
        
        if (finalListResult.success) {
            console.log(`✅ Total snapshots: ${finalListResult.snapshots.length}`);
            finalListResult.snapshots.forEach((snapshot, index) => {
                console.log(`  ${index + 1}. [${snapshot.sequenceNumber}] ${snapshot.id} - ${snapshot.description} (${snapshot.tool})`);
                console.log(`     Files: ${snapshot.affectedFiles.join(', ')}`);
                console.log(`     Previous: ${snapshot.previousSnapshotId || 'None'}`);
            });
        }
    } catch (error) {
        console.error('❌ Failed to list final snapshots:', error);
    }

    const listSnapshotsResult = await ListSnapshotsTool.execute({
        includeDiffs: true
    }, agent);
    console.log('📸 List of snapshots:', listSnapshotsResult.snapshots);

    console.log('\n=== Test Completed ===');
    console.log('✨ This example demonstrated:');
    console.log('1. Using ApplyWholeFileEdit to create files and generate snapshots');
    console.log('2. Using BashCommandTool to actually execute Python scripts');
    console.log('3. Handling external file changes and state continuity issues');
    console.log('4. Using ApplyWholeFileEdit to modify files and generate diff snapshots');
    console.log('5. Modular SnapshotManager tracking state continuity');
    console.log('6. Detecting unknown changes (if files are modified outside the snapshot system)');
    console.log('7. Generating Git-format diffs for version control');
    console.log('8. New modular architecture with separate core managers');
    console.log('9. Using DeleteTool to clean up files with snapshot tracking');
    console.log('10. Complete snapshot chain with proper sequenceNumber and previousSnapshotId linking');
}

// Run the test
runSnapshotTest().catch(console.error);