/* eslint-disable @typescript-eslint/no-unused-vars */
// @vitest-environment jsdom

/**
 * SlashMenu와 BlockSideMenu의 드래그 핸들 재정렬·메뉴 동작을 검증한다.
 */

import type { CodeBlock, HeadingBlock, TableBlock } from "@cp949/geul-core";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { SlashMenu } from "../../src/index.js";
import { expectIconOnlyButton } from "../expect-icon-button.js";
import { focusOutsideEditor, type MountedBlockEditor, mountBlockEditor, mountTableEditor, placeCaret } from "../mount-editor.js";
import { fireSelectionChange } from "../selection-events.js";
import { addBlockLabel, addRowLabel, blockIdsOf, dragHandleLabel, renderCaretBlocks, renderRealBlocks, typeIntoBlock } from "./slash-menu-test-support.js";

afterEach(cleanup);

if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}

describe("SlashMenu 드래그 핸들", () => {
  it("hover 시 add-block 버튼과 함께 드래그 핸들을 표시한다", () => {
    const { blocks } = renderRealBlocks();
    const [block] = blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block);

    expect(
      screen.getByRole("button", { name: dragHandleLabel }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: addBlockLabel })).not.toBeNull();
  });

  it("표 위에 hover해도 블록 거터(드래그 핸들·add-block 버튼)를 표시하지 않는다", () => {
    // 표는 table-handles.tsx가 자체 행/열 핸들을 갖는다. BlockSideMenu가
    // 표에도 반응하면 두 오버레이의 gutter가 같은 좌표 부근에 겹쳐 렌더돼
    // 실 브라우저에서 표 행 핸들 클릭이 block-side-menu의 "Add block"
    // 버튼으로 새는 결함이 있었다(e2e에서만 재현, jsdom hit-test로는 못 잡음).
    const { table } = mountTableEditor({ children: <SlashMenu /> });

    fireEvent.pointerMove(table);

    // 전제: 포인터가 살아 있는 오버레이에 실제로 닿았다 — 같은 pointermove로
    // 표 자신의 핸들은 떠야 한다. 이 단언이 없으면 아래 두 부재는 "오버레이가
    // 통째로 죽었다"로도 통과한다(Issue #62).
    expect(screen.getByRole("button", { name: addRowLabel })).not.toBeNull();
    expect(screen.queryByRole("button", { name: dragHandleLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: addBlockLabel })).toBeNull();
  });

  it("따옴표·백슬래시가 든 블록 id에서도 hover 거터가 크래시 없이 표시된다", () => {
    // 블록 id는 z.string() 임의 문자열이라 attribute selector에 보간하면
    // 따옴표·백슬래시에서 querySelector가 SyntaxError를 던진다.
    const { blocks } = renderRealBlocks({ blockIds: ['a"b\\c'] });
    const [block] = blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");
    // 전제: 특수문자 id가 실제로 DOM 속성까지 그대로 내려갔다 — 그래야 이
    // 테스트가 노리는 selector 위험이 존재한다.
    expect(block.getAttribute("data-be-block-id")).toBe('a"b\\c');

    fireEvent.pointerMove(block);

    expect(screen.getByRole("button", { name: addBlockLabel })).not.toBeNull();
  });

  it("드래그 핸들과 블록 추가 버튼에 aria-hidden 아이콘과 title을 부여한다", () => {
    const { blocks } = renderRealBlocks();
    const [block] = blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");
    fireEvent.pointerMove(block);

    const expectedButtons = [
      { label: dragHandleLabel, iconClass: "lucide-grip-vertical" },
      { label: addBlockLabel, iconClass: "lucide-plus" },
    ];
    for (const { label, iconClass } of expectedButtons) {
      expectIconOnlyButton(
        screen.getByRole("button", { name: label }),
        label,
        iconClass,
      );
    }
  });

  it("핸들을 드래그해 다른 블록 앞에 놓으면 삽입 가이드를 표시하고 moveBlockBefore를 호출한다", () => {
    const rendered = renderRealBlocks({
      blockIds: ["block-1", "block-2", "block-3"],
    });
    const { blockIds, blocks, editable } = rendered;
    const block3 = blocks[2];
    if (block3 === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block3);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    // block-2 상반부(25 < 20 + 20/2)를 겨냥한다 — block-3의 바로 위 형제라
    // 인접 형제 재정렬로 남는다(Issue #38 슬라이스7 DELTA-03). 세로 좌표만
    // 준 이유: 이 fixture에는 표가 없어 TableHandles의 hover 여백
    // (HANDLE_HOVER_MARGIN) 판정이 없고, BlockSideMenu의 삽입 지점 계산은
    // clientY만 읽는다. block-1(2칸 비인접)을 겨냥하면 DELTA-03의 2단계
    // 드래그가 range-select로 전환해 삽입 가이드가 뜨지 않는다.
    fireEvent.pointerMove(editable, { pointerId: 1, clientY: 25 });

    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).not.toBeNull();

    fireEvent.pointerUp(editable, { pointerId: 1 });

    // 실제 moveBlockBefore(block-3, block-2)이 돌았음을 블록 순서로 본다 —
    // 개수만 세면 어느 블록이 움직였는지 구분하지 못한다.
    expect(blockIdsOf(rendered)).toEqual([
      blockIds[0],
      blockIds[2],
      blockIds[1],
    ]);
  });

  it("자기 자신의 현재 위치로 드래그하면 moveBlockBefore를 호출하지 않는다", () => {
    const rendered = renderRealBlocks({
      blockIds: ["block-1", "block-2"],
    });
    const { blocks, editor } = rendered;
    const documentBeforeDrag = editor.getDocument();
    const block1 = blocks[0];
    if (block1 === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block1);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    // 드래그 중 포인터 이벤트는 핸들에 쏜다. BlockSideMenu가 pointerdown에서
    // setPointerCapture를 걸므로 실제 브라우저에서도 이후 pointermove는 전부
    // 핸들로 재타깃된다. 편집 영역에 쏘면 hover 거터가 내려가 아래 "메뉴가
    // 열리지 않는다"가 클릭 억제가 아니라 거터 부재로 통과한다(Issue #62).
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 5 });
    // 목표 인덱스가 출발 인덱스와 같아 삽입 가이드가 그려지지 않는다
    // (block-side-menu.tsx의 isNoop). 이 단언이 억제를 짚는 유일한 관측점이다
    // — 아래 문서 불변은 실제 컨트롤러도 제자리 moveBlockBefore를
    // COMMAND_NOT_APPLICABLE로 되돌리기 때문에(editor-controller.ts) 오버레이가
    // 억제했는지 컨트롤러가 거절했는지 구분하지 못한다. 여기서 hasDragged는
    // 이미 참이므로(hypot(0, 5) = 5 ≥ 4) 이 부재는 isNoop 분기만을 짚는다 —
    // "드래그가 시작조차 안 됐다"와 섞이지 않는다.
    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).toBeNull();
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(screen.getByRole("button", { name: dragHandleLabel })).toBe(handle);
    fireEvent.click(handle, { detail: 1 });

    // 커맨드가 나갔더라도 문서는 그대로다 — 위 가이드 부재를 보강하는 단언이다.
    expect(editor.getDocument()).toEqual(documentBeforeDrag);
    expect(screen.queryByRole("menu", { name: "Block menu" })).toBeNull();
  });

  it("Escape로 드롭 없이 드래그를 취소하면 아무 명령도 호출하지 않는다", async () => {
    const rendered = renderRealBlocks({
      blockIds: ["block-1", "block-2"],
    });
    const { blocks, editor } = rendered;
    const documentBeforeDrag = editor.getDocument();
    const block2 = blocks[1];
    if (block2 === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block2);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 5 });
    // 전제: 취소 전에는 드래그가 실제로 진행 중이고 삽입 지점도 잡혔다.
    // 이 단언이 없으면 아래 부재는 "드래그가 시작조차 안 됐다"로도 통과한다.
    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).toBeNull();

    fireEvent.pointerUp(handle, { pointerId: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // 핸들 위에서만 포인터를 움직였으므로 거터는 그대로 떠 있다 — click이
    // 문서에서 떨어진 노드로 새지 않았음을 고정한다(Issue #62).
    expect(screen.getByRole("button", { name: dragHandleLabel })).toBe(handle);
    fireEvent.click(handle, { detail: 1 });

    expect(editor.getDocument()).toEqual(documentBeforeDrag);
    expect(screen.queryByRole("menu", { name: "Block menu" })).toBeNull();
  });

  it("pointercancel 뒤 후속 click이 블록 메뉴를 열지 않는다", async () => {
    const rendered = renderRealBlocks({
      blockIds: ["block-1", "block-2"],
    });
    const { blocks, editor } = rendered;
    const documentBeforeDrag = editor.getDocument();
    const block2 = blocks[1];
    if (block2 === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block2);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 5 });
    // 전제: 취소 전에는 드래그가 실제로 진행 중이었다.
    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).not.toBeNull();
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByRole("button", { name: dragHandleLabel })).toBe(handle);
    fireEvent.click(handle, { detail: 1 });

    expect(editor.getDocument()).toEqual(documentBeforeDrag);
    expect(screen.queryByRole("menu", { name: "Block menu" })).toBeNull();
  });

  it("드래그를 시작한 pointer와 다른 pointer 이벤트는 무시한다", () => {
    const rendered = renderRealBlocks({
      blockIds: ["block-1", "block-2", "block-3"],
    });
    const { blockIds, blocks, editable, editor } = rendered;
    const documentBeforeDrag = editor.getDocument();
    const block3 = blocks[2];
    if (block3 === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block3);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 0,
      clientY: 50,
    });
    // block-2 상반부(25 < 20 + 20/2, block-3의 인접 형제)를 겨냥한다 —
    // block-1(2칸 비인접)을 겨냥하면 DELTA-03의 2단계 드래그가 range-select로
    // 전환해 무시된 pointerId 검증과 무관하게 삽입 가이드가 뜨지 않는다.
    fireEvent.pointerMove(editable, { pointerId: 2, clientX: 0, clientY: 25 });
    fireEvent.pointerUp(editable, { pointerId: 2 });

    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).toBeNull();
    expect(editor.getDocument()).toEqual(documentBeforeDrag);

    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 0, clientY: 25 });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    // 같은 pointerId로 다시 끌면 재정렬이 커밋된다 — 위 두 부재가 "드래그가
    // 처음부터 죽어 있었다"로 통과하지 않음을 이 성공 경로가 고정한다.
    expect(blockIdsOf(rendered)).toEqual([
      blockIds[0],
      blockIds[2],
      blockIds[1],
    ]);
  });
});
