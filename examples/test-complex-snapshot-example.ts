#!/usr/bin/env node
/**
 * Complex Snapshot Testing Example
 * This script demonstrates advanced snapshot functionality with multiple file operations,
 * unified diff application, and external script execution using the new modular system
 */

import { ApplyWholeFileEditTool, ApplyUnifiedDiffTool } from '../packages/agents/contexts/coding/snapshot/snapshot-enhanced-tools';
import { BashCommandTool } from '../packages/agents/contexts/coding/toolsets/bash';
import { SnapshotManager, ListSnapshotsTool, ConsolidateSnapshotsTool } from '../packages/agents/contexts/coding/snapshot';
import { CodingAgent } from '../packages/agents';
import { LogLevel } from '../packages/core/dist/utils/logger';
import { OPENAI_MODELS } from '../packages/core/dist/models';
import path from 'path';
import fs from 'fs';

async function runComplexSnapshotTest() {
    const workspacePath = path.join(process.cwd(), 'examples/test-complex-snapshot-example');
    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
    }

    console.log(`🏠 Complex test workspace: ${workspacePath}`);

    // Initialize CodingAgent with new modular snapshot system
    const agent = new CodingAgent(
        'complex-snapshot-demo',
        'Complex Snapshot Demo Agent',
        'Advanced coding agent demonstrating complex snapshot operations with modular system',
        workspacePath,
        10, // Run more steps for complex testing
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

    // Initialize snapshot system
    console.log('\n📝 Initializing modular snapshot system...');
    try {
        const snapshotManager = new SnapshotManager(workspacePath);
        await snapshotManager.initialize();
        console.log('📝 Modular snapshot system initialized successfully');
    } catch (error) {
        console.log('📝 Snapshot system initialization error:', error);
    }

    console.log('\n=== Complex Snapshot Testing Example ===');

    // Step 1: Create data processor Python script
    console.log('\nStep 1: Creating data_processor.py...');
    
    const dataProcessorContent = `#!/usr/bin/env python3
"""
Data Processor - Complex Snapshot Testing Example
This script processes JSON data and generates CSV output.
"""

import json
import csv
import sys

def load_data(filename):
    """Load JSON data from file"""
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: File {filename} not found")
        return None
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON in {filename}")
        return None

def process_data(data):
    """Process the loaded data"""
    if not data:
        return []
    
    processed = []
    for item in data:
        if 'name' in item and 'value' in item:
            processed.append({
                'name': item['name'].upper(),
                'value': item['value'] * 2,
                'processed': True
            })
    
    return processed

def save_csv(data, filename):
    """Save processed data to CSV"""
    if not data:
        print("No data to save")
        return False
    
    try:
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=['name', 'value', 'processed'])
            writer.writeheader()
            writer.writerows(data)
        return True
    except Exception as e:
        print(f"Error saving CSV: {e}")
        return False

def main():
    input_file = 'data.json'
    output_file = 'processed_data.csv'
    
    print("Starting data processing...")
    
    # Load data
    data = load_data(input_file)
    if data is None:
        sys.exit(1)
    
    # Process data
    processed = process_data(data)
    print(f"Processed {len(processed)} items")
    
    # Save to CSV
    if save_csv(processed, output_file):
        print(f"Data saved to {output_file}")
    else:
        print("Failed to save data")
        sys.exit(1)

if __name__ == "__main__":
    main()
`;

    try {
        const result1 = await ApplyWholeFileEditTool.execute({
            path: 'data_processor.py',
            content: dataProcessorContent,
            goal: 'Create data processor script for complex snapshot testing'
        }, agent);
        
        console.log('✅ Step 1 result:', result1.message);
        if (result1.snapshotId) {
            console.log('📸 Generated snapshot ID:', result1.snapshotId);
        }
    } catch (error) {
        console.error('❌ Step 1 failed:', error);
        return;
    }

    // Step 2: Create test data JSON file
    console.log('\nStep 2: Creating data.json test file...');
    
    const testDataContent = `[
    {
        "name": "alpha",
        "value": 10,
        "category": "test"
    },
    {
        "name": "beta", 
        "value": 20,
        "category": "test"
    },
    {
        "name": "gamma",
        "value": 30,
        "category": "production"
    }
]`;

    try {
        const result2 = await ApplyWholeFileEditTool.execute({
            path: 'data.json',
            content: testDataContent,
            goal: 'Create test data JSON file for processing'
        }, agent);
        
        console.log('✅ Step 2 result:', result2.message);
        if (result2.snapshotId) {
            console.log('📸 Generated snapshot ID:', result2.snapshotId);
        }
    } catch (error) {
        console.error('❌ Step 2 failed:', error);
        return;
    }

    // Step 3: Create test runner script
    console.log('\nStep 3: Creating test_runner.py...');
    
    const testRunnerContent = `#!/usr/bin/env python3
"""
Test Runner - Complex Snapshot Testing Example
This script runs the data processor and generates reports.
"""

import subprocess
import os
import datetime

def run_data_processor():
    """Run the data processor script"""
    print("Running data processor...")
    try:
        result = subprocess.run(['python', 'data_processor.py'], 
                              capture_output=True, text=True)
        
        if result.returncode == 0:
            print("Data processor completed successfully")
            print("Output:", result.stdout)
            return True
        else:
            print("Data processor failed")
            print("Error:", result.stderr)
            return False
    except Exception as e:
        print(f"Failed to run data processor: {e}")
        return False

def generate_report():
    """Generate a test report"""
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    report_content = f"""Test Report
Generated: {timestamp}

Files created:
- data_processor.py: Data processing script
- data.json: Test input data
- processed_data.csv: Processed output data

Test Status: COMPLETED
"""
    
    try:
        with open('report.txt', 'w', encoding='utf-8') as f:
            f.write(report_content)
        print("Report generated: report.txt")
        return True
    except Exception as e:
        print(f"Failed to generate report: {e}")
        return False

def create_test_log():
    """Create a test log file"""
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    log_content = f"""{timestamp} - Test started
{timestamp} - Data processor executed
{timestamp} - Report generated
{timestamp} - Test completed successfully
"""
    
    try:
        with open('test_log.txt', 'w', encoding='utf-8') as f:
            f.write(log_content)
        print("Test log created: test_log.txt")
        return True
    except Exception as e:
        print(f"Failed to create test log: {e}")
        return False

def main():
    print("Starting complex test runner...")
    
    # Run data processor
    if not run_data_processor():
        print("Test failed at data processing stage")
        return
    
    # Generate report
    if not generate_report():
        print("Test failed at report generation stage")
        return
    
    # Create log
    if not create_test_log():
        print("Test failed at log creation stage")
        return
    
    print("All tests completed successfully!")

if __name__ == "__main__":
    main()
`;

    try {
        const result3 = await ApplyWholeFileEditTool.execute({
            path: 'test_runner.py',
            content: testRunnerContent,
            goal: 'Create test runner script for comprehensive testing'
        }, agent);
        
        console.log('✅ Step 3 result:', result3.message);
        if (result3.snapshotId) {
            console.log('📸 Generated snapshot ID:', result3.snapshotId);
        }
    } catch (error) {
        console.error('❌ Step 3 failed:', error);
        return;
    }

    // Step 4: Run the test runner (this will create multiple output files)
    console.log('\nStep 4: Running test_runner.py to generate output files...');
    console.log(`📁 Execution directory: ${workspacePath}`);
    
    try {
        const bashResult = await BashCommandTool.execute({
            command: 'python test_runner.py',
            cwd: workspacePath,
            timeout_ms: 30000,
            allow_network: false
        }, agent);
        
        if (bashResult.success) {
            console.log('✅ Successfully executed test_runner.py');
            console.log('📤 Output:', bashResult.stdout);
            if (bashResult.stderr) {
                console.log('⚠️  Error output:', bashResult.stderr);
            }
        } else {
            console.error('❌ Failed to execute test_runner.py');
            console.error('📤 Output:', bashResult.stdout);
            console.error('❌ Error:', bashResult.stderr);
            console.error('🔢 Exit code:', bashResult.exit_code);
        }
    } catch (error) {
        console.error('❌ Step 4 failed:', error);
        // Continue execution
    }

    // Step 5: Apply a unified diff to modify the data processor
    console.log('\nStep 5: Applying unified diff to enhance data_processor.py...');
    
    const enhancementDiff = `--- a/data_processor.py
+++ b/data_processor.py
@@ -39,6 +39,12 @@
     return processed
 
+def validate_data(data):
+    """Validate input data structure"""
+    if not isinstance(data, list):
+        return False
+    return all('name' in item and 'value' in item for item in data)
+
 def save_csv(data, filename):
     """Save processed data to CSV"""
     if not data:
@@ -62,6 +68,11 @@
     # Load data
     data = load_data(input_file)
     if data is None:
+        sys.exit(1)
+    
+    # Validate data
+    if not validate_data(data):
+        print("Error: Invalid data structure")
         sys.exit(1)
     
     # Process data`;

    try {
        const result4 = await ApplyUnifiedDiffTool.execute({
            diffContent: enhancementDiff,
            goal: 'Add data validation functionality to data processor',
            baseDir: workspacePath
        }, agent);
        
        console.log('✅ Step 5 result:', result4.message);
        if (result4.snapshotId) {
            console.log('📸 Generated snapshot ID:', result4.snapshotId);
        }
    } catch (error) {
        console.error('❌ Step 5 failed:', error);
        // Continue execution
    }

    // Step 6: List all snapshots created
    console.log('\nStep 6: Listing all created snapshots...');
    
    try {
        const snapshotList = await ListSnapshotsTool.execute({
            limit: 10,
            includeDiffs: false
        }, agent);
        
        if (snapshotList.success) {
            console.log(`✅ Found ${snapshotList.snapshots.length} snapshots:`);
            snapshotList.snapshots.forEach((snapshot, index) => {
                console.log(`  ${index + 1}. ${snapshot.id} - ${snapshot.description} (${snapshot.tool})`);
                console.log(`     Files: ${snapshot.affectedFiles.join(', ')}`);
                console.log(`     Time: ${snapshot.timestamp}`);
            });
        } else {
            console.log('❌ Failed to list snapshots:', snapshotList.error);
        }
    } catch (error) {
        console.error('❌ Step 6 failed:', error);
    }

    // Step 7: Test consolidation (if we have multiple snapshots)
    console.log('\nStep 7: Testing snapshot consolidation...');
    
    try {
        const snapshotList = await ListSnapshotsTool.execute({
            limit: 5,
            includeDiffs: false
        }, agent);
        
        if (snapshotList.success && snapshotList.snapshots.length >= 2) {
            const snapshotIds = snapshotList.snapshots.slice(0, 2).map(s => s.id);
            
            const consolidationResult = await ConsolidateSnapshotsTool.execute({
                snapshotIds: snapshotIds,
                title: 'Complex Test Consolidation',
                description: 'Consolidated snapshots from complex testing scenario',
                deleteOriginals: false
            }, agent);
            
            console.log('✅ Consolidation result:', consolidationResult.message);
            if (consolidationResult.success) {
                console.log('📸 Consolidated snapshot ID:', consolidationResult.consolidatedSnapshotId);
                console.log('💾 Space freed:', consolidationResult.spaceFreed, 'bytes');
            }
        } else {
            console.log('📝 Not enough snapshots for consolidation test');
        }
    } catch (error) {
        console.error('❌ Step 7 failed:', error);
    }

    console.log('\n=== Complex Test Completed ===');
    console.log('✨ This complex example demonstrated:');
    console.log('1. Creating multiple Python scripts with ApplyWholeFileEdit');
    console.log('2. Creating JSON data files for processing');
    console.log('3. Running external scripts that generate output files');
    console.log('4. Applying unified diffs to modify existing code');
    console.log('5. Listing snapshots to track operation history');
    console.log('6. Consolidating snapshots for storage optimization');
    console.log('7. Handling unknown changes from external file creation');
    console.log('8. Using the new modular SnapshotManager architecture');
    console.log('9. Testing complex workflows with multiple file operations');
    console.log('10. Demonstrating Git-format diff generation and application');
}

// Run the complex test
runComplexSnapshotTest().catch(console.error); 