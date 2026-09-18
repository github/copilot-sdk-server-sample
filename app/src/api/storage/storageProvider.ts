import { IFileSystem } from "just-bash";

export interface StorageProvider {
    // Used within this app only so that we know which sessions exist and can resume them
    listSessions(): Promise<{ sessionId: string, mtime: Date }[]>;

    // Releases any resources we're holding for the session within the app server
    deleteSession(sessionId: string): Promise<void>;

    // Supplies just-bash IFileSystem instances for a session (used by the just-bash environment)
    createFileSystem(sessionId: string): IFileSystem;

    // Returns the real, on-disk directory for a session (used by the container-based
    // environment, which needs a host directory it can bind-mount into a container).
    // Throws if this storage provider doesn't back sessions with a real directory.
    getSessionDir(sessionId: string): string;
}
