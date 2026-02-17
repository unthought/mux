import { describe, expect, it } from "bun:test";
import type * as schema from "@agentclientprotocol/sdk";
import { extractPromptText } from "./prompt";

describe("extractPromptText", () => {
  it("extracts text from a simple text message", () => {
    const prompt: schema.ContentBlock[] = [
      {
        type: "text",
        text: "Implement ACP tests",
      },
    ];

    expect(extractPromptText(prompt)).toBe("Implement ACP tests");
  });

  it("concatenates multiple content blocks with spacing", () => {
    const prompt: schema.ContentBlock[] = [
      {
        type: "text",
        text: "First block",
      },
      {
        type: "resource_link",
        name: "README.md",
        title: "Project README",
        uri: "file:///repo/README.md",
      },
      {
        type: "resource",
        resource: {
          uri: "file:///repo/notes.txt",
          text: "Embedded notes",
        },
      },
    ];

    expect(extractPromptText(prompt)).toBe(
      [
        "First block",
        "Referenced resource: Project README (file:///repo/README.md)",
        "Embedded notes",
      ].join("\n\n")
    );
  });

  it("throws when prompt content is empty or whitespace-only", () => {
    expect(() => extractPromptText([])).toThrow(
      "ACP prompt must include at least one non-empty content block"
    );

    expect(() =>
      extractPromptText([
        {
          type: "text",
          text: "   ",
        },
      ])
    ).toThrow("ACP prompt must include at least one non-empty content block");
  });
});
