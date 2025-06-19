/**
 * Simple test to verify Git options work correctly
 */

import { generateUnifiedDiff } from './runtime/diff';

async function testGitOptions() {
  console.log('Testing Git options with automatic hash calculation...\n');
  
  // Test 1: File modification
  const oldContent = 'Hello World\nThis is a test file\n';
  const newContent = 'Hello Universe\nThis is a test file\nWith new content\n';
  
  const diff1 = await generateUnifiedDiff(oldContent, newContent, {
    oldPath: 'a/test.txt',
    newPath: 'b/test.txt',
    gitOptions: {
      includeHash: true
    }
  });
  
  console.log('File modification diff:');
  console.log(diff1);
  console.log('---\n');
  
  // Test 2: File creation
  const diff2 = await generateUnifiedDiff('', newContent, {
    oldPath: '/dev/null',
    newPath: 'b/newfile.txt',
    gitOptions: {
      includeHash: true
    }
  });
  
  console.log('File creation diff:');
  console.log(diff2);
  console.log('---\n');
  
  // Test 3: File deletion
  const diff3 = await generateUnifiedDiff(oldContent, '', {
    oldPath: 'a/oldfile.txt',
    newPath: '/dev/null',
    gitOptions: {
      includeHash: true
    }
  });
  
  console.log('File deletion diff:');
  console.log(diff3);
  
  console.log('✅ All tests completed successfully!');
}

testGitOptions().catch(console.error); 