import Docker from "dockerode";
import { randomUUID } from "crypto";
import { ensureSessionImageBuilt, SESSION_IMAGE_TAG } from "./image.js";

export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
}

// When the app itself runs inside a container (e.g. via docker-compose) whose
// session directories are bind-mounted from the host, `docker.sock` (also
// bind-mounted in) lets us talk to the *host's* Docker daemon to start sibling
// containers - but any bind mount we ask that daemon to create must use a path
// that's meaningful on the host, not inside our own container.
//
// HOST_SESSIONS_ROOT should be set to the host path that corresponds to
// `sessionsRootDir` inside our own container (see docker-compose.yml). When
// running the app directly on the host (no container), leave it unset - in
// that case `sessionsRootDir` already *is* a host path.
const HOST_SESSIONS_ROOT = process.env.HOST_SESSIONS_DIR;

function toHostPath(sessionsRootDir: string, sessionDir: string): string {
    if (!HOST_SESSIONS_ROOT) {
        return sessionDir;
    }
    const rel = sessionDir.slice(sessionsRootDir.length).split(/[\\/]+/).filter(Boolean);
    return [HOST_SESSIONS_ROOT.replace(/\/+$/, ""), ...rel].join("/");
}

const docker = new Docker();

/*
  Runs one small, disposable Docker container per session, giving the agent's
  `bash` tool a real (but isolated) Linux shell instead of an in-process
  simulation like just-bash. The session's working directory on the host is
  bind-mounted read-write into the container at /workspace, so:
    - Files the agent's other tools (read_file, write_file, etc, wired up via
      SessionFsProvider in containerFs.ts) create on disk are immediately visible
      to commands run in the container, and vice versa.
    - Nothing else on the host is reachable from inside the container.

  A single interactive `bash` process is kept running inside the container for
  the lifetime of the session (via `docker exec`), so state like cwd, exported
  environment variables, and shell functions persists across tool calls, the
  same way a real terminal session would.
*/
export class SessionContainer {
    private container: Docker.Container | undefined;
    private stdin: NodeJS.WritableStream | undefined;
    private outputBuffer = "";
    private stderrBuffer = "";
    private currentMarker: string | undefined;
    private pendingResolve: ((r: ExecResult) => void) | undefined;
    // Interactive bash only handles one command at a time, so we serialize
    // exec() calls even if the caller doesn't await between them.
    private execQueue: Promise<unknown> = Promise.resolve();

    constructor(private readonly sessionsRootDir: string, private readonly sessionDir: string, private readonly sessionId: string) {}

    async start(): Promise<void> {
        await ensureSessionImageBuilt(docker);

        const hostSessionDir = toHostPath(this.sessionsRootDir, this.sessionDir);
        this.container = await docker.createContainer({
            name: `copilot-session-${this.sessionId}`,
            Image: SESSION_IMAGE_TAG,
            Cmd: ["sleep", "infinity"],
            WorkingDir: "/workspace",
            HostConfig: {
                Binds: [`${hostSessionDir}:/workspace:rw`],
                AutoRemove: true,
                // The container only needs to talk to the outside world via curl;
                // it has no need for elevated host access.
                CapDrop: ["ALL"],
            },
            Tty: false,
        });
        await this.container.start();

        // Start one long-lived interactive bash process we can pipe commands into,
        // so shell state (cwd, env vars, etc) is preserved between tool calls.
        const exec = await this.container.exec({
            Cmd: ["bash", "--noprofile", "--norc"],
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
        });
        const stream = await exec.start({ hijack: true, stdin: true });

        const stdout = { write: (chunk: Buffer) => this.onStdout(chunk) };
        const stderr = { write: (chunk: Buffer) => this.onStderr(chunk) };
        docker.modem.demuxStream(stream, stdout as any, stderr as any);

        this.stdin = stream;
    }

    // Runs a command in the session's persistent interactive bash session and
    // waits for it to complete, returning its output and exit code. Commands
    // are serialized: if called again before the previous one finishes, it
    // simply waits its turn, just like typing into a real terminal would.
    exec(command: string): Promise<ExecResult> {
        const runNext = () => this.runOne(command);
        const result = this.execQueue.then(runNext, runNext);
        // Swallow errors here so a failed command doesn't break the queue chain
        // for subsequent commands; the caller still gets the rejection/result.
        this.execQueue = result.catch(() => {});
        return result;
    }

    private runOne(command: string): Promise<ExecResult> {
        if (!this.stdin) {
            throw new Error("SessionContainer has not been started");
        }

        const marker = `__CMD_DONE_${randomUUID()}__`;
        const resultPromise = new Promise<ExecResult>(resolve => {
            this.pendingResolve = resolve;
        });

        this.outputBuffer = "";
        this.stderrBuffer = "";
        this.currentMarker = marker;
        this.stdin.write(`${command}\n`);
        this.stdin.write(`echo "${marker}:$?"\n`);

        return resultPromise;
    }

    private onStdout(chunk: Buffer) {
        this.outputBuffer += chunk.toString("utf8");
        this.tryComplete();
    }

    private onStderr(chunk: Buffer) {
        this.stderrBuffer += chunk.toString("utf8");
    }

    private tryComplete() {
        if (!this.currentMarker) return;
        const markerIndex = this.outputBuffer.indexOf(this.currentMarker);
        if (markerIndex === -1) return;

        const markerLine = this.outputBuffer.slice(markerIndex);
        const match = markerLine.match(/:(-?\d+)/);
        const exitCode = match ? Number(match[1]) : null;
        const stdout = this.outputBuffer.slice(0, markerIndex);
        const stderr = this.stderrBuffer;

        this.currentMarker = undefined;
        this.outputBuffer = "";
        this.stderrBuffer = "";

        const resolve = this.pendingResolve;
        this.pendingResolve = undefined;
        resolve?.({ stdout, stderr, exitCode });
    }

    async stop(): Promise<void> {
        try {
            await this.container?.stop({ t: 1 });
        } catch {
            // Already stopped/removed (AutoRemove) - nothing to do
        }
        this.container = undefined;
        this.stdin = undefined;
    }
}
