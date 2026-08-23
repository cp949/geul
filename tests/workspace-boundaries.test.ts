/**
 * workspace 패키지 간 의존성 경계와, workspace glob 밖 최상위 소스
 * 디렉터리의 typecheck 편입, 그리고 workspace 안 패키지의 typecheck 편입을
 * 검증하는 계약.
 *
 * 첫째는 허용/금지 의존성 목록과 DOM 전역 차단을 대조한다. 둘째는 추적 소스
 * 파일 전량이 루트 `typecheck` 체인이 실행하는 프로그램의 컴파일 대상에
 * 드는지를 대조한다 — `.js`/`.mjs`/`.cjs`/`.jsx`는 그 프로그램의 `checkJs`가
 * 켜져 있어야 커버로 세고, 예외로 둔 파일은 실제로 존재하고 짝지은 tsconfig가
 * 실제로 컴파일하며 체인 커버리지 밖에 있는지까지 확인한다. 발견이 통째로
 * 죽는 것과 workspace 패키지가 프로그램을 하나도 못 내는 것은 각각 가드와
 * 즉시 throw로 잡는다. 같은 describe에 남은 옛 `it`은 JS 소스가 있는 최상위
 * 디렉터리의 tsconfig가 `allowJs`·`checkJs`를 켜고 `include`가 확장자를
 * 거르지 않는지를 여전히 디렉터리 축으로 대조한다 — 발견 축이 둘인 중간
 * 상태이고, 의도한 것이다(`DELTA-03`이 하나로 되돌린다). 셋째는 열거된
 * workspace 패키지가 빠짐없이 `scripts.typecheck`를 정의하는지 — turbo는 그
 * 정의가 없는 패키지를 대상에서 조용히 빼고 남은 태스크만 실행한다. 넷째와
 * 다섯째는 경계 게이트와 라이선스 게이트가 각각 그 열거를 실제로 훑는지 —
 * 게이트를 실행해 출력이 보고하는 매니페스트 수를 열거에서 파생한 기대값과
 * 대조한다.
 *
 * 여섯째는 `scripts/headless-packages.mjs`의 `HEADLESS_PACKAGES`가 tsconfig
 * `lib`에 `DOM`이 없는 workspace 패키지 집합과 같은 값인지를 그
 * 열거·tsconfig에서 파생한 기대값과 대조하고, `headlessPackageDirectories()`가
 * workspace 열거에 없는 항목을 받으면 throw하는지를 리터럴 fixture로 진다.
 * 이 목록의 **단독 소유**(사본이 없는지)는 이 파일이 아니라
 * `tests/workspace-roots.test.ts`가 진다 — 그 파일이 이미 소유한 사본 탐지
 * 술어를 여기서 복제하면 `PIT-0022` 위반이다.
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

/**
 * typecheck 스크립트를 `&&`로 가른 세그먼트 하나가 실행하는 tsc 프로그램의
 * 경로(패키지 디렉터리 기준 상대 경로)를 뽑는다. 받아들이는 형태를 둘로만
 * 정의한다 — 먼저 세그먼트가 `tsc`(다른 플래그는 허용) 호출 형태인지부터
 * 확인하고, 아니면 `undefined`를 돌려준다(호출부가 "이 세그먼트는 프로그램을
 * 내지 않는다"로 센다). `tsc` 호출이면 `-p`/`--project`를 세그먼트 어디서든
 * (첫 토큰이 아니어도) 찾아 그 다음 토큰을 경로로 쓰고, 없으면
 * `tsconfig.json`으로 기본한다.
 *
 * 두 분기가 겹치지 않도록 "tsc 호출인가"와 "-p/--project가 있는가"를 분리해
 * 순서대로 판정한다 — `-p`/`--project`를 첫 토큰 위치에만 앵커링하면
 * `"tsc --strict -p foo/tsconfig.json"`처럼 플래그가 먼저 오는 세그먼트가
 * 그 경로를 못 찾고 조용히 `tsconfig.json` 기본값으로 오분류된다(둘째
 * 분기가 "tsc + 임의 토큰들"을 전부 받아들이므로 첫째 분기가 놓친 것을
 * 가려주지 못한다). 거절할 형태를 나열하지 않고 받아들일 형태만 정의하는
 * 것이 핵심이다(`PIT-0027`) — `echo skip`이나 `node scripts/x.mjs`처럼 새
 * 회피 형태가 나와도 거절 목록에 없다는 이유로 조용히 통과하지 않는다.
 */
const segmentProjectPath = (segment: string) => {
  if (!/^tsc(?:\s+\S+)*$/.test(segment)) return undefined;

  const projectMatch = /(?:^|\s)(?:-p|--project)\s+(\S+)/.exec(segment);
  return projectMatch?.[1] ?? "tsconfig.json";
};

/**
 * 루트 `typecheck` 체인이 실제로 실행하는 tsc 프로그램의 저장소 상대 경로
 * 목록(`DELTA-01` 이후 15개). 도출은 두 갈래다.
 *
 * 1. `typecheckedProjectPaths()`가 이미 펼치는(`pnpm <스크립트>` 참조를 한
 *    단계 전개한) 루트 체인 문자열 전체에서 `tsc -p <경로>`/
 *    `tsc --project <경로>` 꼴을 전부 뽑는다 — 기존 전개에 추출만 더한다.
 * 2. 그 문자열에 `turbo run typecheck`가 있으면 workspace 패키지를 열거하고,
 *    각 패키지의 `scripts.typecheck`를 `&&`로 갈라 세그먼트마다
 *    `segmentProjectPath()`로 프로그램을 뽑는다. 열거된 패키지 중 프로그램을
 *    하나도 못 낸 것이 있으면 조용히 건너뛰지 않고 그 패키지 이름을 담아
 *    즉시 throw한다 — 그 패키지가 아래 커버리지 판정에서 소리 없이 빠지는
 *    것을 막는다(`PIT-0016`의 "turbo 전제도 검증 대상" 규칙을 확장한다).
 *
 * `workspacePackageDirectories()`는 `scripts/workspace-roots.mjs`에서 그대로
 * import해 쓴다 — 사본을 새로 만들면 #106이 없앤 리터럴이 되살아난다
 * (`PIT-0022`).
 */
const chainTypecheckProjects = async () => {
  const chain = await typecheckedProjectPaths();
  const projects: string[] = [];

  for (const match of chain.matchAll(/tsc\s+(?:-p|--project)\s+(\S+)/g)) {
    const path = match[1];
    if (path !== undefined) projects.push(path);
  }

  if (chain.includes("turbo run typecheck")) {
    const directories = workspacePackageDirectories(repositoryRoot);

    for (const directory of directories) {
      const name = relative(repositoryRoot, directory);
      const scripts: Record<string, string> =
        (await readPackage(name)).scripts ?? {};
      const typecheck = scripts.typecheck ?? "";
      const segments = typecheck
        .split("&&")
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
      const packageProjects = segments
        .map((segment) => segmentProjectPath(segment))
        .filter((path): path is string => path !== undefined)
        .map((path) => `${name}/${path}`);

      if (packageProjects.length === 0) {
        throw new Error(
          `${name}의 typecheck 스크립트가 tsc 프로그램을 하나도 내지 않는다: ${JSON.stringify(typecheck)}`,
        );
      }

      projects.push(...packageProjects);
    }
  }

  return projects;
};

/**
 * `git ls-files`로 얻은 추적 파일 전량 중 typecheck 대상 확장자
 * (`.js`/`.mjs`/`.cjs`/`.ts`/`.jsx`/`.tsx`)에 걸리는 저장소 상대 경로
 * 목록(오늘 171개). `trackedSourceFiles(directory)`와 인자만 다르다 — 이
 * 함수는 디렉터리로 좁히지 않고 저장소 전역을 낸다. 새 커버리지 축의 발견
 * 단위가 디렉터리가 아니라 파일이기 때문이다.
 */
const trackedSourceFilePaths = async () => {
  const { stdout } = await execFileAsync("git", ["ls-files"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    maxBuffer: maxStdoutBuffer,
  });

  return stdout.split("\n").filter((path) => typecheckedExtension.test(path));
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
 * `compiledFilePaths()`를 그대로 부르되, `include`가 파일을 하나도 못 잡는
 * 상태(`tsc`가 `TS18003 No inputs were found`로 exit≠0)를 "그 프로그램이
 * 아무것도 컴파일하지 않는다"(빈 배열)로 다룬다. `compiledFilePaths()` 자신은
 * 고치지 않는다 — 이 파일의 다른 소비처를 건드리지 않기 위해서다. `TS18003`이
 * 아닌 다른 실패(예: 존재하지 않는 프로젝트 경로)는 그대로 다시 던진다 —
 * 조용히 삼키면 설정 오류를 "커버 없음"으로 잘못 보고해 원인 추적이 어려워진다.
 * 커버리지 축이 `include` 축소(조건 3)를 "미커버 파일 목록"으로 보여줘야
 * 하는데, `include`가 완전히 비면 tsc가 크래시로 답해 그 목록 대신 원인 불명의
 * 예외로 죽는 것을 막는다.
 */
const compiledFilePathsOrEmpty = async (projectPath: string) => {
  try {
    return await compiledFilePaths(projectPath);
  } catch (error) {
    const commandError = error as { stdout?: string; stderr?: string };
    const output = `${commandError.stdout ?? ""}${commandError.stderr ?? ""}`;
    if (output.includes("TS18003")) return [];
    throw error;
  }
};

/**
 * `tsc -p <projectPath> --showConfig`로 `extends` 체인까지 반영된 최종
 * `compilerOptions.checkJs` 해석값을 읽는다. tsconfig 파일 자신의
 * `compilerOptions`만 읽으면 `extends`가 설정하는 값을 놓친다 — 오늘은
 * `tsconfig.base.json`이 `checkJs`를 설정하지 않아 결과가 같지만, `extends`
 * 체인이 깊어지면 갈린다. `--showConfig`는 설정되지 않은 키를 아예 생략하므로
 * (`hasCheckJs`만 나오고 `checkJs`는 없는 식) `?? true`나 `!== false`가 아니라
 * `=== true`로 판정한다 — 그래야 `checkJs`를 명시하지 않은 프로그램이 전부
 * "JS를 검사한다"로 잘못 통과하지 않는다.
 */
const resolvedCheckJs = async (projectPath: string) => {
  const tscPath = fileURLToPath(
    new URL("../node_modules/typescript/bin/tsc", import.meta.url),
  );
  const resolvedProject = fileURLToPath(
    new URL(`../${projectPath}`, import.meta.url),
  );
  const { stdout } = await execFileAsync(
    process.execPath,
    [tscPath, "--project", resolvedProject, "--showConfig"],
    { maxBuffer: maxStdoutBuffer },
  );

  return JSON.parse(stdout).compilerOptions?.checkJs === true;
};

/**
 * typecheck 대상 확장자(`typecheckedExtension`) 중 `.ts`/`.tsx`가 아닌
 * 나머지(`.js`/`.mjs`/`.cjs`/`.jsx`)인지 판정한다. 커버리지 판정이 이 그룹에만
 * `checkJs` 요구를 추가로 건다 — `.ts`/`.tsx`는 컴파일 대상 멤버십만으로
 * 타입 검사가 보장되지만, JS는 `checkJs`가 꺼진 프로그램이 `import`로
 * 끌어들여도 멤버십에는 그대로 나타난다(`tests/tsconfig.json`이 `checkJs:
 * false`인 채로 `scripts/*.mjs` 셋을 담는 것이 트랙-1 실측이다). 멤버십만
 * 세면 `pnpm typecheck:scripts` 연결이 끊겨도 그 셋이 계속 "커버됨"으로 잘못
 * 보인다.
 */
const requiresCheckJs = (file: string) => !/\.tsx?$/.test(file);

/**
 * 체인 커버리지 판정에서 예외로 두는 `{ file, project }` 쌍. `project`가
 * `file`을 실제로 컴파일하지만 `chainTypecheckProjects()`에는 연결하지
 * 않는다 — 형태를 쌍으로 둔 이유는 stale 판정을 리터럴 대조가 아니라 실행으로
 * 지게 하기 위해서다(아래 "체인 커버리지 예외 목록" `it`이 항목마다 파일
 * 존재·실제 컴파일·체인 커버리지 밖 셋을 확인한다).
 *
 * 오늘 유일한 항목인 `tests/fixtures/dom-lib-forbidden.ts`는 DOM 전역 차단을
 * 확인하려고 일부러 타입 오류를 담은 fixture라, 체인에 넣으면 게이트가 항상
 * 실패한다. 위 "DOM 전역을 사용하면 컴파일되지 않는다" `it`의 `compileFixture()`가
 * 그 타입 오류를 이미 직접 확인한다.
 */
const TYPECHECK_COVERAGE_EXCEPTIONS = [
  {
    file: "tests/fixtures/dom-lib-forbidden.ts",
    project: "tests/fixtures/io-dom-forbidden.tsconfig.json",
  },
] as const;

/**
 * `git ls-files -- <directory>`로 그 디렉터리 아래 추적 파일 중 typecheck 대상
 * 확장자를 가진 것의 저장소 상대 경로를 돌려준다. 검사 대상 tsconfig의 `exclude`를
 * 읽지 않는 것이 핵심이다 — 기대값을 검사 대상이 스스로 정하면 `exclude` 한 줄로
 * 파일을 게이트 밖으로 빼도 기대값이 같이 줄어 단언이 구현을 되뇔 뿐 아무것도
 * 막지 못한다(`include` 축소·`checkJs` 해제와 같은 부류의 무력화 경로다).
 *
 * 컴파일 대상 포함 여부(빠진 파일이 정당한 예외인지)는 이제 이 함수가 아니라
 * 저장소 전체를 보는 새 커버리지 축(`trackedSourceFilePaths()`·
 * `chainTypecheckProjects()`·`TYPECHECK_COVERAGE_EXCEPTIONS`)이 진다. 이 함수의
 * 유일한 남은 소비처는 아래 "JS 소스를 가진 디렉터리는..." `it`이고, 그 `it`은
 * 이 결과로 "이 디렉터리에 JS 소스가 있는가"만 판정한다.
 */
const trackedSourceFiles = async (directory: string) => {
  const { stdout } = await execFileAsync("git", ["ls-files", "--", directory], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    maxBuffer: maxStdoutBuffer,
  });

  return stdout.split("\n").filter((path) => typecheckedExtension.test(path));
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

  // `packages/model`·`packages/io` 두 문자열을 배열 리터럴로 나열하지 않는다
  // — 그렇게 적으면 `HEADLESS_PACKAGES`(`scripts/headless-packages.mjs`)의
  // 두 번째 사본이 된다. 스프레드는 배열 리터럴 안에 인용 토큰을 남기지 않아
  // `tests/workspace-roots.test.ts`의 headless 축 사본 탐지에 걸리지 않는다.
  it.each([
    ...HEADLESS_PACKAGES,
  ])("DOM 전역을 사용하면 컴파일되지 않는다 — %s", async (name) => {
    const tsconfig = await readTsconfig(name);
    const fixture = `${name.replace("packages/", "")}-dom-forbidden.tsconfig.json`;
    const result = await compileFixture(fixture);

    expect(tsconfig.compilerOptions.lib).toEqual(["ES2022"]);
    expect(tsconfig.compilerOptions.types).toEqual([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("Cannot find name 'document'");
  });

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
 * 통과시킨다(`PIT-0022`).
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
 * `segmentProjectPath()` 자체를 리터럴 문자열로 직접 단위 테스트한다.
 * `chainTypecheckProjects()`를 통해서만 간접으로 검증하면, 오늘 실제
 * workspace 패키지의 `typecheck` 스크립트가 전부 `-p`/`--project`를 첫
 * 토큰으로 두는 형태(`tsc -p <path> ...`)라 "플래그가 첫 토큰이 아닌
 * 세그먼트"라는 갈래를 실제 트리로는 관측할 수 없다. 그 갈래를 리터럴
 * fixture로 직접 짚는다 — `-p`/`--project`를 첫 토큰 위치에만 앵커링하면
 * `"tsc --strict -p custom/tsconfig.json"` 같은 세그먼트가 그 경로를 못
 * 찾고 조용히 `tsconfig.json` 기본값으로 오분류된다(`PIT-0027`).
 */
describe("segmentProjectPath()(typecheck 세그먼트의 프로젝트 경로 추출)", () => {
  it.each([
    ["tsc -p tsconfig.configs.json --noEmit", "tsconfig.configs.json"],
    ["tsc --noEmit", "tsconfig.json"],
    ["tsc --strict -p custom/tsconfig.json", "custom/tsconfig.json"],
    ["echo skip", undefined],
    ["node scripts/x.mjs", undefined],
  ] as const)("%s → %s", (segment, expected) => {
    expect(segmentProjectPath(segment)).toBe(expected);
  });
});

describe("workspace 밖 소스 디렉터리의 typecheck 편입", () => {
  /**
   * 이 describe의 공유 비용. `chainTypecheckProjects()`가 내는 프로그램
   * 전량(오늘 15개)에 `--listFilesOnly`와 `--showConfig`를 각각 한 번씩만
   * 돌려 아래 두 `it`이 그 결과를 나눠 쓴다 — 커버리지 `it`과 예외 목록
   * `it`이 각자 프로그램 전량을 다시 돌리면 이 파일 전체 실행 시간이
   * 몇 배로 늘고 `it` 하나가 vitest 기본 5초 타임아웃에 닿을 수 있다(실측:
   * 15개 기준 `--listFilesOnly` 총합 약 1.25초, `--showConfig` 총합 약
   * 0.6초).
   */
  let trackedFiles: string[];
  let chainProjects: string[];
  let compiledByProject: Map<string, readonly string[]>;
  let checkJsByProject: Map<string, boolean>;

  beforeAll(async () => {
    trackedFiles = await trackedSourceFilePaths();
    chainProjects = await chainTypecheckProjects();
    compiledByProject = new Map();
    checkJsByProject = new Map();

    for (const project of chainProjects) {
      compiledByProject.set(project, await compiledFilePathsOrEmpty(project));
      checkJsByProject.set(project, await resolvedCheckJs(project));
    }
  });

  /**
   * `chainProjects` 중 하나라도 `file`을 컴파일하고, JS 소스면 그 프로그램의
   * `checkJs`도 켜져 있는지를 본다. 커버리지 `it`(차집합)과 예외 목록
   * `it`(개별 파일이 커버리지 밖에 있는지)이 같은 판정을 공유한다 — 갈리면
   * "차집합에 없다"와 "예외 목록 셋째 단언을 통과한다"가 서로 다른 답을
   * 낼 수 있다.
   */
  const coveredByChain = (file: string) => {
    const needsCheckJs = requiresCheckJs(file);

    return chainProjects.some((project) => {
      const isCompiled = (compiledByProject.get(project) ?? []).some((path) =>
        path.endsWith(`/${file}`),
      );
      if (!isCompiled) return false;
      return !needsCheckJs || checkJsByProject.get(project) === true;
    });
  };

  it("추적 소스 파일 전량이 체인 프로그램의 컴파일 대상에 들거나 예외 목록에 있다", () => {
    // 가드 1 — `git ls-files`가 잘못된 cwd에서 도는 것을 잡는다.
    expect(trackedFiles.length).toBeGreaterThan(0);

    const packageDirectories = workspacePackageDirectories(repositoryRoot);
    // 가드 2 — 가드 3의 하한이 0이면 가드 3이 공허하게 참이 되는 것을 막는다.
    expect(packageDirectories.length).toBeGreaterThan(0);
    // 가드 3 — turbo 갈래가 통째로 죽는 것을 잡는다. 리터럴 수가 아니라
    // 공용 열거(`workspacePackageDirectories().length`)에서 파생한 하한을
    // 쓴다. 이 가드가 먼저 지면 아래 차집합 단언의 거대한 실패 목록보다
    // "발견 로직 자체가 죽었다"는 신호가 먼저 나온다.
    expect(chainProjects.length).toBeGreaterThanOrEqual(
      packageDirectories.length,
    );

    // 실패 메시지에 미커버 경로가 그대로 남도록 불리언이 아니라 목록으로
    // 단언한다.
    const uncovered = trackedFiles.filter((file) => !coveredByChain(file));

    expect(uncovered.sort()).toEqual(
      TYPECHECK_COVERAGE_EXCEPTIONS.map((exception) => exception.file).sort(),
    );
  });

  it.each(
    TYPECHECK_COVERAGE_EXCEPTIONS,
  )("예외 목록 항목마다 파일 존재·실제 컴파일·체인 커버리지 밖 셋을 만족한다 — $file", async ({
    file,
    project,
  }) => {
    // 1 — 사라진 경로가 예외 목록에 남는 것을 막는다.
    expect(trackedFiles).toContain(file);

    // 2 — 근거가 죽은 예외(짝지어진 tsconfig가 더는 이 파일을 컴파일하지
    // 않는 상태)를 막는다.
    const compiled = await compiledFilePathsOrEmpty(project);
    expect(compiled.some((path) => path.endsWith(`/${file}`))).toBe(true);

    // 3 — 체인이 이미 덮게 된 파일이 예외 목록에 남아 커버리지 판정의
    // 면적을 조용히 갉는 것을 막는다.
    expect(coveredByChain(file)).toBe(false);
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

/**
 * `scripts/` 아래의 게이트 스크립트를 자식 프로세스로 돌려 exit code와 출력을
 * 값으로 돌려준다. `execFileAsync`는 비정상 종료를 예외로 바꾸므로
 * `compileFixture`와 같은 형태로 잡는다 — 게이트가 진 이유(stderr에 나오는 위반
 * 목록)를 단언 실패 메시지에 그대로 싣기 위해서다. 게이트는 저장소 루트를
 * `import.meta.dirname` 기준으로 잡으므로 cwd를 지정하지 않는다.
 *
 * 스크립트 이름을 인자로 받는다. 경계 게이트와 라이선스 게이트가 이 함수 하나를
 * 공유한다 — 게이트마다 같은 try/catch를 다시 적으면 사본이 갈리고, 한쪽만
 * 고친 뒤 어느 쪽이 옳은지 판단할 근거가 사라진다(`PIT-0022`).
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
