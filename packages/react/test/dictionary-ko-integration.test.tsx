// @vitest-environment jsdom

/**
 * RD-003-DELTA-01 — `KO_DICTIONARY`(RD-003-DELTA-01)를 실제 override로 넘겼을
 * 때 서로 다른 네임스페이스가 실제 한국어로 렌더되는지 통합 스팟체크한다.
 *
 * RD-002가 override 배선 자체(214건 전부)를 이미 전량 검증했으므로 이 파일은
 * 배선을 다시 검증하지 않는다 — `KO_DICTIONARY`의 값이 정확히 대입되는지만
 * 확인한다(editor/placeholder/blockType/menu/handle/slashMenu 6개
 * 네임스페이스, `{level}` 토큰 치환 포함).
 *
 * `mountBlockEditor`(mount-editor.tsx)는 마운트 직후
 * `screen.getByRole("textbox", { name: "Editor" })`로 host를 찾는다 — 전체
 * `KO_DICTIONARY`를 그대로 넘기면 그 이름이 "편집기"로 바뀌어 헬퍼 내부
 * 조회가 깨진다. 그래서 BlockSideMenu/SlashMenu 케이스는 `editor` 네임스페이스만
 * 기본값(영어)으로 고정하고 나머지는 `KO_DICTIONARY` 그대로 넘긴다.
 * `editor.ariaLabel` 자체는 이 헬퍼를 거치지 않는 별도 마운트로 확인한다.
 */
import {
  createEditor,
  DEFAULT_DICTIONARY,
  KO_DICTIONARY,
  type HeadingBlock,
} from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BlockSideMenu } from "../src/block-side-menu.js";
import { EditorContent, EditorProvider, SlashMenu } from "../src/index.js";
import { mountBlockEditor, placeCaret } from "./mount-editor.js";
import { fireSelectionChange } from "./selection-events.js";

// block-side-menu.test.tsx와 같은 이유(jsdom에 setPointerCapture 미구현).
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}

afterEach(cleanup);

// editor 네임스페이스만 영어로 고정하고 나머지는 KO_DICTIONARY를 그대로 쓴다
// (파일 상단 설명 참고).
const koWithEnglishEditorLabel = {
  ...KO_DICTIONARY,
  editor: DEFAULT_DICTIONARY.editor,
};

describe("KO_DICTIONARY 통합 렌더(RD-003-DELTA-01)", () => {
  it("editor.ariaLabel이 한국어로 렌더된다(namespace: editor)", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [{ id: "p-1", type: "paragraph", content: [{ text: "본문" }] }],
      },
      dictionary: KO_DICTIONARY,
    });

    render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    );

    expect(screen.getByRole("textbox", { name: "편집기" })).not.toBeNull();

    editor.destroy();
  });

  it("heading placeholder의 {level} 토큰이 한국어 문구 안에서 치환된다(namespace: placeholder)", () => {
    const initialBlocks: HeadingBlock[] = [
      { id: "head-1", type: "heading", level: 1, content: [] },
      { id: "head-2", type: "heading", level: 3, content: [] },
    ];
    const editor = createEditor({
      initialDocument: { formatVersion: 1, revision: 0, blocks: initialBlocks },
      dictionary: KO_DICTIONARY,
    });

    render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    );

    const host = screen.getByRole("textbox", { name: "편집기" });
    expect(host.querySelector("h1")?.getAttribute("data-placeholder")).toBe(
      "제목 1",
    );
    expect(host.querySelector("h3")?.getAttribute("data-placeholder")).toBe(
      "제목 3",
    );

    editor.destroy();
  });

  it("BlockSideMenu의 Turn into 항목·삭제 메뉴 문구가 한국어로 렌더된다(namespace: blockType, menu, handle)", () => {
    const rendered = mountBlockEditor({
      dictionary: koWithEnglishEditorLabel,
      children: <BlockSideMenu onBlockAdded={vi.fn()} />,
    });
    const [block] = rendered.blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block);
    const handle = screen.getByRole("button", {
      name: KO_DICTIONARY.handle.dragBlock,
    });
    fireEvent.click(handle);

    expect(
      screen.getByRole("menu", { name: KO_DICTIONARY.menu.blockMenuAriaLabel }),
    ).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "본문" })).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: KO_DICTIONARY.menu.delete }),
    ).toBeTruthy();
  });

  it("SlashMenu의 table 항목 label·description이 한국어로 렌더된다(namespace: slashMenu)", () => {
    const rendered = mountBlockEditor({
      dictionary: koWithEnglishEditorLabel,
      children: <SlashMenu />,
    });
    const blockId = rendered.blockIds[0];
    const block = rendered.blocks[0];
    if (blockId === undefined || block === undefined) {
      throw new Error("입력할 블록을 찾지 못했다");
    }
    rendered.editable.focus();
    const typed = rendered.editor.commands.setText(blockId, "/table");
    if (!typed.ok) throw new Error("블록 텍스트 fixture 준비 실패");
    placeCaret(block);
    fireSelectionChange();

    const option = screen.getByRole("option", { name: /^표/ });
    expect(
      option.querySelector(".geul-slash-menu__item-label")?.textContent,
    ).toBe("표");
    expect(
      option.querySelector(".geul-slash-menu__item-description")?.textContent,
    ).toBe("표 삽입");
  });
});
