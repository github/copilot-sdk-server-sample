import { defineTool, Tool } from "@github/copilot-sdk";
import { z } from "zod";
import { Bash, IFileSystem } from "just-bash";

export function createBash(fs: IFileSystem): { bash: Bash, bashTools: Tool<any>[] } {
    const bash = new Bash({
        cwd: "/",
        network: {
            allowedUrlPrefixes: ["https://api.github.com/"],
        },
        python: true,
        fs,
    });

    const bashTools = [
        defineTool("bash", {
            description: `Runs a bash command in an interactive bash session.`,
            parameters: z.object({
                command: z.string().describe(`The bash command and arguments to run.`),
                description: z.string().describe(`A short human-readable description of what the command does, limited to 100 characters.`),
                shellId: z.string().optional().describe(`(Optional) Identifier for the bash session. If provided, the command will run in that session, reusing any environment variables or state. If not provided, a new session with auto-generated ID will be created. For async mode, the generated shellId is returned and should be used with read_bash, write_bash, and stop_bash.`),
                mode: z.enum(["sync", "async"]).optional().describe(`Execution mode: "sync" runs synchronously and waits for completion (default), "async" runs in the background.`),
                initial_wait: z.number().optional().describe(`(Optional) Time in seconds to wait for initial output when mode is "sync". The command continues running in the background after this time. Default is 30 seconds if not provided.`),
                detach: z.boolean().optional().describe(`(Optional) Only valid when mode="async". If true, the process runs as a fully independent background process that persists even after agent shutdown. If false or omitted, the async process is attached to the session and WILL BE KILLED when session shuts down.`),
            }),
            overridesBuiltInTool: true,
            handler: async ({ command, description, shellId, mode, initial_wait, detach }) => {
                const result = await bash.exec(command);
                return result.exitCode === 0 ? result.stdout : `Exited with code ${result.exitCode}; stderr: ${result.stderr}`;
            },
        })
    ];

    return { bash, bashTools };
}
