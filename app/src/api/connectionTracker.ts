import type { CopilotSession, SessionEvent } from "@github/copilot-sdk";
import { WebSocket } from "ws";
import { StorageProvider } from "./storage/storageProvider";

/*
  In the case of a web UI where there might be multiple browser tabs observing the same session, you
  don't want to "resumeSession" separately for each tab (i.e., WebSocket connection). If you did that,
  they would all try to register clashing tool handlers.

  So, this class maintains a single CopilotSession instance per sessionId, and keeps track of which
  WebSocket connections are associated with it, clearing up when the last WebSocket connection closes.
*/

export class ConnectionTracker<T extends CopilotSession> {
  readonly activeSessions = new Map<string, Promise<T>>();
  readonly sessionToWebSockets = new Map<T, Set<WebSocket>>();

  constructor(
    private createOrResume: (sessionId: string, resume: boolean) => Promise<T>,
    private destroy: (sessionId: string) => Promise<void>,
  ) {}

  async connect(ws: WebSocket, resumeSessionId: string | null): Promise<T | undefined> {
    const session = await this.getOrCreateSession(resumeSessionId);
    if (session) {
      // Associate this WebSocket connection with the session
      if (!this.sessionToWebSockets.has(session)) {
        this.sessionToWebSockets.set(session, new Set());
      }
      this.sessionToWebSockets.get(session)!.add(ws);

      // Ensure this WebSocket connection knows the session ID and history so far
      const history = (await session.getMessages()).filter(shouldForward);
      ws.send(JSON.stringify([{ type: "session.assigned", sessionId: session.sessionId }, ...history]));
      
      return session;
    }
  }

  async disconnect(session: T, ws: WebSocket) {
    const connections = this.sessionToWebSockets.get(session);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        this.sessionToWebSockets.delete(session);
        this.activeSessions.delete(session.sessionId);
        await session.disconnect();
        await this.destroy(session.sessionId);
      }
    }
  }

  private forwardEvents(session: T) {
    session.on((e: SessionEvent) => {
      if (shouldForward(e)) {
        const webSockets = this.sessionToWebSockets.get(session);
        if (webSockets) {
          for (const ws of webSockets) {
            sendEvents(ws, [e]);
          }
        }
      }
    });
  }

  private async getOrCreateSession(resumeSessionId: string | null): Promise<T | null> {
    // If this session is already active, just use it
    let sessionPromise = resumeSessionId && this.activeSessions.get(resumeSessionId);
    if (sessionPromise) {
      return sessionPromise;
    }
    
    // Not already active, so begin creating it, and track that promise
    const shouldResume = !!resumeSessionId && resumeSessionId !== "new";
    const sessionId = shouldResume ? resumeSessionId : crypto.randomUUID();
    sessionPromise = this.createOrResume(sessionId, shouldResume);
    this.activeSessions.set(sessionId, sessionPromise);

    let session;
    try {
      // It's now safe to await, since we already tracked activeSessionPromise for subsequent callers
      session = await sessionPromise;
    } catch (e: unknown) {
      // Likely "session not found" if we were trying to resume
      console.error(`Failed to ${shouldResume ? "resume" : "create"} session ${sessionId}: ${(e as Error)?.message}`);
      this.activeSessions.delete(sessionId);
      return null;
    }

    this.forwardEvents(session);
    return session;
  }
}

// Event types we forward to the client
const FORWARDED_EVENTS = new Set([
  "user.message",
  "assistant.message",
  "assistant.message_delta",
  "assistant.turn_start",
  "assistant.turn_end",
  "tool.execution_start",
  "tool.execution_complete",
  "session.idle",
  "session.error", // In production this would disclose too much sensitive info to clients, but for demo it's helpful
]);

function shouldForward(e: SessionEvent): boolean {
  return FORWARDED_EVENTS.has(e.type);
}

function sendEvents(ws: WebSocket, events: SessionEvent[]) {
  ws.send(JSON.stringify(events));
}
