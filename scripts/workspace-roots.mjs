/**
 * 게이트들이 공유하는 workspace 루트 목록과, 그 루트 아래의 패키지 디렉터리
 * 열거를 단독 소유한다.
 *
 * `WORKSPACE_ROOTS`는 `pnpm-workspace.yaml`의 `packages:` 목록과 같아야 한다.
 * 여기가 어긋나면 새 workspace 루트 아래의 패키지가 검사 대상에서 통째로 빠져,
 * 각 게이트의 대상 목록이 조용히 트리보다 좁아진다. 게이트는 그대로 통과하고
 * 아무것도 보지 않는다. 감시 장치의 감시 범위가 조용히 좁아지면 감시 장치가
 * 없는 것과 같다.
 *
 * 그래서 이 목록이 `pnpm-workspace.yaml`과 어긋나지 않는지를 계약 테스트가
 * 대조한다(`tests/workspace-roots.test.ts`).
 *
 * ## 왜 `pnpm-workspace.yaml`을 파싱하지 않는가
 *
 * 구현이 매니페스트를 파싱하면 계약 테스트가 파서를 자기 자신과 대조하는
 * 동어반복이 되어 drift 감시가 사라진다(`PIT-0022`: 단언이 구현을 되뇌면 그
 * 계약은 고정되지 않는다). 리터럴 목록과 테스트 쪽 독립 파서는 의도된
 * 이중화다 — 두 출발점이 갈리는 순간이 곧 실패다.
 *
 * ## 소비자
 *
 * - `scripts/check-package-boundaries.mjs` — 패키지 간 의존성 경계 검사
 * - `scripts/check-licenses.mjs` — production 의존성 라이선스 검사
 * - `scripts/find-duplicate-test-helpers.mjs` — 대상 목록 밖 테스트 디렉터리 보고
 * - `tests/workspace-roots.test.ts` — 이 모듈의 계약 테스트
 *
 * 공용 모듈이 소비자를 가리키는 방향이라 `PIT-0022`의 예외 2에 해당한다. 다만
 * 줄 번호는 인용하지 않는다 — 인용 대상이 움직여도 아무것도 실패하지 않는다.
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * workspace 루트 디렉터리 이름. 알파벳순으로 둔다 — 계약 테스트가 양쪽을
 * `.sort()`해 대조하고 소비처도 전부 순서에 무관하므로, 순서는 계약이 아니라
 * 읽는 사람을 위한 정규화다. `readonly`는 상수의 변형을 막는다.
 *
 * @type {readonly string[]}
 */
export const WORKSPACE_ROOTS = ["apps", "fixtures", "packages"];

/**
 * 각 workspace 루트 바로 아래에서 `package.json`을 가진 자식 디렉터리를 모은다.
 *
 * 루트 디렉터리가 없으면 건너뛴다 — `pnpm-workspace.yaml`이 선언한 루트라도
 * 트리에 아직 없을 수 있고, 그때 `readdirSync`가 ENOENT로 죽으면 게이트가
 * 검사 실패가 아니라 크래시로 끝난다.
 *
 * 반환값은 패키지 매니페스트 경로가 아니라 **디렉터리** 경로다. 소비처마다
 * 매니페스트를 저장소 상대 경로로 바꾸거나 루트 매니페스트를 함께 세는 등
 * 뒤처리가 달라, 공통분모는 열거까지다.
 *
 * @param {string} repoRoot 저장소 루트 경로. 상대 경로면 cwd 기준으로 해석된다.
 * @returns {string[]} 패키지 디렉터리의 절대 경로 목록. 정렬해 돌려준다.
 */
export const workspacePackageDirectories = (repoRoot) => {
  const directories = [];
  for (const root of WORKSPACE_ROOTS) {
    const rootPath = resolve(repoRoot, root);
    if (!existsSync(rootPath)) continue;
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      const directory = resolve(rootPath, entry.name);
      if (
        entry.isDirectory() &&
        existsSync(resolve(directory, "package.json"))
      ) {
        directories.push(directory);
      }
    }
  }
  return directories.sort();
};
