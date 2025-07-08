#!/usr/bin/env node

// 简单测试脚本，直接导入编译后的模块
import { ReactCLIClient } from './dist/ReactCLIClient.js';
import { ToolFormatterRegistry } from './dist/formatters/ToolFormatterRegistry.js';
import { FileImporterRegistry } from './dist/importers/FileImporter.js';

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
  const formatter = new ToolFormatterRegistry();
  console.log('🔧 Tool formatter created:', !!formatter);
  
  // 测试文件导入器
  const importer = new FileImporterRegistry();
  const extensions = importer.getSupportedExtensions();
  console.log('📄 Supported file extensions:', extensions.slice(0, 5), '...');
  
  console.log('✅ All basic tests passed!');
  console.log('🎉 ReactCLIClient is ready to use!');
  
} catch (error) {
  console.error('❌ Error during testing:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}