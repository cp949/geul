import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import process from "node:process";

const workspaceRoot = resolve(import.meta.dirname, "..");
const allowed = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
]);

/**
 * `pnpm licenses list --prod --json` 출력에서 이 스크립트가 실제로 읽는
 * `name`·`versions`만의 투영이다. 실제 항목에는 `paths`·`license`·`homepage`·
 * `description`·`author`도 있으므로, 이 타입은 출력 전체 모양을 주장하지 않는다
 * — 나머지 필드를 읽으려면 여기에 먼저 추가해야 한다.
 *
 * @type {Record<string, { name: string; versions: string[] }[]>}
 */
const licenseReport = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    cwd: workspaceRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }),
);

const failures = [];
const auditedPackages = new Map();
for (const [license, entries] of Object.entries(licenseReport)) {
  if (!allowed.has(license)) {
    const packages = entries
      .flatMap((entry) =>
        entry.versions.map((version) => `${entry.name}@${version}`),
      )
      .sort();
    failures.push(
      `${license || "UNKNOWN"}: ${packages.join(", ")} requires manual review`,
    );
  }

  for (const entry of entries) {
    for (const version of entry.versions) {
      auditedPackages.set(`${entry.name}@${version}`, license);
    }
  }
}

const productionSections = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
];
const manifestPaths = [];
for (const directory of ["apps", "fixtures", "packages"]) {
  const directoryPath = resolve(workspaceRoot, directory);
  if (!existsSync(directoryPath)) continue;
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const manifestPath = resolve(directoryPath, entry.name, "package.json");
    if (entry.isDirectory() && existsSync(manifestPath))
      manifestPaths.push(manifestPath);
  }
}

for (const manifestPath of manifestPaths) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const section of productionSections) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (version === "workspace:*") continue;
      if (!auditedPackages.has(`${name}@${version}`)) {
        failures.push(
          `${relative(workspaceRoot, manifestPath)}#${section}.${name}@${version} was not found in the production license graph`,
        );
      }
    }
  }
}

if (auditedPackages.size === 0) {
  failures.push("The production license graph is empty");
}

if (failures.length > 0) {
  console.error("Production dependency license check failed:\n");
  for (const failure of failures.sort()) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Verified ${auditedPackages.size} external transitive production packages against the license allowlist.`,
  );
}
