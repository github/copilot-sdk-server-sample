import { IFileSystem, InMemoryFs } from "just-bash";
import { StorageProvider } from "./storageProvider";

export function createInMemoryStorageProvider(): StorageProvider {
    const inMemoryFileSystems = new Map<string, IFileSystem>();
    return {
        listSessions: async () => {
            const result: { sessionId: string; mtime: Date; }[] = [];
            for (const [sessionId, fs] of inMemoryFileSystems.entries()) {
                const st = await fs.stat("/");
                result.push({ sessionId, mtime: st.mtime });
            }
            return result;
        },
        deleteSession: async (sessionId: string) => {
            inMemoryFileSystems.delete(sessionId);
        },
        createFileSystem: (sessionId: string) => {
            if (!inMemoryFileSystems.has(sessionId)) {
                inMemoryFileSystems.set(sessionId, new InMemoryFs());
            }
            return inMemoryFileSystems.get(sessionId)!;
        },
    };
}
