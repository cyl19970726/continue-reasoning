#!/usr/bin/env node

// 简单测试脚本来验证 ReactCLIClient 基本功能
import { ReactCLIClient } from './dist/index.js';

console.log('🚀 Testing ReactCLIClient basic functionality...');

try {
  // 创建配置
  const config = {
    name: 'Test Client',
    theme: 'dark',
    compactMode: false,
    enableStreaming: true,
    debug: true
  };

  // 创建客户端
  const client = new ReactCLIClient(config);
  console.log('✅ ReactCLIClient created successfully');

  // 测试基本方法
  console.log('📊 Client status:', client.getStatus());
  
  // 测试消息管理
  client.addMessage({
    id: 'test-1',
    content: 'Hello, React CLI!',
    type: 'user',
    timestamp: Date.now()
  });
  
  console.log('💬 Messages:', client.getMessages().length);
  
  // 测试工具格式化器
  const toolResult = {
    name: 'test-tool',
    call_id: 'test-123',
    status: 'succeed',
    result: 'Test output'
  };
  
  const formatted = client.formatToolResult('test-tool', toolResult);
  console.log('🔧 Tool formatter working:', !!formatted);
  
  // 测试文件导入器支持的扩展名
  const extensions = client.fileImporter.getSupportedExtensions();
  console.log('📄 Supported file extensions:', extensions.slice(0, 5), '...');
  
  console.log('✅ All basic tests passed!');
  console.log('🎉 ReactCLIClient is ready to use!');
  
} catch (error) {
  console.error('❌ Error during testing:', error.message);
  process.exit(1);
}