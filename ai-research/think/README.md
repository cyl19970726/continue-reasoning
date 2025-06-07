# AI 研究：思考（Think Tool vs <think> 标签）示例

本示例演示两种 LLM 思考设计方法：
1. **Think Tool**：使用工具调用（function-call）捕获结构化思考。
2. **<think> 标签**：通过 system prompt 强制模型在 `<think>...</think>` 中输出思考内容。

同时提供一个思考 + 工具调用的调度循环模板，演示如何在循环中处理思考和工具调用。

## 先决条件

- 安装依赖：`pnpm install` 或 `npm install`
- 设置环境变量：`OPENAI_API_KEY`

## 运行示例

```bash
npx ts-node ai-research/think/index.ts
```