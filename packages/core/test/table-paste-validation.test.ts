/**
 * TabularData 붙여넣기가 거절해야 하는 입력을 검증한다. 병합 충돌, 구조와
 * 인라인 텍스트 계약 위반, 서식·열 정렬 값 위반, 빈 데이터와 셀 한도 초과,
 * NaN·비정수 columnCount를 다루며 어느 경우에도 문서가 바뀌지 않음을
 * 확인한다. 삽입 위치 경로는 table-paste-commands.test.ts가 맡는다.
 */
import type { TabularData } from "@cp949/geul-io";
import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { mergeTableCells, pasteTabularData } from "../src/table-commands.js";
import { sequentialIds } from "./editor-controller-support.js";
import {
  createTableFixtureEditor,
  docWithParagraph,
  docWithTwoRowTable,
  oneByOneData,
  placeCaretInCell,
} from "./table-test-support.js";

describe("표에 표 형태 데이터를 붙여넣는다", () => {
  it("병합 충돌이면 문서를 바꾸지 않고 거절한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    // 좌측 열(cell-1, cell-3)을 세로로 병합해 rowSpan=2 셀을 만든다 —
    // "비직사각형 범위는 NOT_RECTANGULAR..." 테스트와 같은 준비 단계다.
    const merged = mergeTableCells(
      editor,
      "table-1",
      { row: 0, column: 0 },
      { row: 1, column: 0 },
    );
    expect(merged.ok).toBe(true);

    // 병합된 셀(cell-1) 안으로 캐럿을 옮긴다. selectedRect는 이 셀의 기준
    // 좌표(0,0)를 anchor로 잡지만 실제로는 rowSpan=2라서 row 1도 덮는다.
    placeCaretInCell(editor, "cell-1");
    const before = editor.getJSON() as TiptapJsonNode;

    // 1행짜리 데이터를 anchor(0,0)에 붙여넣으면 rowSpan=2 셀의 아래쪽 절반
    // (row 1, column 0)이 어느 셀에도 속하지 않게 된다 — 병합 경계를 걸치는
    // 붙여넣기는 PASTE_MERGE_CONFLICT로 거절되어야 한다.
    const result = pasteTabularData(
      editor,
      oneByOneData("x"),
      sequentialIds("paste"),
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "PASTE_MERGE_CONFLICT" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("구조적으로 invalid한 TabularData는 TABULAR_DATA_INVALID로 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const createId = sequentialIds("paste");
    const before = editor.getJSON() as TiptapJsonNode;

    // columnIndex가 columnCount 밖이라 (0,0)이 어느 셀에도 덮이지 않는다.
    const outOfRange: TabularData = {
      columnCount: 1,
      rows: [
        {
          cells: [
            {
              columnIndex: 3,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "x" }],
            },
          ],
        },
      ],
    };
    // 같은 좌표를 두 셀이 덮는다.
    const overlapping: TabularData = {
      columnCount: 2,
      rows: [
        {
          cells: [
            { columnIndex: 0, rowSpan: 1, columnSpan: 2, content: [] },
            { columnIndex: 1, rowSpan: 1, columnSpan: 1, content: [] },
          ],
        },
      ],
    };

    // 구조(커버리지) 위반은 병합 명령의 NOT_RECTANGULAR가 아니라 원인
    // message가 담긴 전용 코드로 보고된다 — 호출자가 실패 원인을 구분할 수
    // 있어야 한다(Issue #30).
    const outOfRangeResult = pasteTabularData(editor, outOfRange, createId);
    expect(outOfRangeResult.ok).toBe(false);
    if (!outOfRangeResult.ok) {
      expect(outOfRangeResult.error.code).toBe("TABULAR_DATA_INVALID");
      if (outOfRangeResult.error.code === "TABULAR_DATA_INVALID") {
        expect(outOfRangeResult.error.message).toContain(
          "Table layout is invalid",
        );
      }
    }
    const overlappingResult = pasteTabularData(editor, overlapping, createId);
    expect(overlappingResult.ok).toBe(false);
    if (!overlappingResult.ok) {
      expect(overlappingResult.error.code).toBe("TABULAR_DATA_INVALID");
    }
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("model 인라인 텍스트 계약을 어기는 TabularData는 표 안에서도 TABULAR_DATA_INVALID로 거절한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const before = editor.getJSON() as TiptapJsonNode;

    expect(
      pasteTabularData(editor, oneByOneData("a\tb"), sequentialIds("paste")),
    ).toEqual({
      ok: false,
      error: {
        code: "TABULAR_DATA_INVALID",
        message: "Cell text at row 0, cell 0 is not valid inline text",
      },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("서식 값 위반과 열 정렬 위반은 원인이 담긴 TABULAR_DATA_INVALID로 보고한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const createId = sequentialIds("paste");
    const before = editor.getJSON() as TiptapJsonNode;

    // 소문자 hex — model 정규 형식(대문자 #RRGGBB) 위반.
    const badColor: TabularData = {
      columnCount: 1,
      rows: [
        {
          cells: [
            {
              columnIndex: 0,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "x" }],
              textColor: "#ff0000",
            },
          ],
        },
      ],
    };
    // columnIndex 내림차순 — pasteInto가 요구하는 오름차순 계약 위반.
    const unsorted: TabularData = {
      columnCount: 2,
      rows: [
        {
          cells: [
            { columnIndex: 1, rowSpan: 1, columnSpan: 1, content: [] },
            { columnIndex: 0, rowSpan: 1, columnSpan: 1, content: [] },
          ],
        },
      ],
    };

    expect(pasteTabularData(editor, badColor, createId)).toEqual({
      ok: false,
      error: {
        code: "TABULAR_DATA_INVALID",
        message: "Cell textColor at row 0, cell 0 is not a canonical color",
      },
    });
    expect(pasteTabularData(editor, unsorted, createId)).toEqual({
      ok: false,
      error: {
        code: "TABULAR_DATA_INVALID",
        message: "Cells in row 0 are not sorted by ascending columnIndex",
      },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("표 밖에서 빈 TabularData로 호출하면 INVALID_TABLE_SIZE로 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const createId = sequentialIds("paste");
    const before = editor.getJSON() as TiptapJsonNode;

    const emptyRows: TabularData = { columnCount: 1, rows: [] };
    const emptyColumns: TabularData = {
      columnCount: 0,
      rows: [{ cells: [] }],
    };

    expect(pasteTabularData(editor, emptyRows, createId)).toEqual({
      ok: false,
      error: { code: "INVALID_TABLE_SIZE" },
    });
    expect(pasteTabularData(editor, emptyColumns, createId)).toEqual({
      ok: false,
      error: { code: "INVALID_TABLE_SIZE" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("빈 텍스트 런이 든 셀은 예외 없이 TABULAR_DATA_INVALID로 거절한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const before = editor.getJSON() as TiptapJsonNode;

    // isValidInlineText("")는 true라 io 검증을 통과하지만 ProseMirror는
    // 빈 텍스트 노드를 만들 수 없어 코덱의 schema.text("")가 RangeError를
    // 던졌다 — 편집 가능 콘텐츠 계약(validateEditableContent와 동일)을
    // 명령 경계에서 적용한다.
    expect(
      pasteTabularData(editor, oneByOneData(""), sequentialIds("paste")),
    ).toEqual({
      ok: false,
      error: {
        code: "TABULAR_DATA_INVALID",
        message: "Cell content at row 0, cell 0 contains an empty text run",
      },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("빈 텍스트 런이 든 셀은 표 안 분기에서도 예외 없이 거절한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = pasteTabularData(
      editor,
      oneByOneData(""),
      sequentialIds("paste"),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TABULAR_DATA_INVALID");
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("미지원 링크 마크가 든 셀은 삽입된 척하지 않고 TABULAR_DATA_INVALID로 거절한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const before = editor.getJSON() as TiptapJsonNode;

    // 미지원 href를 통과시키면 LinkPolicyExtension.filterTransaction이
    // 트랜잭션을 통째로 버리는데도 명령은 존재하지 않는 blockId로 ok:true를
    // 반환했다 — 경계에서 거절해야 결과와 문서 상태가 일치한다.
    const withBadLink: TabularData = {
      columnCount: 1,
      rows: [
        {
          cells: [
            {
              columnIndex: 0,
              rowSpan: 1,
              columnSpan: 1,
              content: [
                {
                  text: "x",
                  marks: [{ type: "link", href: "javascript:alert(1)" }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(
      pasteTabularData(editor, withBadLink, sequentialIds("paste")),
    ).toEqual({
      ok: false,
      error: {
        code: "TABULAR_DATA_INVALID",
        message:
          "Cell content at row 0, cell 0 contains an unsupported link URL",
      },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("셀 한도를 넘는 데이터는 검증·골격 생성 비용 없이 선거절한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const before = editor.getJSON() as TiptapJsonNode;

    // 데이터 자체 크기(행 x 열)는 확장 후 최종 크기의 하한이다 — 한도를
    // 넘는 입력이 전체 검증 패스와 골격 생성(행 객체·id 생성)을 다 치른
    // 뒤에야 pasteInto 안에서 거절되면 거절 비용이 입력 크기에 비례한다.
    // 거절 경로는 id를 하나도 뽑지 않아야 한다.
    let idCalls = 0;
    const countingId = () => {
      idCalls += 1;
      return `paste-${idCalls}`;
    };
    const bigData: TabularData = {
      columnCount: 2,
      rows: Array.from({ length: 5_001 }, () => ({
        cells: [
          { columnIndex: 0, rowSpan: 1, columnSpan: 1, content: [] },
          { columnIndex: 1, rowSpan: 1, columnSpan: 1, content: [] },
        ],
      })),
    };

    expect(pasteTabularData(editor, bigData, countingId)).toEqual({
      ok: false,
      error: { code: "CELL_LIMIT_EXCEEDED" },
    });
    expect(idCalls).toBe(0);
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("NaN·비정수 columnCount는 예외 없이 INVALID_TABLE_SIZE로 거절한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const createId = sequentialIds("paste");
    const before = editor.getJSON() as TiptapJsonNode;

    // NaN < 1은 false라 기존 크기 가드를 통과하고, 하류의
    // new Array(rowCount * columnCount)가 RangeError를 던져 공개 명령
    // 밖으로 예외가 새어나갔다.
    for (const columnCount of [Number.NaN, 2.5]) {
      const data: TabularData = {
        ...oneByOneData("x"),
        columnCount,
      };
      expect(pasteTabularData(editor, data, createId)).toEqual({
        ok: false,
        error: { code: "INVALID_TABLE_SIZE" },
      });
    }
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });
});
