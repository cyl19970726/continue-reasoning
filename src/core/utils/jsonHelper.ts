import { z } from "zod";
import { zodTextFormat, } from "openai/helpers/zod";

// --- JSON Schema → Zod ---
export function jsonToZod(schema: any): any {
    if (!schema) return z.any();

    if ("enum" in schema && Array.isArray(schema.enum) && schema.enum.length > 0) {
        const enumArr = schema.enum as string[];
        let zodEnum = z.enum(enumArr as [string, ...string[]]);
        if (schema.description) zodEnum = zodEnum.describe(schema.description);
        return zodEnum;
    }

    switch ((schema as any).type) {
        case "string":
            if ("enum" in schema && Array.isArray(schema.enum) && schema.enum.length > 0) {
                const enumArr = schema.enum as string[];
                let zodEnum = z.enum(enumArr as [string, ...string[]]);
                if (schema.description) zodEnum = zodEnum.describe(schema.description);
                return zodEnum;
            }
            let zodStr = z.string();
            if (schema.description) zodStr = zodStr.describe(schema.description);
            return zodStr;
        case "number":
        case "integer":
            let zodNum = z.number();
            if (schema.description) zodNum = zodNum.describe(schema.description);
            return zodNum;
        case "boolean":
            let zodBool = z.boolean();
            if (schema.description) zodBool = zodBool.describe(schema.description);
            return zodBool;
        case "array":
            if ("items" in schema) {
                let zodArr = z.array(jsonToZod(schema.items));
                if (schema.description) zodArr = zodArr.describe(schema.description);
                return zodArr;
            }
            return z.array(z.any());
        case "object":
            const shape: Record<string, any> = {};
            const objSchema = schema as any;
            const req = Array.isArray(objSchema.required) ? objSchema.required : [];
            for (const key in objSchema.properties) {
                const propSchema = objSchema.properties[key];
                let zodField = jsonToZod(propSchema);
                if (!req.includes(key)) zodField = zodField.optional();
                shape[key] = zodField;
            }
            let zodObj = z.object(shape);
            if (schema.description) zodObj = zodObj.describe(schema.description);
            return zodObj;
        case "null":
            return z.null();
        default:
            return z.any();
    }
}

interface StrictJsonSchema {
    type?: string | string[];  // Allow union types like ["string", "null"]
    items?: StrictJsonSchema;
    enum?: string[];
    properties?: Record<string, StrictJsonSchema>;
    required?: string[];
    description?: string;
    additionalProperties?: boolean;
}

function validateStrictSchema(schema: StrictJsonSchema): void {
    if (schema.type === 'object' && schema.properties) {
        // Check if all properties are listed in required array
        const propertyKeys = Object.keys(schema.properties);
        const required = schema.required || [];
        const missingRequired = propertyKeys.filter(key => !required.includes(key));
        
        if (missingRequired.length > 0) {
            throw new Error(`Strict schema validation failed: All properties must be listed in the required array. Missing: ${missingRequired.join(', ')}`);
        }

        // Recursively validate nested objects
        for (const [key, value] of Object.entries(schema.properties)) {
            if (value.type === 'object') {
                validateStrictSchema(value);
            }
        }
    }
}

/**
 * Converts a JSON schema to a Zod schema following OpenAI's function calling requirements.
 * 
 * Strict mode rules:
 * 1. Fields with type: ["type", "null"] are converted to .optional() fields
 * 2. All objects are created with .strict() to prevent additional properties
 * 3. All fields are required unless they have a null type in their type union
 * 
 * Example:
 * ```typescript
 * // JSON schema
 * {
 *   type: "object",
 *   properties: {
 *     required: { type: "string" },
 *     optional: { type: ["string", "null"] },
 *     nested: {
 *       type: "object",
 *       properties: {
 *         name: { type: "string" },
 *         age: { type: ["number", "null"] }
 *       },
 *       required: ["name", "age"],
 *       additionalProperties: false
 *     }
 *   },
 *   required: ["required", "optional", "nested"],
 *   additionalProperties: false
 * }
 * 
 * // Converted Zod schema
 * z.object({
 *   required: z.string(),
 *   optional: z.string().optional(),
 *   nested: z.object({
 *     name: z.string(),
 *     age: z.number().optional()
 *   }).strict()
 * }).strict()
 * ```
 * 
 * @param schema - The JSON schema that follows OpenAI's strict mode format
 * @returns A Zod schema
 */
export function jsonToZodStrict(schema: StrictJsonSchema): z.ZodType {
    if (!schema) return z.object({}).strict();

    // Validate schema structure first
    validateStrictSchema(schema);

    // 定义一个函数用于验证对象，包括处理嵌套对象和 null 值
    function processSchema(currentSchema: StrictJsonSchema): z.ZodType {
        // Handle enum type
        if (currentSchema.enum && Array.isArray(currentSchema.enum) && currentSchema.enum.length > 0) {
            const enumSchema = z.enum(currentSchema.enum as [string, ...string[]]);
            const finalSchema = Array.isArray(currentSchema.type) && currentSchema.type.includes('null') 
                ? enumSchema.nullable()
                : enumSchema;
            return currentSchema.description ? finalSchema.describe(currentSchema.description) : finalSchema;
        }

        // Handle array type
        if (currentSchema.type === 'array' && currentSchema.items) {
            const arraySchema = z.array(processSchema(currentSchema.items));
            return currentSchema.description ? arraySchema.describe(currentSchema.description) : arraySchema;
        }

        // Handle union types with null
        if (Array.isArray(currentSchema.type)) {
            const types = currentSchema.type.filter(t => t !== 'null');
            let baseSchema: z.ZodType;

            if (types.length === 1) {
                baseSchema = createBaseType(types[0], currentSchema);
            } else {
                const typeSchemas = types.map(t => createBaseType(t, currentSchema));
                baseSchema = z.union(typeSchemas as [z.ZodType, z.ZodType, ...z.ZodType[]]);
            }

            if (currentSchema.type.includes('null')) {
                baseSchema = baseSchema.nullable();
            }

            return currentSchema.description ? baseSchema.describe(currentSchema.description) : baseSchema;
        }

        // Handle object type
        if (currentSchema.type === 'object' && currentSchema.properties) {
            // 创建一个不包含额外字段的 Zod 对象验证器
            const shape: Record<string, z.ZodTypeAny> = {};

            for (const [key, propSchema] of Object.entries(currentSchema.properties)) {
                // 递归处理嵌套对象
                let fieldSchema: z.ZodType;
                
                if (Array.isArray(propSchema.type) && propSchema.type.includes('null')) {
                    // 明确允许 null 的字段
                    fieldSchema = processSchema({
                        ...propSchema,
                        type: propSchema.type.filter(t => t !== 'null')[0]
                    }).nullable();
                } else {
                    // 不允许 null 的字段
                    fieldSchema = processSchema(propSchema);
                }
                
                if (propSchema.description) {
                    fieldSchema = fieldSchema.describe(propSchema.description);
                }
                
                shape[key] = fieldSchema;
            }

            // 创建对象验证器
            const objectSchema = z.object(shape).strict();
            
            // 添加额外的 null 值验证
            const validatedSchema = objectSchema.superRefine((data, ctx) => {
                if (data === null) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "Object cannot be null",
                    });
                    return z.NEVER;
                }
                
                // 检查所有非 nullable 字段是否为 null
                for (const [key, propSchema] of Object.entries(currentSchema.properties || {})) {
                    const isNullable = Array.isArray(propSchema.type) && propSchema.type.includes('null');
                    if (!isNullable && data[key] === null) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: `Field "${key}" cannot be null`,
                            path: [key],
                        });
                    }
                }
            });
            
            return currentSchema.description ? 
                validatedSchema.describe(currentSchema.description) : 
                validatedSchema;
        }

        // Handle basic types
        const baseSchema = createBaseType(currentSchema.type as string, currentSchema);
        const validatedSchema = baseSchema.superRefine((data, ctx) => {
            if (data === null) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Value cannot be null",
                });
                return z.NEVER;
            }
        });
        
        return currentSchema.description ? 
            validatedSchema.describe(currentSchema.description) : 
            validatedSchema;
    }

    // 处理顶层 schema
    return processSchema(schema);
}

function createBaseType(type: string, schema: StrictJsonSchema): z.ZodType {
    switch (type) {
        case 'string':
            return schema.enum && schema.enum.length > 0
                ? z.enum(schema.enum as [string, ...string[]])
                : z.string();
        case 'number':
            return z.number();
        case 'boolean':
            return z.boolean();
        case 'null':
            return z.null();
        default:
            return z.any();
    }
}

// --- Zod → JSON Schema ---
export function zodToJson(schema: z.ZodTypeAny): Record<string, any> {
    const definition = schema._def;
    let jsonSchema: Record<string, any> = {};

    if (definition.typeName === 'ZodOptional' || definition.typeName === 'ZodNullable') {
        return zodToJson((schema as any)._def.innerType);
    }

    switch (definition.typeName) {
        case 'ZodString':
            jsonSchema.type = 'string';
            if ('checks' in definition && definition.checks) {
                const enumCheck = definition.checks.find((check: any) => check.kind === 'enum');
                if (enumCheck) jsonSchema.enum = enumCheck.values;
            }
            break;
        case 'ZodNumber':
        case 'ZodBigInt':
            jsonSchema.type = 'number';
            break;
        case 'ZodBoolean':
            jsonSchema.type = 'boolean';
            break;
        case 'ZodDate':
            jsonSchema.type = 'string';
            jsonSchema.format = 'date-time';
            break;
        case 'ZodEnum':
            jsonSchema.type = 'string';
            jsonSchema.enum = (definition as any).values;
            break;
        case 'ZodNativeEnum':
            const values = Object.values((definition as any).values);
            jsonSchema.type = typeof values[0] === 'number' ? 'number' : 'string';
            jsonSchema.enum = values.filter((v: any) => typeof v === jsonSchema.type);
            break;
        case 'ZodObject':
            jsonSchema.type = 'object';
            jsonSchema.properties = {};
            jsonSchema.required = [];
            const shape = (definition as any).shape();
            for (const key in shape) {
                const fieldSchema = shape[key];
                jsonSchema.properties[key] = zodToJson(fieldSchema);
                if (fieldSchema._def.typeName !== 'ZodOptional' && fieldSchema._def.typeName !== 'ZodNullable') {
                    jsonSchema.required.push(key);
                }
            }
            break;
        case 'ZodArray':
            jsonSchema.type = 'array';
            jsonSchema.items = zodToJson((definition as any).type);
            break;
        case 'ZodTuple':
            jsonSchema.type = 'array';
            jsonSchema.items = (definition as any).items.map((item: any) => zodToJson(item));
            jsonSchema.minItems = (definition as any).items.length;
            jsonSchema.maxItems = (definition as any).items.length;
            break;
        case 'ZodRecord':
            jsonSchema.type = 'object';
            const valueType = (definition as any).valueType;
            jsonSchema.additionalProperties = zodToJson(valueType);
            break;
        default:
            jsonSchema.type = 'any';
            break;
    }

    if (schema.description) {
        jsonSchema.description = schema.description;
    }

    if (definition.typeName === 'ZodObject' && !('additionalProperties' in jsonSchema)) {
        jsonSchema.additionalProperties = false;
    }

    return jsonSchema;
}

/**
 * Converts a Zod schema to a JSON schema that preserves optional fields
 * (doesn't include them in required[] array) while still setting additionalProperties: false.
 * 
 * This is a middle ground between regular zodToJson and strict mode:
 * 1. Optional fields are NOT placed in the required array
 * 2. All objects have additionalProperties: false
 * 3. Types remain as their original type (not converted to unions with null)
 * 4. Nullable fields are treated as optional fields (not included in required array)
 * 
 * IMPORTANT: Due to JSON Schema limitations, nullable types (z.nullable()) are treated 
 * as optional fields. When converting back (zod -> json -> zod), nullable fields 
 * will become optional fields, losing their nullable constraints.
 * 
 * @param schema - The Zod schema to convert
 * @returns A JSON schema with additionalProperties: false but preserving optional fields
 */
export function zodToJsonNostrict(schema: z.ZodTypeAny): Record<string, any> {
    const definition = schema._def;
    
    // Check if the schema is wrapped in ZodOptional (to track optionality)
    const isOptional = definition.typeName === 'ZodOptional';
    
    // Handle optional wrapper (extract inner type)
    if (isOptional) {
        const innerSchema = zodToJsonNostrict((schema as any)._def.innerType);
        // Pass through but don't modify the type
        return innerSchema;
    }

    // Handle nullable wrapper - treat as optional for JSON Schema (not included in required array)
    if (definition.typeName === 'ZodNullable') {
        console.warn('WARNING: Converting ZodNullable to JSON Schema treats it as optional. When converting back to Zod, it will become optional instead of nullable.');
        // Just pass through the inner schema without adding null to type
        // The handling code in ZodObject will exclude it from required array
        return zodToJsonNostrict((schema as any)._def.innerType);
    }

    let jsonSchema: Record<string, any> = {};

    switch (definition.typeName) {
        case 'ZodString':
            jsonSchema.type = 'string';
            if ('checks' in definition && definition.checks) {
                const enumCheck = definition.checks.find((check: any) => check.kind === 'enum');
                if (enumCheck) jsonSchema.enum = enumCheck.values;
            }
            break;
        case 'ZodNumber':
        case 'ZodBigInt':
            jsonSchema.type = 'number';
            break;
        case 'ZodBoolean':
            jsonSchema.type = 'boolean';
            break;
        case 'ZodDate':
            jsonSchema.type = 'string';
            jsonSchema.format = 'date-time';
            break;
        case 'ZodEnum':
            jsonSchema.type = 'string';
            jsonSchema.enum = (definition as any).values;
            break;
        case 'ZodNativeEnum':
            const values = Object.values((definition as any).values);
            jsonSchema.type = typeof values[0] === 'number' ? 'number' : 'string';
            jsonSchema.enum = values.filter((v: any) => typeof v === jsonSchema.type);
            break;
        case 'ZodObject':
            jsonSchema.type = 'object';
            jsonSchema.properties = {};
            jsonSchema.required = [];
            const shape = (definition as any).shape();
            let hasNullableFields = false;
            let nullableFieldNames: string[] = [];
            
            for (const key in shape) {
                const fieldSchema = shape[key];
                jsonSchema.properties[key] = zodToJsonNostrict(fieldSchema);
                
                // Check if field is optional or nullable
                const isFieldOptional = fieldSchema._def.typeName === 'ZodOptional';
                const isFieldNullable = fieldSchema._def.typeName === 'ZodNullable';
                
                // Track nullable fields for warning
                if (isFieldNullable) {
                    hasNullableFields = true;
                    nullableFieldNames.push(key);
                }
                
                // Only add to required if neither optional nor nullable
                if (!isFieldOptional && !isFieldNullable) {
                    jsonSchema.required.push(key);
                }
            }
            
            // Log warning if object has nullable fields
            if (hasNullableFields) {
                console.warn(`WARNING: Object has nullable fields (${nullableFieldNames.join(', ')}) that are treated as optional in JSON Schema. When converting back to Zod, these fields will become optional.`);
            }
            
            // Check if the object is using passthrough or strict mode
            const unknownKeys = (definition as any).unknownKeys;
            if (unknownKeys === 'passthrough') {
                // For passthrough objects, set additionalProperties to true
                jsonSchema.additionalProperties = true;
            } else {
                // For strict objects, set additionalProperties to false
                jsonSchema.additionalProperties = false;
            }
            break;
        case 'ZodArray':
            jsonSchema.type = 'array';
            jsonSchema.items = zodToJsonNostrict((definition as any).type);
            break;
        case 'ZodTuple':
            jsonSchema.type = 'array';
            jsonSchema.items = (definition as any).items.map((item: any) => zodToJsonNostrict(item));
            jsonSchema.minItems = (definition as any).items.length;
            jsonSchema.maxItems = (definition as any).items.length;
            break;
        case 'ZodRecord':
            jsonSchema.type = 'object';
            const valueType = (definition as any).valueType;
            jsonSchema.additionalProperties = zodToJsonNostrict(valueType);
            break;
        default:
            jsonSchema.type = 'any';
            break;
    }

    if (schema.description) {
        jsonSchema.description = schema.description;
    }

    return jsonSchema;
}

interface ZodTypeDef {
    typeName: string;
    checks?: Array<{ kind: string; values?: any[] }>;
    type?: any;
    shape?: () => Record<string, any>;
    innerType?: any;
    values?: any[];
}

interface ZodTypeWithDef {
    _def: ZodTypeDef;
    description?: string;
}

/**
 * Converts a Zod schema to a strict JSON schema following OpenAI's function calling requirements.
 * 
 * Strict mode rules:
 * 1. All .optional() fields are converted to union types with null (e.g., type: ["string", "null"])
 * 2. All fields are marked as required (optionality is handled through nullable types)
 * 3. All objects have additionalProperties: false
 * 
 * Example:
 * ```typescript
 * // Zod schema
 * const zodSchema = z.object({
 *   required: z.string(),
 *   optional: z.string().optional(),
 *   nested: z.object({
 *     name: z.string(),
 *     age: z.number().optional()
 *   })
 * }).strict();
 * 
 * // Converted JSON schema
 * {
 *   type: "object",
 *   properties: {
 *     required: { type: "string" },
 *     optional: { type: ["string", "null"] },
 *     nested: {
 *       type: "object",
 *       properties: {
 *         name: { type: "string" },
 *         age: { type: ["number", "null"] }
 *       },
 *       required: ["name", "age"],
 *       additionalProperties: false
 *     }
 *   },
 *   required: ["required", "optional", "nested"],
 *   additionalProperties: false
 * }
 * ```
 * 
 * @param schema - The Zod schema to convert
 * @returns A JSON schema that follows OpenAI's strict mode requirements
 */
export function zodToJsonStrict(schema: z.ZodType): StrictJsonSchema {
    if (!schema || typeof schema !== 'object') {
        return { type: 'any' };
    }

    const def = (schema as any)._def;
    if (!def) return { type: 'any' };

    // Explicitly reject ZodRecord types
    if (def.typeName === 'ZodRecord') {
        throw new Error('ZodRecord types are not supported in strict mode. OpenAI function calling requires all properties to be known in advance. Use z.object() with explicit properties instead.');
    }

    // Handle optional types - convert to union type with null
    if (def.typeName === 'ZodOptional' || def.typeName === 'ZodNullable') {
        const innerSchema = zodToJsonStrict(def.innerType as z.ZodType);
        const type = innerSchema.type;
        return {
            ...innerSchema,
            type: Array.isArray(type) ? 
                type.includes('null') ? type : [...type, 'null'] : 
                [type || 'any', 'null'],
            description: schema.description || innerSchema.description
        };
    }

    // Handle object type
    if (def.typeName === 'ZodObject') {
        const result: StrictJsonSchema = {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false
        };

        if (schema.description) {
            result.description = schema.description;
        }

        const shape = def.shape();
        for (const [key, fieldSchema] of Object.entries(shape)) {
            const fieldDef = (fieldSchema as any)._def;
            if (!fieldDef) continue;

            // Convert the field schema
            const propertySchema = zodToJsonStrict(fieldSchema as z.ZodType);
            if (!result.properties) result.properties = {};
            result.properties[key] = propertySchema;

            // Preserve field description
            if ((fieldSchema as any).description) {
                result.properties[key].description = (fieldSchema as any).description;
            }

            // In strict mode, all fields are required
            result.required?.push(key);
        }

        return result;
    }

    // Handle array type
    if (def.typeName === 'ZodArray') {
        return {
            type: 'array',
            items: zodToJsonStrict(def.type as z.ZodType),
            description: schema.description
        };
    }

    // Handle enum type
    if (def.typeName === 'ZodEnum') {
        return {
            type: 'string',
            enum: def.values,
            description: schema.description
        };
    }

    // Handle basic types
    let result: StrictJsonSchema = { type: 'any' };
    switch (def.typeName) {
        case 'ZodString':
            result = { type: 'string' };
            break;
        case 'ZodNumber':
        case 'ZodBigInt':
            result = { type: 'number' };
            break;
        case 'ZodBoolean':
            result = { type: 'boolean' };
            break;
        case 'ZodNull':
            result = { type: 'null' };
            break;
        default:
            result = { type: 'any' };
    }

    if (schema.description) {
        result.description = schema.description;
    }

    return result;
}

/**
 * Converts a JSON schema to a Zod schema in non-strict mode.
 * 
 * Non-strict mode rules:
 * 1. Properties not listed in required[] array are converted to .optional() fields
 * 2. Objects use .passthrough() instead of .strict() to allow additional properties
 *    when additionalProperties is not explicitly set to false
 * 3. No special handling for null types
 * 
 * IMPORTANT: Since JSON Schema has no direct equivalent for Zod's nullable types,
 * fields that were originally nullable in Zod and converted to JSON will be
 * treated as optional when converting back, losing their nullable constraints.
 * 
 * @param schema - The JSON schema to convert
 * @returns A Zod schema
 */
export function jsonToZodNostrict(schema: any): z.ZodTypeAny {
    if (!schema) return z.any();

    if ("enum" in schema && Array.isArray(schema.enum) && schema.enum.length > 0) {
        const enumArr = schema.enum as string[];
        let zodEnum = z.enum(enumArr as [string, ...string[]]);
        if (schema.description) zodEnum = zodEnum.describe(schema.description);
        return zodEnum;
    }

    switch ((schema as any).type) {
        case "string":
            if ("enum" in schema && Array.isArray(schema.enum) && schema.enum.length > 0) {
                const enumArr = schema.enum as string[];
                let zodEnum = z.enum(enumArr as [string, ...string[]]);
                if (schema.description) zodEnum = zodEnum.describe(schema.description);
                return zodEnum;
            }
            let zodStr = z.string();
            if (schema.description) zodStr = zodStr.describe(schema.description);
            return zodStr;
        case "number":
        case "integer":
            let zodNum = z.number();
            if (schema.description) zodNum = zodNum.describe(schema.description);
            return zodNum;
        case "boolean":
            let zodBool = z.boolean();
            if (schema.description) zodBool = zodBool.describe(schema.description);
            return zodBool;
        case "array":
            if ("items" in schema) {
                let zodArr = z.array(jsonToZodNostrict(schema.items));
                if (schema.description) zodArr = zodArr.describe(schema.description);
                return zodArr;
            }
            return z.array(z.any());
        case "object":
            // Handle record-like objects with additionalProperties schema
            if (schema.additionalProperties && typeof schema.additionalProperties === 'object' && 
                (!schema.properties || Object.keys(schema.properties).length === 0)) {
                const valueSchema = jsonToZodNostrict(schema.additionalProperties);
                let zodRecord = z.record(z.string(), valueSchema);
                if (schema.description) zodRecord = zodRecord.describe(schema.description);
                return zodRecord;
            }

            // Handle regular objects with properties
            const shape: Record<string, z.ZodTypeAny> = {};
            const objSchema = schema as any;
            const required = Array.isArray(objSchema.required) ? objSchema.required : [];
            
            if (objSchema.properties) {
                for (const key in objSchema.properties) {
                    const propSchema = objSchema.properties[key];
                    let zodField = jsonToZodNostrict(propSchema);
                    
                    // Make field optional if not in required array
                    if (!required.includes(key)) {
                        zodField = zodField.optional();
                    }
                    
                    shape[key] = zodField;
                }
            }
            
            // Create the object schema with the appropriate behavior
            let zodObj;
            
            // Empty object with additionalProperties true or not specified should be passthrough
            if (Object.keys(shape).length === 0) {
                // If additionalProperties is explicitly false, use strict
                if (schema.additionalProperties === false) {
                    zodObj = z.object({}).strict();
                } else {
                    // Otherwise use passthrough
                    zodObj = z.object({}).passthrough();
                }
            } else if (schema.additionalProperties === false) {
                zodObj = z.object(shape).strict();
            } else {
                // For any case where additionalProperties is true, an object, undefined, or any non-false value
                zodObj = z.object(shape).passthrough();
            }
            
            if (schema.description) {
                return zodObj.describe(schema.description);
            }
            return zodObj;
        default:
            return z.any();
    }
}
