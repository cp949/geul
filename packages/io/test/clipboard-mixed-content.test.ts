/**
 * 클립보드 HTML이 표와 다른 콘텐츠를 함께 담았을 때 `parseClipboardTable`이
 * 문단과 표를 순서대로 블록 시퀀스에 담는지 검증한다(spec §4.1, Issue #71).
 * 표를 못 찾으면 여전히 TSV/NOT_TABULAR로 흘려보낸다는 계약과, 레이아웃 표
 * 래퍼·자기 복사가 만드는 HTML 모양도 함께 다룬다.
 * `parseClipboardTable`의 나머지 케이스는 `clipboard-table-parser.test.ts`가
 * 다룬다(파일 분할은 Issue #68).
 */
import { describe, expect, it } from "vitest";
import type { ClipboardContentBlock } from "../src/clipboard/clipboard-content.js";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";

const TABLE = "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>";

// TABLE 리터럴이 파싱된 결과(columnCount 2, 셀 "a"/"b")를 그대로 고정한다.
// heading 분리를 확인하는 테스트들이 표 블록까지 함께 toEqual로 단언할 때
// 반복 정의를 피하려고 여기서 한 번만 만든다.
const TABLE_BLOCK: ClipboardContentBlock = {
  type: "table",
  data: {
    columnCount: 2,
    rows: [
      {
        cells: [
          {
            columnIndex: 0,
            rowSpan: 1,
            columnSpan: 1,
            content: [{ text: "a" }],
          },
          {
            columnIndex: 1,
            rowSpan: 1,
            columnSpan: 1,
            content: [{ text: "b" }],
          },
        ],
      },
    ],
  },
};

describe("parseClipboardTable 혼합 콘텐츠 시퀀스 변환", () => {
  // <title>은 소스 문서의 head 메타데이터지 사용자가 선택한 본문이 아니다 —
  // clipboardStrippedTagNames가 태그와 텍스트를 통째로 제거하므로 title
  // 텍스트는 문단으로도 나타나지 않는다.
  it("head의 title 텍스트는 문단으로 옮기지 않는다", () => {
    const result = parseClipboardTable({
      html: `<html><head><title>Sheet1</title></head><body>${TABLE}</body></html>`,
      text: "a\tb",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.type).toBe("table");
  });

  it("title이 있어도 표 밖 문단은 문단 블록으로 보존한다", () => {
    const result = parseClipboardTable({
      html: `<html><head><title>Sheet1</title></head><body><p>intro</p>${TABLE}</body></html>`,
      text: "intro\na\tb",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0]).toEqual({
      type: "paragraph",
      content: [{ text: "intro" }],
    });
    expect(result.value[1]?.type).toBe("table");
  });

  // 완료 기준(Issue #73): findDataTables가 형제 최상위 데이터 표를 문서
  // 순서대로 모두 찾아 각각 독립된 표 블록으로 담는다 — 표 사이·앞뒤 문단도
  // 함께 순서대로 보존된다.
  it("표 사이·앞뒤 문단과 함께 데이터 표 2개를 순서대로 모두 보존한다", () => {
    const html =
      "<p>x</p>" +
      "<table><tbody><tr><td>A1</td><td>A2</td></tr></tbody></table>" +
      "<p>y</p>" +
      "<table><tbody><tr><td>B1</td><td>B2</td></tr></tbody></table>" +
      "<p>z</p>";

    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(5);
    expect(result.value.map((block) => block.type)).toEqual([
      "paragraph",
      "table",
      "paragraph",
      "table",
      "paragraph",
    ]);
    expect(result.value[0]).toEqual({
      type: "paragraph",
      content: [{ text: "x" }],
    });
    expect(result.value[2]).toEqual({
      type: "paragraph",
      content: [{ text: "y" }],
    });
    expect(result.value[4]).toEqual({
      type: "paragraph",
      content: [{ text: "z" }],
    });
    const [, first, , second] = result.value;
    if (first?.type !== "table" || second?.type !== "table") return;
    expect(first.data.rows[0]?.cells.map((cell) => cell.content)).toEqual([
      [{ text: "A1" }],
      [{ text: "A2" }],
    ]);
    expect(second.data.rows[0]?.cells.map((cell) => cell.content)).toEqual([
      [{ text: "B1" }],
      [{ text: "B2" }],
    ]);
  });

  // Slack/Notion/Docs는 블록 경계에 제로폭 문자를 흔히 심는다 — 실질
  // 콘텐츠가 아니므로 빈 문단 블록을 만들지 않는다(눈에 보이지 않는 빈
  // 문단이 편집기에 남으면 사용자가 원인도 모르고 지울 수도 없다).
  it("표 밖 제로폭 문자는 문단 블록을 만들지 않는다", () => {
    for (const invisible of [
      "\u200B",
      "\u200D",
      "\u2060",
      "\u00AD",
      "\uFEFF",
    ]) {
      const result = parseClipboardTable({
        html: `<p>${invisible}</p>${TABLE}`,
        text: "a\tb",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.type).toBe("table");
    }
  });

  // Outlook/Gmail HTML 메일은 여백용 빈 <table>을 중첩해 심는다. findDataTables가
  // 가장 안쪽 표를 고르므로, 빈 표를 데이터 표로 집으면 같은 행에 있는 진짜
  // 셀들이 문단으로 흩어져 표 구조 자체가 사라진다.
  it("셀 없는 중첩 표는 건너뛰고 바깥 데이터 표를 고른다", () => {
    const result = parseClipboardTable({
      html:
        "<table><tbody><tr><td><table></table></td>" +
        "<td>a</td><td>b</td></tr></tbody></table>",
      text: "a\tb",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    const [block] = result.value;
    expect(block?.type).toBe("table");
    if (block?.type !== "table") return;
    expect(block.data.columnCount).toBe(3);
    expect(block.data.rows[0]?.cells[1]?.content).toEqual([{ text: "a" }]);
  });

  // 셀도 <col>도 없는 빈 표는 데이터 표가 아니다 — 표 후보로 쳐서 TSV 짝을
  // 막으면 함께 온 스프레드시트 텍스트까지 잃는다.
  it("빈 표는 표 후보로 치지 않고 TSV 짝으로 폴백한다", () => {
    const result = parseClipboardTable({
      html: "<table></table>",
      text: "a\tb\nc\td",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    const [block] = result.value;
    expect(block?.type).toBe("table");
    if (block?.type !== "table") return;
    expect(block.data.columnCount).toBe(2);
    expect(block.data.rows).toHaveLength(2);
  });

  // 완료 기준(Issue #71): 레이아웃 표 래퍼 안 데이터 표가 형제 셀 텍스트와
  // 함께 보존된다. Gmail 서명이 전형적으로 이 모양이다 — role=presentation
  // 래퍼의 한 셀에 데이터 표, 다른 셀에 서명 문구.
  it("레이아웃 표 래퍼 안 데이터 표가 형제 셀 텍스트와 함께 보존된다", () => {
    const html =
      '<table role="presentation"><tbody><tr>' +
      `<td>${TABLE}</td>` +
      "<td>signature text</td>" +
      "</tr></tbody></table>";

    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0]?.type).toBe("table");
    if (result.value[0]?.type !== "table") return;
    expect(result.value[0].data.rows[0]?.cells[0]?.content).toEqual([
      { text: "a" },
    ]);
    expect(result.value[1]).toEqual({
      type: "paragraph",
      content: [{ text: "signature text" }],
    });
  });

  // 완료 기준(Issue #71): 자기 복사 왕복. 우리 에디터에서 문단+표+문단을
  // 선택해 복사하면 ProseMirror 직렬화가 <div data-pm-slice="1 1 []">로
  // 감싼다(#37 조사로 확인된 실제 모양) — div는 clipboardSanitizeSchema의
  // 허용 태그가 아니므로 sanitize가 unwrap해 자식을 트리 위로 끌어올린다.
  // id 동일성은 이 붙여넣기 파이프라인의 계약이 아니므로(새 대상에 항상 새
  // id를 배정) 구조 보존만 검증한다.
  it("자기 복사가 만드는 div data-pm-slice 래퍼 안에서도 문단과 표를 순서대로 보존한다", () => {
    const html =
      '<div data-pm-slice="1 1 []">' +
      "<p>intro</p>" +
      TABLE +
      "<p>outro</p>" +
      "</div>";

    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value[0]).toEqual({
      type: "paragraph",
      content: [{ text: "intro" }],
    });
    expect(result.value[1]?.type).toBe("table");
    expect(result.value[2]).toEqual({
      type: "paragraph",
      content: [{ text: "outro" }],
    });
  });

  // Finding 1 회귀: 표 밖 문단의 텍스트도 셀과 같은 정규화를 거쳐야 한다.
  // collapseHtmlWhitespace와 normalizeCellContent가 없으면 TAB 등 C0 제어문자가
  // model을 통과해 readEditorDocument에서 throw(editor 영구 desync).
  it("표 밖 문단도 셀과 같은 공백·제어문자 정규화를 거친다", () => {
    const html =
      "<p>\n\tintro\n\t</p>" +
      "<table><tbody><tr><td>a</td></tr></tbody></table>";
    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toEqual({
      type: "paragraph",
      content: [{ text: "intro" }],
    });
  });

  // Finding 1b 회귀: 표 밖 인라인 서식(<p> 없이)도 마크를 보존해야 한다.
  // 이전에는 containsAnyTable 판정이 없어서 <strong> 등이 recursed-into되고
  // 마크가 손실됐다. 이제는 <strong>이 표를 담지 않으면 whole node가 pending으로
  // 가고 inlineContentFromNodes가 마크를 계산한다.
  it("표 앞 인라인 서식(문단 태그 밖)도 마크를 보존한다", () => {
    const html =
      "<strong>bold</strong>" +
      "<table><tbody><tr><td>a</td></tr></tbody></table>";
    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toEqual({
      type: "paragraph",
      content: [{ text: "bold", marks: [{ type: "bold" }] }],
    });
  });

  // 위 케이스의 나머지 절반: 서식 요소가 표를 *담고* 있으면 walk가 그
  // 요소를 통과해 자식으로 내려가므로, 그 요소가 주던 마크가 표 앞뒤
  // 텍스트에서 사라졌다. 마크 계산은 조상 체인을 봐야 한다 —
  // inlineContentFromNodes에 넘기는 노드가 조상 서식을 그대로 달고 가야
  // 형제 케이스와 같은 결과가 나온다.
  it("표를 감싼 인라인 서식도 표 앞뒤 텍스트의 마크를 보존한다", () => {
    const html =
      "<strong>bold" +
      "<table><tbody><tr><td>a</td></tr></tbody></table>" +
      "tail</strong>";
    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value[0]).toEqual({
      type: "paragraph",
      content: [{ text: "bold", marks: [{ type: "bold" }] }],
    });
    expect(result.value[1]?.type).toBe("table");
    expect(result.value[2]).toEqual({
      type: "paragraph",
      content: [{ text: "tail", marks: [{ type: "bold" }] }],
    });
  });

  // 링크는 href까지 조상 체인을 타고 내려와야 한다 — 마크 종류만 맞고
  // href가 빠지면 sanitizeLinks가 이미 검증한 링크가 조용히 평문이 된다.
  it("표를 감싼 링크도 표 앞 텍스트의 href를 보존한다", () => {
    const html =
      '<a href="https://example.com">link' +
      "<table><tbody><tr><td>a</td></tr></tbody></table>" +
      "</a>";
    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toEqual({
      type: "paragraph",
      content: [
        {
          text: "link",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ],
    });
  });

  // DELTA-03(Issue #72): blockSequenceFromNodes가 h1~h3를 heading 블록
  // 경계로 인식한다. Issue #37 재발 방지 — toContainText 등 부분 문자열
  // 단언은 인접 블록 병합을 감춘다(spec §4.1 '정정(2026-08-21 리뷰)').
  // 배열 전체를 toEqual로 단언해 3원소(heading×2 + table)를 고정한다.
  it("h1~h3 heading과 표가 섞이면 각각 정확히 분리된다", () => {
    const result = parseClipboardTable({
      html: "<h1>A</h1><h2>B</h2>" + TABLE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { type: "heading", level: 1, content: [{ text: "A" }] },
      { type: "heading", level: 2, content: [{ text: "B" }] },
      TABLE_BLOCK,
    ]);
  });

  // h4~h6는 model HeadingBlock.level(1|2|3) 밖이라 heading으로 만들 수
  // 없다 — 문단으로 다운그레이드하되, 여전히 블록 경계로 인식해 인접
  // h4~h6와 병합하지 않는다.
  it("h4~h6는 heading이 아닌 문단으로 다운그레이드되고 인접 블록과 병합되지 않는다", () => {
    const merged = parseClipboardTable({
      html: "<h4>A</h4><h4>B</h4>" + TABLE,
    });
    expect(merged.ok).toBe(true);
    if (merged.ok) {
      expect(merged.value).toEqual([
        { type: "paragraph", content: [{ text: "A" }] },
        { type: "paragraph", content: [{ text: "B" }] },
        TABLE_BLOCK,
      ]);
    }

    // h4/h5/h6 각 레벨을 최소 1개씩 커버한다 — 셋 다 문단으로
    // 다운그레이드됨을 확인한다.
    const levels = parseClipboardTable({
      html: "<h4>A</h4><h5>B</h5><h6>C</h6>" + TABLE,
    });
    expect(levels.ok).toBe(true);
    if (levels.ok) {
      expect(levels.value).toEqual([
        { type: "paragraph", content: [{ text: "A" }] },
        { type: "paragraph", content: [{ text: "B" }] },
        { type: "paragraph", content: [{ text: "C" }] },
        TABLE_BLOCK,
      ]);
    }
  });

  // heading 텍스트도 셀 텍스트와 같은 정규화(collapseHtmlWhitespace +
  // normalizeCellContent)를 거쳐야 한다 — 누락되면 model의
  // isValidInlineText가 거절하는 코드포인트가 남아 readEditorDocument에서
  // throw된다(editor 영구 desync).
  it("heading 텍스트도 셀과 같은 공백·제어문자 정규화를 거친다", () => {
    const result = parseClipboardTable({ html: "<h1>\n\tA \t</h1>" + TABLE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toEqual({
      type: "heading",
      level: 1,
      content: [{ text: "A" }],
    });
  });
});
