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
    devDependencies: {},
    peerDependencies: {},
    optionalDependencies: {},
  },
  "packages/core": {
    dependencies: {
      "@cp949/geul-model": "workspace:*",
      "@tiptap/core": "3.30.1",
      "@tiptap/pm": "3.30.1",
      "@tiptap/starter-kit": "3.30.1",
    },
    devDependencies: {},
    peerDependencies: {},
    optionalDependencies: {},
  },
  "packages/react": {
    dependencies: {
      "@cp949/geul-core": "workspace:*",
      react: "19.2.8",
      "react-dom": "19.2.8",
    },
    devDependencies: {
      "@tailwindcss/cli": "4.3.3",
      "@testing-library/react": "16.3.0",
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

describe("workspace dependency boundaries", () => {
  it.each(
    Object.entries(allowedDependencies),
  )("%s declares only the allowed dependency map", async (name, expectedSections) => {
    const pkg = await readPackage(name);

    for (const section of dependencySections) {
      expect(pkg[section] ?? {}).toEqual(expectedSections[section]);
    }
  });

  it.each(
    Object.entries(forbiddenDependencies),
  )("%s has no forbidden editor or UI dependency in any section", async (name, forbidden) => {
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
  ])("%s cannot compile a DOM global", async (name) => {
    const tsconfig = await readTsconfig(name);
    const fixture = `${name.replace("packages/", "")}-dom-forbidden.tsconfig.json`;
    const result = await compileFixture(fixture);

    expect(tsconfig.compilerOptions.lib).toEqual(["ES2022"]);
    expect(tsconfig.compilerOptions.types).toEqual([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("Cannot find name 'document'");
  });
});
