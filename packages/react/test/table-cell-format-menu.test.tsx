// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EditorController } from "@cp949/geul-core";
import { EditorProvider } from "../src/index.js";
import { TableCellFormatMenu } from "../src/table-cell-format-menu.js";

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
  } as unknown as EditorController["commands"],
});

describe("셀 서식 메뉴", () => {
  it("Text color 스와치 클릭 시 대상 셀 id 목록에 색을 적용하고 닫는다", () => {
    const controller = fakeController();
    const onClose = vi.fn();

    const view = render(
      <EditorProvider editor={controller as unknown as EditorController}>
        <TableCellFormatMenu
          cellIds={["cell-1", "cell-2"]}
          left={100}
          onClose={onClose}
          tableBlockId="table-1"
          top={100}
        />
      </EditorProvider>,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color Blue" }));

    expect(controller.commands.setTableCellTextColor).toHaveBeenCalledWith(
      "table-1",
      { kind: "cells", cellIds: ["cell-1", "cell-2"] },
      "#1A73E8",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("Background color None 클릭 시 null로 지운다", () => {
    const controller = fakeController();
    const onClose = vi.fn();

    const view = render(
      <EditorProvider editor={controller as unknown as EditorController}>
        <TableCellFormatMenu
          cellIds={["cell-1"]}
          left={100}
          onClose={onClose}
          tableBlockId="table-1"
          top={100}
        />
      </EditorProvider>,
    );

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Background color None" }),
    );

    expect(
      controller.commands.setTableCellBackgroundColor,
    ).toHaveBeenCalledWith("table-1", { kind: "cells", cellIds: ["cell-1"] }, null);
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
