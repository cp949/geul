/* eslint-disable @typescript-eslint/no-unused-vars */
// @vitest-environment jsdom

/**
 * SlashMenu와 BlockSideMenu의 블록 추가 버튼 동작을 검증한다.
 */

import type { CodeBlock, HeadingBlock, TableBlock } from "@cp949/geul-core";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { SlashMenu } from "../../src/index.js";
import { expectIconOnlyButton } from "../expect-icon-button.js";
import {
  focusOutsideEditor,
  type MountedBlockEditor,
  mountBlockEditor,
  mountTableEditor,
  placeCaret,
} from "../mount-editor.js";
import { fireSelectionChange } from "../selection-events.js";
import {
  addBlockLabel,
  addRowLabel,
  blockIdsOf,
  dragHandleLabel,
  renderCaretBlocks,
  renderRealBlocks,
  typeIntoBlock,
} from "./slash-menu-test-support.js";

afterEach(cleanup);

describe("SlashMenu 블록 추가 버튼", () => {
  it("hover하지 않으면 블록 추가 버튼을 렌더링하지 않는다", () => {
    const { blocks } = renderRealBlocks();
    const [block] = blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");

    expect(screen.queryByRole("button", { name: addBlockLabel })).toBeNull();

    // liveness는 부재를 측정한 "뒤에" 고정한다. hover를 먼저 쏘면 이 테스트가
    // 세우려는 상태(한 번도 hover하지 않음)가 사라지지만, 이미 읽어낸 부재
    // 뒤에 쏘는 hover는 그 상태를 건드리지 않는다. 이 단언이 없으면 위 부재는
    // "거터가 통째로 죽어 있다"로도 통과한다(Issue #62).
    fireEvent.pointerMove(block);

    expect(screen.getByRole("button", { name: addBlockLabel })).not.toBeNull();
  });

  it("블록에 hover하면 블록 추가 버튼을 표시한다", () => {
    const { blocks } = renderRealBlocks();
    const [block] = blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block);

    expect(screen.getByRole("button", { name: addBlockLabel })).not.toBeNull();
  });

  it("포인터가 버튼 위로 이동하는 동안에도 블록 추가 버튼을 계속 표시한다", () => {
    const { blocks } = renderRealBlocks();
    const [block] = blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");
    fireEvent.pointerMove(block);
    const addBlockButton = screen.getByRole("button", { name: addBlockLabel });

    fireEvent.pointerMove(addBlockButton);

    expect(screen.getByRole("button", { name: addBlockLabel })).not.toBeNull();
  });

  it("hover한 블록 뒤에 문단을 삽입하고 그 블록의 메뉴를 연다", () => {
    const rendered = renderRealBlocks();
    const [block] = rendered.blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");
    // 전제: 문서에 문단이 하나뿐이다 — 삽입 결과를 순서로 볼 수 있어야 한다.
    expect(blockIdsOf(rendered)).toEqual(rendered.blockIds);
    fireEvent.pointerMove(block);

    fireEvent.click(screen.getByRole("button", { name: addBlockLabel }));

    // 실제 insertParagraphAfter가 hover한 블록 바로 뒤에 문단을 넣었다.
    const blocks = rendered.editor.getDocument().blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.id).toBe(rendered.blockIds[0]);
    const inserted = blocks[1];
    if (inserted?.type !== "paragraph") throw new Error("새 문단이 아니다");
    expect(inserted.content).toEqual([]);
    expect(screen.getByRole("listbox", { name: "Slash menu" })).not.toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(25);

    // 메뉴가 "그 블록"으로 열렸는지는 캐럿 갱신 한 번으로 갈린다. 실제
    // insertParagraphAfter는 캐럿을 새 문단으로 옮기므로(전제), 메뉴가 hover한
    // 옛 블록으로 열렸다면 여기서 blockId가 어긋나 곧바로 닫힌다 — 옛 블록의
    // 텍스트("본문")는 슬래시 질의가 아니기 때문이다.
    expect(rendered.editor.getCaretBlockContext()?.blockId).toBe(inserted.id);
    fireSelectionChange();
    expect(screen.getByRole("listbox", { name: "Slash menu" })).not.toBeNull();
  });

  it("슬래시가 아닌 문자를 입력한 뒤에는 메뉴를 다시 열지 않는다", () => {
    const rendered = renderRealBlocks();
    const [block] = rendered.blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");
    fireEvent.pointerMove(block);
    fireEvent.click(screen.getByRole("button", { name: addBlockLabel }));
    expect(screen.getByRole("listbox")).not.toBeNull();
    const inserted = rendered.editor.getDocument().blocks[1];
    if (inserted === undefined) throw new Error("새 문단이 없다");
    // 전제: 실제 insertParagraphAfter가 캐럿을 새 문단으로 옮겼다 — 아래
    // 입력이 그 블록의 텍스트로 읽히는 근거다.
    expect(rendered.editor.getCaretBlockContext()?.blockId).toBe(inserted.id);

    const typed = rendered.editor.commands.setText(inserted.id, "a");
    if (!typed.ok) throw new Error("입력 fixture 준비 실패");
    fireSelectionChange();

    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
