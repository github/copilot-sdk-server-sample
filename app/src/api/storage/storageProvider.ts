import { IFileSystem } from "just-bash";

export interface StorageProvider {
    // Used within this app only so that we know which sessions exist and can resume them
    listSessions(): Promise<{ sessionId: string, mtime: Date }[]>;

    // Releases any resources we're holding for the session within the app server
    deleteSession(sessionId: string): Promise<void>;

    // Supplies just-bash IFileSystem instances for a session
    createFileSystem(sessionId: string): IFileSystem;
}
