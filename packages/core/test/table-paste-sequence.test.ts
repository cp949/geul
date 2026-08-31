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

const bulletItemBlock = (
  text: string,
  children?: ClipboardContentBlock[],
): ClipboardContentBlock => ({
  type: "bulletListItem",
  content: [{ text }],
  ...(children !== undefined ? { children } : {}),
});

const numberedItemBlock = (
  text: string,
  opts: { startNumber?: number; children?: ClipboardContentBlock[] } = {},
): ClipboardContentBlock => ({
  type: "numberedListItem",
  content: [{ text }],
  ...(opts.startNumber !== undefined
    ? { startNumber: opts.startNumber }
    : {}),
  ...(opts.children !== undefined ? { children: opts.children } : {}),
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

  // 완료 조건 1(Issue #143 (b), DELTA-02): 목록 항목은 항상 완전한
  // blockContainer(blockContent, blockGroup?(children…)) 트리로 조립된다 —
  // 문단/heading의 bare + appendTransaction 사후 배정에 기대지 않는다.
  it("목록 항목은 blockContainer(content, blockGroup?(children)) 트리로 조립된다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [bulletItemBlock("a"), bulletItemBlock("b", [bulletItemBlock("c")])],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    const [a, b] = result.value.nodes;
    expect(a?.type.name).toBe("blockContainer");
    expect(a?.childCount).toBe(1);
    expect(a?.child(0).type.name).toBe("bulletListItem");
    expect(a?.child(0).textContent).toBe("a");

    expect(b?.type.name).toBe("blockContainer");
    expect(b?.child(0).type.name).toBe("bulletListItem");
    expect(b?.child(0).textContent).toBe("b");
    expect(b?.child(1).type.name).toBe("blockGroup");
    const nested = b?.child(1).child(0);
    expect(nested?.type.name).toBe("blockContainer");
    expect(nested?.child(0).type.name).toBe("bulletListItem");
    expect(nested?.child(0).textContent).toBe("c");
  });

  it("목록 항목마다 고유한 blockId를 받는다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [bulletItemBlock("a"), bulletItemBlock("b", [bulletItemBlock("c")])],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    const [a, b] = result.value.nodes;
    const nestedId = b?.child(1).child(0).attrs.blockId;
    const ids = [a?.attrs.blockId, b?.attrs.blockId, nestedId];
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) {
      expect(typeof id).toBe("string");
      expect((id as string).length).toBeGreaterThan(0);
    }
  });

  // 완료 조건 2: numberedListItem의 startNumber가 attrs에 정확히
  // 반영된다(model-to-tiptap.ts의 blockContentToTiptapJson과 같은 attrs
  // 계약 — startNumber: block.startNumber ?? null).
  it("numberedListItem의 startNumber가 attrs에 반영된다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [numberedItemBlock("x", { startNumber: 3 })],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    expect(result.value.nodes[0]?.child(0).attrs.startNumber).toBe(3);
  });

  it("startNumber가 없는 numberedListItem은 attrs가 null이다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [numberedItemBlock("x")],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    expect(result.value.nodes[0]?.child(0).attrs.startNumber).toBeNull();
  });

  // 범위 밖(DELTA-02): 목록 항목 children 안에 중첩된 표는 firstTable
  // 추적 대상이 아니다 — 최상위 시퀀스의 첫 표만 추적하는 기존 동작을
  // 유지한다.
  it("목록 항목 children 안 표는 firstTable 추적 대상이 아니다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [bulletItemBlock("intro", [tableBlock("A")])],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    expect(result.value.firstTable).toBeNull();
  });
});
