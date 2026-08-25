/**
 * demo의 폴리필 계약을 진다(ADR-0009, cp949/geul#122 리뷰 발견 4).
 *
 * `apps/demo`는 "Chrome 75를 지원하는 사용처"의 재현이고, 그 계약의 핵심은
 * `import "core-js/stable"`이 엔트리의 **첫 static import**라는 것이다 —
 * 다른 모듈(디펜던시 포함)이 평가되기 전에 폴리필이 설치돼야 한다.
 *
 * 이 계약의 실검증은 `pnpm test:e2e:chrome83`(docker 수동 실행)인데 그
 * 경로는 `pnpm verify`에 없다. import를 지우거나 뒤로 옮기는 회귀가 verify
 * 전체 GREEN인 채 통과하는 구멍을 이 테스트가 막는다 — 소스 텍스트
 * 계약이라 실행 없이 지고, 실제 동작 증거는 chrome83 e2e가 소유한다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const mainEntryPath = fileURLToPath(
  new URL("../apps/demo/src/main.tsx", import.meta.url),
);

describe("demo 엔트리의 폴리필 로드 계약", () => {
  it("main.tsx의 첫 static import는 core-js/stable이다", () => {
    const source = readFileSync(mainEntryPath, "utf8");
    // 주석(triple-slash 지시자 포함)을 걷어낸 뒤 첫 import 구문의 module
    // specifier를 찾는다.
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const firstImport = withoutComments.match(
      /\bimport\b[^"']*["']([^"']+)["']/,
    );

    expect(firstImport).not.toBeNull();
    expect(firstImport?.[1]).toBe("core-js/stable");
  });
});
