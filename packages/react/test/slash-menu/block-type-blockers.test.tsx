// @vitest-environment jsdom

/**
 * SlashMenu 변환 항목이 core 거절 사유(`getBlockTypeBlocker`)를 반영하는
 * 계약을 실제 편집기로 확인한다(Issue #245). 자식이 있는 블록에서는 Code
 * 항목이 나오지 않는다. 슬래시 메뉴는 codeBlock source에서 열리지 않아
 * 탭이 든 codeBlock 경로는 해당하지 않는다.
 */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SlashMenu } from "../../src/index.js";
import { mountBlockEditor } from "../mount-editor.js";
import { fireSelectionChange } from "../selection-events.js";
import { typeIntoBlock } from "./slash-menu-test-support.js";

afterEach(cleanup);

/** 열린 슬래시 메뉴 항목의 라벨 목록을 돌려준다. */
const labels = (): (string | null | undefined)[] =>
  screen
    .getAllByRole("option")
    .map(
      (option) =>
        option.querySelector(".geul-slash-menu__item-label")?.textContent,
    );

describe("SlashMenu 자식 있는 블록의 변환 항목", () => {
  it("자식이 있는 블록에서는 Code 항목이 나오지 않는다", () => {
    const rendered = mountBlockEditor({
      blockIds: ["parent", "kid"],
      children: <SlashMenu />,
    });
    rendered.editable.focus();
    const nested = rendered.editor.commands.indentBlock("kid");
    if (!nested.ok) throw new Error("자식 블록 fixture 준비 실패");

    // 자식 블록이 부모 요소 안에 있어 placeCaret은 자식에 놓인다. 명령으로
    // 부모 끝에 캐럿을 둔다.
    const typed = rendered.editor.commands.setText("parent", "/");
    const placed = rendered.editor.setTextCursorPosition("parent", "end");
    if (!typed.ok || !placed.ok) throw new Error("슬래시 fixture 준비 실패");
    fireSelectionChange();

    const items = labels();
    expect(items).not.toContain("Code");
    expect(items).toContain("Quote");
  });

  it("자식이 없는 블록에서는 Code 항목이 나온다", () => {
    const rendered = mountBlockEditor({
      initialBlocks: [
        { id: "solo", type: "paragraph", content: [{ text: "본문" }] },
      ],
      children: <SlashMenu />,
    });
    rendered.editable.focus();

    typeIntoBlock(rendered, 0, "/");

    expect(labels()).toContain("Code");
  });
});
