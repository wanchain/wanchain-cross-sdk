import { fileURLToPath } from 'url';
import path from 'path';
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dependencies = {};
const rootMatchs = {};
const rootLackSet = new Set();

check();

// check whether dependencies in the root package.json are consistent with sub-packages

async function check() {
  let isConsistent = true;

  // root dependencies
  let { default: root } = await import(new URL('./package.json', import.meta.url), { with: { type: 'json' } });
  dependencies.root = root.dependencies;

  // packages dependencies
  let pkgsDir = path.join(__dirname, "packages");
  let files = fs.readdirSync(pkgsDir);
  for (let i = 0; i < files.length; i++) {
    let file = files[i];
    let pkgDir = path.join(pkgsDir, file);
    if (fs.statSync(pkgDir).isDirectory()) {
      let { default: sub } = await import(new URL('./package.json', import.meta.url), { with: { type: 'json' } });
      dependencies[file] = sub.dependencies;
    }
  }

  // console.log(dependencies);
  for (let [pkg, deps] of Object.entries(dependencies)) {
    if (pkg !== "root") {
      for (let [np, version] of Object.entries(deps)) {
        let npKey = np + ":" + version;
        let rootNpVer = dependencies.root[np];
        if (rootNpVer) {
          if (rootNpVer === version) {
            rootMatchs[np] = version;
          } else {
            if (!rootLackSet.has(npKey)) {
              rootLackSet.add(npKey);
              console.error("%s version is not matched: %s(root) and %s(@wandevs/cross-%s)", np, rootNpVer, version, pkg);
              isConsistent = false;
            }
          }
        } else {
          rootLackSet.add(npKey);
          console.error("%s@%s is not in root package.json", np, version);
          isConsistent = false;
        }
      }
    }
  }

  for (let [np, version] of Object.entries(dependencies.root)) {
    if (rootMatchs[np] !== version) {
      console.error("%s@%s is not used by any package", np, version);
      isConsistent = false;
    }
  }

  console.log("\r\ncheck dependencies %s", isConsistent ? "PASS" : "FAILED");
}
