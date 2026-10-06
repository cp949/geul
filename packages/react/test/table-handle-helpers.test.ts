// @vitest-environment jsdom

/**
 * pickMenuOpenHandleNodes: 표 핸들 메뉴를 연 핸들 노드를 clip 면제 대상으로 고른다
 * (Issue #279). 오버레이 층의 최상위 노드 목록과 열린 메뉴 상태만 받는 순수 함수라
 * 편집기 마운트 없이 DOM 노드로 직접 검증한다. 렌더 배선은 table-handles.test.tsx가
 * 맡는다.
 */

import { describe, expect, it } from "vitest";

import { pickMenuOpenHandleNodes } from "../src/table-handle-helpers.js";

/** 속성 하나만 가진 오버레이 최상위 노드를 만든다. */
const makeNode = (attribute: string): HTMLElement => {
  const node = document.createElement("div");
  node.setAttribute(attribute, "");
  return node;
};

/**
 * 렌더 순서 그대로의 오버레이 층 노드. 행 둘, 열 둘, 리사이즈 strip, 추가 rail 둘,
 * 그립, Plus다.
 */
const makeLayer = () => {
  const rows = [
    makeNode("data-geul-table-row-handle-hit"),
    makeNode("data-geul-table-row-handle-hit"),
  ];
  const columns = [
    makeNode("data-geul-table-column-handle-hit"),
    makeNode("data-geul-table-column-handle-hit"),
  ];
  const strip = makeNode("data-geul-table-resize-handle");
  const expandRow = makeNode("data-geul-table-expand-row");
  const expandColumn = makeNode("data-geul-table-expand-column");
  const grip = makeNode("data-geul-table-grip");
  const plus = makeNode("data-geul-table-quick-insert");
  return {
    rows,
    columns,
    grip,
    plus,
    nodes: [...rows, ...columns, strip, expandRow, expandColumn, grip, plus],
  };
};

describe("pickMenuOpenHandleNodes", () => {
  it("메뉴가 모두 닫혀 있으면 아무것도 고르지 않는다", () => {
    const { nodes } = makeLayer();

    const picked = pickMenuOpenHandleNodes(nodes, {
      menu: null,
      tableGripMenuOpen: false,
    });

    expect(picked.size).toBe(0);
  });

  it("행 메뉴는 kind가 row인 hit box 중 index번째 하나만 고른다", () => {
    const { nodes, rows } = makeLayer();

    const picked = pickMenuOpenHandleNodes(nodes, {
      menu: { kind: "row", index: 1 },
      tableGripMenuOpen: false,
    });

    expect([...picked]).toEqual([rows[1]]);
  });

  it("열 메뉴는 kind가 column인 hit box 중 index번째 하나만 고른다(앞의 행 hit box를 세지 않는다)", () => {
    const { nodes, columns } = makeLayer();

    const picked = pickMenuOpenHandleNodes(nodes, {
      menu: { kind: "column", index: 0 },
      tableGripMenuOpen: false,
    });

    expect([...picked]).toEqual([columns[0]]);
  });

  it("index가 hit box 수를 벗어나면 아무것도 고르지 않는다", () => {
    const { nodes } = makeLayer();

    const picked = pickMenuOpenHandleNodes(nodes, {
      menu: { kind: "row", index: 2 },
      tableGripMenuOpen: false,
    });

    expect(picked.size).toBe(0);
  });

  it("표 그립 메뉴는 그립 버튼만 고르고 Plus와 행·열 hit box는 고르지 않는다", () => {
    const { nodes, grip } = makeLayer();

    const picked = pickMenuOpenHandleNodes(nodes, {
      menu: null,
      tableGripMenuOpen: true,
    });

    expect([...picked]).toEqual([grip]);
  });

  it("그립 노드가 층에 없으면(코너 클러스터 미표시) 아무것도 고르지 않는다", () => {
    const { nodes, grip, plus } = makeLayer();

    const picked = pickMenuOpenHandleNodes(
      nodes.filter((node) => node !== grip && node !== plus),
      { menu: null, tableGripMenuOpen: true },
    );

    expect(picked.size).toBe(0);
  });

  it("행 메뉴와 그립 메뉴가 함께 열린 상태면 둘 다 고른다", () => {
    const { nodes, rows, grip } = makeLayer();

    const picked = pickMenuOpenHandleNodes(nodes, {
      menu: { kind: "row", index: 0 },
      tableGripMenuOpen: true,
    });

    expect(new Set(picked)).toEqual(new Set([rows[0], grip]));
  });
});
