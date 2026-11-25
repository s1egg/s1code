import { createGitEnvironmentAtoms } from "@s1tools/client-runtime/state/git";
import { connectionAtomRuntime } from "../connection/runtime";

export const gitEnvironment = createGitEnvironmentAtoms(connectionAtomRuntime);
