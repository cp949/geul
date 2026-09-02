// @vitest-environment jsdom

/**
 * BlockSelectionToolbar 컴포넌트: blockSelection(DELTA-01) 상태를 읽어
 * 삭제·위로 이동·아래로 이동 버튼을 가진 플로팅 툴바와 선택 범위 하이라이트를
 * 렌더하고, 삭제·이동 명령 호출(DELTA-02), 형제 목록 경계에서의 버튼
 * 비활성화, 바깥 클릭·Escape에 의한 선택 해제를 검증한다.
 *
 * 모든 테스트가 실제 createEditor() 마운트 위에서 돈다(Issue #76) —
 * blockSelection은 ProseMirror Selection과 독립적인 core 세션 필드라
 * selectBlockRange 같은 순수 명령 호출로 세울 수 있다(DELTA-01). fake
 * 컨트롤러가 필요 없다(CellSelection과 다른 점).
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { BlockSelectionToolbar } from "../src/block-selection-toolbar.js";
import { focusOutsideEditor, mountBlockEditor } from "./mount-editor.js";
import { fireSelectionChange } from "./selection-events.js";

// @testing-library/react는 전역 afterEach나 teardown이 함수일 때만 자동
// cleanup을 등록한다. 저장소 루트 vitest.config.ts에는 globals도
// setupFiles도 없어 자동 cleanup이 없다(table-selection-toolbar.test.tsx와
// 같은 이유) — 명시적으로 등록하지 않으면 assertion이 먼저 던질 때 DOM이
// 남아 다음 테스트가 "multiple elements"로 실패하며 진짜 실패가 가려진다.
afterEach(cleanup);

const deleteLabel = "Delete selected blocks";
const moveUpLabel = "Move selection up";
const moveDownLabel = "Move selection down";

const FIVE_BLOCK_IDS = [
  "block-1",
  "block-2",
  "block-3",
  "block-4",
  "block-5",
] as const;

/**
 * 실제 편집기를 blockIds만큼의 문단으로 마운트하고 BlockSelectionToolbar를
 * 얹는다. 기본 5블록 픽스처는 완료 조건 2(중간 블록 누락 변이 검출)가
 * 요구하는 "최소 3블록 범위, 중간에 최소 1개 미선택 블록" 구성을 만족한다.
 */
const renderToolbar = (blockIds: readonly string[] = FIVE_BLOCK_IDS) =>
  mountBlockEditor({ blockIds, children: <BlockSelectionToolbar /> });

/** 현재 DOM에 떠 있는 하이라이트 오버레이가 표시하는 blockId 목록(문서 순서 무관, 등장 순서). */
const highlightedBlockIds = (): string[] =>
  Array.from(
    document.querySelectorAll("[data-be-block-selection-highlight]"),
  ).map((el) => el.getAttribute("data-be-highlighted-block-id") ?? "");

/** 이동 버튼(위/아래)의 disabled 여부를 native 속성으로 직접 읽는다. */
const isMoveButtonDisabled = (label: string): boolean =>
  (screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled;

describe("blockSelection이 있으면 툴바와 하이라이트를 렌더한다", () => {
  it("delete·위로 이동·아래로 이동 버튼을 가진 툴바가 뜬다", () => {
    const { editor } = renderToolbar();

    const selected = editor.commands.selectBlockRange("block-2", "block-4");
    expect(selected.ok).toBe(true);
    fireSelectionChange();

    expect(
      screen.getByRole("toolbar", { name: "Block selection" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: deleteLabel })).not.toBeNull();
    expect(screen.getByRole("button", { name: moveUpLabel })).not.toBeNull();
    expect(screen.getByRole("button", { name: moveDownLabel })).not.toBeNull();
  });

  // 완료 조건 2 + 변이 검출: 끝점(block-2·block-4)만 강조하고 중간 블록
  // (block-3)을 빠뜨리는 구현이면 이 테스트가 실패해야 한다. 5블록 중
  // 2~4번을 선택해 범위 밖(block-1, block-5)과 범위 안 중간(block-3)을
  // 모두 갖춘 픽스처로 검증한다.
  it("선택 범위(fromBlockId~toBlockId, 양끝 포함)의 모든 블록에 하이라이트가 적용되고 범위 밖 블록에는 적용되지 않는다", () => {
    const { editor } = renderToolbar();

    const selected = editor.commands.selectBlockRange("block-2", "block-4");
    expect(selected.ok).toBe(true);
    fireSelectionChange();

    expect(highlightedBlockIds().sort()).toEqual([
      "block-2",
      "block-3",
      "block-4",
    ]);
    expect(
      document.querySelector(
        '[data-be-block-selection-highlight][data-be-highlighted-block-id="block-1"]',
      ),
    ).toBeNull();
    expect(
      document.querySelector(
        '[data-be-block-selection-highlight][data-be-highlighted-block-id="block-5"]',
      ),
    ).toBeNull();
  });

  it("역방향으로 선택해도(toBlockId가 문서상 앞) 정규화된 범위 전체에 하이라이트가 적용된다", () => {
    const { editor } = renderToolbar();

    // selectBlockRange는 인자 순서와 무관하게 문서 순서로 정규화한다
    // (core generic-block-commands.ts) — fromBlockId 인자에 뒤쪽 블록을
    // 넘겨도 같은 결과여야 한다.
    const selected = editor.commands.selectBlockRange("block-4", "block-2");
    expect(selected.ok).toBe(true);
    fireSelectionChange();

    expect(highlightedBlockIds().sort()).toEqual([
      "block-2",
      "block-3",
      "block-4",
    ]);
  });
});

describe("blockSelection이 없으면 툴바를 렌더하지 않는다", () => {
  it("선택이 없는 초기 상태에는 툴바도 하이라이트도 없다", () => {
    renderToolbar();

    expect(
      screen.queryByRole("toolbar", { name: "Block selection" }),
    ).toBeNull();
    expect(highlightedBlockIds()).toEqual([]);
  });

  it("clearBlockSelection 뒤에는 툴바와 하이라이트가 모두 사라진다", () => {
    const { editor } = renderToolbar();
    editor.commands.selectBlockRange("block-2", "block-4");
    fireSelectionChange();
    // 전제: 지우기 전에는 실제로 떠 있었다.
    expect(screen.getByRole("button", { name: deleteLabel })).not.toBeNull();

    const cleared = editor.commands.clearBlockSelection();
    expect(cleared.ok).toBe(true);
    fireSelectionChange();

    expect(
      screen.queryByRole("toolbar", { name: "Block selection" }),
    ).toBeNull();
    expect(highlightedBlockIds()).toEqual([]);
  });
});

describe("삭제 버튼", () => {
  it("클릭하면 deleteSelectedBlocks가 실행되고 성공 시 툴바와 하이라이트가 함께 사라진다", () => {
    const { editor } = renderToolbar();
    editor.commands.selectBlockRange("block-2", "block-4");
    fireSelectionChange();
    expect(screen.getByRole("button", { name: deleteLabel })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: deleteLabel }));

    // 실제 명령이 돌았음을 문서로 확인한다(DELTA-02 완료 조건: 범위
    // 통째로 삭제, 성공 후 blockSelection은 null이 된다).
    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-1",
      "block-5",
    ]);
    expect(editor.getBlockSelection()).toBeNull();
    expect(
      screen.queryByRole("toolbar", { name: "Block selection" }),
    ).toBeNull();
    expect(highlightedBlockIds()).toEqual([]);
  });
});

describe("위로 이동 버튼", () => {
  it("클릭하면 범위 시작 블록의 바로 앞 형제 앞으로 moveSelectedBlocksBefore를 호출하고, 성공 후 툴바가 유지되며 즉시 재조회한다", () => {
    const { editor } = renderToolbar();
    editor.commands.selectBlockRange("block-2", "block-4");
    fireSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: moveUpLabel }));

    // 실제 moveSelectedBlocksBefore("block-1")이 돌았음을 문서 순서로 본다.
    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-2",
      "block-3",
      "block-4",
      "block-1",
      "block-5",
    ]);
    // blockId는 이동으로 바뀌지 않으므로 getBlockSelection()은 여전히
    // 같은 범위를 가리킨다(DELTA-02 완료 조건 12) — 툴바가 사라지지 않는다.
    expect(editor.getBlockSelection()).toEqual({
      fromBlockId: "block-2",
      toBlockId: "block-4",
    });
    expect(screen.getByRole("button", { name: deleteLabel })).not.toBeNull();

    // 변이 검출(완료 조건 5): 성공 콜백에서 즉시 재조회하지 않으면, 이동
    // 뒤 범위가 형제 목록 맨 앞(startIndex 0)으로 옮겨졌는데도 위로 이동
    // 버튼이 여전히 "활성"(직전 폴링 시점의 낡은 상태)으로 남는다.
    // 네이티브 DOM 이벤트를 전혀 쏘지 않은 채(이 fireEvent.click은 click만
    // 발행하고 selectionchange/mouseup/keyup/pointerup은 발행하지 않는다)
    // 바로 이 상태를 확인하므로, onSuccess 재조회가 없으면 실패한다.
    expect(isMoveButtonDisabled(moveUpLabel)).toBe(true);
    expect(isMoveButtonDisabled(moveDownLabel)).toBe(false);
  });
});

describe("아래로 이동 버튼", () => {
  it("클릭하면 바로 다음 형제의 다음 형제 앞으로 moveSelectedBlocksBefore를 호출한다(대칭 동작)", () => {
    // 6블록: 다음 형제(block-5) 바로 뒤가 아니라 "다음 형제의 다음 형제"
    // (block-6) 앞으로 이동하는 분기를 검증한다 — 5블록 픽스처는 이 경우
    // 우연히 "맨 뒤로 이동"(beforeBlockId=null)과 결과가 같아진다.
    const sixBlockIds = [...FIVE_BLOCK_IDS, "block-6"] as const;
    const { editor } = renderToolbar(sixBlockIds);
    editor.commands.selectBlockRange("block-2", "block-4");
    fireSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: moveDownLabel }));

    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-1",
      "block-5",
      "block-2",
      "block-3",
      "block-4",
      "block-6",
    ]);
    expect(editor.getBlockSelection()).toEqual({
      fromBlockId: "block-2",
      toBlockId: "block-4",
    });
  });

  it("다음다음 형제가 없으면(범위 뒤에 형제가 하나뿐) beforeBlockId=null로 맨 뒤로 이동한다", () => {
    const { editor } = renderToolbar();
    editor.commands.selectBlockRange("block-2", "block-4");
    fireSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: moveDownLabel }));

    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-1",
      "block-5",
      "block-2",
      "block-3",
      "block-4",
    ]);
  });
});

describe("형제 목록 경계에서 이동 버튼을 비활성화한다", () => {
  it("선택 범위가 맨 앞이면 위로 이동 버튼이 비활성화된다", () => {
    const { editor } = renderToolbar();
    editor.commands.selectBlockRange("block-1", "block-2");
    fireSelectionChange();

    expect(isMoveButtonDisabled(moveUpLabel)).toBe(true);
    expect(isMoveButtonDisabled(moveDownLabel)).toBe(false);
  });

  it("선택 범위가 맨 뒤이면 아래로 이동 버튼이 비활성화된다", () => {
    const { editor } = renderToolbar();
    editor.commands.selectBlockRange("block-4", "block-5");
    fireSelectionChange();

    expect(isMoveButtonDisabled(moveUpLabel)).toBe(false);
    expect(isMoveButtonDisabled(moveDownLabel)).toBe(true);
  });

  it("선택 범위가 문서 전체이면 위·아래 이동 버튼이 모두 비활성화된다", () => {
    const { editor } = renderToolbar();
    editor.commands.selectBlockRange("block-1", "block-5");
    fireSelectionChange();

    expect(isMoveButtonDisabled(moveUpLabel)).toBe(true);
    expect(isMoveButtonDisabled(moveDownLabel)).toBe(true);
  });
});

describe("바깥 pointerdown으로 선택을 해제한다", () => {
  it("clearBlockSelection을 호출하고 툴바가 사라지며 편집기로 초점을 옮기지 않는다", () => {
    const { editor } = renderToolbar();
    editor.commands.selectBlockRange("block-2", "block-4");
    fireSelectionChange();
    expect(screen.getByRole("button", { name: deleteLabel })).not.toBeNull();

    // 편집기 바깥 요소는 편집기가 만들지 않는다(table-selection-toolbar.test.tsx와
    // 같은 방식) — 이 조립만 직접 만든다.
    const outsideButton = document.createElement("button");
    outsideButton.textContent = "outside";
    document.body.append(outsideButton);
    focusOutsideEditor(outsideButton);

    try {
      fireEvent.pointerDown(outsideButton);

      expect(editor.getBlockSelection()).toBeNull();
      expect(
        screen.queryByRole("toolbar", { name: "Block selection" }),
      ).toBeNull();
      expect(highlightedBlockIds()).toEqual([]);
      // G-UI-001: 바깥 pointerdown은 초점을 강제로 옮기지 않는다 — 클릭
      // 대상이 자연히 초점을 받으므로 그대로 둔다.
      expect(document.activeElement).toBe(outsideButton);
    } finally {
      outsideButton.remove();
    }
  });

  it("툴바 자신을 pointerdown해도(allow-list) 선택이 해제되지 않는다", () => {
    const { editor } = renderToolbar();
    editor.commands.selectBlockRange("block-2", "block-4");
    fireSelectionChange();

    const toolbar = screen.getByRole("toolbar", { name: "Block selection" });
    fireEvent.pointerDown(toolbar);

    expect(editor.getBlockSelection()).toEqual({
      fromBlockId: "block-2",
      toBlockId: "block-4",
    });
    expect(
      screen.getByRole("toolbar", { name: "Block selection" }),
    ).not.toBeNull();
  });
});

describe("Escape로 선택을 해제한다", () => {
  it("clearBlockSelection을 호출하고 툴바가 사라지며 편집기로 초점을 복구한다", () => {
    const { editor, editable } = renderToolbar();
    editor.commands.selectBlockRange("block-2", "block-4");
    fireSelectionChange();
    expect(screen.getByRole("button", { name: deleteLabel })).not.toBeNull();

    const outsideButton = document.createElement("button");
    outsideButton.textContent = "outside";
    document.body.append(outsideButton);
    focusOutsideEditor(outsideButton);

    try {
      fireEvent.keyDown(document, { key: "Escape" });

      expect(editor.getBlockSelection()).toBeNull();
      expect(
        screen.queryByRole("toolbar", { name: "Block selection" }),
      ).toBeNull();
      expect(highlightedBlockIds()).toEqual([]);
      // Escape는 돌아갈 클릭 대상이 없어 편집기로 초점을 되돌린다
      // (G-UI-001, table-selection-toolbar.test.tsx와 같은 단언).
      expect(document.activeElement).toBe(editable);
    } finally {
      outsideButton.remove();
    }
  });
});

describe("명령 실패 시 예외를 던지지 않고 상태를 유지한다(완료 조건 10)", () => {
  it("deleteSelectedBlocks가 COMMAND_NOT_APPLICABLE로 거절되면(문서 전체 선택) 예외 없이 툴바가 그대로 남는다", () => {
    const { editor } = renderToolbar();
    // 최상위 문서 전체를 선택하면 core의 deleteSelectedBlocks가
    // COMMAND_NOT_APPLICABLE로 거절한다(빈 최상위 문서를 막는 가드,
    // DELTA-02 완료 조건 4).
    editor.commands.selectBlockRange("block-1", "block-5");
    fireSelectionChange();

    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: deleteLabel })),
    ).not.toThrow();

    expect(editor.getDocument().blocks).toHaveLength(5);
    expect(editor.getBlockSelection()).toEqual({
      fromBlockId: "block-1",
      toBlockId: "block-5",
    });
    expect(
      screen.getByRole("toolbar", { name: "Block selection" }),
    ).not.toBeNull();
  });

  it("moveSelectedBlocksBefore가 실패해도(캐시된 beforeBlockId가 가리키던 블록이 사라짐) 예외 없이 상태를 유지한다", () => {
    const { editor } = renderToolbar();
    editor.commands.selectBlockRange("block-2", "block-4");
    fireSelectionChange();
    // 폴링된 moveUpBeforeBlockId는 "block-1"이다(범위 시작 block-2의 바로
    // 앞 형제). 재조회 계기(selectionchange 등)를 주지 않은 채 그 블록을
    // 다른 명령으로 없애 "방어적 재검증 실패" 상황을 실제로 만든다.
    const deleted = editor.commands.deleteBlock("block-1");
    expect(deleted.ok).toBe(true);

    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: moveUpLabel })),
    ).not.toThrow();

    // 실패한 명령은 문서를 바꾸지 않는다 — block-1 삭제 이후의 4블록
    // 그대로다.
    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-2",
      "block-3",
      "block-4",
      "block-5",
    ]);
    expect(
      screen.getByRole("toolbar", { name: "Block selection" }),
    ).not.toBeNull();
  });
});

describe("pointerup 리스너 등록 순서와 무관하게 같은 이벤트로 재조회한다", () => {
  // BlockSideMenu의 드래그 종료 핸들러(usePointerDragGesture)는 드래그가
  // 시작될 때(즉 이 컴포넌트가 마운트되고 한참 뒤) document에 pointerup
  // 리스너를 등록하고, 그 안에서 selectBlockRange/moveSelectedBlocksBefore를
  // 커밋한다. 같은 target에 걸린 리스너는 등록 순서대로 동기 실행되므로,
  // 이 컴포넌트가 마운트 시 건 pointerup 리스너가 먼저 stale 상태를 읽고
  // 나중에야 저 커밋이 일어나면 그 pointerup 한 번으로는 툴바가 갱신되지
  // 않는다(트랙-6 결함 탐지, IMPL-REVIEW-02 F1). 마운트 뒤 등록되는
  // "늦은" pointerup 리스너로 이 순서를 재현한다.
  it("마운트 뒤 등록된 다른 pointerup 리스너가 그 안에서 selectBlockRange를 커밋해도 같은 이벤트만으로 툴바가 뜬다", async () => {
    const { editor } = renderToolbar();

    const commitOnPointerUp = () => {
      editor.commands.selectBlockRange("block-2", "block-4");
    };
    document.addEventListener("pointerup", commitOnPointerUp);

    await act(async () => {
      document.dispatchEvent(new PointerEvent("pointerup"));
      // 재조회가 마이크로태스크로 미뤄져 있으면 이 await로 그 큐를
      // 비운다 — 추가 이벤트(mouseup 등)를 별도로 쏘지 않는다.
      await Promise.resolve();
    });

    document.removeEventListener("pointerup", commitOnPointerUp);

    expect(
      screen.getByRole("toolbar", { name: "Block selection" }),
    ).not.toBeNull();
    expect(highlightedBlockIds().sort()).toEqual([
      "block-2",
      "block-3",
      "block-4",
    ]);
  });
});
