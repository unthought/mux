import { AgentSideConnection, ndJsonStream, type Agent } from "@agentclientprotocol/sdk";
import { Readable, Writable } from "stream";

export function createAcpConnection(
  toAgent: (conn: AgentSideConnection) => Agent
): AgentSideConnection {
  const stream = ndJsonStream(
    Writable.toWeb(process.stdout) as unknown as WritableStream<Uint8Array>,
    Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>
  );

  return new AgentSideConnection(toAgent, stream);
}
