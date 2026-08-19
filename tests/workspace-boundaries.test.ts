import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const readPackage = async (name: string) =>
  JSON.parse(
    await readFile(new URL(`../${name}/package.json`, import.meta.url), "utf8"),
  );
const readTsconfig = async (name: string) =>
  JSON.parse(
    await readFile(
      new URL(`../${name}/tsconfig.json`, import.meta.url),
      "utf8",
    ),
  );
const execFileAsync = promisify(execFile);

const dependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

const allowedDependencies = {
  "packages/model": {
    dependencies: { zod: "4.4.3" },
    devDependencies: {},
    peerDependencies: {},
    optionalDependencies: {},
  },
  "packages/io": {
    dependencies: {
      "@cp949/geul-model": "workspace:*",
      "hast-util-sanitize": "5.0.2",
      "rehype-parse": "9.0.1",
      "rehype-stringify": "10.0.1",
      "remark-gfm": "4.0.1",
      "remark-parse": "11.0.0",
      "remark-stringify": "11.0.0",
      unified: "11.0.5",
    },
    devDependencies: { "@types/node": "22.20.1" },
    peerDependencies: {},
    optionalDependencies: {},
  },
  "packages/core": {
    dependencies: {
      "@cp949/geul-io": "workspace:*",
      "@cp949/geul-model": "workspace:*",
      "@tiptap/core": "3.30.1",
      "@tiptap/pm": "3.30.1",
      "@tiptap/starter-kit": "3.30.1",
    },
    devDependencies: { "@types/node": "22.20.1" },
    peerDependencies: {},
    optionalDependencies: {},
  },
  "packages/react": {
    dependencies: {
      "@cp949/geul-core": "workspace:*",
      "lucide-react": "1.31.0",
      react: "19.2.8",
      "react-dom": "19.2.8",
    },
    devDependencies: {
      "@tailwindcss/cli": "4.3.3",
      "@testing-library/react": "16.3.0",
      "@types/node": "22.20.1",
      tailwindcss: "4.3.3",
    },
    peerDependencies: {},
    optionalDependencies: {},
  },
  "apps/demo": {
    dependencies: {
      "@cp949/geul-io": "workspace:*",
      "@cp949/geul-model": "workspace:*",
      "@cp949/geul-react": "workspace:*",
      react: "19.2.8",
      "react-dom": "19.2.8",
    },
    devDependencies: {},
    peerDependencies: {},
    optionalDependencies: {},
  },
};

const forbiddenDependencies = {
  "packages/model": ["react", "@tiptap/", "prosemirror-"],
  "packages/io": ["react", "@tiptap/", "prosemirror-"],
  "packages/core": ["react"],
  "packages/react": ["@tiptap/", "prosemirror-"],
};

const hasForbiddenDependency = (dependency: string, forbidden: string) =>
  forbidden.endsWith("/") || forbidden.endsWith("-")
    ? dependency.startsWith(forbidden)
    : dependency === forbidden;

const compileFixture = async (fixture: string) => {
  const tscPath = fileURLToPath(
    new URL("../node_modules/typescript/bin/tsc", import.meta.url),
  );
  const fixturePath = fileURLToPath(
    new URL(`./fixtures/${fixture}`, import.meta.url),
  );

  try {
    await execFileAsync(process.execPath, [tscPath, "--project", fixturePath]);
    return { exitCode: 0, output: "" };
  } catch (error) {
    const commandError = error as {
      code: number;
      stderr: string;
      stdout: string;
    };
    return {
      exitCode: commandError.code,
      output: `${commandError.stdout}${commandError.stderr}`,
    };
  }
};

describe("워크스페이스 의존성 경계", () => {
  it.each(
    Object.entries(allowedDependencies),
  )("허용된 의존성 목록만 선언한다 — %s", async (name, expectedSections) => {
    const pkg = await readPackage(name);

    for (const section of dependencySections) {
      expect(pkg[section] ?? {}).toEqual(expectedSections[section]);
    }
  });

  it.each(
    Object.entries(forbiddenDependencies),
  )("어떤 섹션에도 금지된 에디터·UI 의존성을 두지 않는다 — %s", async (name, forbidden) => {
    const pkg = await readPackage(name);
    const dependencies = dependencySections.flatMap((section) =>
      Object.keys(pkg[section] ?? {}),
    );

    expect(
      dependencies.some((dependency) =>
        forbidden.some((name) => hasForbiddenDependency(dependency, name)),
      ),
    ).toBe(false);
  });

  it.each([
    "packages/model",
    "packages/io",
  ])("DOM 전역을 사용하면 컴파일되지 않는다 — %s", async (name) => {
    const tsconfig = await readTsconfig(name);
    const fixture = `${name.replace("packages/", "")}-dom-forbidden.tsconfig.json`;
    const result = await compileFixture(fixture);

    expect(tsconfig.compilerOptions.lib).toEqual(["ES2022"]);
    expect(tsconfig.compilerOptions.types).toEqual([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("Cannot find name 'document'");
  });
});
