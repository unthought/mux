import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "bun:test";

import type { ProvidersConfig } from "@/node/config";
import { hasAnyConfiguredProvider, resolveProviderCredentials } from "./providerRequirements";

describe("hasAnyConfiguredProvider", () => {
  it("returns false for null or empty config", () => {
    expect(hasAnyConfiguredProvider(null)).toBe(false);
    expect(hasAnyConfiguredProvider({})).toBe(false);
  });

  it("returns true when a provider has an API key", () => {
    const providers: ProvidersConfig = {
      anthropic: { apiKey: "sk-ant-test" },
    };

    expect(hasAnyConfiguredProvider(providers)).toBe(true);
  });

  it("returns true for OpenAI Codex OAuth-only configuration", () => {
    const providers: ProvidersConfig = {
      openai: {
        codexOauth: {
          type: "oauth",
          access: "test-access-token",
          refresh: "test-refresh-token",
          expires: Date.now() + 60_000,
          accountId: "acct_123",
        },
      },
    };

    expect(hasAnyConfiguredProvider(providers)).toBe(true);
  });

  it("returns true for keyless providers with explicit config", () => {
    const providers: ProvidersConfig = {
      ollama: {
        baseUrl: "http://localhost:11434/api",
      },
    };

    expect(hasAnyConfiguredProvider(providers)).toBe(true);
  });
});

describe("resolveProviderCredentials - apiKeyFile", () => {
  let tmpDir: string;
  let keyFilePath: string;

  function setup(content: string) {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "mux-test-"));
    keyFilePath = path.join(tmpDir, "api-key");
    writeFileSync(keyFilePath, content, "utf-8");
  }

  function cleanup() {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }

  it("resolves apiKeyFile when apiKey is not set", () => {
    setup("sk-from-file");
    try {
      const result = resolveProviderCredentials("anthropic", { apiKeyFile: keyFilePath }, {});
      expect(result.isConfigured).toBe(true);
      expect(result.apiKey).toBe("sk-from-file");
    } finally {
      cleanup();
    }
  });

  it("apiKey takes precedence over apiKeyFile", () => {
    setup("sk-from-file");
    try {
      const result = resolveProviderCredentials(
        "anthropic",
        { apiKey: "sk-from-config", apiKeyFile: keyFilePath },
        {}
      );
      expect(result.apiKey).toBe("sk-from-config");
    } finally {
      cleanup();
    }
  });

  it("apiKeyFile takes precedence over env vars", () => {
    setup("sk-from-file");
    try {
      const result = resolveProviderCredentials(
        "anthropic",
        { apiKeyFile: keyFilePath },
        { ANTHROPIC_API_KEY: "sk-from-env" }
      );
      expect(result.apiKey).toBe("sk-from-file");
    } finally {
      cleanup();
    }
  });

  it("falls back to env vars when apiKeyFile does not exist", () => {
    const result = resolveProviderCredentials(
      "anthropic",
      { apiKeyFile: "/nonexistent/path/key" },
      { ANTHROPIC_API_KEY: "sk-from-env" }
    );
    expect(result.apiKey).toBe("sk-from-env");
  });

  it("falls back to env vars when file is empty", () => {
    setup("");
    try {
      const result = resolveProviderCredentials(
        "anthropic",
        { apiKeyFile: keyFilePath },
        { ANTHROPIC_API_KEY: "sk-from-env" }
      );
      expect(result.apiKey).toBe("sk-from-env");
    } finally {
      cleanup();
    }
  });

  it("supports ~ expansion for home directory", () => {
    // Use a unique filename to avoid collisions with parallel test runs
    const uniqueName = `.mux-test-api-key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const homeKeyFile = path.join(os.homedir(), uniqueName);
    writeFileSync(homeKeyFile, "sk-from-home", "utf-8");
    try {
      const result = resolveProviderCredentials("anthropic", { apiKeyFile: `~/${uniqueName}` }, {});
      expect(result.isConfigured).toBe(true);
      expect(result.apiKey).toBe("sk-from-home");
    } finally {
      rmSync(homeKeyFile, { force: true });
    }
  });
});
