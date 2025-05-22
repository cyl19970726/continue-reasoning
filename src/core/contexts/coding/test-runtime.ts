/**
 * Test script for the IRuntime interface implementation
 */
import { NodeJsRuntime } from './runtime/impl/node-runtime';
import { NoSandbox } from './sandbox/no-sandbox';
import * as path from 'path';

async function testNodeJsRuntime() {
  // Create a runtime with NoSandbox
  const runtime = new NodeJsRuntime(new NoSandbox());
  
  console.log(`Testing runtime of type: ${runtime.type} with sandbox type: ${runtime.sandbox.type}`);
  
  try {
    // Test directory creation
    const tempDir = path.join(__dirname, 'temp_test_dir');
    console.log(`\n[TEST] Creating directory: ${tempDir}`);
    const dirCreated = await runtime.createDirectory(tempDir, { recursive: true });
    console.log(`Directory created: ${dirCreated}`);
    
    // Test file writing
    const testFilePath = path.join(tempDir, 'test_file.txt');
    console.log(`\n[TEST] Writing to file: ${testFilePath}`);
    const content = 'Hello, Runtime!\nThis is a test file.\nCreated for testing purposes.';
    const writeSuccess = await runtime.writeFile(testFilePath, content);
    console.log(`File written: ${writeSuccess}`);
    
    // Test file reading
    console.log(`\n[TEST] Reading file: ${testFilePath}`);
    const readContent = await runtime.readFile(testFilePath);
    console.log(`File content:\n${readContent}`);
    
    // Test partial file reading
    console.log(`\n[TEST] Reading partial file (line 2): ${testFilePath}`);
    const partialContent = await runtime.readFile(testFilePath, { startLine: 2, endLine: 2 });
    console.log(`Partial content:\n${partialContent}`);
    
    // Test file status
    console.log(`\n[TEST] Getting file status: ${testFilePath}`);
    const status = await runtime.getFileStatus(testFilePath);
    console.log(`File status: ${JSON.stringify(status, null, 2)}`);
    
    // Test directory listing
    console.log(`\n[TEST] Listing directory: ${tempDir}`);
    const entries = await runtime.listDirectory(tempDir);
    console.log(`Directory entries:\n${JSON.stringify(entries, null, 2)}`);
    
    // Test file modification
    console.log(`\n[TEST] Modifying file: ${testFilePath}`);
    const appendContent = '\nThis line was appended.';
    const appendSuccess = await runtime.writeFile(testFilePath, appendContent, { mode: 'append' });
    console.log(`File appended: ${appendSuccess}`);
    
    // Read the modified file
    console.log(`\n[TEST] Reading modified file: ${testFilePath}`);
    const modifiedContent = await runtime.readFile(testFilePath);
    console.log(`Modified content:\n${modifiedContent}`);
    
    // Test diff generation
    console.log(`\n[TEST] Generating diff`);
    const diff = await runtime.generateDiff(content, modifiedContent, {
      oldPath: 'a/test_file.txt',
      newPath: 'b/test_file.txt'
    });
    console.log(`Diff:\n${diff}`);
    
    // Test direct command execution
    console.log(`\n[TEST] Executing command`);
    const result = await runtime.execute(`ls -la "${tempDir}"`);
    console.log(`Command result:\n${result.stdout}`);
    
    // Test file deletion
    console.log(`\n[TEST] Deleting file: ${testFilePath}`);
    const deleteSuccess = await runtime.deleteFile(testFilePath);
    console.log(`File deleted: ${deleteSuccess}`);
    
    // Test directory cleanup
    console.log(`\n[TEST] Deleting directory: ${tempDir}`);
    const rmResult = await runtime.execute(`rm -rf "${tempDir}"`);
    console.log(`Directory deleted: ${rmResult.exitCode === 0}`);
    
    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testNodeJsRuntime().catch(error => {
  console.error('Test script failed:', error);
}); 