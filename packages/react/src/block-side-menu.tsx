import {
  blockTypeDescriptorFromBlock,
  type BlockTypeDescriptor,
  type EditorController,
} from "@cp949/geul-core";
import { GripVertical, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  BLOCK_TYPE_OPTIONS,
  type BlockTypeOption,
  getBlockTypeOptionsForSource,
} from "./block-type-options.js";
import { findElementByAttribute } from "./find-by-attribute.js";
import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { MenuItemButton } from "./menu-item-button.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import {
  resolveReopenAwareClick,
  useHandleReopenSuppression,
} from "./use-handle-reopen-suppression.js";
import { useMirroredState } from "./use-mirrored-state.js";
import { usePointerDragGesture } from "./use-pointer-drag-gesture.js";
import { usePointerHoverTarget } from "./use-pointer-hover-target.js";

// 핸들은 드래그(재정렬)와 클릭(블록 메뉴) 두 동작을 모두 갖는다 — tooltip이
// 한쪽만 안내하면 나머지 동작의 발견성을 가리므로 라벨이 둘 다 기술한다.
const dragHandleLabel = "Drag to reorder, click for options";
const addBlockLabel = "Add block";

const dragHandleIcon = <GripVertical {...iconProps} />;
const addBlockIcon = <Plus {...iconProps} />;

type InsertionGuide = {
  beforeBlockId: string | null;
  left: number;
  top: number;
  width: number;
};

// 핸들 드래그의 세 가지 해석이다(Issue #38 슬라이스7 DELTA-03).
// - "reorder": 기존 단일 블록 재정렬(인접 형제 hover 또는 폴백).
// - "range-select": 인접하지 않은 같은 부모 형제 own rect 위로 들어가
//   pointerup 시 selectBlockRange를 커밋할 후보 상태.
// - "range-move": 이미 있는 blockSelection 범위 안 blockId의 handle을
//   다시 pointerdown해 그 범위 전체를 이동하는 모드(pointerdown 시점에만 결정).
type DragMode = "reorder" | "range-select" | "range-move";

type DragState = {
  pointerId: number;
  sourceBlockId: string;
  startX: number;
  startY: number;
  hasDragged: boolean;
  cancelled: boolean;
  guide: InsertionGuide | null;
  mode: DragMode;
  // range-select 후보 blockId. mode가 "range-select"일 때만 의미가 있고
  // pointerup에서 selectBlockRange(sourceBlockId, 이 값)로 커밋한다.
  rangeSelectCandidateBlockId: string | null;
  // range-move 모드가 이동할 범위. pointerdown 시점의 getBlockSelection()을
  // 그대로 캡처한다 — 드래그 도중 다른 명령이 선택을 바꾸지 않는다는 전제다.
  rangeSelection: { fromBlockId: string; toBlockId: string } | null;
};

type BlockMenuState = {
  blockId: string;
  left: number;
  top: number;
};

type BlockSideMenuProps = {
  onBlockAdded: (blockId: string) => void;
};

type StoredBlock = ReturnType<
  EditorController["getDocument"]
>["blocks"][number];

// Turn into의 권위는 DOM 투영이 아니라 최신 저장 document다. blockId를
// 안정 ID로 재귀 조회해 top-level·nested block이 같은 descriptor 경로를 쓴다.
// leaf 매핑(type→BlockTypeDescriptor) 자체는 core의 blockTypeDescriptorFromBlock이
// 소유한다(아키텍처 리뷰 6차 후보 L3) — 여기 남는 건 id 재귀 조회뿐이다.
const findBlockTypeDescriptor = (
  blocks: readonly StoredBlock[],
  blockId: string,
): BlockTypeDescriptor | null => {
  for (const block of blocks) {
    if (block.id === blockId) return blockTypeDescriptorFromBlock(block);
    if ("children" in block && block.children !== undefined) {
      const nested = findBlockTypeDescriptor(block.children, blockId);
      if (nested !== null) return nested;
    }
  }
  return null;
};

// usePointerDragGesture의 onMove 콜백에서 쓰는 순수 함수다. 원래는 그
// 4-listener 이펙트 안의 지역 함수였지만, 훅으로 옮기며 콜백이
// useCallback으로 안정화돼야 해서 element를 인자로 받는 모듈 스코프
// 함수로 뽑았다 — 로직 자체는 그대로다.
const computeDragGuide = (
  element: HTMLElement,
  clientY: number,
  current: DragState,
): InsertionGuide | null => {
  const blockElements = Array.from(
    element.querySelectorAll<HTMLElement>("[data-be-block-id]"),
  );
  const ids = blockElements.map((candidate) =>
    candidate.getAttribute("data-be-block-id"),
  );
  const targetIndex = blockElements.findIndex((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  const sourceIndex = ids.indexOf(current.sourceBlockId);
  const effectiveTargetIndex = targetIndex === -1 ? ids.length : targetIndex;
  const isNoop =
    effectiveTargetIndex === sourceIndex ||
    effectiveTargetIndex === sourceIndex + 1;
  if (isNoop) return null;

  const guideElement =
    targetIndex === -1
      ? blockElements[blockElements.length - 1]
      : blockElements[targetIndex];
  if (guideElement === undefined) return null;

  const rect = guideElement.getBoundingClientRect();
  return {
    beforeBlockId: targetIndex === -1 ? null : (ids[targetIndex] ?? null),
    left: rect.left,
    top: targetIndex === -1 ? rect.bottom : rect.top,
    width: rect.width,
  };
};

// core generic-block-commands.ts의 findBlockInTree와 같은 모양의 로컬
// tree-walk다. core 내부 함수라 export되지 않아 import할 수 없다(Issue #38
// 슬라이스7 DELTA-03). own-rect hover 대상이 시작 블록의 실제 인접 형제인지,
// 같은 부모인지(조건1a — flat DOM 인덱스가 아니라 이 트리로 판정해야 한다)를
// 가리는 데 쓴다.
const findBlockInTreeForDrag = (
  blocks: readonly StoredBlock[],
  blockId: string,
): { siblings: readonly StoredBlock[]; index: number } | null => {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index !== -1) return { siblings: blocks, index };
  for (const block of blocks) {
    if (!("children" in block) || block.children === undefined) continue;
    const found = findBlockInTreeForDrag(block.children, blockId);
    if (found !== null) return found;
  }
  return null;
};

// 이미 있는 blockSelection의 범위(from~to, 같은 부모 형제 구간) 안에 blockId가
// 포함되는지 실제 트리 구조로 판정한다. handlePointerDownOnHandle이 드래그
// 모드를 "range-move"로 시작할지 결정하는 데만 쓴다.
const isBlockIdWithinBlockSelection = (
  blocks: readonly StoredBlock[],
  selection: { fromBlockId: string; toBlockId: string },
  blockId: string,
): boolean => {
  const from = findBlockInTreeForDrag(blocks, selection.fromBlockId);
  const to = findBlockInTreeForDrag(blocks, selection.toBlockId);
  const target = findBlockInTreeForDrag(blocks, blockId);
  if (from === null || to === null || target === null) return false;
  if (from.siblings !== to.siblings || from.siblings !== target.siblings) {
    return false;
  }
  const startIndex = Math.min(from.index, to.index);
  const endIndex = Math.max(from.index, to.index);
  return target.index >= startIndex && target.index <= endIndex;
};

// 포인터 클라이언트 좌표가 어느 블록의 own rect(top~bottom 전체) 안에 있는지
// 찾는다. computeDragGuide의 형제 사이 midpoint 판정과는 목적이 다르다 —
// 여기서는 "포인터가 지금 어느 블록 위에 있는가"만 본다(01-계획.md "재드래그로
// 범위 이동 판정 신호" 결정).
const findOwnRectBlockId = (
  element: HTMLElement,
  clientY: number,
): string | null => {
  const blockElements = Array.from(
    element.querySelectorAll<HTMLElement>("[data-be-block-id]"),
  );
  // 자식이 있는 블록은 자기 blockGroup을 DOM 안에 그대로 품는다
  // (blockContainer의 content hole, block-container-extension.ts) — 조상의
  // own rect가 모든 자손의 rect를 감싼다. querySelectorAll은 document
  // order(전위 순회)라 조상이 항상 자손보다 배열 앞에 오므로, 첫 매치를
  // 취하면 자손 영역을 가리켜도 항상 최상위 조상으로 뭉개진다. 형제는
  // 서로 겹치지 않게 세로로 쌓이므로 한 clientY가 속하는 매치들은 조상→
  // 자손 한 사슬뿐이다 — 마지막 매치가 그 사슬에서 가장 깊이 중첩된(가장
  // 구체적인) 블록이다(즉시 리뷰 발견, Issue #38 슬라이스7 DELTA-03).
  let hitId: string | null = null;
  for (const candidate of blockElements) {
    const rect = candidate.getBoundingClientRect();
    if (clientY >= rect.top && clientY < rect.bottom) {
      hitId = candidate.getAttribute("data-be-block-id");
    }
  }
  return hitId;
};

// range-move 모드의 삽입 가이드다. computeDragGuide와 같은 형제 사이 midpoint
// 탐색을 재사용하되(그 함수 자체는 건드리지 않는다 — 단일 블록 재정렬에 계속
// 그대로 쓰인다), no-op 판정을 단일 sourceIndex가 아니라 선택 범위
// [startIndex, endIndex] 전체로 넓힌다 — 범위 안 임의 지점으로의 이동은 전부
// no-op이다(정확한 경계값은 core가 최종 가드, DELTA-03 범위 밖).
const computeRangeMoveDragGuide = (
  element: HTMLElement,
  clientY: number,
  fromBlockId: string,
  toBlockId: string,
): InsertionGuide | null => {
  const blockElements = Array.from(
    element.querySelectorAll<HTMLElement>("[data-be-block-id]"),
  );
  const ids = blockElements.map((candidate) =>
    candidate.getAttribute("data-be-block-id"),
  );
  const targetIndex = blockElements.findIndex((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  const startIndex = ids.indexOf(fromBlockId);
  const endIndex = ids.indexOf(toBlockId);
  const effectiveTargetIndex = targetIndex === -1 ? ids.length : targetIndex;
  const isNoop =
    startIndex !== -1 &&
    endIndex !== -1 &&
    effectiveTargetIndex >= startIndex &&
    effectiveTargetIndex <= endIndex + 1;
  if (isNoop) return null;

  const guideElement =
    targetIndex === -1
      ? blockElements[blockElements.length - 1]
      : blockElements[targetIndex];
  if (guideElement === undefined) return null;

  const rect = guideElement.getBoundingClientRect();
  return {
    beforeBlockId: targetIndex === -1 ? null : (ids[targetIndex] ?? null),
    left: rect.left,
    top: targetIndex === -1 ? rect.bottom : rect.top,
    width: rect.width,
  };
};

// flex 센터링은 IconButton이 공통으로 제공한다.
const blockGutterButtonClassName = "geul-block-gutter__button";

const blockMenuItemClassName = "geul-block-menu__item";

// useDismissOnOutsideOrEscape allow-list. table-handles.tsx,
// table-selection-toolbar.tsx와 같은 이유로 모듈 스코프 상수로 둔다 —
// 매 렌더 새 배열을 넘기면 그 훅의 effect가 리스너를 매 렌더 떼었다
// 다시 붙인다.
const BLOCK_MENU_DISMISS_ALLOW_SELECTORS = [
  "[data-be-block-menu]",
  "[data-be-block-handle]",
] as const;

// usePointerHoverTarget ignore-list. table-handles.tsx와 같은 이유로
// 모듈 스코프 상수로 둔다.
const BLOCK_HOVER_IGNORE_SELECTORS = [
  "[data-be-add-block-button]",
  "[data-be-block-handle]",
  "[data-be-block-menu]",
] as const;

export const BlockSideMenu = ({ onBlockAdded }: BlockSideMenuProps) => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);
  const [dragState, dragStateRef, updateDragState] =
    useMirroredState<DragState | null>(null);
  const [blockMenuState, setBlockMenuState] = useState<BlockMenuState | null>(
    null,
  );
  // 드래그 종료 후 합성 click 억제 + pointerdown 스냅샷 기반 재오픈 판정 —
  // table-handles.tsx와 같은 상태 머신을 공유한다(Issue #52).
  const reopenSuppression = useHandleReopenSuppression();
  const focusEditor = useFocusEditor(element);

  // 리스너를 element가 아닌 document에 둔다. gutter는 contenteditable
  // 바깥의 오버레이라서 element 안쪽에서만 hover를 추적하면 포인터가
  // 버튼으로 이동하는 순간 사라진다 — 등록/해제는 usePointerHoverTarget이
  // 소유한다.
  const handleHoverCandidateChange = useCallback(
    (candidate: HTMLElement | null) => {
      setHoverBlockId(candidate?.getAttribute("data-be-block-id") ?? null);
    },
    [],
  );
  usePointerHoverTarget({
    element,
    ignoreSelectors: BLOCK_HOVER_IGNORE_SELECTORS,
    // table은 자체 행/열 핸들(table-handles.tsx)을 가지므로 이 거터
    // 대상에서 제외한다 — 제외하지 않으면 두 오버레이의 gutter가 표의
    // 왼쪽 부근에서 겹쳐 렌더된다.
    entitySelector: "[data-be-block-id]:not(table)",
    onCandidateChange: handleHoverCandidateChange,
  });

  const isDragging = dragState !== null;

  // 네이티브 drag는 CDP 자동화에서 OS 레벨로 제어권이 넘어가는 환경이
  // 있으므로 Pointer Event로 재정렬한다. 실제 drag 뒤 브라우저가 합성하는
  // click은 메뉴 열기로 해석하지 않는다. pointerId 게이트, listener
  // 등록/해제, keydown(Escape) 분기는 usePointerDragGesture가 맡는다
  // (table-handles.tsx의 재정렬·리사이즈와 같은 훅).
  const handleBlockDragMove = useCallback(
    (event: PointerEvent) => {
      if (element === null) return;
      const current = dragStateRef.current;
      if (current === null) return;
      const hasDragged =
        current.hasDragged ||
        Math.hypot(
          event.clientX - current.startX,
          event.clientY - current.startY,
        ) >= 4;

      // 클릭으로 해석될 짧은 이동(조건8)에는 어떤 새 판정도 발동하지 않는다
      // — hasDragged가 false인 동안은 guide/후보를 그대로 null로 둔다.
      if (!hasDragged) {
        updateDragState({ ...current, hasDragged });
        return;
      }

      // range-move: pointerdown 시점에 이미 결정된 모드다(조건4). 이동 내내
      // 유지되며, 가이드만 범위 기준 no-op 판정으로 다시 계산한다(조건6).
      if (current.mode === "range-move") {
        const guide =
          current.rangeSelection === null
            ? null
            : computeRangeMoveDragGuide(
                element,
                event.clientY,
                current.rangeSelection.fromBlockId,
                current.rangeSelection.toBlockId,
              );
        updateDragState({ ...current, hasDragged, guide });
        return;
      }

      // reorder 진입점: own-rect hover 대상이 실제(트리) 인접 형제면 기존
      // 재정렬 guide를 그대로 쓰고(조건1·1a), 인접하지 않은 같은 부모 형제면
      // range-select 후보로 전환하며(조건2), 다른 부모거나 hover 대상이
      // 없으면 기존 computeDragGuide 폴백을 유지한다(조건3).
      const documentBlocks = editor.getDocument().blocks;
      const hoveredBlockId = findOwnRectBlockId(element, event.clientY);
      const sourceLocation = findBlockInTreeForDrag(
        documentBlocks,
        current.sourceBlockId,
      );
      const hoveredLocation =
        hoveredBlockId === null
          ? null
          : findBlockInTreeForDrag(documentBlocks, hoveredBlockId);
      const isSameParentNonAdjacentSibling =
        hoveredBlockId !== null &&
        hoveredBlockId !== current.sourceBlockId &&
        hoveredLocation !== null &&
        sourceLocation !== null &&
        hoveredLocation.siblings === sourceLocation.siblings &&
        Math.abs(hoveredLocation.index - sourceLocation.index) !== 1;

      updateDragState(
        isSameParentNonAdjacentSibling
          ? {
              ...current,
              hasDragged,
              mode: "range-select",
              guide: null,
              rangeSelectCandidateBlockId: hoveredBlockId,
            }
          : {
              ...current,
              hasDragged,
              mode: "reorder",
              guide: computeDragGuide(element, event.clientY, current),
              rangeSelectCandidateBlockId: null,
            },
      );
    },
    [element, dragStateRef, updateDragState, editor],
  );

  const handleBlockDragUp = useCallback(() => {
    const current = dragStateRef.current;
    if (current === null) return;
    if (!current.cancelled) {
      if (current.mode === "range-move") {
        if (current.guide !== null) {
          editor.commands.moveSelectedBlocksBefore(current.guide.beforeBlockId);
        }
      } else if (current.mode === "range-select") {
        if (current.rangeSelectCandidateBlockId !== null) {
          editor.commands.selectBlockRange(
            current.sourceBlockId,
            current.rangeSelectCandidateBlockId,
          );
        }
      } else if (current.guide !== null) {
        editor.commands.moveBlockBefore(
          current.sourceBlockId,
          current.guide.beforeBlockId,
        );
      }
    }
    if (current.hasDragged || current.cancelled) {
      reopenSuppression.markSuppressed(current.sourceBlockId);
    }
    updateDragState(null);
  }, [editor, dragStateRef, updateDragState, reopenSuppression]);

  const handleBlockDragCancel = useCallback(() => {
    const current = dragStateRef.current;
    if (current === null) return;
    if (current.hasDragged || current.cancelled) {
      reopenSuppression.markSuppressed(current.sourceBlockId);
    }
    updateDragState(null);
  }, [dragStateRef, updateDragState, reopenSuppression]);

  const handleBlockDragEscape = useCallback(
    (event: KeyboardEvent): true => {
      event.preventDefault();
      const current = dragStateRef.current;
      if (current !== null) {
        updateDragState({ ...current, cancelled: true, guide: null });
      }
      return true;
    },
    [dragStateRef, updateDragState],
  );

  usePointerDragGesture({
    active: isDragging,
    element,
    pointerId: dragState?.pointerId ?? null,
    onMove: handleBlockDragMove,
    onUp: handleBlockDragUp,
    onCancel: handleBlockDragCancel,
    onEscape: handleBlockDragEscape,
  });

  // 블록 메뉴는 바깥 pointerdown과 Escape로 닫는다(G-TST-001: 키보드로
  // 닫는 UI는 병렬 e2e로 검증한다). 리스너 등록/해제는
  // useDismissOnOutsideOrEscape가 소유한다 — table-handles.tsx,
  // table-selection-toolbar.tsx와 같은 훅이다(Issue #20, #45).
  const dismissBlockMenu = useCallback(() => setBlockMenuState(null), []);
  const closeBlockMenu = useCallback(() => {
    setBlockMenuState(null);
    focusEditor();
  }, [focusEditor]);
  useDismissOnOutsideOrEscape({
    active: blockMenuState !== null,
    element,
    allowSelectors: BLOCK_MENU_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss: dismissBlockMenu,
    onEscapeDismiss: closeBlockMenu,
  });

  useEffect(() => {
    if (element === null) return;
    const ownerWindow = element.ownerDocument.defaultView;
    if (ownerWindow === null) return;

    const refreshBlockMenuGeometry = () => {
      setBlockMenuState((current) => {
        if (current === null) return null;
        const blockElement = findElementByAttribute(
          element,
          null,
          "data-be-block-id",
          current.blockId,
        );
        if (blockElement === null) return current;
        const rect = blockElement.getBoundingClientRect();
        const left = rect.left;
        const top = rect.top + 28;
        return current.left === left && current.top === top
          ? current
          : { ...current, left, top };
      });
    };

    ownerWindow.addEventListener("scroll", refreshBlockMenuGeometry, true);
    ownerWindow.addEventListener("resize", refreshBlockMenuGeometry);
    return () => {
      ownerWindow.removeEventListener("scroll", refreshBlockMenuGeometry, true);
      ownerWindow.removeEventListener("resize", refreshBlockMenuGeometry);
    };
  }, [element]);

  const hoverBounds = (() => {
    if (hoverBlockId === null || element === null) return null;
    const blockElement = findElementByAttribute(
      element,
      null,
      "data-be-block-id",
      hoverBlockId,
    );
    if (blockElement === null) return null;
    const rect = blockElement.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  })();

  const gutterClamp = useClampedMenuPosition(
    hoverBounds?.left ?? 0,
    hoverBounds?.top ?? 0,
    "leftOfAnchor",
  );
  const blockMenuClamp = useClampedMenuPosition(
    blockMenuState?.left ?? 0,
    blockMenuState?.top ?? 0,
  );
  const blockTypeOptions = (() => {
    if (blockMenuState === null) return BLOCK_TYPE_OPTIONS;
    const source = findBlockTypeDescriptor(
      editor.getDocument().blocks,
      blockMenuState.blockId,
    );
    return source === null ? [] : getBlockTypeOptionsForSource(source);
  })();
  // Indent/Outdent 비활성 판정은 core의 getBlockNestingActionState 한 곳을
  // 공유한다(formatting-toolbar.tsx와 같은 관용구, Issue #126) — 표는 이
  // gutter의 hover 대상에서 이미 제외돼 blockMenuState.blockId가 표를 가리킬
  // 일이 없다.
  const nestingActions =
    blockMenuState === null
      ? null
      : editor.getBlockNestingActionState(blockMenuState.blockId);

  const handleAddBlockClick = () => {
    if (hoverBlockId === null) return;
    const result = editor.commands.insertParagraphAfter(hoverBlockId);
    setHoverBlockId(null);
    if (result.ok) onBlockAdded(result.value.blockId);
  };

  const handlePointerDownOnHandle = (
    event: React.PointerEvent<HTMLButtonElement>,
    blockId: string,
  ) => {
    if (event.button !== 0) return;
    reopenSuppression.onPointerDown(
      blockMenuState !== null && blockMenuState.blockId === blockId
        ? blockId
        : null,
    );
    event.currentTarget.setPointerCapture(event.pointerId);
    setBlockMenuState(null);

    // 이미 blockSelection이 있고 그 범위 안 blockId의 handle을 눌렀다면
    // "범위 이동"으로 시작한다(조건4) — 아니면 기존과 같은 단일 재정렬
    // 진입점("reorder")이다.
    const existingSelection = editor.getBlockSelection();
    const isRangeMove =
      existingSelection !== null &&
      isBlockIdWithinBlockSelection(
        editor.getDocument().blocks,
        existingSelection,
        blockId,
      );

    // range-move만 propagation을 끊는다. BlockSelectionToolbar의
    // useDismissOnOutsideOrEscape가 document pointerdown을 "바깥 클릭"으로
    // 판정해 clearBlockSelection을 먼저 실행하면, 뒤이은
    // moveSelectedBlocksBefore가 core에서 getBlockSelection()===null을
    // 만나 COMMAND_NOT_APPLICABLE로 거절된다(e2e 실측 발견, Issue #38
    // 슬라이스7 DELTA-05 즉시 리뷰 MAJOR-1). 범위 밖 blockId의 handle
    // pointerdown(평범한 재정렬 진입점)은 여기서 걸러지지 않으므로 여전히
    // "바깥"으로 전파돼 stale 선택을 지운다(DELTA-04 완료 조건 8 보존) —
    // allow-list로는 이 둘을 구분할 수 없어(handle은 블록마다가 아니라
    // hover 중인 블록 하나에만 있는 공용 버튼) 호출부에서 조건부로 끊는다.
    if (isRangeMove) event.stopPropagation();

    updateDragState({
      pointerId: event.pointerId,
      sourceBlockId: blockId,
      startX: event.clientX,
      startY: event.clientY,
      hasDragged: false,
      cancelled: false,
      guide: null,
      mode: isRangeMove ? "range-move" : "reorder",
      rangeSelectCandidateBlockId: null,
      rangeSelection: isRangeMove ? existingSelection : null,
    });
  };

  const handleHandleClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    blockId: string,
  ) => {
    // suppressionKey/reopenKey 둘 다 blockId다 — 블록은 별도 위치 축이
    // 없다(table-handles.tsx의 index와 달리). 트리거 버튼도 onMouseDown
    // preventDefault라 초점을 받지 않는다 — 재클릭 닫기에는 바깥 클릭과
    // 달리 "돌아갈 다른 목적지"가 없다. Escape와 같은 그룹으로 다뤄
    // closeBlockMenu(초점 복구 포함)를 재사용한다(G-UI-001, Issue #52).
    resolveReopenAwareClick(
      reopenSuppression,
      event,
      {
        suppressionKey: blockId,
        reopenKey: blockId,
        isCurrentlyOpen:
          blockMenuState !== null && blockMenuState.blockId === blockId,
      },
      {
        onOpen: () => {
          if (hoverBounds === null) return;
          setBlockMenuState({
            blockId,
            left: hoverBounds.left,
            top: hoverBounds.top + 28,
          });
        },
        onClose: closeBlockMenu,
      },
    );
  };

  const handleTurnInto = (item: BlockTypeOption) => {
    if (blockMenuState === null) return;
    const source = findBlockTypeDescriptor(
      editor.getDocument().blocks,
      blockMenuState.blockId,
    );
    const isAllowed =
      source !== null &&
      getBlockTypeOptionsForSource(source).some(
        (option) => option.id === item.id,
      );
    if (isAllowed) {
      editor.commands.setBlockType(blockMenuState.blockId, item.blockType);
    }
    closeBlockMenu();
  };

  const handleIndentBlock = () => {
    if (blockMenuState === null) return;
    editor.commands.indentBlock(blockMenuState.blockId);
    closeBlockMenu();
  };

  const handleOutdentBlock = () => {
    if (blockMenuState === null) return;
    editor.commands.outdentBlock(blockMenuState.blockId);
    closeBlockMenu();
  };

  const handleDuplicate = () => {
    if (blockMenuState === null) return;
    editor.commands.duplicateBlock(blockMenuState.blockId);
    closeBlockMenu();
  };

  const handleDeleteBlock = () => {
    if (blockMenuState === null) return;
    editor.commands.deleteBlock(blockMenuState.blockId);
    closeBlockMenu();
  };

  return (
    <>
      {hoverBounds !== null && hoverBlockId !== null && (
        <div
          className="geul-block-gutter"
          ref={gutterClamp.menuRef}
          style={gutterClamp.style}
        >
          <IconButton
            className={`${blockGutterButtonClassName} geul-block-gutter__button--drag`}
            data-be-block-handle=""
            icon={dragHandleIcon}
            label={dragHandleLabel}
            onClick={(event) => handleHandleClick(event, hoverBlockId)}
            onPointerDown={(event) =>
              handlePointerDownOnHandle(event, hoverBlockId)
            }
          />
          <IconButton
            className={`${blockGutterButtonClassName} geul-block-gutter__button--add`}
            data-be-add-block-button=""
            icon={addBlockIcon}
            label={addBlockLabel}
            onClick={handleAddBlockClick}
          />
        </div>
      )}
      {/* 드롭 가이드 라인은 클릭 대상이 아니라 드래그 중인 블록이 놓일
          위치를 그대로 보여주는 시각 표시다(pointer-events-none).
          useClampedMenuPosition으로 접어 넣으면 실제 삽입 지점과 라인이
          어긋나 사용자에게 잘못된 위치를 알려주므로, 이 오버레이는
          PIT-0011 클램프 마이그레이션 대상에서 제외한다(#43). */}
      {dragState?.guide !== null && dragState?.guide !== undefined && (
        <div
          className="geul-block-insertion-guide"
          data-be-block-insertion-guide=""
          style={{
            left: dragState.guide.left,
            top: dragState.guide.top,
            width: dragState.guide.width,
          }}
        />
      )}
      {/* max-h-[calc(100vh-1rem)] + overflow-y-auto: 클램프는 좌표만 접으므로
          뷰포트보다 큰 메뉴는 아래쪽 항목에 닿을 수 없다(PIT-0011 예방 규칙).
          1rem은 useClampedMenuPosition의 MENU_VIEWPORT_MARGIN 8px가 위·아래로
          두 번 들어간 값이라 클램프 결과와 정확히 맞물린다. R2에서 블록 타입
          목록이 늘면 일반 뷰포트에서도 넘친다. */}
      {blockMenuState !== null && (
        <div
          aria-label="Block menu"
          className="geul-block-menu"
          data-be-block-menu=""
          ref={blockMenuClamp.menuRef}
          role="menu"
          style={blockMenuClamp.style}
        >
          <p className="geul-block-menu__label">Turn into</p>
          {blockTypeOptions.map((option) => (
            <MenuItemButton
              className={blockMenuItemClassName}
              key={option.id}
              onClick={() => handleTurnInto(option)}
            >
              {option.label}
            </MenuItemButton>
          ))}
          {/* mx-0(SCSS margin-inline: 0)에 대응: preflight 미포함이라 UA의
              margin-inline auto가 남으면 flex column에서 hr이 0폭으로
              붕괴한다 */}
          <hr className="geul-block-menu__divider" />
          <MenuItemButton
            className={blockMenuItemClassName}
            disabled={nestingActions?.canIndent !== true}
            onClick={handleIndentBlock}
          >
            Indent
          </MenuItemButton>
          <MenuItemButton
            className={blockMenuItemClassName}
            disabled={nestingActions?.canOutdent !== true}
            onClick={handleOutdentBlock}
          >
            Outdent
          </MenuItemButton>
          <MenuItemButton
            className={blockMenuItemClassName}
            onClick={handleDuplicate}
          >
            Duplicate
          </MenuItemButton>
          <MenuItemButton
            className={`${blockMenuItemClassName} geul-block-menu__item--danger`}
            onClick={handleDeleteBlock}
          >
            Delete
          </MenuItemButton>
        </div>
      )}
    </>
  );
};
