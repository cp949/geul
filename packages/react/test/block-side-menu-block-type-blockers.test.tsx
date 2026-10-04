// @vitest-environment jsdom

/**
 * BlockSideMenu Turn into가 core 거절 사유(`getBlockTypeBlocker`)를 반영하는
 * 계약을 실제 편집기로 확인한다(Issue #245).
 * - 자식이 있는 블록은 Code 항목이 없다.
 * - 탭이 든 codeBlock은 고를 항목이 없어 Turn into 섹션이 없다.
 */
import type { Block } from "@cp949/geul-core";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BlockSideMenu } from "../src/block-side-menu.js";
import { mountBlockEditor } from "./mount-editor.js";

if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}

afterEach(cleanup);

const dragHandleLabel = "Drag to reorder, click for options";

/** 첫 블록 위에 포인터를 올리고 드래그 핸들을 눌러 블록 메뉴를 연다. */
const openFirstBlockMenu = (initialBlocks: Block[]) => {
  const rendered = mountBlockEditor({
    initialBlocks,
    children: <BlockSideMenu onBlockAdded={vi.fn()} />,
  });
  const [block] = rendered.blocks;
  if (block === undefined) throw new Error("블록 요소가 없다");
  fireEvent.pointerMove(block);
  fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));
  return rendered;
};

describe("BlockSideMenu Turn into 거절 사유 반영", () => {
  it("자식이 있는 블록은 Code 항목을 빼고 나머지는 남긴다", () => {
    const rendered = mountBlockEditor({
      blockIds: ["parent", "kid"],
      children: <BlockSideMenu onBlockAdded={vi.fn()} />,
    });
    const nested = rendered.editor.commands.indentBlock("kid");
    if (!nested.ok) throw new Error("자식 블록 fixture 준비 실패");
    const parent = rendered
      .restubGeometry()
      .find((block) => block.getAttribute("data-geul-block-id") === "parent");
    if (parent === undefined) throw new Error("부모 블록 요소가 없다");
    fireEvent.pointerMove(parent);
    fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));

    expect(screen.queryByRole("menuitem", { name: "Code" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Quote" })).toBeTruthy();
  });

  it("자식이 없는 블록은 Code 항목이 남는다", () => {
    openFirstBlockMenu([
      { id: "solo", type: "paragraph", content: [{ text: "본문" }] },
    ]);

    expect(screen.getByRole("menuitem", { name: "Code" })).toBeTruthy();
  });

  it("탭이 든 codeBlock은 Turn into 섹션을 그리지 않는다", () => {
    openFirstBlockMenu([
      {
        id: "code",
        type: "codeBlock",
        language: "text",
        content: [{ text: "if (x) {\n\treturn 1;\n}" }],
      },
    ]);

    expect(screen.queryByText("Turn into")).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Quote" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Text" })).toBeNull();
    // 같은 메뉴의 다른 섹션은 그대로 남는다.
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
  });

  it("탭이 없는 codeBlock은 Turn into 섹션이 남는다", () => {
    openFirstBlockMenu([
      {
        id: "code",
        type: "codeBlock",
        language: "text",
        content: [{ text: "return 1;" }],
      },
    ]);

    expect(screen.getByText("Turn into")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Quote" })).toBeTruthy();
  });
});
