import { useSearchParams } from "react-router-dom";
import { Header } from "./Header";

export default function SessionNotFoundPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("sessionId") ?? "unknown";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
        <p className="text-muted-foreground text-center text-sm">
          Session <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{sessionId}</code> is no longer available.
        </p>
        <a
          href="/sessions/new"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Start a new session
        </a>
      </div>
    </div>
  );
}
