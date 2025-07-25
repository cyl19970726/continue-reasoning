# Codex CLI Singlepass 设计报告

本报告总结了 Codex CLI 中 singlepass（全量/一次性批量编辑）机制的设计思想、核心流程、模块分工，以及如何在自定义 Agent 中实现类似机制的建议。

---

## 1. 设计思想与适用场景

**Singlepass** 模式旨在让 Agent 一次性获取项目的全局上下文，并直接生成所有目标文件的最终内容。适用于：
- 需要大范围重构、跨文件协同修改的场景
- 希望 LLM 能基于全局视角做出一致性更强的修改
- 需要提升多文件编辑效率、减少多轮交互的场合

与传统的增量式 patch（如 apply_patch）不同，singlepass 更像是"全量覆盖"——Agent 直接输出每个目标文件的最终状态。

---

## 2. 核心流程

1. **上下文收集**
    - 由 `context_files.ts`、`context.ts`、`context_limit.ts` 协作完成。
    - 收集项目中所有（或部分）文件内容，拼接成 LLM 可消费的 prompt。
    - 根据 token 限制做裁剪，优先保留最相关内容。

2. **Agent 生成目标内容**
    - Agent 直接输出每个目标文件的"最终内容"，而不是 diff/patch。
    - 输出格式通常为：
      ```
      --- foo.py ---
      <新内容A>
      --- bar.py ---
      <新内容B>
      ```

3. **diff 计算与展示**
    - 由 `code_diff.ts` 负责。
    - 读取磁盘原文件，与 Agent 生成的新内容对比，生成 diff（可用于展示、确认、回滚等）。

4. **应用变更到文件系统**
    - 由 `file_ops.ts` 负责。
    - 直接用 Agent 生成的新内容覆盖写入目标文件（或新建/删除文件）。

---

## 3. 核心模块功能与协作

### 3.1 context_files.ts
- 负责批量读取项目文件内容，支持路径过滤、内容截断、文件优先级排序等。
- 输出适合 LLM 输入的上下文片段。

### 3.2 context.ts
- 定义上下文对象结构，整合文件内容、用户 prompt、其他辅助信息。
- 可能包含上下文序列化/格式化逻辑。

### 3.3 context_limit.ts
- 计算上下文 token/字符数，防止超出 LLM 限制。
- 实现智能截断、优先级裁剪等策略。

### 3.4 code_diff.ts
- 计算原始文件与新内容的差异（diff），支持多种 diff 格式。
- 可用于变更预览、回滚、变更统计等。

### 3.5 file_ops.ts
- 封装底层文件操作（写入、删除、批量处理等）。
- 直接用新内容覆盖写入目标文件。

---

## 4. 与 apply_patch 机制的对比

| 机制         | 变更粒度 | 适用场景           | 文件写入方式         |
|--------------|----------|--------------------|----------------------|
| apply_patch  | 增量式   | 小范围、精确修改   | 只改动 patch 涉及行  |
| singlepass   | 全量式   | 大范围、全局重构   | 直接覆盖写入新内容   |

- apply_patch 适合逐步、交互式修改，便于回滚和精细控制。
- singlepass 适合一次性大改、跨文件一致性需求高的场景。

---

## 5. 在自定义 Agent 中实现 singlepass 的建议

1. **上下文收集**：实现批量读取项目文件、拼接上下文、智能裁剪（可参考 context_files.ts、context_limit.ts）。
2. **Agent 输出格式**：约定 Agent 直接输出每个目标文件的完整内容，并用特殊分隔符区分（如 `--- file.py ---`）。
3. **diff 计算**：实现原内容与新内容的对比，生成 diff 供用户预览或回滚（可参考 code_diff.ts）。
4. **文件写入**：用新内容直接覆盖写入目标文件，注意备份和异常处理（可参考 file_ops.ts）。
5. **安全性与回滚**：建议在写入前自动备份原文件，或结合 git 进行变更管理。
6. **用户交互**：可在应用前展示 diff，让用户确认。

---

通过上述设计，您可以在自定义 Agent 中实现类似 Codex CLI 的 singlepass 批量编辑能力，提升多文件协同修改的效率和一致性。 