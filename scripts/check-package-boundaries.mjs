import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";

const workspaceRoot = resolve(import.meta.dirname, "..");
const dependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
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
 * @typedef {Record<string, Record<string, string>>} PackageManifest
 */

/**
 * @param {string} path
 * @returns {PackageManifest}
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

const packageManifestPaths = ["package.json"];
for (const directory of ["apps", "fixtures", "packages"]) {
  const directoryPath = resolve(workspaceRoot, directory);
  if (!existsSync(directoryPath)) continue;
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const manifest = resolve(directoryPath, entry.name, "package.json");
    if (entry.isDirectory() && existsSync(manifest)) {
      packageManifestPaths.push(relative(workspaceRoot, manifest));
    }
  }
}

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
