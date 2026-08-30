/**
 * HTML 목록 import가 sanitized ul/ol/li를 목록 블록으로 변환하고 안정 ID,
 * 명시 시작 번호, 임의 children, 깊이 초과 평탄화와 보안 경계를 보존하는지
 * 검증한다.
 */
import type { Block, Document } from "@cp949/geul-model";
import { MAX_NESTING_DEPTH } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";
import { documentVisibleText } from "./html-depth-support.js";

/**
 * 성공한 HTML import 결과를 반환한다. 실패하면 구조화된 오류 메시지를
 * 그대로 노출해 fixture 문제와 importer 회귀를 구분한다.
 */
const importDocument = (html: string): Document => {
  const result = importHtml(html);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.document;
};

/**
 * 목록 항목만으로 이루어진 단일 children 체인 HTML을 만든다. 각 li의 ID와
 * 보이는 텍스트를 레벨에 결합해 깊이 초과 뒤 보존 여부를 추적한다.
 */
const buildNestedListHtml = (levels: number): string => {
  let html = "";
  for (let level = levels; level >= 1; level -= 1) {
    html = `<ul><li data-be-block-id="list-${level}">item-${level}${html}</li></ul>`;
  }
  return html;
};

/**
 * 문서 트리를 반복 순회해 목록 항목 수와 최대 model children 깊이를 잰다.
 * 깊이 방어 테스트 자체가 재귀 측정기의 stack 한계에 의존하지 않게 한다.
 */
const measureListTree = (
  blocks: Block[],
): { itemCount: number; maxDepth: number } => {
  let itemCount = 0;
  let maxDepth = 0;
  const stack: Array<{ blocks: Block[]; depth: number }> = [
    { blocks, depth: 1 },
  ];
  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    maxDepth = Math.max(maxDepth, frame.depth);
    for (const block of frame.blocks) {
      if (
        block.type === "bulletListItem" ||
        block.type === "numberedListItem"
      ) {
        itemCount += 1;
      }
      if (
        block.type !== "table" &&
        block.type !== "divider" &&
        block.type !== "codeBlock" &&
        block.children !== undefined
      ) {
        stack.push({ blocks: block.children, depth: frame.depth + 1 });
      }
    }
  }
  return { itemCount, maxDepth };
};

describe("HTML 목록 기본 의미", () => {
  it("li가 ID와 content를 소유하고 별도 ol의 명시·기본 시작점을 첫 번호 항목에 보존한다", () => {
    const document = importDocument(
      '<ul><li data-be-block-id="bullet"><p data-be-block-id="inner">글머리</p></li></ul>' +
        '<ol start="7"><li data-be-block-id="number-7">일곱</li><li data-be-block-id="number-8">여덟</li></ol>' +
        '<ol><li data-be-block-id="number-default">기본</li></ol>',
    );

    expect(document.blocks).toEqual([
      {
        id: "bullet",
        type: "bulletListItem",
        content: [{ text: "글머리" }],
      },
      {
        id: "number-7",
        type: "numberedListItem",
        startNumber: 7,
        content: [{ text: "일곱" }],
      },
      {
        id: "number-8",
        type: "numberedListItem",
        content: [{ text: "여덟" }],
      },
      {
        id: "number-default",
        type: "numberedListItem",
        startNumber: 1,
        content: [{ text: "기본" }],
      },
    ]);
  });

  it("별도 기본 ol은 인접 번호 목록만 1로 재시작하고 root·nested sibling 경계에서 왕복한다", () => {
    const html =
      '<ol><li data-be-block-id="first">문서 첫 목록</li></ol>' +
      '<p data-be-block-id="root-break">루트 경계</p>' +
      '<ol start="4"><li data-be-block-id="root-4">루트 넷</li></ol>' +
      '<ol><li data-be-block-id="root-1">루트 하나</li><li data-be-block-id="root-2">루트 둘</li></ol>' +
      '<ul><li data-be-block-id="root-bullet">루트 글머리</li></ul>' +
      '<ol><li data-be-block-id="root-default">글머리 뒤 기본</li></ol>' +
      '<ul><li data-be-block-id="bullet">글머리' +
      '<ol start="6"><li data-be-block-id="nested-6">중첩 여섯</li></ol>' +
      '<ol><li data-be-block-id="nested-1">중첩 하나</li></ol>' +
      '<p data-be-block-id="nested-break">중첩 경계</p>' +
      '<ol><li data-be-block-id="nested-default">중첩 기본</li></ol>' +
      "</li></ul>";
    const document = importDocument(html);

    expect(document.blocks).toEqual([
      {
        id: "first",
        type: "numberedListItem",
        content: [{ text: "문서 첫 목록" }],
      },
      {
        id: "root-break",
        type: "paragraph",
        content: [{ text: "루트 경계" }],
      },
      {
        id: "root-4",
        type: "numberedListItem",
        startNumber: 4,
        content: [{ text: "루트 넷" }],
      },
      {
        id: "root-1",
        type: "numberedListItem",
        startNumber: 1,
        content: [{ text: "루트 하나" }],
      },
      {
        id: "root-2",
        type: "numberedListItem",
        content: [{ text: "루트 둘" }],
      },
      {
        id: "root-bullet",
        type: "bulletListItem",
        content: [{ text: "루트 글머리" }],
      },
      {
        id: "root-default",
        type: "numberedListItem",
        content: [{ text: "글머리 뒤 기본" }],
      },
      {
        id: "bullet",
        type: "bulletListItem",
        content: [{ text: "글머리" }],
        children: [
          {
            id: "nested-6",
            type: "numberedListItem",
            startNumber: 6,
            content: [{ text: "중첩 여섯" }],
          },
          {
            id: "nested-1",
            type: "numberedListItem",
            startNumber: 1,
            content: [{ text: "중첩 하나" }],
          },
          {
            id: "nested-break",
            type: "paragraph",
            content: [{ text: "중첩 경계" }],
          },
          {
            id: "nested-default",
            type: "numberedListItem",
            content: [{ text: "중첩 기본" }],
          },
        ],
      },
    ]);

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain(
      '<ol start="4"><li data-be-block-id="root-4">루트 넷</li></ol><ol start="1"><li data-be-block-id="root-1">루트 하나</li><li data-be-block-id="root-2">루트 둘</li></ol>',
    );
    expect(importHtml(exported.value)).toMatchObject({
      ok: true,
      value: { document },
    });
  });

  it("같은 ol의 direct 비-li 블록이 번호 항목 사이를 끊으면 후속 항목에 실제 HTML 서수를 명시한다", () => {
    const document = importDocument(
      '<ol start="4"><li data-be-block-id="a">넷</li><p data-be-block-id="break">경계</p><li data-be-block-id="b">다섯</li></ol>' +
        '<ol start="8"><li data-be-block-id="c">여덟</li><ul><li data-be-block-id="nested">중첩 글머리</li></ul><li data-be-block-id="d">아홉</li><li data-be-block-id="e">열</li></ol>',
    );

    expect(document.blocks).toEqual([
      {
        id: "a",
        type: "numberedListItem",
        startNumber: 4,
        content: [{ text: "넷" }],
      },
      { id: "break", type: "paragraph", content: [{ text: "경계" }] },
      {
        id: "b",
        type: "numberedListItem",
        startNumber: 5,
        content: [{ text: "다섯" }],
      },
      {
        id: "c",
        type: "numberedListItem",
        startNumber: 8,
        content: [{ text: "여덟" }],
      },
      {
        id: "nested",
        type: "bulletListItem",
        content: [{ text: "중첩 글머리" }],
      },
      {
        id: "d",
        type: "numberedListItem",
        startNumber: 9,
        content: [{ text: "아홉" }],
      },
      {
        id: "e",
        type: "numberedListItem",
        content: [{ text: "열" }],
      },
    ]);
  });

  it("인접 별도 ol의 비십진 start는 경고를 유지하고 기본 1 restart를 보존한다", () => {
    const result = importHtml(
      '<ol start="4"><li data-be-block-id="a">넷</li></ol>' +
        '<ol start="nope"><li data-be-block-id="b">하나</li></ol>' +
        '<ol start="1.5"><li data-be-block-id="c">다시 하나</li></ol>' +
        '<ol start=" "><li data-be-block-id="d">공백 뒤 하나</li></ol>' +
        '<ol start="0x10"><li data-be-block-id="e">16진수 뒤 하나</li></ol>' +
        '<ol start="+7"><li data-be-block-id="f">부호 있는 칠</li></ol>' +
        '<ol start="007"><li data-be-block-id="g">앞자리 영 칠</li></ol>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "a",
        type: "numberedListItem",
        startNumber: 4,
        content: [{ text: "넷" }],
      },
      {
        id: "b",
        type: "numberedListItem",
        startNumber: 1,
        content: [{ text: "하나" }],
      },
      {
        id: "c",
        type: "numberedListItem",
        startNumber: 1,
        content: [{ text: "다시 하나" }],
      },
      {
        id: "d",
        type: "numberedListItem",
        startNumber: 1,
        content: [{ text: "공백 뒤 하나" }],
      },
      {
        id: "e",
        type: "numberedListItem",
        startNumber: 1,
        content: [{ text: "16진수 뒤 하나" }],
      },
      {
        id: "f",
        type: "numberedListItem",
        startNumber: 7,
        content: [{ text: "부호 있는 칠" }],
      },
      {
        id: "g",
        type: "numberedListItem",
        startNumber: 7,
        content: [{ text: "앞자리 영 칠" }],
      },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "ol",
        attribute: "start",
      }),
      expect.objectContaining({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "ol",
        attribute: "start",
      }),
      expect.objectContaining({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "ol",
        attribute: "start",
      }),
      expect.objectContaining({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "ol",
        attribute: "start",
      }),
    ]);
  });

  it("제거될 template의 numeric 속성이 뒤의 유효 십진 ol과 잘못 대응되지 않는다", () => {
    const result = importHtml(
      '<template><ol start="0x10"><li>숨김</li></ol></template>' +
        '<ol start="16"><li data-be-block-id="visible">표시</li></ol>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toEqual([
      {
        id: "visible",
        type: "numberedListItem",
        startNumber: 16,
        content: [{ text: "표시" }],
      },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "UNSAFE_ELEMENT_REMOVED",
        element: "template",
      }),
    ]);
  });

  it("table의 implied·foster 구조 뒤 유효 십진 ol에 raw numeric 속성을 정확히 대응한다", () => {
    const result = importHtml(
      '앞<table><tr><td rowspan="0x10">셀</td></tr></table>' +
        '<ol start="16"><li data-be-block-id="after-table">표 뒤</li></ol>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(
      result.value.document.blocks.some((block) => block.type === "table"),
    ).toBe(true);
    expect(result.value.document.blocks.at(-1)).toEqual({
      id: "after-table",
      type: "numberedListItem",
      startNumber: 16,
      content: [{ text: "표 뒤" }],
    });
  });

  it("혼합 중첩 목록과 목록 항목의 모든 지원 블록 children이 계층·순서·ID를 보존한다", () => {
    const document = importDocument(`
      <ul><li data-be-block-id="root">부모
        <p data-be-block-id="paragraph">문단</p>
        <h2 data-be-block-id="heading">제목</h2>
        <blockquote data-be-block-id="quote"><p>인용</p></blockquote>
        <hr data-be-block-id="divider">
        <table data-be-block-id="table"><colgroup><col data-be-column-id="column" width="160"></colgroup><tbody><tr data-be-row-id="row"><td data-be-cell-id="cell" data-be-column-id="column">셀</td></tr></tbody></table>
        <pre data-be-block-id="code"><code>코드</code></pre>
        <ol start="4"><li data-be-block-id="nested">자식 번호</li></ol>
      </li></ul>
    `);

    expect(document.blocks).toEqual([
      {
        id: "root",
        type: "bulletListItem",
        content: [{ text: "부모\n        " }],
        children: [
          { id: "paragraph", type: "paragraph", content: [{ text: "문단" }] },
          {
            id: "heading",
            type: "heading",
            level: 2,
            content: [{ text: "제목" }],
          },
          { id: "quote", type: "quote", content: [{ text: "인용" }] },
          { id: "divider", type: "divider" },
          {
            id: "table",
            type: "table",
            columns: [{ id: "column", width: 160 }],
            rows: [
              {
                id: "row",
                cells: [
                  {
                    id: "cell",
                    columnId: "column",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [{ text: "셀" }],
                  },
                ],
              },
            ],
            headerRows: 0,
            headerColumns: 0,
          },
          { id: "code", type: "codeBlock", content: [{ text: "코드" }] },
          {
            id: "nested",
            type: "numberedListItem",
            startNumber: 4,
            content: [{ text: "자식 번호" }],
          },
        ],
      },
    ]);
  });
});

describe("HTML 목록 보안과 깊이 경계", () => {
  it("목록 의미로 변환되지 않는 li ID와 ol start는 속성 제거 경고를 유지한다", () => {
    const standaloneItem = importHtml(
      '<li data-be-block-id="stable">독립 항목</li>',
    );
    expect(standaloneItem.ok).toBe(true);
    if (!standaloneItem.ok) throw new Error(standaloneItem.error.message);
    expect(standaloneItem.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "독립 항목" }],
      },
    ]);
    expect(standaloneItem.value.warnings).toEqual([
      expect.objectContaining({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "li",
        attribute: "dataBeBlockId",
      }),
    ]);

    const listWithoutItem = importHtml('<ol start="7">목록 밖 텍스트</ol>');
    expect(listWithoutItem.ok).toBe(true);
    if (!listWithoutItem.ok) throw new Error(listWithoutItem.error.message);
    expect(listWithoutItem.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "목록 밖 텍스트" }],
      },
    ]);
    expect(listWithoutItem.value.warnings).toEqual([
      expect.objectContaining({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "ol",
        attribute: "start",
      }),
    ]);
  });

  it("raw 목록 subtree의 unsafe 요소·속성·URL을 semantic content나 children으로 복원하지 않는다", () => {
    const result = importHtml(
      '<ul><li data-be-block-id="safe" onclick="attack()">안전<script><ul><li data-be-block-id="evil">악성</li></ul></script><a href="javascript:attack()">링크</a></li></ul>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "safe",
        type: "bulletListItem",
        content: [{ text: "안전링크" }],
      },
    ]);
    expect(documentVisibleText(result.value.document)).not.toContain("악성");
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "UNSAFE_ATTRIBUTE_REMOVED" }),
        expect.objectContaining({ kind: "UNSAFE_ELEMENT_REMOVED" }),
        expect.objectContaining({ kind: "UNSAFE_URL_REMOVED" }),
      ]),
    );
  });

  it("model 깊이 64를 넘는 목록은 초과 항목을 형제로 평탄화하고 HTML tree 경고와 구분한다", () => {
    const result = importHtml(buildNestedListHtml(MAX_NESTING_DEPTH + 1));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(measureListTree(result.value.document.blocks)).toEqual({
      itemCount: MAX_NESTING_DEPTH + 1,
      maxDepth: MAX_NESTING_DEPTH,
    });
    expect(documentVisibleText(result.value.document)).toContain(
      `item-${MAX_NESTING_DEPTH + 1}`,
    );
    expect(result.value.warnings).toEqual([
      expect.objectContaining({ kind: "NESTED_CHILDREN_FLATTENED" }),
    ]);
    expect(result.value.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "DEEP_TREE_FLATTENED" }),
      ]),
    );
  });
});
