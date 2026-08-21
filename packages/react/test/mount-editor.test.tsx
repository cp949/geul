// @vitest-environment jsdom
/**
 * 공용 실제 마운트 헬퍼(mountTableEditor, mountBlockEditor)가 만드는 DOM이
 * 오버레이가 기대하는 계약을 실제로 만족하는지 고정한다. 이 헬퍼가 깨지면
 * 이 파일을 쓰는 모든 오버레이 테스트가 이유를 알 수 없게 무너지므로 계약을
 * 여기서 직접 잡는다.
 */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { mountBlockEditor, mountTableEditor } from "./mount-editor.js";

afterEach(cleanup);

describe("실제 편집기 마운트 헬퍼", () => {
  it("편집 영역을 contenteditable 속성으로 노출한다", () => {
    const { editable } = mountTableEditor();

    expect(editable.getAttribute("contenteditable")).toBe("true");
  });

  it("표의 행·열 id를 DOM과 모델에서 같은 순서로 노출한다", () => {
    const { table, rowIds, columnIds } = mountTableEditor();

    expect(
      Array.from(table.querySelectorAll("[data-be-row-id]")).map((row) =>
        row.getAttribute("data-be-row-id"),
      ),
    ).toEqual(rowIds);
    // colgroup의 col은 id를 갖지 않아 순서를 직접 확인할 수 없다. 첫 행 셀의
    // data-be-column-id 순서로 대신 확인한다 — table-handles.test.tsx와
    // table-handle-menu.test.tsx의 moveTableColumn 단언이 columnIds 순서가
    // DOM 열 순서와 같다는 전제에 기대므로 여기서 그 전제를 고정한다.
    const firstRow = table.querySelector<HTMLElement>("[data-be-row-id]");
    expect(
      Array.from(firstRow?.querySelectorAll("[data-be-column-id]") ?? []).map(
        (cell) => cell.getAttribute("data-be-column-id"),
      ),
    ).toEqual(columnIds);
  });

  it("모델 열 너비를 스텁 격자와 같은 값으로 맞춘다", () => {
    const { table } = mountTableEditor();

    expect(
      Array.from(table.querySelectorAll<HTMLElement>("colgroup col")).map(
        (col) => col.style.width,
      ),
    ).toEqual(["100px", "100px"]);
  });

  it("jsdom에 없는 레이아웃을 스텁해 표 rect가 0이 아니게 만든다", () => {
    const { table } = mountTableEditor();
    const rect = table.getBoundingClientRect();

    expect({ width: rect.width, height: rect.height }).toEqual({
      width: 200,
      height: 60,
    });
  });

  it("요청한 크기의 표를 만든다", () => {
    const { table, rowIds, columnIds } = mountTableEditor({
      rows: 1,
      columns: 3,
    });

    expect(rowIds).toHaveLength(1);
    expect(columnIds).toHaveLength(3);
    expect(table.querySelectorAll("[data-be-column-id]")).toHaveLength(3);
  });

  it("표 밖 오버레이도 같은 provider 아래에서 마운트한다", () => {
    mountTableEditor({ children: <div data-testid="probe" /> });

    expect(screen.getByTestId("probe")).toBeTruthy();
  });

  /**
   * Task 3~12는 표 안 포인터 좌표(clientX/clientY)를 행·셀 rect에서 직접
   * 뽑아 쓴다. left/top/width/height 네 항 전부가 격자 계약과 일치해야
   * 그 좌표들이 의미를 가지므로, 여기서 행 rect 전체를 고정한다.
   */
  it("두 번째 행의 rect를 격자 좌표대로 스텁한다", () => {
    const { table } = mountTableEditor();
    const rows = Array.from(
      table.querySelectorAll<HTMLElement>("[data-be-row-id]"),
    );
    const row1 = rows[1];
    if (row1 === undefined) throw new Error("둘째 행 없음");
    const rect = row1.getBoundingClientRect();

    expect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }).toEqual({ left: 100, top: 130, width: 200, height: 30 });
  });

  /** 위와 같은 이유로, 셀 rect도 네 항 전부 고정한다. */
  it("두 번째 행 두 번째 셀의 rect를 격자 좌표대로 스텁한다", () => {
    const { table } = mountTableEditor();
    const rows = Array.from(
      table.querySelectorAll<HTMLElement>("[data-be-row-id]"),
    );
    const row1 = rows[1];
    if (row1 === undefined) throw new Error("둘째 행 없음");
    const cells = Array.from(
      row1.querySelectorAll<HTMLElement>("[data-be-column-id]"),
    );
    const cell1 = cells[1];
    if (cell1 === undefined) throw new Error("둘째 셀 없음");
    const rect = cell1.getBoundingClientRect();

    expect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }).toEqual({ left: 200, top: 130, width: 100, height: 30 });
  });

  /**
   * insertTableColumn이 만드는 열은 DEFAULT_COLUMN_WIDTH(160px)를 받는다
   * (packages/core/src/table-grid.ts:230). restubGeometry가 폭을 다시
   * 맞추지 않으면 새 열만 160px로 남아 스텁 격자와 어긋난다.
   */
  it("열 삽입 뒤 restubGeometry가 새 열의 너비도 스텁 격자와 맞춘다", () => {
    const { table, tableBlockId, editor, restubGeometry } = mountTableEditor();

    const insertedColumn = editor.commands.insertTableColumn(tableBlockId, 2);
    if (!insertedColumn.ok) throw new Error("열 삽입 fixture 준비 실패");
    restubGeometry();

    expect(
      Array.from(table.querySelectorAll<HTMLElement>("colgroup col")).map(
        (col) => col.style.width,
      ),
    ).toEqual(["100px", "100px", "100px"]);
  });
});

describe("문단 전용 실제 편집기 마운트 헬퍼", () => {
  it("요청한 블록 id를 문서 순서 그대로 문단으로 마운트한다", () => {
    const { blocks, editor } = mountBlockEditor({
      blockIds: ["block-1", 'a"b\\c'],
    });

    expect(
      blocks.map((block) => block.getAttribute("data-be-block-id")),
    ).toEqual(["block-1", 'a"b\\c']);
    expect(blocks.map((block) => block.tagName)).toEqual(["P", "P"]);
    expect(editor.getDocument().blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "paragraph",
    ]);
  });

  /**
   * SlashMenu 계열 테스트는 블록 rect에서 clientY를 직접 뽑아 드래그 목표
   * 인덱스를 만든다. 네 항 전부가 격자 계약과 일치해야 그 좌표가 뜻을
   * 가지므로 여기서 블록 rect 전체를 고정한다.
   */
  it("블록 rect를 20px 간격 격자로 스텁한다", () => {
    const { blocks } = mountBlockEditor({
      blockIds: ["block-1", "block-2", "block-3"],
    });

    expect(
      blocks.map((block) => {
        const rect = block.getBoundingClientRect();
        return { left: rect.left, top: rect.top, height: rect.height };
      }),
    ).toEqual([
      { left: 0, top: 0, height: 20 },
      { left: 0, top: 20, height: 20 },
      { left: 0, top: 40, height: 20 },
    ]);
  });

  it("문단 삽입 뒤 restubGeometry가 새 블록도 격자에 맞춘다", () => {
    const { editor, restubGeometry } = mountBlockEditor({
      blockIds: ["block-1"],
    });

    const inserted = editor.commands.insertParagraphAfter("block-1");
    if (!inserted.ok) throw new Error("문단 삽입 fixture 준비 실패");
    const blocks = restubGeometry();

    expect(blocks).toHaveLength(2);
    expect(blocks[1]?.getAttribute("data-be-block-id")).toBe(
      inserted.value.blockId,
    );
    expect(blocks[1]?.getBoundingClientRect().top).toBe(20);
  });

  it("문단 밖 오버레이도 같은 provider 아래에서 마운트한다", () => {
    mountBlockEditor({ children: <div data-testid="probe" /> });

    expect(screen.getByTestId("probe")).toBeTruthy();
  });
});
