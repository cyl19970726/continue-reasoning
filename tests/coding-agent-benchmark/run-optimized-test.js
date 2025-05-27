#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 加载测试配置
const configPath = path.join(__dirname, 'test-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// 解析命令行参数
const args = process.argv.slice(2);

// 显示使用说明
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node run-optimized-test.js [model-profile] [test-level]

Model Profiles:
${Object.entries(config.models).map(([name, cfg]) => 
  `  ${name.padEnd(12)} - ${cfg.description}`
).join('\n')}

Test Levels:
  level1-basic-operations  - Basic file operations
  level2-code-understanding - Code analysis and refactoring  
  level3-feature-implementation - Feature development
  level4-complex-projects - Full application development

Examples:
  node run-optimized-test.js development level1-basic-operations
  node run-optimized-test.js testing level2-code-understanding
  node run-optimized-test.js budget level1-basic-operations
`);
  process.exit(0);
}

const modelProfile = args[0] || 'development';
const testLevel = args[1] || 'level1-basic-operations';

if (!config.models[modelProfile]) {
  console.error(`❌ Unknown model profile: ${modelProfile}`);
  console.log('Available profiles:', Object.keys(config.models).join(', '));
  process.exit(1);
}

const modelConfig = config.models[modelProfile];
console.log(`🚀 Running tests with ${modelProfile} profile:`);
console.log(`   Model: ${modelConfig.model}`);
console.log(`   Provider: ${modelConfig.provider}`);
console.log(`   Description: ${modelConfig.description}`);
console.log(`   Rate limit delay: ${modelConfig.rateLimitDelay}ms`);

// 设置环境变量
const env = {
  ...process.env,
  LLM_PROVIDER: modelConfig.provider,
  LLM_MODEL: modelConfig.model,
  LLM_TEMPERATURE: modelConfig.temperature.toString(),
  LLM_MAX_TOKENS: modelConfig.maxTokens.toString(),
  RATE_LIMIT_DELAY: modelConfig.rateLimitDelay.toString(),
  MAX_RETRIES: modelConfig.maxRetries.toString(),
  PROMPT_OPTIMIZATION: config.testSettings.promptOptimization,
  TEST_TIMEOUT: config.testSettings.timeoutPerTest.toString(),
  LOG_LEVEL: config.testSettings.logLevel
};

// Rate limit 处理函数
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTestWithRetry(testCommand, maxRetries = modelConfig.maxRetries) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`\n🔄 Attempt ${attempt}/${maxRetries}`);
    
    try {
      const result = await runTest(testCommand);
      if (result.success) {
        return result;
      }
      
      // 如果是 rate limit 错误，等待更长时间
      if (result.error && result.error.includes('rate limit')) {
        const delay = modelConfig.rateLimitDelay * Math.pow(2, attempt - 1);
        console.log(`⏳ Rate limit detected, waiting ${delay}ms...`);
        await sleep(delay);
      } else {
        await sleep(1000); // 其他错误等待 1 秒
      }
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) {
        throw error;
      }
      await sleep(modelConfig.rateLimitDelay);
    }
  }
}

function runTest(command) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', command.split(' ').slice(1), {
      env,
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stdout, stderr });
      } else {
        resolve({ 
          success: false, 
          error: stderr || stdout,
          code 
        });
      }
    });

    child.on('error', (error) => {
      reject(error);
    });

    // 设置超时
    setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Test timeout after ${config.testSettings.timeoutPerTest}ms`));
    }, config.testSettings.timeoutPerTest);
  });
}

async function main() {
  try {
    console.log(`\n📋 Starting ${testLevel} tests...`);
    
    // 构建测试命令
    const testCommand = `node run-agent-test.js ${testLevel}`;
    
    // 运行测试（带重试）
    const result = await runTestWithRetry(testCommand);
    
    if (result.success) {
      console.log('\n✅ Tests completed successfully!');
      
      // 生成报告
      const reportPath = path.join(__dirname, 'reports', `${modelProfile}-${testLevel}-${Date.now()}.json`);
      const report = {
        modelProfile,
        testLevel,
        timestamp: new Date().toISOString(),
        config: modelConfig,
        success: true,
        output: result.stdout
      };
      
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`📊 Report saved to: ${reportPath}`);
    } else {
      console.error('\n❌ Tests failed after all retries');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Test execution failed:', error.message);
    process.exit(1);
  }
}

main(); 