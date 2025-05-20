#!/usr/bin/env node

/**
 * 预安装 MCP 模块的脚本
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 定义要安装的MCP模块
const MCP_MODULES = [
  '@notionhq/notion-mcp-server',
  'firecrawl-mcp',
  'mcp-deepwiki@latest'
];

// 获取项目根目录
const rootDir = path.resolve(__dirname, '..');
console.log(`Project root: ${rootDir}`);

// 尝试加载MCP配置获取更多模块
try {
  const mcpConfigPath = path.join(rootDir, 'config', 'mcp.json');
  if (fs.existsSync(mcpConfigPath)) {
    const configData = fs.readFileSync(mcpConfigPath, 'utf8');
    const config = JSON.parse(configData);
    
    if (config.mcpServers && typeof config.mcpServers === 'object') {
      // 从配置中提取模块
      const serverConfigs = Object.values(config.mcpServers);
      const modulesFromConfig = serverConfigs
        .filter(cfg => cfg.command === 'npx' && Array.isArray(cfg.args) && cfg.args.length > 0)
        .map(cfg => {
          // 通常模块名是npx的第2个参数(移除-y标志)
          const argsWithoutFlags = cfg.args.filter(arg => !arg.startsWith('-'));
          return argsWithoutFlags[0] || null;
        })
        .filter(Boolean);
      
      // 合并到MCP_MODULES中
      modulesFromConfig.forEach(module => {
        if (!MCP_MODULES.includes(module)) {
          MCP_MODULES.push(module);
        }
      });
    }
  }
} catch (err) {
  console.error('Error parsing MCP config:', err);
}

console.log('Installing MCP modules:');
console.log(MCP_MODULES.join('\n'));

// 确保有足够的权限来执行安装
try {
  // 创建临时目录用于安装
  const tempDir = path.join(os.tmpdir(), 'mcp-install-' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });
  console.log(`Using temporary directory: ${tempDir}`);
  
  // 为每个模块执行安装
  MCP_MODULES.forEach(module => {
    try {
      console.log(`\n----- Installing ${module} -----`);
      execSync(`npm install --no-save ${module}`, { 
        cwd: tempDir,
        stdio: 'inherit'
      });
      console.log(`Successfully installed ${module}`);
    } catch (err) {
      console.error(`Failed to install ${module}:`, err.message);
    }
  });
  
  console.log('\nCleaning up temporary directory...');
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (err) {
    console.error('Error removing temp directory:', err);
  }
} catch (err) {
  console.error('Installation failed:', err);
}

console.log('\nMCP modules installation completed.'); 