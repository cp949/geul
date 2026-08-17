import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = existsSync(resolve("vitest.config.ts"))
  ? process.cwd()
  : resolve("../..");

const localDeclarationSpecifiers = (source: string): string[] =>
  [
    ...source.matchAll(
      /(?:from\s+|import\s*(?:type\s+)?(?:\(\s*)?)["'](\.[^"']+)["']/g,
    ),
    ...source.matchAll(/<reference\s+path=["'](\.[^"']+)["']/g),
  ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));

const resolveDeclarationPath = (sourcePath: string, specifier: string) => {
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

const readReachableDeclarations = async (entrypoint: string) => {
  const pending = [entrypoint];
  const declarations = new Map<string, string>();

  while (pending.length > 0) {
    const declarationPath = pending.pop();
    if (!declarationPath || declarations.has(declarationPath)) continue;

    const source = await readFile(declarationPath, "utf8");
    declarations.set(declarationPath, source);

    for (const specifier of localDeclarationSpecifiers(source)) {
      const dependencyPath = resolveDeclarationPath(declarationPath, specifier);
      if (dependencyPath !== undefined && !declarations.has(dependencyPath)) {
        pending.push(dependencyPath);
      }
    }
  }

  return declarations;
};

describe("core 공개 선언", () => {
  beforeAll(async () => {
    const tscPath = resolve(workspaceRoot, "node_modules/typescript/bin/tsc");
    const projectPath = resolve(workspaceRoot, "packages/core/tsconfig.json");
    await execFileAsync(process.execPath, [tscPath, "-b", projectPath]);
  });

  it("도달 가능한 어떤 선언에서도 Tiptap이나 ProseMirror 타입을 노출하지 않는다", async () => {
    const distRoot = resolve(workspaceRoot, "packages/core/dist");
    const declarations = await readReachableDeclarations(
      resolve(distRoot, "index.d.ts"),
    );

    expect(
      [...declarations.entries()].map(([path, source]) => ({
        path: relative(distRoot, path),
        source,
      })),
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: expect.stringMatching(
            /@tiptap|prosemirror|EditorState|Transaction|PMNode/,
          ),
        }),
      ]),
    );
  });
});
