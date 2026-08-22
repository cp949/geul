/**
 * 검사 범위를 정하는 스크립트들이 공유하는 workspace 패키지 glob 목록과, 그 glob이
 * 가리키는 패키지 디렉터리 열거를 단독 소유한다.
 *
 * `WORKSPACE_PACKAGE_GLOBS`는 `pnpm-workspace.yaml`의 `packages:` 목록과
 * 문자열 그대로 같아야 한다. 여기가 어긋나면 새 workspace 루트 아래의 패키지가
 * 검사 대상에서 통째로 빠지거나, 매니페스트가 다단 glob으로 넓어졌는데 이 목록만
 * 좁은 세그먼트로 남아 트리보다 좁은 범위를 조용히 검사한다. 감시 범위가
 * 조용히 좁아진 감시 장치는 없는 것과 같다.
 *
 * 그 침묵이 소비처마다 다른 얼굴로 나온다.
 *
 * - 게이트(`check:boundaries`·`check:licenses`)는 위반을 하나도 보지 못한 채
 *   그대로 통과한다.
 * - 진단 도구(`scan:test-helpers`)는 애초에 실패로 끝나지 않아 통과가 신호가
 *   아니다. 대신 훑지 못한 범위를 "중복 없음"으로 보고해 잘못된 증거를 만든다 —
 *   `PIT-0022`가 막으려는 형태다.
 *
 * 어느 쪽도 실패로 드러나지 않으므로, 이 목록이 `pnpm-workspace.yaml`과
 * 어긋나지 않는지를 계약 테스트가 대조한다(`tests/workspace-roots.test.ts`). 그
 * 대조는 glob 문자열을 정규화 없이 그대로 비교한다 — 다단 glob을 단일 세그먼트로
 * 접는 정규화가 끼면 서로 다른 두 glob이 같은 값으로 보여, 어긋남이 조용히
 * 사라진다.
 *
 * ## 왜 pnpm-workspace.yaml을 파싱하지 않는가
 *
 * 구현이 매니페스트를 파싱하면 계약 테스트가 파서를 자기 자신과 대조하는
 * 동어반복이 되어 drift 감시가 사라진다(`PIT-0022`: 단언이 구현을 되뇌면 그
 * 계약은 고정되지 않는다). 리터럴 목록과 테스트 쪽 독립 파서는 의도된
 * 이중화다 — 두 출발점이 갈리는 순간이 곧 실패다.
 *
 * ## 소비자
 *
 * 소비 성격은 셋이다.
 *
 * - `workspacePackageDirectories()`로 패키지 디렉터리를 받아 그 하나하나에 검사를
 *   돌리는 쪽. glob이 가리키는 루트가 빠지면 그 아래 패키지 전부가 검사에서
 *   사라진다.
 * - `workspaceChildDirectories()`로 `package.json` 필터 없는 자식 디렉터리
 *   전량을 받는 쪽. 패키지가 아닌 디렉터리(예: `test`)까지 진단 대상으로 봐야
 *   하는 소비처가 이 형태를 쓴다 — `workspacePackageDirectories()`로 좁히면
 *   그 디렉터리가 조용히 빠진다.
 * - `WORKSPACE_ROOTS`를 직접 받아 루트 이름으로 소속을 판정하는 쪽. 이 이름
 *   목록은 `WORKSPACE_PACKAGE_GLOBS`에서 파생한다 — 리터럴을 두 벌 두면 #106이
 *   없앤 사본이 되살아난다.
 *
 * 소비 **파일**은 여기에 열거하지 않는다. 손으로 적은 목록이 트리와 갈리는 것이
 * 이 모듈이 없애려는 결함 자체이고, 열거해 봐야 이미 트리에서 직접 발견해 지는
 * 축들을 되뇌면서 갈릴 수만 있다 — `scripts/`의 `.mjs`가 빠짐없이 이 모듈에서
 * 목록을 import하는지, 그리고 추적 소스 전체에서 이 모듈의 glob 목록이나 루트
 * 이름 목록을 배열 리터럴로 복제한 파일이 이 파일 하나뿐인지. 전부
 * `tests/workspace-roots.test.ts`가 진다.
 *
 * 그 계약 테스트를 이름으로 가리키는 것은 `PIT-0022`의 예외 2다 — 공용 모듈이
 * 자기 전제를 지는 쪽을 가리키는 방향이다. 줄 번호는 인용하지 않는다 — 인용
 * 대상이 움직여도 아무것도 실패하지 않는다.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `<이름>/*` 형태의 glob 하나를 이름 세그먼트로 가른다. 이름 세그먼트는 슬래시를
 * 포함하지 않는 임의의 앞부분이고, 그 뒤에 정확히 `/*`(단일 별) 하나만 와야
 * 전체 문자열과 일치한다 — 이중 별, 이름 없는 패턴, 부정 접두, 이름 뒤에 추가
 * 세그먼트가 오는 패턴, `./` 접두 패턴은 전부 이 형태가 아니다.
 *
 * @type {RegExp}
 */
const singleSegmentGlobPattern = /^([^/]+)\/\*$/;

/**
 * workspace 패키지 glob 목록. `pnpm-workspace.yaml`의 `packages:` 항목과
 * 문자열 그대로 같다 — 계약 테스트가 정규화 없이 그대로 대조한다.
 *
 * `readonly`는 **타입 층위**의 제약이다(실측). `tsc -p scripts/tsconfig.json`이
 * `push`·`sort`를 `TS2339`로, 인덱스 쓰기를 `TS2542`로 막는다. 런타임은 막지
 * 않는다 — `Object.freeze`가 아니라 `WORKSPACE_PACKAGE_GLOBS.push("zzz")`가
 * 그대로 통한다.
 *
 * @type {readonly string[]}
 */
export const WORKSPACE_PACKAGE_GLOBS = ["apps/*", "fixtures/*", "packages/*"];

/**
 * workspace 루트 디렉터리 이름. `WORKSPACE_PACKAGE_GLOBS`의 각 glob에서 이름
 * 세그먼트(첫 번째 `/` 앞부분)만 뽑아 유니크 집합으로 만들고 정렬한다 — 파생값이지
 * 별도 리터럴이 아니다. 리터럴을 두 벌 두면 두 출발점이 갈릴 자리가 다시 생긴다.
 *
 * 정렬은 읽는 사람을 위한 정규화다. 계약 테스트가 양쪽을 `.sort()`해 대조하고,
 * 소비처도 이 순서를 읽지 않는다(실측) — 루트 아래를 훑어 목록을 만드는 쪽은
 * 결과를 정렬해 돌려주고, 그 밖의 자리는 소속 판정(`includes()`)이나 개수
 * 세기처럼 순서가 결과에 닿지 않는 형태다.
 *
 * `readonly`는 위와 마찬가지로 **타입 층위**의 제약이다. 파생 배열도 런타임에는
 * 얼리지 않는다 — `WORKSPACE_ROOTS.push("zzz")`가 그대로 통한다.
 *
 * @type {readonly string[]}
 */
export const WORKSPACE_ROOTS = [
  ...new Set(WORKSPACE_PACKAGE_GLOBS.map((glob) => glob.split("/")[0] ?? glob)),
].sort();

/**
 * 각 workspace glob이 가리키는 디렉터리 바로 아래의 자식 디렉터리 **전량**을
 * 모은다. `package.json` 유무는 보지 않는다 — 그 필터는
 * `workspacePackageDirectories()`가 이 함수의 결과 위에 얹는다.
 *
 * glob은 `<이름>/*` 형태여야 한다 — `singleSegmentGlobPattern`이 여는 형태가
 * 아닌 glob(이중 별, 이름 없는 패턴, 부정 접두, 추가 세그먼트, `./` 접두 등)은
 * throw한다. 그 형태를 조용히 첫 세그먼트로 접어 처리하면 매니페스트가 다단
 * glob으로 넓어져도 검사가 계속 좁은 범위로 통과해 어긋남이 드러나지 않는다.
 *
 * 루트 디렉터리가 없으면 건너뛴다 — `pnpm-workspace.yaml`이 선언한 루트라도
 * 트리에 아직 없을 수 있고, 그때 `readdirSync`가 ENOENT로 죽으면 게이트가
 * 검사 실패가 아니라 크래시로 끝난다.
 *
 * 자식 항목 판정은 `entry.isDirectory()` 단독이 아니라 디렉터리 심링크까지
 * 센다. `Dirent.isDirectory()`는 심링크에 항상 `false`를 돌려주는데, pnpm은
 * workspace 패키지를 심링크로 연결해도 그대로 패키지로 센다 — 여기서
 * 심링크를 세지 않으면 pnpm이 검사하는 패키지 중 일부가 이 열거에서만
 * 조용히 빠진다. 대상이 디렉터리인지는 `statSync`로 대상까지 따라가
 * 확인하고, 파일을 가리키는 심링크는 여전히 제외한다. `throwIfNoEntry: false`가
 * 없으면 끊어진 심링크에서 `statSync`가 ENOENT로 죽어, 게이트가 검사 실패가
 * 아니라 크래시로 끝난다 — 위 "루트 디렉터리가 없으면 건너뛴다"와 같은 이유다.
 *
 * 이 술어(심링크 추종 포함)를 이 함수가 **단독 소유**한다.
 * `workspacePackageDirectories()`를 포함해 자식 디렉터리를 세는 모든 소비처가
 * 이 함수를 거쳐야 한다 — 로컬에서 다시 구현하면 술어가 갈릴 자리가
 * 되살아난다. `scripts/find-duplicate-test-helpers.mjs`의
 * `collectTestDirectoryCandidates()`가 DELTA-03 이전에는 `package.json` 필터
 * 없는 이 열거를 자기 루프로 다시 구현한 세 번째 사본이었다(`PIT-0022`).
 *
 * `package.json` 필터 없이 전량을 내는 이유는 소비처마다 다르다.
 * `workspacePackageDirectories()`는 패키지만 보지만,
 * `collectTestDirectoryCandidates()`는 `package.json` 없는 디렉터리 아래의
 * `test`도 진단 대상으로 봐야 한다 — 필터가 있는 함수 위에 이걸 얹으면 그
 * 디렉터리가 조용히 빠져 진단 범위가 좁아진다.
 *
 * @param {string} repoRoot 저장소 루트 경로. 상대 경로면 cwd 기준으로 해석된다.
 * @param {readonly string[]} [globs] workspace 패키지 glob 목록. 기본값은
 *   `WORKSPACE_PACKAGE_GLOBS`.
 * @returns {string[]} 자식 디렉터리의 절대 경로 목록. 정렬해 돌려준다.
 */
export const workspaceChildDirectories = (
  repoRoot,
  globs = WORKSPACE_PACKAGE_GLOBS,
) => {
  const directories = [];
  for (const glob of globs) {
    const root = singleSegmentGlobPattern.exec(glob)?.[1];
    if (root === undefined) {
      throw new Error(
        `workspaceChildDirectories: <이름>/* 형태가 아닌 glob이다: ${JSON.stringify(glob)}`,
      );
    }
    const rootPath = resolve(repoRoot, root);
    if (!existsSync(rootPath)) continue;
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      const directory = resolve(rootPath, entry.name);
      const isDirectoryLikeChild =
        entry.isDirectory() ||
        (entry.isSymbolicLink() &&
          statSync(directory, { throwIfNoEntry: false })?.isDirectory() ===
            true);
      if (isDirectoryLikeChild) {
        directories.push(directory);
      }
    }
  }
  return directories.sort();
};

/**
 * 각 workspace glob이 가리키는 디렉터리 바로 아래에서 `package.json`을 가진
 * 자식 디렉터리를 모은다. `workspaceChildDirectories()`가 낸 자식 디렉터리
 * 전량에 `package.json` 필터를 얹은 것이다 — 자식 열거 술어(심링크 추종
 * 포함)는 그 함수가 단독 소유하고 여기서 되풀이하지 않는다. glob 형태 검증과
 * 루트 없음 건너뛰기도 그 함수의 것을 그대로 물려받는다.
 *
 * 반환값은 패키지 매니페스트 경로가 아니라 **디렉터리** 경로다. 소비처마다
 * 매니페스트를 저장소 상대 경로로 바꾸거나 루트 매니페스트를 함께 세는 등
 * 뒤처리가 달라, 공통분모는 열거까지다.
 *
 * @param {string} repoRoot 저장소 루트 경로. 상대 경로면 cwd 기준으로 해석된다.
 * @param {readonly string[]} [globs] workspace 패키지 glob 목록. 기본값은
 *   `WORKSPACE_PACKAGE_GLOBS`.
 * @returns {string[]} 패키지 디렉터리의 절대 경로 목록. 정렬해 돌려준다.
 */
export const workspacePackageDirectories = (
  repoRoot,
  globs = WORKSPACE_PACKAGE_GLOBS,
) =>
  workspaceChildDirectories(repoRoot, globs).filter((directory) =>
    existsSync(resolve(directory, "package.json")),
  );
