// @vitest-environment jsdom

/**
 * TableGripMenu 컴포넌트(Issue #174 RD-003): 표 그립 버튼 클릭으로 여는
 * 표 전체 단위 메뉴(제목 행/열 토글, 표 복제, 너비에 맞추기 placeholder)와
 * 그 열기/닫기 상태 머신을 검증한다. TableHandles 안에서만 렌더되는 내부
 * 컴포넌트라 TableHandles를 합성 마운트해 구동한다(table-handle-menu.test.tsx와
 * 같은 방식).
 *
 * 모든 describe가 실제 createEditor() 마운트 위에서 돈다 — 손으로 조립한
 * fake 컨트롤러/DOM 레인은 없다. 명령이 진짜라 호출 스파이 대신 문서
 * 결과(tableBlockOf)를 단언한다.
 */

import { DEFAULT_DICTIONARY } from "@cp949/geul-core";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TableHandles } from "../src/table-handles.js";
import {
  type MountTableEditorOptions,
  mountTableEditor,
  tableBlockOf,
} from "./mount-editor.js";

afterEach(cleanup);

const tableGripLabel = "Table menu";
const rowHandleLabel = "Drag to reorder row, click for options";

if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}

/** table-handle-menu.test.tsx의 renderRealTable과 같은 관용구. */
const renderRealTable = (
  options?: Pick<MountTableEditorOptions, "rows" | "columns" | "dictionary">,
) => {
  const mounted = mountTableEditor({
    ...options,
    children: <TableHandles />,
  });
  return {
    ...mounted,
    editable: mounted.host,
    contentEditable: mounted.editable,
  };
};

/** 실제 마운트한 표에서 표 그립 버튼을 클릭해 TableGripMenu를 연다. */
const openTableGripMenu = (
  options?: Pick<MountTableEditorOptions, "rows" | "columns" | "dictionary">,
) => {
  const rendered = renderRealTable(options);
  fireEvent.pointerMove(rendered.table);
  fireEvent.click(screen.getByRole("button", { name: tableGripLabel }));
  return rendered;
};

describe("표 그립 버튼 클릭", () => {
  it("클릭하면 메뉴가 열리고 표가 선택된 상태로 유지된다", () => {
    const { editor, tableBlockId } = openTableGripMenu();

    expect(screen.getByRole("menu", { name: "Table menu" })).toBeTruthy();
    expect(editor.getBlockSelection()).toEqual({
      fromBlockId: tableBlockId,
      toBlockId: tableBlockId,
    });
  });

  it("같은 표에서 다시 클릭하면 메뉴를 닫고 편집기로 초점을 되돌린다", () => {
    const { contentEditable, table } = openTableGripMenu();
    expect(screen.getByRole("menu", { name: "Table menu" })).toBeTruthy();

    fireEvent.pointerMove(table);
    fireEvent.click(screen.getByRole("button", { name: tableGripLabel }));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(contentEditable);
  });

  it("dictionary override 시 메뉴 aria-label과 항목 텍스트가 바뀐다(EXT-009)", () => {
    const dictionary = {
      ...DEFAULT_DICTIONARY,
      handle: { ...DEFAULT_DICTIONARY.handle, tableMenu: "표 메뉴" },
      menu: {
        ...DEFAULT_DICTIONARY.menu,
        tableGripMenuAriaLabel: "표 메뉴 패널",
        duplicate: "복제",
        fitTableWidth: "너비 맞추기",
      },
    };

    const { table } = renderRealTable({ dictionary });
    fireEvent.pointerMove(table);
    fireEvent.click(screen.getByRole("button", { name: "표 메뉴" }));

    expect(screen.getByRole("menu", { name: "표 메뉴 패널" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "복제" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "너비 맞추기" })).toBeTruthy();
  });

  it("행/열 grip 메뉴가 열려 있으면 표 그립 버튼 클릭이 그 메뉴를 닫는다", () => {
    const { table } = renderRealTable();
    fireEvent.pointerMove(table);
    const [rowHandle] = screen.getAllByRole("button", { name: rowHandleLabel });
    if (rowHandle === undefined) throw new Error("행 핸들 없음");
    fireEvent.pointerDown(rowHandle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(rowHandle, { pointerId: 1 });
    fireEvent.click(rowHandle);
    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: tableGripLabel }));

    expect(screen.queryByRole("menu", { name: "Table row menu" })).toBeNull();
    expect(screen.getByRole("menu", { name: "Table menu" })).toBeTruthy();
  });

  it("Escape로 메뉴를 닫고 편집기로 초점을 되돌린다", () => {
    const { contentEditable } = openTableGripMenu();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(contentEditable);
  });

  it("메뉴 바깥을 클릭하면 초점을 강제로 옮기지 않고 메뉴만 닫는다", () => {
    openTableGripMenu();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("표 그립 메뉴 항목", () => {
  it("제목 행을 토글한다", () => {
    const { editor } = openTableGripMenu();

    const headerRowItem = screen.getByRole("menuitemcheckbox", {
      name: "Header row",
    });
    expect(headerRowItem.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(headerRowItem);

    expect(tableBlockOf(editor).headerRows).toBe(1);
  });

  it("제목 열을 토글한다", () => {
    const { editor } = openTableGripMenu();

    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Header column" }),
    );

    expect(tableBlockOf(editor).headerColumns).toBe(1);
  });

  it("행/열 grip 메뉴로 이미 켠 제목 행이 그립 메뉴에도 체크로 반영된다(같은 커맨드, 같은 문서 상태)", () => {
    const { editor, table } = renderRealTable();
    fireEvent.pointerMove(table);
    const [rowHandle] = screen.getAllByRole("button", { name: rowHandleLabel });
    if (rowHandle === undefined) throw new Error("행 핸들 없음");
    fireEvent.pointerDown(rowHandle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(rowHandle, { pointerId: 1 });
    fireEvent.click(rowHandle);
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Header row" }),
    );
    expect(tableBlockOf(editor).headerRows).toBe(1);

    fireEvent.pointerMove(table);
    fireEvent.click(screen.getByRole("button", { name: tableGripLabel }));

    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Header row" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("표 복제 항목이 원본 바로 뒤에 새 표를 삽입하고 메뉴를 닫는다", () => {
    const { editor, tableBlockId } = openTableGripMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    const document = editor.getDocument();
    const tableIndex = document.blocks.findIndex(
      (block) => block.id === tableBlockId,
    );
    const duplicated = document.blocks[tableIndex + 1];
    expect(duplicated?.type).toBe("table");
    expect(duplicated?.id).not.toBe(tableBlockId);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("너비에 맞추기 항목은 console.log만 남기고 문서를 바꾸지 않은 채 메뉴를 닫는다", () => {
    const { editor } = openTableGripMenu();
    const before = editor.getDocument();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Fit to width (coming soon)" }),
    );

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(editor.getDocument()).toEqual(before);
    expect(screen.queryByRole("menu")).toBeNull();
    logSpy.mockRestore();
  });
});

// table-handles.test.tsx가 갖고 있던 "Indent/Outdent table 비활성화"
// describe를 그립 메뉴 버전으로 옮긴 것이다(Issue #174 RD-004 — 좌상단
// 아이콘 버튼 → 메뉴 항목).
describe("들여쓰기/내어쓰기 항목(G-UI-004, Issue #174 RD-004)", () => {
  it("앞에 들여쓸 수 있는 형제가 있으면 들여쓰기는 활성, 표는 top-level이라 내어쓰기는 비활성이다", () => {
    openTableGripMenu();

    const indentItem = screen.getByRole("menuitem", { name: "Indent" });
    const outdentItem = screen.getByRole("menuitem", { name: "Outdent" });
    expect(indentItem.getAttribute("aria-disabled")).toBe("false");
    expect(indentItem.getAttribute("title")).toBeNull();
    expect(outdentItem.getAttribute("aria-disabled")).toBe("true");
    expect(outdentItem.getAttribute("title")).toBe("Can't outdent further");
  });

  it("내어쓰기가 비활성인 상태에서 클릭해도 outdentBlock을 호출하지 않고 메뉴를 닫지 않는다", () => {
    const { editor } = openTableGripMenu();
    const outdentSpy = vi.spyOn(editor.commands, "outdentBlock");

    fireEvent.click(screen.getByRole("menuitem", { name: "Outdent" }));

    // aria-disabled는 disabled와 달리 클릭 이벤트를 막지 않는다(G-UI-004) —
    // 가드가 클릭을 막았는지 spy로 본다. block-side-menu-menu.tsx의
    // handleOutdentBlock과 같은 규칙으로, 가드에 걸리면 onClose()도
    // 호출되지 않아 메뉴가 열린 채로 남는다.
    expect(outdentSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("menu", { name: "Table menu" })).toBeTruthy();
  });

  /**
   * 표 바로 앞에 표를 하나 더 이어붙인다 — `table` 노드는 `group: "block"`뿐이라
   * `isNestableBlockContainer`의 `node.type.name === "blockContainer"` 조건을
   * 만족하지 못한다(실측). 둘째 표의 previous sibling이 첫째 표가 돼
   * canIndent가 false가 된다.
   */
  const openTableGripMenuOnSecondTableWithNoNestableSibling = () => {
    const rendered = renderRealTable();
    const insertedSecond = rendered.editor.commands.insertTable(
      rendered.tableBlockId,
      { rows: 2, columns: 2 },
    );
    if (!insertedSecond.ok) throw new Error("둘째 표 fixture 준비 실패");
    const secondTableId = insertedSecond.value.blockId;
    const secondTable = rendered.host.querySelector<HTMLElement>(
      `table[data-geul-block-id="${secondTableId}"]`,
    );
    if (secondTable === null) throw new Error("둘째 표가 렌더되지 않았다");
    fireEvent.pointerMove(secondTable);
    fireEvent.click(screen.getByRole("button", { name: tableGripLabel }));
    return rendered;
  };

  it("앞 형제가 표(들여쓸 수 없는 컨테이너)면 들여쓰기가 비활성이다", () => {
    openTableGripMenuOnSecondTableWithNoNestableSibling();

    const indentItem = screen.getByRole("menuitem", { name: "Indent" });
    expect(indentItem.getAttribute("aria-disabled")).toBe("true");
    expect(indentItem.getAttribute("title")).toBe("Can't indent further");
  });

  it("들여쓰기가 비활성인 상태에서 클릭해도 indentBlock을 호출하지 않는다", () => {
    const { editor } = openTableGripMenuOnSecondTableWithNoNestableSibling();
    const indentSpy = vi.spyOn(editor.commands, "indentBlock");

    fireEvent.click(screen.getByRole("menuitem", { name: "Indent" }));

    expect(indentSpy).not.toHaveBeenCalled();
  });

  it("들여쓰기를 클릭하면 표가 앞 형제의 자식이 되고 메뉴를 닫는다", () => {
    const { editor, tableBlockId } = openTableGripMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "Indent" }));

    expect(editor.getBlockNestingActionState(tableBlockId).canOutdent).toBe(
      true,
    );
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("표 그립 메뉴 무효화", () => {
  it("메뉴가 열린 동안 표 블록이 통째로 사라지면 메뉴 상태도 함께 비워진다", async () => {
    const { editor, table, tableBlockId } = openTableGripMenu();
    expect(screen.getByRole("menu", { name: "Table menu" })).toBeTruthy();

    await act(async () => {
      const deleted = editor.commands.deleteBlock(tableBlockId);
      if (!deleted.ok) throw new Error("표 블록 삭제 fixture 준비 실패");
      await Promise.resolve();
    });

    expect(table.isConnected).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
