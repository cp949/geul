import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";

import { workspacePackageDirectories } from "./workspace-roots.mjs";

const workspaceRoot = resolve(import.meta.dirname, "..");

/**
 * 이 스크립트가 검사하는 `package.json` 의존성 섹션 이름의 유니온이다.
 * 아래 두 배열과 `PackageManifestDependencySections`의 키가 이 유니온을
 * 공유해야 `manifest[section]` 인덱싱이 타입으로 성립한다.
 *
 * @typedef {"dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies"} DependencySection
 */

/**
 * 모든 섹션. `@type` 주석이 필수다 — 없으면 배열이 `string[]`으로 넓어지고
 * `manifest[section]`이 TS7053(`string` 타입 식으로 리터럴 키 타입을 인덱싱할 수
 * 없음)으로 깨진다. JSDoc에는 `as const`가 없고 `@type {const}`는 TypeScript
 * 7.0.2에서 TS2304(`Cannot find name 'const'`)로 거부되므로, 유니온 배열 주석이
 * 그 대체물이다. `readonly`는 typecheck 통과에 필수는 아니지만
 * (`DependencySection[]`로도 통과한다) 이 상수의 변형을 함께 막는다.
 *
 * @type {readonly DependencySection[]}
 */
const dependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/**
 * production 런타임에 실리는 섹션만 추린 부분집합이다 — `devDependencies`가
 * 빠진다. `@type` 주석이 필요한 이유는 위와 같다.
 *
 * @type {readonly DependencySection[]}
 */
const productionDependencySections = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
];
const exactVersion =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const forbiddenProductDependencies = [
  /** @param {string} name */
  (name) => name.startsWith("xl-"),
  /** @param {string} name */
  (name) => name.startsWith("@blocknote/"),
  /** @param {string} name */
  (name) => name.startsWith("@tiptap-pro/"),
];

/**
 * `package.json`에서 이 스크립트가 실제로 읽는 부분만의 모양이다 — 의존성
 * 섹션의 투영이고, 그 투영이 이름과 주석뿐 아니라 **타입으로도** 표현된다.
 * `name`·`private`·`exports`·`scripts` 같은 나머지 매니페스트 필드는 이 타입에
 * 없으므로 접근하면 TS2339로 잡힌다. 인덱스 시그니처
 * (`Record<string, Record<string, string>>`)였을 때는 존재하지 않는 필드도,
 * 값 모양이 다른 필드도 조용히 통과했다.
 *
 * `Partial<>`은 런타임 사실을 반영한다 — 네 섹션을 모두 가진 매니페스트는 없다.
 * 값 타입이 `Record<string, string> | undefined`가 되고, 호출부의 `?? {}`가
 * 그것을 받는다. `Partial<>` 없이도 typecheck는 통과하지만, 그 타입은 모든 섹션이
 * 항상 있다고 주장해 `?? {}` 가드를 불필요해 보이게 만든다.
 *
 * @typedef {Partial<Record<DependencySection, Record<string, string>>>} PackageManifestDependencySections
 */

/**
 * @param {string} path
 * @returns {PackageManifestDependencySections}
 */
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** @param {string} source */
const localDeclarationSpecifiers = (source) =>
  [
    ...source.matchAll(
      /(?:from\s+|import\s*(?:type\s+)?(?:\(\s*)?)["'](\.[^"']+)["']/g,
    ),
    ...source.matchAll(/<reference\s+path=["'](\.[^"']+)["']/g),
  ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));

/**
 * @param {string} sourcePath
 * @param {string} specifier
 * @returns {string | undefined}
 */
const resolveDeclarationPath = (sourcePath, specifier) => {
  const resolved = resolve(dirname(sourcePath), specifier);
  const emittedDeclaration = /\.js$/.test(resolved)
    ? resolved.replace(/\.js$/, ".d.ts")
    : /\.mjs$/.test(resolved)
      ? resolved.replace(/\.mjs$/, ".d.mts")
      : /\.cjs$/.test(resolved)
        ? resolved.replace(/\.cjs$/, ".d.cts")
        : undefined;
  const candidates = [
    ...(emittedDeclaration === undefined ? [] : [emittedDeclaration]),
    ...(/\.d\.(?:m|c)?ts$/.test(resolved) ? [resolved] : []),
    `${resolved}.d.ts`,
    `${resolved}.d.mts`,
    `${resolved}.d.cts`,
    resolve(resolved, "index.d.ts"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
};

// 루트 매니페스트는 workspace 패키지가 아니므로 열거에 걸리지 않는다. 여기서
// 시드로 넣는다. 나머지는 저장소 상대 경로로 바꿔 실패 메시지에 그대로 쓴다.
const packageManifestPaths = [
  "package.json",
  ...workspacePackageDirectories(workspaceRoot).map((directory) =>
    relative(workspaceRoot, resolve(directory, "package.json")),
  ),
];

const failures = [];
for (const manifestPath of packageManifestPaths.sort()) {
  const manifest = readJson(resolve(workspaceRoot, manifestPath));
  for (const section of dependencySections) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      const location = `${manifestPath}#${section}.${name}`;

      if (
        forbiddenProductDependencies.some((isForbidden) => isForbidden(name))
      ) {
        failures.push(`${location} uses a forbidden product dependency`);
      }

      if (version === "workspace:*") {
        if (!name.startsWith("@cp949/geul-")) {
          failures.push(
            `${location} is not an @cp949/geul-* workspace package`,
          );
        }
        continue;
      }

      if (name.startsWith("@cp949/geul-")) {
        failures.push(`${location} must use workspace:*`);
      } else if (!exactVersion.test(version)) {
        failures.push(
          `${location} must use an exact version, found ${version}`,
        );
      }
    }
  }
}

for (const packagePath of ["packages/model", "packages/io"]) {
  const manifestPath = `${packagePath}/package.json`;
  const manifest = readJson(resolve(workspaceRoot, manifestPath));
  for (const section of productionDependencySections) {
    for (const name of Object.keys(manifest[section] ?? {})) {
      if (
        name === "react" ||
        name === "react-dom" ||
        name.startsWith("@tiptap/") ||
        name.startsWith("prosemirror-")
      ) {
        failures.push(
          `${manifestPath}#${section}.${name} crosses the headless boundary`,
        );
      }
    }
  }
}

const coreDist = resolve(workspaceRoot, "packages/core/dist");
const pendingDeclarations = [resolve(coreDist, "index.d.ts")];
const visitedDeclarations = new Set();

while (pendingDeclarations.length > 0) {
  const declarationPath = pendingDeclarations.pop();
  if (!declarationPath || visitedDeclarations.has(declarationPath)) continue;
  if (!existsSync(declarationPath)) {
    failures.push(
      `${relative(workspaceRoot, declarationPath)} is missing; build packages before checking boundaries`,
    );
    continue;
  }

  visitedDeclarations.add(declarationPath);
  const declaration = readFileSync(declarationPath, "utf8");
  if (/@tiptap|prosemirror/i.test(declaration)) {
    failures.push(
      `${relative(workspaceRoot, declarationPath)} exposes Tiptap or ProseMirror`,
    );
  }

  for (const specifier of localDeclarationSpecifiers(declaration)) {
    const dependencyPath = resolveDeclarationPath(declarationPath, specifier);
    if (
      dependencyPath !== undefined &&
      !visitedDeclarations.has(dependencyPath)
    ) {
      pendingDeclarations.push(dependencyPath);
    }
  }
}

if (failures.length > 0) {
  console.error("Package boundary check failed:\n");
  for (const failure of failures.sort()) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Package boundaries verified across ${packageManifestPaths.length} manifests and ${visitedDeclarations.size} public core declarations.`,
  );
}
