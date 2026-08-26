/**
 * workspace 패키지 간 의존성 경계, 경계·라이선스 게이트의 검사 범위, 그리고
 * headless 패키지 판정을 검증하는 계약.
 *
 * workspace 밖 소스와 workspace 안 패키지의 typecheck 편입 판정은
 * `tests/workspace-typecheck-coverage.test.ts`로 분리했다 — `PIT-0032`(Issue
 * #57 → #95 → #105·#106)가 지목하는 계약이고, 재발 이력이 이 파일에 남은
 * 나머지 관심사와 달라 따로 뗐다.
 *
 * 첫째는 허용/금지 의존성 목록과 DOM 전역 차단을 대조한다. 둘째와 셋째는
 * 경계 게이트와 라이선스 게이트가 각각 workspace 패키지 열거를 실제로
 * 훑는지 — 게이트를 실행해 출력이 보고하는 매니페스트 수를 열거에서 파생한
 * 기대값과 대조한다.
 *
 * 넷째는 `scripts/headless-packages.mjs`의 `HEADLESS_PACKAGES`가 tsconfig
 * `lib`에 `DOM`이 없는 workspace 패키지 집합과 같은 값인지를 그
 * 열거·tsconfig에서 파생한 기대값과 대조하고, `headlessPackageDirectories()`가
 * workspace 열거에 없는 항목을 받으면 throw하는지를 리터럴 fixture로 진다.
 * 이 목록의 **단독 소유**(사본이 없는지)는 이 파일이 아니라
 * `tests/workspace-roots.test.ts`가 진다 — 그 파일이 이미 소유한 사본 탐지
 * 술어를 여기서 복제하면 `G-TST-002` 위반이다.
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

import {
  HEADLESS_FORBIDDEN,
  HEADLESS_PACKAGES,
  headlessPackageDirectories,
} from "../scripts/headless-packages.mjs";
import { workspacePackageDirectories } from "../scripts/workspace-roots.mjs";

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
/**
 * `tsconfig.base.json`을 읽는다. `readTsconfig()`와 분리한 이유는 그 함수가
 * `<name>/tsconfig.json` 형태의 경로만 조립하기 때문이다 — base 설정은
 * 저장소 루트에 있고 이름 세그먼트가 없다.
 */
const readTsconfigBase = async () =>
  JSON.parse(
    await readFile(new URL("../tsconfig.base.json", import.meta.url), "utf8"),
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
      "@testing-library/react": "16.3.0",
      "@types/node": "22.20.1",
      autoprefixer: "10.5.4",
      esbuild: "0.28.2",
      postcss: "8.5.26",
      "postcss-cli": "11.0.1",
      sass: "1.103.1",
    },
    peerDependencies: {},
    optionalDependencies: {},
  },
  "apps/demo": {
    dependencies: {
      "@cp949/geul-io": "workspace:*",
      "@cp949/geul-model": "workspace:*",
      "@cp949/geul-react": "workspace:*",
      // Chrome 75 사용처 재현용 런타임 polyfill(ADR-0009, cp949/geul#122).
      // demo(사용처 역할)에만 허용하고 packages/*에는 추가하지 않는다.
      "core-js": "3.50.0",
      react: "19.2.8",
      "react-dom": "19.2.8",
    },
    devDependencies: {},
    peerDependencies: {},
    optionalDependencies: {},
  },
  "fixtures/consumer": {
    dependencies: {
      "@cp949/geul-core": "workspace:*",
      "@cp949/geul-io": "workspace:*",
      "@cp949/geul-model": "workspace:*",
      "@cp949/geul-react": "workspace:*",
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

/**
 * 열거된 workspace 패키지 이름 중 `allowedDependencies`에도
 * `forbiddenDependencies`에도 없는 이름을 돌려준다. 등재 계약은 "허용 목록에
 * 있어야 한다"가 아니라 "판정 목록 둘 중 하나에는 있어야 한다"이므로 OR로
 * 판정한다 — `forbiddenDependencies`에만 있는 패키지도 이미 등재된 것으로 센다.
 *
 * 순수 함수로 뽑아 리터럴 배열을 직접 넣어 단위 테스트한다(아래
 * `describe("unregisteredWorkspacePackages()(판정 목록 미등재 패키지)", ...)`). 오늘 실제
 * `forbiddenDependencies`의 키 4개가 전부 `allowedDependencies`에도 있어,
 * "`forbiddenDependencies`에만 등재된 이름도 등재로 센다"는 갈래를 실제
 * `allowedDependencies`/`forbiddenDependencies` 데이터로는 관측할 수 없다 —
 * 그 갈래를 관측하겠다고 실제 객체에 테스트용 항목을 섞으면 그 객체가 원본으로
 * 삼는 제품 판단이 오염된다.
 */
const unregisteredWorkspacePackages = (
  enumeratedNames: readonly string[],
  allowedKeys: readonly string[],
  forbiddenKeys: readonly string[],
) =>
  enumeratedNames.filter(
    (name) => !allowedKeys.includes(name) && !forbiddenKeys.includes(name),
  );

const hasForbiddenDependency = (dependency: string, forbidden: string) =>
  forbidden.endsWith("/") || forbidden.endsWith("-")
    ? dependency.startsWith(forbidden)
    : dependency === forbidden;

/**
 * tsconfig `compilerOptions.lib` 목록에 DOM 전역이 하나라도 있는지 판정한다.
 * 정확히 `"DOM"`이거나 `"DOM."`으로 시작하는 항목(`"DOM.Iterable"` 등)이
 * 하나라도 있으면 참이다 — `"DOM"`을 접두로만 판정하면 `"DOMless"` 같은
 * 가상의 이름도 걸릴 수 있어, 오늘 트리에 없는 오탐 가능성을 애초에 닫는다.
 */
const hasDomLib = (lib: readonly string[]) =>
  lib.some((entry) => entry === "DOM" || entry.startsWith("DOM."));

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
  /**
   * 열거된 workspace 패키지 전량이 `allowedDependencies` 또는
   * `forbiddenDependencies` 중 하나에는 등재돼 있어야 한다. 어느 쪽에도 없으면
   * 그 패키지가 무엇을 의존하든 이 계약은 아무 말도 하지 않는다 —
   * `fixtures/consumer`가 `dev`부터 그 상태였다(#106의 회귀가 아니다). 새
   * 패키지도 같다: 열거는 새 패키지를 보지만(#106이 그것까지 닫았다) 판정
   * 목록에는 손으로 넣지 않으면 조용히 계약 밖이다.
   *
   * `describe("workspace 패키지의 typecheck 편입")`과 같은 형태로 단언한다 —
   * 빠진 이름이 실패 메시지에 남도록 불리언이 아니라 목록으로 단언하고, 열거가
   * 통째로 죽어 빈 목록이 되는 경우를 개수 가드로 먼저 막아 단언이 공허하게
   * 통과하지 않게 한다.
   */
  it("열거된 패키지가 빠짐없이 allowedDependencies 또는 forbiddenDependencies에 등재돼 있다", () => {
    const directories = workspacePackageDirectories(repositoryRoot);
    const names = directories.map((directory) =>
      relative(repositoryRoot, directory),
    );

    expect(names.length).toBeGreaterThan(0);
    const missing = unregisteredWorkspacePackages(
      names,
      Object.keys(allowedDependencies),
      Object.keys(forbiddenDependencies),
    );

    expect(missing).toEqual([]);
  });

  it.each(Object.entries(allowedDependencies))(
    "허용된 의존성 목록만 선언한다 — %s",
    async (name, expectedSections) => {
      const pkg = await readPackage(name);

      for (const section of dependencySections) {
        expect(pkg[section] ?? {}).toEqual(expectedSections[section]);
      }
    },
  );

  it.each(Object.entries(forbiddenDependencies))(
    "어떤 섹션에도 금지된 에디터·UI 의존성을 두지 않는다 — %s",
    async (name, forbidden) => {
      const pkg = await readPackage(name);
      const dependencies = dependencySections.flatMap((section) =>
        Object.keys(pkg[section] ?? {}),
      );

      expect(
        dependencies.some((dependency) =>
          forbidden.some((name) => hasForbiddenDependency(dependency, name)),
        ),
      ).toBe(false);
    },
  );

  // `packages/model`·`packages/io` 두 문자열을 배열 리터럴로 나열하지 않는다
  // — 그렇게 적으면 `HEADLESS_PACKAGES`(`scripts/headless-packages.mjs`)의
  // 두 번째 사본이 된다. 스프레드는 배열 리터럴 안에 인용 토큰을 남기지 않아
  // `tests/workspace-roots.test.ts`의 headless 축 사본 탐지에 걸리지 않는다.
  it.each([...HEADLESS_PACKAGES])(
    "DOM 전역을 사용하면 컴파일되지 않는다 — %s",
    async (name) => {
      const tsconfig = await readTsconfig(name);
      const fixture = `${name.replace("packages/", "")}-dom-forbidden.tsconfig.json`;
      const result = await compileFixture(fixture);

      expect(tsconfig.compilerOptions.lib).toEqual(["ES2022"]);
      expect(tsconfig.compilerOptions.types).toEqual([]);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain("Cannot find name 'document'");
    },
  );

  /**
   * `HEADLESS_PACKAGES` 집합이 tsconfig `lib`에 `DOM`이 없는 workspace 패키지
   * 집합과 같은지를 진다. 기대값은 이 파일이 `HEADLESS_PACKAGES`를 다시
   * 베끼지 않고, 열거(`workspacePackageDirectories()`)와 각 패키지의 실제
   * tsconfig에서 파생한다 — 리터럴과 독립된 출발점이어야 어긋남이 드러난다.
   * `lib`가 패키지 자신의 tsconfig에 없으면 `tsconfig.base.json`의 `lib`로
   * 대체한다 — 오늘 6개 패키지 전부 자신의 tsconfig에 `lib`를 직접
   * 선언하므로 이 대체는 오늘은 죽은 경로이지만, 상속 규칙 자체를 계약으로
   * 고정해 둔다.
   */
  it("HEADLESS_PACKAGES 집합이 tsconfig lib에 DOM이 없는 workspace 패키지 집합과 같다", async () => {
    const directories = workspacePackageDirectories(repositoryRoot);
    const names = directories.map((directory) =>
      relative(repositoryRoot, directory),
    );

    // 열거가 통째로 죽으면 기대값도 함께 빈 배열이 돼 단언이 공허하게
    // 통과한다.
    expect(names.length).toBeGreaterThan(0);

    const baseTsconfig = await readTsconfigBase();
    const headlessNames: string[] = [];
    for (const name of names) {
      const tsconfig = await readTsconfig(name);
      const lib: string[] =
        tsconfig.compilerOptions.lib ?? baseTsconfig.compilerOptions.lib;
      if (!hasDomLib(lib)) headlessNames.push(name);
    }

    expect([...HEADLESS_PACKAGES].sort()).toEqual(headlessNames.sort());
  });
});

/**
 * `headlessPackageDirectories()`의 throw 경로를 리터럴 fixture로 진다. 실제
 * `HEADLESS_PACKAGES`나 `pnpm-workspace.yaml`을 건드리지 않는다 —
 * `packagePaths`와 `enumeratedDirectories`를 둘 다 합성값으로 주입한다.
 * `repoRoot`는 실제로 존재하는 경로일 필요가 없다 — 이 함수는
 * 파일시스템을 건드리지 않고 `packagePaths`를 절대 경로로 바꾼 뒤
 * `enumeratedDirectories`(문자열 집합)에 대한 멤버십만 본다.
 */
describe("headlessPackageDirectories()(headless 목록과 열거의 교차 검증)", () => {
  const repoRoot = "/repo";

  it("열거에 없는 항목이면 그 이름을 담아 throw한다", () => {
    expect(() =>
      headlessPackageDirectories(repoRoot, {
        packagePaths: ["packages/ghost"],
        enumeratedDirectories: [resolve(repoRoot, "packages/real")],
      }),
    ).toThrowError(/packages\/ghost/);
  });

  it("열거에 있는 항목만 주면 절대 경로를 입력 순서대로 낸다", () => {
    const enumeratedDirectories = [
      resolve(repoRoot, "packages/alpha"),
      resolve(repoRoot, "packages/beta"),
    ];

    expect(
      headlessPackageDirectories(repoRoot, {
        packagePaths: ["packages/beta", "packages/alpha"],
        enumeratedDirectories,
      }),
    ).toEqual([
      resolve(repoRoot, "packages/beta"),
      resolve(repoRoot, "packages/alpha"),
    ]);
  });

  it("빈 packagePaths는 빈 배열을 낸다", () => {
    expect(
      headlessPackageDirectories(repoRoot, {
        packagePaths: [],
        enumeratedDirectories: [resolve(repoRoot, "packages/alpha")],
      }),
    ).toEqual([]);
  });
});

/**
 * `HEADLESS_FORBIDDEN`이 실제로 무엇을 막는지를 진다.
 *
 * 이 술어에는 계약이 하나도 없었다(실측). 통째로 빈 배열로 만들어도
 * `pnpm vitest run tests/`가 전량 통과했고, 그 상태에서 `packages/io`의
 * `dependencies`에 `react`를 넣으면 `check-package-boundaries.mjs`가
 * `crosses the headless boundary`를 한 줄도 내지 않고 headless 검사를 통과했다
 * — 술어가 사라져도 아무것도 울리지 않는 게이트 구멍이었다.
 *
 * 판정 대상을 리터럴 표로 적어 술어 배열과 출발점을 다르게 둔다. 술어를
 * 순회해 기대값을 만들면 단언이 구현을 되뇌고 술어가 비는 변이를 그대로
 * 통과시킨다(`G-TST-002`).
 *
 * 개수는 고정하지 않는다 — 술어를 **더** 막는 방향으로 늘리는 것은 이
 * 계약이 겨누는 퇴행이 아니다. 겨누는 것은 막아야 할 이름이 통과하는 방향과
 * 막으면 안 되는 이름이 걸리는 방향 둘이다.
 */
/**
 * 게이트가 headless 검사를 **`HEADLESS_PACKAGES` 전량에** 돌리는지를 진다.
 *
 * `headlessPackageDirectories()`는 `packagePaths`를 주입받을 수 있게 열려
 * 있다 — 테스트가 실제 리터럴을 건드리지 않고 throw 경로를 지려고 연
 * 자리다. 그 문이 게이트 호출부에도 그대로 열려 있어서, 호출부가
 * `packagePaths: ["packages/io"]`처럼 목록을 좁히면 나머지 headless 패키지가
 * 검사에서 조용히 빠진다. 실측: 그 변이를 넣어도 `tests/` 전량이 통과했고
 * `packages/model`에 `@tiptap/core`를 넣은 트리에서 게이트가 exit 0을 냈다.
 *
 * 사본 탐지 축은 이 갈래를 못 잡는다 — `["packages/io"]`는 판정 토큰이
 * 1종이라 `tests/workspace-roots.test.ts`의 임계값 2 아래다. 그 임계값의
 * 근거 주석은 3종 목록을 전제로 "갈린 2종 사본까지 잡는다"고 적었는데,
 * 2종 목록에 같은 임계값을 쓰면 갈린 사본(1종)이 임계값 밖으로 나간다.
 *
 * 그래서 호출부 소스를 직접 본다 — 게이트가 `packagePaths`를 넘기지 않아야
 * 기본값인 `HEADLESS_PACKAGES` 전량이 대상이 된다.
 */
describe("경계 게이트가 headless 검사를 좁히지 않는다", () => {
  it("check-package-boundaries.mjs가 headlessPackageDirectories()에 packagePaths를 넘기지 않는다", async () => {
    const source = await readFile(
      new URL("../scripts/check-package-boundaries.mjs", import.meta.url),
      "utf8",
    );
    const callIndex = source.indexOf("headlessPackageDirectories(");

    // 호출 자체가 사라지는 방향(headless 검사 통째 제거)도 함께 잡는다.
    expect(callIndex).toBeGreaterThan(-1);

    // 호출 인자 범위만 본다 — 파일 어디든 `packagePaths`가 있으면 걸리는
    // 형태로 넓히면 주석이나 무관한 코드에 오탐한다.
    const callArguments = source.slice(
      callIndex,
      source.indexOf("))", callIndex),
    );

    expect(callArguments).not.toMatch(/packagePaths/);
  });
});

describe("headless 패키지의 금지 production 의존성 판정", () => {
  const isForbidden = (name: string) =>
    HEADLESS_FORBIDDEN.some((predicate) => predicate(name));

  it.each([
    "react",
    "react-dom",
    "@tiptap/core",
    "@tiptap/extension-table",
    "prosemirror-model",
    "prosemirror-view",
  ])("headless 패키지에서 막는다 — %s", (name) => {
    expect(isForbidden(name)).toBe(true);
  });

  // 음성 fixture는 각 술어의 **경계 바로 바깥**을 겨눈다. 그래야 접두 판정이
  // 슬래시·하이픈 경계를 잃고 넓어지는 변이가 잡힌다 — 실측: `@tiptap/`에서
  // 슬래시를 빼면 `@tiptap-pro/table`·`@tiptapx/core`가, `prosemirror-`에서
  // 하이픈을 빼면 `prosemirror`가, 정확 판정을 접두로 바꾸면 `reactive-store`가
  // 걸린다. 경계 안쪽 이름만 늘어놓으면 그 변이가 전부 통과한다.
  it.each([
    "zod",
    "unified",
    "hast-util-sanitize",
    "@cp949/geul-model",
    "reactive-store",
    "prosemirror",
    "prosemirrorx",
    "my-react",
    "@tiptap-pro/table",
    "@tiptapx/core",
  ])("headless 패키지에서 막지 않는다 — %s", (name) => {
    expect(isForbidden(name)).toBe(false);
  });
});

/**
 * `unregisteredWorkspacePackages()` 자체를 리터럴 배열로 직접 단위 테스트한다.
 * 위 "워크스페이스 의존성 경계" describe의 등재 완전성 단언은 실제
 * `allowedDependencies`/`forbiddenDependencies`를 대상으로 하는데, 오늘 그
 * 데이터에서는 `forbiddenDependencies`의 키 4개가 전부 `allowedDependencies`에도
 * 있어 "OR 판정"과 "allowedDependencies 단독 판정"이 완전히 같은 결과를 낸다 —
 * 판정을 allowedDependencies 단독으로 좁혀도 실제 트리로는 그 퇴행이 드러나지
 * 않는다. 그 갈래(forbiddenDependencies에만 등재된 이름)를 실제 객체에 테스트용
 * 항목을 섞지 않고 짚기 위해 순수 함수를 리터럴 배열 fixture로 직접 부른다.
 */
describe("unregisteredWorkspacePackages()(판정 목록 미등재 패키지)", () => {
  it("두 목록 어디에도 없는 이름만 남긴다", () => {
    expect(
      unregisteredWorkspacePackages(["a", "b", "c"], ["a"], ["b"]),
    ).toEqual(["c"]);
  });

  it("allowedDependencies에만 등재된 이름은 등재로 센다", () => {
    expect(unregisteredWorkspacePackages(["a"], ["a"], [])).toEqual([]);
  });

  it("forbiddenDependencies에만 등재된 이름도 등재로 센다 — 오늘 실제 트리로는 관측 불가능한 갈래", () => {
    expect(unregisteredWorkspacePackages(["a"], [], ["a"])).toEqual([]);
  });

  it("열거가 비어 있으면 아무것도 남기지 않는다", () => {
    expect(unregisteredWorkspacePackages([], ["a"], ["b"])).toEqual([]);
  });
});

/**
 * `scripts/` 아래의 게이트 스크립트를 자식 프로세스로 돌려 exit code와 출력을
 * 값으로 돌려준다. `execFileAsync`는 비정상 종료를 예외로 바꾸므로
 * `compileFixture`와 같은 형태로 잡는다 — 게이트가 진 이유(stderr에 나오는 위반
 * 목록)를 단언 실패 메시지에 그대로 싣기 위해서다. 게이트는 저장소 루트를
 * `import.meta.dirname` 기준으로 잡으므로 cwd를 지정하지 않는다.
 *
 * 스크립트 이름을 인자로 받는다. 경계 게이트와 라이선스 게이트가 이 함수 하나를
 * 공유한다 — 게이트마다 같은 try/catch를 다시 적으면 사본이 갈리고, 한쪽만
 * 고친 뒤 어느 쪽이 옳은지 판단할 근거가 사라진다(`G-TST-002`).
 */
const runGate = async (scriptName: string) => {
  const scriptPath = fileURLToPath(
    new URL(`../scripts/${scriptName}`, import.meta.url),
  );

  try {
    const { stdout } = await execFileAsync(process.execPath, [scriptPath], {
      maxBuffer: maxStdoutBuffer,
    });
    return { exitCode: 0, output: stdout };
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

const reportedManifestCount = /across (\d+) manifests/;

/**
 * 위 describe들과 축이 다르다. 저쪽은 열거의 **결과**를 대조하고, 여기는 게이트가
 * 그 열거를 실제로 쓰는지를 게이트 자신의 출력으로 확인한다.
 *
 * `scripts/check-package-boundaries.mjs`가 `workspacePackageDirectories()`를
 * 잃으면 — 그 호출을 빈 목록으로 바꾸는 것으로 충분하다 — 루트 매니페스트 하나만
 * 훑고 나머지를 전부 건너뛴 채 exit 0으로 통과한다. 실측: 그 상태에서
 * `packages/react`에 금지 접두이면서 비정확 버전인 `xl-foo@^1.0.0`을 넣으면
 * 정상 게이트는 위반 2건으로 exit 1인데, 열거를 잃은 게이트는
 * `Verified across 1 manifests`로 exit 0이다. 출력에 남는 유일한 흔적이 매니페스트
 * 수 하나인데 그때까지 아무도 그 수를 대조하지 않았다.
 *
 * 기대값은 트리에서 파생한다. 현재 값을 상수로 적으면 열거가 죽는 것과 같은
 * 방향으로 이 단언도 함께 썩는다. `+1`은 루트 `package.json` 시드다 — 루트
 * 매니페스트는 workspace 패키지가 아니라 열거에 걸리지 않으므로 게이트가 직접
 * 앞에 붙인다. 그 시드가 사라져도 이 단언이 발화한다.
 *
 * 두 스크립트가 같은 `workspacePackageDirectories()`를 쓰므로 **공유 함수 자체의
 * 무력화는 이 단언 하나로도 잡힌다.** 남는 것은 게이트마다의 로컬 무력화라
 * `scripts/check-licenses.mjs` 쪽은 아래 describe가 따로 진다.
 *
 * 이 단언은 `packages/core/dist`의 공개 선언이 있어야 성립한다 — 게이트가 그것까지
 * 훑고, 없으면 `packages/core/dist/index.d.ts is missing; build packages before
 * checking boundaries`를 위반으로 세어 exit 1이다(실측). 그래서 이 describe가
 * `beforeAll`에서 `tsc -b packages/core/tsconfig.json`으로 dist를 직접 만든다.
 *
 * 빌드를 다른 곳에 맡기지 않는 이유는 `vitest.config.ts`가 `core`와 `node`
 * 프로젝트를 나열만 하고 둘 사이의 의존을 선언하지 않기 때문이다. 어느 프로젝트가
 * 먼저 도는지 보장이 없고, 프로젝트 필터·파일 필터·샤딩은 이 파일만 남길 수 있다 —
 * 실측으로 dist 없는 트리에서 `vitest run tests/`가 위 메시지로 졌다.
 *
 * `tsc -b`는 증분이라 dist가 최신이면 아무것도 다시 만들지 않는다. 실측 소요는
 * 이 저장소가 고정한 typescript 7.0.2 기준 core만 cold일 때 0.17초, 참조하는
 * model·io까지 전부 cold일 때 0.22초라 vitest 훅 기본 타임아웃 안에서 끝난다.
 */
describe("경계 게이트의 검사 범위", () => {
  beforeAll(async () => {
    const tscPath = fileURLToPath(
      new URL("../node_modules/typescript/bin/tsc", import.meta.url),
    );
    const projectPath = fileURLToPath(
      new URL("../packages/core/tsconfig.json", import.meta.url),
    );

    await execFileAsync(process.execPath, [tscPath, "-b", projectPath]);
  });

  it("열거된 workspace 패키지에 루트 매니페스트를 더한 수만큼 훑고 위반 없이 끝난다", async () => {
    const directories = workspacePackageDirectories(repositoryRoot);
    const result = await runGate("check-package-boundaries.mjs");

    // 열거가 통째로 죽으면 기대값도 함께 줄어 단언이 무력화를 되뇐다.
    expect(directories.length).toBeGreaterThan(0);
    // 위반이 없는 트리라는 전제부터 확인한다. 실패하면 게이트 출력이 그대로
    // 메시지에 실린다.
    expect(result.exitCode, result.output).toBe(0);
    expect(reportedManifestCount.exec(result.output)?.[1], result.output).toBe(
      String(directories.length + 1),
    );
  });
});

/**
 * 바로 위 describe의 짝이다. 축은 같고 대상 게이트만 다르다 — 게이트가 열거를
 * 실제로 쓰는지를 게이트 자신의 출력으로 확인한다.
 *
 * 공유 열거(`workspacePackageDirectories()`)의 무력화는 위 describe만으로도
 * 잡힌다. 여기가 지는 것은 그 함수를 그대로 둔 채 **호출 결과만 로컬에서
 * 줄이는** 갈래다. 실측: `scripts/check-licenses.mjs`의 `manifestPaths` 계산에
 * `.filter((directory) => !directory.includes("/fixtures/"))`를 끼우고
 * `fixtures/consumer`의 `dependencies`에 미승인 `left-pad@1.3.0`을 넣으면, 정상
 * 게이트는 `... was not found in the production license graph`로 exit 1인데
 * 무력화된 게이트는 exit 0으로 통과한다. import 구문이 그대로 남아 있어
 * `tests/workspace-roots.test.ts`의 두 축도 함께 통과한다 — 그 파일의 축 1은
 * import 구문만, 축 2는 배열 리터럴만 본다.
 *
 * `fixtures/consumer`를 그 실험의 대상으로 삼았던 것은 그때 이 파일의
 * `allowedDependencies`가 5개 패키지만 덮고 거기에 없었기 때문이다. 그 뒤
 * `fixtures/consumer`도 `allowedDependencies`에 등재해 그 문장은 더 이상
 * 사실이 아니다 — 이제 다른 패키지와 마찬가지로 여기에 미승인 의존성을
 * 주입하면 위 "워크스페이스 의존성 경계" describe의 `allowedDependencies`
 * 단언이 그 자체로 먼저 진다.
 *
 * 그래도 이 describe가 겨누는 무력화(공유 열거는 그대로 두고 로컬 필터로 호출
 * 결과만 줄이는 것)를 재현하려면 여전히 `fixtures/consumer`를 대상으로 삼는다
 * — 위 실측이 거는 로컬 필터가 `/fixtures/` 경로 하나만 겨누고, workspace
 * 안에 그 경로를 가진 패키지가 이것 하나뿐이라 다른 패키지로는 무력화 전/후로
 * exit code가 갈리는 대조 자체가 성립하지 않는다. 다만 재현 중에는
 * `allowedDependencies` 단언이 같은 이유로 항상 함께 지므로,
 * `pnpm vitest run tests/`로 전체를 같이 돌려 관찰하지 않는다 — 로컬로 고친
 * `scripts/check-licenses.mjs`만 직접 실행해(`node scripts/check-licenses.mjs`,
 * 이 파일의 `runGate`와 같은 방식) exit code·출력을 관찰한다. 그래야 무관한
 * 실패가 신호에 섞이지 않는다.
 *
 * 기대값에 `+1`이 없다. 경계 게이트와 달리 이 게이트는 루트 `package.json`을
 * 시드로 넣지 않고 열거 결과만 훑는다(실측: 경계 게이트 7, 라이선스 게이트 6).
 * 시드가 생기면 이 단언이 발화하고, 그때 어느 쪽이 옳은지 사람이 판단한다.
 *
 * 게이트가 `pnpm licenses list --prod --json`을 자식 프로세스로 띄워 위 describe의
 * 게이트보다 느리다. 실측 소요는 3회 연속 1.01·0.96·0.97초로 vitest 기본
 * testTimeout(5초) 안에서 끝나므로 timeout을 명시하지 않는다 — 이 파일의 다른
 * 자식 프로세스 테스트들과 같은 처리다.
 *
 * 위 describe의 `beforeAll`(=`packages/core/dist` 빌드)이 필요 없어 describe를
 * 나눴다. 이 게이트는 공개 선언을 훑지 않는다.
 */
describe("라이선스 게이트의 검사 범위", () => {
  it("열거된 workspace 패키지 수만큼 훑고 위반 없이 끝난다", async () => {
    const directories = workspacePackageDirectories(repositoryRoot);
    const result = await runGate("check-licenses.mjs");

    // 열거가 통째로 죽으면 기대값도 함께 줄어 단언이 무력화를 되뇐다.
    expect(directories.length).toBeGreaterThan(0);
    // 위반이 없는 트리라는 전제부터 확인한다. 실패하면 게이트 출력이 그대로
    // 메시지에 실린다.
    expect(result.exitCode, result.output).toBe(0);
    expect(reportedManifestCount.exec(result.output)?.[1], result.output).toBe(
      String(directories.length),
    );
  });
});
