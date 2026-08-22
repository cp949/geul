/**
 * 에디터 컨트롤러가 표 문서를 로드하고 표를 새로 삽입하는 경로를 검증한다.
 * replaceDocument·initialDocument 로드, 저장 배열의 셀 순서와 물리 열 순서의
 * 대응, DOCUMENT_INVALID 거절, insertTable의 성공·거절과 undo를 다룬다.
 * 표 조작 명령은 editor-controller-table.test.ts, 붙여넣기는
 * editor-controller-table-paste.test.ts가 맡는다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  paragraphDocument,
  sequentialIds,
  tableBlockIn,
  tableBlockOf,
} from "./editor-controller-support.js";

/**
 * 저장 후 복원 계약을 한 번에 검증하는 표 문서를 만든다. 열 너비, 병합 셀,
 * 헤더 행, 셀 색상·정렬, 텍스트 마크를 전부 포함해 로드 경로가 어느 속성도
 * 잃지 않는지 확인한다. 각 테스트는 반환값을 그대로 쓰거나 일부를 덮어쓴다.
 */
const richTableDocument = (): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    { id: "para-1", type: "paragraph", content: [{ text: "before" }] },
    {
      id: "table-1",
      type: "table",
      columns: [
        { id: "column-1", width: 220 },
        { id: "column-2", width: 160 },
      ],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-head",
              columnId: "column-1",
              rowSpan: 1,
              columnSpan: 2,
              content: [{ text: "Header", marks: [{ type: "bold" }] }],
              backgroundColor: "#FFEE00",
            },
          ],
        },
        {
          id: "row-2",
          cells: [
            {
              id: "cell-left",
              columnId: "column-1",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "Left" }],
              align: "center",
            },
            {
              id: "cell-right",
              columnId: "column-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "Right" }],
              textColor: "#227700",
            },
          ],
        },
      ],
      headerRows: 1,
      headerColumns: 0,
    },
  ],
});

describe("에디터 컨트롤러 표", () => {
  it("replaceDocument로 표 문서를 로드하면 getDocument()가 표를 그대로 반환한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("kept"),
      onChange: (event) => changes.push(event),
    });
    const loaded = richTableDocument();

    expect(editor.replaceDocument(loaded)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks).toEqual(loaded.blocks);
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["block-1", "para-1", "table-1"],
        reason: "replace",
      },
    ]);
  });

  it("표 문서를 initialDocument로 받아 에디터를 만든다", () => {
    const editor = createEditor({ initialDocument: richTableDocument() });

    expect(editor.getDocument().blocks).toEqual(richTableDocument().blocks);
  });

  it("로드된 표는 라이브 에디터와 동기화된다 — 로드 후 표 명령이 동작하고 속성이 보존된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("kept"),
      createId: sequentialIds("id"),
    });
    editor.replaceDocument(richTableDocument());

    expect(editor.commands.insertTableRow("table-1", 2)).toEqual({
      ok: true,
      value: undefined,
    });
    const table = tableBlockOf(editor);
    expect(table.rows).toHaveLength(3);
    expect(table.columns).toEqual([
      { id: "column-1", width: 220 },
      { id: "column-2", width: 160 },
    ]);
    expect(table.headerRows).toBe(1);
    expect(table.rows[0]?.cells[0]).toMatchObject({
      id: "cell-head",
      columnSpan: 2,
      backgroundColor: "#FFEE00",
      content: [{ text: "Header", marks: [{ type: "bold" }] }],
    });
    expect(table.rows[1]?.cells).toMatchObject([
      { id: "cell-left", align: "center" },
      { id: "cell-right", textColor: "#227700" },
    ]);
  });

  it("저장 배열의 셀 순서가 열 순서와 달라도 물리 열 순서로 로드된다", () => {
    // PIT-0004: 저장 배열 순서는 논리 열 순서의 권위가 아니다. row-2의 셀을
    // 열 순서와 반대로 나열해도 로드가 columns 인덱스 순으로 배치해야 한다.
    const shuffled = richTableDocument();
    const table = tableBlockIn(shuffled);
    const row = table.rows[1];
    if (row === undefined) throw new Error("Expected a second row");
    row.cells = [...row.cells].reverse();

    const editor = createEditor({
      initialDocument: paragraphDocument("kept"),
      createId: sequentialIds("id"),
    });
    editor.replaceDocument(shuffled);

    // 라이브 에디터를 한 번 왕복해 물리 순서를 관찰한다 — getDocument()의
    // 셀 배열은 readEditorDocument가 물리 문서 순서로 다시 읽은 결과다.
    editor.commands.insertTableRow("table-1", 2);
    const reloaded = tableBlockOf(editor);
    expect(reloaded.rows[1]?.cells.map((cell) => cell.id)).toEqual([
      "cell-left",
      "cell-right",
    ]);
  });

  it("셀에 빈 텍스트 런이 있으면 DOCUMENT_INVALID로 거절하고 문서를 바꾸지 않는다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("kept"),
      onChange: (event) => changes.push(event),
    });
    const broken = richTableDocument();
    const table = tableBlockIn(broken);
    const cell = table.rows[1]?.cells[0];
    if (cell === undefined) throw new Error("Expected a cell");
    cell.content = [{ text: "" }];

    const result = editor.replaceDocument(broken);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected a rejection");
    expect(result.error).toEqual({
      code: "DOCUMENT_INVALID",
      message: "Block table-1 cell cell-left contains an empty text run",
    });
    expect(editor.getDocument().revision).toBe(0);
    expect(changes).toEqual([]);
  });

  it("셀에 미지원 링크가 있으면 DOCUMENT_INVALID로 거절한다", () => {
    // 표 차단 해제 뒤에도 거절이 유지되는지 확인하는 회귀 테스트다.
    // 미지원 링크는 modelToTiptap의 셀 검증보다 앞서 model의 parseDocument가
    // 거절하므로 message는 model 계층의 것이다.
    const editor = createEditor({
      initialDocument: paragraphDocument("kept"),
    });
    const broken = richTableDocument();
    const table = tableBlockIn(broken);
    const cell = table.rows[1]?.cells[0];
    if (cell === undefined) throw new Error("Expected a cell");
    cell.content = [
      {
        text: "danger",
        marks: [{ type: "link", href: "javascript:alert(1)" }],
      },
    ];

    expect(editor.replaceDocument(broken)).toEqual({
      ok: false,
      error: { code: "DOCUMENT_INVALID", message: "Unsupported link URL" },
    });
  });

  it("insertTable로 지정 블록 뒤에 표를 삽입하고 getDocument()가 표를 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("id"),
    });

    const result = editor.commands.insertTable("block-1", {
      rows: 2,
      columns: 2,
    });

    expect(result.ok).toBe(true);
    const document = editor.getDocument();
    expect(document.blocks).toHaveLength(2);
    const table = tableBlockIn(document);
    expect(table.rows).toHaveLength(2);
    expect(table.columns).toHaveLength(2);
    expect(table.rows[0]?.cells).toHaveLength(2);
  });

  it("insertTable 삽입 직후 undo 1회로 복원된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("id"),
    });
    const before = editor.getDocument();

    editor.commands.insertTable("block-1", { rows: 1, columns: 1 });

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(before.blocks);
  });

  it("알 수 없는 블록 id에 대해 insertTable이 BLOCK_NOT_FOUND를 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });

    expect(
      editor.commands.insertTable("missing", { rows: 1, columns: 1 }),
    ).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
  });

  it("행 또는 열이 1보다 작으면 insertTable이 INVALID_TABLE_SIZE를 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });

    expect(
      editor.commands.insertTable("block-1", { rows: 0, columns: 1 }),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_TABLE_SIZE" },
    });
  });
});
