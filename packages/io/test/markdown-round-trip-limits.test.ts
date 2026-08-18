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

  // 10,000셀 표 파싱 자체가 remark-gfm(micromark-extension-gfm-table)의
  // EditMap.addImplementation 선형 스캔 때문에 셀 수에 대해 초선형으로
  // 느려진다(단독 실행에서도 100x100 표 하나당 파싱만 ~2.4~2.7s, 두 표
  // 합산 ~4.9~5.5s로 기본 5000ms 타임아웃 경계에 걸쳐 있고, `pnpm test`
  // 병렬 실행에서는 7.0~7.9s까지 늘어난다 — 2026-08-19 로컬 3회 반복 측정).
  // 병목이 우리 코드(import-markdown.ts)가 아니라 서드파티 파서 내부에
  // 있어 이 테스트 범위에서 최적화할 수 없다 — MAX_TABLE_LOGICAL_CELLS로
  // 이미 상한이 고정돼 있으므로 실측 최악값에 안전 여유를 더한 타임아웃을
  // 명시한다(Issue #12).
  const oversizedTableTimeoutMs = 20_000;

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
