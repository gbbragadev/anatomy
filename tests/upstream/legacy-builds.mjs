import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const EXAMPLES = ["dial-indicator", "desk-computer", "arcade-cabinet", "ripple-tank", "turning-dial", "raptor-engine"];

export const BUILDS = EXAMPLES.flatMap((name) => [
  [`examples/${name}/build.mjs`],
  [`examples/${name}/build.mjs`, "--light"],
]);
BUILDS.push(["examples/turning-dial/build.mjs", "--light", "--verify"], ["examples/turning-dial/stress.mjs", "--light"]);

export function htmlFiles(root, directory) {
  if (!directory) return EXAMPLES.flatMap((name) => htmlFiles(root, join(root, "examples", name))).sort();
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(root, path) : entry.name.endsWith(".html") ? [relative(root, path).split(sep).join("/")] : [];
  }).sort();
}
