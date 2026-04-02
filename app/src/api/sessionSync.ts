import { execFile as execFileCb } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { promisify } from "util";

const execFile = promisify(execFileCb);
const FILESTORE_HOST = requireEnv("SESSION_FILESTORE_HOST");
const FILESTORE_PORT = requireEnv("SESSION_FILESTORE_PORT");
const debounceTimeoutMs = 2000;
const debounceTimers = new Map<string, NodeJS.Timeout>();

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

export async function syncSessionToFilestore(sessionsDir: string, sessionId: string): Promise<void> {
    const existingTimer = debounceTimers.get(sessionId);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    debounceTimers.set(sessionId, setTimeout(async () => {
        const src = `${join(sessionsDir, sessionId)}/`;
        if (!existsSync(src)) return;

        const dest = `rsync://${FILESTORE_HOST}:${FILESTORE_PORT}/sessions/${sessionId}/`;

        try {
            await execFile("rsync", ["-a", "--delete", src, dest]);
        } catch (err: any) {
            console.error(`rsync failed for session ${sessionId}: ${err.stderr}`);
        }
    }, debounceTimeoutMs));
}

export async function restoreSessionFromFilestore(sessionsDir: string, sessionId: string): Promise<void> {
    const src = `rsync://${FILESTORE_HOST}:${FILESTORE_PORT}/sessions/${sessionId}/`;
    const dest = `${join(sessionsDir, sessionId)}/`;

    try {
        await execFile("rsync", ["-a", src, dest]);
    } catch (err: any) {
        // Session may not exist in filestore yet — that's fine
        console.warn(`rsync restore for session ${sessionId}: ${err.stderr}`);
    }
}
