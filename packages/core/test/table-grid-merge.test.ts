/**
 * TableGrid의 셀 병합·분할과 병합 범위 검증 계약을 확인한다.
 */
import { describe, expect, it } from "vitest";

import { mergeCells } from "../src/table-grid-merge.js";
import { buildGrid, cell, table } from "./table-grid-test-support.js";

describe("셀을 병합한다", () => {
  it("병합되지 않은 사각 영역을 병합하면 좌상단 셀이 기준 셀이 되고 나머지는 제거된다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [
          cell("a", "c1", {
            content: [{ text: "keep" }],
            textColor: "#123456",
          }),
          cell("b", "c2"),
        ],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 1, column: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const allIds = result.value.rows.flatMap((row) =>
      row.cells.map((c) => c.id),
    );
    expect(allIds).toEqual(["a"]);

    const anchor = result.value.rows[0]?.cells.find((c) => c.id === "a");
    expect(anchor).toMatchObject({
      rowSpan: 2,
      columnSpan: 2,
      content: [{ text: "keep" }],
      textColor: "#123456",
    });

    const grid = buildGrid(result.value);
    expect(grid.cellAt(1, 1)).toMatchObject({ cellId: "a" });
  });

  it("from/to 순서가 뒤바뀌어도 동일하게 병합한다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = mergeCells(t, { row: 1, column: 1 }, { row: 0, column: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const anchor = result.value.rows[0]?.cells.find((c) => c.id === "a");
    expect(anchor).toMatchObject({ rowSpan: 2, columnSpan: 2 });
  });

  it("직사각형이 아닌 선택은 거절하고 원본을 바꾸지 않는다", () => {
    const t = table(
      ["c1", "c2", "c3"],
      [
        [cell("a", "c1", { columnSpan: 2 }), cell("b", "c3")],
        [cell("c", "c1"), cell("d", "c2"), cell("e", "c3")],
      ],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 0, column: 0 });
    expect(result).toEqual({
      ok: false,
      error: { code: "NOT_RECTANGULAR" },
    });
    expect(t.rows[0]?.cells).toHaveLength(2);
  });

  it("불변식이 깨진 표는 projectTableGrid의 TABLE_GRID_INVALID를 그대로 전파한다", () => {
    // editor-controller.ts의 tableErrorFromCode가 이 코드를 COMMAND_NOT_APPLICABLE로
    // 흡수하는 근거 — 카드 M 그릴링에서 확인: 문서가 load 이후 세션 중 손상되면
    // mergeTableCells가 이 경로로 실패한다.
    const t = table(
      ["c1", "c2"],
      [[cell("a", "c1")], [cell("c", "c1"), cell("d", "c2")]],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 1, column: 1 });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "TABLE_GRID_INVALID", reason: "UNCOVERED_COORDINATE" },
    });
  });

  it("병합되는 셀들의 콘텐츠를 기준 셀 뒤에 논리 좌표 순서로 이어붙인다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [
          cell("a", "c1", { content: [{ text: "왼쪽" }] }),
          cell("b", "c2", {
            content: [{ text: "오른쪽", marks: [{ type: "bold" }] }],
          }),
        ],
        [cell("c", "c1"), cell("d", "c2", { content: [{ text: "아래" }] })],
      ],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 1, column: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 빈 셀(c)은 구분자 없이 건너뛴다 — 공백이 겹치지 않는다.
    expect(result.value.rows[0]?.cells[0]?.content).toEqual([
      { text: "왼쪽" },
      { text: " " },
      { text: "오른쪽", marks: [{ type: "bold" }] },
      { text: " " },
      { text: "아래" },
    ]);
  });

  it("기준 셀이 비어 있으면 앞 공백 없이 나머지 콘텐츠만 남긴다", () => {
    const t = table(
      ["c1", "c2"],
      [[cell("a", "c1"), cell("b", "c2", { content: [{ text: "오른쪽" }] })]],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 0, column: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]?.content).toEqual([
      { text: "오른쪽" },
    ]);
  });

  it("이미 그 범위를 정확히 덮는 병합 셀뿐이면 입력 표를 참조 그대로 반환한다", () => {
    // 참조가 같아야 호출자(applyTableGridOperation)가 no-op을 알아보고
    // 트랜잭션을 만들지 않는다 — 문서는 그대로인데 undo 단계만 쌓인다.
    const t = table(
      ["c1", "c2"],
      [[cell("a", "c1", { rowSpan: 2, columnSpan: 2 })], []],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 1, column: 1 });

    expect(result).toEqual({ ok: true, value: t });
    if (!result.ok) return;
    expect(result.value).toBe(t);
  });

  it("셀 하나짜리 범위를 병합하면 입력 표를 참조 그대로 반환한다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 0, column: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(t);
  });

  it("기존 부분 병합을 포함한 직사각형 전체를 다시 병합한다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1", { columnSpan: 2 })],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 1, column: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      result.value.rows.flatMap((row) => row.cells.map((c) => c.id)),
    ).toEqual(["a"]);
    expect(result.value.rows[0]?.cells[0]).toMatchObject({
      id: "a",
      rowSpan: 2,
      columnSpan: 2,
    });
  });
});
