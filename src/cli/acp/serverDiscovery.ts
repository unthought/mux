import assert from "@/common/utils/assert";
import { getMuxHome } from "@/common/constants/paths";
import { Config } from "@/node/config";
import { createOrpcServer } from "@/node/orpc/server";
import { ServerLockfile } from "@/node/services/serverLockfile";
import { ServiceContainer } from "@/node/services/serviceContainer";

export interface ServerConnection {
  baseUrl: string;
  authToken: string | undefined;
  /** If we spawned an in-process server, call this to clean up resources. */
  dispose?: () => Promise<void>;
}

export interface DiscoverServerOptions {
  serverUrl?: string;
  authToken?: string;
}

function normalizeOptionalToken(token: string | undefined): string | undefined {
  const trimmed = token?.trim();
  return trimmed?.length ? trimmed : undefined;
}

const HEALTH_CHECK_TIMEOUT_MS = 3_000;

/**
 * Probe whether a Mux server is actually listening by fetching its health
 * endpoint. Returns false on any network error or timeout so callers can
 * fall through to alternative discovery strategies.
 */
async function isServerReachable(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export async function discoverOrSpawnServer(
  options: DiscoverServerOptions
): Promise<ServerConnection> {
  assert(options != null, "discoverOrSpawnServer options are required");

  // Priority 1: explicit CLI flag
  const explicitServerUrl = options.serverUrl?.trim();
  if (explicitServerUrl) {
    return {
      baseUrl: explicitServerUrl,
      // When --server-url is explicitly provided, only use --auth-token.
      // Do not fall back to MUX_SERVER_AUTH_TOKEN to avoid leaking
      // ambient env tokens to unrelated hosts.
      authToken: normalizeOptionalToken(options.authToken),
    };
  }

  // Priority 2: environment variables
  const envServerUrl = process.env.MUX_SERVER_URL?.trim();
  if (envServerUrl) {
    return {
      baseUrl: envServerUrl,
      authToken: normalizeOptionalToken(options.authToken ?? process.env.MUX_SERVER_AUTH_TOKEN),
    };
  }

  // Priority 3: lockfile discovery — verify the endpoint is reachable before
  // committing to it, so stale lockfiles (e.g. after a crash) fall through to
  // the in-process spawn path instead of leaving `mux acp` targeting a dead URL.
  try {
    const lockfile = new ServerLockfile(getMuxHome());
    const data = await lockfile.read();
    if (data) {
      assert(data.baseUrl.trim().length > 0, "Server lockfile baseUrl must not be empty");

      const reachable = await isServerReachable(data.baseUrl);
      if (reachable) {
        return {
          baseUrl: data.baseUrl,
          authToken: normalizeOptionalToken(options.authToken ?? data.token),
        };
      }
      // Server unreachable — fall through to in-process spawn.
    }
  } catch {
    // Ignore discovery errors and fallback to spawning.
  }

  // Priority 4: spawn in-process server
  return spawnInProcessServer();
}

async function spawnInProcessServer(): Promise<ServerConnection> {
  const config = new Config();
  const container = new ServiceContainer(config);
  await container.initialize();

  let server: Awaited<ReturnType<typeof createOrpcServer>>;
  try {
    server = await createOrpcServer({
      host: "127.0.0.1",
      port: 0,
      context: container.toORPCContext(),
    });
  } catch (error) {
    await container.dispose().catch(() => undefined);
    throw error;
  }

  assert(server.baseUrl.trim().length > 0, "In-process server returned an empty baseUrl");

  let disposed = false;

  return {
    baseUrl: server.baseUrl,
    authToken: undefined,
    dispose: async () => {
      if (disposed) {
        return;
      }
      disposed = true;

      const [serverCloseResult, containerDisposeResult] = await Promise.allSettled([
        server.close(),
        container.dispose(),
      ]);

      if (serverCloseResult.status === "rejected") {
        throw serverCloseResult.reason;
      }

      if (containerDisposeResult.status === "rejected") {
        throw containerDisposeResult.reason;
      }
    },
  };
}
