// @vitest-environment jsdom

import type { EditorController } from "@cp949/geul-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BlockSideMenu } from "../src/block-side-menu.js";
import { EditorContent, EditorProvider } from "../src/index.js";

const dragHandleLabel = "Drag to reorder, click for options";

const fakeController = () => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    const block = document.createElement("p");
    block.setAttribute("data-be-block-id", "block-1");
    block.textContent = "block text";
    editable.append(block);
    element.append(editable);
  }),
  unmount: vi.fn(),
  commands: {
    insertParagraphAfter: vi.fn(() => ({
      ok: true,
      value: { blockId: "new-block" },
    })),
    setBlockType: vi.fn(() => ({ ok: true, value: undefined })),
    moveBlockBefore: vi.fn(() => ({ ok: true, value: undefined })),
    duplicateBlock: vi.fn(() => ({
      ok: true,
      value: { blockId: "new-block" },
    })),
    deleteBlock: vi.fn(() => ({ ok: true, value: undefined })),
  },
});

const withProvider = (
  controller: ReturnType<typeof fakeController>,
  children: React.ReactNode,
) => (
  <EditorProvider editor={controller as unknown as EditorController}>
    {children}
  </EditorProvider>
);

const renderBlockMenu = (controller: ReturnType<typeof fakeController>) => {
  const onBlockAdded = vi.fn();
  const view = render(
    withProvider(
      controller,
      <>
        <BlockSideMenu onBlockAdded={onBlockAdded} />
        <EditorContent />
      </>,
    ),
  );
  const editable = screen.getByRole("textbox", { name: "Editor" });
  const block = editable.querySelector<HTMLElement>("[data-be-block-id]");
  if (block === null) throw new Error("Block was not rendered");
  return { view, editable, block, onBlockAdded };
};

// 핸들을 hover -> click해 블록 메뉴를 연다. pointerDown/pointerUp 드래그
// 시퀀스 없이도 동작한다 — handleHandleClick의 가드는
// `event.detail !== 0 && suppressedHandleClickBlockIdRef.current === blockId`이고,
// 이 ref의 초기값은 null이라 fireEvent.click(기본 detail: 0)만으로 가드가
// 항상 거짓이 되어 click이 곧바로 메뉴 열기로 처리된다. (table-handles.test.tsx의
// openRowMenu가 pointerDown/pointerUp을 먼저 거치는 것은 같은 describe 블록의
// 드래그 테스트들과 문체를 맞춘 관례일 뿐, table-handles.tsx의 동일한 가드
// 구조상 필수는 아니다.)
const openBlockMenu = (controller: ReturnType<typeof fakeController>) => {
  const rendered = renderBlockMenu(controller);
  fireEvent.pointerMove(rendered.block);
  const handle = screen.getByRole("button", { name: dragHandleLabel });
  fireEvent.click(handle);
  return rendered;
};

describe("블록 메뉴 바깥 클릭/Escape 닫기", () => {
  it("Escape로 메뉴를 닫는다", () => {
    const controller = fakeController();
    const { view } = openBlockMenu(controller);
    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    view.unmount();
  });

  it("메뉴 바깥을 클릭하면 초점을 강제로 옮기지 않고 메뉴만 닫는다", () => {
    const controller = fakeController();
    const { view } = openBlockMenu(controller);

    const outsideButton = document.createElement("button");
    outsideButton.textContent = "outside";
    document.body.append(outsideButton);
    outsideButton.focus();

    fireEvent.pointerDown(outsideButton);

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(outsideButton);
    outsideButton.remove();
    view.unmount();
  });

  it("메뉴 안(data-be-block-menu)을 클릭하면 닫히지 않는다", () => {
    const controller = fakeController();
    const { view } = openBlockMenu(controller);

    const menu = screen.getByRole("menu", { name: "Block menu" });
    fireEvent.pointerDown(menu);

    expect(screen.queryByRole("menu")).not.toBeNull();
    view.unmount();
  });
});
