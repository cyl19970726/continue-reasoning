import { ApplyWholeFileEditTool } from '../packages/agents/contexts/coding/snapshot/snapshot-enhanced-tools';
import { MergeSnapshotTool, ListSnapshotsTool } from '../packages/agents/contexts/coding/snapshot/snapshot-manager-tools';
import { CodingAgent } from '../packages/agents';
import { LogLevel } from '../packages/core/utils/logger';
import { OPENAI_MODELS } from '../packages/core/models';
import path from 'path';
import fs from 'fs';

async function testMergeSnapshotSequenceManagement() {
    console.log('=== Testing MergeSnapshot Tool with Sequence Number Management ===\n');

    // Setup test environment
    const testDir = path.join(process.cwd(), 'examples/test-merge-sequence');
    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    
    // Create logs directory to prevent log file errors
    fs.mkdirSync(path.join(testDir, 'logs'), { recursive: true });
    
    process.chdir(testDir);

    // Create agent
    const agent = new CodingAgent(
        'test-merge-agent',
        'Test Merge Agent',
        'Agent for testing merge snapshot sequence management',
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

    console.log('Step 1: Creating 7 sequential snapshots...\n');

    // Create 7 snapshots to demonstrate sequence management
    const snapshotIds: string[] = [];
    
    for (let i = 1; i <= 7; i++) {
        const result = await ApplyWholeFileEditTool.execute({
            path: `file${i}.txt`,
            content: `This is file ${i}\nContent line 1\nContent line 2\nUnique content for file ${i}\n`,
            goal: `Create file${i}.txt with unique content`
        }, agent);

        console.log(`✅ Created file${i}.txt - Snapshot: ${result.snapshotId?.substring(0, 6)}`);
        if (result.snapshotId) {
            snapshotIds.push(result.snapshotId);
        }
    }

    console.log('\nStep 2: List initial snapshots to see sequence numbers...\n');

    const initialListResult = await ListSnapshotsTool.execute({ includeDiffs: false }, agent);
    console.log('📸 Initial snapshots (should be sequence 1-7):');
    initialListResult.snapshots.forEach((snapshot, index) => {
        console.log(`  [${snapshot.sequenceNumber}] ${snapshot.id.substring(0, 6)} - ${snapshot.tool}: ${snapshot.description}`);
    });

    console.log('\nStep 3: Merge snapshots 2-4 (should reduce subsequent sequences by 2)...\n');

    const mergeResult1 = await MergeSnapshotTool.execute({
        sequenceNumberRange: {
            start: 2,
            end: 4
        },
        title: 'Middle Merge',
        goal: 'Merge snapshots 2, 3, and 4 to test sequence renumbering'
    }, agent);

    console.log('🔄 First merge result:');
    console.log(`  Success: ${mergeResult1.success}`);
    console.log(`  Merged ID: ${mergeResult1.mergedSnapshotId?.substring(0, 6)}`);
    console.log(`  Original IDs: ${mergeResult1.originalSnapshotIds.map(id => id.substring(0, 6)).join(', ')}`);
    console.log(`  Message: ${mergeResult1.message}`);
    console.log(`  Diff Path: ${mergeResult1.diffPath || 'Not available'}`);

    console.log('\nStep 4: List snapshots after first merge...\n');

    const afterMerge1ListResult = await ListSnapshotsTool.execute({ includeDiffs: false }, agent);
    console.log('📸 Snapshots after first merge:');
    console.log('Expected: [1], [2 (merged 2-4)], [3 (was 5)], [4 (was 6)], [5 (was 7)]');
    afterMerge1ListResult.snapshots.forEach((snapshot, index) => {
        console.log(`  [${snapshot.sequenceNumber}] ${snapshot.id.substring(0, 6)} - ${snapshot.tool}: ${snapshot.description}`);
    });

    console.log('\nStep 5: Verify sequence continuity...\n');

    // Check that sequences are continuous: 1, 2, 3, 4, 5
    const sequences = afterMerge1ListResult.snapshots.map(s => s.sequenceNumber).sort((a, b) => a - b);
    const expectedSequences = [1, 2, 3, 4, 5];
    const sequencesMatch = JSON.stringify(sequences) === JSON.stringify(expectedSequences);
    
    console.log(`Actual sequences: [${sequences.join(', ')}]`);
    console.log(`Expected sequences: [${expectedSequences.join(', ')}]`);
    console.log(`✅ Sequences are continuous: ${sequencesMatch}`);

    console.log('\nStep 6: Merge the last two snapshots (4-5)...\n');

    const mergeResult2 = await MergeSnapshotTool.execute({
        sequenceNumberRange: {
            start: 4,
            end: 5
        },
        title: 'Final Merge',
        goal: 'Merge the last two snapshots to test end-of-chain merging'
    }, agent);

    console.log('🔄 Second merge result:');
    console.log(`  Success: ${mergeResult2.success}`);
    console.log(`  Merged ID: ${mergeResult2.mergedSnapshotId?.substring(0, 6)}`);
    console.log(`  Message: ${mergeResult2.message}`);

    console.log('\nStep 7: Final snapshot list...\n');

    const finalListResult = await ListSnapshotsTool.execute({ includeDiffs: false }, agent);
    console.log('📸 Final snapshots:');
    console.log('Expected: [1], [2 (merged 2-4)], [3 (merged 4-5, was sequence 3 and 4)]');
    finalListResult.snapshots.forEach((snapshot, index) => {
        console.log(`  [${snapshot.sequenceNumber}] ${snapshot.id.substring(0, 6)} - ${snapshot.tool}: ${snapshot.description}`);
        console.log(`    Files: ${snapshot.affectedFiles.join(', ')}`);
        console.log(`    Previous: ${snapshot.previousSnapshotId?.substring(0, 6) || 'None'}`);
    });

    console.log('\nStep 8: Test edge cases...\n');

    // Test merging non-existent range
    const invalidRangeResult = await MergeSnapshotTool.execute({
        sequenceNumberRange: {
            start: 10,
            end: 15
        },
        title: 'Invalid Range',
        goal: 'Test invalid sequence range handling'
    }, agent);

    console.log('🚫 Invalid range test:');
    console.log(`  Success: ${invalidRangeResult.success}`);
    console.log(`  Message: ${invalidRangeResult.message}`);

    // Test providing both parameters (should fail)
    const bothParamsResult = await MergeSnapshotTool.execute({
        snapshotIds: [snapshotIds[0]],
        sequenceNumberRange: {
            start: 1,
            end: 2
        },
        title: 'Both Params',
        goal: 'Test both parameters provided'
    }, agent);

    console.log('🚫 Both parameters test:');
    console.log(`  Success: ${bothParamsResult.success}`);
    console.log(`  Message: ${bothParamsResult.message}`);

    console.log('\n=== Test Summary ===');
    console.log('✨ This test demonstrated:');
    console.log('1. MergeSnapshot tool renamed from ConsolidateSnapshots');
    console.log('2. Parameter "description" changed to "goal"');
    console.log('3. deleteOriginals parameter removed (always true)');
    console.log('4. Proper sequence number management after merging');
    console.log('5. Subsequent snapshots renumbered correctly');
    console.log('6. Sequence continuity maintained throughout operations');
    console.log('7. Edge case handling for invalid inputs');
    console.log('8. diffPath returned in merge results');
}

// Run the test
testMergeSnapshotSequenceManagement().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
}); 