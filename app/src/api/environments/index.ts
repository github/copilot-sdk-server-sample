import { CreateEnvironment } from "./types";
import { createJustBashEnvironment } from "./justBashEnvironment";
// import { createContainerEnvironment } from "./containerEnvironment";

// Which session isolation strategy to use is chosen right here in code (not via an env var),
// since it's a fixed choice for how you want to run this sample, not something that varies
// per request. just-bash (the default) needs no extra setup. To switch to container-based
// isolation instead, comment out the line below and uncomment the one after it - see README
// "Switching to container-based isolation" for what that requires.
export const createEnvironment: CreateEnvironment = createJustBashEnvironment;
// export const createEnvironment: CreateEnvironment = createContainerEnvironment;
