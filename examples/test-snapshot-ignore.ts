import { LogLevel, globalEventBus, OPENAI_MODELS } from '../packages/core';
import { CodingAgent } from '../packages/agents';
import { ApplyWholeFileEditTool } from '../packages/agents/contexts/coding/snapshot/snapshot-enhanced-tools';
import { SnapshotManager } from '../packages/agents/contexts/coding/snapshot/snapshot-manager';
import path from 'path';
import fs from 'fs';

async function testSnapshotIgnore() {
    console.log('🧪 Testing Snapshot Ignore Functionality with New Modular System\n');

    await globalEventBus.start();
    
    const workspacePath = path.join(process.cwd(), 'test-snapshot-ignore');
    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
    }

    const agent = new CodingAgent(
        'test-ignore',
        'Test Snapshot Ignore Agent',
        'Testing snapshot ignore functionality with modular system',
        workspacePath,
        5, // Run 5 steps for testing
        LogLevel.DEBUG,
        {
            model: OPENAI_MODELS.GPT_4O_MINI,
            enableParallelToolCalls: true,
            temperature: 0.1,
        },
        [],
    );

    await agent.setup();
    agent.setEnableToolCallsForStep((stepIndex) => stepIndex > 0);

    try {
        console.log('🚀 Starting snapshot ignore test with modular system...\n');

        // Step 1: Initialize snapshot system (creates default .snapshotignore)
        console.log('📝 Step 1: Initializing snapshot system...');
        const snapshotManager = new SnapshotManager(workspacePath);
        await snapshotManager.initialize();
        
        const ignoreInfo = snapshotManager.getIgnoreInfo();
        console.log(`✅ Snapshot system initialized with ${ignoreInfo.patterns.length} ignore patterns`);
        console.log('📋 Current ignore patterns:', ignoreInfo.patterns);

        // Step 2: Create a test Python file (should be tracked)
        console.log('\n📝 Step 2: Creating test.py (should be tracked)...');
        const testPyContent = `#!/usr/bin/env python3
"""
Test Python file for snapshot ignore testing
This file should be tracked by the snapshot system.
"""

def main():
    print("This is a test Python file")
    print("It should be tracked by snapshots")

if __name__ == "__main__":
    main()
`;

        const result1 = await ApplyWholeFileEditTool.execute({
            path: 'test.py',
            content: testPyContent,
            goal: 'Create test Python file that should be tracked by snapshots'
        }, agent);

        console.log('✅ test.py creation result:', result1.message);
        if (result1.snapshotId) {
            console.log('📸 Snapshot created:', result1.snapshotId);
        }

        // Step 3: Create a JSON file (typically ignored by default rules)
        console.log('\n📝 Step 3: Creating data.json (may be ignored by default rules)...');
        const jsonContent = `{
    "name": "test-data",
    "version": "1.0.0",
    "description": "Test JSON file that may be ignored",
    "data": [
        {"id": 1, "value": "test1"},
        {"id": 2, "value": "test2"}
    ]
}`;

        const result2 = await ApplyWholeFileEditTool.execute({
            path: 'data.json',
            content: jsonContent,
            goal: 'Create JSON file to test ignore functionality'
        }, agent);

        console.log('✅ data.json creation result:', result2.message);
        if (result2.snapshotId) {
            console.log('📸 Snapshot created:', result2.snapshotId);
        }

        // Step 4: Test file filtering
        console.log('\n🔍 Step 4: Testing file filtering...');
        const testFiles = ['test.py', 'data.json', 'node_modules/package.json', '.git/config', 'test.log'];
        const filteredFiles = snapshotManager.filterIgnoredFiles(testFiles);
        
        console.log('📋 Test files:', testFiles);
        console.log('✅ Files that would be tracked:', filteredFiles);
        console.log('❌ Files that would be ignored:', testFiles.filter(f => !filteredFiles.includes(f)));

        // Step 5: Create a log file (should be ignored)
        console.log('\n📝 Step 5: Creating test.log (should be ignored)...');
        const logContent = `2024-01-01 10:00:00 - Test log entry
2024-01-01 10:01:00 - Another log entry
2024-01-01 10:02:00 - This file should be ignored by snapshots
`;

        const result3 = await ApplyWholeFileEditTool.execute({
            path: 'test.log',
            content: logContent,
            goal: 'Create log file that should be ignored by snapshot system'
        }, agent);

        console.log('✅ test.log creation result:', result3.message);
        if (result3.snapshotId) {
            console.log('📸 Snapshot created:', result3.snapshotId);
        } else {
            console.log('📝 No snapshot created (file may have been ignored)');
        }

        // Step 6: Show final ignore status
        console.log('\n📊 Step 6: Final ignore system status...');
        const finalIgnoreInfo = snapshotManager.getIgnoreInfo();
        console.log(`📋 Total ignore patterns: ${finalIgnoreInfo.patterns.length}`);
        console.log('📋 Ignore patterns:', finalIgnoreInfo.patterns);

        console.log('\n✅ Test completed! Check workspace for results.\n');
        console.log('🎯 This test demonstrated:');
        console.log('1. Automatic .snapshotignore creation during initialization');
        console.log('2. File filtering based on ignore patterns');
        console.log('3. Snapshot creation for tracked files');
        console.log('4. Ignoring of files matching ignore patterns');
        console.log('5. New modular IgnoreManager functionality');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await globalEventBus.stop();
    }
}

if (require.main === module) {
    testSnapshotIgnore().catch(console.error);
}

export { testSnapshotIgnore }; 