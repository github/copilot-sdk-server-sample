import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  ChatContainerRoot,
  ChatContainerContent,
} from "@/components/ui/chat-container";
import { Message, MessageContent } from "@/components/ui/message";
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input";
import { Button } from "@/components/ui/button";
import { Tool } from "@/components/ui/tool";
import { ThinkingBar } from "@/components/ui/thinking-bar";
import {
  ChainOfThought,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
  ChainOfThoughtContent,
} from "@/components/ui/chain-of-thought";
import { Header } from "./Header";
import { CopilotIcon } from "@/components/CopilotIcon";
import { useChat } from "./hooks/useChat";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { ArrowUp, Wrench, Loader2, ExternalLink } from "lucide-react";

export default function ChatPage() {
  const { sessionId } = useParams();
  const { timeline, isThinking, currentIntent, submit, ready } = useChat(sessionId);
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    if (!input.trim()) return;
    submit(input);
    setInput("");
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header />
      <ChatContainerRoot className="relative flex-1 space-y-0 overflow-y-auto">
        <ChatContainerContent className="mx-auto w-full max-w-3xl space-y-8 px-4 py-12 md:px-10">
          {timeline.length === 0 && !isThinking && ready ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <CopilotIcon className="size-16 text-muted-foreground/30 mb-6" />
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground/60">
                <a
                  className="underline decoration-dashed decoration-muted-foreground/30 underline-offset-4 transition-colors hover:text-muted-foreground"
                  href="https://github.com/github/copilot-sdk-server-sample"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read docs for this sample
                </a>
                <span>or ask me how it works</span>
              </div>
            </div>
          ) : (
          <>
          {timeline.map((item, idx) => {
            const prevItem = idx > 0 ? timeline[idx - 1] : null;
            switch (item.kind) {
              case "user":
                return (
                  <Message key={item.id} className="animate-[fade-in_0.4s_ease-out] flex w-full flex-col items-end gap-2">
                    <div className="flex w-full flex-col items-end gap-1">
                      <MessageContent className="bg-muted text-primary max-w-[85%] rounded-3xl px-5 py-2.5 whitespace-pre-wrap sm:max-w-[75%]">
                        {item.content}
                      </MessageContent>
                    </div>
                  </Message>
                );

              case "tool_group":
                return (
                  <div key={item.toolCalls[0].toolCallId} className="animate-[fade-in_0.4s_ease-out] w-full" style={{ marginBottom: "1.5rem" }}>
                    <ChainOfThought className="w-full">
                      {item.toolCalls.map((tc, i) => (
                        <ChainOfThoughtStep
                          key={tc.toolCallId}
                          isLast={i === item.toolCalls.length - 1}
                        >
                          <ChainOfThoughtTrigger leftIcon={tc.success == null ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />}>
                            {tc.success == null ? (
                              <TextShimmer>{tc.displayName ?? tc.toolName}</TextShimmer>
                            ) : (
                              tc.displayName ?? tc.toolName
                            )}
                          </ChainOfThoughtTrigger>
                          <ChainOfThoughtContent>
                            <Tool
                              toolPart={{
                                type: tc.toolName,
                                state: tc.success === false ? "output-error" : tc.result ? "output-available" : "input-streaming",
                                input: tc.input,
                                output: tc.result as Record<string, unknown> | undefined,
                                errorText: tc.error,
                                toolCallId: tc.toolCallId,
                              }}
                              defaultOpen
                            />
                          </ChainOfThoughtContent>
                        </ChainOfThoughtStep>
                      ))}
                    </ChainOfThought>
                  </div>
                );

              case "assistant":
                return (
                  <Message key={item.id} className="animate-[fade-in_0.4s_ease-out] flex w-full flex-col items-start gap-2">
                    <div className="flex w-full flex-col gap-0">
                      <MessageContent
                        className="text-foreground prose dark:prose-invert w-full min-w-0 flex-1 rounded-lg bg-transparent p-0"
                        markdown
                      >
                        {item.content}
                      </MessageContent>
                    </div>
                  </Message>
                );

              case "command_result": {
                const r = item.result as { stdout?: string; stderr?: string; exitCode?: number };
                const cmd = item.command;
                return (
                  <div key={item.id} className="animate-[fade-in_0.4s_ease-out] w-full overflow-hidden rounded-lg bg-[#1e1e1e] text-sm font-mono">
                    {cmd && (
                      <div className="border-b border-white/10 px-4 py-2 text-green-400">
                        <span className="text-gray-500">$ </span>{cmd}
                      </div>
                    )}
                    {(r.stdout || r.stderr) && (
                      <pre className="overflow-x-auto px-4 py-3 text-gray-200 whitespace-pre-wrap">
                        {r.stdout || ""}{r.stderr && <span className="text-red-400">{r.stderr}</span>}
                      </pre>
                    )}
                    {r.exitCode != null && r.exitCode !== 0 && (
                      <div className="border-t border-white/10 px-4 py-1.5 text-xs text-red-400">
                        exit code {r.exitCode}
                      </div>
                    )}
                  </div>
                );
              }
            }
          })}

          {isThinking && (
            <Message className="flex w-full flex-col items-start gap-2">
              <div className="flex w-full flex-col gap-0">
                <ThinkingBar text={currentIntent} onClick={() => {}} />
              </div>
            </Message>
          )}
          </>
          )}
        </ChatContainerContent>
      </ChatContainerRoot>

      <div className="border-t border-border bg-background mx-auto w-full max-w-3xl px-3 pb-3 pt-3 md:px-5 md:pb-5">
        <PromptInput
          value={input}
          onValueChange={setInput}
          onSubmit={handleSubmit}
          className="relative z-10 w-full"
        >
          <div className="flex flex-col">
            <PromptInputTextarea
              placeholder="Ask anything"
              autoFocus
              className="min-h-[44px] pt-3 pl-4 text-base leading-[1.3] sm:text-base md:text-base"
            />
            <PromptInputActions className="mt-3 flex w-full items-center justify-between gap-2 p-2">
              <div />
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  disabled={!input.trim()}
                  onClick={handleSubmit}
                  className="size-9 rounded-full"
                >
                  <ArrowUp size={18} />
                </Button>
              </div>
            </PromptInputActions>
          </div>
        </PromptInput>
      </div>
    </div>
  );
}
