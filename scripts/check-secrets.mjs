import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const checks = [
  {
    name: "private key block",
    pattern: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/,
  },
  {
    name: "AWS access key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
  {
    name: "GitHub personal access token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/,
  },
  {
    name: "Supabase secret key",
    pattern: /\bsbs_[A-Za-z0-9_-]{20,}\b/,
  },
  {
    name: "JSON web token",
    pattern:
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
];

const trackedFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    encoding: "utf8",
  },
)
  .split("\0")
  .filter(Boolean);
const findings = [];

for (const file of trackedFiles) {
  if (file.endsWith(".lock") || file.endsWith(".png") || file.endsWith(".webp"))
    continue;
  let contents;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const check of checks) {
    if (check.pattern.test(contents))
      findings.push({ file, check: check.name });
  }
}

if (findings.length) {
  for (const finding of findings)
    console.error(`Potential ${finding.check} in ${finding.file}`);
  process.exitCode = 1;
} else {
  console.log(
    `Secret scan passed for ${trackedFiles.length} repository files.`,
  );
}
