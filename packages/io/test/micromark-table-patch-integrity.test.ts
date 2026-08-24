/**
 * patches/micromark-extension-gfm-table@2.1.1.patch가 그 패키지의 모든 export
 * 조건 대상에 적용된 상태임을 시간이 아니라 파일 내용으로 고정한다(Issue #26).
 *
 * 이 패키지의 exports는 development와 default 두 조건으로 갈리고 조건마다 서로
 * 다른 edit-map.js 사본을 로드한다(dev/lib/edit-map.js, lib/edit-map.js). vitest는
 * vite의 조건 해석을 따라 development만 타므로 default 사본을 빠뜨린 패치는 기존
 * 어떤 테스트에도 잡히지 않는다 — 빌드된 소비자만 느려진다. 2026-08-21 실측으로
 * 양방향을 확인했다: dev/lib만 미패치로 되돌리면 markdown-round-trip-limits의
 * 대형 표 케이스가 603ms -> 4,211ms로 느려지지만, lib만 되돌리면 612ms로 패치된
 * 상태와 구분되지 않는다.
 *
 * 그 4,211ms조차 markdown-round-trip-limits의 5,000ms 상한을 단독 실행에서
 * 통과한다 — 시간 상한은 패치 유실의 게이트가 될 수 없다(G-TST-004). 패치가
 * 적용됐는지 여부는 기계 성능과 동시 실행 부하에 전혀 의존하지 않는 이 파일의
 * 단언이 진다.
 *
 * 패치 파일이 바뀌거나 사라지는 경우, 그리고 패키지 버전이 올라 패치 키가 뜨는
 * 경우는 pnpm이 install에서 막는다(락파일의 patch_hash, ERR_PNPM_PATCH_FAILED,
 * ERR_PNPM_UNUSED_PATCH). 이 파일이 막는 것은 그 검사들을 모두 통과하면서 조건별
 * 사본 일부에만 적용된 "반쪽 패치"다.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const patchedPackageName = "micromark-extension-gfm-table";

/**
 * pnpm의 격리된 node_modules에서 micromark-extension-gfm-table은 io의 직접
 * 의존이 아니라 remark-gfm -> micromark-extension-gfm을 거쳐야 보인다. 각 단계의
 * 해석 기준을 이전 단계의 실제 파일로 옮기며 따라간다.
 */
function resolvePatchedPackageRoot(): string {
  let resolveFrom = createRequire(new URL("../package.json", import.meta.url));
  let resolved = "";
  for (const name of [
    "remark-gfm",
    "micromark-extension-gfm",
    patchedPackageName,
  ]) {
    resolved = resolveFrom.resolve(name);
    resolveFrom = createRequire(resolved);
  }

  let candidate = dirname(resolved);
  while (!existsSync(join(candidate, "package.json"))) {
    const parent = dirname(candidate);
    if (parent === candidate) {
      throw new Error(`${patchedPackageName}의 package.json을 찾지 못했다`);
    }
    candidate = parent;
  }
  return candidate;
}

/**
 * exports의 조건 대상마다 그 대상이 로드하는 edit-map.js를 [패키지 기준 상대
 * 경로, 절대 경로] 쌍으로 만든다. 조건 목록을 하드코딩하지 않으므로 업스트림이
 * 조건을 추가해도 함께 검사한다. 테스트 제목에는 상대 경로만 쓴다 — 절대 경로에는
 * pnpm이 계산한 patch_hash가 들어 있어 패치를 재생성할 때마다 제목이 바뀐다.
 */
function resolveEditMapCopies(packageRoot: string): Array<[string, string]> {
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  ) as { exports?: Record<string, string> };
  const exportTargets = Object.values(manifest.exports ?? {});
  const copies = new Map<string, string>();
  for (const target of exportTargets) {
    const relativePath = join(dirname(target), "lib", "edit-map.js");
    copies.set(relativePath, join(packageRoot, relativePath));
  }
  return [...copies.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

describe("micromark-extension-gfm-table 패치 무결성", () => {
  const packageRoot = resolvePatchedPackageRoot();
  const editMapCopies = resolveEditMapCopies(packageRoot);

  it("exports 조건이 서로 다른 edit-map 사본을 두 개 이상 가리킨다", () => {
    // 사본이 하나로 접히면 아래 it.each가 조용히 반쪽만 검사하게 된다.
    expect(editMapCopies.length).toBeGreaterThanOrEqual(2);
    for (const [, editMapPath] of editMapCopies) {
      expect(existsSync(editMapPath)).toBe(true);
    }
  });

  it.each(
    editMapCopies,
  )("%s의 EditMap이 선형 스캔 대신 indexByAt O(1) 조회를 쓴다", (_relativePath, editMapPath) => {
    const source = readFileSync(editMapPath, "utf8");

    expect(source).toContain("this.indexByAt = new Map()");
    expect(source).toContain("editMap.indexByAt.get(at)");
    expect(source).toContain("editMap.indexByAt.set(at, editMap.map.length)");
    // consume()이 this.map을 비울 때 보조 Map도 같이 비워야 stale index가
    // 다음 표로 새지 않는다.
    expect(source).toContain("this.indexByAt.clear()");
    expect(source).not.toMatch(
      /while\s*\(\s*index\s*<\s*editMap\.map\.length\s*\)/,
    );
  });
});
