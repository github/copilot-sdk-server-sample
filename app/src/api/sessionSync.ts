import { execFile as execFileCb } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { promisify } from "util";

const execFile = promisify(execFileCb);
const FILESTORE_HOST = process.env.SESSION_FILESTORE_HOST;
const FILESTORE_PORT = process.env.SESSION_FILESTORE_PORT;
const FILESTORE_ENABLED = !!FILESTORE_HOST && !!FILESTORE_PORT;
const debounceTimeoutMs = 2000;
const debounceTimers = new Map<string, NodeJS.Timeout>();

export async function syncSessionToFilestore(sessionsDir: string, sessionId: string): Promise<void> {
    if (!FILESTORE_ENABLED) return;

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
    if (!FILESTORE_ENABLED) return;

    const src = `rsync://${FILESTORE_HOST}:${FILESTORE_PORT}/sessions/${sessionId}/`;
    const dest = `${join(sessionsDir, sessionId)}/`;

    try {
        await execFile("rsync", ["-a", src, dest]);
    } catch (err: any) {
        // Session may not exist in filestore yet — that's fine
        console.warn(`rsync restore for session ${sessionId}: ${err.stderr}`);
    }
}
