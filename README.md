# GitHub Copilot SDK — Session Server Sample

A sample app demonstrating one possible way to build a multi-user, server-hosted agent chat experience. This is built using [GitHub Copilot SDK](https://github.com/github/copilot-sdk), so it can complete challenging real-world tasks using the same proven harness that powers Copilot CLI.

In this sample, each user gets an isolated session with its own workspace directory and a dedicated Linux container for running shell commands, all managed server-side.

![Screenshot](docs/screenshot.png)

The agent can manage its own files and write and execute Python code and `curl` commands inside its session's container.

⚠️ This is a sample to demonstrate a possible app architecture. It's not an app you could deploy as-is, since it lacks important security features such as auth, and the filesystem/network isolation is limited. See [limitations](#limitations) for more details.

## Running the sample

You need a GitHub token (a fine-grained PAT with no special permissions, or the output of `gh auth token`), and [Docker](https://www.docker.com/) (the app server itself uses Docker to start one small container per session). The GitHub token is used by Copilot SDK to perform AI inferencing using a model approved for your account.

```bash
# On Bash (macOS/Linux)
GITHUB_TOKEN=<your-token> docker compose build --no-cache
GITHUB_TOKEN=<your-token> docker compose up

# On PowerShell (Windows)
$env:GITHUB_TOKEN="<your-token>"
docker compose build --no-cache
docker compose up
```

When it's running, open [http://localhost:3001](http://localhost:3001).

### Running shell commands in per-session containers

Each session gets its own small, disposable Docker container (built from `app/session-image/Dockerfile`,
a stock Alpine image with just `bash`, `python3`, and `curl` added) that boots in about a second. The
session's on-disk workspace directory (`app/sessions/<sessionId>`) is bind-mounted read-write into that
container at `/workspace`, so the `bash` tool and the agent's file tools both see the exact same files.
The container has no other access to the host.

## Architecture

```mermaid
graph LR
    Users((Users)) --> LB[Load Balancer]
    LB --> App1[App Server 1]
    LB --> App2[App Server 2]
    App1 -->|rsync| FS[(rsync-filestore)]
    App2 -->|rsync| FS
```

### Per-session isolation

When a user connects, the app server creates an isolated session with:

- A **Copilot SDK session** (`CopilotSession`) that maintains conversation state, tool handlers, and event streaming.
  - We limit it to using tools that are intended to be safe in multi-user environments because they don't read/write files.
  - The session's only tool that can operate on disk is `bash`, but this is swapped out for one that runs inside the session's own container (see below).
- A **workspace directory** on the app server's disk, scoped to that session. The Copilot agent's file tools read and write within this directory only (see `containerFs.ts`). It cannot see the server's other files or the state of other sessions.
- A **per-session Docker container** (see `docker/sessionContainer.ts`) with that same workspace directory bind-mounted read-write at `/workspace`, exposed to the agent as the `bash` tool. Unlike the previous just-bash-based version of this sample, this container's network access is **not** restricted to an allowlist - see [limitations](#limitations).

Multiple browser tabs can observe the same session simultaneously — the server maintains a single `CopilotSession` per session ID and fans out events to all connected WebSockets. To see this, copy and paste your session URL into a second browser window or tab.

### Scaling across multiple app servers

The architecture supports running multiple app server instances behind a load balancer:

- **Session files are synced to a shared filestore.** After each agent turn completes, the app server pushes the session's directory to the `rsync-filestore` container using rsync. This is incremental and efficient.
- **Sessions can be resumed on any server.** When a user reconnects (possibly to a different app server), the server restores the session files from the filestore before resuming the Copilot session.
- **App servers clean up local storage.** Once all WebSocket connections for a session close, the app server deletes the local copy. This keeps each server's disk usage bounded.

The `rsync-filestore` container is a minimal Alpine image running an rsync daemon. It serves as the persistent, shared store that survives app server restarts and enables session mobility across servers.

**This is just one possible example of how to balance performance and resilience to server recycling.** Other strategies are also possible, because the storage virtualization APIs in Copilot SDK allow you to store things anywhere you like. For example you could directly stream session events to an event store rather than letting them be written to disk in the first place. But for this example, simply synchronizing and restoring the session's entire workspace directory is a simple and comprehensive solution.

## Code structure

 * `app`: the application server. You could run many instances and load balance over them.
   * `api`: server-side code that defines and manages agent sessions
     * `chatSocket.ts`: starts a WebSocket listener. As clients connect/disconnect, starts and stops `CopilotSession` instances (and their containers) and synchronizes storage to `rsync-filestore`
     * `storage/`: manages each session's on-disk workspace directory
     * `containerFs.ts`: a `SessionFsProvider` that gives the agent's file tools access to a session's workspace directory, confined to it
     * `docker/`: builds the session container image once per app process and starts/stops/execs into one container per session
     * `bash.ts`: swaps out Copilot SDK's built-in shell tool with one that runs commands inside the session's container
   * `web-ui`: an Express+React application providing the user interface
     * `hooks/useChat.ts`: opens the websocket connection to `api/chat` and uses a reducer pattern to convert the event stream into a UI
     * everything else: generic chat UI (a lot of code but nothing interesting)
 * `rsync-filestore`: a minimal `rsync` server that provides persistent storage shared by all application servers

## Limitations

> **⚠️ GitHub Copilot SDK is under active development and patterns for multi-user deployment are still evolving.**

This example illustrates many useful ideas, but isn't something you can deploy as-is, because:

- **No authentication.** The sample has no user authentication or session authorization. Anyone with access to the server can create or resume sessions.
- **Unrestricted container network access.** Session containers can reach any network host via `curl`, with no egress allowlist or firewall. A real deployment would want to restrict this (e.g. with a network policy, proxy, or `--network` configuration on the container).
- **Session containers run with the app server's Docker access.** The app server needs access to a Docker daemon (via the Docker socket) to create session containers. Anyone who could get code execution in the app server could likely also control that Docker daemon.
- **Not production-hardened.** Error handling, rate limiting, and resource quotas are minimal. This is a reference implementation to illustrate the architecture, not a production-ready service.

## License

This project is licensed under the terms of the MIT open source license. Please refer to the [LICENSE](./LICENSE) file for the full terms.

## Support

This project is a sample/reference implementation. Please use [GitHub Issues](https://github.com/github/copilot-sdk/issues) to report bugs or request features in Copilot SDK itself.

## Contributing

We're not looking for contributions into this sample, since we aim to keep it simple and minimal. However we are very happy to consider contributions to [Copilot SDK](https://github.com/github/copilot-sdk).

This project adheres to a [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.
