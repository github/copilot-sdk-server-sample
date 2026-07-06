import { defineTool, Tool } from "@github/copilot-sdk";
import { z } from "zod";
import { SessionContainer } from "./docker/sessionContainer.js";

export function createBash(container: SessionContainer): { bashTools: Tool<any>[] } {
    const bashTools = [
        defineTool("bash", {
            description: `Runs a bash command in an interactive bash session. The session persists cwd, ` +
                `environment variables, and other shell state across calls. Commands run synchronously: this ` +
                `call does not return until the command finishes.`,
            parameters: z.object({
                command: z.string().describe(`The bash command and arguments to run.`),
                description: z.string().describe(`A short human-readable description of what the command does, limited to 100 characters.`),
            }),
            overridesBuiltInTool: true,
            handler: async ({ command }) => {
                const result = await container.exec(command);
                return result.exitCode === 0 ? result.stdout : `Exited with code ${result.exitCode}; stderr: ${result.stderr}`;
            },
        })
    ];

    return { bashTools };
}
