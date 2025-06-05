# 🔧 XML 提取工具使用指南

## 概述

XML 提取工具是一个强大的、容错的 XML 标签内容解析系统，专为 HHH-AGI 的 thinking 和 response 解析而设计。它支持嵌套标签、属性提取、CDATA 处理以及多种备选方案。

## 🚀 快速开始

### 基本使用

```typescript
import { XmlExtractor, createXmlExtractor, quickExtract } from './xml-extractor';

// 方式1: 快速提取（单例模式）
const content = quickExtract(text, 'thinking.analysis');

// 方式2: 创建实例
const extractor = createXmlExtractor();
const result = extractor.extract(text, 'response.message');

// 方式3: 完全自定义
const customExtractor = new XmlExtractor({
  caseSensitive: false,
  preserveWhitespace: true,
  fallbackToRegex: true
});
```

### 批量提取

```typescript
// 一次提取多个标签
const results = extractor.extractMultiple(text, [
  'thinking.analysis',
  'thinking.plan',
  'response.message'
]);

// 简化版批量提取
const simplified = quickExtractMultiple(text, ['analysis', 'plan', 'reasoning']);
```

## 📖 支持的标签格式

### 1. 标准嵌套标签

```xml
<thinking>
  <analysis>这是分析内容</analysis>
  <plan>这是计划内容</plan>
  <reasoning>这是推理内容</reasoning>
  <next_action>这是下一步行动</next_action>
</thinking>

<response>
  <message>这是响应消息</message>
  <action>执行某个动作</action>
  <status>完成</status>
</response>
```

### 2. 带属性的标签

```xml
<response type="success" confidence="0.95">
  <message lang="zh">操作成功完成</message>
</response>
```

### 3. CDATA 支持

```xml
<thinking>
  <analysis><![CDATA[
    这里可以包含任意内容，包括 <特殊字符> 和 "引号"
  ]]></analysis>
</thinking>
```

### 4. 自闭合标签

```xml
<status value="completed" />
<empty_section />
```

### 5. 不完整标签（容错处理）

```xml
<thinking>
  <analysis>分析内容但是没有闭合标签
```

## 🎯 提取模式详解

### 路径提取

```typescript
// 嵌套路径提取
extractor.extract(text, 'thinking.analysis');        // 提取 thinking 内的 analysis
extractor.extract(text, 'response.message');         // 提取 response 内的 message

// 直接标签提取
extractor.extract(text, 'analysis');                 // 直接提取 analysis 标签
extractor.extract(text, 'message');                  // 直接提取 message 标签
```

### 配置选项

```typescript
const extractor = new XmlExtractor({
  caseSensitive: false,        // 标签名大小写敏感
  preserveWhitespace: true,    // 保留空白字符
  allowEmptyContent: true,     // 允许空内容
  maxDepth: 10,               // 最大嵌套深度
  fallbackToRegex: true       // 启用正则表达式备选方案
});
```

## 🔄 容错机制

### 1. 多层备选方案

```typescript
// 1. 首先尝试完整 XML 解析
// 2. 启用备选方案时，尝试正则表达式
// 3. 查找替代标签名
// 4. 从纯文本中提取（如果启用）
```

### 2. 标签名变体支持

```typescript
// 系统会自动尝试这些变体：
// 'analysis' → 'analyze'
// 'plan' → 'planning'  
// 'reasoning' → 'thought'
// 'next_action' → 'next'
```

### 3. 错误恢复

```typescript
const result = extractor.extract(text, 'thinking');
if (!result.success) {
  console.log('提取失败:', result.error);
  console.log('备选内容:', result.alternativeContent);
}
```

## 📊 实际使用示例

### ResponseExtractor 集成

```typescript
import { ResponseExtractor } from './response-extractor';

const responseExtractor = new ResponseExtractor({
  enableFallback: true,        // 启用备选方案
  minResponseLength: 5,        // 最小响应长度
  extractFromPlainText: true   // 从纯文本提取
});

const parsed = responseExtractor.parseResponse(llmOutput);
if (parsed) {
  console.log('响应消息:', parsed.message);
  console.log('执行动作:', parsed.action);
}
```

### ThinkingExtractor 集成

```typescript
import { ThinkingExtractor } from './thinking-extractor';

const thinkingExtractor = new ThinkingExtractor({
  enableFallback: true,         // 启用备选方案
  allowPartialThinking: true,   // 允许部分思考内容
  minContentLength: 3          // 最小内容长度
});

const thinking = thinkingExtractor.parseThinking(llmOutput);
if (thinking) {
  console.log('分析:', thinking.analysis);
  console.log('计划:', thinking.plan);
  console.log('推理:', thinking.reasoning);
  console.log('下一步:', thinking.nextAction);
}
```

## 🛠️ 高级功能

### 完整节点解析

```typescript
const node = extractor.parseNode(text, 'response');
if (node) {
  console.log('标签名:', node.tag);
  console.log('内容:', node.content);
  console.log('属性:', node.attributes);
  console.log('子节点:', node.children);
}
```

### 提取所有同名标签

```typescript
const allMessages = extractor.extractAll(text, 'message');
allMessages.forEach((result, index) => {
  console.log(`消息 ${index + 1}:`, result.content);
});
```

### 统计信息

```typescript
const stats = extractor.getExtractionStats(text, ['thinking', 'response', 'message']);
console.log('标签统计:', stats);
```

## ⚠️ 注意事项和最佳实践

### 1. 性能优化

```typescript
// ✅ 推荐：重用实例
const extractor = createXmlExtractor();
const results = [];
for (const text of texts) {
  results.push(extractor.extract(text, 'message'));
}

// ❌ 避免：频繁创建实例
for (const text of texts) {
  const extractor = new XmlExtractor();  // 性能差
  results.push(extractor.extract(text, 'message'));
}
```

### 2. 错误处理

```typescript
// ✅ 推荐：检查提取结果
const result = extractor.extract(text, 'thinking');
if (result.success && extractor.validateResult(result, 10)) {
  // 使用提取的内容
  processContent(result.content);
} else {
  // 处理提取失败
  logger.warn('思考内容提取失败:', result.error);
}
```

### 3. 日志记录

```typescript
// 系统会自动记录详细的调试信息
// 可以通过环境变量控制日志级别：
// DEBUG_THINKING=true  - 显示详细思考信息
// LOG_LEVEL=debug      - 显示所有调试信息
```

### 4. 内容验证

```typescript
// ✅ 推荐：验证提取的内容
const thinking = thinkingExtractor.parseThinking(text);
if (thinking && thinkingExtractor.validateThinking(thinking)) {
  // 内容有效，可以使用
} else {
  // 内容无效，需要处理
  logger.warn('思考内容验证失败');
}
```

## 🐛 故障排除

### 常见问题

#### 1. 提取失败

**问题**: `result.success` 为 `false`

**解决方案**:
```typescript
// 检查输入文本
console.log('输入文本长度:', text.length);
console.log('是否包含目标标签:', text.includes('<thinking>'));

// 查看统计信息
const stats = extractor.getExtractionStats(text, ['thinking']);
console.log('提取统计:', stats);

// 启用备选方案
extractor.setOptions({ fallbackToRegex: true });
```

#### 2. 内容为空

**问题**: 提取成功但内容为空

**解决方案**:
```typescript
// 检查空白字符处理
extractor.setOptions({ 
  preserveWhitespace: true,
  allowEmptyContent: true 
});

// 降低最小长度要求
responseExtractor.setOptions({ minResponseLength: 1 });
```

#### 3. 嵌套标签问题

**问题**: 嵌套标签解析错误

**解决方案**:
```typescript
// 使用直接提取模式
const directResult = extractor.extract(text, 'analysis');  // 而不是 'thinking.analysis'

// 或者使用批量提取
const results = extractor.extractMultiple(text, ['analysis', 'plan', 'reasoning']);
```

### 调试技巧

```typescript
// 1. 启用详细日志
process.env.DEBUG_THINKING = 'true';

// 2. 查看提取结果详情
const result = extractor.extract(text, 'thinking');
console.log('提取结果:', {
  success: result.success,
  contentLength: result.content?.length,
  error: result.error,
  alternativeContent: result.alternativeContent
});

// 3. 分步调试
const thinkingResult = extractor.extract(text, 'thinking');
if (thinkingResult.success) {
  const analysisResult = extractor.extract(thinkingResult.content, 'analysis');
  console.log('分析提取结果:', analysisResult);
}
```

## 🔮 未来扩展

### 计划中的功能

1. **XML Schema 验证**: 支持自定义 XML Schema 验证
2. **命名空间支持**: 完整的 XML 命名空间处理
3. **XPath 查询**: 支持 XPath 表达式查询
4. **流式解析**: 大文件的流式 XML 解析
5. **模板系统**: XML 模板和变量替换

### 扩展示例

```typescript
// 未来可能的 API
const result = extractor.extractWithSchema(text, schema);
const nodes = extractor.queryXPath(text, '//thinking/analysis[@type="detailed"]');
const template = extractor.applyTemplate(data, templateXml);
```

---

## 📞 支持

如果遇到问题或需要帮助：

1. 查看日志输出中的详细错误信息
2. 使用 `getExtractionStats()` 获取统计信息
3. 尝试不同的配置选项组合
4. 参考本指南中的故障排除部分

**记住**: XML 提取工具设计为容错的，它会尝试多种方法来提取内容。如果一种方法失败，它会自动尝试其他方法。 