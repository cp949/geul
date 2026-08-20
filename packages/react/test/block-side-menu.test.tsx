// @vitest-environment jsdom

import type { EditorController } from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BlockSideMenu } from "../src/block-side-menu.js";
import { EditorContent, EditorProvider } from "../src/index.js";

// vitest.config.ts에 globals도 setupFiles도 없어 자동 cleanup이 없다. 각 it
// 말미의 unmount로는 assertion이 먼저 던질 때 DOM이 남아 다음 테스트의
// getByRole("menu")가 "multiple elements"로 실패한다 — 진짜 실패가 가려진다.
// use-dismiss-on-outside-or-escape.test.tsx와 같은 afterEach(cleanup)을 쓴다.
afterEach(cleanup);

const dragHandleLabel = "Drag to reorder, click for options";

const fakeController = () => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    // 실제 브라우저와 달리 jsdom은 contentEditable IDL 프로퍼티를
    // contenteditable 속성으로 반영하지 않는다. block-side-menu.tsx:80의
    // focusEditor는 '[contenteditable="true"]'로 대상을 찾으므로, 속성을 직접
    // 세우지 않으면 초점 복구가 단위 테스트에서 조용히 no-op가 된다.
    editable.setAttribute("contenteditable", "true");
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

// EditorContent가 그리는 role="textbox" 노드는 마운트 host이고, 컨트롤러가
// 그 안에 contenteditable 자식을 넣는다. focusEditor가 초점을 주는 대상은
// 후자이므로 초점을 단언하는 테스트가 단언할 노드도 후자다.
const renderBlockMenu = (controller: ReturnType<typeof fakeController>) => {
  render(
    withProvider(
      controller,
      <>
        <BlockSideMenu onBlockAdded={vi.fn()} />
        <EditorContent />
      </>,
    ),
  );
  const host = screen.getByRole("textbox", { name: "Editor" });
  const editable = host.querySelector<HTMLElement>('[contenteditable="true"]');
  if (editable === null) throw new Error("Editable was not mounted");
  const block = editable.querySelector<HTMLElement>("[data-be-block-id]");
  if (block === null) throw new Error("Block was not rendered");
  return { editable, block };
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
  it("Escape로 메뉴를 닫고 편집기로 초점을 되돌린다", () => {
    const controller = fakeController();
    const { editable } = openBlockMenu(controller);
    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    // 바깥 클릭과 달리 Escape는 돌아갈 클릭 대상이 없어 초점을 편집기로
    // 되돌린다(PIT-0013). onEscapeDismiss가 onOutsideDismiss로 잘못 연결되면
    // 초점은 그대로 body에 남아 이 단언이 실패한다.
    expect(document.activeElement).toBe(editable);
  });

  it("메뉴 바깥을 클릭하면 초점을 강제로 옮기지 않고 메뉴만 닫는다", () => {
    const controller = fakeController();
    openBlockMenu(controller);
    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();

    const outsideButton = document.createElement("button");
    outsideButton.textContent = "outside";
    document.body.append(outsideButton);
    outsideButton.focus();

    try {
      fireEvent.pointerDown(outsideButton);

      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(outsideButton);
    } finally {
      outsideButton.remove();
    }
  });

  it("메뉴 안(data-be-block-menu)을 클릭하면 닫히지 않는다", () => {
    const controller = fakeController();
    openBlockMenu(controller);

    const menu = screen.getByRole("menu", { name: "Block menu" });
    fireEvent.pointerDown(menu);

    expect(screen.queryByRole("menu")).not.toBeNull();
  });
});

describe("블록 메뉴 열기/토글과 항목 액션(종류 변경/복제/삭제)", () => {
  it("핸들 클릭 시 종류 변경/복제/삭제 메뉴를 연다", () => {
    openBlockMenu(fakeController());

    expect(screen.getByRole("menu", { name: "Block menu" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Heading 1" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Delete" })).not.toBeNull();
  });

  it("같은 핸들을 다시 클릭하면 메뉴를 닫는다", () => {
    openBlockMenu(fakeController());

    fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("종류 변경 항목을 클릭하면 setBlockType을 호출하고 메뉴를 닫으며 편집기로 초점을 되돌린다", () => {
    const controller = fakeController();
    const { editable } = openBlockMenu(controller);

    fireEvent.click(screen.getByRole("menuitem", { name: "Heading 2" }));

    expect(controller.commands.setBlockType).toHaveBeenCalledWith("block-1", {
      type: "heading",
      level: 2,
    });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("복제 항목을 클릭하면 duplicateBlock을 호출하고 메뉴를 닫으며 편집기로 초점을 되돌린다", () => {
    const controller = fakeController();
    const { editable } = openBlockMenu(controller);

    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    expect(controller.commands.duplicateBlock).toHaveBeenCalledWith("block-1");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("삭제 항목을 클릭하면 deleteBlock을 호출하고 메뉴를 닫으며 편집기로 초점을 되돌린다", () => {
    const controller = fakeController();
    const { editable } = openBlockMenu(controller);

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(controller.commands.deleteBlock).toHaveBeenCalledWith("block-1");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });
});
