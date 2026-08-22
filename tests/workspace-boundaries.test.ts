/**
 * workspace 패키지 간 의존성 경계와, workspace glob 밖 최상위 소스
 * 디렉터리의 typecheck 편입, 그리고 workspace 안 패키지의 typecheck 편입을
 * 검증하는 계약.
 *
 * 첫째는 허용/금지 의존성 목록과 DOM 전역 차단을 대조한다. 둘째는
 * `git ls-files`로 발견한 디렉터리마다 셋을 대조한다 — 전용 tsconfig.json과
 * 루트 typecheck 체인 연결, tsc `--listFilesOnly`가 그 디렉터리의 추적 소스를
 * 실제 컴파일 대상에 넣는지(빠진 파일은 같은 디렉터리의 다른 tsconfig가
 * 컴파일해야 정당하다), JS 소스가 있으면 `allowJs`·`checkJs`를 켜고
 * `include`가 확장자를 거르지 않는지. 셋째는 열거된 workspace 패키지가
 * 빠짐없이 `scripts.typecheck`를 정의하는지 — turbo는 그 정의가 없는 패키지를
 * 대상에서 조용히 빼고 남은 태스크만 실행한다.
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import {
  WORKSPACE_ROOTS,
  workspacePackageDirectories,
} from "../scripts/workspace-roots.mjs";

// 저장소 루트를 cwd가 아니라 이 파일 위치로 잡는다. 이 파일의 다른 헬퍼가
// 전부 `import.meta.url` 기준이고, cwd 상대면 잘못된 cwd에서 열거가 빈
// 집합이 돼 단언이 공허하게 통과한다.
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

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

// 이 파일이 실행하는 tsc·git의 stdout 상한. Node 기본값은 1MB이고, 넘으면
// 결과 대신 ERR_CHILD_PROCESS_STDIO_MAXBUFFER로 죽어 원인 추적이 어렵다.
// 현재 최대 출력은 `tsc -p tests/tsconfig.json --listFilesOnly`의 25KB로
// 여유가 40배 넘게 남지만, 그 출력의 대부분은 lib과 `@types/node`이고
// (`skipLibCheck`와 무관하게 --listFilesOnly는 그대로 나열한다) 소스가
// 늘수록 함께 커지므로 1MB는 프로젝트가 커지면 닿을 수 있는 값이다.
const maxStdoutBuffer = 32 * 1024 * 1024;

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

const typecheckedExtension = /\.(?:m|c)?[jt]sx?$/;

/**
 * `git ls-files`로 추적 파일을 훑어 워크스페이스 루트(`WORKSPACE_ROOTS`) 밖에서
 * typecheck 대상 확장자(`.js`/`.mjs`/`.cjs`/`.ts`/`.jsx`/`.tsx`)를 가진 최상위
 * 디렉터리를 찾는다. 워크스페이스 루트를 이 파일에 리터럴로 다시 적지 않고
 * `scripts/workspace-roots.mjs`의 `WORKSPACE_ROOTS`를 재사용한다 — 그 상수는
 * `tests/workspace-roots.test.ts`가 `pnpm-workspace.yaml`과의 어긋남을 잡는
 * 계약 테스트로 감시한다. 여기서 사본을 새로 만들면 `pnpm-workspace.yaml`에서
 * 루트가 빠져도 이 테스트만 조용히 옛 목록을 계속 써 그 디렉터리를 영영
 * 제외하는 사각지대가 생긴다 — 이 테스트가 막으려는 것과 같은 형태다.
 */
const trackedTopLevelSourceDirectories = async () => {
  const { stdout } = await execFileAsync("git", ["ls-files"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    maxBuffer: maxStdoutBuffer,
  });
  const directories = stdout
    .split("\n")
    .filter((path) => path.includes("/") && typecheckedExtension.test(path))
    .map((path) => path.slice(0, path.indexOf("/")))
    .filter((directory) => !WORKSPACE_ROOTS.includes(directory));

  return [...new Set(directories)].sort();
};

/**
 * 루트 `package.json`의 `typecheck` 스크립트 값에서 `pnpm <스크립트명>` 참조를
 * 한 단계 펼쳐, 실제로 실행되는 tsc 명령 전체를 하나의 문자열로 이어붙인다.
 * `-p <dir>/tsconfig.json`이 체인 안에 있는지 문자열 포함으로 대조하기 위한 것이다.
 * `pnpm run <스크립트명>`도 `pnpm <스크립트명>`과 완전히 같은 실행이므로 `run`을
 * 선택적으로 흡수한다 — 흡수하지 않으면 `run` 자체가 스크립트명으로 잡혀
 * `scripts["run"]`이 없어 확장이 통째로 죽는다. 게이트는 그대로인데 표기만
 * 정규 형태로 바꿔도 이 테스트가 지는 거짓 실패가 그때 생긴다.
 */
const typecheckedProjectPaths = async () => {
  const root = await readPackage(".");
  const scripts: Record<string, string> = root.scripts;
  const typecheck = scripts.typecheck ?? "";
  const resolved = [typecheck];

  for (const match of typecheck.matchAll(/pnpm\s+(?:run\s+)?([\w:-]+)/g)) {
    const name = match[1];
    if (name !== undefined && scripts[name] !== undefined) {
      resolved.push(scripts[name]);
    }
  }

  return resolved.join(" ");
};

const jsSourceExtension = /\.(?:m|c)?js$/;

/**
 * `tsc -p <projectPath> --listFilesOnly`로 그 tsconfig가 실제로 컴파일 대상에
 * 넣는 파일의 절대 경로 목록을 얻는다. `--listFilesOnly`는 타입 검사 없이 파일만
 * 나열해 빠르고, 일부러 타입 오류를 담은 fixture 프로젝트에도 exit 0으로 답한다.
 * `include`/`exclude` glob을 이 파일이 직접 흉내 내지 않고 tsc에게 그대로 묻는다 —
 * 그래야 `include`가 좁아지는 회귀를 `tsconfig.json`을 다시 파싱하지 않고도 잡는다.
 * 인자는 디렉터리명이 아니라 저장소 상대 프로젝트 경로다 — 디렉터리 대표
 * tsconfig와 `tests/fixtures/io-dom-forbidden.tsconfig.json` 같은 중첩 tsconfig를
 * 같은 함수로 물어보기 위해서다. `compileFixture`와 같은 방식으로
 * `node_modules/typescript/bin/tsc`를 직접 실행한다.
 */
const compiledFilePaths = async (projectPath: string) => {
  const tscPath = fileURLToPath(
    new URL("../node_modules/typescript/bin/tsc", import.meta.url),
  );
  const resolvedProject = fileURLToPath(
    new URL(`../${projectPath}`, import.meta.url),
  );
  const { stdout } = await execFileAsync(
    process.execPath,
    [tscPath, "--project", resolvedProject, "--listFilesOnly"],
    { maxBuffer: maxStdoutBuffer },
  );

  return stdout
    .split("\n")
    .filter((path) => path.length > 0 && !path.includes("/node_modules/"));
};

/**
 * `git ls-files -- <directory>`로 그 디렉터리 아래 추적 파일 중 typecheck 대상
 * 확장자를 가진 것의 저장소 상대 경로를 돌려준다. 검사 대상 tsconfig의 `exclude`를
 * 읽지 않는 것이 핵심이다 — 기대값을 검사 대상이 스스로 정하면 `exclude` 한 줄로
 * 파일을 게이트 밖으로 빼도 기대값이 같이 줄어 단언이 구현을 되뇔 뿐 아무것도
 * 막지 못한다(`include` 축소·`checkJs` 해제와 같은 부류의 무력화 경로다).
 * 컴파일에서 빠진 파일이 정당한 예외인지는 기대값을 깎아서가 아니라
 * `nestedTsconfigCompiledFiles`로 같은 디렉터리의 다른 tsconfig가 그 파일을
 * 실제로 컴파일하는지 확인해서 판정한다.
 */
const trackedSourceFiles = async (directory: string) => {
  const { stdout } = await execFileAsync("git", ["ls-files", "--", directory], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    maxBuffer: maxStdoutBuffer,
  });

  return stdout.split("\n").filter((path) => typecheckedExtension.test(path));
};

const tsconfigFileName = /(?:^|\/)[^/]*tsconfig\.json$/;

/**
 * `<directory>` 아래 추적 tsconfig 중 그 디렉터리 대표 tsconfig
 * (`<directory>/tsconfig.json`)를 뺀 나머지가 컴파일하는 파일의 합집합.
 * 대표 tsconfig가 빠뜨린 파일이 "다른 tsconfig가 대신 검사하는 정당한 예외"임을
 * 보이는 독립 근거로 쓴다 — `tests/fixtures/dom-lib-forbidden.ts`가 그 경우로,
 * DOM 전역 차단을 확인하려고 fixture 전용 tsconfig 2개로만 컴파일한다.
 * 대상은 `tsconfig.json`만이 아니라 `io-dom-forbidden.tsconfig.json`처럼
 * 접미 형태의 파일명도 포함해야 하므로 파일명 패턴으로 찾는다.
 */
const nestedTsconfigCompiledFiles = async (directory: string) => {
  const { stdout } = await execFileAsync("git", ["ls-files", "--", directory], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    maxBuffer: maxStdoutBuffer,
  });
  const projects = stdout
    .split("\n")
    .filter(
      (path) =>
        tsconfigFileName.test(path) && path !== `${directory}/tsconfig.json`,
    );
  const compiled: string[] = [];

  for (const project of projects) {
    compiled.push(...(await compiledFilePaths(project)));
  }

  return compiled;
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

describe("workspace 밖 소스 디렉터리의 typecheck 편입", () => {
  it("전용 tsconfig를 갖고 루트 typecheck 체인에서 도달할 수 있다", async () => {
    const directories = await trackedTopLevelSourceDirectories();
    const chain = await typecheckedProjectPaths();

    expect(directories.length).toBeGreaterThan(0);
    for (const directory of directories) {
      expect(chain).toContain(`-p ${directory}/tsconfig.json`);
      expect(await readTsconfig(directory)).toBeTypeOf("object");
    }
  });

  it("각 디렉터리의 추적 소스 파일을 tsconfig의 실제 컴파일 대상에 전부 포함한다", async () => {
    const directories = await trackedTopLevelSourceDirectories();

    expect(directories.length).toBeGreaterThan(0);
    for (const directory of directories) {
      const tracked = await trackedSourceFiles(directory);
      const compiled = await compiledFilePaths(`${directory}/tsconfig.json`);

      expect(tracked.length).toBeGreaterThan(0);
      const missing = tracked.filter(
        (file) => !compiled.some((path) => path.endsWith(`/${file}`)),
      );
      // 중첩 tsconfig는 대표 tsconfig가 빠뜨린 파일이 있을 때만 실행한다 —
      // 지금 해당하는 디렉터리는 tests 하나뿐이라 나머지에서 tsc를 헛돌리지 않는다.
      const nested =
        missing.length > 0 ? await nestedTsconfigCompiledFiles(directory) : [];
      const uncovered = missing.filter(
        (file) => !nested.some((path) => path.endsWith(`/${file}`)),
      );

      expect(uncovered).toEqual([]);
    }
  });

  it("JS 소스를 가진 디렉터리의 tsconfig는 allowJs·checkJs를 켜고 include로 확장자를 거르지 않는다", async () => {
    const directories = await trackedTopLevelSourceDirectories();
    const jsSourceDirectories: string[] = [];

    for (const directory of directories) {
      const tracked = await trackedSourceFiles(directory);
      if (tracked.some((file) => jsSourceExtension.test(file))) {
        jsSourceDirectories.push(directory);
      }
    }

    // checkJs/allowJs는 tsconfig.base.json이 설정하지 않으므로 각 tsconfig
    // 자신의 compilerOptions만 읽어도 최종 판정과 같다.
    //
    // include도 이 디렉터리에서만 확장자 비의존(["**/*"])을 요구한다 —
    // 게이트를 실행하는 도구(scripts/*.mjs) 자신이 여기 모이고 앞으로
    // 확장자가 늘 수 있는 데다, scripts/를 통째로 놓친 것이 Issue #95의
    // 발단이었다. 앞 it의 --listFilesOnly 대조는 그 확장자의 파일이 실제로
    // 하나라도 생겨야 발화하므로, include가 좁아지는 순간 자체는 이 단언이
    // 더 먼저 잡는다.
    //
    // 다만 include를 리터럴 ["**/*"]와 동등 비교하지는 않는다. ["./**/*"]와
    // include 생략(tsc의 기본값이 정확히 "**/*"다)은 컴파일 대상 파일 집합이
    // ["**/*"]와 완전히 같고, ["**/*", "../types/**/*.d.ts"]처럼 넓히는 추가도
    // 게이트를 약화하지 않는다. 리터럴 비교는 이 셋을 전부 거짓 실패로 만들어,
    // 정당한 tsconfig 변경을 되돌리는 것 말고는 통과시킬 길이 없게 만든다.
    // 그래서 "이 문자열인가"가 아니라 "확장자로 거르지 않고 하위 디렉터리까지
    // 덮는 패턴이 하나라도 있는가"라는 속성을 단언한다 — 확장자로 거르는
    // ["**/*.mjs"]와 하위 디렉터리를 빼는 ["*"]는 그대로 걸린다.
    expect(jsSourceDirectories.length).toBeGreaterThan(0);
    for (const directory of jsSourceDirectories) {
      const tsconfig = await readTsconfig(directory);
      const patterns: string[] = tsconfig.include ?? ["**/*"];

      expect(tsconfig.compilerOptions.allowJs).toBe(true);
      expect(tsconfig.compilerOptions.checkJs).toBe(true);
      // 실패 메시지가 expected false to be true로만 남지 않도록 실제 include를 붙인다.
      expect(
        patterns.some((pattern) => pattern.replace(/^\.\//, "") === "**/*"),
        `${directory}/tsconfig.json include: ${JSON.stringify(patterns)}`,
      ).toBe(true);
    }
  });
});

/**
 * 바로 위 describe의 짝이다. 저쪽은 workspace **밖** 디렉터리를 다루면서
 * "workspace **안**은 turbo가 덮는다"를 말없이 전제하는데, 그 전제를 지는
 * 것이 없었다. 여기가 진다.
 *
 * `turbo run typecheck`는 그 태스크를 **정의한 패키지에서만** 돈다. 워크스페이스
 * 패키지가 `scripts.typecheck`를 잃으면 turbo는 그 패키지를 대상에서 조용히
 * 빼고 남은 태스크만 실행해 exit 0으로 통과한다 — 실측으로 `apps/demo`의
 * `scripts.typecheck`를 지우면 `Tasks: 9 successful, 9 total`에 exit 0이고,
 * `--dry=json`은 그 태스크를 계속 나열하되 `command`만 `<NONEXISTENT>`로
 * 바뀐다. 게이트 출력에 남는 차이가 태스크 수 하나뿐이라 아무도 보지 않는다.
 * 그 패키지의 타입 오류는 그때부터 영영 보고되지 않는다.
 *
 * 열거 자체의 계약(`pnpm-workspace.yaml`이 선언한 루트와
 * `workspacePackageDirectories()`가 찾는 디렉터리 집합이 같은지)은
 * `tests/workspace-roots.test.ts`가 단독으로 진다. 여기서 매니페스트를 다시
 * 파싱해 같은 대조를 쓰면 계약의 주인이 둘이 된다(`PIT-0022`). 대신 발견
 * 개수 가드를 둔다 — 열거가 통째로 죽으면 빈 집합 순회가 아무 단언도 실행하지
 * 않은 채 통과한다.
 *
 * 단언 대상은 `typecheck` 하나다. `build`나 `test`로 넓히지 않는다 —
 * `fixtures/consumer`는 `typecheck` 단일 스크립트만 가진 패키지라 즉시 거짓
 * 실패한다.
 */
describe("workspace 패키지의 typecheck 편입", () => {
  it("열거된 패키지가 빠짐없이 비어 있지 않은 typecheck 스크립트를 정의한다", async () => {
    const directories = workspacePackageDirectories(repositoryRoot);
    const packages = await Promise.all(
      directories.map(async (directory) => {
        const name = relative(repositoryRoot, directory);
        return { name, scripts: (await readPackage(name)).scripts ?? {} };
      }),
    );

    expect(packages.length).toBeGreaterThan(0);
    // 빠진 패키지 이름이 실패 메시지에 그대로 남도록 불리언이 아니라 목록으로
    // 단언한다.
    const missing = packages
      .filter(
        ({ scripts }) =>
          typeof scripts.typecheck !== "string" ||
          scripts.typecheck.length === 0,
      )
      .map(({ name }) => name);

    expect(missing).toEqual([]);
  });
});
