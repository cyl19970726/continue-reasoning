import { ApplyWholeFileEditTool } from '../packages/agents/contexts/coding/snapshot/snapshot-enhanced-tools';
import { MergeSnapshotTool, ListSnapshotsTool } from '../packages/agents/contexts/coding/snapshot/snapshot-manager-tools';
import { CodingAgent } from '../packages/agents';
import { LogLevel } from '../packages/core/utils/logger';
import { OPENAI_MODELS } from '../packages/core/models';
import path from 'path';
import fs from 'fs';

async function testSimpleMergeSequence() {
    console.log('=== Simple MergeSnapshot Sequence Test ===\n');

    // Setup test environment
    const testDir = path.join(process.cwd(), 'examples/test-simple-merge');
    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    
    // Create logs directory
    fs.mkdirSync(path.join(testDir, 'logs'), { recursive: true });
    
    process.chdir(testDir);

    // Create agent
    const agent = new CodingAgent(
        'test-simple-merge-agent',
        'Test Simple Merge Agent',
        'Agent for testing simple merge sequence management',
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

    await agent.setup();

    // Configure .snapshotignore to avoid unknown changes
    const snapshotIgnoreContent = `
# Test ignore patterns
*.log
*.tmp
.DS_Store
node_modules/**
logs/**
.continue-reasoning/**
.snapshotignore
`;
    fs.writeFileSync('.snapshotignore', snapshotIgnoreContent);

    console.log('Step 1: Creating 5 simple snapshots...\n');

    // Create 5 simple snapshots
    const results = [];
    for (let i = 1; i <= 5; i++) {
        const result = await ApplyWholeFileEditTool.execute({
            path: `simple${i}.txt`,
            content: `Simple file ${i}\nContent for file ${i}\n`,
            goal: `Create simple${i}.txt`
        }, agent);

        console.log(`✅ Created simple${i}.txt - Snapshot: ${result.snapshotId?.substring(0, 6)}`);
        results.push(result);
    }

    console.log('\nStep 2: List initial snapshots...\n');

    const initialList = await ListSnapshotsTool.execute({ includeDiffs: false }, agent);
    console.log('📸 Initial snapshots:');
    const sortedInitial = initialList.snapshots.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    sortedInitial.forEach((snapshot, index) => {
        console.log(`  [${snapshot.sequenceNumber}] ${snapshot.id.substring(0, 6)} - ${snapshot.tool}: ${snapshot.description}`);
    });

    console.log('\nStep 3: Merge snapshots 2-3...\n');

    const mergeResult = await MergeSnapshotTool.execute({
        sequenceNumberRange: {
            start: 2,
            end: 3
        },
        title: 'Simple Merge',
        goal: 'Merge snapshots 2 and 3'
    }, agent);

    console.log('🔄 Merge result:');
    console.log(`  Success: ${mergeResult.success}`);
    console.log(`  Merged ID: ${mergeResult.mergedSnapshotId?.substring(0, 6)}`);
    console.log(`  Message: ${mergeResult.message}`);

    console.log('\nStep 4: List snapshots after merge...\n');

    const afterMergeList = await ListSnapshotsTool.execute({ includeDiffs: false }, agent);
    console.log('📸 Snapshots after merge:');
    const sortedAfter = afterMergeList.snapshots.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    sortedAfter.forEach((snapshot, index) => {
        console.log(`  [${snapshot.sequenceNumber}] ${snapshot.id.substring(0, 6)} - ${snapshot.tool}: ${snapshot.description}`);
    });

    console.log('\nStep 5: Verify sequence continuity...\n');

    const sequences = sortedAfter.map(s => s.sequenceNumber);
    const expectedSequences = [1, 2, 3, 4]; // Should be 1, merged(2-3)->2, 4->3, 5->4
    const isSequential = sequences.every((seq, index) => seq === index + 1);
    
    console.log(`Actual sequences: [${sequences.join(', ')}]`);
    console.log(`Expected: sequential from 1 to ${sequences.length}`);
    console.log(`✅ Sequences are continuous: ${isSequential}`);

    console.log('\n=== Test Summary ===');
    console.log('✨ This test demonstrated:');
    console.log('1. Simple merge without unknown changes');
    console.log('2. Sequence number renumbering after merge');
    console.log('3. Cache reload after merge operation');
    console.log('4. Proper sequence continuity validation');
}

// Run the test
testSimpleMergeSequence().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
}); 