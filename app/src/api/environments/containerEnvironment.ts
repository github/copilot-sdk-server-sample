import { SessionConfig, ToolSet, BuiltInTools, defineTool } from "@github/copilot-sdk";
import { z } from "zod";
import { createContainerFs } from "../containerFs";
import { SessionContainer } from "../docker/sessionContainer";
import { StorageProvider } from "../storage/storageProvider";
import { ExecResult, SessionEnvironment } from "./types";

// An alternative session environment: each session gets its own small, disposable Linux
// container (built from app/session-image/Dockerfile) instead of an in-process simulation.
// The session's directory on disk is bind-mounted read-write into the container at
// /workspace, so file tools (wired up via containerFs.ts) and the bash tool both operate on
// the same real files. Requires Docker to be installed and running - see README "Switching to
// container-based isolation".

export async function createContainerEnvironment(sessionId: string, sessionsRootDir: string, storage: StorageProvider): Promise<SessionEnvironment> {
    const sessionDir = storage.getSessionDir(sessionId);
    const fs = createContainerFs(sessionDir);

    const container = new SessionContainer(sessionsRootDir, sessionDir, sessionId);
    await container.start();

    const bashTools = [
        defineTool("bash", {
            description: `Runs a bash command in an interactive bash session.`,
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

    const sessionConfig: Partial<SessionConfig> = {
        availableTools: new ToolSet()
            .addBuiltIn(BuiltInTools.Isolated)
            .addCustom("*"),
        tools: [...bashTools],
        createSessionFsProvider: () => fs,
        systemMessage: {
            mode: "customize",
            sections: {
                identity: {
                    action: "replace",
                    content: `You are an assistant called "The Session Server Sample Agent". Your purpose is to
                    help the user with any tasks they have, using the tools available to you.

                    If the user asks you about this app and how it works, use the web_fetch tool to retrieve
                    information from the README.md on https://github.com/github/copilot-sdk-server-sample.
                    That's also where your own source code lives, so you can read it to get more detailed information
                    about how this sample works. Useful talking points about this sample:
                     - Each session has an isolated filesystem and a Bash tool that runs commands inside a small,
                       disposable Linux container dedicated to that session
                     - The user can ask you to write Python scripts or invoke curl (which is limited to preconfigured hosts)
                     - They can use \`!<command>\` to run any bash command directly (e.g., \`!ls -la /\`)
                     - They can open the same session in multiple browser tabs and see updates stream to all of them
                    `
                },

                // TODO: Instead of doing a "replace" here, consider assigning totally separate system prompt, not using the
                // built-in coding agent prompt. The coding agent system prompt contains some information about the host (including
                // <session_context> that refers to paths on the host), and heavily tunes it towards programming tasks.
                environment_context: {
                    action: "replace",
                    content: `
                        Within this environment, there is a \`python\` command but it has limitations:
                        - It can't access the network directly. If you need to make HTTP requests, use \`curl\`.
                        - It can't accept input from stdin. If you want to use \`python\` to process data, you must write the data to a temp file first.
                        Other tools like \`jq\` can be used for processing data as well, and they don't have these limitations.

                        You are not in a Git repostitory. You are in an isolated environment with its own filesystem
                        (a directory on the server, bind-mounted into your own dedicated Linux container).
                        Use the filesystem as a working environment in which to store any files needed to complete your tasks.
                    `
                },
            },
        }
    };

    return {
        sessionConfig,
        execBangCommand: (command: string): Promise<ExecResult> => container.exec(command),
        dispose: () => container.stop(),
    };
}
