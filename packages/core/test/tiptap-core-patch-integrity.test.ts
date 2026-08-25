/**
 * patches/@tiptap__core@3.30.1.patch가 그 패키지의 모든 export 조건 대상에
 * 적용된 상태임을 시간이 아니라 파일 내용으로 고정한다(Issue #120, D12).
 *
 * @tiptap/core의 "." export는 import(dist/index.js)와 require(dist/index.cjs)
 * 두 사본을 가리킨다. 둘 다 dispatchTransaction 안에서 Array.prototype.findLast
 * (ES2023, Chrome97+)를 호출했는데, 공식 browser floor Chrome75(ADR-0008)엔
 * 없는 API라 slice().reverse().find()로 치환했다. vitest가 import 조건만 타는
 * 환경이면 require 사본이 패치되지 않은 채로 남아도 이 저장소의 기존 어떤
 * 테스트에도 잡히지 않는다 — CJS로 소비하는 빌드 소비자만 깨진다.
 *
 * 패치 파일이 바뀌거나 사라지는 경우, 그리고 패키지 버전이 올라 패치 키가
 * 뜨는 경우는 pnpm이 install에서 막는다(락파일의 patch_hash,
 * ERR_PNPM_PATCH_FAILED, ERR_PNPM_UNUSED_PATCH). 이 파일이 막는 것은 그
 * 검사들을 모두 통과하면서 조건별 사본 일부에만 적용된 "반쪽 패치"다
 * (G-TST-004, ADR-0006 §3 — micromark-extension-gfm-table 패치와 같은 이유).
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const patchedPackageName = "@tiptap/core";

/**
 * `packages/core`의 직접 의존이라 한 단계 resolve로 package.json을 찾는다.
 * `createRequire`에 URL 객체를 그대로 넘기면 이 패키지의 jsdom test
 * environment 경계를 넘으며 `http://localhost:3000/...`로 뒤바뀐다(실측 —
 * `import.meta.url` 자체는 정상 `file://`인데도 그렇다) — 문자열 경로로
 * 변환해 넘겨 이 문제를 피한다.
 *
 * `@tiptap/core`의 `exports`는 `./package.json` 서브패스를 노출하지 않아
 * 직접 resolve할 수 없다 — 대신 노출된 진입점(`.`)을 resolve한 뒤 상위로
 * 올라가며 `package.json`을 찾는다(micromark 패치 테스트와 동일 패턴).
 */
function resolvePatchedPackageRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const resolveFrom = createRequire(currentFile);
  const resolved = resolveFrom.resolve(patchedPackageName);
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
 * "." export의 import/require 대상을 [조건 이름, 절대 경로] 쌍으로 만든다.
 * 두 조건이 서로 다른 파일을 가리키는지 자체도 아래 it이 함께 확인한다 —
 * 업스트림이 사본을 하나로 합치면 이 목록이 1개로 줄어야 한다.
 */
function resolveRuntimeCopies(packageRoot: string): Array<[string, string]> {
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  ) as {
    exports?: { "."?: { import?: string; require?: string } };
  };
  const dotExport = manifest.exports?.["."] ?? {};
  const copies = new Map<string, string>();
  for (const [condition, target] of Object.entries(dotExport)) {
    if (typeof target !== "string") continue;
    copies.set(condition, join(packageRoot, target));
  }
  return [...copies.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

describe("@tiptap/core findLast 패치 무결성", () => {
  const packageRoot = resolvePatchedPackageRoot();
  const runtimeCopies = resolveRuntimeCopies(packageRoot);

  it('"." export가 import/require 두 사본을 가리킨다', () => {
    // 사본이 하나로 접히면 아래 it.each가 조용히 반쪽만 검사하게 된다.
    expect(runtimeCopies.length).toBeGreaterThanOrEqual(2);
    for (const [, copyPath] of runtimeCopies) {
      expect(existsSync(copyPath)).toBe(true);
    }
  });

  it.each(
    runtimeCopies,
  )("%s 조건의 dispatchTransaction이 findLast 대신 slice().reverse().find()를 쓴다", (_condition, copyPath) => {
    const source = readFileSync(copyPath, "utf8");

    // 호출부만 확인한다 — 패치 자체의 설명 주석에도 "findLast" 문자열이
    // 등장하므로 단순 포함 여부로는 오탐한다.
    expect(source).not.toContain(".findLast(");
    expect(source).toContain(
      'transactions.slice().reverse().find((tr) => tr.getMeta("focus") || tr.getMeta("blur"))',
    );
  });
});
