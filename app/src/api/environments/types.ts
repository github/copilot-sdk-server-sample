import { SessionConfig } from "@github/copilot-sdk";
import { StorageProvider } from "../storage/storageProvider";

export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
}

// A "session environment" bundles together everything needed to give a session an isolated
// place to work: a filesystem, a way to run shell commands in it, and the SessionConfig that
// wires those into the Copilot runtime's tools. This app ships two implementations - just-bash
// (the default; an in-process virtual filesystem + shell simulator) and container-based (a
// real, disposable Linux container per session) - selected by a single line of code in
// chatSocket.ts, so no isolation-specific branching is needed anywhere else.
export interface SessionEnvironment {
    sessionConfig: Partial<SessionConfig>;

    // Runs a `!command` bang-command directly, bypassing the agent
    execBangCommand(command: string): Promise<ExecResult>;

    // Releases any resources (e.g. a running container) held for this session. Called once the
    // last WebSocket connection for the session disconnects.
    dispose(): Promise<void>;
}

export type CreateEnvironment = (sessionId: string, sessionsRootDir: string, storage: StorageProvider) => Promise<SessionEnvironment>;
