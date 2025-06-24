# 快照系统Ignore机制使用指南

## 问题背景

在使用快照系统进行代码开发时，经常会遇到以下问题：

1. **Python脚本运行时生成数据文件**（如 `news_headlines.json`）
2. **构建产物、日志文件、缓存文件**等临时文件
3. **这些文件在快照系统之外被创建/修改**，导致状态连续性检查失败

错误信息示例：
```
State continuity violation detected for file: /path/to/file
Expected file hash: 295cb0ac
Actual file hash: 20383dbf
This indicates the file was modified outside of the snapshot system.
```

## 解决方案

我们实现了类似 `.gitignore` 的 `.snapshotignore` 机制，可以配置哪些文件应该被快照系统忽略。

## 使用方法

### 1. 创建默认的 .snapshotignore 文件

```typescript
// 使用工具创建默认配置
await CreateSnapshotIgnoreTool.execute({ force: false });
```

### 2. 默认忽略规则

创建的 `.snapshotignore` 文件包含以下默认规则：

```bash
# 快照系统自身文件
.continue-reasoning/**

# 临时文件和系统文件
*.log
*.tmp
.DS_Store
Thumbs.db

# 构建产物和依赖
node_modules/**
dist/**
build/**
__pycache__/**
*.pyc
*.pyo

# IDE和编辑器文件
.vscode/**
.idea/**
*.swp
*.swo
*~

# 运行时生成的数据文件（关键！）
*.json          # 可根据需要调整为更具体的规则
*.csv
*.xlsx
*_output.*
*_result.*
*_data.*

# 缓存文件
.cache/**
*.cache

# 版本控制系统
.git/**
.svn/**
```

### 3. 自定义规则

可以根据项目需要修改 `.snapshotignore` 文件：

```bash
# 添加项目特定的ignore规则
my_project_outputs/**
*.generated
specific_file.txt

# 更精确的JSON文件规则（替代通用的 *.json）
*_output.json
*_result.json
*_data.json
news_headlines.json
```

### 4. 管理ignore规则

```typescript
// 查看当前ignore状态
const info = await GetSnapshotIgnoreInfoTool.execute({});

// 重新加载ignore规则（修改文件后）
await ReloadSnapshotIgnoreTool.execute({});
```

## 工作原理

1. **初始化时加载规则**：快照管理器启动时自动加载 `.snapshotignore` 文件
2. **文件过滤**：在计算文件哈希和状态连续性检查时，自动排除被忽略的文件
3. **glob模式匹配**：支持 `*`、`**`、`?` 等通配符模式
4. **路径标准化**：自动处理绝对路径和相对路径的转换

## 模式匹配语法

| 模式 | 说明 | 示例 |
|------|------|------|
| `*` | 匹配单个目录层级的任意字符 | `*.json` 匹配所有JSON文件 |
| `**` | 匹配任意深度的路径 | `node_modules/**` 匹配所有子目录 |
| `?` | 匹配单个字符 | `test?.py` 匹配 `test1.py` |
| `/` 结尾 | 匹配目录 | `logs/` 匹配logs目录 |
| `#` 开头 | 注释行 | `# 这是注释` |

## 最佳实践

### 1. 针对特定问题的解决方案

对于Python爬虫生成JSON文件的问题：

```bash
# 方案1：忽略所有JSON文件（简单但可能过于宽泛）
*.json

# 方案2：只忽略特定的输出文件（推荐）
news_headlines.json
*_output.json
*_result.json
*_data.json

# 方案3：忽略特定目录下的所有文件
outputs/**
results/**
```

### 2. 项目类型建议

**Python项目**：
```bash
__pycache__/**
*.pyc
*.pyo
*.json          # 或更具体的规则
*.csv
*.log
```

**Node.js项目**：
```bash
node_modules/**
dist/**
*.log
coverage/**
.nyc_output/**
```

**通用开发**：
```bash
.git/**
.vscode/**
.idea/**
*.tmp
*.log
.DS_Store
```

## 故障排除

### 1. 检查ignore状态
```typescript
const info = await GetSnapshotIgnoreInfoTool.execute({});
console.log('Ignore file exists:', info.ignoreFileExists);
console.log('Rules loaded:', info.isLoaded);
console.log('Pattern count:', info.patternCount);
```

### 2. 测试特定文件是否被忽略
通过查看 `calculateFileHashes` 的行为来验证文件是否被正确过滤。

### 3. 重新加载规则
修改 `.snapshotignore` 文件后：
```typescript
await ReloadSnapshotIgnoreTool.execute({});
```

## 注意事项

1. **性能影响**：ignore规则在文件操作时实时应用，复杂的规则可能影响性能
2. **规则顺序**：文件按出现顺序匹配，匹配到第一个规则即停止
3. **路径格式**：使用正斜杠 `/` 作为路径分隔符，在Windows上会自动转换
4. **备份重要数据**：被忽略的文件不会被快照系统跟踪，确保重要数据有其他备份机制

## 示例场景

### 解决step-prompt-saving-example.ts中的问题

原问题：Python爬虫生成 `news_headlines.json` 导致快照系统状态连续性错误。

解决步骤：
1. 在任务开始前创建 `.snapshotignore`
2. 配置忽略 `*.json` 或 `news_headlines.json`
3. 正常运行爬虫，生成的JSON文件不会影响快照系统

```typescript
// 在任务中的使用
const task = `
首先，请创建.snapshotignore文件以防止运行时生成的文件破坏快照系统的状态连续性。

然后创建Python网页爬虫项目...
`;
```

通过这个ignore机制，可以有效解决运行时生成文件破坏快照系统状态连续性的问题。 