/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { sanitizeToolSchemaForOpenAI, sanitizeMCPToolsForOpenAI } from "./schemaSanitizer";
import type { Tool } from "ai";

// Test helper to access tool parameters
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getParams(tool: Tool): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tool as any).parameters;
}

// Test helper to access tool inputSchema (MCP tools)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getInputSchema(tool: Tool): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inputSchema = (tool as any).inputSchema;
  // inputSchema has a jsonSchema getter
  return inputSchema?.jsonSchema;
}

describe("schemaSanitizer", () => {
  describe("sanitizeToolSchemaForOpenAI", () => {
    it("should strip minLength from string properties", () => {
      const tool = {
        description: "Test tool",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", minLength: 1 },
          },
        },
      } as unknown as Tool;

      const sanitized = sanitizeToolSchemaForOpenAI(tool);
      const params = getParams(sanitized);

      expect(params.properties.content).toEqual({ type: "string" });
      expect(params.properties.content.minLength).toBeUndefined();
    });

    it("should strip multiple unsupported properties", () => {
      const tool = {
        description: "Test tool",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100, pattern: "^[a-z]+$" },
            age: { type: "number", minimum: 0, maximum: 150, default: 25 },
          },
        },
      } as unknown as Tool;

      const sanitized = sanitizeToolSchemaForOpenAI(tool);
      const params = getParams(sanitized);

      expect(params.properties.name).toEqual({ type: "string" });
      expect(params.properties.age).toEqual({ type: "number" });
    });

    it("should handle nested objects", () => {
      const tool = {
        description: "Test tool",
        parameters: {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                email: { type: "string", format: "email", minLength: 5 },
              },
            },
          },
        },
      } as unknown as Tool;

      const sanitized = sanitizeToolSchemaForOpenAI(tool);
      const params = getParams(sanitized);

      expect(params.properties.user.properties.email).toEqual({ type: "string" });
    });

    it("should handle array items", () => {
      const tool = {
        description: "Test tool",
        parameters: {
          type: "object",
          properties: {
            tags: {
              type: "array",
              items: { type: "string", minLength: 1 },
              minItems: 1,
              maxItems: 10,
            },
          },
        },
      } as unknown as Tool;

      const sanitized = sanitizeToolSchemaForOpenAI(tool);
      const params = getParams(sanitized);

      expect(params.properties.tags.items).toEqual({ type: "string" });
      expect(params.properties.tags.minItems).toBeUndefined();
      expect(params.properties.tags.maxItems).toBeUndefined();
    });

    it("should handle anyOf/oneOf schemas", () => {
      const tool = {
        description: "Test tool",
        parameters: {
          type: "object",
          properties: {
            value: {
              oneOf: [
                { type: "string", minLength: 1 },
                { type: "number", minimum: 0 },
              ],
            },
          },
        },
      } as unknown as Tool;

      const sanitized = sanitizeToolSchemaForOpenAI(tool);
      const params = getParams(sanitized);

      expect(params.properties.value.oneOf[0]).toEqual({ type: "string" });
      expect(params.properties.value.oneOf[1]).toEqual({ type: "number" });
    });

    it("should preserve required and type properties", () => {
      const tool = {
        description: "Test tool",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", minLength: 1 },
          },
          required: ["content"],
        },
      } as unknown as Tool;

      const sanitized = sanitizeToolSchemaForOpenAI(tool);
      const params = getParams(sanitized);

      expect(params.type).toBe("object");
      expect(params.required).toEqual(["content"]);
    });

    it("should return tool as-is if no parameters", () => {
      const tool = {
        description: "Test tool",
      } as unknown as Tool;

      const sanitized = sanitizeToolSchemaForOpenAI(tool);

      expect(sanitized).toEqual(tool);
    });

    it("should not mutate the original tool", () => {
      const tool = {
        description: "Test tool",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", minLength: 1 },
          },
        },
      } as unknown as Tool;

      sanitizeToolSchemaForOpenAI(tool);
      const params = getParams(tool);

      // Original should still have minLength
      expect(params.properties.content.minLength).toBe(1);
    });

    it("should sanitize MCP tools with inputSchema", () => {
      // MCP tools use inputSchema with a jsonSchema getter instead of parameters
      const jsonSchema = {
        type: "object",
        properties: {
          content: { type: "string", minLength: 1, maxLength: 100 },
          count: { type: "number", minimum: 0, maximum: 10 },
        },
        required: ["content"],
      };

      const mcpTool = {
        type: "dynamic",
        description: "MCP test tool",
        inputSchema: {
          // Simulate the jsonSchema getter that @ai-sdk/mcp creates
          get jsonSchema() {
            return jsonSchema;
          },
        },
        execute: () => Promise.resolve({}),
      } as unknown as Tool;

      const sanitized = sanitizeToolSchemaForOpenAI(mcpTool);
      const schema = getInputSchema(sanitized);

      // Unsupported properties should be stripped
      expect(schema.properties.content).toEqual({ type: "string" });
      // `count` is not required by the MCP schema, so OpenAI strict mode needs
      // a null placeholder while still allowing callers to omit it.
      expect(schema.properties.count).toEqual({ type: ["number", "null"] });
      // Supported properties should be preserved
      expect(schema.type).toBe("object");
      expect(schema.required).toEqual(["content"]);
    });

    it("should make optional MCP properties nullable while preserving required properties", () => {
      const jsonSchema = {
        type: "object",
        properties: {
          body: { type: "string" },
          issueId: { type: "string" },
          statusUpdateType: { type: "string", enum: ["project", "initiative"] },
        },
        required: ["body"],
      };

      const mcpTool = {
        type: "dynamic",
        description: "MCP comment tool",
        inputSchema: {
          get jsonSchema() {
            return jsonSchema;
          },
        },
        execute: () => Promise.resolve({}),
      } as unknown as Tool;

      const sanitized = sanitizeToolSchemaForOpenAI(mcpTool);
      const schema = getInputSchema(sanitized);

      expect(schema.properties.body).toEqual({ type: "string" });
      expect(schema.properties.issueId).toEqual({ type: ["string", "null"] });
      expect(schema.properties.statusUpdateType).toEqual({
        type: ["string", "null"],
        enum: ["project", "initiative", null],
      });
      expect(schema.required).toEqual(["body"]);
    });

    it("should make optional reference and composition schemas nullable", () => {
      const jsonSchema = {
        type: "object",
        properties: {
          body: { type: "string" },
          referencedParent: { $ref: "#/$defs/parentId" },
          composedParent: { allOf: [{ type: "string" }] },
        },
        required: ["body"],
        $defs: {
          parentId: { type: "string" },
        },
      };

      const mcpTool = {
        type: "dynamic",
        description: "MCP comment tool",
        inputSchema: {
          get jsonSchema() {
            return jsonSchema;
          },
        },
        execute: () => Promise.resolve({}),
      } as unknown as Tool;

      const sanitized = sanitizeToolSchemaForOpenAI(mcpTool);
      const schema = getInputSchema(sanitized);

      expect(schema.properties.referencedParent).toEqual({
        anyOf: [{ $ref: "#/$defs/parentId" }, { type: "null" }],
      });
      expect(schema.properties.composedParent).toEqual({
        anyOf: [{ allOf: [{ type: "string" }] }, { type: "null" }],
      });
    });

    it("should omit nullish optional MCP arguments before execution", async () => {
      let receivedArgs: unknown;
      const jsonSchema = {
        type: "object",
        properties: {
          body: { type: "string" },
          requiredNullable: { type: ["string", "null"] },
          issueId: { type: "string" },
          projectId: { type: "string" },
        },
        required: ["body", "requiredNullable"],
      };

      const mcpTool = {
        type: "dynamic",
        description: "MCP comment tool",
        inputSchema: {
          get jsonSchema() {
            return jsonSchema;
          },
        },
        execute: (args: unknown) => {
          receivedArgs = args;
          return Promise.resolve({});
        },
      } as unknown as Tool;

      const sanitized = sanitizeToolSchemaForOpenAI(mcpTool);
      await sanitized.execute!(
        {
          body: "Evidence",
          requiredNullable: null,
          issueId: "UN-220",
          projectId: null,
        },
        {} as never
      );

      expect(receivedArgs).toEqual({
        body: "Evidence",
        requiredNullable: null,
        issueId: "UN-220",
      });
    });

    it("should serialize only the selected Linear comment parent variant", async () => {
      const parentFields = [
        "issueId",
        "projectId",
        "initiativeId",
        "documentId",
        "milestoneId",
        "statusUpdateId",
      ] as const;
      const receivedArgs: unknown[] = [];
      const jsonSchema = {
        type: "object",
        properties: {
          body: { type: "string" },
          issueId: { type: "string" },
          projectId: { type: "string" },
          initiativeId: { type: "string" },
          documentId: { type: "string" },
          milestoneId: { type: "string" },
          statusUpdateId: { type: "string" },
          statusUpdateType: { type: "string", enum: ["project", "initiative"] },
        },
        required: ["body"],
      };

      const mcpTool = {
        type: "dynamic",
        description: "MCP comment tool",
        inputSchema: {
          get jsonSchema() {
            return jsonSchema;
          },
        },
        execute: (args: unknown) => {
          receivedArgs.push(args);
          return Promise.resolve({});
        },
      } as unknown as Tool;

      const sanitized = sanitizeToolSchemaForOpenAI(mcpTool);
      for (const parentField of parentFields) {
        const args: Record<string, unknown> = {
          body: `Comment for ${parentField}`,
          statusUpdateType: parentField === "statusUpdateId" ? "project" : null,
        };
        for (const field of parentFields) {
          args[field] = field === parentField ? `${field}-value` : null;
        }
        await sanitized.execute!(args, {} as never);
      }

      expect(receivedArgs).toEqual(
        parentFields.map((parentField) => ({
          body: `Comment for ${parentField}`,
          [parentField]: `${parentField}-value`,
          ...(parentField === "statusUpdateId" ? { statusUpdateType: "project" } : {}),
        }))
      );
    });

    it("should not mutate the original MCP tool inputSchema", () => {
      const jsonSchema = {
        type: "object",
        properties: {
          content: { type: "string", minLength: 1 },
        },
      };

      const mcpTool = {
        type: "dynamic",
        description: "MCP test tool",
        inputSchema: {
          get jsonSchema() {
            return jsonSchema;
          },
        },
        execute: () => Promise.resolve({}),
      } as unknown as Tool;

      sanitizeToolSchemaForOpenAI(mcpTool);

      // Original should still have minLength
      expect(jsonSchema.properties.content.minLength).toBe(1);
    });
  });

  describe("sanitizeMCPToolsForOpenAI", () => {
    it("should sanitize all tools in a record", () => {
      const tools = {
        tool1: {
          description: "Tool 1",
          parameters: {
            type: "object",
            properties: {
              content: { type: "string", minLength: 1 },
            },
          },
        },
        tool2: {
          description: "Tool 2",
          parameters: {
            type: "object",
            properties: {
              count: { type: "number", minimum: 0 },
            },
          },
        },
      } as unknown as Record<string, Tool>;

      const sanitized = sanitizeMCPToolsForOpenAI(tools);

      expect(getParams(sanitized.tool1).properties.content).toEqual({
        type: "string",
      });
      expect(getParams(sanitized.tool2).properties.count).toEqual({
        type: "number",
      });
    });
  });
});
