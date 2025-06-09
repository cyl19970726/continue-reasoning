下面是我们在 `jsonToZodStrict` / `zodToJsonStrict` 这部分工作中的最佳实践总结，以及一个经过优化的端到端工作流和示例 Prompt，帮助你在下次与 AI 协作时更高效地推进。

---

## 一、优化后的工作流

1. **需求与文档收集**  
   - 提供核心文档（函数注释、JSON Schema 规范、已有示例）。  
   - 明确约束：哪些字段必需、哪些可空、如何对额外字段或类型不匹配报错。

2. **规范定义**  
   - 用简洁的列表或表格列出每个函数的 “输入 → 输出” 模式。  
   - 附上典型示例：给几组合法/非法输入，以及预期的 Zod 验证或 JSON 输出。

3. **测试设计**  
   - 在 VSCode/项目中创建测试文件，先写若干单元测试（Vitest/Jest）。  
   - 包括：  
     - 基本类型转换  
     - 联合类型（带 null）  
     - 嵌套对象（必需 vs 可空）  
     - 错误情况下抛异常或报错信息  

4. **分步实现**  
   - 让 AI 先根据“规范定义”输出伪代码/骨架。  
   - 然后逐步落实现有测试所需的功能。  
   - 每次跑测试，针对失败用例再让 AI 修复，直到全绿。

5. **复盘与总结**  
   - 测试通过后，让 AI 总结关键变更点。  
   - 将文档、注释、示例补充完整，形成可复用的规范模板。

---

## 二、示例 Prompt

```markdown
# 目标
在 `jsonHelper.ts` 中实现两个函数：
1. `jsonToZodStrict(schema: StrictJsonSchema): ZodType`  
2. `zodToJsonStrict(schema: ZodType): StrictJsonSchema`

**最终目标**：它们要互为逆运算，且符合“OpenAI 严格模式”规则：
- 所有字段必须在 `required` 中声明
- 可空字段必须用 `type: ['X','null']` 表示
- 对象必须 `.strict()`，禁止额外属性

---

## 1. 函数规格

### jsonToZodStrict
- 输入：  
  ```ts
  interface StrictJsonSchema {
    type: string | string[];
    properties?: Record<string, StrictJsonSchema>;
    required?: string[];
    enum?: string[];
    items?: StrictJsonSchema;
    description?: string;
    additionalProperties?: boolean;
  }
  ```
- 输出：一个 `z.ZodType`，其验证行为符合上面规则。

### zodToJsonStrict
- 输入：一个 `z.ZodType`（假定为 `.strict()` 的对象）
- 输出：对应的 `StrictJsonSchema`，且：
  - `.optional()` → `type: ['X','null']`
  - 不可选 → 单一 `type: 'X'`
  - 对象 → `properties` + `required` + `additionalProperties: false`

---

## 2. 示例输入/输出

### 示例 1：基本对象
```jsonc
// 输入 JSON Schema
{
  type: "object",
  properties: {
    name: { type: "string" },
    age:  { type: ["number","null"] }
  },
  required: ["name","age"],
  additionalProperties: false
}

// 期望 Zod
z
 .object({
   name: z.string(),               // 不可空
   age:  z.number().nullable()     // 可空
 })
 .strict()
```

### 示例 2：反向转换
```ts
const z = z.object({
  name: z.string().describe("用户名"),
  tags: z.array(z.string()).optional()
}).strict();

const json = zodToJsonStrict(z);
/*
{
  type: "object",
  description: " ...",
  properties: {
    name: { type: "string", description: "用户名" },
    tags: { type: ["array","null"], items: { type: "string" } }
  },
  required: ["name","tags"],
  additionalProperties: false
}
*/
```

---

## 3. 先写测试

在 `jsonHelper.test.ts` 中：
```ts
describe('jsonToZodStrict', () => {
  it('should reject null for non-nullable', () => {
    const s = {
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['a']
    };
    const schema = jsonToZodStrict(s);
    expect(schema.safeParse({ a: null }).success).toBe(false);
    expect(schema.safeParse({ a: 'foo' }).success).toBe(true);
  });

  it('should accept null for nullable', () => {
    const s = {
      type: 'object',
      properties: { b: { type: ['number','null'] } },
      required: ['b']
    };
    const schema = jsonToZodStrict(s);
    expect(schema.safeParse({ b: null }).success).toBe(true);
    expect(schema.safeParse({ b: 1 }).success).toBe(true);
  });

  // ...更多用例...
});
```

---

## 4. 实现与迭代

1. 让 AI 根据“函数规格”写出骨架（`processSchema`、`superRefine` 等）。  
2. 运行测试，针对失败用例逐步调整。  
3. 重复直到测试全部通过。

---

## 三、提升 Prompt 效率的建议

1. **结构化提问**  
   - 用小标题（`# 目标`、`## 规格`、`### 示例`、`#### 测试用例`）分块，让 AI 快速定位关键信息。  

2. **先测后写**  
   - 为每个新功能先写测试，再要求 AI 实现，确保需求精确且可验证。  

3. **示例驱动**  
   - 提供典型的输入/输出对，AI 按照示例生成代码，减少歧义。  

4. **增量反馈**  
   - 每次仅修改最小可测试单元（比如只修一个函数或一个测试组），方便回溯与定位错位。  

5. **明确错误信息**  
   - 如果某个测试失败，截图或粘贴错误输出，让 AI 知道“哪里不对”，而不是泛泛说“出问题了”。  

6. **限制范围**  
   - 当功能复杂时，先拆成多个子任务。比如先实现 enum/基础类型，再做联合 null，再处理嵌套对象。  

按照这个流程，你可以获得快速、可迭代、可验证的 AI 协同开发体验。希望对你有帮助！
