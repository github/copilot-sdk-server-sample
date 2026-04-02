import { mkdirSync, readdirSync, statSync } from "fs";
import { rm } from "fs/promises";
import { ReadWriteFs } from "just-bash";
import { join } from "path";
import { StorageProvider } from "./storageProvider";

export function createDiskStorageProvider(root: string): StorageProvider {
    mkdirSync(root, { recursive: true });
    return {
        listSessions: async () => {
            const sessions: { sessionId: string; mtime: Date; }[] = [];
            for (const entry of readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory())) {
                const dirPath = join(entry.parentPath, entry.name);
                const st = statSync(dirPath);
                sessions.push({ sessionId: entry.name, mtime: st.mtime });
            }
            return sessions;
        },

        deleteSession: async (sessionId: string) => {
            const dir = join(root, sessionId);
            await rm(dir, { recursive: true, force: true });
        },

        createFileSystem: (sessionId: string) => {
            const dir = join(root, sessionId);
            mkdirSync(dir, { recursive: true });
            return new ReadWriteFs({ root: dir });
        },
    };
}
