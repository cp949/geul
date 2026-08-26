/**
 * buildOutOfTableSequence가 클립보드 시퀀스(문단+표+heading 등)를 순서대로
 * 노드로 바꾸고 첫 표의 위치(firstTable)를 정확히 추적하는지 확인한다.
 * Editor를 마운트하지 않는다 — buildTestSchema가 만드는 스키마만으로
 * 충분한 순수 조립 함수이기 때문이다(pasteClipboardContent 쪽 통합
 * 시나리오는 table-paste-commands.test.ts가 다룬다).
 */
import type { ClipboardContentBlock } from "@cp949/geul-io";
import { describe, expect, it } from "vitest";

import { buildOutOfTableSequence } from "../src/table-paste-sequence.js";
import { sequentialIds } from "./editor-controller-support.js";
import { buildTestSchema } from "./table-test-support.js";

const schema = buildTestSchema();

const paragraphBlock = (text: string): ClipboardContentBlock => ({
  type: "paragraph",
  content: [{ text }],
});

const headingBlock = (
  text: string,
  level: 1 | 2 | 3,
): ClipboardContentBlock => ({
  type: "heading",
  level,
  content: [{ text }],
});

const tableBlock = (text: string): ClipboardContentBlock => ({
  type: "table",
  data: {
    columnCount: 1,
    rows: [
      {
        cells: [
          { columnIndex: 0, rowSpan: 1, columnSpan: 1, content: [{ text }] },
        ],
      },
    ],
  },
});

describe("buildOutOfTableSequence", () => {
  it("표가 없는 시퀀스는 노드만 만들고 firstTable은 null이다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [paragraphBlock("hello")],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    expect(result.value.nodes).toHaveLength(1);
    expect(result.value.nodes[0]?.type.name).toBe("paragraph");
    expect(result.value.nodes[0]?.textContent).toBe("hello");
    expect(result.value.firstTable).toBeNull();
  });

  it("heading 블록은 level 속성을 가진 heading 노드가 된다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [headingBlock("title", 2)],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    expect(result.value.nodes[0]?.type.name).toBe("heading");
    expect(result.value.nodes[0]?.attrs.level).toBe(2);
  });

  it("문단+표+문단 순서에서 firstTable.offset은 앞선 문단의 nodeSize다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [paragraphBlock("intro"), tableBlock("A"), paragraphBlock("outro")],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    const { nodes, firstTable } = result.value;
    expect(nodes.map((node) => node.type.name)).toEqual([
      "paragraph",
      "table",
      "paragraph",
    ]);
    expect(firstTable).not.toBeNull();
    expect(firstTable?.offset).toBe(nodes[0]?.nodeSize);
    expect(firstTable?.node).toBe(nodes[1]);
    expect(firstTable?.data.rows[0]?.cells[0]?.content[0]?.text).toBe("A");
  });

  it("표가 시퀀스 첫 원소면 firstTable.offset은 0이다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [tableBlock("A"), paragraphBlock("outro")],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    expect(result.value.firstTable?.offset).toBe(0);
  });

  it("표가 둘이면 firstTable은 첫 번째 표만 가리킨다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [tableBlock("A"), tableBlock("B")],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    expect(
      result.value.firstTable?.data.rows[0]?.cells[0]?.content[0]?.text,
    ).toBe("A");
  });

  it("표 데이터가 셀 한도를 넘으면 pasteGridInto 실패를 그대로 전파한다", () => {
    // buildPasteTableSkeleton은 block.data와 정확히 같은 크기(101×100)로
    // 골격을 만들고 pasteGridInto가 그 자리에 그대로 채우므로, anchor(0,0)
    // 기준 최종 크기 = block.data 자신의 크기다 — 셀 내용은 검사 지점(크기
    // 가드) 전이라 비어 있어도 된다.
    const oversized: ClipboardContentBlock = {
      type: "table",
      data: {
        columnCount: 100,
        rows: Array.from({ length: 101 }, () => ({ cells: [] })),
      },
    };

    const result = buildOutOfTableSequence(
      schema,
      [oversized],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("한도 초과가 거절되지 않음");
    expect(result.error.code).toBe("CELL_LIMIT_EXCEEDED");
  });
});
