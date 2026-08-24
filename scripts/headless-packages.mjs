/**
 * headless 판정 대상 workspace 패키지 목록(`HEADLESS_PACKAGES`)과, 그 패키지의
 * production 의존성에 있으면 안 되는 에디터·UI 의존성 판정 술어
 * (`HEADLESS_FORBIDDEN`)를 게이트 스크립트 쪽에서 단독 소유한다.
 *
 * "게이트 쪽에서"라는 한정이 필요하다(실측). 같은 규칙의 두 번째 표현이
 * `tests/workspace-boundaries.test.ts`의 `forbiddenDependencies`에 있고 —
 * `packages/io`·`packages/model`이 `react`·`@tiptap/`·`prosemirror-`를 막는다 —
 * 그쪽은 `react-dom`이 빠진 채로 이미 갈려 있다. 그 표는 이 모듈보다 먼저
 * 있었고 패키지별 허용·금지 표의 일부라 여기로 합치지 않았다. 두 자리가 같은
 * 판단을 표현한다는 사실을 여기 적어 둔다 — headless 금지 목록을 바꾸면 그
 * 표도 함께 본다.
 *
 * `HEADLESS_PACKAGES`는 `scripts/check-package-boundaries.mjs`가 headless
 * 경계를 검사할 패키지의 저장소 상대 경로 리터럴이다. 어떤 패키지가
 * headless여야 하는지는 제품 판단이지 트리에서 관측할 수 있는 사실이 아니다
 * — 이 모듈은 그 판단을 대신하지 않고 사람이 적은 값을 그대로 들고 있는다.
 *
 * ## 왜 tsconfig에서 파생하지 않는가
 *
 * 오늘 이 리터럴의 값은 tsconfig `compilerOptions.lib`에 `DOM`이 없는
 * workspace 패키지 집합과 우연히 같다(`packages/io`, `packages/model`). 그
 * 일치를 근거로 목록을 tsconfig에서 파생하면, tsconfig가 headless 경계라는
 * 제품 판단의 대리가 된다 — `lib`를 바꾸는 순간 아무 논의 없이 검사 대상이
 * 함께 바뀐다. 계약이 구현을 되뇌는 동어반복이기도 하다(`G-TST-002`): 파생
 * 규칙과 그 규칙이 읽는 tsconfig가 같은 층위에 있으면, 파생 자체가 잘못돼도
 * 대조할 독립 출발점이 남지 않는다. 그래서 리터럴을 유지하고, 그 값이
 * tsconfig 실측과 갈리지 않는지만 **대조**한다.
 *
 * ## 소비자
 *
 * `scripts/check-package-boundaries.mjs`가 `headlessPackageDirectories()`로
 * 이 리터럴을 실제 workspace 열거(`scripts/workspace-roots.mjs`의
 * `workspacePackageDirectories()`)와 교차 검증해 절대 디렉터리 경로로 바꾸고,
 * 그 패키지들의 production 의존성 섹션에서 `HEADLESS_FORBIDDEN` 술어에 걸리는
 * 이름을 찾는다.
 *
 * ## 이 파일을 감시하는 계약
 *
 * `HEADLESS_PACKAGES`가 소비처(`scripts/check-package-boundaries.mjs`)로
 * 되돌아가 배열 리터럴 사본으로 복제되지 않는지는
 * `tests/workspace-roots.test.ts`의
 * `describe("workspace 패키지 glob·루트 이름 목록·headless 목록의 단독 소유", ...)`가
 * 진다 — 그 파일이 이미 소유한 배열 리터럴 사본 탐지 술어를 그대로 재사용하는
 * 세 번째 토큰 축이다. `HEADLESS_PACKAGES` 값이 tsconfig `lib`의 DOM 유무와
 * 계속 같은 집합인지, `HEADLESS_FORBIDDEN`이 무엇을 막고 무엇을 막지 않는지,
 * 그리고 게이트 호출부가 `packagePaths`로 검사 범위를 좁히지 않는지는
 * `tests/workspace-boundaries.test.ts`가 진다. 어느 계약도 줄 번호를
 * 인용하지 않는다 — 인용 대상이 움직여도 아무것도 실패하지 않는다.
 */
import { resolve } from "node:path";

import { workspacePackageDirectories } from "./workspace-roots.mjs";

/**
 * headless 판정 대상 workspace 패키지의 저장소 상대 경로. 정렬된 순서다.
 *
 * @type {readonly string[]}
 */
export const HEADLESS_PACKAGES = ["packages/io", "packages/model"];

/**
 * headless 패키지의 production 의존성 섹션에 있으면 안 되는 이름 판정
 * 술어다. React 자체(`react`·`react-dom`)와 리치 텍스트 에디터 계열
 * (`@tiptap/*`·`prosemirror-*`)을 막는다 —
 * `scripts/check-package-boundaries.mjs`의 `forbiddenProductDependencies`와
 * 같은 모양이다.
 */
export const HEADLESS_FORBIDDEN = [
  /** @param {string} name */
  (name) => name === "react",
  /** @param {string} name */
  (name) => name === "react-dom",
  /** @param {string} name */
  (name) => name.startsWith("@tiptap/"),
  /** @param {string} name */
  (name) => name.startsWith("prosemirror-"),
];

/**
 * `packagePaths`(기본값 `HEADLESS_PACKAGES`)의 각 항목을 절대 디렉터리
 * 경로로 바꾸면서, 그 경로가 실제 workspace 열거(`enumeratedDirectories`,
 * 기본값은 `workspacePackageDirectories(repoRoot)`)에 없으면 throw한다.
 * 리터럴의 오타나 삭제된 패키지를 조용히 건너뛰지 않고 그 자리에서 드러낸다
 * — 디스크에 `package.json`이 있어도 `pnpm-workspace.yaml`의 glob 밖에 있는
 * 디렉터리를 가리키는 리터럴 항목까지 잡는다는 점에서, 매니페스트를 직접
 * 읽는 오늘의 ENOENT 크래시와는 다른 층위의 보증이다.
 *
 * `packagePaths`와 `enumeratedDirectories`를 둘 다 주입할 수 있게 연 것은
 * 테스트가 실제 `pnpm-workspace.yaml`이나 `HEADLESS_PACKAGES` 원본을 건드리지
 * 않고 throw 경로를 fixture 단위로 지기 위해서다.
 *
 * @param {string} repoRoot 저장소 루트 경로. 상대 경로면 cwd 기준으로 해석된다.
 * @param {{
 *   packagePaths?: readonly string[],
 *   enumeratedDirectories?: readonly string[],
 * }} [options]
 * @returns {string[]} 절대 디렉터리 경로 목록. 입력 순서를 유지한다.
 */
export const headlessPackageDirectories = (
  repoRoot,
  { packagePaths = HEADLESS_PACKAGES, enumeratedDirectories } = {},
) => {
  const enumerated =
    enumeratedDirectories ?? workspacePackageDirectories(repoRoot);
  const enumeratedSet = new Set(enumerated);

  return packagePaths.map((packagePath) => {
    const directory = resolve(repoRoot, packagePath);
    if (!enumeratedSet.has(directory)) {
      throw new Error(
        `headlessPackageDirectories: workspace 열거에 없는 패키지다: ${JSON.stringify(packagePath)}`,
      );
    }
    return directory;
  });
};
