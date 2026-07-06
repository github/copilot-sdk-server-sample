export interface StorageProvider {
    // Used within this app only so that we know which sessions exist and can resume them
    listSessions(): Promise<{ sessionId: string, mtime: Date }[]>;

    // Releases any resources we're holding for the session within the app server
    deleteSession(sessionId: string): Promise<void>;

    // Returns (creating if necessary) the real, on-disk directory that holds a session's files.
    // This directory is used both as the root for the SessionFsProvider (see containerFs.ts)
    // and as the read-write bind mount into that session's container (see docker/sessionContainer.ts).
    getSessionDir(sessionId: string): string;
}
