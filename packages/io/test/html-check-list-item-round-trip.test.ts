/**
 * 체크 목록의 checked 상태가 own HTML export→import round-trip에서
 * 보존되는지 검증한다(RD-002 완료 조건 1번).
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";

describe("체크 목록 HTML round-trip", () => {
  it("checked true/false 항목과 children을 무손실 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "c-1",
          type: "checkListItem",
          checked: true,
          content: [{ text: "완료" }],
          children: [
            { id: "p-1", type: "paragraph", content: [{ text: "자식" }] },
          ],
        },
        {
          id: "c-2",
          type: "checkListItem",
          checked: false,
          content: [{ text: "미완료" }],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const imported = importHtml(exported.value);
    expect(imported).toMatchObject({ ok: true, value: { document } });
    if (!imported.ok) return;
    expect(imported.value.warnings).toEqual([]);
  });
});
