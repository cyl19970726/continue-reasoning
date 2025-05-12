# HHH-AGI

HHH-AGI 是一个强大的代理系统，设计用于处理复杂的用户请求。

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 运行代理

```bash
# 使用默认日志级别（INFO）
pnpm start-agent

# 使用不同的日志级别
pnpm start-agent:debug  # 详细日志，包括提示词和调试信息
pnpm start-agent:info   # 标准信息日志（默认）
pnpm start-agent:warn   # 仅警告和错误
pnpm start-agent:error  # 仅错误
```

### 高级用法

你也可以直接指定日志级别：

```bash
# 手动设置日志级别
pnpm start-agent -- --log-level debug
```

可用的日志级别有：
- `DEBUG`: 最详细，包括所有提示词渲染和上下文信息
- `INFO`: 标准信息（默认）
- `WARN`: 只显示警告和错误
- `ERROR`: 只显示错误
- `NONE`: 禁用所有日志

## 文件结构

- `src/core`: 核心代理逻辑
  - `agent.ts`: 代理实现
  - `context.ts`: 上下文管理
  - `contexts/`: 各种上下文实现
  - `models/`: LLM模型接口
  - `utils/`: 工具函数，包括日志记录

## 日志记录

系统使用全局单例的logger实例，提供以下功能：

- 不同日志级别（DEBUG, INFO, WARN, ERROR）
- 控制台和文件日志记录
- 特殊格式化（例如提示词和对象）
- 日志文件自动轮换

日志存储在 `./logs` 目录，采用日期格式命名。

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
