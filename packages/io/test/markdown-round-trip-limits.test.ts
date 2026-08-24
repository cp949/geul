import { describe, expect, it } from "vitest";

import { importMarkdown } from "../src/index.js";

describe("Markdown 가져오기 경계와 한도", () => {
  it("가져오기 경계에서 생성된 id를 검증한다", () => {
    expect(
      importMarkdown("Paragraph\n\nAnother", { createId: () => "duplicate" }),
    ).toMatchObject({
      ok: false,
      error: { code: "MARKDOWN_DOCUMENT_INVALID" },
    });
  });

  // 10,000셀 표 파싱은 remark-gfm(micromark-extension-gfm-table)의
  // EditMap.addImplementation이 map.add() 호출마다 선형 스캔하던 것이
  // 병목이었다(Issue #12). Issue #26에서 pnpm patch로 EditMap이
  // `at -> index` Map을 통해 O(1) 조회를 하도록 고쳐 초선형 비용이
  // 사라졌다(10,000셀 파싱 2,117ms -> 248ms. 전 구간 실측표는
  // Issue #26과 git log -- docs/pitfalls/PIT-0018-*.md가 보존한다).
  //
  // 이 상한의 역할은 "심각한 성능 붕괴" 검출 하나로 한정한다(G-TST-004).
  // 패치 유실은 여기서 잡히지 않는다 — dev/lib/edit-map.js만 미패치로
  // 되돌린 상태(= Issue #26 이전)도 단독 실행 4,211ms로 이 상한을
  // 통과했다. 패치 적용 여부는 시간에 의존하지 않는
  // micromark-table-patch-integrity.test.ts가 결정적으로 진다.
  //
  // 실측 근거(2026-08-21, 12코어): 패치 후 이 케이스는 단독 603ms,
  // 2코어로 묶은 `pnpm test` 병렬에서 최악 702ms. 5,000ms는 그 병렬
  // 최악값의 약 7배다. 이 값은 환경별 실측 근거이며 공통 배수 규칙이 아니다.
  const oversizedTableTimeoutMs = 5_000;

  it(
    "논리 셀 10000개까지 허용하고 그보다 큰 표는 일찍 거부한다",
    () => {
      const tableSource = (rowCount: number, columnCount: number): string => {
        const row = `| ${Array.from({ length: columnCount }, () => "x").join(" | ")} |`;
        const delimiter = `| ${Array.from({ length: columnCount }, () => "-").join(" | ")} |`;
        return [
          row,
          delimiter,
          ...Array.from({ length: rowCount - 1 }, () => row),
        ].join("\n");
      };

      expect(importMarkdown(tableSource(100, 100))).toMatchObject({
        ok: true,
      });

      let idCalls = 0;
      expect(
        importMarkdown(tableSource(101, 100), {
          createId: () => {
            idCalls += 1;
            return `oversized-${idCalls}`;
          },
        }),
      ).toMatchObject({
        ok: false,
        error: { code: "MARKDOWN_DOCUMENT_INVALID" },
      });
      expect(idCalls).toBeLessThan(20);
    },
    oversizedTableTimeoutMs,
  );
});
