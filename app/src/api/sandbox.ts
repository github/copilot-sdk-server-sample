import { CopilotSession, SessionConfig, SessionFsConfig, SessionFsProvider } from "@github/copilot-sdk";
import { Bash, IFileSystem } from "just-bash";
import { createBash } from "./bash";
import { StorageProvider } from "./storage/storageProvider";

// In this sample, a "sandbox" is responsible for creating an isolated filesystem and Bash instance
// and supplies a SessionConfig that configures Copilot to use them.

export function createSandbox(sessionId: string, storage: StorageProvider): { bash: Bash, sessionConfig: Partial<SessionConfig> } {
    const fs = storage.createFileSystem(sessionId);
    const { bash, bashTools } = createBash(fs);

    const sessionConfig: Partial<SessionConfig> = {
        availableTools: ["report_intent", "list_agents", "read_agent", "write_agent", "multi_tool_use.parallel", "web_fetch", ...bashTools.map(t => t.name)],
        tools: [...bashTools],
        createSessionFsHandler: session => createSessionFsProvider(session, fs),
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
                     - Each session has an isolated virtual filesystem and a Bash tool that can interact with it
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

                        You are not in a Git repostitory. You are in an isolated environment with a virtual filesystem.
                        Use the filesystem as a working environment in which to store any files needed to complete your tasks.
                    `
                },
            },
        }
    };

    return { bash, sessionConfig };
}

export const sessionFsConfig: SessionFsConfig = {
    initialCwd: "/",
    sessionStatePath: "/session-state",
    conventions: "posix"
};

// An adapter from a just-bash IFileSystem to the Copilot runtime SessionFsConfig interface
function createSessionFsProvider(session: CopilotSession, fileSystem: IFileSystem): SessionFsProvider {
    return {
        readFile: async (path) => {
            // The just-bash fs doesn't throw Node-style exceptions so we need to do that manually
            if (!await fileSystem.exists(path)) {
                const ex = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException;
                ex.code = "ENOENT";
                ex.path = path;
                throw ex;
            }
            return fileSystem.readFile(path);
        },
        writeFile: (path, content) => fileSystem.writeFile(path, content),
        appendFile: (path, content) => fileSystem.appendFile(path, content),
        exists: (path) => fileSystem.exists(path),
        stat: async (path) => {
            const st = await fileSystem.stat(path);
            return {
                isFile: st.isFile,
                isDirectory: st.isDirectory,
                size: st.size,
                mtime: st.mtime.toISOString(),
                birthtime: st.mtime.toISOString(),
            };
        },
        mkdir: (path, recursive) => fileSystem.mkdir(path, { recursive }),
        readdir: (path) => fileSystem.readdir(path),
        readdirWithTypes: async (path) => {
            const names = await fileSystem.readdir(path);
            return await Promise.all(
                names.map(async (name) => {
                    const st = await fileSystem.stat(`${path}/${name}`);
                    return { name, type: st.isDirectory ? "directory" as const : "file" as const };
                }),
            );
        },
        rm: (path, recursive, force) => fileSystem.rm(path, { recursive, force }),
        rename: (src, dest) => fileSystem.mv(src, dest),
    };
}
