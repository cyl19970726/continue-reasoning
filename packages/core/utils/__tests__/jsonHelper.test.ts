import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { jsonToZod, zodToJson, jsonToZodStrict, zodToJsonStrict, zodToJsonNostrict, jsonToZodNostrict } from '../jsonHelper';

// Regular (non-strict) mode tests
describe('jsonToZod & zodToJson', () => {
  describe('Basic Type Conversions', () => {
    it('should convert string schema with description', () => {
      const schema = { type: 'string', description: 'A string' };
      const zodSchema = jsonToZod(schema);
      expect(zodSchema.safeParse('hello').success).toBe(true);
      expect(zodSchema.safeParse(123).success).toBe(false);
      expect(zodSchema.description).toBe('A string');
    });

    it('should convert number schema', () => {
      const schema = { type: 'number' };
      const zodSchema = jsonToZod(schema);
      expect(zodSchema.safeParse(42).success).toBe(true);
      expect(zodSchema.safeParse('no').success).toBe(false);
    });

    it('should convert enum schema', () => {
      const schema = { type: 'string', enum: ['a', 'b', 'c'] };
      const zodSchema = jsonToZod(schema);
      expect(zodSchema.safeParse('a').success).toBe(true);
      expect(zodSchema.safeParse('d').success).toBe(false);
    });
  });

  describe('Object & Array Handling', () => {
    it('should convert object schema with required and optional fields', () => {
      const schema = {
        type: 'object',
        properties: {
          foo: { type: 'string' },
          bar: { type: 'number' }
        },
        required: ['foo']
      };
      const zodSchema = jsonToZod(schema);
      expect(zodSchema.safeParse({ foo: 'hi', bar: 1 }).success).toBe(true);
      expect(zodSchema.safeParse({ foo: 'hi' }).success).toBe(true); // optional field can be omitted
      expect(zodSchema.safeParse({ bar: 1 }).success).toBe(false); // required field missing
    });

    it('should convert array schema with type validation', () => {
      const schema = { type: 'array', items: { type: 'number' } };
      const zodSchema = jsonToZod(schema);
      expect(zodSchema.safeParse([1, 2, 3]).success).toBe(true);
      expect(zodSchema.safeParse(['a', 'b']).success).toBe(false); // wrong type
    });

    it('should handle nested object schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' }
            },
            required: ['name']
          },
          active: { type: 'boolean' }
        },
        required: ['user']
      };
      const zodSchema = jsonToZod(schema);
      expect(zodSchema.safeParse({ user: { name: 'A', age: 1 }, active: true }).success).toBe(true);
      expect(zodSchema.safeParse({ user: { name: 'A' } }).success).toBe(true); // optional nested field
      expect(zodSchema.safeParse({ user: { age: 1 } }).success).toBe(false); // required nested field missing
    });
  });
});

// Strict mode tests
describe('Strict Mode Conversions', () => {
  describe('jsonToZodStrict', () => {
    describe('Basic Requirements', () => {
      it('should enforce strict mode core requirements', () => {
        const schema = {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City and country e.g. Bogotá, Colombia'
            },
            units: {
              type: ['string', 'null'], // Nullable field in strict mode
              enum: ['celsius', 'fahrenheit'],
              description: 'Units the temperature will be returned in.'
            }
          },
          required: ['location', 'units'],
          additionalProperties: false
        };
        
        const zodSchema = jsonToZodStrict(schema);
        
        // Valid cases
        expect(zodSchema.safeParse({
          location: 'Bogotá, Colombia',
          units: 'celsius'
        }).success).toBe(true);
        expect(zodSchema.safeParse({
          location: 'Bogotá, Colombia',
          units: null
        }).success).toBe(true);

        // Invalid cases
        expect(zodSchema.safeParse({
          location: 'Bogotá, Colombia',
          units: 'kelvin' // Invalid enum value
        }).success).toBe(false);
        expect(zodSchema.safeParse({
          location: 'Bogotá, Colombia',
          units: 'celsius',
          extra: 'field' // No additional properties allowed
        }).success).toBe(false);
        expect(zodSchema.safeParse({
          location: 'Bogotá, Colombia' // Required field missing
        }).success).toBe(false);
      });
    });

    describe('Type Handling', () => {
      it('should properly handle union types with null', () => {
        const schema = {
          type: 'object',
          properties: {
            units: {
              type: ['string', 'null'],
              enum: ['celsius', 'fahrenheit']
            }
          },
          required: ['units']
        };
        
        const zodSchema = jsonToZodStrict(schema);
        
        expect(zodSchema.safeParse({ units: 'celsius' }).success).toBe(true);
        expect(zodSchema.safeParse({ units: null }).success).toBe(true);
        expect(zodSchema.safeParse({ units: 'invalid' }).success).toBe(false);
      });

      it('should handle nested objects with proper strictness', () => {
        const schema = {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: ['number', 'null'] }
              },
              required: ['name', 'age']
            }
          },
          required: ['user']
        };
        
        const zodSchema = jsonToZodStrict(schema);
        
        // Debug information
        const result1 = zodSchema.safeParse({ user: { name: 'test', age: null } });
        console.log("Valid case with null age:", result1.success);
        
        const result2 = zodSchema.safeParse({ user: { name: null, age: 25 } });
        console.log("Invalid case with null name:", result2.success);
        if (!result2.success) {
          // @ts-ignore
          console.log("Error message:", result2.error.errors[0]?.message);
        }
        
        // Valid cases
        expect(zodSchema.safeParse({ user: { name: 'test', age: null } }).success).toBe(true);
        expect(zodSchema.safeParse({ user: { name: 'test', age: 25 } }).success).toBe(true);
        
        // Invalid cases
        expect(zodSchema.safeParse({ user: { name: null, age: 25 } }).success).toBe(false); // name is required and non-null
        expect(zodSchema.safeParse({ user: { name: 'test' } }).success).toBe(false); // missing age field
        expect(zodSchema.safeParse({ user: { name: 'test', age: 25, extra: 'field' } }).success).toBe(false); // extra field not allowed
      });

      it('should throw error for invalid schema structure', () => {
        const invalidSchema = {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'number' } // age is not in required array
              },
              required: ['name'] // missing age in required array
            }
          },
          required: ['user']
        };
        
        expect(() => jsonToZodStrict(invalidSchema)).toThrow('Strict schema validation failed');
      });
    });
  });

  describe('zodToJsonStrict', () => {
    describe('Optional Field Handling', () => {
      it('should convert optional fields to nullable in strict mode', () => {
        const zodSchema = z.object({
          name: z.string(),
          age: z.number().optional(),
          email: z.string().optional(),
          tags: z.array(z.string()).optional()
        }).strict();

        const jsonSchema = zodToJsonStrict(zodSchema);
        
        // All fields should be required in strict mode
        expect(jsonSchema.required).toEqual(['name', 'age', 'email', 'tags']);
        
        // Optional fields should be converted to union types with null
        expect(jsonSchema.properties?.age.type).toEqual(['number', 'null']);
        expect(jsonSchema.properties?.email.type).toEqual(['string', 'null']);
        expect(jsonSchema.properties?.tags.type).toEqual(['array', 'null']);
        
        // Non-optional fields should remain as single type
        expect(jsonSchema.properties?.name.type).toBe('string');
      });

      it('should handle complex optional combinations', () => {
        const zodSchema = z.object({
          required: z.string(),
          optional: z.string().optional(),
          nullableOptional: z.string().optional().nullable(),
          nested: z.object({
            name: z.string(),
            age: z.number().optional()
          }).strict()
        }).strict();

        const jsonSchema = zodToJsonStrict(zodSchema);
        
        // Verify field requirements
        expect(jsonSchema.required).toContain('required');
        expect(jsonSchema.required).toContain('nested');
        
        // Verify type conversions
        expect(jsonSchema.properties?.optional.type).toEqual(['string', 'null']);
        expect(jsonSchema.properties?.nullableOptional.type).toEqual(['string', 'null']);
        
        // Verify nested structure
        const nested = jsonSchema.properties?.nested;
        expect(nested?.required).toContain('name');
        expect(nested?.properties?.age.type).toEqual(['number', 'null']);
      });
    });

    describe('Metadata Handling', () => {
      it('should preserve descriptions and metadata', () => {
        const zodSchema = z.object({
          name: z.string().describe('The user name'),
          age: z.number().nullable().describe('The user age')
        }).strict().describe('User information');

        const jsonSchema = zodToJsonStrict(zodSchema);
        
        expect(jsonSchema.description).toBe('User information');
        expect(jsonSchema.properties?.name.description).toBe('The user name');
        expect(jsonSchema.properties?.age.description).toBe('The user age');
      });
    });

    describe('Complex Type Handling', () => {
      it('should handle arrays with optional elements', () => {
        const zodSchema = z.object({
          list: z.array(z.object({
            id: z.number(),
            name: z.string().optional(),
            tags: z.array(z.string()).optional()
          }).strict())
        }).strict();

        const jsonSchema = zodToJsonStrict(zodSchema);
        
        const itemSchema = jsonSchema.properties?.list.items;
        
        // Verify structure and types
        expect(itemSchema?.required).toEqual(['id', 'name', 'tags']);
        expect(itemSchema?.properties?.name.type).toEqual(['string', 'null']);
        expect(itemSchema?.properties?.tags.type).toEqual(['array', 'null']);
        expect(itemSchema?.properties?.id.type).toBe('number');
        
        // Verify strictness
        expect(jsonSchema.additionalProperties).toBe(false);
        expect(itemSchema?.additionalProperties).toBe(false);
      });

      it('should handle enum fields with nullability', () => {
        const zodSchema = z.object({
          status: z.enum(['active', 'inactive']).optional(),
          type: z.enum(['user', 'admin']).nullable()
        }).strict();

        const jsonSchema = zodToJsonStrict(zodSchema);
        
        expect(jsonSchema.properties?.status.type).toEqual(['string', 'null']);
        expect(jsonSchema.properties?.status.enum).toEqual(['active', 'inactive']);
        expect(jsonSchema.properties?.type.type).toEqual(['string', 'null']);
        expect(jsonSchema.properties?.type.enum).toEqual(['user', 'admin']);
      });
    });

    describe('Record Type Rejection', () => {
      it('should throw error for ZodRecord types', () => {
        // Create a record schema
        const recordSchema = z.record(z.string(), z.number());
        
        // Should throw an error when converting to JSON schema
        expect(() => {
          zodToJsonStrict(recordSchema);
        }).toThrow(/ZodRecord types are not supported in strict mode/);
        
        // Also test with an optional record
        const optionalRecordSchema = z.record(z.string(), z.string()).optional();
        expect(() => {
          zodToJsonStrict(optionalRecordSchema);
        }).toThrow(/ZodRecord types are not supported in strict mode/);
      });
    });
  });
});

// Non-strict mode specific tests
describe('Non-strict Mode Conversions', () => {
  describe('zodToJsonNostrict', () => {
    describe('Optional Field Handling', () => {
      it('should preserve optional fields (not in required array) while setting additionalProperties:false', () => {
        const zodSchema = z.object({
          name: z.string(),
          age: z.number().optional(),
          email: z.string().optional(),
          tags: z.array(z.string()).optional()
        });

        const jsonSchema = zodToJsonNostrict(zodSchema);
        
        // Only non-optional fields should be required
        expect(jsonSchema.required).toEqual(['name']);
        expect(jsonSchema.required).not.toContain('age');
        expect(jsonSchema.required).not.toContain('email');
        expect(jsonSchema.required).not.toContain('tags');
        
        // Optional fields should keep their original type (not union with null)
        expect(jsonSchema.properties?.age.type).toBe('number');
        expect(jsonSchema.properties?.email.type).toBe('string');
        expect(jsonSchema.properties?.tags.type).toBe('array');
        
        // additionalProperties should be false
        expect(jsonSchema.additionalProperties).toBe(false);
      });

      it('should handle nested objects correctly', () => {
        const zodSchema = z.object({
          user: z.object({
            name: z.string(),
            age: z.number().optional()
          }),
          settings: z.object({
            theme: z.string().optional(),
            notifications: z.boolean()
          }).optional()
        });

        const jsonSchema = zodToJsonNostrict(zodSchema);
        
        // Check root level
        expect(jsonSchema.required).toEqual(['user']);
        expect(jsonSchema.required).not.toContain('settings');
        
        // Check nested object (user)
        expect(jsonSchema.properties?.user.required).toEqual(['name']);
        expect(jsonSchema.properties?.user.required).not.toContain('age');
        
        // Check nested optional object (settings)
        expect(jsonSchema.properties?.settings.required).toEqual(['notifications']);
        expect(jsonSchema.properties?.settings.required).not.toContain('theme');
        
        // All objects should have additionalProperties: false
        expect(jsonSchema.additionalProperties).toBe(false);
        expect(jsonSchema.properties?.user.additionalProperties).toBe(false);
        expect(jsonSchema.properties?.settings.additionalProperties).toBe(false);
      });
    });

    describe('Record Type Handling', () => {
      it('should handle record types correctly', () => {
        const recordSchema = z.record(z.string(), z.number());
        const jsonSchema = zodToJsonNostrict(recordSchema);
        
        expect(jsonSchema.type).toBe('object');
        expect(jsonSchema.additionalProperties).toBeDefined();
        expect(jsonSchema.additionalProperties.type).toBe('number');
        
        // Optional record
        const optionalRecordSchema = z.record(z.string(), z.string()).optional();
        const optionalJsonSchema = zodToJsonNostrict(optionalRecordSchema);
        expect(optionalJsonSchema.type).toBe('object');
        expect(optionalJsonSchema.additionalProperties.type).toBe('string');
      });
    });

    describe('Nullable Field Handling', () => {
      it('should treat nullable fields as optional fields, not in required array', () => {
        const zodSchema = z.object({
          name: z.string(),
          age: z.number().nullable(),
          email: z.string().optional().nullable(),
          tags: z.array(z.string()).nullable()
        });

        const jsonSchema = zodToJsonNostrict(zodSchema);
        
        // All nullable fields should not be in required array (treated as optional)
        expect(jsonSchema.required).toContain('name');
        expect(jsonSchema.required).not.toContain('age');
        expect(jsonSchema.required).not.toContain('tags');
        expect(jsonSchema.required).not.toContain('email');
        
        // Nullable fields should keep their original type (not union with null)
        expect(jsonSchema.properties?.age.type).toBe('number');
        expect(jsonSchema.properties?.tags.type).toBe('array');
        expect(jsonSchema.properties?.email.type).toBe('string');
        
        // Test round-trip conversion (nullable fields become optional)
        const roundTripZodSchema = jsonToZodNostrict(jsonSchema);
        
        // With the schema after round trip conversion
        const data = { name: 'John' };
        const result = roundTripZodSchema.safeParse(data);
        expect(result.success).toBe(true);
        
        // Fields that were originally nullable can now be undefined (optional)
        // but not null (they lost their nullable constraint)
        const dataWithUndefined = { 
          name: 'John',
          age: undefined,
          tags: undefined
        };
        expect(roundTripZodSchema.safeParse(dataWithUndefined).success).toBe(true);
        
        // Fields that were originally nullable but now are just optional
        // will reject null values after round trip conversion
        const dataWithNull = { 
          name: 'John',
          age: null,
          tags: null
        };
        
        // Should fail because after conversion nullable fields became optional (accept undefined but not null)
        // This demonstrates the nullable constraint loss in the conversion process
        const nullResult = roundTripZodSchema.safeParse(dataWithNull);
        expect(nullResult.success).toBe(false);
      });
    });

    describe('Round-trip Conversions', () => {
      it('should correctly handle round-trip conversion (Zod -> JSON -> Zod)', () => {
        // Create an original Zod schema with optional, nullable, and record fields
        const originalZodSchema = z.object({
          name: z.string(),
          age: z.number().optional(),
          email: z.string().nullable(), // This will become optional after round trip
          tags: z.array(z.string()).optional(),
          metadata: z.object({}).passthrough(),
          settings: z.object({
            theme: z.enum(['light', 'dark']).optional(),
            notifications: z.boolean()
          }).optional()
        });
        
        // Convert to JSON schema (non-strict)
        const jsonSchema = zodToJsonNostrict(originalZodSchema);
        
        // Verify JSON schema structure
        expect(jsonSchema.type).toBe('object');
        expect(jsonSchema.required).toContain('name');
        // email is nullable so it should NOT be in required array
        expect(jsonSchema.required).not.toContain('email');
        expect(jsonSchema.required).toContain('metadata');
        expect(jsonSchema.required).not.toContain('age');
        expect(jsonSchema.required).not.toContain('tags');
        expect(jsonSchema.required).not.toContain('settings');
        
        // Convert back to Zod
        const roundTripZodSchema = jsonToZodNostrict(jsonSchema);
        
        // Test validation with the round-trip schema
        const validData = {
          name: 'John',
          // email is now optional (not nullable) so it can be omitted
          metadata: { custom: 'value' }
        };
        expect(roundTripZodSchema.safeParse(validData).success).toBe(true);
        
        // Missing required field
        const missingNameData = {
          metadata: {}
        };
        expect(roundTripZodSchema.safeParse(missingNameData).success).toBe(false);
        
        // With optional fields
        const withOptionalData = {
          name: 'John',
          // email is now optional but NOT nullable, so null will fail
          metadata: {},
          age: 30,
          tags: ['one', 'two'],
          settings: {
            notifications: true
          }
        };
        expect(roundTripZodSchema.safeParse(withOptionalData).success).toBe(true);
        
        // Null values should fail for fields that were originally nullable
        // but have become optional after round-trip
        const withNullData = {
          name: 'John',
          email: null, // Will fail because email is now optional but not nullable
          metadata: {}
        };
        expect(roundTripZodSchema.safeParse(withNullData).success).toBe(false);
      });

      it('should correctly handle round-trip conversion (JSON -> Zod -> JSON)', () => {
        // Create an original JSON schema
        const originalJsonSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
            active: { type: 'boolean' },
            tags: { 
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['name', 'active'],
          additionalProperties: false
        };
        
        // Convert to Zod schema
        const zodSchema = jsonToZodNostrict(originalJsonSchema);
        
        // Convert back to JSON
        const roundTripJsonSchema = zodToJsonNostrict(zodSchema);
        
        // Verify structure remains the same
        expect(roundTripJsonSchema.type).toBe('object');
        expect(roundTripJsonSchema.properties).toHaveProperty('name');
        expect(roundTripJsonSchema.properties).toHaveProperty('age');
        expect(roundTripJsonSchema.properties).toHaveProperty('active');
        expect(roundTripJsonSchema.properties).toHaveProperty('tags');
        
        // Required fields preserved
        expect(roundTripJsonSchema.required).toContain('name');
        expect(roundTripJsonSchema.required).toContain('active');
        expect(roundTripJsonSchema.required).not.toContain('age');
        expect(roundTripJsonSchema.required).not.toContain('tags');
        
        // additionalProperties preserved
        expect(roundTripJsonSchema.additionalProperties).toBe(false);
      });
    });
  });

  describe('jsonToZodNostrict', () => {
    it('should convert schema with optional fields correctly', () => {
      const jsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          email: { type: 'string' }
        },
        required: ['name'], // only name is required
        additionalProperties: false
      };

      const zodSchema = jsonToZodNostrict(jsonSchema);
      
      // Test with valid object with required field
      expect(zodSchema.safeParse({ name: 'John' }).success).toBe(true);
      
      // Test with valid object with all fields
      expect(zodSchema.safeParse({ name: 'John', age: 30, email: 'john@example.com' }).success).toBe(true);
      
      // Test with missing required field
      expect(zodSchema.safeParse({ age: 30 }).success).toBe(false);
      
      // Test with additional fields (should fail with strict)
      expect(zodSchema.safeParse({ name: 'John', extra: 'field' }).success).toBe(false);
    });

    it('should handle record-like schemas (objects with additionalProperties)', () => {
      const jsonSchema = {
        type: 'object',
        additionalProperties: { type: 'string' },
      };

      const zodSchema = jsonToZodNostrict(jsonSchema);
      
      // Test with valid record
      expect(zodSchema.safeParse({ key1: 'value1', key2: 'value2' }).success).toBe(true);
      
      // Test with invalid value type
      expect(zodSchema.safeParse({ key1: 123 }).success).toBe(false);
    });

    it('should handle passthrough objects when additionalProperties is not false', () => {
      const jsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        required: ['name'],
        // additionalProperties not specified, defaults to true/passthrough
      };

      const zodSchema = jsonToZodNostrict(jsonSchema);
      
      // Test with additional properties (should pass with passthrough)
      expect(zodSchema.safeParse({ name: 'John', extra: 'field' }).success).toBe(true);
    });

    it('should handle nested objects', () => {
      const jsonSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' }
            },
            required: ['name'],
            additionalProperties: false
          },
          settings: {
            type: 'object',
            properties: {
              theme: { type: 'string' }
            },
            additionalProperties: true
          }
        },
        required: ['user'],
        additionalProperties: false
      };

      const zodSchema = jsonToZodNostrict(jsonSchema);
      
      // Valid case
      expect(zodSchema.safeParse({
        user: { name: 'John' },
        settings: { theme: 'dark', extra: true }
      }).success).toBe(true);
      
      // Missing required nested field
      expect(zodSchema.safeParse({
        user: { age: 30 }, // name is missing
        settings: { theme: 'dark' }
      }).success).toBe(false);
      
      // Extra field in strict nested object
      expect(zodSchema.safeParse({
        user: { name: 'John', extra: 'field' },
        settings: { theme: 'dark' }
      }).success).toBe(false);
    });
  });
}); 