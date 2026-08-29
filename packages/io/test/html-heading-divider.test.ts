/**
 * HTML export/import의 h4~h6·hr 매핑(DELTA-06, spec §7.1)을 검증한다.
 * heading level 4~6은 <h4>~<h6>로, divider는 <hr data-be-block-id>로
 * 왕복하고, 예전에 sanitize가 두 태그를 unwrap해 내던 거짓
 * SAFE_BLOCK_DOWNGRADED 경고는 더 이상 나지 않는다. 표 셀 안의 <hr>·<h4>가
 * 블록이 아니라 셀 인라인 텍스트로 남는 기존 경계는 회귀로 고정한다.
 * blockquote 매핑은 범위 밖이다(DELTA-06a).
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";
import {
  buildDocument,
  dividerBlock,
  headingBlock,
  paragraphBlock,
} from "./fixtures/quote-divider-document.js";

/**
 * importHtml이 성공했다고 단언하고 문서와 경고를 돌려준다. 실패하면 그
 * 오류 메시지로 즉시 실패시켜 뒤따르는 단언의 원인을 가리지 않는다.
 */
const importOk = (html: string) => {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

/**
 * exportHtml이 정확히 expectedHtml을 내고, 그 HTML을 다시 importHtml하면
 * 경고 없이 원래 blocks(id 포함)가 그대로 복원되는지 단언한다 — export
 * 형상과 re-import 결과를 한 번에 고정하는 왕복 단언이다.
 */
const expectRoundTrip = (document: Document, expectedHtml: string): void => {
  const exported = exportHtml(document);
  expect(exported.ok).toBe(true);
  if (!exported.ok) throw new Error(exported.error.message);
  expect(exported.value).toBe(expectedHtml);
  const imported = importOk(exported.value);
  expect(imported.document.blocks).toEqual(document.blocks);
  expect(imported.warnings).toEqual([]);
};

describe("h4-h6 HTML 왕복", () => {
  it("level 4·5·6 heading 문서가 exportHtml→importHtml 왕복에서 level·id를 보존한다", () => {
    expectRoundTrip(
      buildDocument([
        headingBlock("heading-4", 4, "넷"),
        headingBlock("heading-5", 5, "다섯"),
        headingBlock("heading-6", 6, "여섯"),
      ]),
      '<h4 data-be-block-id="heading-4">넷</h4><h5 data-be-block-id="heading-5">다섯</h5><h6 data-be-block-id="heading-6">여섯</h6>',
    );
  });

  it("<h4>~<h6> import가 SAFE_BLOCK_DOWNGRADED 없이 heading 4-6을 만든다", () => {
    const { document, warnings } = importOk("<h4>a</h4><h5>b</h5><h6>c</h6>");

    expect(document.blocks).toEqual([
      { id: "html-1", type: "heading", level: 4, content: [{ text: "a" }] },
      { id: "html-2", type: "heading", level: 5, content: [{ text: "b" }] },
      { id: "html-3", type: "heading", level: 6, content: [{ text: "c" }] },
    ]);
    expect(warnings).toEqual([]);
  });

  it("div에 중첩된 h4도 heading 4로 들어오고 경고가 없다", () => {
    const { document, warnings } = importOk(
      "<div><h4><strong>굵게</strong> 제목</h4></div>",
    );

    expect(document.blocks).toEqual([
      {
        id: "html-1",
        type: "heading",
        level: 4,
        content: [
          { text: "굵게", marks: [{ type: "bold" }] },
          { text: " 제목" },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("children wrapper의 자기 콘텐츠 h5와 children 안 h6이 함께 왕복한다", () => {
    expectRoundTrip(
      buildDocument([
        headingBlock("heading-5", 5, "부모", [
          headingBlock("heading-6", 6, "자식"),
          paragraphBlock("paragraph-1", "문단"),
        ]),
      ]),
      '<div data-be-block-id="heading-5"><h5 data-be-block-id="heading-5">부모</h5><div data-be-children="1"><h6 data-be-block-id="heading-6">자식</h6><p data-be-block-id="paragraph-1">문단</p></div></div>',
    );
  });
});

describe("hr ↔ divider", () => {
  it("divider가 <hr data-be-block-id>로 export되고 re-import에서 id·위치를 보존한다", () => {
    expectRoundTrip(
      buildDocument([
        paragraphBlock("paragraph-1", "앞"),
        dividerBlock("divider-1"),
        paragraphBlock("paragraph-2", "뒤"),
      ]),
      '<p data-be-block-id="paragraph-1">앞</p><hr data-be-block-id="divider-1"><p data-be-block-id="paragraph-2">뒤</p>',
    );
  });

  it("<hr> import가 SAFE_BLOCK_DOWNGRADED 없이 divider를 만든다(id 없으면 새 id)", () => {
    const { document, warnings } = importOk("<p>a</p><hr><p>b</p>");

    expect(document.blocks).toEqual([
      { id: "html-1", type: "paragraph", content: [{ text: "a" }] },
      { id: "html-2", type: "divider" },
      { id: "html-3", type: "paragraph", content: [{ text: "b" }] },
    ]);
    expect(warnings).toEqual([]);
  });

  it("문서 첫 블록·마지막 블록이 hr여도 세그먼트가 사라지지 않는다", () => {
    const { document, warnings } = importOk("<hr><p>a</p><hr>");

    expect(document.blocks).toEqual([
      { id: "html-1", type: "divider" },
      { id: "html-2", type: "paragraph", content: [{ text: "a" }] },
      { id: "html-3", type: "divider" },
    ]);
    expect(warnings).toEqual([]);
    // hr 하나뿐인 문서와 div 안에만 있는 hr도 pending 없이 세그먼트가 된다.
    const dividerOnly = [{ id: "html-1", type: "divider" }];
    expect(importOk("<hr>").document.blocks).toEqual(dividerOnly);
    expect(importOk("<div><hr></div>").document.blocks).toEqual(dividerOnly);
  });

  it("children wrapper 안 hr이 자식 divider로 왕복한다", () => {
    expectRoundTrip(
      buildDocument([
        paragraphBlock("paragraph-1", "부모", [
          dividerBlock("divider-child"),
          paragraphBlock("paragraph-2", "자식"),
        ]),
      ]),
      '<div data-be-block-id="paragraph-1"><p data-be-block-id="paragraph-1">부모</p><div data-be-children="1"><hr data-be-block-id="divider-child"><p data-be-block-id="paragraph-2">자식</p></div></div>',
    );
  });
});

describe("경계 유지(회귀)", () => {
  // 표 셀은 parseTable이 inlineContentFromNodes로만 읽는다 — segmentBlocks가
  // 표 노드 안으로 내려가지 않으므로 hr 세그먼트가 셀 안에서 블록을 만들
  // 경로가 없다. hr은 텍스트를 내지 않고 h4는 인라인 텍스트로 풀린다.
  it("표 셀 안 <hr>과 <h4>는 블록을 만들지 않고 셀 인라인 텍스트로 남는다", () => {
    const { document, warnings } = importOk(
      "<table><tr><td>a<hr>b<h4>c</h4></td></tr></table>",
    );

    expect(document.blocks.map((block) => block.type)).toEqual(["table"]);
    const [table] = document.blocks;
    if (table?.type !== "table") throw new Error("표 블록이 아니다");
    expect(
      table.rows.map((row) => row.cells.map((cell) => cell.content)),
    ).toEqual([[[{ text: "abc" }]]]);
    expect(warnings).toEqual([]);
  });
});
