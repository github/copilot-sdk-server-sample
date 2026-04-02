import { useEffect, useState } from "react";
import { Moon, Sun, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CopilotIcon } from "@/components/CopilotIcon";

function getInitialTheme(): "light" | "dark" {
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function Header() {
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <header className="sticky top-0 z-10 flex items-center border-b border-border bg-black/5 dark:bg-white/5 px-8 py-3">
      <div className="flex items-center gap-2 text-m">
        <CopilotIcon className="size-5" />
        <span className="font-semibold">GitHub Copilot SDK</span>
        <span className="text-muted-foreground">Session Server Sample</span>
      </div>
      <div className="flex-1" />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" asChild aria-label="New session" className="text-muted-foreground hover:text-foreground">
              <a href="/sessions/new">
                <SquarePen className="size-5" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>New session</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle dark mode"
            >
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </header>
  );
}
