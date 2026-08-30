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
import { selectText } from "./selection-events.js";

// jsdom은 setPointerCapture를 구현하지 않는다(table-handle-menu.test.tsx와
// 같은 이유) — handlePointerDownOnHandle이 실제 드래그 준비로 이를 호출하므로,
// 핸들에 pointerdown을 쏘는 테스트(재클릭 풀 제스처)에는 폴리필이 필요하다.
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}

// @testing-library/react는 전역 afterEach나 teardown이 함수일 때만 자동
// cleanup을 등록한다(dist/index.js의 typeof afterEach === "function" 분기와
// 그 else의 teardown fallback). vitest는 globals: true일 때만 그 전역을
// 노출하는데 저장소 루트 vitest.config.ts에는 globals도 setupFiles도 없어 자동
// cleanup이 없다(실측: 이 설정에서 둘 다 undefined). 각 it 말미의 unmount로는
// assertion이 먼저 던질 때 DOM이 남아 다음 테스트의 getByRole(...)가
// "multiple elements"로 실패한다 — 진짜 실패가 가려진다.
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
 * 핸들을 hover -> click해 첫 번째 블록의 메뉴를 연다.
 *
 * pointerMove가 먼저인 이유: 핸들 버튼이 든 거터는 hoverBounds !== null일
 * 때만 렌더되고(block-side-menu.tsx), hoverBounds는 pointermove가 세우는
 * hoverBlockId에서만 나온다. handleHandleClick도 hoverBounds === null이면
 * 즉시 return한다 — hover 없이는 버튼을 찾을 수도 열 수도 없다.
 *
 * pointerDown/pointerUp 드래그 시퀀스가 필요 없는 이유: handleHandleClick의
 * 억제 가드는 event.detail !== 0 && suppressedHandleClickBlockIdRef.current
 * === blockId다. fireEvent.click의 기본 detail은 0이라(실측 확인) 첫 항이
 * 이미 거짓이고, 억제 ref는 드래그 종료(pointerup/pointercancel) 경로에서만
 * 세워지는데 초기값이 null이라 둘째 항도 거짓이다. 가드를 지나 click이
 * 곧바로 메뉴 열기로 처리된다.
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
    // 되돌린다(G-UI-001). onEscapeDismiss가 onOutsideDismiss로 잘못 연결되면
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

  it("재클릭이 닫는 분기를 타면 메뉴를 닫고 편집기로 초점을 되돌린다", () => {
    const rendered = openBlockMenu();
    // 전제: 재클릭 전에는 메뉴가 실제로 열려 있다. openBlockMenu 내부의
    // getByRole("button", { name: dragHandleLabel })는 hover 거터의 핸들
    // 버튼(block-side-menu.tsx:331-347)을 찾을 뿐 메뉴 팝업(:379-427)과는
    // 다른 요소라 첫 클릭이 메뉴를 열지 못해도 그 조회는 그대로 성공한다.
    // 이 단언이 없으면 아래 부재는 "핸들 클릭이 메뉴를 아예 못 연다"로도
    // 통과한다(Issue #62).
    expect(screen.getByRole("menu", { name: "Block menu" })).not.toBeNull();

    // 실제 마우스 재클릭은 pointerdown -> pointerup -> click 순서로 온다
    // (G-TST-001). click만 쏘면 handlePointerDownOnHandle의
    // setBlockMenuState(null)를 거치지 않아 이 결함(Issue #52 확장, 실제
    // 재클릭이 닫는 분기에 도달 못 함)을 재현하지 못하는 거짓 통과가 된다.
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.click(handle);

    expect(screen.queryByRole("menu")).toBeNull();
    // 트리거 버튼도 onMouseDown preventDefault라 초점을 받지 않는다 — 재클릭
    // 닫기에는 바깥 클릭과 달리 "돌아갈 다른 목적지"가 없어 Escape와 같은
    // 그룹(초점 복구)으로 다룬다(G-UI-001, Issue #52).
    expect(document.activeElement).toBe(rendered.editable);
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

  it("Turn into는 최신 top-level·nested block source에 공용 Code/list filter를 적용한다", () => {
    const rendered = renderBlockMenu({
      blockIds: ["code-source", "parent", "nested-list"],
    });
    const codeResult = rendered.editor.commands.setBlockType("code-source", {
      type: "codeBlock",
    });
    const listResult = rendered.editor.commands.setBlockType("nested-list", {
      type: "bulletListItem",
    });
    const indentResult = rendered.editor.commands.indentBlock("nested-list");
    if (!codeResult.ok || !listResult.ok || !indentResult.ok) {
      throw new Error("Turn into source fixture 준비 실패");
    }
    const blocks = rendered.restubGeometry();
    const codeBlock = blocks.find(
      (block) => block.getAttribute("data-be-block-id") === "code-source",
    );
    const nestedList = blocks.find(
      (block) => block.getAttribute("data-be-block-id") === "nested-list",
    );
    if (codeBlock === undefined || nestedList === undefined) {
      throw new Error("top-level·nested block 요소를 찾지 못했다");
    }

    fireEvent.pointerMove(codeBlock);
    fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));

    expect(screen.getByRole("menuitem", { name: "Code" })).toBeTruthy();
    expect(
      screen.queryByRole("menuitem", { name: "Bulleted List" }),
    ).toBeNull();
    expect(
      screen.queryByRole("menuitem", { name: "Numbered List" }),
    ).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerMove(nestedList);
    fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));

    expect(screen.queryByRole("menuitem", { name: "Code" })).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Bulleted List" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Numbered List" }),
    ).toBeTruthy();
  });

  it("열린 뒤 source가 바뀐 Turn into는 click 시점 최신 문맥에서 무효 option 실행을 막는다", () => {
    const rendered = openBlockMenu();
    const before = rendered.editor.getDocument().blocks[0];
    if (before?.type !== "paragraph") throw new Error("본문 문단이 아니다");
    expect(screen.getByRole("menuitem", { name: "Code" })).toBeTruthy();

    const changed = rendered.editor.commands.setBlockType(before.id, {
      type: "bulletListItem",
    });
    if (!changed.ok) throw new Error("외부 source 변경 fixture 준비 실패");
    const setBlockType = vi.spyOn(rendered.editor.commands, "setBlockType");
    const staleOption = screen.getByRole("menuitem", { name: "Code" });

    fireEvent.pointerDown(staleOption);
    fireEvent.mouseDown(staleOption);
    fireEvent.click(staleOption);

    expect(setBlockType).not.toHaveBeenCalled();
    const after = rendered.editor.getDocument().blocks[0];
    if (after?.type !== "bulletListItem") {
      throw new Error("무효 Code option이 source를 변경했다");
    }
    expect(after.id).toBe(before.id);
    expect(after.content).toEqual(before.content);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(rendered.editable);
  });

  it.each([
    {
      source: "paragraph" as const,
      label: "Bulleted List",
      expectedType: "bulletListItem",
    },
    {
      source: "paragraph" as const,
      label: "Numbered List",
      expectedType: "numberedListItem",
    },
    {
      source: "bulletListItem" as const,
      label: "Text",
      expectedType: "paragraph",
    },
    {
      source: "numberedListItem" as const,
      label: "Text",
      expectedType: "paragraph",
    },
    {
      source: "bulletListItem" as const,
      label: "Heading 2",
      expectedType: "heading",
    },
    {
      source: "numberedListItem" as const,
      label: "Quote",
      expectedType: "quote",
    },
  ])(
    "$source에서 $label 선택은 pointerdown→click 동안 content·ID를 보존하고 메뉴를 닫는다",
    ({ source, label, expectedType }) => {
      const rendered = renderBlockMenu();
      if (source !== "paragraph") {
        const prepared = rendered.editor.commands.setBlockType("block-1", {
          type: source,
        });
        if (!prepared.ok) throw new Error("목록 source fixture 준비 실패");
      }
      const [blockElement] = rendered.restubGeometry();
      if (blockElement === undefined) throw new Error("블록 요소가 없다");
      const before = rendered.editor.getDocument().blocks[0];
      if (before === undefined || !("content" in before)) {
        throw new Error("텍스트 source 블록이 아니다");
      }
      rendered.editable.focus();
      fireEvent.pointerMove(blockElement);
      fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));
      const option = screen.getByRole("menuitem", { name: label });

      fireEvent.pointerDown(option);
      fireEvent.mouseDown(option);

      expect(document.activeElement).toBe(rendered.editable);

      fireEvent.click(option);

      const after = rendered.editor.getDocument().blocks[0];
      if (after === undefined || !("content" in after)) {
        throw new Error("변환된 텍스트 블록이 아니다");
      }
      expect(after.type).toBe(expectedType);
      expect(after.id).toBe(before.id);
      expect(after.content).toEqual(before.content);
      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(rendered.editable);
    },
  );

  it("Code 종류 변경은 id와 source를 보존하고 mark를 제거하며 text 언어를 적용한다", () => {
    const rendered = renderBlockMenu();
    const paragraph = rendered.host.querySelector("p");
    const text = paragraph?.firstChild ?? null;
    const blockElement = rendered.blocks[0];
    if (paragraph === null || text === null || blockElement === undefined) {
      throw new Error("본문 문단 fixture를 찾지 못했다");
    }
    rendered.editable.focus();
    selectText(text, 0, 2);
    const marked = rendered.editor.commands.toggleBold();
    if (!marked.ok) throw new Error("굵게 mark fixture 준비 실패");
    const before = rendered.editor.getDocument().blocks[0];
    if (before?.type !== "paragraph") throw new Error("본문 문단이 아니다");
    expect(before.content).toEqual([
      { text: "본문", marks: [{ type: "bold" }] },
    ]);

    fireEvent.pointerMove(blockElement);
    fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Code" }));

    const after = rendered.editor.getDocument().blocks[0];
    if (after?.type !== "codeBlock") throw new Error("코드 블록이 아니다");
    expect(after.id).toBe(before.id);
    expect(after.content).toEqual([{ text: "본문" }]);
    expect(after.language).toBe("text");
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
