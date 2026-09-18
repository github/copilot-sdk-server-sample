import { promises as fs } from "fs";
import { dirname, join, posix as posixPath, resolve, sep } from "path";
import type { SessionFsProvider } from "@github/copilot-sdk";

/*
  A SessionFsProvider backed directly by a real directory on the host disk,
  replacing the just-bash IFileSystem abstraction used previously.

  The agent only ever deals in virtual, posix-style absolute paths (e.g.
  "/foo/bar") rooted at `sessionFsConfig.initialCwd` ("/"). This provider maps
  those onto real paths under `rootDir` and refuses to touch anything outside
  it, so the agent - and the shell tool running in the session's container,
  which bind-mounts this same directory - are both confined to `rootDir`.
*/
export function createContainerFs(rootDir: string): SessionFsProvider {
    const resolvedRoot = resolve(rootDir);

    function toRealPath(virtualPath: string): string {
        // Normalizing as a posix path first collapses any ".." segments without
        // ever escaping above "/", so the resulting real path is always within root.
        const normalized = posixPath.normalize(`/${virtualPath}`);
        const real = resolve(join(resolvedRoot, normalized));
        if (real !== resolvedRoot && !real.startsWith(resolvedRoot + sep)) {
            throw new Error(`Refusing to access path outside session root: ${virtualPath}`);
        }
        return real;
    }

    async function withEnoent<T>(virtualPath: string, fn: () => Promise<T>): Promise<T> {
        try {
            return await fn();
        } catch (err: unknown) {
            if (err && typeof err === "object" && (err as NodeJS.ErrnoException).code === "ENOENT") {
                const ex = new Error(`ENOENT: no such file or directory, '${virtualPath}'`) as NodeJS.ErrnoException;
                ex.code = "ENOENT";
                ex.path = virtualPath;
                throw ex;
            }
            throw err;
        }
    }

    return {
        readFile: (path) => withEnoent(path, () => fs.readFile(toRealPath(path), "utf8")),

        writeFile: async (path, content, mode) => {
            const real = toRealPath(path);
            await fs.mkdir(dirname(real), { recursive: true });
            await fs.writeFile(real, content, { mode });
        },

        appendFile: async (path, content, mode) => {
            const real = toRealPath(path);
            await fs.mkdir(dirname(real), { recursive: true });
            await fs.appendFile(real, content, { mode });
        },

        exists: async (path) => {
            try {
                await fs.access(toRealPath(path));
                return true;
            } catch {
                return false;
            }
        },

        stat: (path) => withEnoent(path, async () => {
            const st = await fs.stat(toRealPath(path));
            return {
                isFile: st.isFile(),
                isDirectory: st.isDirectory(),
                size: st.size,
                mtime: st.mtime.toISOString(),
                birthtime: st.birthtime.toISOString(),
            };
        }),

        mkdir: async (path, recursive, mode) => {
            await fs.mkdir(toRealPath(path), { recursive, mode });
        },

        readdir: (path) => withEnoent(path, () => fs.readdir(toRealPath(path))),

        readdirWithTypes: (path) => withEnoent(path, async () => {
            const entries = await fs.readdir(toRealPath(path), { withFileTypes: true });
            return entries.map(entry => ({
                name: entry.name,
                type: entry.isDirectory() ? "directory" as const : "file" as const,
            }));
        }),

        rm: async (path, recursive, force) => {
            await fs.rm(toRealPath(path), { recursive, force });
        },

        rename: async (src, dest) => {
            await fs.rename(toRealPath(src), toRealPath(dest));
        },
    };
}
