import Docker from "dockerode";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// The image used for each session's container: stock Alpine plus the handful
// of packages the agent's shell tool needs (bash, python3, curl). See
// ../../../session-image/Dockerfile. It's small and boots in ~1-2 seconds.
export const SESSION_IMAGE_TAG = "copilot-sdk-server-sample-session:latest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sessionImageDir = join(__dirname, "..", "..", "..", "session-image");

let buildPromise: Promise<void> | undefined;

// Builds (or rebuilds) the session container image exactly once per app process,
// regardless of how many sessions concurrently ask for it.
export function ensureSessionImageBuilt(docker: Docker): Promise<void> {
    if (!buildPromise) {
        buildPromise = buildImage(docker).catch(err => {
            // Allow retrying on a later session if the build failed transiently
            buildPromise = undefined;
            throw err;
        });
    }
    return buildPromise;
}

async function buildImage(docker: Docker): Promise<void> {
    const images = await docker.listImages({ filters: JSON.stringify({ reference: [SESSION_IMAGE_TAG] }) });
    if (images.length > 0) {
        return;
    }

    console.log(`Building session container image (${SESSION_IMAGE_TAG})...`);
    const stream = await docker.buildImage({ context: sessionImageDir, src: ["Dockerfile"] }, { t: SESSION_IMAGE_TAG });
    await new Promise<void>((resolve, reject) => {
        docker.modem.followProgress(
            stream,
            (err, res) => {
                if (err) return reject(err);
                const lastEntry = res[res.length - 1];
                if (lastEntry?.error) {
                    reject(new Error(lastEntry.error));
                } else {
                    resolve();
                }
            },
        );
    });
    console.log(`Session container image built.`);
}
