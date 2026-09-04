import { readFile } from "node:fs/promises";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const packageJson = await readJson("../package.json");
const packageLock = await readJson("../package-lock.json");
const tauriConfig = await readJson("../src-tauri/tauri.conf.json");
const cargoToml = await readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
const cargoLock = await readFile(new URL("../src-tauri/Cargo.lock", import.meta.url), "utf8");

const cargoVersion = cargoToml.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLockVersion = cargoLock.match(/\[\[package\]\]\s+name\s*=\s*"lotus-desk-pet"\s+version\s*=\s*"([^"]+)"/m)?.[1];
const expected = packageJson.version;
const versions = {
  "package.json": expected,
  "package-lock.json": packageLock.version,
  "package-lock.json packages root": packageLock.packages?.[""]?.version,
  "src-tauri/tauri.conf.json": tauriConfig.version,
  "src-tauri/Cargo.toml": cargoVersion,
  "src-tauri/Cargo.lock": cargoLockVersion,
};

const mismatches = Object.entries(versions).filter(([, version]) => version !== expected);
if (mismatches.length) {
  console.error(`版本不一致，期望全部为 ${expected}：`);
  mismatches.forEach(([file, version]) => console.error(`- ${file}: ${version ?? "未找到"}`));
  process.exit(1);
}

const endpoint = tauriConfig.plugins?.updater?.endpoints?.[0] ?? "";
const publicKey = tauriConfig.plugins?.updater?.pubkey ?? "";
if (!endpoint.endsWith("/FayeDing99/lotus-desk-pet/releases/latest/download/latest.json")) {
  console.error("更新地址与 GitHub 仓库不一致，请检查 src-tauri/tauri.conf.json。");
  process.exit(1);
}
if (!publicKey.trim()) {
  console.error("缺少 Tauri 更新公钥，无法验证自动更新包。");
  process.exit(1);
}

const tag = process.env.GITHUB_REF_NAME;
if (tag?.startsWith("v") && tag !== `v${expected}`) {
  console.error(`Git 标签 ${tag} 与应用版本 v${expected} 不一致。`);
  process.exit(1);
}

console.log(`发布检查通过：v${expected}，版本号、更新地址和公钥配置一致。`);
