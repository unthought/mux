import { Command } from "commander";
import assert from "@/common/utils/assert";
import { log, type LogLevel } from "@/node/services/log";
import { getParseOptions } from "./argv";
import { resolveBackend, type ResolveBackendOpts } from "./acp/backendResolver";
import { createOrpcWsClient, type OrpcWsClientHandle } from "./acp/orpcClient";
import { createAcpConnection } from "./acp/protocol/connection";
import { MuxAcpAgent } from "./acp/protocol/muxAcpAgent";

interface ACPCLIOptions extends ResolveBackendOpts {
  acpUnstable?: boolean;
  logLevel?: string;
}

const program = new Command();
program
  .name("mux acp")
  .description("Run the ACP stdio bridge")
  .option("--server-url <url>", "mux backend base URL (defaults to lockfile or embedded server)")
  .option("--auth-token <token>", "auth token for the mux backend")
  .option("--acp-unstable", "acknowledge ACP support is unstable")
  .option("--log-level <level>", "set log level: error, warn, info, debug")
  .parse(process.argv, getParseOptions());

const options = program.opts<ACPCLIOptions>();

function setLogLevel(level: string | undefined): void {
  if (!level) {
    return;
  }

  const normalized = level.trim().toLowerCase();
  if (
    normalized === "error" ||
    normalized === "warn" ||
    normalized === "info" ||
    normalized === "debug"
  ) {
    log.setLevel(normalized as LogLevel);
    return;
  }

  throw new Error(`Invalid log level "${level}". Expected: error, warn, info, debug`);
}

async function main(): Promise<number> {
  setLogLevel(options.logLevel);

  if (!options.acpUnstable) {
    console.error("[mux acp] ACP is experimental. Pass --acp-unstable to acknowledge this mode.");
  }

  const backend = await resolveBackend({
    serverUrl: options.serverUrl,
    authToken: options.authToken,
  });
  assert(backend.baseUrl.length > 0, "Resolved backend must include baseUrl");
  assert(backend.wsUrl.length > 0, "Resolved backend must include wsUrl");

  // Emit lifecycle info to stderr so ACP protocol traffic remains exclusively on stdout.
  console.error(`[mux acp] using ${backend.kind} backend at ${backend.baseUrl}`);

  let exitCode = 0;
  let clientHandle: OrpcWsClientHandle | null = null;

  const closeClient = () => {
    if (!clientHandle) {
      return;
    }

    clientHandle.close();
    clientHandle = null;
  };

  const stopOnSignal = (signalCode: number) => {
    exitCode = signalCode;
    closeClient();
    if (!process.stdin.destroyed) {
      process.stdin.destroy();
    }
  };

  const onSigint = () => stopOnSignal(130);
  const onSigterm = () => stopOnSignal(143);
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    clientHandle = createOrpcWsClient(backend.wsUrl, backend.token);

    const connection = createAcpConnection(
      (conn) =>
        new MuxAcpAgent(conn, clientHandle!.client, {
          unstable: Boolean(options.acpUnstable),
        })
    );

    await connection.closed;
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);

    closeClient();

    if (backend.kind === "embedded") {
      await backend.close();
    }
  }

  return exitCode;
}

main()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mux acp] failed: ${message}`);
    if (error instanceof Error && log.isDebugMode() && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
