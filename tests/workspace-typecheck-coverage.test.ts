/**
 * workspace 전체(안+밖)의 typecheck 커버리지 판정. 두 축이 하나의 계약을
 * 이룬다 — 각각 반쪽만 지면 다른 반쪽의 회귀를 놓친다.
 *
 * 첫째(workspace 밖)는 추적 소스 파일 전량이 루트 `typecheck` 체인이 실행하는
 * 프로그램의 컴파일 대상에 드는지를 대조한다 — `.js`/`.mjs`/`.cjs`/`.jsx`는 그
 * 프로그램의 `checkJs`가 켜져 있어야 커버로 세고, 예외로 둔 파일은 실제로
 * 존재하고 짝지은 tsconfig가 실제로 컴파일하며 체인 커버리지 밖에 있는지까지
 * 확인한다. 발견이 통째로 죽는 것과 workspace 패키지가 프로그램을 하나도 못
 * 내는 것은 각각 가드와 즉시 throw로 잡는다. 같은 describe에 남은 그다음 `it`은
 * 체인 프로그램 중 자신의 tsconfig 디렉터리 아래 추적 JS 소스를 실제로 컴파일
 * 대상에 담는 것(소유 기준)만 골라, 그 프로그램의 `allowJs`·`checkJs`가 켜져
 * 있고 `include`가 확장자로 거르지 않는지를 대조한다.
 *
 * 둘째(workspace 안)는 열거된 workspace 패키지가 빠짐없이 `scripts.typecheck`를
 * 정의하는지 — turbo는 그 정의가 없는 패키지를 대상에서 조용히 빼고 남은
 * 태스크만 실행한다. 첫째 축은 "workspace 안은 turbo가 덮는다"를 말없이
 * 전제하는데, 둘째 축이 그 전제를 진다 — 둘을 한 파일에 묶어 둔 이유가 이것이다.
 *
 * 이 두 축은 `PIT-0032`(반복 근거: Issue #57 → #95 → #105·#106)가 겨누는 바로 그
 * 판정이다 — `tests/workspace-boundaries.test.ts`의 나머지 관심사(의존성 경계,
 * 게이트 검사 범위, headless 집합)와는 재발 이력이 다른 별개 계약이라 파일을
 * 분리했다. PIT-0032 문서가 이 파일을 계약 소유자로 인용한다.
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

import { workspacePackageDirectories } from "../scripts/workspace-roots.mjs";

// 저장소 루트를 cwd가 아니라 이 파일 위치로 잡는다. 이 파일의 다른 헬퍼가
// 전부 `import.meta.url` 기준이고, cwd 상대면 잘못된 cwd에서 열거가 빈
// 집합이 돼 단언이 공허하게 통과한다.
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

const readPackage = async (name: string) =>
  JSON.parse(
    await readFile(new URL(`../${name}/package.json`, import.meta.url), "utf8"),
  );
const execFileAsync = promisify(execFile);

// 이 파일이 실행하는 tsc·git의 stdout 상한. Node 기본값은 1MB이고, 넘으면
// 결과 대신 ERR_CHILD_PROCESS_STDIO_MAXBUFFER로 죽어 원인 추적이 어렵다.
const maxStdoutBuffer = 32 * 1024 * 1024;

const typecheckedExtension = /\.(?:m|c)?[jt]sx?$/;

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
 *
 * 같은 세그먼트에 `-p`/`--project`가 두 번 이상 나오면 마지막 매치를
 * 채택한다 — 실제 tsc CLI 동작과 맞춘 규칙이다. 이 저장소의 실제
 * `node_modules/typescript` 바이너리로 직접 검증했다:
 * `node node_modules/typescript/bin/tsc -p tests/tsconfig.json -p scripts/tsconfig.json --listFilesOnly`는
 * `scripts/tsconfig.json`을 컴파일 대상으로 삼고(`tests/` 파일 0개,
 * `scripts/` 파일 5개), 순서를 뒤집은
 * `node node_modules/typescript/bin/tsc -p scripts/tsconfig.json -p tests/tsconfig.json --listFilesOnly`는
 * 반대로 `tests/tsconfig.json`을 컴파일 대상으로 삼는다 — 두 실행 모두
 * 마지막 `-p`가 이겼다. 첫 매치를 채택하면 이 실측과 어긋난다.
 */
const segmentProjectPath = (segment: string) => {
  if (!/^tsc(?:\s+\S+)*$/.test(segment)) return undefined;

  const projectMatches = [
    ...segment.matchAll(/(?:^|\s)(?:-p|--project)\s+(\S+)/g),
  ];
  const lastMatch = projectMatches.at(-1);
  return lastMatch?.[1] ?? "tsconfig.json";
};

/**
 * 루트 `typecheck` 체인이 실제로 실행하는 tsc 프로그램의 저장소 상대 경로
 * 목록(오늘 15개). 도출은 두 갈래다.
 *
 * 1. `typecheckedProjectPaths()`가 이미 펼치는(`pnpm <스크립트>` 참조를 한
 *    단계 전개한) 루트 체인 문자열 전체에서 `tsc -p <경로>`/
 *    `tsc --project <경로>` 꼴을 전부 뽑는다 — 기존 전개에 추출만 더한다.
 * 2. 그 문자열에 `turbo run typecheck`가 있으면 workspace 패키지를 열거하고,
 *    각 패키지의 `scripts.typecheck`를 `&&`로 갈라 세그먼트마다
 *    `segmentProjectPath()`로 프로그램을 뽑는다. 열거된 패키지 중 프로그램을
 *    하나도 못 낸 것이 있으면 조용히 건너뛰지 않고 그 패키지 이름을 담아
 *    즉시 throw한다 — 그 패키지가 아래 커버리지 판정에서 소리 없이 빠지는
 *    것을 막는다(`G-WKS-003`의 "turbo 전제도 검증 대상" 규칙을 확장한다).
 *
 * `workspacePackageDirectories()`는 `scripts/workspace-roots.mjs`에서 그대로
 * import해 쓴다 — 사본을 새로 만들면 #106이 없앤 리터럴이 되살아난다
 * (`G-TST-002`).
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
 * 목록(오늘 171개). 파일 커버리지 축과 체인 프로그램 소유 기준 판정이 이
 * 전역 열거 하나를 공유한다 — 디렉터리별로 `git ls-files`를 다시 부르는
 * 두 번째 출발점을 두지 않는다(`G-TST-002`).
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
 * 커버리지 축이 `include` 축소로 파일이 컴파일 대상에서 빠지는 경우를
 * "미커버 파일 목록"으로 보여줘야 하는데, `include`가 완전히 비면 tsc가
 * 크래시로 답해 그 목록 대신 원인 불명의 예외로 죽는 것을 막는다.
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
 * 저장소 상대 경로가 직접 속한 디렉터리를 뽑는다(판정 1) — 마지막
 * 세그먼트(파일명, 또는 체인 프로그램 경로라면 tsconfig 파일명)를 뗀
 * 나머지다. 슬래시가 없는 경로는 저장소 루트에 직접 있다는 뜻이라 빈
 * 문자열을 낸다. 체인 프로그램의 tsconfig 디렉터리와 추적 JS 소스 파일이
 * 직접 속한 디렉터리를 이 함수 하나로 뽑아, 아래 소유 판정이 정확히 같은
 * 규칙으로 둘을 비교하게 한다.
 *
 * "그 디렉터리 아래"를 하위 디렉터리까지 재귀적으로 포함하는 뜻으로 읽지
 * 않는다 — 재귀로 읽으면 루트 프로그램(`tsconfig.configs.json`, 디렉터리가
 * 빈 문자열)이 `scripts/*.mjs` 전부를 포함해 저장소 전체를 "소유"하게 되어
 * 오늘 트리에서 이미 거짓으로 대상에 들어온다(실측: 오늘
 * `tsconfig.configs.json` 디렉터리에 직접 있는 추적 JS는 0). 대신 "직접
 * 속한다"(dirname이 정확히 같다)로 읽는다 — 저장소 루트에 새 JS 파일을 바로
 * 두면(디렉터리 세그먼트 없이) 그 파일의 dirname도 빈 문자열이 되어 루트
 * 프로그램이 그 순간에만 대상에 들어온다.
 */
const repositoryRelativeDirectory = (path: string) => {
  const slashIndex = path.lastIndexOf("/");
  return slashIndex === -1 ? "" : path.slice(0, slashIndex);
};

/**
 * 체인 프로그램 `project`가 JS include 단언의 대상인지를 소유 기준으로
 * 판정한다(판정 1). 대상 ⟺ `project`의 tsconfig 디렉터리에 직접 속한 추적
 * JS 소스가 있고, 그 파일이 `project`의 컴파일 대상에 실제로 들어 있다.
 *
 * 멤버십만으로 뽑으면(`--listFilesOnly`가 import로 끌려온 파일도 담으므로)
 * `tests/tsconfig.json`처럼 소유하지 않는 프로그램까지 대상에 섞인다 — 그
 * 프로그램은 `scripts/*.mjs` 셋을 컴파일 대상에 담지만(테스트가 그 파일들을
 * import한다) 그 파일들이 직접 속한 디렉터리(`scripts`)를 소유하지 않는다.
 */
const ownsCompiledJsSource = (
  project: string,
  trackedFiles: readonly string[],
  compiledFiles: readonly string[],
) => {
  const directory = repositoryRelativeDirectory(project);

  return trackedFiles.some(
    (file) =>
      jsSourceExtension.test(file) &&
      repositoryRelativeDirectory(file) === directory &&
      compiledFiles.some((path) => path.endsWith(`/${file}`)),
  );
};

/**
 * `include` 패턴 하나가 확장자로 끝나는지 판정한다. 마지막 세그먼트에 점이
 * 있고 그 뒤에 슬래시나 점이 아닌 문자가 하나 이상 있으면 참이다 — 그래야
 * 특정 확장자만 잡는 패턴과, 별표 하나나 디렉터리 이름처럼 확장자를 거르지
 * 않는 패턴이 갈린다(`PIT-0027` — 거절할 패턴을 나열하지 않고 통과할 속성을
 * 정의한다).
 */
const patternEndsWithExtension = (pattern: string) => /\.[^./]+$/.test(pattern);

/**
 * `tsc -p <projectPath> --showConfig`로 `allowJs`·`checkJs`의 해석값과
 * `include` 패턴 목록을 함께 얻는다. `resolvedCheckJs()`와 따로 두는 이유는
 * 그 함수가 `checkJs` 하나만 boolean으로 좁혀 돌려주기 때문이다 — 이 단언은
 * `allowJs`와 `include`도 필요하다. 소유 기준을 통과한 프로그램(오늘 1개)에만
 * 부르므로, 같은 프로그램에 `--showConfig`를 한 번 더 도는 비용은 무시할
 * 만하다(R7).
 *
 * `include`가 없으면 빈 배열이 아니라 tsc 기본값으로 채운다. 실측: `include`가
 * tsc 기본값과 정확히 같으면 `--showConfig`는 그 키 자체를 생략한다 —
 * `resolvedCheckJs()` 문서가 다루는 R1의 생략 현상과 같은 원인이지만 채우는
 * 방향은 다르다. `checkJs`·`allowJs`는 없는 키를 `false`로 읽어야 하고(tsc
 * 기본값이 `false`다), `include`는 tsc의 실제 기본 동작과 같은 값으로 채워야
 * 한다.
 */
const resolvedProjectConfig = async (projectPath: string) => {
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
  const config = JSON.parse(stdout);

  return {
    allowJs: config.compilerOptions?.allowJs === true,
    checkJs: config.compilerOptions?.checkJs === true,
    include: (config.include as string[] | undefined) ?? ["**/*"],
  };
};

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
    ["tsc -p a/tsconfig.json -p b/tsconfig.json", "b/tsconfig.json"],
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
   * 몇 배로 늘고 `it` 하나가 vitest 기본 5초 타임아웃에 닿을 수 있다.
   * 비용은 활성 `typescript` 컴파일러에 매인다 — 네이티브 Go 컴파일러(7.x)
   * 기준 실측은 총합 2초 미만이었지만, classic 컴파일러(6.0.3, 프로세스당
   * tsc 시작 비용이 훨씬 큼)로 내려온 뒤 실측하면 `beforeAll` 포함 describe
   * 전체가 약 8~9초까지 걸린다 — 그래서 `beforeAll`에 30초 타임아웃을 둔다.
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
  }, 30_000);

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

  it.each(TYPECHECK_COVERAGE_EXCEPTIONS)(
    "예외 목록 항목마다 파일 존재·실제 컴파일·체인 커버리지 밖 셋을 만족한다 — $file",
    async ({ file, project }) => {
      // 1 — 사라진 경로가 예외 목록에 남는 것을 막는다.
      expect(trackedFiles).toContain(file);

      // 2 — 근거가 죽은 예외(짝지어진 tsconfig가 더는 이 파일을 컴파일하지
      // 않는 상태)를 막는다.
      const compiled = await compiledFilePathsOrEmpty(project);
      expect(compiled.some((path) => path.endsWith(`/${file}`))).toBe(true);

      // 3 — 체인이 이미 덮게 된 파일이 예외 목록에 남아 커버리지 판정의
      // 면적을 조용히 갉는 것을 막는다.
      expect(coveredByChain(file)).toBe(false);
    },
  );

  it("소유 기준으로 뽑은 체인 프로그램은 allowJs·checkJs를 켜고 include로 확장자를 거르지 않는다", async () => {
    // 프로그램 P가 대상이다 ⟺ P의 tsconfig 디렉터리 아래에 추적 JS 소스가
    // 있고, 그 파일이 P의 컴파일 대상에 실제로 들어 있다(판정 1). 오늘
    // 대상은 `scripts/tsconfig.json` 하나다 — `tests/tsconfig.json`은
    // `scripts/`의 `.mjs` 셋을 컴파일 대상에 담지만(테스트가 import한다)
    // 그 디렉터리를 소유하지 않아 탈락한다.
    const ownedProjects = chainProjects.filter((project) =>
      ownsCompiledJsSource(
        project,
        trackedFiles,
        compiledByProject.get(project) ?? [],
      ),
    );

    // 대상 집합이 비면 시끄럽게 죽는다 — 소유 기준이 잘못돼 대상을 하나도
    // 못 뽑는 회귀를 막는다. 가드가 없으면 빈 순회가 아무 단언도 실행하지
    // 않은 채 통과한다(#106이 실증한 형태).
    expect(ownedProjects.length).toBeGreaterThan(0);

    for (const project of ownedProjects) {
      const config = await resolvedProjectConfig(project);

      expect(config.allowJs, project).toBe(true);
      expect(config.checkJs, project).toBe(true);

      // include를 리터럴 값과 동등 비교하지 않는다. 하위 디렉터리까지
      // 덮을 것도 요구하지 않는다 — 신설 `tsconfig.configs.json`은
      // 최상위 전용(하위 미포함) include가 의도이고, 뒷절반을 떼도 잃는
      // 것이 없다(include가 하위를 빼면 그 아래 파일은 위 커버리지 `it`이
      // 미커버로 잡는다). "확장자로 거르지 않는 패턴이 하나라도 있는가"라는
      // 속성만 `some`으로 본다 — `every`로 두면 넓히는 추가(패턴 여럿 중
      // 하나만 확장자로 끝나는 경우)가 거짓 실패가 된다(`PIT-0027`).
      expect(
        config.include.some((pattern) => !patternEndsWithExtension(pattern)),
        `${project} include: ${JSON.stringify(config.include)}`,
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
 * 파싱해 같은 대조를 쓰면 계약의 주인이 둘이 된다(`G-TST-002`). 대신 발견
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
