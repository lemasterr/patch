import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [configuration, logPath] = process.argv.slice(2);
const validConfigurations = new Set(["debug", "release"]);

if (!validConfigurations.has(configuration) || !logPath) {
  console.error(
    "Usage: node scripts/check-ios-warning-baseline.mjs <debug|release> <xcodebuild-log>",
  );
  process.exit(2);
}

const baselinePath = new URL(
  "../ci/ios-warning-baseline.json",
  import.meta.url,
);
const [baselineText, logText] = await Promise.all([
  readFile(baselinePath, "utf8"),
  readFile(resolve(logPath), "utf8"),
]);
const baseline = JSON.parse(baselineText);
const acceptedPatterns = baseline[configuration];
const ignoredInformationalWarnings = new Set([
  "Bundler cache is empty, rebuilding (this may take a minute)",
]);

if (!Array.isArray(acceptedPatterns)) {
  throw new Error(`Missing ${configuration} warning baseline.`);
}

function normalizeWarning(warning) {
  return warning
    .replace(/'[^']+\.o' has no symbols/g, "<object> has no symbols")
    .replace(
      /class '[^']+' must restate inherited '@unchecked Sendable' conformance/g,
      "class must restate inherited '@unchecked Sendable' conformance",
    )
    .replace(
      /umbrella header for module 'React' does not include header '[^']+'/g,
      "React umbrella header omits a header",
    )
    .replace(/\s+/g, " ")
    .trim();
}

const rawWarnings = [...logText.matchAll(/^.*warning:\s*(.+)$/gm)].map(
  (match) => normalizeWarning(match[1]),
);
const ignoredWarnings = rawWarnings.filter((warning) =>
  ignoredInformationalWarnings.has(warning),
);
const warnings = rawWarnings.filter(
  (warning) => !ignoredInformationalWarnings.has(warning),
);
const uniqueWarnings = [...new Set(warnings)].sort();
const accepted = acceptedPatterns.map((pattern) => new RegExp(pattern));
const unexpected = uniqueWarnings.filter(
  (warning) => !accepted.some((pattern) => pattern.test(warning)),
);
const patchOwnedWarnings = logText
  .split("\n")
  .filter(
    (line) =>
      line.includes("warning:") &&
      (line.includes("/mobile/ios/Patch") ||
        line.includes("(in target 'Patch' from project 'Patch')")),
  );

console.log(
  `${configuration}: ${warnings.length} compiler warning occurrences, ${uniqueWarnings.length} unique warning types, ${ignoredWarnings.length} ignored Metro cache-status lines`,
);

if (patchOwnedWarnings.length || unexpected.length) {
  if (patchOwnedWarnings.length) {
    console.error(
      `Patch-owned ${configuration} iOS warnings:\n${patchOwnedWarnings.join("\n")}`,
    );
  }
  console.error(
    `New ${configuration} iOS warning types:\n${unexpected.map((warning) => `- ${warning}`).join("\n")}`,
  );
  process.exit(1);
}
