import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";

const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean);
const patterns = [
  { name: "OpenAI/compatible API key", value: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Anthropic API key", value: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Google API key", value: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: "private key", value: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];
const findings = [];

for (const path of tracked) {
  const info = await stat(path);
  if (!info.isFile() || info.size > 2_000_000) continue;
  const content = await readFile(path, "utf8").catch(() => "");
  patterns.forEach((pattern) => {
    if (pattern.value.test(content)) findings.push(`${path}: ${pattern.name}`);
    pattern.value.lastIndex = 0;
  });
}

if (findings.length) {
  console.error("发现可能的敏感信息，已阻止发布：");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log(`敏感信息检查通过：已扫描 ${tracked.length} 个将可能上传的文件。`);
