/**
 * 중첩 블록의 HTML 왕복 변환 계약을 검증한다.
 */
import {
  isKnownBlockType,
  type Block,
  type Document,
  type InlineContentItem,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../../src/index.js";

describe("재귀 중첩 HTML 왕복", () => {
  // 후보 A(트랙-2 라운드4 확정): children이 있는 블록만
  // <div data-geul-block-id>로 감싸고, 그 안에 (1) 기존 <p>/<hN>(children
  // 없이 blockId 그대로)과 (2) children을 담는 두 번째
  // <div data-geul-children="1">를 순서대로 둔다. <p>가 HTML5상 <div>를
  // 자식으로 가질 수 없어 이 wrapper가 필요하다(export-html.ts의 blockNode
  // 주석 참고). exportHtml이 내는 정확한 문자열을 pin해 이 계약을
  // 고정한다 — 변이: wrapper 인식(import-html.ts의 findChildrenWrapper)을
  // 빼면 기존 segmentBlocks만 남아 이 div들을 NESTED_BOUNDARY_TAG_NAMES로
  // 평면 처리해 children이 사라지고 두 문단이 형제로 뒤섞인다.
  it("1단 중첩(문단 아래 문단)이 id·content·children까지 구조 그대로 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent-1",
          type: "paragraph",
          content: [{ text: "parent" }],
          children: [
            { id: "child-1", type: "paragraph", content: [{ text: "child" }] },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toBe(
      '<div data-geul-block-id="parent-1"><p data-geul-block-id="parent-1">parent</p><div data-geul-children="1"><p data-geul-block-id="child-1">child</p></div></div>',
    );

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  it("3단 깊이(문단→문단→문단) 중첩도 구조 그대로 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "level-1",
          type: "paragraph",
          content: [{ text: "l1" }],
          children: [
            {
              id: "level-2",
              type: "paragraph",
              content: [{ text: "l2" }],
              children: [
                { id: "level-3", type: "paragraph", content: [{ text: "l3" }] },
              ],
            },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  it("heading의 children도 문단처럼 구조 그대로 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "heading-1",
          type: "heading",
          level: 2,
          content: [{ text: "제목" }],
          children: [
            { id: "body-1", type: "paragraph", content: [{ text: "본문" }] },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toBe(
      '<div data-geul-block-id="heading-1"><h2 data-geul-block-id="heading-1">제목</h2><div data-geul-children="1"><p data-geul-block-id="body-1">본문</p></div></div>',
    );

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  // 완료 조건 6: blockNode가 children 자리에서도 table 분기(tableNode)를
  // 재사용한다 — 변이: 재귀 렌더링이 자식 노드 타입을 무시하고 항상
  // <p>/<hN>으로만 처리하면 이 표가 깨지거나 예외가 난다.
  it("children으로 포함된 표도 구조 그대로 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent-1",
          type: "paragraph",
          content: [{ text: "parent" }],
          children: [
            {
              id: "table-1",
              type: "table",
              columns: [{ id: "column-1", width: 100 }],
              rows: [
                {
                  id: "row-1",
                  cells: [
                    {
                      id: "cell-1",
                      columnId: "column-1",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "cell" }],
                    },
                  ],
                },
              ],
              headerRows: 0,
              headerColumns: 0,
            },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  // 완료 조건 5(회귀): children이 없는 블록은 지금처럼 <p>/<hN>을 그대로
  // 낸다 — wrapper를 씌우지 않는다(diff 최소). "HTML 왕복 변환" describe의
  // 기존 테스트 전량이 수정 없이 그대로 통과하는 것 자체가 이 조건의
  // 회귀 증거이므로 여기서 별도로 반복하지 않는다.

  // DELTA-04 즉시 리뷰 발견(G-CNV-002 위반, 즉시 정정): findChildrenWrapper가
  // 두 element 자식(p, dataGeulChildren div)만 개수로 확인하고 그 사이·앞뒤에
  // 낀 실질 텍스트는 반환값에 담지 않아 조용히 사라졌다 — 변이: 아래
  // hasStrayText 가드를 지우면 "STRAY"가 blocks·warnings 어디에도 없이
  // 유실돼 이 테스트가 실패해야 한다(그 대신 두 element만으로 여전히
  // wrapper를 인식해버려 children은 정상 복원되므로 그 부분은 우연히
  // 통과한다 — 텍스트 손실만 놓친다).
  it("children wrapper 안에 낀 실질 텍스트는 wrapper 인식을 취소하고 평면 처리로 보존한다", () => {
    const html =
      '<div data-geul-block-id="parent-1">STRAY<p data-geul-block-id="parent-1">parent</p><div data-geul-children="1"><p data-geul-block-id="child-1">child</p></div></div>';

    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const texts = result.value.document.blocks.flatMap((block) => {
      // isKnownBlockType은 block.type만 좁히고 block 자체는 좁히지 못한다
      // (discriminated union 잔여분기) — CustomBlock도 동명의 content:
      // "none"|"inline" 필드를 가져 "content" in block만으로는 구분되지
      // 않으므로 명시적으로 캐스트한다.
      if (!isKnownBlockType(block.type)) return [];
      const known = block as Block;
      // 계약 전제 캐스트 — 이 테스트의 fixture는 텍스트 런만 만든다.
      return "content" in known
        ? (
            known.content as Array<Extract<InlineContentItem, { text: string }>>
          ).map((item) => item.text)
        : [];
    });
    expect(texts).toContain("STRAY");
  });
});
