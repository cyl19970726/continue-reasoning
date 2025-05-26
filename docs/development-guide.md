# HHH-AGI Development Guide

## Tool Parameter Schema Limitations

### Overview

HHH-AGI uses a custom JSON Schema ↔ Zod conversion system in `src/core/utils/jsonHelper.ts` to handle tool parameter validation. However, this system has important limitations regarding Zod constraints that developers must be aware of.

### Supported Zod Features

Our `jsonHelper.ts` currently supports:

✅ **Basic Types**
- `z.string()`
- `z.number()`
- `z.boolean()`
- `z.date()` (converted to `string` with `format: "date-time"`)

✅ **Complex Types**
- `z.object()` with nested properties
- `z.array()` with typed items
- `z.enum()` and native enums
- `z.optional()` and `z.nullable()`

✅ **Descriptions**
- `z.string().describe("description")` → `{ type: "string", description: "description" }`

### Unsupported Zod Constraints

❌ **Numeric Constraints**
```typescript
// These constraints are LOST during conversion
z.number().min(0)           // minimum value
z.number().max(100)         // maximum value
z.number().int()            // integer validation
z.number().positive()       // positive numbers only
z.number().nonnegative()    // non-negative numbers
```

❌ **String Constraints**
```typescript
// These constraints are LOST during conversion
z.string().min(1)           // minimum length
z.string().max(255)         // maximum length
z.string().length(10)       // exact length
z.string().regex(/^[A-Z]+$/) // pattern validation
z.string().email()          // email format
z.string().url()            // URL format
z.string().uuid()           // UUID format
```

❌ **Array Constraints**
```typescript
// These constraints are LOST during conversion
z.array(z.string()).min(1)  // minimum items
z.array(z.string()).max(10) // maximum items
z.array(z.string()).length(5) // exact length
z.array(z.string()).nonempty() // non-empty arrays
```

❌ **Default Values**
```typescript
// Default values are LOST during conversion and cause schema errors
z.string().default("hello")
z.number().default(42)
z.boolean().default(true)

// This will cause: "400 Invalid schema for function: 'any' is not valid under any of the given schemas"
z.number().optional().default(30000)
```

❌ **Advanced Validations**
```typescript
// These are LOST during conversion
z.string().refine(val => val.includes("@"), "Must contain @")
z.number().transform(val => val * 2)
z.union([z.string(), z.number()])
z.intersection(schemaA, schemaB)
```

### Why These Limitations Exist

1. **JSON Schema Compatibility**: Our system converts Zod schemas to JSON Schema for LLM function calling, and JSON Schema has limited constraint support compared to Zod.

2. **Bidirectional Conversion**: We need to convert JSON Schema back to Zod, and many Zod features don't have direct JSON Schema equivalents.

3. **LLM Function Calling**: OpenAI's function calling API has specific requirements that limit the complexity of parameter schemas.

### Workarounds and Best Practices

#### 1. Use Descriptions for Constraints

Instead of relying on Zod constraints, document them in descriptions:

```typescript
// ❌ Don't do this (constraints will be lost)
const BadSchema = z.object({
  age: z.number().min(0).max(120),
  email: z.string().email(),
  tags: z.array(z.string()).min(1).max(5)
});

// ✅ Do this instead
const GoodSchema = z.object({
  age: z.number().describe("Age in years (must be between 0 and 120)"),
  email: z.string().describe("Valid email address (e.g., user@example.com)"),
  tags: z.array(z.string()).describe("List of tags (1-5 items, each tag should be a non-empty string)")
});
```

#### 2. Handle Default Values in Tool Implementation

Use the `||` operator to provide default values in your tool's `execute` function:

```typescript
// ❌ Don't do this (will cause schema errors)
const BadSchema = z.object({
  timeout: z.number().optional().default(30000)
});

// ✅ Do this instead
const GoodSchema = z.object({
  timeout: z.number().optional().describe("Timeout in milliseconds (default: 30 seconds if not specified)")
});

const MyTool = createTool({
  name: 'my_tool',
  description: 'Example tool with default values and validation',
  inputSchema: z.object({
    count: z.number().describe("Number of items (must be between 1 and 100)"),
    email: z.string().describe("Valid email address"),
    timeout: z.number().optional().describe("Timeout in milliseconds (default: 30000)")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string()
  }),
  async: false,
  execute: async (params, agent) => {
    // Handle default values
    const timeout = params.timeout || 30000;
    
    // Validate constraints manually
    if (params.count < 1 || params.count > 100) {
      return {
        success: false,
        message: "Count must be between 1 and 100"
      };
    }
    
    if (!params.email.includes('@') || !params.email.includes('.')) {
      return {
        success: false,
        message: "Invalid email format"
      };
    }
    
    if (timeout < 1000 || timeout > 60000) {
      return {
        success: false,
        message: "Timeout must be between 1000 and 60000 milliseconds"
      };
    }
    
    // Your tool logic here
    return {
      success: true,
      message: `Operation completed successfully with timeout: ${timeout}ms`
    };
  }
});
```

#### 3. Use Enums for Restricted Values

When you need to restrict values to a specific set, use enums:

```typescript
// ✅ Good: Use enums for restricted values
const StatusSchema = z.object({
  priority: z.enum(['low', 'medium', 'high', 'critical']).describe("Task priority level"),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).describe("Current status")
});
```

#### 4. Provide Clear Examples in Descriptions

Help the LLM understand expected formats through examples:

```typescript
const ConfigSchema = z.object({
  apiKey: z.string().describe("API key (format: 'sk-...' followed by 48 characters)"),
  timeout: z.number().describe("Timeout in milliseconds (e.g., 5000 for 5 seconds, range: 1000-30000)"),
  retries: z.number().describe("Number of retry attempts (integer between 0 and 5)")
});
```

### Common Schema Errors and Solutions

#### Error: "400 Invalid schema for function: 'any' is not valid under any of the given schemas"

**Cause**: Using Zod's `.default()` method in your schema.

**Solution**: Remove `.default()` and handle default values in your tool's execute function.

```typescript
// ❌ This causes the error
const schema = z.object({
  timeout: z.number().optional().default(30000)
});

// ✅ Fix: Remove .default() and handle in execute function
const schema = z.object({
  timeout: z.number().optional().describe("Timeout in milliseconds (default: 30000)")
});

// In your tool's execute function:
const timeout = params.timeout || 30000;
```

#### Error: Validation constraints not working

**Cause**: Using Zod constraints like `.min()`, `.max()`, `.email()`, etc.

**Solution**: Move validation logic to your tool's execute function.

```typescript
// ❌ These constraints are ignored
z.string().email()
z.number().min(1).max(100)

// ✅ Validate manually in execute function
if (!email.includes('@')) {
  return { success: false, error: "Invalid email" };
}
if (count < 1 || count > 100) {
  return { success: false, error: "Count must be 1-100" };
}
```

### Testing Your Schemas

Always test your tool schemas to ensure they work correctly:

```typescript
// Test schema conversion
import { zodToJson, jsonToZod } from '../src/core/utils/jsonHelper';

const originalSchema = z.object({
  name: z.string().describe("User name"),
  age: z.number().describe("Age in years (must be 18 or older)")
});

// Convert to JSON Schema and back
const jsonSchema = zodToJson(originalSchema);
const convertedSchema = jsonToZod(jsonSchema);

// Test with sample data
const testData = { name: "John", age: 25 };
const result = convertedSchema.parse(testData);
console.log('Conversion successful:', result);
```

### Future Improvements

We are considering the following improvements to address these limitations:

1. **Enhanced JSON Schema Support**: Adding support for more JSON Schema constraints like `minimum`, `maximum`, `minLength`, `maxLength`, etc.

2. **Custom Validation Layer**: Implementing a validation layer that preserves Zod constraints during conversion.

3. **Tool Schema Validation**: Adding automatic validation of tool parameters before execution.

4. **Better Error Messages**: Providing more descriptive error messages when validation fails.

### Migration Guide

If you have existing tools with Zod constraints:

1. **Audit Your Schemas**: Review all tool input/output schemas for unsupported constraints.

2. **Move Constraints to Descriptions**: Convert constraint information to descriptive text.

3. **Add Runtime Validation**: Implement validation logic in your tool's `execute` function.

4. **Test Thoroughly**: Ensure your tools still work correctly after migration.

5. **Update Documentation**: Update any tool documentation to reflect the new validation approach.

### Real-World Case Study: Approval Request Tool

Here's a real example from our codebase that demonstrates the proper way to handle default values:

```typescript
// ❌ Original problematic code (caused schema errors)
const ApprovalRequestInputSchema = z.object({
  actionType: z.enum(['file_write', 'file_delete', 'command_execute', 'git_operation', 'network_access']),
  description: z.string().describe("Clear description of what action requires approval"),
  details: z.object({
    command: z.string().optional().describe("Command to be executed (if applicable)"),
    filePaths: z.array(z.string()).optional().describe("Paths of files to be affected"),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    preview: z.string().optional().describe("Preview of the content/action")
  }),
  timeout: z.number().optional().default(30000).describe("Timeout in milliseconds (default: 30 seconds)")
  //                                ^^^^^^^^^ This caused the error!
});

// ✅ Fixed version
const ApprovalRequestInputSchema = z.object({
  actionType: z.enum(['file_write', 'file_delete', 'command_execute', 'git_operation', 'network_access']),
  description: z.string().describe("Clear description of what action requires approval"),
  details: z.object({
    command: z.string().optional().describe("Command to be executed (if applicable)"),
    filePaths: z.array(z.string()).optional().describe("Paths of files to be affected"),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    preview: z.string().optional().describe("Preview of the content/action")
  }),
  timeout: z.number().optional().describe("Timeout in milliseconds (default: 30 seconds if not specified)")
  //                              ^^^^^^^ Removed .default(), added description
});

// In the tool's execute function:
execute: async (params, agent) => {
  // Handle default value manually
  const timeout = params.timeout || 30000;
  
  // Use the timeout value
  const responsePromise = waitForApprovalResponse(agent.eventBus, requestId, timeout, sessionId);
  // ... rest of the logic
}
```

**Error Message**: `400 Invalid schema for function 'approval_request': 'any' is not valid under any of the given schemas.`

**Root Cause**: The `.default(30000)` method was not supported by our JSON Schema conversion system.

**Solution**: Removed `.default()` and handled the default value in the execute function using `params.timeout || 30000`.

### Example: Complete Tool with Proper Validation

```typescript
import { createTool } from '../src/core/utils';
import { z } from 'zod';

const CreateUserTool = createTool({
  name: 'create_user',
  description: 'Create a new user account with validation',
  inputSchema: z.object({
    username: z.string().describe("Username (3-20 characters, alphanumeric only)"),
    email: z.string().describe("Valid email address"),
    age: z.number().describe("Age in years (must be 18 or older)"),
    role: z.enum(['user', 'admin', 'moderator']).describe("User role"),
    tags: z.array(z.string()).describe("User tags (1-5 tags, each 1-50 characters)")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    userId: z.string().optional(),
    errors: z.array(z.string()).optional()
  }),
  async: false,
  execute: async (params, agent) => {
    const errors: string[] = [];
    
    // Validate username
    if (params.username.length < 3 || params.username.length > 20) {
      errors.push("Username must be 3-20 characters long");
    }
    if (!/^[a-zA-Z0-9]+$/.test(params.username)) {
      errors.push("Username must contain only alphanumeric characters");
    }
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(params.email)) {
      errors.push("Invalid email format");
    }
    
    // Validate age
    if (params.age < 18) {
      errors.push("User must be 18 or older");
    }
    if (!Number.isInteger(params.age)) {
      errors.push("Age must be a whole number");
    }
    
    // Validate tags
    if (params.tags.length < 1 || params.tags.length > 5) {
      errors.push("Must provide 1-5 tags");
    }
    for (const tag of params.tags) {
      if (tag.length < 1 || tag.length > 50) {
        errors.push(`Tag "${tag}" must be 1-50 characters long`);
      }
    }
    
    if (errors.length > 0) {
      return {
        success: false,
        errors
      };
    }
    
    // Create user logic here
    const userId = `user_${Date.now()}`;
    
    return {
      success: true,
      userId
    };
  }
});

export { CreateUserTool };
```

This approach ensures robust validation while working within the constraints of our current JSON Schema conversion system. 