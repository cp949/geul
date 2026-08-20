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
  // 사라졌다 — 패치 전후 실측치는 Issue #26 코멘트에 기록했다.
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
