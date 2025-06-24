import { ApplyWholeFileEditTool } from '../packages/agents/contexts/coding/snapshot/snapshot-enhanced-tools';
import { SnapshotManager } from '../packages/agents/contexts/coding/snapshot/snapshot-manager';
import { ConsolidateSnapshotsTool, ListSnapshotsTool } from '../packages/agents/contexts/coding/snapshot/snapshot-manager-tools';
import { CodingAgent } from '../packages/agents';
import { LogLevel } from '../packages/core/dist/utils/logger';
import { OPENAI_MODELS } from '../packages/core/dist/models';
import path from 'path';
import fs from 'fs';

async function testConsolidationWithSequenceRange() {
    console.log('=== Testing Consolidation with Sequence Number Range ===\n');

    // Setup test environment
    const testDir = path.join(process.cwd(), 'examples/test-consolidation-sequence');
    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    
    // Create logs directory to prevent log file errors
    fs.mkdirSync(path.join(testDir, 'logs'), { recursive: true });
    
    process.chdir(testDir);

    // Create agent
    const agent = new CodingAgent(
        'test-consolidation-agent',
        'Test Consolidation Agent',
        'Agent for testing sequence range consolidation',
        testDir,
        20,
        LogLevel.INFO,
        {
            model: OPENAI_MODELS.GPT_4O_MINI,
            enableParallelToolCalls: false,
            temperature: 0.1,
        },
        []
    );

    // Setup agent
    await agent.setup();

    console.log('Step 1: Creating 5 sequential snapshots...\n');

    // Create 5 snapshots to demonstrate sequence range consolidation
    const snapshotIds: string[] = [];
    
    for (let i = 1; i <= 5; i++) {
        const result = await ApplyWholeFileEditTool.execute({
            path: `file${i}.txt`,
            content: `This is file ${i}\nContent line 1\nContent line 2\n`,
            goal: `Create file${i}.txt with basic content`
        }, agent);

        console.log(`✅ Created file${i}.txt - Snapshot: ${result.snapshotId?.substring(0, 6)}`);
        if (result.snapshotId) {
            snapshotIds.push(result.snapshotId);
        }
    }

    console.log('\nStep 2: Listing all snapshots to see sequence numbers...\n');

    const listResult = await ListSnapshotsTool.execute({ includeDiffs: false }, agent);
    console.log('📸 Current snapshots:');
    listResult.snapshots.forEach((snapshot, index) => {
        console.log(`  [${snapshot.sequenceNumber}] ${snapshot.id.substring(0, 6)} - ${snapshot.tool}: ${snapshot.description}`);
    });

    console.log('\nStep 3: Testing getSnapshotIdsBySequenceRange method...\n');

    // Test the new method directly
    const snapshotManager = new SnapshotManager(testDir);
    await snapshotManager.initialize();

    const rangeSnapshots = await snapshotManager.getSnapshotIdsBySequenceRange(2, 4);
    console.log(`🔍 Snapshots in sequence range 2-4: ${rangeSnapshots.map(id => id.substring(0, 6)).join(', ')}`);

    console.log('\nStep 4: Consolidating snapshots using sequence number range (2-4)...\n');

    const consolidationResult = await ConsolidateSnapshotsTool.execute({
        sequenceNumberRange: {
            start: 2,
            end: 4
        },
        title: 'Middle Snapshots Consolidation',
        description: 'Consolidate snapshots 2, 3, and 4 using sequence number range',
        deleteOriginals: true
    }, agent);

    console.log('🔄 Consolidation result:');
    console.log(`  Success: ${consolidationResult.success}`);
    console.log(`  Message: ${consolidationResult.message}`);
    console.log(`  Consolidated ID: ${consolidationResult.consolidatedSnapshotId?.substring(0, 6)}`);
    console.log(`  Original IDs: ${consolidationResult.originalSnapshotIds.map(id => id.substring(0, 6)).join(', ')}`);
    console.log(`  Space freed: ${consolidationResult.spaceFreed} bytes`);

    console.log('\nStep 5: Listing snapshots after consolidation...\n');

    const finalListResult = await ListSnapshotsTool.execute({ includeDiffs: false }, agent);
    console.log('📸 Final snapshots after consolidation:');
    finalListResult.snapshots.forEach((snapshot, index) => {
        console.log(`  [${snapshot.sequenceNumber}] ${snapshot.id.substring(0, 6)} - ${snapshot.tool}: ${snapshot.description}`);
    });

    console.log('\nStep 6: Testing edge cases...\n');

    // Test with invalid range
    try {
        const invalidResult = await ConsolidateSnapshotsTool.execute({
            sequenceNumberRange: {
                start: 10,
                end: 15
            },
            title: 'Invalid Range Test',
            description: 'This should fail',
            deleteOriginals: false
        }, agent);

        console.log(`❌ Invalid range test result: ${invalidResult.message}`);
    } catch (error) {
        console.log(`❌ Invalid range test failed as expected: ${error}`);
    }

    // Test providing both parameters (should fail)
    try {
        const bothParamsResult = await ConsolidateSnapshotsTool.execute({
            snapshotIds: [snapshotIds[0]],
            sequenceNumberRange: {
                start: 1,
                end: 2
            },
            title: 'Both Params Test',
            description: 'This should fail',
            deleteOriginals: false
        }, agent);

        console.log(`❌ Both parameters test result: ${bothParamsResult.message}`);
    } catch (error) {
        console.log(`❌ Both parameters test failed as expected: ${error}`);
    }

    console.log('\n=== Test Completed ===');
    console.log('✨ This example demonstrated:');
    console.log('1. Creating sequential snapshots with proper sequence numbers');
    console.log('2. Using getSnapshotIdsBySequenceRange() method for efficient lookup');
    console.log('3. Consolidating snapshots using sequenceNumberRange parameter');
    console.log('4. Maintaining sequence continuity after consolidation');
    console.log('5. Error handling for invalid ranges and parameter combinations');
    console.log('6. Bottom-level support for sequence number operations');
}

// Run the test
testConsolidationWithSequenceRange().catch(console.error); 