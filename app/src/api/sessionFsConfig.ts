import { SessionFsConfig } from "@github/copilot-sdk";

export const sessionFsConfig: SessionFsConfig = {
    initialCwd: "/",
    sessionStatePath: "/session-state",
    conventions: "posix"
};
