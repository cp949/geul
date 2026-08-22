/**
 * 검사 범위를 정하는 스크립트들이 공유하는 workspace 루트 목록과, 그 루트 아래의
 * 패키지 디렉터리 열거를 단독 소유한다.
 *
 * `WORKSPACE_ROOTS`는 `pnpm-workspace.yaml`의 `packages:` 목록과 같아야 한다.
 * 여기가 어긋나면 새 workspace 루트 아래의 패키지가 검사 대상에서 통째로 빠져,
 * 소비처의 검사 범위가 조용히 트리보다 좁아진다. 감시 범위가 조용히 좁아진
 * 감시 장치는 없는 것과 같다.
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
 * 어긋나지 않는지를 계약 테스트가 대조한다(`tests/workspace-roots.test.ts`).
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
 * 소비 성격은 둘이다.
 *
 * - `workspacePackageDirectories()`로 패키지 디렉터리를 받아 그 하나하나에 검사를
 *   돌리는 쪽. 루트가 빠지면 그 아래 패키지 전부가 검사에서 사라진다.
 * - `WORKSPACE_ROOTS`를 직접 받아 루트 이름으로 소속을 판정하거나 루트 아래를
 *   훑는 쪽.
 *
 * 소비 **파일**은 여기에 열거하지 않는다. 손으로 적은 목록이 트리와 갈리는 것이
 * 이 모듈이 없애려는 결함 자체이고, 열거해 봐야 이미 트리에서 직접 발견해 지는
 * 두 축을 되뇌면서 갈릴 수만 있다 — `scripts/`의 `.mjs`가 빠짐없이 이 모듈에서
 * 목록을 import하는지, 그리고 추적 소스 전체에서 루트 목록 배열 리터럴을 가진
 * 파일이 이 파일 하나뿐인지. 둘 다 `tests/workspace-roots.test.ts`가 진다.
 *
 * 그 계약 테스트를 이름으로 가리키는 것은 `PIT-0022`의 예외 2다 — 공용 모듈이
 * 자기 전제를 지는 쪽을 가리키는 방향이다. 줄 번호는 인용하지 않는다 — 인용
 * 대상이 움직여도 아무것도 실패하지 않는다.
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * workspace 루트 디렉터리 이름. 알파벳순으로 둔다 — 읽는 사람을 위한 정규화이고
 * 순서 자체는 계약이 아니다. 계약 테스트가 양쪽을 `.sort()`해 대조하고, 소비처도
 * 이 순서를 읽지 않는다(실측) — 루트 아래를 훑어 목록을 만드는 쪽은 결과를
 * 정렬해 돌려주고, 그 밖의 자리는 소속 판정(`includes()`)이나 개수 세기처럼
 * 순서가 결과에 닿지 않는 형태다.
 *
 * `readonly`는 **타입 층위**의 제약이다(실측). `tsc -p scripts/tsconfig.json`이
 * `push`·`sort`를 `TS2339`로, 인덱스 쓰기를 `TS2542`로 막는다. 런타임은 막지
 * 않는다 — `Object.freeze`가 아니라 `WORKSPACE_ROOTS.push("zzz")`가 그대로
 * 통한다.
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
