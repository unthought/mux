import { Command } from "commander";
import { Readable, Writable } from "node:stream";
import assert from "@/common/utils/assert";
import { detectCliEnvironment, getParseOptions } from "./argv";
import { MuxAcpAgent } from "./acp/MuxAcpAgent";
import { loadAcpSdk } from "./acp/acpSdk";
import { createOrpcWsClient } from "./acp/orpcWsClient";
import { discoverOrSpawnServer, type ServerConnection } from "./acp/serverDiscovery";

interface AcpCliOptions {
  serverUrl?: string;
  authToken?: string;
  unstable: boolean;
  logStderr: boolean;
}

async function main(options: AcpCliOptions): Promise<void> {
  assert(options != null, "ACP CLI options are required");

  const logStderr = options.logStderr
    ? (...args: unknown[]) => console.error("[mux-acp]", ...args)
    : () => undefined;

  if (options.unstable) {
    logStderr("--unstable enabled (no unstable ACP methods are implemented yet)");
  }

  let serverConnection: ServerConnection | undefined;
  let orpcClient: ReturnType<typeof createOrpcWsClient> | undefined;
  let cleanupStarted = false;

  const cleanup = async () => {
    if (cleanupStarted) {
      return;
    }
    cleanupStarted = true;

    try {
      orpcClient?.close();
    } catch (error) {
      console.error("Failed to close oRPC client:", error);
    }

    try {
      await serverConnection?.dispose?.();
    } catch (error) {
      console.error("Failed to dispose in-process server:", error);
    }
  };

  const shutdownAndExit = async (exitCode: number) => {
    await cleanup();
    process.exit(exitCode);
  };

  try {
    serverConnection = await discoverOrSpawnServer({
      serverUrl: options.serverUrl,
      authToken: options.authToken,
    });
    logStderr(`Using server ${serverConnection.baseUrl}`);

    orpcClient = createOrpcWsClient({
      baseUrl: serverConnection.baseUrl,
      authToken: serverConnection.authToken,
    });
    logStderr("oRPC WebSocket client ready");

    const acp = await loadAcpSdk();
    const input = Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>;
    const output = Writable.toWeb(process.stdout) as unknown as WritableStream<Uint8Array>;
    const stream = acp.ndJsonStream(output, input);

    const readyOrpcClient = orpcClient;
    assert(
      readyOrpcClient != null,
      "oRPC client must be initialized before creating ACP connection"
    );

    const connection = new acp.AgentSideConnection(
      (conn) =>
        new MuxAcpAgent({
          conn,
          sdk: acp,
          orpcClient: readyOrpcClient.client,
          unstable: options.unstable,
          log: logStderr,
        }),
      stream
    );
    logStderr("ACP bridge established");

    process.on("SIGINT", () => {
      void shutdownAndExit(0);
    });
    process.on("SIGTERM", () => {
      void shutdownAndExit(0);
    });

    await connection.closed;
  } finally {
    await cleanup();
  }
}

const env = detectCliEnvironment();
const program = new Command();

program
  .name("mux acp")
  .description("Run an ACP (Agent Client Protocol) stdio bridge to a Mux server")
  .option("--server-url <url>", "Mux server URL (overrides discovery)")
  .option("--auth-token <token>", "Mux server auth token")
  .option("--unstable", "Enable experimental ACP methods", false)
  .option("--log-stderr", "Enable verbose logging to stderr", false)
  .parse(process.argv, getParseOptions(env));

const options = program.opts<AcpCliOptions>();

void main(options).catch((error) => {
  console.error("Failed to start ACP bridge:", error);
  process.exit(1);
});
