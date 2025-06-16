// 简单的测试文件来验证 contexts 编译
console.log('🧪 Testing contexts compilation...');

try {
  // 测试单个 context 文件
  const webSearch = require('./dist/contexts/web-search.js');
  console.log('✅ web-search.js loaded successfully');
  
  const plan = require('./dist/contexts/plan.js');
  console.log('✅ plan.js loaded successfully');
  
  const mcp = require('./dist/contexts/mcp.js');
  console.log('✅ mcp.js loaded successfully');
  
  const helper = require('./dist/contexts/helper.js');
  console.log('✅ helper.js loaded successfully');
  
  console.log('🎉 All context files compiled and loaded successfully!');
  
} catch (error) {
  console.error('❌ Error loading contexts:', error.message);
  process.exit(1);
} 