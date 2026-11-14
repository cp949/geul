/**
 * `v*` 태그 push로 실행되는 `.github/workflows/release.yml`이 4개 npm 패키지를 배포한다.
 *
 * 사람이 로컬에서 부르는 도구가 아니다. 인증은 GitHub Actions의 OIDC 토큰(npm trusted
 * publishing)이 맡으므로, npm 토큰이 없는 로컬에서는 `--dry-run`만 의미가 있다.
 *
 * ## 왜 `pnpm publish`가 아니라 `pnpm pack` + `npm publish <tarball>`인가
 *
 * - `workspace:*` 내부 의존은 `pnpm pack`이 실제 버전으로 치환한다(ADR-0018).
 * - OIDC 교환은 npm CLI(11.5.1 이상)가 한다. `pnpm publish`가 같은 교환을 하는지는
 *   확인하지 못했으므로 npm CLI가 직접 올리게 한다.
 *
 * ## 순서와 재실행
 *
 * 내부 의존 그래프(`io -> model`, `core -> model, io`, `react -> core`) 순서로 올린다.
 * 중간에 실패해 workflow를 다시 돌리면, 이미 npm에 있는 버전은 건너뛰고 나머지만 올린다.
 */

import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(import.meta.dirname, "..");

/** lockstep 4개 패키지. 내부 의존 순서(의존 대상이 앞)를 지킨다. */
export const RELEASE_PACKAGE_DIRECTORIES = [
  "packages/model",
  "packages/io",
  "packages/core",
  "packages/react",
];

/**
 * 태그 이름과 패키지 버전이 모두 `v<버전>`으로 맞는지 검사하고, 어긋난 항목을 돌려준다.
 * 빈 배열이면 통과다. 하나라도 어긋나면 일부만 배포되는 사고가 되므로 호출자는 중단한다.
 *
 * @param {string} tag 예: `v0.4.0`
 * @param {{ name: string; version: string }[]} manifests
 * @returns {string[]}
 */
export function findVersionMismatches(tag, manifests) {
  const problems = [];
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
    problems.push(`태그 이름이 v<major>.<minor>.<patch> 형식이 아니다: ${tag}`);
  }
  const versions = new Set(manifests.map((manifest) => manifest.version));
  if (versions.size > 1) {
    problems.push(
      `패키지 버전이 서로 다르다(ADR-0018 lockstep 위반): ${manifests
        .map((manifest) => `${manifest.name}@${manifest.version}`)
        .join(", ")}`,
    );
  }
  for (const manifest of manifests) {
    if (tag !== `v${manifest.version}`) {
      problems.push(
        `태그 ${tag}가 ${manifest.name}의 버전 ${manifest.version}과 다르다`,
      );
    }
  }
  return problems;
}

/**
 * `npm view <name> versions --json` 결과로 해당 버전이 이미 배포됐는지 판정한다.
 * 버전이 하나뿐인 패키지는 배열이 아니라 문자열 하나로 나오므로 둘 다 받는다.
 *
 * @param {unknown} versionsJson
 * @param {string} version
 */
export function isVersionPublished(versionsJson, version) {
  if (typeof versionsJson === "string") return versionsJson === version;
  if (Array.isArray(versionsJson)) return versionsJson.includes(version);
  return false;
}

/**
 * @param {string} name
 * @returns {unknown} 한 번도 배포된 적 없는 패키지(E404)는 `[]`
 */
function readPublishedVersions(name) {
  try {
    const output = execFileSync("npm", ["view", name, "versions", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return output.trim() === "" ? [] : JSON.parse(output);
  } catch (error) {
    const stderr =
      error !== null && typeof error === "object" && "stderr" in error
        ? String(error.stderr)
        : "";
    if (stderr.includes("E404")) return [];
    throw error;
  }
}

/**
 * @param {{ tag: string; dryRun: boolean; checkOnly?: boolean }} options
 *   `checkOnly`는 태그·버전 일치만 확인하고 끝낸다. 긴 검증 전에 빨리 실패하게 한다.
 */
export function publishRelease({ tag, dryRun, checkOnly = false }) {
  const manifests = RELEASE_PACKAGE_DIRECTORIES.map((directory) => ({
    directory: resolve(workspaceRoot, directory),
    ...JSON.parse(
      readFileSync(resolve(workspaceRoot, directory, "package.json"), "utf8"),
    ),
  }));

  const problems = findVersionMismatches(tag, manifests);
  if (problems.length > 0) {
    throw new Error(`배포를 중단한다.\n- ${problems.join("\n- ")}`);
  }

  if (checkOnly) return;

  const packDirectory = mkdtempSync(join(tmpdir(), "geul-release-"));
  try {
    for (const manifest of manifests) {
      const { name, version, directory } = manifest;
      if (isVersionPublished(readPublishedVersions(name), version)) {
        console.log(`건너뜀: ${name}@${version}은 이미 npm에 있다.`);
        continue;
      }

      execFileSync("pnpm", ["pack", "--pack-destination", packDirectory], {
        cwd: directory,
        stdio: "inherit",
      });
      const tarballs = readdirSync(packDirectory).filter(
        (file) =>
          file.endsWith(".tgz") &&
          file.startsWith(`${name.replace("@", "").replace("/", "-")}-`),
      );
      if (tarballs.length !== 1 || tarballs[0] === undefined) {
        throw new Error(
          `${name}의 tarball을 하나로 특정하지 못했다: ${tarballs.join(", ")}`,
        );
      }

      // dry-run은 provenance 서명을 요구하지 않도록 옵션에서 뺀다(로컬에는 OIDC 토큰이 없다).
      const args = [
        "publish",
        join(packDirectory, tarballs[0]),
        "--access",
        "public",
        ...(dryRun ? ["--dry-run"] : ["--provenance"]),
      ];
      console.log(`${dryRun ? "[dry-run] " : ""}npm ${args.join(" ")}`);
      execFileSync("npm", args, { stdio: "inherit" });
    }
  } finally {
    rmSync(packDirectory, { recursive: true, force: true });
  }
}

function main() {
  const [tag, ...flags] = process.argv.slice(2);
  if (tag === undefined) {
    console.error(
      "사용법: node scripts/publish-release.mjs <v태그> [--check | --dry-run]",
    );
    process.exit(2);
  }
  try {
    publishRelease({
      tag,
      dryRun: flags.includes("--dry-run"),
      checkOnly: flags.includes("--check"),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  main();
}
