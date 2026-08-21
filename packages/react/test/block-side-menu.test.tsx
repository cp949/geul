// @vitest-environment jsdom

/**
 * BlockSideMenu 컴포넌트: 드래그 핸들 hover -> click으로 블록 메뉴(종류
 * 변경/복제/삭제)를 열고, 바깥 클릭·Escape·같은 핸들 재클릭으로 닫는 동작을
 * 검증한다.
 *
 * 모든 describe가 실제 createEditor() 마운트 위에서 돈다(Issue #76) — 손으로
 * 조립한 fake 컨트롤러/DOM 레인은 남아 있지 않다. 명령이 진짜라 호출 스파이
 * 대신 문서 결과를 단언한다. `<BlockSideMenu />`는 `<SlashMenu />`를 거치지
 * 않고 직접 마운트한다(Issue #59) — hover 거터의 add-block 버튼 클릭 경로는
 * slash-menu.test.tsx가 다룬다.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BlockSideMenu } from "../src/block-side-menu.js";
import { mountBlockEditor } from "./mount-editor.js";

// vitest.config.ts에 globals도 setupFiles도 없어 자동 cleanup이 없다. 각 it
// 말미의 unmount로는 assertion이 먼저 던질 때 DOM이 남아 다음 테스트의
// getByRole("menu")가 "multiple elements"로 실패한다 — 진짜 실패가 가려진다.
// slash-menu.test.tsx와 같은 afterEach(cleanup)을 쓴다.
afterEach(cleanup);

const dragHandleLabel = "Drag to reorder, click for options";

/**
 * 실제 편집기를 마운트하고 BlockSideMenu를 얹는다. onBlockAdded는 이 파일의
 * 8개 테스트가 검증하는 대상이 아니다 — 블록 추가 버튼 클릭 경로(hover 거터의
 * add-block 버튼)는 slash-menu.test.tsx가 다룬다. 여기서는 컴포넌트가 요구하는
 * 필수 prop을 채우는 자리표시자로만 쓴다.
 */
const renderBlockMenu = (options?: { blockIds?: readonly string[] }) =>
  mountBlockEditor({
    ...options,
    children: <BlockSideMenu onBlockAdded={vi.fn()} />,
  });

/**
 * 핸들을 hover -> click해 첫 번째 블록의 메뉴를 연다. pointerDown/pointerUp
 * 드래그 시퀀스 없이도 동작한다 — handleHandleClick의 가드는
 * `event.detail !== 0 && suppressedHandleClickBlockIdRef.current === blockId`이고,
 * 이 ref의 초기값은 null이라 fireEvent.click(기본 detail: 0)만으로 가드가
 * 항상 거짓이 되어 click이 곧바로 메뉴 열기로 처리된다. (table-handles.test.tsx의
 * openRowMenu가 pointerDown/pointerUp을 먼저 거치는 것은 같은 describe 블록의
 * 드래그 테스트들과 문체를 맞춘 관례일 뿐, table-handles.tsx의 동일한 가드
 * 구조상 필수는 아니다.)
 */
const openBlockMenu = (options?: { blockIds?: readonly string[] }) => {
  const rendered = renderBlockMenu(options);
  const [block] = rendered.blocks;
  if (block === undefined) throw new Error("블록 요소가 없다");
  fireEvent.pointerMove(block);
  const handle = screen.getByRole("button", { name: dragHandleLabel });
  fireEvent.click(handle);
  return rendered;
};

describe("블록 메뉴 바깥 클릭/Escape 닫기", () => {
  it("Escape로 메뉴를 닫고 편집기로 초점을 되돌린다", () => {
    const rendered = openBlockMenu();
    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    // 바깥 클릭과 달리 Escape는 돌아갈 클릭 대상이 없어 초점을 편집기로
    // 되돌린다(PIT-0013). onEscapeDismiss가 onOutsideDismiss로 잘못 연결되면
    // 초점은 그대로 body에 남아 이 단언이 실패한다.
    expect(document.activeElement).toBe(rendered.editable);
  });

  it("메뉴 바깥을 클릭하면 초점을 강제로 옮기지 않고 메뉴만 닫는다", () => {
    openBlockMenu();
    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();

    // 편집기 바깥 요소는 편집기가 만들지 않는다 — 실제 마운트로도 대신할
    // 수 없는 유일한 조립이라 여기서 직접 만든다.
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
    openBlockMenu();

    const menu = screen.getByRole("menu", { name: "Block menu" });
    fireEvent.pointerDown(menu);

    expect(screen.queryByRole("menu")).not.toBeNull();
  });
});

describe("블록 메뉴 열기/토글과 항목 액션(종류 변경/복제/삭제)", () => {
  it("핸들 클릭 시 종류 변경/복제/삭제 메뉴를 연다", () => {
    openBlockMenu();

    expect(screen.getByRole("menu", { name: "Block menu" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Heading 1" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Delete" })).not.toBeNull();
  });

  it("같은 핸들을 다시 클릭하면 메뉴를 닫는다", () => {
    openBlockMenu();
    // 전제: 재클릭 전에는 메뉴가 실제로 열려 있다. openBlockMenu 내부의
    // getByRole("button", { name: dragHandleLabel })는 hover 거터의 핸들
    // 버튼(block-side-menu.tsx:331-347)을 찾을 뿐 메뉴 팝업(:379-427)과는
    // 다른 요소라 첫 클릭이 메뉴를 열지 못해도 그 조회는 그대로 성공한다.
    // 이 단언이 없으면 아래 부재는 "핸들 클릭이 메뉴를 아예 못 연다"로도
    // 통과한다(Issue #62).
    expect(screen.getByRole("menu", { name: "Block menu" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("종류 변경 항목을 클릭하면 setBlockType을 호출하고 메뉴를 닫으며 편집기로 초점을 되돌린다", () => {
    const rendered = openBlockMenu();
    const before = rendered.editor.getDocument().blocks[0];
    if (before?.type !== "paragraph") throw new Error("본문 문단이 아니다");

    fireEvent.click(screen.getByRole("menuitem", { name: "Heading 2" }));

    // 실제 setBlockType(blockId, {type:"heading", level:2})가 돌았음을
    // 문서로 본다 — 스파이는 명령이 아무것도 하지 않아도 통과한다.
    const after = rendered.editor.getDocument().blocks[0];
    if (after?.type !== "heading") throw new Error("제목 블록이 아니다");
    expect(after.id).toBe(before.id);
    expect(after.level).toBe(2);
    // handleTurnInto는 clearContent 옵션 없이 호출한다 — 트리거로 쓴
    // 본문 텍스트가 그대로 남는다(SlashMenu의 clearContent:true 경로와 다르다).
    expect(after.content).toEqual(before.content);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(rendered.editable);
  });

  it("복제 항목을 클릭하면 duplicateBlock을 호출하고 메뉴를 닫으며 편집기로 초점을 되돌린다", () => {
    const rendered = openBlockMenu();
    // 전제: 복제 전에는 블록이 하나뿐이다 — 그래야 아래서 찾는 두 번째
    // 블록이 정말 복제로 생겼다고 볼 수 있다. 이 단언이 없으면 아래 개수
    // 단언은 fixture가 원래 둘이었던 경우와도 구분되지 않는다.
    expect(rendered.editor.getDocument().blocks).toHaveLength(1);

    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    const blocks = rendered.editor.getDocument().blocks;
    expect(blocks).toHaveLength(2);
    const [original, duplicated] = blocks;
    if (original?.type !== "paragraph" || duplicated?.type !== "paragraph") {
      throw new Error("문단 블록이 아니다");
    }
    expect(original.id).toBe(rendered.blockIds[0]);
    expect(duplicated.id).not.toBe(original.id);
    expect(duplicated.content).toEqual(original.content);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(rendered.editable);
  });

  it("삭제 항목을 클릭하면 deleteBlock을 호출하고 메뉴를 닫으며 편집기로 초점을 되돌린다", () => {
    // deleteBlock은 문서에 블록이 하나뿐이면 COMMAND_NOT_APPLICABLE로
    // 되돌린다(editor-controller.ts) — 문단 하나짜리 fixture로는 삭제가
    // 실제로 실행됐는지 자체를 볼 수 없으므로 두 블록으로 마운트한다.
    const rendered = openBlockMenu({ blockIds: ["block-1", "block-2"] });
    // 전제: 삭제 전에는 두 블록이 다 있다. 이 단언이 없으면 아래 "하나만
    // 남았다"는 deleteBlock이 거절돼 애초에 아무것도 하지 않은 경우와
    // 구분되지 않는다(Issue #62).
    expect(rendered.editor.getDocument().blocks).toHaveLength(2);

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    // 실제 deleteBlock("block-1")이 돌았음을 남은 블록으로 본다 — 개수만
    // 세면 어느 블록이 지워졌는지 구분하지 못한다.
    const blocks = rendered.editor.getDocument().blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.id).toBe("block-2");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(rendered.editable);
  });
});
