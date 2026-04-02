import { useEffect, useRef, useState, useCallback } from "react";
import type { SessionEvent } from "@github/copilot-sdk";
import type { ClientCommand } from "../../api/protocol";

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  displayName?: string;
  input: Record<string, unknown>;
  result?: { content: string };
  error?: string;
  success?: boolean;
}

export type TimelineItem =
  | { kind: "user"; id: string; content: string }
  | { kind: "assistant"; id: string; content: string }
  | { kind: "command_result"; id: string; command?: string; result: unknown }
  | { kind: "tool_group"; toolCalls: ToolCall[] };

export interface UseChatResult {
  timeline: TimelineItem[];
  isThinking: boolean;
  currentIntent: string;
  submit: (content: string) => void;
  connected: boolean;
  ready: boolean;
}

function reduceEvents(events: SessionEvent[], injectedItems: InjectedItem[]): { timeline: TimelineItem[]; isThinking: boolean; currentIntent: string } {
  const timeline: TimelineItem[] = [];
  const allToolCalls = new Map<string, ToolCall>();
  const toolDisplayNames = new Map<string, string>();
  // Track streaming messages by messageId
  const streamingMessages = new Map<string, { idx: number; content: string }>();
  let currentToolGroup: ToolCall[] | null = null;
  let isThinking = false;
  let currentIntent = "Thinking";

  // Sort injected items by position so we can process them in order
  const sortedInjected = [...injectedItems].sort((a, b) => a.afterEventIndex - b.afterEventIndex);
  let injectedIdx = 0;

  for (let eventIdx = 0; eventIdx < events.length; eventIdx++) {
    const event = events[eventIdx];
    switch (event.type) {
      case "session.error":
        console.error("Session error:", event.data);
        break;

        case "user.message":
        currentToolGroup = null;
        currentIntent = "Thinking";
        timeline.push({ kind: "user", id: event.id, content: event.data.content });
        break;

      case "assistant.message_delta": {
        const existing = streamingMessages.get(event.data.messageId);
        if (existing) {
          existing.content += event.data.deltaContent;
          timeline[existing.idx] = { kind: "assistant", id: event.data.messageId, content: existing.content };
        } else {
          currentToolGroup = null;
          const idx = timeline.length;
          const content = event.data.deltaContent;
          timeline.push({ kind: "assistant", id: event.data.messageId, content });
          streamingMessages.set(event.data.messageId, { idx, content });
        }
        break;
      }

      case "assistant.message":
        // Capture display names from tool requests
        if (event.data.toolRequests) {
          for (const tr of event.data.toolRequests) {
            if (tr.intentionSummary) {
              toolDisplayNames.set(tr.toolCallId, tr.intentionSummary);
              const existing = allToolCalls.get(tr.toolCallId);
              if (existing) existing.displayName = tr.intentionSummary;
            }
          }
        }
        if (event.data.content) {
          // Replace streaming placeholder if exists
          const streaming = streamingMessages.get(event.data.messageId);
          if (streaming) {
            timeline[streaming.idx] = { kind: "assistant", id: event.data.messageId, content: event.data.content };
            streamingMessages.delete(event.data.messageId);
          } else {
            currentToolGroup = null;
            timeline.push({ kind: "assistant", id: event.id, content: event.data.content });
          }
        }
        break;

      case "tool.execution_start": {
        if (event.data.toolName === "report_intent") {
          const args = event.data.arguments as { intent?: string } | undefined;
          if (args?.intent) currentIntent = args.intent;
          break;
        }
        const tc: ToolCall = {
          toolCallId: event.data.toolCallId,
          toolName: event.data.toolName,
          displayName: toolDisplayNames.get(event.data.toolCallId),
          input: (event.data.arguments ?? {}) as Record<string, unknown>,
        };
        allToolCalls.set(tc.toolCallId, tc);
        if (!currentToolGroup) {
          currentToolGroup = [];
          timeline.push({ kind: "tool_group", toolCalls: currentToolGroup });
        }
        currentToolGroup.push(tc);
        break;
      }

      case "tool.execution_complete": {
        const tc = allToolCalls.get(event.data.toolCallId);
        if (tc) {
          tc.success = event.data.success;
          if (event.data.success) {
            tc.result = event.data.result;
          } else {
            tc.error = "Tool call failed";
          }
        }
        break;
      }

      case "assistant.turn_start":
        isThinking = true;
        break;

      case "assistant.turn_end":
        isThinking = false;
        break;

      case "session.idle":
        currentIntent = "Thinking";
        break;
    }

    // Inject any items positioned after this event index
    while (injectedIdx < sortedInjected.length && sortedInjected[injectedIdx].afterEventIndex <= eventIdx + 1) {
      timeline.push(sortedInjected[injectedIdx].item);
      injectedIdx++;
    }
  }

  // Append any remaining injected items
  while (injectedIdx < sortedInjected.length) {
    timeline.push(sortedInjected[injectedIdx].item);
    injectedIdx++;
  }

  return { timeline, isThinking, currentIntent };
}

// Items injected at specific positions in the event stream (e.g., command results)
interface InjectedItem {
  afterEventIndex: number;
  item: TimelineItem;
}

export function useChat(sessionId: string | undefined): UseChatResult {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [injectedItems, setInjectedItems] = useState<InjectedItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const eventCountRef = useRef(0);

  useEffect(() => {
    if (!sessionId) return;

    let disposed = false;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/api/chat?sessionId=${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => { if (!disposed) setConnected(true); };
    ws.onclose = () => { if (!disposed) setConnected(false); };

    ws.onmessage = (e) => {
      if (disposed) return;
      try {
        const parsed = JSON.parse(e.data);

        // Handle non-batched messages from the server
        if (!Array.isArray(parsed)) {
          if (parsed.type === "session.not_found") {
            window.location.href = `/sessions/not-found?sessionId=${encodeURIComponent(parsed.sessionId ?? "")}`;
            return;
          }
          if (parsed.type === "command.result") {
            const pos = eventCountRef.current;
            setInjectedItems((prev) => [...prev, {
              afterEventIndex: pos,
              item: { kind: "command_result", id: crypto.randomUUID(), command: parsed.command, result: parsed.result },
            }]);
          }
          return;
        }

        const batch: unknown[] = parsed;
        const newEvents: SessionEvent[] = [];
        for (const data of batch) {
          const event = data as Record<string, unknown>;
          if (event.type === "session.assigned") {
            window.history.replaceState(null, "", `/sessions/${event.sessionId}`);
            setReady(true);
            continue;
          }
          newEvents.push(data as SessionEvent);
        }
        if (newEvents.length > 0) {
          setEvents((prev) => {
            const updated = [...prev, ...newEvents];
            eventCountRef.current = updated.length;
            return updated;
          });
        }
      } catch {
        // ignore malformed
      }
    };

    return () => {
      disposed = true;
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId]);

  const submit = useCallback((content: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      const command: ClientCommand = { type: "user.submit", content };
      ws.send(JSON.stringify(command));
    }
  }, []);

  const { timeline, isThinking, currentIntent } = reduceEvents(events, injectedItems);

  return { timeline, isThinking, currentIntent, submit, connected, ready };
}
