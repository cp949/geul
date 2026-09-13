/**
 * 토글 목록의 exportHtml 산출 형상을 고정한다(로드맵 D4,
 * RD-005-DELTA-01.md "착수 전 결정"). `<details data-geul-toggleable="true"
 * open? data-geul-collapsed?>` + `<summary>` + 선택적 `<div data-geul-children>`.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml } from "../src/index.js";

const exportOk = (document: Document): string => {
  const result = exportHtml(document);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

describe("토글 목록 exportHtml 형상", () => {
  it("<li>가 아니라 독립 <details>로 나온다", () => {
    const html = exportOk({
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "t-1", type: "toggleListItem", content: [{ text: "항목" }] },
      ],
    });
    expect(html).toBe(
      '<details data-geul-block-id="t-1" data-geul-toggleable="true" open><summary data-geul-block-id="t-1">항목</summary></details>',
    );
  });

  it("children이 있으면 <summary> 다음에 data-geul-children 컨테이너가 온다", () => {
    const html = exportOk({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "t-1",
          type: "toggleListItem",
          content: [{ text: "부모" }],
          collapsed: true,
          children: [
            { id: "p-1", type: "paragraph", content: [{ text: "자식" }] },
          ],
        },
      ],
    });
    expect(html).toBe(
      '<details data-geul-block-id="t-1" data-geul-toggleable="true" data-geul-collapsed="true"><summary data-geul-block-id="t-1">부모</summary><div data-geul-children="1"><p data-geul-block-id="p-1">자식</p></div></details>',
    );
  });
});
