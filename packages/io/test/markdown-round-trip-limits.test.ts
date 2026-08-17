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

  it("논리 셀 10000개까지 허용하고 그보다 큰 표는 일찍 거부한다", () => {
    const tableSource = (rowCount: number, columnCount: number): string => {
      const row = `| ${Array.from({ length: columnCount }, () => "x").join(" | ")} |`;
      const delimiter = `| ${Array.from({ length: columnCount }, () => "-").join(" | ")} |`;
      return [
        row,
        delimiter,
        ...Array.from({ length: rowCount - 1 }, () => row),
      ].join("\n");
    };

    expect(importMarkdown(tableSource(100, 100))).toMatchObject({ ok: true });

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
  });
});
