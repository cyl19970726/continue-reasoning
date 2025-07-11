import { WaitingTool } from '@continue-reasoning/core';
import { logger } from '@continue-reasoning/core';

async function testWaitingTool() {
  console.log('🧪 Testing WaitingTool...');
  
  const startTime = Date.now();
  
  // Test waiting for 3 seconds
  const result = await WaitingTool.execute({
    seconds: 3,
    reason: "Testing WaitingTool functionality"
  });
  
  const endTime = Date.now();
  const actualDuration = Math.round((endTime - startTime) / 1000);
  
  console.log('📊 Test Results:');
  console.log(`   ⏱️  Expected wait: 3 seconds`);
  console.log(`   ⏱️  Actual wait: ${actualDuration} seconds`);
  console.log(`   ✅ Success: ${result.success}`);
  console.log(`   📝 Message: ${result.message}`);
  console.log(`   🔢 Waited seconds: ${result.waited_seconds}`);
  
  if (result.success && Math.abs(actualDuration - 3) <= 1) {
    console.log('🎉 WaitingTool test PASSED!');
  } else {
    console.log('❌ WaitingTool test FAILED!');
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testWaitingTool().catch(console.error);
} 