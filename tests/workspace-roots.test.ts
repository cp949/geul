/**
 * `scripts/workspace-roots.mjs`의 계약. 검사 범위를 정하는 스크립트들이 그
 * 모듈의 workspace 루트 목록을 공유한다.
 *
 * 그 모듈의 `WORKSPACE_ROOTS`는 리터럴이라 `pnpm-workspace.yaml`과 자동으로
 * 맞춰지지 않는다. 둘이 어긋나면 소비처의 검사 범위가 조용히 트리보다 좁아진다
 * — 새 루트 아래의 패키지는 경계 위반도, 미승인 라이선스도, 대상 목록에 없는
 * 테스트 디렉터리도 보고되지 않는다. 그 침묵이 게이트에서와 진단 도구에서 각각
 * 어떤 얼굴로 나오는지는 그 모듈의 헤더가 소유한다.
 *
 * 여기서 두 목록을 대조하고, 그 목록으로 실제 열거되는 패키지 디렉터리 집합까지
 * 고정한다. 두 단언 모두 `pnpm-workspace.yaml`을 이 파일이 직접 파싱해 기대값을
 * 만든다 — 구현이 쓰는 리터럴과 출발점이 달라야 어긋남이 드러난다.
 *
 * 그 둘만으로는 **단독 소유**가 지켜지지 않는다. 두 단언은 모듈의 리터럴만 지고
 * 소비처가 그 모듈을 실제로 쓰는지는 보지 않는다 — 실측:
 * `scripts/find-duplicate-test-helpers.mjs`의 import를 지우고 로컬 리터럴 사본으로
 * 되돌려도 `tests/` 전량이 통과하고, 루트 하나가 빠진 갈린 사본이어도 통과한다.
 * 현재 트리의 `apps`와 `fixtures` 아래에는 `test` 디렉터리가 없어 그 두 루트가 그
 * 스크립트의 후보 수집 결과에 아무 기여도 하지 않기 때문이다. 아래 describe가
 * 그 구멍을 두 축으로 막는다 — 소비처가 import하는지와, 루트 목록 리터럴이
 * 저장소에 한 벌뿐인지.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  WORKSPACE_ROOTS,
  workspacePackageDirectories,
} from "../scripts/workspace-roots.mjs";

// 저장소 루트를 cwd가 아니라 이 파일 위치로 잡는다. 저장소의 다른 테스트가
// 전부 `import.meta.url` 기준이고, cwd 상대면 잘못된 cwd에서 ENOENT로 진다.
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * `pnpm-workspace.yaml`의 `packages:` 블록에서 workspace 루트 이름을 뽑는다.
 * `scripts/workspace-roots.mjs`는 이 목록을 리터럴로 들고 있어, 새 루트가
 * workspace에 추가돼도 스스로는 알지 못한다. 여기서 어긋남을 잡는다.
 */
const manifestWorkspaceRoots = () => {
  const manifest = readFileSync(
    new URL("../pnpm-workspace.yaml", import.meta.url),
    "utf8",
  );
  const block = /^packages:\n((?:[ \t]+-[ \t]+.*\n)+)/m.exec(manifest)?.[1];

  expect(block).toBeDefined();
  return [...(block ?? "").matchAll(/-[ \t]+["']?([^"'\s]+)["']?/g)].map(
    (match) => (match[1] ?? "").replace(/\/\*+$/, ""),
  );
};

/**
 * `pnpm-workspace.yaml`이 선언한 루트 아래를 직접 훑어 `package.json`을 가진
 * 자식 디렉터리의 절대 경로를 모은다.
 *
 * `workspacePackageDirectories()`와 결과가 같아야 하지만 동어반복이 아니다 —
 * 이쪽은 매니페스트 파싱에서, 저쪽은 모듈의 리터럴 목록에서 출발한다. 리터럴이
 * 트리보다 좁아지면 저쪽 결과만 줄어들어 단언이 갈린다.
 */
const manifestPackageDirectories = () => {
  const directories = [];
  for (const root of manifestWorkspaceRoots()) {
    const rootPath = join(repositoryRoot, root);
    if (!existsSync(rootPath)) continue;
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      const directory = join(rootPath, entry.name);
      if (entry.isDirectory() && existsSync(join(directory, "package.json"))) {
        directories.push(directory);
      }
    }
  }
  return directories.sort();
};

// 루트 목록을 단독 소유하는 모듈의 저장소 상대 경로. 아래 두 단언의 대상이자
// 예외이므로 한 곳에서만 적는다.
const workspaceRootsModulePath = "scripts/workspace-roots.mjs";

// 사본을 찾을 대상 확장자 — 실행되는 코드만이다(js·cjs·mjs·ts·cts·mts·jsx·tsx).
// 루트 목록의 사본이 해를 끼치는 자리는 그 목록으로 실제 열거를 도는 코드이고,
// `pnpm-workspace.yaml`은 사본이 아니라 대조의 **원본**이다. json·md도 대상 밖에
// 둔다 — 아래 판정으로 훑으면 json 1건(`tests/tsconfig.json`의 exclude 항목)이
// 걸리고 md·yaml은 0건인데, 그 json 1건도 루트 이름 1종뿐이라 아래 임계값에
// 못 미친다(실측).
const trackedSourceExtension = /\.(?:m|c)?[jt]sx?$/;

// 대괄호 하나가 여는 **중첩 없는** 범위. 목록의 사본은 배열 리터럴 형태로
// 나타나므로, 루트 이름을 파일 전체가 아니라 이 범위 안에서 센다.
const arrayLiteralSpan = /\[[^[\]]*\]/g;

// 한 배열 리터럴 안에 루트 이름이 이만큼 모여 있으면 목록의 사본으로 본다.
//
// 실측으로 정했다. 아래 수치는 추적 소스 파일 전량에 판정 후보를 각각 돌린
// 결과이고, 이 파일 자신의 주석도 대상에 들어 있다.
//
// - 파일 전체에서 정확 인용 토큰: 루트 이름 1종 이상 2건, 2종 이상 2건, 3종 1건.
//   2건 중 하나가 이 파일이다 — 이 저장소의 한국어 주석은 식별자를 백틱으로
//   감싸는 문체라 판정 대상을 설명하는 문장 자체가 사본으로 잡힌다.
// - 파일 전체에서 인용 경로 접두(루트 이름 뒤 슬래시까지 허용): 1종 이상 10건,
//   2종 이상 4건, 3종 2건. `tests/workspace-boundaries.test.ts`의
//   `allowedDependencies` 키와 `vitest.config.ts`의 include glob이 오탐이다.
// - 파일 전체에서 단어 경계(식별자·산문까지): 1종 이상 21건, 2종 이상 4건,
//   3종 3건. 오탐은 위와 같고 여기에 `scripts/check-licenses.mjs`의 지역 변수
//   이름까지 더해진다.
// - **배열 리터럴 범위 안에서** 정확 인용 토큰: 1종 이상 1건, 2종 이상 1건,
//   3종 1건. 잡히는 것은 `scripts/workspace-roots.mjs` 하나뿐이고, 산문은 배열
//   안에 있지 않아 이 파일의 주석에는 발화하지 않는다.
//
// 그래서 배열 리터럴 범위로 좁혔다. 백틱을 인용 부호에 넣는 것은 원소를 백틱
// 템플릿 리터럴로 쓴 사본을 잡기 위해서다 — biome은 그 표기를 지적하지 않는다
// (실측: 그 한 줄짜리 파일에 `biome check`가 아무 진단도 내지 않는다).
//
// 임계값은 1이 아니라 2다. 오늘의 오탐 수는 1과 2가 같지만, 인용된 루트 이름
// **1종**은 목록의 사본이 아니라 루트 하나에 대한 참조다(대상 밖 json 1건이 그
// 형태다). 2는 실증된 두 변이 — 온전한 3종 사본과 루트 하나가 빠진 2종 갈린
// 사본 — 을 모두 잡으면서 그 소음을 받지 않는다.
const rootListCopyThreshold = 2;

// 소비처가 이 모듈을 **실제로 import하는지**를 본다. 단순 문자열 포함으로
// 판정하지 않는다 — `scripts/find-duplicate-test-helpers.mjs`의 헤더 주석이
// 산문에서 `scripts/workspace-roots.mjs`를 인용하므로, import를 지워도 포함
// 판정은 그대로 통과한다. 그래서 `from "./workspace-roots.mjs"` 형태의 import
// 구문 자체를 요구한다.
const workspaceRootsImport =
  /^\s*import\s[^;]*from\s*["']\.\/workspace-roots\.mjs["']/m;

/**
 * `git ls-files scripts`로 발견한 `.mjs` 중 루트 목록을 소유하는 모듈 자신을 뺀
 * 전부. 소비처 목록을 이 파일에 리터럴로 적지 않으므로 새 스크립트가 생기면
 * 자동으로 대상이 된다.
 *
 * 대상을 "루트 이름을 소스에 쓰는 스크립트"로 좁히지 않는다. 그 형태를 먼저
 * 실측했는데 `scripts/check-licenses.mjs`가 걸리지 않는다 — import로 고친 뒤로는
 * 루트 이름 리터럴이 한 글자도 없어서 정확 인용 토큰도 인용 경로 접두도 0건이다.
 * 단어 경계까지 넓히면 걸리지만 그건 지역 변수 `const packages`가 우연히 맞은
 * 것이라, 그 변수 이름을 바꾸는 순간 소비처가 조용히 대상에서 빠진다. 무력화를
 * 감시하는 목록이 무력화 대상의 표기에 기대면 안 된다.
 *
 * 그래서 `scripts/`의 `.mjs` 전부를 대상으로 삼는다. workspace와 무관한 스크립트가
 * 나중에 생기면 이 단언이 지고, 그때 예외로 뺄지를 사람이 판단한다 — 조용히
 * 빠지는 것보다 낫다.
 */
const consumerScriptPaths = () =>
  execFileSync("git", ["ls-files", "scripts"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter(
      (path) => path.endsWith(".mjs") && path !== workspaceRootsModulePath,
    );

/**
 * `git ls-files`로 추적 소스 파일의 저장소 상대 경로를 모은다. `git ls-files`가
 * 추적 파일만 내므로 `node_modules`와 `_works/`는 애초에 들어오지 않는다 — 둘 다
 * 추적 대상이 아니다(실측: `git ls-files _works`가 0줄).
 */
const trackedSourcePaths = () =>
  execFileSync("git", ["ls-files"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter((path) => trackedSourceExtension.test(path));

/**
 * 소스의 배열 리터럴 하나에 `WORKSPACE_ROOTS`의 이름이 따옴표(또는 백틱)로 감싼
 * 정확한 토큰으로 최대 몇 **종** 모여 있는지 센다. 같은 이름이 여러 번 나와도
 * 1로 센다 — 판정하려는 것은 등장 횟수가 아니라 목록을 이루는 이름이 한 자리에
 * 몇 종 모였는가다.
 *
 * 판정 대상 이름을 리터럴로 적지 않고 `WORKSPACE_ROOTS`에서 만든다. 리터럴로
 * 적으면 이 파일 자신이 사본으로 잡혀 단언이 곧바로 진다. 정규식 특수문자는
 * 이스케이프한다 — 지금 루트 이름에는 없지만, 이스케이프를 빠뜨린 식별자
 * 삽입이 정규화를 조용히 무효로 만든 전례가 있다(`PIT-0022`의 Issue #92).
 */
const rootNamesInOneArrayLiteral = (source: string) => {
  const matches = (span: string, root: string) =>
    new RegExp(
      `["'\`]${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`,
    ).test(span);

  return [...source.matchAll(arrayLiteralSpan)].reduce(
    (best, [span]) =>
      Math.max(
        best,
        WORKSPACE_ROOTS.filter((root) => matches(span, root)).length,
      ),
    0,
  );
};

describe("workspace 루트 목록", () => {
  it("pnpm-workspace.yaml의 목록과 같다", () => {
    expect([...WORKSPACE_ROOTS].sort()).toEqual(
      manifestWorkspaceRoots().sort(),
    );
  });

  it("루트 아래 package.json을 가진 디렉터리를 절대 경로로 전부 열거한다", () => {
    const expected = manifestPackageDirectories();

    // 빈 집합끼리의 비교는 열거가 통째로 죽어도 통과한다. 가드가 없으면 이
    // 단언은 공허하게 참이 된다.
    expect(expected.length).toBeGreaterThan(0);
    expect([...workspacePackageDirectories(repositoryRoot)].sort()).toEqual(
      expected,
    );
  });

  it("루트 목록의 불변성이 타입 층위에만 있다", () => {
    // 그 모듈의 JSDoc이 `readonly`의 층위를 주장한다. 그 주장을 여기서 진다.
    //
    // 타입 쪽: `readonly string[]`에 `push`가 없다. 타입을 넓히면 이 지시자가
    // `TS2578: Unused '@ts-expect-error' directive`로 typecheck를 무너뜨린다.
    // 런타임 쪽: 같은 줄의 단언이 `push`가 살아 있음을 확인한다 — 호출하지는
    // 않는다. 상수를 실제로 변형하면 같은 워커의 다른 테스트가 오염된다.
    // @ts-expect-error readonly 배열 타입에는 push가 없다
    expect(typeof WORKSPACE_ROOTS.push).toBe("function");
    // `Object.freeze`가 아니다. 얼리는 변경이 들어오면 이 단언이 지고, 그때
    // 모듈의 JSDoc을 함께 고치게 된다.
    expect(Object.isFrozen(WORKSPACE_ROOTS)).toBe(false);
  });
});

/**
 * 위 describe가 지는 것은 모듈의 리터럴이 매니페스트와 맞는가 하나뿐이다. 그
 * 리터럴이 **유일한 원본인가**는 아무도 지지 않았고, 그 구멍은 실측으로
 * 드러났다 — `scripts/find-duplicate-test-helpers.mjs`의 import를 지우고 로컬
 * 리터럴 사본으로 되돌려도, 그 사본에서 `fixtures`를 빼 갈리게 만들어도
 * `tests/` 전량이 통과한다.
 *
 * 두 축이 필요하고 서로를 덮지 않는다. 소비처가 import를 잃고 리터럴 사본을
 * 두면 축 2가 잡고, 리터럴 없이 매니페스트를 스스로 파싱하는 식으로 갈라지면
 * 축 1만 잡는다.
 *
 * 두 축을 합쳐도 밖에 남는 갈래가 하나 있다 — **import를 그대로 둔 채 호출
 * 결과만 로컬에서 줄이는** 형태다. 축 1은 import 구문만 보고 축 2는 배열
 * 리터럴만 보므로, 구문이 남고 사본이 생기지 않는 이 갈래에는 둘 다 발화하지
 * 않는다. 실측: `scripts/check-licenses.mjs`가 `workspacePackageDirectories()`의
 * 결과에 `.filter((directory) => !directory.includes("/fixtures/"))`를 끼우면
 * `fixtures/consumer`의 미승인 의존성이 exit 0으로 통과하는데, 그 상태에서도 이
 * 파일의 단언 5건이 전부 통과한다.
 *
 * 이 갈래를 지는 것은 게이트 **자신의 출력**이다. 게이트가 성공 줄에 훑은
 * 매니페스트 수를 싣고, 그 수를 열거에서 파생한 기대값과 대조한다 —
 * `tests/workspace-boundaries.test.ts`의 `경계 게이트의 검사 범위`와
 * `라이선스 게이트의 검사 범위`가 게이트마다 하나씩 진다. 여기서 그 대조를
 * 다시 하지 않는다. 이 파일이 소유하는 것은 목록의 단독 소유이고, 게이트가 그
 * 목록을 실제로 훑는지는 저쪽의 계약이다.
 */
describe("workspace 루트 목록의 단독 소유", () => {
  it("scripts/의 스크립트가 빠짐없이 이 모듈에서 목록을 import한다", () => {
    const scripts = consumerScriptPaths();

    // 발견이 통째로 죽으면(잘못된 cwd, glob 오타) 빈 집합 순회가 아무것도
    // 확인하지 않은 채 통과한다.
    expect(scripts.length).toBeGreaterThan(0);
    // 빠진 스크립트 이름이 실패 메시지에 그대로 남도록 불리언이 아니라 목록으로
    // 단언한다.
    const missing = scripts.filter(
      (path) =>
        !workspaceRootsImport.test(
          readFileSync(join(repositoryRoot, path), "utf8"),
        ),
    );

    expect(missing).toEqual([]);
  });

  it("루트 목록 배열 리터럴을 가진 추적 소스 파일이 이 모듈 하나뿐이다", () => {
    const sources = trackedSourcePaths();

    expect(sources.length).toBeGreaterThan(0);
    const copies = sources.filter(
      (path) =>
        rootNamesInOneArrayLiteral(
          readFileSync(join(repositoryRoot, path), "utf8"),
        ) >= rootListCopyThreshold,
    );

    // 사본이 늘어나는 방향뿐 아니라 원본이 사라지는 방향도 함께 잡으려고
    // 부분집합이 아니라 집합 자체를 단언한다.
    expect(copies).toEqual([workspaceRootsModulePath]);
  });
});
