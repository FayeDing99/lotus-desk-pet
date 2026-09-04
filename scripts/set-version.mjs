import { readFile, writeFile } from "node:fs/promises";

const nextVersion = process.argv[2]?.replace(/^v/, "");
if (!nextVersion || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(nextVersion)) {
  console.error("用法：npm run version:set -- 0.2.0");
  process.exit(1);
}

const packagePath = new URL("../package.json", import.meta.url);
const lockPath = new URL("../package-lock.json", import.meta.url);
const tauriPath = new URL("../src-tauri/tauri.conf.json", import.meta.url);
const cargoPath = new URL("../src-tauri/Cargo.toml", import.meta.url);
const cargoLockPath = new URL("../src-tauri/Cargo.lock", import.meta.url);

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const packageLock = JSON.parse(await readFile(lockPath, "utf8"));
let tauriConfig = await readFile(tauriPath, "utf8");
let cargoToml = await readFile(cargoPath, "utf8");
let cargoLock = await readFile(cargoLockPath, "utf8");

packageJson.version = nextVersion;
packageLock.version = nextVersion;
if (packageLock.packages?.[""]) packageLock.packages[""].version = nextVersion;
tauriConfig = tauriConfig.replace(/("version"\s*:\s*)"[^"]+"/, `$1"${nextVersion}"`);
cargoToml = cargoToml.replace(/(^\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m, `$1"${nextVersion}"`);
cargoLock = cargoLock.replace(/(\[\[package\]\]\s+name\s*=\s*"deskpet"\s+version\s*=\s*)"[^"]+"/m, `$1"${nextVersion}"`);

await Promise.all([
  writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`),
  writeFile(lockPath, `${JSON.stringify(packageLock, null, 2)}\n`),
  writeFile(tauriPath, tauriConfig),
  writeFile(cargoPath, cargoToml),
  writeFile(cargoLockPath, cargoLock),
]);

console.log(`版本已统一更新为 ${nextVersion}`);
