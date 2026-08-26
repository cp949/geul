// @vitest-environment jsdom

import type { EditorController } from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableCellFormatMenu } from "../src/table-cell-format-menu.js";
import { withProvider } from "./fake-editor-provider.js";

// @testing-library/react는 전역 afterEach나 teardown이 함수일 때만 자동
// cleanup을 등록한다(dist/index.js의 typeof afterEach === "function" 분기와
// 그 else의 teardown fallback). vitest는 globals: true일 때만 그 전역을
// 노출하는데 저장소 루트 vitest.config.ts에는 globals도 setupFiles도 없어 자동
// cleanup이 없다(실측: 이 설정에서 둘 다 undefined). 각 it 말미의 unmount로는
// assertion이 먼저 던질 때 DOM이 남아 다음 테스트의 getByRole(...)가
// "multiple elements"로 실패한다 — 진짜 실패가 가려진다.
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

  // "Background color None 클릭 시 null로 지운다"는 팔레트 공용 컴포넌트로
  // 이관됐다(4차 아키텍처 리뷰 카드 V) — None 클릭이 null을 넘기는 동작은
  // target 종류와 무관해 table-cell-color-palettes.test.tsx가 한 번만
  // 증명한다. 위 "Text color 스와치 클릭..." 하나로 이 메뉴가 cells target을
  // 팔레트에 올바르게 전달한다는 사실만 남긴다.
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
