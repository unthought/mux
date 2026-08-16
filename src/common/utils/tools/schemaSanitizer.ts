import { type Tool } from "ai";

/**
 * JSON Schema properties that are not permitted by OpenAI's Responses API.
 *
 * OpenAI's Structured Outputs has stricter JSON Schema validation than other providers.
 * MCP tools may have schemas with these properties which work fine with Anthropic
 * but fail with OpenAI. We strip these properties to ensure compatibility.
 *
 * @see https://platform.openai.com/docs/guides/structured-outputs
 * @see https://github.com/vercel/ai/discussions/5164
 */
const OPENAI_UNSUPPORTED_SCHEMA_PROPERTIES = new Set([
  // String validation
  "minLength",
  "maxLength",
  "pattern",
  "format",
  // Number validation
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  // Array validation
  "minItems",
  "maxItems",
  "uniqueItems",
  // Object validation
  "minProperties",
  "maxProperties",
  // General
  "default",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
  // Composition (partially supported - strip from items/properties)
  // Note: oneOf/anyOf at root level may work, but not in nested contexts
]);

/**
 * Recursively strip unsupported schema properties for OpenAI compatibility.
 * This mutates the schema in place for efficiency.
 */
function stripUnsupportedProperties(schema: unknown): void {
  if (typeof schema !== "object" || schema === null) {
    return;
  }

  const obj = schema as Record<string, unknown>;

  // Remove unsupported properties at this level
  for (const prop of OPENAI_UNSUPPORTED_SCHEMA_PROPERTIES) {
    if (prop in obj) {
      delete obj[prop];
    }
  }

  // Recursively process nested schemas
  if (obj.properties && typeof obj.properties === "object") {
    for (const propSchema of Object.values(obj.properties as Record<string, unknown>)) {
      stripUnsupportedProperties(propSchema);
    }
  }

  if (obj.items) {
    if (Array.isArray(obj.items)) {
      for (const itemSchema of obj.items) {
        stripUnsupportedProperties(itemSchema);
      }
    } else {
      stripUnsupportedProperties(obj.items);
    }
  }

  if (obj.additionalProperties && typeof obj.additionalProperties === "object") {
    stripUnsupportedProperties(obj.additionalProperties);
  }

  // Handle anyOf/oneOf/allOf
  for (const keyword of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(obj[keyword])) {
      for (const subSchema of obj[keyword] as unknown[]) {
        stripUnsupportedProperties(subSchema);
      }
    }
  }

  // Handle definitions/defs (JSON Schema draft-07 and later)
  for (const defsKey of ["definitions", "$defs"]) {
    if (obj[defsKey] && typeof obj[defsKey] === "object") {
      for (const defSchema of Object.values(obj[defsKey] as Record<string, unknown>)) {
        stripUnsupportedProperties(defSchema);
      }
    }
  }
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function addNullToOptionalSchema(schema: unknown): void {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return;
  }

  const obj = schema as Record<string, unknown>;
  if (typeof obj.type === "string") {
    if (obj.type !== "null") {
      obj.type = [obj.type, "null"];
    }
  } else if (isUnknownArray(obj.type)) {
    if (!obj.type.includes("null")) {
      obj.type = [...obj.type, "null"];
    }
  } else if (isUnknownArray(obj.anyOf)) {
    obj.anyOf = [...obj.anyOf, { type: "null" }];
  } else if (isUnknownArray(obj.oneOf)) {
    obj.oneOf = [...obj.oneOf, { type: "null" }];
  } else if (!isUnknownArray(obj.enum)) {
    // `$ref`, `allOf`, `const`, and other valid JSON Schema forms cannot be
    // made nullable by adding a type. Preserve the original schema as one
    // branch and add null as the strict-mode omission placeholder.
    const originalSchema = { ...obj };
    for (const key of Object.keys(obj)) {
      delete obj[key];
    }
    obj.anyOf = [originalSchema, { type: "null" }];
    return;
  }

  // A nullable type is still rejected when enum excludes null.
  if (isUnknownArray(obj.enum) && !obj.enum.includes(null)) {
    obj.enum = [...obj.enum, null];
  }
}

/**
 * Preserve JSON Schema optionality after OpenAI strict-mode normalization.
 * OpenAI requires every object property, so properties omitted from the MCP
 * schema's `required` array must accept null as the strict-mode placeholder.
 */
function makeOptionalPropertiesNullable(schema: unknown): void {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return;
  }

  const obj = schema as Record<string, unknown>;
  if (obj.properties && typeof obj.properties === "object" && !Array.isArray(obj.properties)) {
    const required = new Set(
      Array.isArray(obj.required)
        ? obj.required.filter((value): value is string => typeof value === "string")
        : []
    );

    for (const [name, propertySchema] of Object.entries(
      obj.properties as Record<string, unknown>
    )) {
      makeOptionalPropertiesNullable(propertySchema);
      if (!required.has(name)) {
        addNullToOptionalSchema(propertySchema);
      }
    }
  }

  if (obj.items) {
    if (Array.isArray(obj.items)) {
      for (const itemSchema of obj.items) {
        makeOptionalPropertiesNullable(itemSchema);
      }
    } else {
      makeOptionalPropertiesNullable(obj.items);
    }
  }

  if (obj.additionalProperties && typeof obj.additionalProperties === "object") {
    makeOptionalPropertiesNullable(obj.additionalProperties);
  }

  for (const keyword of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(obj[keyword])) {
      for (const subSchema of obj[keyword] as unknown[]) {
        makeOptionalPropertiesNullable(subSchema);
      }
    }
  }

  for (const defsKey of ["definitions", "$defs"]) {
    if (obj[defsKey] && typeof obj[defsKey] === "object") {
      for (const defSchema of Object.values(obj[defsKey] as Record<string, unknown>)) {
        makeOptionalPropertiesNullable(defSchema);
      }
    }
  }
}

function omitNullishOptionalProperties(value: unknown, schema: unknown): unknown {
  if (Array.isArray(value)) {
    const itemSchema =
      typeof schema === "object" && schema !== null && !Array.isArray(schema)
        ? (schema as Record<string, unknown>).items
        : undefined;
    return value.map((item) => omitNullishOptionalProperties(item, itemSchema));
  }

  if (typeof value !== "object" || value === null || Array.isArray(schema)) {
    return value;
  }

  const schemaObject =
    typeof schema === "object" && schema !== null ? (schema as Record<string, unknown>) : undefined;
  const properties =
    schemaObject?.properties &&
    typeof schemaObject.properties === "object" &&
    !Array.isArray(schemaObject.properties)
      ? (schemaObject.properties as Record<string, unknown>)
      : undefined;
  const required = new Set(
    Array.isArray(schemaObject?.required)
      ? schemaObject.required.filter((entry): entry is string => typeof entry === "string")
      : []
  );

  const result: Record<string, unknown> = {};
  for (const [name, propertyValue] of Object.entries(value as Record<string, unknown>)) {
    const propertySchema = properties?.[name];
    if (propertySchema !== undefined && !required.has(name) && propertyValue == null) {
      continue;
    }
    result[name] = omitNullishOptionalProperties(propertyValue, propertySchema);
  }
  return result;
}

/**
 * Sanitize a tool's parameter schema for OpenAI Responses API compatibility.
 *
 * OpenAI's Responses API has stricter JSON Schema validation than other providers.
 * This function creates a new tool with sanitized parameters that strips
 * unsupported schema properties like minLength, maximum, default, etc.
 *
 * Tools can have schemas in two places:
 * - `parameters`: Used by tools created with ai SDK's `tool()` function
 * - `inputSchema`: Used by MCP tools created with `dynamicTool()` from @ai-sdk/mcp
 *
 * @param tool - The original tool to sanitize
 * @returns A new tool with sanitized parameter schema
 */
export function sanitizeToolSchemaForOpenAI(tool: Tool): Tool {
  // Access tool internals - the AI SDK tool structure varies:
  // - Regular tools have `parameters` (Zod schema)
  // - MCP/dynamic tools have `inputSchema` (JSON Schema wrapper with getter)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolRecord = tool as any as Record<string, unknown>;

  // Check for inputSchema first (MCP tools use this)
  // The inputSchema is a wrapper object with a jsonSchema getter
  if (toolRecord.inputSchema && typeof toolRecord.inputSchema === "object") {
    const inputSchemaWrapper = toolRecord.inputSchema as Record<string, unknown>;

    // Get the actual JSON Schema - it's exposed via a getter
    const rawJsonSchema = inputSchemaWrapper.jsonSchema;
    if (rawJsonSchema && typeof rawJsonSchema === "object") {
      // Deep clone and sanitize
      const clonedSchema = JSON.parse(JSON.stringify(rawJsonSchema)) as Record<string, unknown>;
      stripUnsupportedProperties(clonedSchema);
      makeOptionalPropertiesNullable(clonedSchema);

      // Create a new inputSchema wrapper that returns our sanitized schema.
      const sanitizedInputSchema = {
        ...inputSchemaWrapper,
        // Override the jsonSchema getter with our sanitized version.
        get jsonSchema() {
          return clonedSchema;
        },
      };

      const originalExecute =
        typeof toolRecord.execute === "function"
          ? (toolRecord.execute as (this: unknown, args: unknown, options: unknown) => unknown)
          : undefined;
      return {
        ...tool,
        inputSchema: sanitizedInputSchema,
        ...(originalExecute
          ? {
              // Strict mode represents omitted optional values as null. Remove those
              // placeholders before the MCP SDK serializes the call arguments.
              execute: (args: unknown, options: unknown) =>
                originalExecute.call(
                  tool,
                  omitNullishOptionalProperties(args, rawJsonSchema),
                  options
                ),
            }
          : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any as Tool;
    }
  }

  // Fall back to parameters (regular AI SDK tools)
  if (!toolRecord.parameters) {
    return tool;
  }

  // Deep clone the parameters to avoid mutating the original
  const clonedParams = JSON.parse(JSON.stringify(toolRecord.parameters)) as unknown;

  // Strip unsupported properties
  stripUnsupportedProperties(clonedParams);

  // Create a new tool with sanitized parameters
  return {
    ...tool,
    parameters: clonedParams,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Tool;
}

/**
 * Sanitize all MCP tools for OpenAI compatibility.
 *
 * @param mcpTools - Record of MCP tools to sanitize
 * @returns Record of sanitized tools
 */
export function sanitizeMCPToolsForOpenAI(mcpTools: Record<string, Tool>): Record<string, Tool> {
  const sanitized: Record<string, Tool> = {};
  for (const [name, tool] of Object.entries(mcpTools)) {
    sanitized[name] = sanitizeToolSchemaForOpenAI(tool);
  }
  return sanitized;
}
