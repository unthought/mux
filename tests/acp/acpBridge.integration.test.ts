import { beforeAll, describe, expect, test } from "@jest/globals";
import type { Client, Stream } from "@agentclientprotocol/sdk";
import type { AcpSdk } from "../../src/cli/acp/acpSdk";
import { loadAcpSdk } from "../../src/cli/acp/acpSdk";
import { MuxAcpAgent, type MuxAcpAgentDeps } from "../../src/cli/acp/MuxAcpAgent";

interface StreamPair {
  clientStream: Stream;
  agentStream: Stream;
  close: () => Promise<void>;
}

function createStreamPair(): StreamPair {
  const clientToAgent = new TransformStream();
  const agentToClient = new TransformStream();

  const clientToAgentWriter = clientToAgent.writable.getWriter();
  const agentToClientWriter = agentToClient.writable.getWriter();

  return {
    clientStream: {
      readable: agentToClient.readable,
      writable: new WritableStream({
        write: (chunk) => clientToAgentWriter.write(chunk),
        close: () => clientToAgentWriter.close(),
        abort: (reason) => clientToAgentWriter.abort(reason),
      }),
    },
    agentStream: {
      readable: clientToAgent.readable,
      writable: new WritableStream({
        write: (chunk) => agentToClientWriter.write(chunk),
        close: () => agentToClientWriter.close(),
        abort: (reason) => agentToClientWriter.abort(reason),
      }),
    },
    close: async () => {
      await Promise.allSettled([clientToAgentWriter.close(), agentToClientWriter.close()]);
    },
  };
}

function createMockOrpcClient(): MuxAcpAgentDeps["orpcClient"] {
  return new Proxy(
    {},
    {
      get(_target, property) {
        throw new Error(
          `Unexpected oRPC client access during initialize test: ${String(property)}`
        );
      },
    }
  ) as MuxAcpAgentDeps["orpcClient"];
}

function createMockClient(): Client {
  return {
    requestPermission: async () => ({ outcome: { outcome: "cancelled" } }),
    sessionUpdate: async () => {},
  };
}

async function loadSdkForTests(): Promise<AcpSdk> {
  try {
    return await loadAcpSdk();
  } catch {
    // Jest's VM sandbox can reject Function("return import(...)") unless it is
    // started with --experimental-vm-modules. Fall back to a direct import,
    // which babel-jest transpiles for this test environment.
    return import("@agentclientprotocol/sdk");
  }
}

describe("ACP Bridge", () => {
  let acp: AcpSdk;

  beforeAll(async () => {
    acp = await loadSdkForTests();
  });

  test("agent construction and initialization succeed", async () => {
    const streams = createStreamPair();

    const agentConnection = new acp.AgentSideConnection(
      (conn) =>
        new MuxAcpAgent({
          conn,
          sdk: acp,
          orpcClient: createMockOrpcClient(),
          unstable: false,
          log: () => {},
        }),
      streams.agentStream
    );

    const clientConnection = new acp.ClientSideConnection(
      () => createMockClient(),
      streams.clientStream
    );

    try {
      const response = await clientConnection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientInfo: { name: "test-client", version: "1.0.0" },
      });

      expect(response.protocolVersion).toBe(acp.PROTOCOL_VERSION);
      expect(response.agentInfo).toBeDefined();
      expect(response.agentCapabilities).toBeDefined();

      if (response.agentInfo == null || response.agentCapabilities == null) {
        throw new Error("initialize response must include agent info and capabilities");
      }

      expect(response.agentInfo.name).toBe("mux");
      expect(response.agentInfo.version).toBeDefined();
      expect(response.agentCapabilities.loadSession).toBe(true);
      expect(response.agentCapabilities.sessionCapabilities).toBeUndefined();
    } finally {
      await streams.close();
      await Promise.allSettled([clientConnection.closed, agentConnection.closed]);
    }
  });

  test("initialize with unstable flag enables session capabilities", async () => {
    const streams = createStreamPair();

    const agentConnection = new acp.AgentSideConnection(
      (conn) =>
        new MuxAcpAgent({
          conn,
          sdk: acp,
          orpcClient: createMockOrpcClient(),
          unstable: true,
          log: () => {},
        }),
      streams.agentStream
    );

    const clientConnection = new acp.ClientSideConnection(
      () => createMockClient(),
      streams.clientStream
    );

    try {
      const response = await clientConnection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientInfo: { name: "test-client", version: "1.0.0" },
      });

      expect(response.agentCapabilities).toBeDefined();

      if (response.agentCapabilities == null) {
        throw new Error("initialize response must include agent capabilities");
      }

      expect(response.agentCapabilities.sessionCapabilities).toEqual({
        list: {},
        fork: {},
        resume: {},
      });
    } finally {
      await streams.close();
      await Promise.allSettled([clientConnection.closed, agentConnection.closed]);
    }
  });
});
