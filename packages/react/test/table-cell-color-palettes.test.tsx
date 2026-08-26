// @vitest-environment jsdom

/**
 * TableCellColorPalettes: 표 셀 글자색·배경색 팔레트 공용 컴포넌트. 4차
 * 아키텍처 리뷰 카드 V — TableHandleMenu(행/열 대상)와
 * TableCellFormatMenu(셀 목록 대상)가 각자 손으로 유지하던 applyColor·
 * renderPalette 39줄을 이 컴포넌트 하나로 모았다. 두 메뉴가 이미 자기
 * useTableCommandFeedback()의 runCommand를 넘겨준다는 전제라, 여기서는
 * runCommand 자체를 대역(스텁)으로 세워 "받은 target·color로 정확히 어떤
 * 명령을 부르는지"와 "성공/실패에 따라 onApplied 호출 여부가 갈리는지"만
 * 증명한다. 알림 표시(role="alert")는 이 컴포넌트의 책임이 아니라 감싸는
 * 메뉴의 책임이라 여기서 검증하지 않는다(table-handle-menu.test.tsx·
 * table-cell-format-menu.test.tsx가 각자 계속 증명한다).
 */

import type { EditorController } from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TableCellColorPalettes } from "../src/table-cell-color-palettes.js";
import { withProvider } from "./fake-editor-provider.js";

afterEach(cleanup);

const fakeController = () => ({
  mount: vi.fn(),
  unmount: vi.fn(),
  destroy: vi.fn(),
  commands: {
    setTableCellTextColor: vi.fn(() => ({ ok: true, value: undefined })),
    setTableCellBackgroundColor: vi.fn(() => ({ ok: true, value: undefined })),
  } as unknown as EditorController["commands"],
});

/** 실제 useTableCommandFeedback과 같은 모양(run→성공이면 onSuccess 호출)의 최소 대역이다. */
const runCommandStub = (run: () => { ok: boolean }, onSuccess?: () => void) => {
  if (run().ok) onSuccess?.();
};

describe("TableCellColorPalettes", () => {
  it("글자색 스와치 클릭 시 넘겨받은 target·색으로 setTableCellTextColor를 호출하고 onApplied를 부른다", () => {
    const controller = fakeController();
    const onApplied = vi.fn();

    render(
      withProvider(
        controller,
        <TableCellColorPalettes
          onApplied={onApplied}
          runCommand={runCommandStub}
          tableBlockId="table-1"
          target={{ kind: "row", index: 2 }}
        />,
      ),
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color Blue" }));

    expect(controller.commands.setTableCellTextColor).toHaveBeenCalledWith(
      "table-1",
      { kind: "row", index: 2 },
      "#1A73E8",
    );
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it("배경색 None 클릭 시 대상 셀 목록에 null을 넘긴다", () => {
    const controller = fakeController();

    render(
      withProvider(
        controller,
        <TableCellColorPalettes
          onApplied={vi.fn()}
          runCommand={runCommandStub}
          tableBlockId="table-1"
          target={{ kind: "cells", cellIds: ["cell-1", "cell-2"] }}
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
      { kind: "cells", cellIds: ["cell-1", "cell-2"] },
      null,
    );
  });

  it("runCommand가 실패로 판단하면 onApplied를 호출하지 않는다", () => {
    // onApplied를 무조건 호출하는 회귀(runCommand의 onSuccess 계약을 어기고
    // 색상 적용 클릭마다 곧바로 onApplied를 부르는 실수)를 잡는다 — 실패
    // 시에도 onApplied가 불리면 메뉴가 실패했는데도 닫혀버린다(Issue #18의
    // "실패하면 메뉴를 닫지 않는다" 계약과 같은 종류).
    const controller = fakeController();
    const failingRunCommand = (run: () => { ok: boolean }) => {
      run();
      // 실패로 취급한다 — 성공 분기(onSuccess)를 절대 타지 않는다.
    };
    const onApplied = vi.fn();

    render(
      withProvider(
        controller,
        <TableCellColorPalettes
          onApplied={onApplied}
          runCommand={failingRunCommand}
          tableBlockId="table-1"
          target={{ kind: "column", index: 0 }}
        />,
      ),
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color Red" }));

    expect(controller.commands.setTableCellTextColor).toHaveBeenCalledTimes(1);
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("Text/Background 두 섹션 모두 팔레트 8색 + None을 렌더한다", () => {
    const controller = fakeController();

    render(
      withProvider(
        controller,
        <TableCellColorPalettes
          onApplied={vi.fn()}
          runCommand={runCommandStub}
          tableBlockId="table-1"
          target={{ kind: "row", index: 0 }}
        />,
      ),
    );

    expect(screen.getByText("Text color")).toBeTruthy();
    expect(screen.getByText("Background color")).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Text color None" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Background color None" }),
    ).toBeTruthy();
    // 색상 메뉴 항목 수: (8색 + None) × 2섹션 = 18.
    expect(screen.getAllByRole("menuitem")).toHaveLength(18);
  });
});
