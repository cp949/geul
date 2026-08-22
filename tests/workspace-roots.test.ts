/**
 * `scripts/workspace-roots.mjs`의 계약. 검사 범위를 정하는 스크립트들이 그
 * 모듈의 workspace 패키지 glob 목록을 공유한다.
 *
 * 그 모듈의 `WORKSPACE_PACKAGE_GLOBS`는 리터럴이라 `pnpm-workspace.yaml`과
 * 자동으로 맞춰지지 않는다. 둘이 어긋나면 소비처의 검사 범위가 조용히 트리보다
 * 좁아진다 — 새 루트 아래의 패키지는 경계 위반도, 미승인 라이선스도, 대상
 * 목록에 없는 테스트 디렉터리도 보고되지 않는다. `WORKSPACE_ROOTS`는 그
 * 리터럴에서 파생하므로, 리터럴이 맞으면 파생값도 맞는다. 그 침묵이 게이트에서와
 * 진단 도구에서 각각 어떤 얼굴로 나오는지는 그 모듈의 헤더가 소유한다.
 *
 * 여기서 두 목록을 대조하고, 그 목록으로 실제 열거되는 패키지 디렉터리 집합까지
 * 고정한다. 두 단언 모두 `pnpm-workspace.yaml`을 이 파일이 직접 파싱해 기대값을
 * 만든다 — 구현이 쓰는 리터럴과 출발점이 달라야 어긋남이 드러난다. 정규화는
 * 하지 않는다 — 다단 glob을 좁은 세그먼트로 접는 정규화가 끼면 서로 다른 두
 * glob이 같은 값으로 보여 어긋남이 사라진다.
 *
 * 그 둘만으로는 **단독 소유**가 지켜지지 않는다. 두 단언은 모듈의 리터럴만 지고
 * 소비처가 그 모듈을 실제로 쓰는지는 보지 않는다 — 실측:
 * `scripts/find-duplicate-test-helpers.mjs`의 import를 지우고 로컬 리터럴 사본으로
 * 되돌려도 `tests/` 전량이 통과하고, 루트 하나가 빠진 갈린 사본이어도 통과한다.
 * 현재 트리의 `apps`와 `fixtures` 아래에는 `test` 디렉터리가 없어 그 두 루트가 그
 * 스크립트의 후보 수집 결과에 아무 기여도 하지 않기 때문이다. 아래 describe가
 * 그 구멍을 두 축으로 막는다 — 소비처가 import하는지와, glob 목록 리터럴이나
 * 루트 이름 목록 리터럴이 저장소에 한 벌뿐인지.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  WORKSPACE_PACKAGE_GLOBS,
  WORKSPACE_ROOTS,
  workspaceChildDirectories,
  workspacePackageDirectories,
} from "../scripts/workspace-roots.mjs";

// 저장소 루트를 cwd가 아니라 이 파일 위치로 잡는다. 저장소의 다른 테스트가
// 전부 `import.meta.url` 기준이고, cwd 상대면 잘못된 cwd에서 ENOENT로 진다.
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * 매니페스트 텍스트에서 `packages:` 항목의 glob 문자열을 순서대로 뽑는 순수
 * 함수(DELTA-04). 파일 읽기와 분리해 문자열 입력만으로 단위 테스트한다.
 * `scripts/workspace-roots.mjs`는 이 목록을 리터럴로 들고 있어, 새 루트가
 * workspace에 추가되거나 기존 glob이 넓어져도 스스로는 알지 못한다. 여기서
 * 어긋남을 잡는다.
 *
 * block 형식(`packages:\n  - ...`)과 flow 형식(`packages: [...]`)을 모두
 * 받는다. block 형식의 목록 끝은 **들여쓰기 없는 다음 줄**로 판정한다 — 빈
 * 줄은 건너뛰고 계속 모은다. 실측: `pnpm-workspace.yaml`은 `packages:` 아래
 * 3항목 말고도 `minimumReleaseAgeExclude:` 아래에 `- ` 목록을 40여 개 더
 * 가진다. "파일 어디서든 `- ` 줄을 긁는" 형태로 느슨해지면 그 40여 항목까지
 * 삼킨다.
 *
 * `packages:` 키를 못 찾거나 항목이 없으면 빈 배열을 낸다 — `expect`로
 * 여기서 직접 잡지 않는다. 호출부가 `WORKSPACE_PACKAGE_GLOBS`나 리터럴
 * 기대값과 `toEqual`/`toContain`으로 대조하므로, 빈 배열도 그 대조에서
 * 시끄럽게 잡힌다.
 *
 * 정규화는 `./` 접두 제거뿐이다. 접미 glob(`apps/**`)과 부정 glob
 * (`!packages/legacy`)은 그대로 낸다 — 옛 구현의 `.replace(/\/\*+$/, "")`가
 * 다단 glob의 꼬리를 지웠고, 그 정규화 때문에 `apps/**`가 `apps/*`와 같은
 * 값으로 보여 리터럴과의 어긋남이 조용히 사라졌다(`PIT-0022`).
 */
const parseWorkspacePackageGlobs = (manifestSource: string): string[] => {
  // CRLF를 LF로 접어 두 개행 방식을 한 갈래로 합친다. 옛 구현은 블록
  // 정규식이 `packages:\r\n`을 못 받아 통째로 매치 실패했다(실측).
  const lines = manifestSource.replace(/\r\n/g, "\n").split("\n");

  for (const [index, line] of lines.entries()) {
    const keyMatch = /^packages:(.*)$/.exec(line);
    if (!keyMatch) continue;

    // flow 형식: `packages: [...]`가 한 줄에 다 있다. 캡처 그룹은
    // `noUncheckedIndexedAccess` 아래서 `string | undefined`라 `?? ""`로
    // 받는다 — 매치가 성공했으면 그룹은 항상 있다(빈 문자열일 수는 있다).
    const inline = (keyMatch[1] ?? "").trim();
    const flowMatch = /^\[([^\]]*)\]/.exec(inline);
    if (flowMatch) {
      return (flowMatch[1] ?? "")
        .split(",")
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
        .map(parseGlobToken);
    }

    // block 형식: 다음 줄부터 들여쓴 `- ` 항목을 모은다. 빈 줄은 건너뛰고,
    // 들여쓰기 없는 줄(다음 키 또는 그 앞 주석)을 만나면 멈춘다 — 그래야
    // `minimumReleaseAgeExclude:` 아래의 `- ` 목록이 섞여 들지 않는다.
    const globs: string[] = [];
    for (const nextLine of lines.slice(index + 1)) {
      if (nextLine.trim() === "") continue;
      const itemMatch = /^[ \t]+-[ \t]+(.*)$/.exec(nextLine);
      if (!itemMatch) break;
      globs.push(parseGlobToken(itemMatch[1] ?? ""));
    }
    return globs;
  }

  return [];
};

/**
 * glob 항목 원문 하나(따옴표 유무·인라인 주석·`./` 접두가 섞인 상태)를 값만
 * 남긴다. 따옴표 판정을 먼저 해야 값 안의 `#`가 인라인 주석으로 잘리지
 * 않는다 — 따옴표가 있으면 같은 종류의 다음 따옴표까지를 값으로 잘라내고,
 * 없을 때만 첫 `#`부터 잘라 인라인 주석을 없앤다. 오늘 저장소는 값 안에
 * `#`를 쓰지 않지만, 순서를 반대로 하면(항상 첫 `#`부터 자른 뒤 따옴표를
 * 벗기면) 따옴표 안의 `#`도 주석으로 잘려 나간다.
 */
const parseGlobToken = (raw: string): string => {
  const trimmed = raw.trim();
  const quoteChar = trimmed[0];
  let value: string;

  if (quoteChar === "'" || quoteChar === '"') {
    const closingIndex = trimmed.indexOf(quoteChar, 1);
    value =
      closingIndex === -1 ? trimmed.slice(1) : trimmed.slice(1, closingIndex);
  } else {
    const hashIndex = trimmed.indexOf("#");
    value = (hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex)).trim();
  }

  return value.replace(/^\.\//, "");
};

/**
 * 실제 `pnpm-workspace.yaml`의 `packages:` 항목에서 glob 문자열을 뽑는다.
 * 파일 읽기와 파싱을 분리한 얇은 껍데기다 — 파싱 자체는
 * `parseWorkspacePackageGlobs()`가 순수 함수로 진다.
 */
const manifestPackageGlobs = () =>
  parseWorkspacePackageGlobs(
    readFileSync(new URL("../pnpm-workspace.yaml", import.meta.url), "utf8"),
  );

/**
 * `pnpm-workspace.yaml`이 선언한 glob으로 `workspacePackageDirectories()`를
 * 호출해 패키지 디렉터리를 모은다.
 *
 * `workspacePackageDirectories(repositoryRoot)`(리터럴 glob)와 결과가 같아야
 * 하지만 동어반복이 아니다 — 이쪽은 매니페스트 파싱에서, 저쪽은 모듈의 리터럴
 * 목록에서 출발한다. 디렉터리를 훑는 코드는 이제 양쪽이 공유한다 — 대조 축이
 * "glob 목록의 출발점 차이"로 순수해진다. 리터럴이 트리보다 좁아지면 저쪽
 * 결과만 줄어들어 단언이 갈린다.
 */
const manifestPackageDirectories = () =>
  workspacePackageDirectories(repositoryRoot, manifestPackageGlobs());

/**
 * glob 목록에서 이름 세그먼트(첫 `/` 앞부분)만 뽑아 유니크 정렬한다.
 * `scripts/workspace-roots.mjs`의 `WORKSPACE_ROOTS` 파생과 같은 변환을
 * 독립적으로 다시 구현한다 — 임의의 glob 목록에 대한 파생 규칙 자체를 지려는
 * 것이지, 오늘의 3-glob 리터럴에서만 우연히 맞는 값을 확인하려는 것이 아니다.
 */
const rootNamesFromGlobs = (globs: readonly string[]) =>
  [...new Set(globs.map((glob) => glob.split("/")[0] ?? glob))].sort();

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
// 나타나므로, 판정 토큰을 파일 전체가 아니라 이 범위 안에서 센다.
const arrayLiteralSpan = /\[[^[\]]*\]/g;

// 한 배열 리터럴 안에 판정 대상 토큰(루트 이름 또는 glob 문자열)이 이만큼 모여
// 있으면 목록의 사본으로 본다.
//
// 루트 이름 축은 실측으로 정했다. 아래 수치는 추적 소스 파일 전량에 판정
// 후보를 각각 돌린 결과이고, 이 파일 자신의 주석도 대상에 들어 있다.
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
//
// glob 축도 같은 임계값을 쓴다. DELTA-01 실측(2026-08-23, `dev` `a7de978`):
// 배열 리터럴 범위 안에서 glob 토큰 2종 이상은 이 DELTA 이전 0건, 이후
// `scripts/workspace-roots.mjs` 1건(3종)이다. 두 축을 동시에 걸어도 오탐이
// 없다.
const arrayLiteralCopyThreshold = 2;

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
 * 소스의 배열 리터럴 하나에 `tokens`의 원소가 따옴표(또는 백틱)로 감싼 정확한
 * 토큰으로 최대 몇 **종** 모여 있는지 센다. 같은 토큰이 여러 번 나와도 1로
 * 센다 — 판정하려는 것은 등장 횟수가 아니라 목록을 이루는 원소가 한 자리에
 * 몇 종 모였는가다.
 *
 * 판정 대상 토큰을 인자로 받는다 — 리터럴로 적으면 이 파일 자신이 사본으로
 * 잡혀 단언이 곧바로 진다. glob 축(`WORKSPACE_PACKAGE_GLOBS`)과 루트 이름 축
 * (`WORKSPACE_ROOTS`)이 서로 다른 토큰 집합으로 같은 판정을 쓴다. 정규식
 * 특수문자는 이스케이프한다 — glob의 `*`를 포함해서다. 지금 루트 이름에는
 * 특수문자가 없지만, 이스케이프를 빠뜨린 식별자 삽입이 정규화를 조용히
 * 무효로 만든 전례가 있다(`PIT-0022`의 Issue #92).
 */
const tokensInOneArrayLiteral = (source: string, tokens: readonly string[]) => {
  const matches = (span: string, token: string) =>
    new RegExp(
      `["'\`]${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`,
    ).test(span);

  return [...source.matchAll(arrayLiteralSpan)].reduce(
    (best, [span]) =>
      Math.max(best, tokens.filter((token) => matches(span, token)).length),
    0,
  );
};

// 아래 픽스처는 항목이 2개 이상인 자리마다 가상 이름(alpha·beta·gamma)을
// 쓴다(Ruling 1, DELTA-04). `apps`·`fixtures`·`packages`를 한 배열 리터럴에
// 2종 이상 나란히 적으면 "단독 소유" describe의 사본 판정(아래
// `arrayLiteralCopyThreshold`)에 이 파일 자신이 걸린다 — 파싱 규칙은 이름과
// 무관하고, 실제 매니페스트 대조는 "pnpm-workspace.yaml의 packages: 항목과
// 문자열 그대로 같다"가 따로 진다. 단일 항목 픽스처(`apps/*`·`apps/**` 하나
// 뿐인 자리)는 1종이라 실제 이름을 그대로 쓴다.
describe("parseWorkspacePackageGlobs()", () => {
  it("인라인 주석이 든 항목은 값만 낸다", () => {
    // 변이 확인(보고서 기록): 인라인 주석 제거를 빼면 `"제외"`가 섞여 이
    // 단언이 진다.
    expect(
      parseWorkspacePackageGlobs("packages:\n  - apps/* # legacy - 제외\n"),
    ).toEqual(["apps/*"]);
  });

  it("flow 형식을 파싱한다", () => {
    // 변이 확인(보고서 기록): block 형식만 처리하면 빈 목록이 나와 이 단언이
    // 진다.
    expect(
      parseWorkspacePackageGlobs(
        "packages: ['alpha/*', 'beta/*', 'gamma/*']\n",
      ),
    ).toEqual(["alpha/*", "beta/*", "gamma/*"]);
  });

  it("CRLF 매니페스트를 LF와 같게 파싱한다", () => {
    // 변이 확인(보고서 기록): `\r` 제거를 빼면 값에 `\r`이 남아 이 단언이
    // 진다.
    expect(
      parseWorkspacePackageGlobs("packages:\r\n  - alpha/*\r\n  - beta/*\r\n"),
    ).toEqual(["alpha/*", "beta/*"]);
  });

  it("목록 중간 빈 줄과 EOF 개행 없음을 견딘다", () => {
    // 변이 확인(보고서 기록): 항목 사이 빈 줄에서 멈추면 뒤 항목이, EOF에
    // 개행이 없으면 마지막 항목이 빠져 이 단언이 진다.
    expect(
      parseWorkspacePackageGlobs("packages:\n  - alpha/*\n\n  - beta/*\n"),
    ).toEqual(["alpha/*", "beta/*"]);
    expect(
      parseWorkspacePackageGlobs("packages:\n  - alpha/*\n  - beta/*"),
    ).toEqual(["alpha/*", "beta/*"]);
  });

  it("./ 접두를 apps/*로 정규화한다", () => {
    // 변이 확인(보고서 기록): 접두 제거를 빼면 `"./apps/*"`가 남아 리터럴
    // 대조(`["apps/*"]`)가 진다.
    expect(parseWorkspacePackageGlobs("packages:\n  - './apps/*'\n")).toEqual([
      "apps/*",
    ]);
  });

  it("접미 glob은 정규화하지 않고 그대로 낸다", () => {
    // 오늘도 GREEN이다 — DELTA-01이 이미 닫은 구멍이라 여기서 RED로 만들 수
    // 없다. 회귀 방어용: `parseGlobToken`에 `.replace(/\/\*+$/, "")`를
    // 되살렸을 때 이 단언이 지는 것을 직접 확인하고 원복했다(보고서 기록).
    expect(parseWorkspacePackageGlobs("packages:\n  - 'apps/**'\n")).toEqual([
      "apps/**",
    ]);
  });

  it("부정 glob을 항목으로 그대로 낸다", () => {
    // 오늘도 GREEN이다 — 회귀 방어용: `!`로 시작하는 항목을 버리는 필터를
    // 넣었을 때 이 단언이 지는 것을 직접 확인하고 원복했다(보고서 기록).
    expect(
      parseWorkspacePackageGlobs(
        "packages:\n  - '!packages/legacy'\n  - alpha/*\n",
      ),
    ).toEqual(["!packages/legacy", "alpha/*"]);
  });
});

describe("workspace 패키지 glob 목록", () => {
  it("pnpm-workspace.yaml의 packages: 항목과 문자열 그대로 같다", () => {
    expect([...WORKSPACE_PACKAGE_GLOBS].sort()).toEqual(
      manifestPackageGlobs().sort(),
    );

    // 완료 조건 1의 RED 시나리오: `- apps/*`를 `- apps/**`로 바꾼 매니페스트
    // 사본을 주입해, 다단 glob이 정규화 없이 그대로 남는지를 진다. 옛
    // `.replace(/\/\*+$/, "")`가 있었다면 `apps/**`가 `apps/*`와 같은 값으로
    // 보였을 자리다. 실제 `pnpm-workspace.yaml`은 건드리지 않고 텍스트 사본만
    // 임시로 만든다.
    const mutatedGlobs = parseWorkspacePackageGlobs(
      readFileSync(
        new URL("../pnpm-workspace.yaml", import.meta.url),
        "utf8",
      ).replace("  - apps/*\n", "  - apps/**\n"),
    );

    expect(mutatedGlobs).toContain("apps/**");
    expect(mutatedGlobs).not.toContain("apps/*");
    expect([...WORKSPACE_PACKAGE_GLOBS]).toContain("apps/*");
  });

  it("WORKSPACE_ROOTS가 glob 목록에서 파생되고 값이 오늘과 같다", () => {
    // 완료 조건 2의 RED 시나리오: 임의의 glob 목록을 주입해 파생 규칙 자체를
    // 진다. 첫 세그먼트 대신 마지막 세그먼트를 뽑는 식으로 갈리면 여기서
    // 잡힌다. 오늘의 루트 이름·glob을 그대로 쓰지 않는다 — 그 문자열 그대로를
    // 한 배열 리터럴에 두 종 이상 모으면 아래 "단독 소유" describe의 사본
    // 판정에 이 파일 자신이 걸린다. 그래서 실존하지 않는 이름으로 규칙만
    // 검증한다.
    expect(rootNamesFromGlobs(["alpha/*", "beta/*"])).toEqual([
      "alpha",
      "beta",
    ]);

    // 모듈의 실제 파생값이, 같은 규칙을 독립적으로 적용한 값과 같다.
    expect([...WORKSPACE_ROOTS]).toEqual(
      rootNamesFromGlobs(WORKSPACE_PACKAGE_GLOBS),
    );
    // 오늘의 값과 같다. 세 이름을 한 배열 리터럴로 나란히 적지 않는다 — 위와
    // 같은 이유다.
    expect(WORKSPACE_ROOTS.length).toBe(3);
    expect(WORKSPACE_ROOTS).toContain("apps");
    expect(WORKSPACE_ROOTS).toContain("fixtures");
    expect(WORKSPACE_ROOTS).toContain("packages");
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
 * DELTA-02 "fixture 구성" 절의 임시 트리를 만든다. workspace 루트를 `tmpRoot`
 * 바로 아래가 아니라 `tmpRoot/repo`에 둔다 — fixture 표가 명시한 심링크 대상
 * `../../external/pkg`(`packages/linked`에서 두 단계 위)가 `tmpRoot/external/pkg`에
 * 닿으려면 `packages/`가 `repo/` 한 단계를 더 거쳐야 한다. `tmpRoot` 바로
 * 아래에 `packages/`를 두면 같은 상대 경로가 `tmpdir()` 바깥, 다른 프로세스의
 * 임시 디렉터리와 같은 위치를 가리켜 병렬 실행 시 충돌할 수 있다.
 *
 * 반환하는 `tmpRoot`는 호출자가 `afterEach`에서 통째로 지운다 — 이 함수
 * 자신은 정리하지 않는다.
 */
const createSymlinkFixtureRoot = () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "geul-workspace-roots-"));
  const repoRoot = join(tmpRoot, "repo");
  const packagesDir = join(repoRoot, "packages");
  const externalDir = join(tmpRoot, "external");

  // packages/plain — 일반 디렉터리, package.json 있음. 열거에 들어온다.
  mkdirSync(join(packagesDir, "plain"), { recursive: true });
  writeFileSync(join(packagesDir, "plain", "package.json"), "{}\n");

  // 심링크 세 종의 대상. externalDir는 packages/ 바깥에 둬 "심링크를 안
  // 따라가면 아예 안 보인다"는 조건을 실제로 만든다.
  mkdirSync(join(externalDir, "pkg"), { recursive: true });
  writeFileSync(join(externalDir, "pkg", "package.json"), "{}\n");
  writeFileSync(join(externalDir, "notes.txt"), "not a package\n");

  // packages/linked — 디렉터리를 가리키는 심링크, 대상에 package.json 있음.
  // entry.isDirectory()는 심링크에 false를 돌려주므로, 심링크를 따라가지 않는
  // 술어에서는 이 항목이 조용히 빠진다(완료 조건 1의 RED 지점).
  symlinkSync("../../external/pkg", join(packagesDir, "linked"), "dir");
  // packages/filelink — 파일을 가리키는 심링크. 세지 않는다.
  symlinkSync(
    "../../external/notes.txt",
    join(packagesDir, "filelink"),
    "file",
  );
  // packages/broken — 끊어진 심링크(대상 미생성). 세지 않는다 — statSync가
  // ENOENT로 죽지 않고 조용히 빠져야 한다.
  symlinkSync("../../external/gone", join(packagesDir, "broken"), "dir");

  // packages/nofile — 디렉터리이지만 package.json이 없다. 세지 않는다.
  mkdirSync(join(packagesDir, "nofile"), { recursive: true });
  // packages/loose.txt — 디렉터리가 아니라 일반 파일. 세지 않는다.
  writeFileSync(join(packagesDir, "loose.txt"), "not a directory\n");

  return { tmpRoot, repoRoot };
};

describe("workspacePackageDirectories()", () => {
  // 완료 조건 3의 RED 시나리오: `<이름>/*`가 아닌 다섯 패턴이 각각 throw하는지
  // `it.each`로 진다.
  it.each([
    "apps/**",
    "apps",
    "!packages/legacy",
    "apps/**/*",
    "./apps/*",
  ])("%s처럼 <이름>/* 형태가 아닌 glob은 throw한다", (glob) => {
    expect(() => workspacePackageDirectories(repositoryRoot, [glob])).toThrow();
  });

  it("매니페스트에서 파생한 열거와 리터럴에서 파생한 열거가 같고, 결과가 오늘의 6개다", () => {
    const expected = manifestPackageDirectories();

    // 빈 집합끼리의 비교는 열거가 통째로 죽어도 통과한다. 가드가 없으면 이
    // 단언은 공허하게 참이 된다.
    expect(expected.length).toBeGreaterThan(0);
    expect([...workspacePackageDirectories(repositoryRoot)].sort()).toEqual(
      expected,
    );
    expect(
      expected.map((directory) => relative(repositoryRoot, directory)).sort(),
    ).toEqual([
      "apps/demo",
      "fixtures/consumer",
      "packages/core",
      "packages/io",
      "packages/model",
      "packages/react",
    ]);
  });

  describe("열거 술어가 디렉터리 심링크를 pnpm과 같게 센다", () => {
    // 각 `it` 사이의 fixture 누수를 막는다 — `it` 안에서 만든 tmpRoot를 여기
    // 담아 뒀다가 지운다.
    let tmpRoot: string | undefined;

    afterEach(() => {
      if (tmpRoot === undefined) return;
      rmSync(tmpRoot, { recursive: true, force: true });
      tmpRoot = undefined;
    });

    it("디렉터리 심링크는 세고, 파일 심링크·끊어진 심링크·package.json 없는 디렉터리·일반 파일은 세지 않는다", () => {
      const fixture = createSymlinkFixtureRoot();
      tmpRoot = fixture.tmpRoot;

      const result = workspacePackageDirectories(fixture.repoRoot, [
        "packages/*",
      ]).map((directory) => relative(fixture.repoRoot, directory));

      // 완료 조건 1: 디렉터리를 가리키는 심링크(대상에 package.json 있음)가
      // 열거에 들어온다. 오늘의 `entry.isDirectory()` 단독 술어는 심링크에
      // false를 돌려주므로, 이 단언이 구현 전 RED다.
      expect(result).toContain("packages/linked");
      // 일반 디렉터리도 그대로 들어온다 — 위 조건과 짝을 이루는 대조군.
      expect(result).toContain("packages/plain");
      // 완료 조건 2: 파일을 가리키는 심링크는 세지 않는다.
      expect(result).not.toContain("packages/filelink");
      // 완료 조건 2: 끊어진 심링크는 세지 않는다 — 여기 도달했다는 것 자체가
      // statSync가 ENOENT로 죽지 않았다는 증거다.
      expect(result).not.toContain("packages/broken");
      // 완료 조건 3: package.json 없는 디렉터리는 세지 않는다.
      expect(result).not.toContain("packages/nofile");
      // 완료 조건 4: 일반 파일은 세지 않는다.
      expect(result).not.toContain("packages/loose.txt");

      // 위 낱개 단언이 전부 통과해도 우연일 수 있다 — 결과 집합 전체를
      // 고정해 이 여섯 항목 밖의 무언가가 잘못 섞여 들어오는 경우도 잡는다.
      expect(result.sort()).toEqual(["packages/linked", "packages/plain"]);
    });
  });
});

describe("workspaceChildDirectories()", () => {
  // glob 형태 검증은 이 함수가 단독 소유한다 — `workspacePackageDirectories()`는
  // 이 함수에 위임할 뿐이다. 위임이 깨져도(예: 검증을 지역에 다시 심으면) 여기가
  // 직접 잡는다.
  it.each([
    "apps/**",
    "apps",
    "!packages/legacy",
    "apps/**/*",
    "./apps/*",
  ])("%s처럼 <이름>/* 형태가 아닌 glob은 throw한다", (glob) => {
    expect(() => workspaceChildDirectories(repositoryRoot, [glob])).toThrow();
  });

  describe("package.json 필터 없이 자식 디렉터리 전량을 내고, 심링크를 pnpm과 같게 센다", () => {
    // 각 `it` 사이의 fixture 누수를 막는다.
    let tmpRoot: string | undefined;

    afterEach(() => {
      if (tmpRoot === undefined) return;
      rmSync(tmpRoot, { recursive: true, force: true });
      tmpRoot = undefined;
    });

    it("package.json 없는 디렉터리도 포함하고, 디렉터리 심링크도 세고, 파일 심링크·끊어진 심링크·일반 파일은 세지 않는다", () => {
      const fixture = createSymlinkFixtureRoot();
      tmpRoot = fixture.tmpRoot;

      const result = workspaceChildDirectories(fixture.repoRoot, [
        "packages/*",
      ]).map((directory) => relative(fixture.repoRoot, directory));

      // 이 describe의 핵심: `workspacePackageDirectories()`라면 세지 않는
      // package.json 없는 디렉터리가 여기서는 후보로 들어온다. 대신
      // `workspacePackageDirectories()`로 바꿔 부르면 이 단언이 진다 — 탐지
      // 범위가 좁아지는 변이를 여기서 잡는다.
      expect(result).toContain("packages/nofile");
      // 심링크 추종 술어는 DELTA-02가 확정한 것을 그대로 물려받는다 —
      // `workspacePackageDirectories()`의 같은 이름 테스트와 짝이다.
      expect(result).toContain("packages/linked");
      expect(result).toContain("packages/plain");
      expect(result).not.toContain("packages/filelink");
      expect(result).not.toContain("packages/broken");
      expect(result).not.toContain("packages/loose.txt");

      // 위 낱개 단언 밖의 무언가가 잘못 섞여 들어오는 경우까지 잡는다.
      expect(result.sort()).toEqual([
        "packages/linked",
        "packages/nofile",
        "packages/plain",
      ]);
    });

    it("workspacePackageDirectories()가 이 함수의 결과에 package.json 필터를 얹은 것과 같다", () => {
      const fixture = createSymlinkFixtureRoot();
      tmpRoot = fixture.tmpRoot;

      const children = workspaceChildDirectories(fixture.repoRoot, [
        "packages/*",
      ]);
      const packages = workspacePackageDirectories(fixture.repoRoot, [
        "packages/*",
      ]);

      // `workspacePackageDirectories()`가 술어를 되풀이하지 않고 이 함수의
      // 결과 위에 필터만 얹은 것인지를 진다 — 두 구현이 갈리면(예: 되돌아가
      // 자기 루프를 다시 심으면) 이 등식이 깨진다.
      expect(packages).toEqual(
        children.filter((directory) =>
          existsSync(join(directory, "package.json")),
        ),
      );
    });
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
 * 파일의 단언이 전부 통과한다.
 *
 * 이 갈래를 지는 것은 게이트 **자신의 출력**이다. 게이트가 성공 줄에 훑은
 * 매니페스트 수를 싣고, 그 수를 열거에서 파생한 기대값과 대조한다 —
 * `tests/workspace-boundaries.test.ts`의 `경계 게이트의 검사 범위`와
 * `라이선스 게이트의 검사 범위`가 게이트마다 하나씩 진다. 여기서 그 대조를
 * 다시 하지 않는다. 이 파일이 소유하는 것은 목록의 단독 소유이고, 게이트가 그
 * 목록을 실제로 훑는지는 저쪽의 계약이다.
 *
 * 사본 축은 둘이다(완료 조건 5) — glob 축은 `WORKSPACE_PACKAGE_GLOBS`의 원소를,
 * 루트 이름 축은 `WORKSPACE_ROOTS`의 원소를 판정 토큰으로 쓴다. glob 축은 이
 * 모듈 자신의 리터럴을 잡아 1건을 기대하고, 루트 이름 축은 리터럴이 더는
 * 존재하지 않으므로(`WORKSPACE_ROOTS`는 파생값이다) 0건을 기대한다.
 */
describe("workspace 패키지 glob·루트 이름 목록의 단독 소유", () => {
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

  it("glob 목록 배열 리터럴을 가진 추적 소스 파일이 이 모듈 하나뿐이다", () => {
    const sources = trackedSourcePaths();

    expect(sources.length).toBeGreaterThan(0);
    const copies = sources.filter(
      (path) =>
        tokensInOneArrayLiteral(
          readFileSync(join(repositoryRoot, path), "utf8"),
          WORKSPACE_PACKAGE_GLOBS,
        ) >= arrayLiteralCopyThreshold,
    );

    // 사본이 늘어나는 방향뿐 아니라 원본이 사라지는 방향도 함께 잡으려고
    // 부분집합이 아니라 집합 자체를 단언한다.
    expect(copies).toEqual([workspaceRootsModulePath]);
  });

  it("루트 이름 배열 리터럴을 가진 추적 소스 파일이 없다", () => {
    const sources = trackedSourcePaths();

    expect(sources.length).toBeGreaterThan(0);
    const copies = sources.filter(
      (path) =>
        tokensInOneArrayLiteral(
          readFileSync(join(repositoryRoot, path), "utf8"),
          WORKSPACE_ROOTS,
        ) >= arrayLiteralCopyThreshold,
    );

    // `WORKSPACE_ROOTS`는 이제 파생값이라 리터럴로 적힌 곳이 없어야 한다 —
    // 리터럴로 되돌리는 사본이 생기면 여기서 잡는다.
    expect(copies).toEqual([]);
  });
});
