import { WebSocketServer } from "ws";
import type { Server } from "http";
import type { ClientCommand } from "./protocol.js";
import { approveAll, CopilotClient, CopilotSession, SessionConfig } from "@github/copilot-sdk";
import { ConnectionTracker } from "./connectionTracker.js";
import { join } from "path";
import { validate as validateUuid } from "uuid";
import { createDiskStorageProvider } from "./storage/diskStorageProvider.js";
import { createInMemoryStorageProvider } from "./storage/inMemoryStorageProvider.js";
import { createEnvironment } from "./environments/index.js";
import { sessionFsConfig } from "./sessionFsConfig.js";
import { SessionEnvironment } from "./environments/types.js";
import { restoreSessionFromFilestore, syncSessionToFilestore } from "./sessionSync.js";
const sessionsDir = join(process.cwd(), "sessions");

// Pick a storage provider
const inMemory = process.env.USE_IN_MEMORY_VFS === "true";
const enableSync = !inMemory;
const storage = inMemory
    ? createInMemoryStorageProvider()
    : createDiskStorageProvider(sessionsDir);

// Create a Copilot runtime instance
const copilotClient = new CopilotClient({
    gitHubToken: process.env.GITHUB_TOKEN,
    mode: "empty",
    sessionFs: sessionFsConfig,
});

// Keep track of active sessions and their associated WebSocket connections
const connectionManager = new ConnectionTracker(createOrResumeSession, releaseSessionResources);

// Keep track of each session's environment so we can dispose of it (e.g. stop a container) when
// the session ends
const activeEnvironments = new Map<string, SessionEnvironment>();

export function attachWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/api/chat" });

  wss.on("connection", async (ws, req) => {
    // Work out which sessionId this connection wants to talk to, if any
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const requestedSessionId = url.searchParams.get("sessionId");
    if (requestedSessionId && requestedSessionId !== "new" && !validateUuid(requestedSessionId)) {
      ws.close();
      return;
    }
    
    // Connect (or create) the session, and associate it with this WebSocket connection
    const session = await connectionManager.connect(ws, requestedSessionId);
    if (!session) {
      await storage.deleteSession(requestedSessionId!);
      ws.send(JSON.stringify({ type: "session.not_found", sessionId: requestedSessionId }));
      ws.close();
      return;
    }

    ws.on("close", () => connectionManager.disconnect(session, ws));
    
    // Accept commands from the client
    ws.on("message", async (data) => {
      let command: ClientCommand;
      try {
        command = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (command.type === "user.submit") {
        if (command.content.startsWith("!")) {
          // Bang commands go directly into the environment's bash, bypassing the agent
          const cmd = command.content.slice(1).trim();
          const cmdResult = await session.environment.execBangCommand(cmd);
          await ws.send(JSON.stringify({ type: "command.result", command: cmd, result: cmdResult }));
        } else {
          // Any other messages go to the agent
          await session.send({ prompt: command.content });
        }
      }
    });
  });
}

// Invoked by ConnectionTracker when the first WebSocket connection is made for a session ID
// (which may be an existing session or a new one)
async function createOrResumeSession(sessionId: string, shouldResume: boolean) {
  // When resuming, we should be able to retrieve the files from the filestore
  if (shouldResume && enableSync) {
    await restoreSessionFromFilestore(sessionsDir, sessionId);
  }

  // Prepare an environment and corresponding SessionConfig
  const environment = await createEnvironment(sessionId, sessionsDir, storage);
  const sessionConfig: SessionConfig = {
      ...environment.sessionConfig,
      sessionId,
      streaming: true,
      model: "claude-sonnet-4.6",
      reasoningEffort: "low",
      onPermissionRequest: approveAll,
  };

  // Create or resume the session with this config. If this throws, the environment we just
  // created above (e.g. a started container) would otherwise be leaked, so make sure to
  // dispose of it on failure.
  let session: CopilotSession;
  try {
    session = shouldResume
        ? await copilotClient.resumeSession(sessionId, sessionConfig)
        : await copilotClient.createSession(sessionConfig);
  } catch (err) {
    await environment.dispose();
    throw err;
  }
  const sessionWithEnvironment = session as CopilotSession & { environment: SessionEnvironment };
  sessionWithEnvironment.environment = environment;
  activeEnvironments.set(sessionId, environment);

  // Sync the session directory at each turn end
  enableSync && session.on("assistant.turn_end", async() => {
    await syncSessionToFilestore(sessionsDir, sessionId);
  });

  return sessionWithEnvironment;
}

// Invoked by ConnectionTracker when the last WebSocket connection for a session is closed
async function releaseSessionResources(sessionId: string) {
  await activeEnvironments.get(sessionId)?.dispose();
  activeEnvironments.delete(sessionId);
  await storage.deleteSession(sessionId);
}
