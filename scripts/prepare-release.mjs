import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const nextVersion = process.argv[2]?.replace(/^v/, "");
if (!nextVersion) {
  console.error("用法：npm run release:prepare -- 0.2.0");
  process.exit(1);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(process.execPath, [fileURLToPath(new URL("./set-version.mjs", import.meta.url)), nextVersion]);
run(npmCommand, ["run", "release:check"]);

console.log("\n发布准备完成。确认界面无误后依次执行：");
console.log("git add .");
console.log(`git commit -m "release: v${nextVersion}"`);
console.log("git push origin main");
console.log(`git tag v${nextVersion}`);
console.log(`git push origin v${nextVersion}`);
