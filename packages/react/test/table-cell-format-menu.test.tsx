// @vitest-environment jsdom

import type { EditorController } from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableCellFormatMenu } from "../src/table-cell-format-menu.js";
import { withProvider } from "./fake-editor-provider.js";

// vitest.config.ts에 globals도 setupFiles도 없어 자동 cleanup이 없다. 각 it
// 말미의 unmount로는 assertion이 먼저 던질 때 DOM이 남아 다음 테스트의
// getByRole(...)가 "multiple elements"로 실패한다 — 진짜 실패가 가려진다.
// block-side-menu.test.tsx와 같은 afterEach(cleanup)을 쓴다.
afterEach(cleanup);

const fakeController = () => ({
  mount: vi.fn(),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMarks: vi.fn(() => [] as string[]),
  getSelectionLink: vi.fn(() => null),
  getCaretBlockContext: vi.fn(() => null),
  getSelectionBlockType: vi.fn(() => null),
  getTableCellSelection: vi.fn(() => null),
  replaceDocument: vi.fn(),
  commands: {
    setTableCellTextColor: vi.fn(() => ({ ok: true, value: undefined })),
    setTableCellBackgroundColor: vi.fn(() => ({ ok: true, value: undefined })),
    setTableCellAlign: vi.fn(() => ({ ok: true, value: undefined })),
  } as unknown as EditorController["commands"],
});

describe("셀 서식 메뉴", () => {
  it("Text color 스와치 클릭 시 대상 셀 id 목록에 색을 적용하고 닫는다", () => {
    const controller = fakeController();
    const onClose = vi.fn();

    render(
      withProvider(
        controller,
        <TableCellFormatMenu
          cellIds={["cell-1", "cell-2"]}
          left={100}
          onClose={onClose}
          tableBlockId="table-1"
          top={100}
        />,
      ),
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color Blue" }));

    expect(controller.commands.setTableCellTextColor).toHaveBeenCalledWith(
      "table-1",
      { kind: "cells", cellIds: ["cell-1", "cell-2"] },
      "#1A73E8",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Background color None 클릭 시 null로 지운다", () => {
    const controller = fakeController();
    const onClose = vi.fn();

    render(
      withProvider(
        controller,
        <TableCellFormatMenu
          cellIds={["cell-1"]}
          left={100}
          onClose={onClose}
          tableBlockId="table-1"
          top={100}
        />,
      ),
    );

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Background color None" }),
    );

    expect(
      controller.commands.setTableCellBackgroundColor,
    ).toHaveBeenCalledWith(
      "table-1",
      { kind: "cells", cellIds: ["cell-1"] },
      null,
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("정렬 버튼", () => {
  it('Align center 클릭 시 setTableCellAlign(tableBlockId, target, "center")를 호출하고 닫는다', () => {
    const controller = fakeController();
    const onClose = vi.fn();

    render(
      withProvider(
        controller,
        <TableCellFormatMenu
          cellIds={["cell-1"]}
          left={100}
          onClose={onClose}
          tableBlockId="table-1"
          top={100}
        />,
      ),
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Align center" }));

    expect(controller.commands.setTableCellAlign).toHaveBeenCalledWith(
      "table-1",
      { kind: "cells", cellIds: ["cell-1"] },
      "center",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Align none 클릭 시 null을 넘긴다", () => {
    const controller = fakeController();

    render(
      withProvider(
        controller,
        <TableCellFormatMenu
          cellIds={["cell-1"]}
          left={100}
          onClose={vi.fn()}
          tableBlockId="table-1"
          top={100}
        />,
      ),
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Align none" }));

    expect(controller.commands.setTableCellAlign).toHaveBeenCalledWith(
      "table-1",
      { kind: "cells", cellIds: ["cell-1"] },
      null,
    );
  });
});

describe("명령 실패 시 피드백", () => {
  it("텍스트 색상 적용이 CELL_NOT_FOUND로 거절되면 메뉴를 닫지 않고 실패 메시지를 보여준다", () => {
    const base = fakeController();
    const controller = {
      ...base,
      commands: {
        ...base.commands,
        setTableCellTextColor: vi.fn(
          () =>
            ({
              ok: false,
              error: { code: "CELL_NOT_FOUND", cellId: "cell-1" },
            }) as ReturnType<
              EditorController["commands"]["setTableCellTextColor"]
            >,
        ),
      },
    };
    const onClose = vi.fn();

    render(
      withProvider(
        controller,
        <TableCellFormatMenu
          cellIds={["cell-1"]}
          left={100}
          onClose={onClose}
          tableBlockId="table-1"
          top={100}
        />,
      ),
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color Blue" }));

    expect(screen.getByRole("menu", { name: "Cell formatting" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Cell no longer exists");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("정렬 적용이 실패하면 메뉴를 닫지 않고 일반 실패 메시지를 보여준다", () => {
    const base = fakeController();
    const controller = {
      ...base,
      commands: {
        ...base.commands,
        setTableCellAlign: vi.fn(
          () =>
            ({
              ok: false,
              error: { code: "INDEX_OUT_OF_RANGE" },
            }) as ReturnType<EditorController["commands"]["setTableCellAlign"]>,
        ),
      },
    };
    const onClose = vi.fn();

    render(
      withProvider(
        controller,
        <TableCellFormatMenu
          cellIds={["cell-1"]}
          left={100}
          onClose={onClose}
          tableBlockId="table-1"
          top={100}
        />,
      ),
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Align center" }));

    expect(screen.getByRole("menu", { name: "Cell formatting" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Action failed");
    expect(onClose).not.toHaveBeenCalled();
  });
});
