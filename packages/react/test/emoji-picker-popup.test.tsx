// @vitest-environment jsdom

/**
 * EmojiPicker의 `:` 트리거 팝업 - 열기/keyword 필터링/키보드 네비게이션/선택
 * 삽입/portalTarget을 검증한다.
 */

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EMOJI_OPTIONS } from "../src/emoji-picker-options.js";
import { filterEmojiOptions } from "../src/emoji-picker.js";
import { EmojiPicker } from "../src/index.js";
import {
  type MountedBlockEditor,
  mountBlockEditor,
  placeCaret,
} from "./mount-editor.js";
import { fireSelectionChange } from "./selection-events.js";

afterEach(cleanup);

const listboxName = "Emoji picker";

/** 편집 영역에 초점을 준 채로 EmojiPicker를 얹은 편집기를 마운트한다. */
const renderCaretBlocks = () => {
  const rendered = mountBlockEditor({ children: <EmojiPicker /> });
  rendered.editable.focus();
  expect(document.activeElement).toBe(rendered.editable);
  return rendered;
};

/**
 * 블록 텍스트를 실제 명령으로 세우고 그 블록에 캐럿을 놓은 뒤 EmojiPicker에
 * selectionchange로 알린다(popup.test.tsx의 typeIntoBlock과 같은 이유 —
 * jsdom에는 타이핑→DOM 경로가 없어 setText로 재현한다).
 */
const typeIntoBlock = (rendered: MountedBlockEditor, text: string): string => {
  const blockId = rendered.blockIds[0];
  const block = rendered.blocks[0];
  if (blockId === undefined || block === undefined) {
    throw new Error("입력할 블록을 찾지 못했다");
  }
  const typed = rendered.editor.commands.setText(blockId, text);
  if (!typed.ok) throw new Error("블록 텍스트 fixture 준비 실패");
  placeCaret(block);
  fireSelectionChange();
  return blockId;
};

describe("EmojiPicker(`:` 트리거 팝업)", () => {
  it("`:쿼리` 입력 시 메뉴가 뜨고 keyword로 필터링된 항목이 순서대로 나온다", () => {
    const rendered = renderCaretBlocks();
    typeIntoBlock(rendered, ":grinning");

    const listbox = screen.getByRole("listbox", { name: listboxName });
    const expected = filterEmojiOptions(EMOJI_OPTIONS, "grinning");
    expect(expected.length).toBeGreaterThan(1);
    expect(
      within(listbox)
        .getAllByRole("option")
        .map((option) => option.getAttribute("aria-label")),
    ).toEqual(expected.map((option) => option.label));
  });

  it("`:` 단독이면 전체 목록이 뜬다", () => {
    const rendered = renderCaretBlocks();
    typeIntoBlock(rendered, ":");

    const listbox = screen.getByRole("listbox", { name: listboxName });
    expect(within(listbox).getAllByRole("option")).toHaveLength(
      EMOJI_OPTIONS.length,
    );
  });

  it("매치가 없으면 목록 대신 빈 상태 문구를 보여준다", () => {
    const rendered = renderCaretBlocks();
    typeIntoBlock(rendered, ":zzzznomatch");

    const listbox = screen.getByRole("listbox", { name: listboxName });
    expect(within(listbox).queryAllByRole("option")).toHaveLength(0);
    expect(within(listbox).getByText("No matches")).not.toBeNull();
  });

  it("`:`로 시작하지 않으면 메뉴가 뜨지 않는다", () => {
    const rendered = renderCaretBlocks();
    typeIntoBlock(rendered, "hello");

    expect(screen.queryByRole("listbox", { name: listboxName })).toBeNull();
  });

  it("항목을 클릭하면 캐럿이 있던 블록이 이모지 한 글자로 바뀌고 캐럿이 그 뒤에 남는다", () => {
    const rendered = renderCaretBlocks();
    const blockId = typeIntoBlock(rendered, ":grinning");
    const expected = filterEmojiOptions(EMOJI_OPTIONS, "grinning");
    const firstOption = expected[0];
    if (firstOption === undefined) throw new Error("fixture 준비 실패");

    fireEvent.click(screen.getByRole("option", { name: firstOption.label }));

    expect(screen.queryByRole("listbox", { name: listboxName })).toBeNull();
    expect(rendered.editor.getCaretBlockContext()).toEqual({
      blockId,
      blockType: { type: "paragraph" },
      text: firstOption.char,
    });
    expect(document.activeElement).toBe(rendered.editable);
  });

  it("Enter로 강조된 항목을 선택한다", () => {
    const rendered = renderCaretBlocks();
    const blockId = typeIntoBlock(rendered, ":grinning");
    const expected = filterEmojiOptions(EMOJI_OPTIONS, "grinning");
    const firstOption = expected[0];
    if (firstOption === undefined) throw new Error("fixture 준비 실패");

    fireEvent.keyDown(rendered.host, { key: "Enter" });

    expect(rendered.editor.getCaretBlockContext()).toEqual({
      blockId,
      blockType: { type: "paragraph" },
      text: firstOption.char,
    });
  });

  it("Escape로 닫히고 초점이 편집기로 돌아간다(텍스트는 지우지 않는다)", () => {
    const rendered = renderCaretBlocks();
    const blockId = typeIntoBlock(rendered, ":grinning");

    fireEvent.keyDown(rendered.host, { key: "Escape" });

    expect(screen.queryByRole("listbox", { name: listboxName })).toBeNull();
    expect(document.activeElement).toBe(rendered.editable);
    expect(rendered.editor.getCaretBlockContext()).toEqual({
      blockId,
      blockType: { type: "paragraph" },
      text: ":grinning",
    });
  });

  it("방향키는 grid 경계에서 clamp된다(wrap 없음)", () => {
    const rendered = renderCaretBlocks();
    typeIntoBlock(rendered, ":grinning");
    const expected = filterEmojiOptions(EMOJI_OPTIONS, "grinning");
    const lastLabel = expected[expected.length - 1]?.label;
    const firstLabel = expected[0]?.label;
    if (lastLabel === undefined || firstLabel === undefined) {
      throw new Error("fixture 준비 실패");
    }
    const overshoot = expected.length + 3;

    for (let index = 0; index < overshoot; index += 1) {
      fireEvent.keyDown(rendered.host, { key: "ArrowRight" });
    }
    expect(
      screen
        .getByRole("option", { name: lastLabel })
        .getAttribute("aria-selected"),
    ).toBe("true");

    for (let index = 0; index < overshoot; index += 1) {
      fireEvent.keyDown(rendered.host, { key: "ArrowLeft" });
    }
    expect(
      screen
        .getByRole("option", { name: firstLabel })
        .getAttribute("aria-selected"),
    ).toBe("true");

    for (let index = 0; index < overshoot; index += 1) {
      fireEvent.keyDown(rendered.host, { key: "ArrowDown" });
    }
    expect(
      screen
        .getByRole("option", { name: lastLabel })
        .getAttribute("aria-selected"),
    ).toBe("true");

    for (let index = 0; index < overshoot; index += 1) {
      fireEvent.keyDown(rendered.host, { key: "ArrowUp" });
    }
    expect(
      screen
        .getByRole("option", { name: firstLabel })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("portalTarget을 지정하면 그 요소 하위에 렌더한다", () => {
    const portalTarget = document.createElement("div");
    document.body.appendChild(portalTarget);
    const rendered = mountBlockEditor({
      children: <EmojiPicker portalTarget={portalTarget} />,
    });
    rendered.editable.focus();
    typeIntoBlock(rendered, ":grinning");

    const listbox = screen.getByRole("listbox", { name: listboxName });
    expect(portalTarget.contains(listbox)).toBe(true);
    portalTarget.remove();
  });
});
