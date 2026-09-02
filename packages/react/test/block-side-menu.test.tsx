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
import { mountBlockEditor, stubRect } from "./mount-editor.js";
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
      source: "paragraph" as const,
      label: "Check List",
      expectedType: "checkListItem",
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
      source: "checkListItem" as const,
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
    {
      source: "paragraph" as const,
      label: "Toggle List",
      expectedType: "toggleListItem",
    },
    {
      source: "toggleListItem" as const,
      label: "Text",
      expectedType: "paragraph",
    },
    {
      source: "paragraph" as const,
      label: "Toggle Heading 1",
      expectedType: "heading",
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

  it("Turn into의 Toggle Heading 1은 isToggleable:true를 설정하고, 다시 Text를 선택하면 해제된다(RD-004 DELTA-04)", () => {
    const rendered = renderBlockMenu();
    const [blockElement] = rendered.restubGeometry();
    if (blockElement === undefined) throw new Error("블록 요소가 없다");
    const before = rendered.editor.getDocument().blocks[0];
    if (before === undefined) throw new Error("본문 fixture가 없다");

    rendered.editable.focus();
    fireEvent.pointerMove(blockElement);
    fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Toggle Heading 1" }));

    const toggled = rendered.editor.getDocument().blocks[0];
    if (toggled?.type !== "heading") throw new Error("제목 블록이 아니다");
    expect(toggled.id).toBe(before.id);
    expect(toggled.level).toBe(1);
    expect(toggled.isToggleable).toBe(true);

    const [headingElement] = rendered.restubGeometry();
    if (headingElement === undefined) throw new Error("블록 요소가 없다");
    fireEvent.pointerMove(headingElement);
    fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Text" }));

    const restored = rendered.editor.getDocument().blocks[0];
    if (restored?.type !== "paragraph") throw new Error("문단이 아니다");
    expect(restored.id).toBe(before.id);
  });

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

describe("핸들 드래그 확장: range-select 생성·범위 재드래그 이동(Issue #38 슬라이스7 DELTA-03)", () => {
  it("인접 형제 own rect 위로 드래그하면 기존 단일 재정렬 guide만 쓰고 selectBlockRange를 호출하지 않는다(조건1, characterization)", () => {
    const rendered = renderBlockMenu({
      blockIds: ["block-1", "block-2", "block-3"],
    });
    const [block1] = rendered.blocks;
    if (block1 === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block1);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    // block-2(20~40)의 하반부를 겨냥한다 — 상반부(20~30)는 block-1이 이미
    // 그 자리 바로 앞이라 no-op으로 가이드가 그려지지 않는다.
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 35 });

    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).not.toBeNull();

    fireEvent.pointerUp(handle, { pointerId: 1 });

    // 실제 moveBlockBefore("block-1","block-3")가 돌았음을 순서로 본다.
    expect(
      rendered.editor.getDocument().blocks.map((block) => block.id),
    ).toEqual(["block-2", "block-1", "block-3"]);
    expect(rendered.editor.getBlockSelection()).toBeNull();
  });

  it("flat DOM 인덱스로는 멀어 보여도 실제 트리로 인접 형제면 selectBlockRange를 호출하지 않는다(조건1a, bug-catching RED+mutation)", () => {
    const rendered = renderBlockMenu({
      blockIds: ["block-1", "block-2", "block-3"],
    });
    const listResult = rendered.editor.commands.setBlockType("block-2", {
      type: "bulletListItem",
    });
    const indentResult = rendered.editor.commands.indentBlock("block-2");
    if (!listResult.ok || !indentResult.ok) {
      throw new Error("nested fixture 준비 실패");
    }

    // 전제: block-2는 이제 block-1의 child다. flat DOM 순서로는 block-1(0)·
    // block-2(1)·block-3(2)라 block-1↔block-3이 flat 인덱스로 2칸 떨어져
    // 보이지만, 실제 최상위 형제 목록은 [block-1, block-3]으로 진짜 인접
    // 형제다 — own-rect 판정이 flat 인덱스가 아니라 이 트리를 봐야 한다.
    const topLevel = rendered.editor.getDocument().blocks;
    const parent = topLevel[0];
    if (
      parent === undefined ||
      !("children" in parent) ||
      parent.children === undefined
    ) {
      throw new Error("block-1이 children을 갖지 않는다");
    }
    expect(topLevel.map((block) => block.id)).toEqual(["block-1", "block-3"]);
    expect(parent.children.map((block) => block.id)).toEqual(["block-2"]);

    const blocks = rendered.restubGeometry();
    const block1 = blocks.find(
      (block) => block.getAttribute("data-be-block-id") === "block-1",
    );
    if (block1 === undefined) throw new Error("block-1 요소를 찾지 못했다");

    fireEvent.pointerMove(block1);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    // restubGeometry는 DOM 순서(block-1·block-2·block-3)대로 20px 높이를
    // 매긴다 — block-3의 own rect(40~60)를 겨냥한다.
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 45 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    // 변이: own-rect 판정이 flat DOM 인덱스로 인접을 재면 block-1↔block-3
    // (flat diff 2)를 "인접하지 않다"로 오판해 selectBlockRange를 호출해
    // 버린다 — 둘은 실제 최상위 형제로 진짜 인접이라 core도 이 호출을
    // 받아들여 버려서(같은 부모라 COMMAND_NOT_APPLICABLE로 거절되지 않음)
    // 관측 가능한 차이가 된다.
    expect(rendered.editor.getBlockSelection()).toBeNull();
  });

  it("비인접 대상이 시작 블록과 다른 부모면 selectBlockRange를 호출하지 않는다(조건3, bug-catching RED)", () => {
    const rendered = renderBlockMenu({
      blockIds: ["block-1", "block-2", "block-3"],
    });
    const listResult = rendered.editor.commands.setBlockType("block-2", {
      type: "bulletListItem",
    });
    const indentResult = rendered.editor.commands.indentBlock("block-2");
    if (!listResult.ok || !indentResult.ok) {
      throw new Error("nested fixture 준비 실패");
    }
    const blocks = rendered.restubGeometry();
    const block3 = blocks.find(
      (block) => block.getAttribute("data-be-block-id") === "block-3",
    );
    if (block3 === undefined) throw new Error("block-3 요소를 찾지 못했다");

    fireEvent.pointerMove(block3);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    // block-2(20~40, block-1의 child)의 own rect를 겨냥한다 — block-3와는
    // 다른 부모다.
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 25 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(rendered.editor.getBlockSelection()).toBeNull();
  });

  it("비인접·같은 부모 형제 own rect 위로 드래그하면 range-select 후보를 계산하고 pointerup에서 selectBlockRange를 호출한다(조건2, bug-catching RED+mutation)", () => {
    const rendered = renderBlockMenu({
      blockIds: ["block-1", "block-2", "block-3"],
    });
    const [block1] = rendered.blocks;
    if (block1 === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block1);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    // block-3(40~60)의 own rect를 겨냥한다 — block-1과는 2칸 떨어진 비인접
    // 형제다.
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 45 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    // 변이: 전환 판정이 없으면 moveBlockBefore만 호출돼 문서 순서가 바뀐다.
    expect(
      rendered.editor.getDocument().blocks.map((block) => block.id),
    ).toEqual(["block-1", "block-2", "block-3"]);
    expect(rendered.editor.getBlockSelection()).toEqual({
      fromBlockId: "block-1",
      toBlockId: "block-3",
    });
  });

  it("이미 선택된 범위 안 handle을 드래그하면 range-move 모드로 시작해 moveSelectedBlocksBefore를 호출하고 선택을 유지한다(조건4·5·6)", () => {
    const rendered = renderBlockMenu({
      blockIds: ["b1", "b2", "b3", "b4"],
    });
    const selected = rendered.editor.commands.selectBlockRange("b2", "b3");
    if (!selected.ok) throw new Error("범위 선택 fixture 준비 실패");

    const [, b2] = rendered.blocks;
    if (b2 === undefined) throw new Error("블록 요소가 없다");
    fireEvent.pointerMove(b2);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    // b4(60~80) 아래를 겨냥한다 — computeDragGuide와 같은 midpoint 탐색을
    // 쓰지만 no-op 판정은 범위[1,2] 전체 기준으로 넓어진다(조건6).
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 75 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    // 변이: 모드 판정이 없으면 b2 하나만 moveBlockBefore로 이동해 b3가
    // 남는다(조건5).
    expect(
      rendered.editor.getDocument().blocks.map((block) => block.id),
    ).toEqual(["b1", "b4", "b2", "b3"]);
    // 이동 뒤에도 선택 범위가 유지된다(DELTA-02 조건12 재확인, 상하 이동
    // 버튼 연타 지원).
    expect(rendered.editor.getBlockSelection()).toEqual({
      fromBlockId: "b2",
      toBlockId: "b3",
    });
  });

  it("범위 이동 모드의 no-op 판정은 단일 소스 인덱스가 아니라 선택 범위 끝(endIndex+1)까지 넓게 잡는다(조건6, 즉시 리뷰 발견)", () => {
    const rendered = renderBlockMenu({
      blockIds: ["b1", "b2", "b3", "b4"],
    });
    const selected = rendered.editor.commands.selectBlockRange("b2", "b3");
    if (!selected.ok) throw new Error("범위 선택 fixture 준비 실패");

    const [, b2] = rendered.blocks;
    if (b2 === undefined) throw new Error("블록 요소가 없다");
    fireEvent.pointerMove(b2);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    // b4(60~80) 상반부(65 < 60+20/2)를 겨냥한다 — midpoint 탐색의
    // targetIndex는 3(범위 바로 다음 자리, endIndex+1)이다. 범위[1,2] 전체
    // 기준 no-op은 [1,3]까지라 여기서도 no-op이어야 하지만, 위 테스트처럼
    // 단일 소스 인덱스(sourceIndex=1) 기준 no-op({1,2})만 봤다면 3은
    // no-op이 아니라고 오판해 가이드를 그려버린다 — 위 테스트(clientY 75)는
    // 이 경계를 지나쳐 두 구현을 구분하지 못하므로 별도로 고정한다.
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 65 });

    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).toBeNull();

    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(
      rendered.editor.getDocument().blocks.map((block) => block.id),
    ).toEqual(["b1", "b2", "b3", "b4"]);
    expect(rendered.editor.getBlockSelection()).toEqual({
      fromBlockId: "b2",
      toBlockId: "b3",
    });
  });

  it("자식이 있는 블록의 own rect가 자손을 감싸도(실제 DOM처럼) 가장 깊이 중첩된 블록을 hover 대상으로 판정한다(조건2 일반화, 즉시 리뷰 발견)", () => {
    // p 뒤에 z를 하나 더 둔다 — c1~c3를 전부 p 밑으로 들여쓰면 p가 문서의
    // 마지막 최상위 블록이 되는데, TrailingBlockExtension(UI-010)은 마지막
    // 최상위가 "자식 없는 paragraph"가 아니면 빈 paragraph를 자동으로
    // 덧붙인다 — z가 그 자리를 대신 지켜 트리 모양이 조용히 바뀌지 않는다.
    const rendered = renderBlockMenu({
      blockIds: ["p", "c1", "c2", "c3", "z"],
    });
    const indent1 = rendered.editor.commands.indentBlock("c1");
    const indent2 = rendered.editor.commands.indentBlock("c2");
    const indent3 = rendered.editor.commands.indentBlock("c3");
    if (!indent1.ok || !indent2.ok || !indent3.ok) {
      throw new Error("중첩 3-child fixture 준비 실패");
    }

    // 전제: 최상위는 [p, z]뿐이고 c1·c2·c3는 전부 p의 실제 자식(형제)이다.
    const topLevel = rendered.editor.getDocument().blocks;
    const parent = topLevel[0];
    if (
      parent === undefined ||
      !("children" in parent) ||
      parent.children === undefined
    ) {
      throw new Error("p가 children을 갖지 않는다");
    }
    expect(topLevel.map((block) => block.id)).toEqual(["p", "z"]);
    expect(parent.children.map((block) => block.id)).toEqual([
      "c1",
      "c2",
      "c3",
    ]);

    const blocks = rendered.restubGeometry();
    const parentElement = blocks.find(
      (block) => block.getAttribute("data-be-block-id") === "p",
    );
    const c1Element = blocks.find(
      (block) => block.getAttribute("data-be-block-id") === "c1",
    );
    if (parentElement === undefined || c1Element === undefined) {
      throw new Error("p·c1 요소를 찾지 못했다");
    }
    // 실제 브라우저에서는 blockContainer가 자기 blockGroup을 DOM 안에 그대로
    // 품어(block-container-extension.ts) p의 own rect가 c1~c3 전체를
    // 감싼다. restubGeometry는 모든 블록에 서로 겹치지 않는 flat 밴드를
    // 매겨(문서 순서 0~20/20~40/40~60/60~80) 이 실제 포함 관계를 재현하지
    // 않으므로, p의 rect만 c1~c3 전체를 덮도록 직접 넓힌다.
    stubRect(parentElement, { left: 0, top: 0, width: 600, height: 80 });

    fireEvent.pointerMove(c1Element);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    // c3의 own rect(60~80) 안을 겨냥한다 — p의 넓힌 rect(0~80)도 이
    // clientY를 덮으므로, 첫 매치(조상 p)를 취하면 오판한다: p와 c1은
    // siblings가 달라(p는 최상위, c1은 p.children) "다른 부모"로 오판해
    // range-select가 전환되지 않는다. 마지막 매치(가장 깊이 중첩된 c3)를
    // 취해야 c1과 같은 부모(p.children)로 올바르게 판정한다.
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 65 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(rendered.editor.getBlockSelection()).toEqual({
      fromBlockId: "c1",
      toBlockId: "c3",
    });
  });

  it("range-select 전환 도중 pointercancel로 취소하면 어떤 명령도 호출하지 않는다(조건7, characterization)", () => {
    const rendered = renderBlockMenu({
      blockIds: ["block-1", "block-2", "block-3"],
    });
    const [block1] = rendered.blocks;
    if (block1 === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block1);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 45 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });

    expect(rendered.editor.getBlockSelection()).toBeNull();
    expect(
      rendered.editor.getDocument().blocks.map((block) => block.id),
    ).toEqual(["block-1", "block-2", "block-3"]);
  });

  it("range-move 모드에서 Escape로 취소하면 moveSelectedBlocksBefore를 호출하지 않는다(조건7, characterization)", () => {
    const rendered = renderBlockMenu({
      blockIds: ["b1", "b2", "b3", "b4"],
    });
    const selected = rendered.editor.commands.selectBlockRange("b2", "b3");
    if (!selected.ok) throw new Error("범위 선택 fixture 준비 실패");

    const [, b2] = rendered.blocks;
    if (b2 === undefined) throw new Error("블록 요소가 없다");
    fireEvent.pointerMove(b2);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 75 });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(
      rendered.editor.getDocument().blocks.map((block) => block.id),
    ).toEqual(["b1", "b2", "b3", "b4"]);
    expect(rendered.editor.getBlockSelection()).toEqual({
      fromBlockId: "b2",
      toBlockId: "b3",
    });
  });

  it("hasDragged 임계값(4px) 미만 이동은 클릭으로 해석돼 어떤 새 판정도 발동하지 않는다(조건8, characterization)", () => {
    const rendered = renderBlockMenu({
      blockIds: ["block-1", "block-2", "block-3"],
    });
    const [block1] = rendered.blocks;
    if (block1 === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block1);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    // dy=2 < 4 — 드래그로 해석되지 않는다.
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 2 });

    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).toBeNull();

    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(
      rendered.editor.getDocument().blocks.map((block) => block.id),
    ).toEqual(["block-1", "block-2", "block-3"]);
    expect(rendered.editor.getBlockSelection()).toBeNull();

    // 기존 "클릭=블록 메뉴 열기" 계약이 그대로 살아 있다 — 억제되지 않는다.
    fireEvent.click(handle, { detail: 1 });
    expect(screen.getByRole("menu", { name: "Block menu" })).not.toBeNull();
  });
});
