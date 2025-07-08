# Continue-Reasoning 包管理标准化迁移方案

## 🎯 目标

基于 Gemini CLI 的最佳实践，将 Continue-Reasoning 项目迁移到现代化、统一的包管理系统。

## 📊 当前问题分析

### 严重问题
1. **ESM/CommonJS 混用**: 不同包使用不同模块系统，导致兼容性问题
2. **依赖管理混乱**: 根目录包含过多应该在子包中的依赖
3. **构建配置不一致**: 不同包使用不同的构建方式和输出目录
4. **包名不一致**: 根包名 `hhh-agi` 与项目名 `continue-reasoning` 不符

### 具体表现
- `packages/core`: CommonJS 模块，导出指向源文件
- `packages/agents`: package.json 声明 ESM，tsconfig.json 配置 CommonJS
- `packages/react-cli`: 现代 ESM 配置（唯一正确的）
- 版本不同步，依赖重复定义

## 🚀 解决方案

### 阶段一：统一模块系统 (高优先级)

#### 1.1 更新所有包为 ESM
```json
// 所有 packages/*/package.json
{
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

#### 1.2 统一 TypeScript 配置
```json
// 标准 tsconfig.json 模板
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext", 
    "moduleResolution": "nodenext",
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  }
}
```

#### 1.3 修复导入语句
- 所有相对导入添加 `.js` 扩展名
- 更新所有 `require()` 为 `import`
- 更新 `module.exports` 为 `export`

### 阶段二：重构包依赖关系

#### 2.1 清理根目录依赖
```json
// 根目录 package.json 只保留开发依赖
{
  "name": "@continue-reasoning/workspace",
  "private": true,
  "type": "module",
  "devDependencies": {
    "typescript": "^5.3.3",
    "@types/node": "^20.0.0",
    "vitest": "^3.1.1",
    "eslint": "^9.0.0"
  },
  "scripts": {
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "lint": "pnpm -r run lint",
    "clean": "pnpm -r run clean"
  }
}
```

#### 2.2 标准化包结构
```
packages/
├── core/                   # @continue-reasoning/core
│   ├── package.json       # 核心功能，ESM
│   ├── tsconfig.json
│   └── src/
├── agents/                 # @continue-reasoning/agents  
│   ├── package.json       # 代理功能，依赖 core
│   ├── tsconfig.json
│   └── src/
├── react-cli/             # @continue-reasoning/react-cli
│   ├── package.json       # CLI 客户端，依赖 core
│   ├── tsconfig.json
│   └── src/
└── ai-research/           # @continue-reasoning/ai-research
    ├── package.json       # 研究组件，可选依赖
    ├── tsconfig.json
    └── src/
```

#### 2.3 工作空间依赖管理
```json
// packages/agents/package.json
{
  "dependencies": {
    "@continue-reasoning/core": "workspace:*"
  }
}

// packages/react-cli/package.json  
{
  "dependencies": {
    "@continue-reasoning/core": "workspace:*"
  }
}
```

### 阶段三：标准化构建流程

#### 3.1 统一构建脚本
```json
// 每个包的标准 scripts
{
  "scripts": {
    "build": "tsc --build",
    "dev": "tsc --build --watch", 
    "clean": "rm -rf dist",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  }
}
```

#### 3.2 TypeScript 项目引用
```json
// 根目录 tsconfig.json
{
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/agents" }, 
    { "path": "./packages/react-cli" },
    { "path": "./packages/ai-research" }
  ]
}

// packages/agents/tsconfig.json
{
  "references": [
    { "path": "../core" }
  ]
}
```

### 阶段四：工具链整合

#### 4.1 ESLint 配置
```javascript
// eslint.config.js
export default [
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    rules: {
      // 防止跨包相对导入
      'no-restricted-imports': [
        'error',
        {
          patterns: ['../*/src/*']
        }
      ]
    }
  }
];
```

#### 4.2 Vitest 配置
```javascript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'node',
    globals: true
  },
  resolve: {
    alias: {
      '@continue-reasoning/core': './packages/core/src',
      '@continue-reasoning/agents': './packages/agents/src'
    }
  }
});
```

## 📋 实施计划

### 第1步：修复核心包 (packages/core)
1. 添加 `"type": "module"` 到 package.json
2. 更新 tsconfig.json 为 NodeNext 配置
3. 修复所有导出路径
4. 更新导入语句添加 .js 扩展名

### 第2步：修复 agents 包
1. 统一 package.json 和 tsconfig.json 的模块配置
2. 添加对 react-cli 的依赖
3. 修复所有导入语句

### 第3步：清理依赖关系
1. 移动根目录的业务依赖到对应包
2. 更新所有 workspace 依赖使用 `workspace:*`
3. 统一依赖版本

### 第4步：验证和测试
1. 确保所有包都能正确构建
2. 验证包间依赖正常工作
3. 运行所有测试确保功能正常

## 🔧 具体修复命令

```bash
# 1. 清理构建产物
pnpm -r run clean

# 2. 重新安装依赖
rm -rf node_modules packages/*/node_modules
pnpm install

# 3. 重新构建所有包
pnpm -r run build

# 4. 运行测试验证
pnpm -r run test
```

## 📈 预期收益

1. **兼容性问题解决**: 统一 ESM 模块系统，消除混用问题
2. **开发体验提升**: 统一的构建流程和工具配置
3. **维护性增强**: 清晰的依赖关系和包职责
4. **构建性能优化**: TypeScript 项目引用支持增量构建
5. **代码质量保证**: 统一的 lint 和测试配置

## ⚠️ 风险评估

1. **破坏性变更**: 需要更新所有导入语句
2. **测试覆盖**: 确保所有功能在迁移后正常工作
3. **向后兼容**: 可能需要更新使用方的代码

## 🎉 成功标准

- [ ] 所有包使用统一的 ESM 模块系统
- [ ] `pnpm run build` 成功构建所有包
- [ ] 所有测试通过
- [ ] agents 包可以正常启动并使用 react-cli
- [ ] 依赖关系清晰，无循环依赖
- [ ] 类型检查无错误