import type { EditorController } from "@cp949/geul-core";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import { useTableCommandFeedback } from "./use-table-command-feedback.js";

const deleteLabel = "Delete selected blocks";
const moveUpLabel = "Move selection up";
const moveDownLabel = "Move selection down";

const deleteIcon = <Trash2 {...iconProps} />;
const moveUpIcon = <ArrowUp {...iconProps} />;
const moveDownIcon = <ArrowDown {...iconProps} />;

const buttonClassName = "geul-block-selection-toolbar__button";
const dangerButtonClassName =
  "geul-block-selection-toolbar__button geul-block-selection-toolbar__button--danger";
const actionErrorClassName = "geul-block-selection-toolbar__error";
const highlightClassName = "geul-block-selection-toolbar__highlight";

// useDismissOnOutsideOrEscape allow-list. table-selection-toolbar.tsx,
// block-side-menu.tsx와 같은 이유로 모듈 스코프 상수로 둔다 — 매 렌더 새
// 배열을 넘기면 그 훅의 effect가 리스너를 매 렌더 떼었다 다시 붙인다.
const BLOCK_SELECTION_TOOLBAR_DISMISS_ALLOW_SELECTORS = [
  "[data-be-block-selection-toolbar]",
] as const;

type StoredBlock = ReturnType<
  EditorController["getDocument"]
>["blocks"][number];

type SelectionHighlight = {
  blockId: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type ToolbarState = {
  left: number;
  top: number;
  highlights: SelectionHighlight[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  moveUpBeforeBlockId: string | null;
  moveDownBeforeBlockId: string | null;
};

// core generic-block-commands.ts의 findBlockInTree, block-side-menu.tsx의
// findBlockInTreeForDrag와 같은 모양의 로컬 tree-walk다. core 내부 함수라
// export되지 않아 import할 수 없다(Issue #38 슬라이스7 DELTA-04). 위/아래
// 이동 버튼의 활성 여부(완료 조건 7)와 beforeBlockId 계산(완료 조건 5·6)에
// 쓴다 — 이 판정은 DOM 순서가 아니라 실제 문서 트리의 형제 배열 기준이어야
// 한다.
const findBlockInTreeForSelection = (
  blocks: readonly StoredBlock[],
  blockId: string,
): { siblings: readonly StoredBlock[]; index: number } | null => {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index !== -1) return { siblings: blocks, index };
  for (const block of blocks) {
    if (!("children" in block) || block.children === undefined) continue;
    const found = findBlockInTreeForSelection(block.children, blockId);
    if (found !== null) return found;
  }
  return null;
};

/**
 * blockSelection(같은 부모 형제 범위의 다중 블록 선택, DELTA-01)이 있을 때
 * 뜨는 플로팅 툴바. 삭제·위로 이동·아래로 이동 버튼을 노출하고, 선택 범위에
 * 속하는 각 블록 위에 이 컴포넌트가 소유하는 자체 하이라이트 오버레이를
 * 그린다 — PM이 렌더링한 `[data-be-block-id]` 노드 자체를 mutate하지
 * 않는다(spec §5.3, DELTA-04 트랙-4 확인사항: PM 재조정 시 수동으로 붙인
 * class가 소리 없이 사라지는 회귀를 피한다). 배치·해제 원칙은
 * TableSelectionToolbar와 같다(spec 6.3). SlashMenu가 TableSelectionToolbar
 * 등과 함께 자동 마운트한다(공개 export 없음).
 */
export const BlockSelectionToolbar = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [toolbarState, setToolbarState] = useState<ToolbarState | null>(null);
  const focusEditor = useFocusEditor(element);
  const { actionError, runCommand } = useTableCommandFeedback();

  // 폴링(선택 이벤트)과 명령 성공 콜백(완료 조건 5·6 — DOM이 이미 갱신된
  // 뒤 네이티브 이벤트를 기다리지 않고 즉시 재조회) 양쪽이 같은 함수를
  // 부른다 — 아래 effect뿐 아니라 handleMoveUp/handleMoveDown/handleDelete의
  // onSuccess로도 넘기므로 useCallback으로 안정화한다.
  const updateFromSelection = useCallback(() => {
    if (element === null) {
      setToolbarState(null);
      return;
    }
    const selection = editor.getBlockSelection();
    if (selection === null) {
      setToolbarState(null);
      return;
    }

    // 하이라이트 범위는 spec이 명시한 대로 DOM 순서([data-be-block-id]의
    // querySelectorAll 순서) 기준이다 — 아래 위/아래 버튼 판정에 쓰는 문서
    // 트리 인덱스와는 별개다.
    const blockElements = Array.from(
      element.querySelectorAll<HTMLElement>("[data-be-block-id]"),
    );
    const domIds = blockElements.map((candidate) =>
      candidate.getAttribute("data-be-block-id"),
    );
    const fromDomIndex = domIds.indexOf(selection.fromBlockId);
    const toDomIndex = domIds.indexOf(selection.toBlockId);
    if (fromDomIndex === -1 || toDomIndex === -1) {
      setToolbarState(null);
      return;
    }
    const rangeStart = Math.min(fromDomIndex, toDomIndex);
    const rangeEnd = Math.max(fromDomIndex, toDomIndex);
    const rangeElements = blockElements.slice(rangeStart, rangeEnd + 1);
    if (rangeElements.length === 0) {
      setToolbarState(null);
      return;
    }

    const rects = rangeElements.map((candidate) =>
      candidate.getBoundingClientRect(),
    );
    const highlights: SelectionHighlight[] = rangeElements.map(
      (candidate, index) => {
        const rect = rects[index];
        return {
          blockId: candidate.getAttribute("data-be-block-id") ?? "",
          left: rect?.left ?? 0,
          top: rect?.top ?? 0,
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
        };
      },
    );
    const anchorLeft = Math.min(...rects.map((rect) => rect.left));
    const anchorRight = Math.max(...rects.map((rect) => rect.right));
    const anchorTop = Math.min(...rects.map((rect) => rect.top));

    // 위/아래 이동 버튼의 활성 여부와 beforeBlockId는 DOM이 아니라 실제
    // 문서 트리 기준이다(완료 조건 7) — findBlockInTreeForSelection으로
    // fromBlockId/toBlockId가 속한 형제 배열에서의 위치를 다시 구한다.
    const documentBlocks = editor.getDocument().blocks;
    const fromLocation = findBlockInTreeForSelection(
      documentBlocks,
      selection.fromBlockId,
    );
    const toLocation = findBlockInTreeForSelection(
      documentBlocks,
      selection.toBlockId,
    );
    if (
      fromLocation === null ||
      toLocation === null ||
      fromLocation.siblings !== toLocation.siblings
    ) {
      setToolbarState(null);
      return;
    }
    const siblings = fromLocation.siblings;
    const startIndex = Math.min(fromLocation.index, toLocation.index);
    const endIndex = Math.max(fromLocation.index, toLocation.index);
    const canMoveUp = startIndex > 0;
    const canMoveDown = endIndex < siblings.length - 1;
    // 위로 이동: 범위 시작 blockId의 바로 앞 형제 앞으로 옮긴다.
    const moveUpBeforeBlockId = canMoveUp
      ? (siblings[startIndex - 1]?.id ?? null)
      : null;
    // 아래로 이동: 바로 다음 형제 뒤로 옮기려면 그 형제의 다음 형제
    // 앞으로(beforeBlockId) 옮긴다 — 더 없으면 null(맨 뒤로 이동).
    const moveDownBeforeBlockId = canMoveDown
      ? endIndex + 2 < siblings.length
        ? (siblings[endIndex + 2]?.id ?? null)
        : null
      : null;

    setToolbarState({
      left: (anchorLeft + anchorRight) / 2,
      top: anchorTop,
      highlights,
      canMoveUp,
      canMoveDown,
      moveUpBeforeBlockId,
      moveDownBeforeBlockId,
    });
  }, [editor, element]);

  useEffect(() => {
    const ownerDocument = element?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    ownerDocument?.addEventListener("selectionchange", updateFromSelection);
    ownerDocument?.addEventListener("mouseup", updateFromSelection);
    ownerDocument?.addEventListener("keyup", updateFromSelection);
    // 핸들 드래그(BlockSideMenu, DELTA-03)가 pointerup에서
    // selectBlockRange/moveSelectedBlocksBefore를 커밋한다 — 이 컴포넌트도
    // pointer 기반 드래그 종료를 잡아야 한다.
    ownerDocument?.addEventListener("pointerup", updateFromSelection);
    ownerWindow?.addEventListener("scroll", updateFromSelection, true);
    ownerWindow?.addEventListener("resize", updateFromSelection);
    updateFromSelection();
    return () => {
      ownerDocument?.removeEventListener(
        "selectionchange",
        updateFromSelection,
      );
      ownerDocument?.removeEventListener("mouseup", updateFromSelection);
      ownerDocument?.removeEventListener("keyup", updateFromSelection);
      ownerDocument?.removeEventListener("pointerup", updateFromSelection);
      ownerWindow?.removeEventListener("scroll", updateFromSelection, true);
      ownerWindow?.removeEventListener("resize", updateFromSelection);
    };
  }, [updateFromSelection, element]);

  // 바깥 pointerdown/Escape로 선택을 해제한다(G-UI-001). clearBlockSelection은
  // selectionchange 같은 네이티브 이벤트를 일으키지 않는 세션 필드
  // 변경이라(DELTA-01), 두 dismiss 콜백 모두 명령 호출 뒤 직접
  // updateFromSelection을 다시 불러야 툴바가 사라진다.
  const dismissSelection = useCallback(() => {
    editor.commands.clearBlockSelection();
    updateFromSelection();
  }, [editor, updateFromSelection]);
  const dismissSelectionAndFocusEditor = useCallback(() => {
    dismissSelection();
    focusEditor();
  }, [dismissSelection, focusEditor]);
  useDismissOnOutsideOrEscape({
    active: toolbarState !== null,
    element,
    allowSelectors: BLOCK_SELECTION_TOOLBAR_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss: dismissSelection,
    onEscapeDismiss: dismissSelectionAndFocusEditor,
  });

  const { menuRef, style } = useClampedMenuPosition(
    toolbarState?.left ?? 0,
    toolbarState?.top ?? 0,
    "centerAbove",
  );

  if (toolbarState === null) return null;

  const handleMoveUp = () => {
    if (!toolbarState.canMoveUp) return;
    runCommand(
      () =>
        editor.commands.moveSelectedBlocksBefore(
          toolbarState.moveUpBeforeBlockId,
        ),
      updateFromSelection,
    );
  };
  const handleMoveDown = () => {
    if (!toolbarState.canMoveDown) return;
    runCommand(
      () =>
        editor.commands.moveSelectedBlocksBefore(
          toolbarState.moveDownBeforeBlockId,
        ),
      updateFromSelection,
    );
  };
  const handleDelete = () => {
    runCommand(
      () => editor.commands.deleteSelectedBlocks(),
      updateFromSelection,
    );
  };

  return (
    <>
      {toolbarState.highlights.map((highlight) => (
        <div
          className={highlightClassName}
          data-be-block-selection-highlight=""
          data-be-highlighted-block-id={highlight.blockId}
          key={highlight.blockId}
          style={{
            left: highlight.left,
            top: highlight.top,
            width: highlight.width,
            height: highlight.height,
          }}
        />
      ))}
      <div
        aria-label="Block selection"
        className="geul-block-selection-toolbar"
        data-be-block-selection-toolbar=""
        ref={menuRef}
        role="toolbar"
        style={style}
      >
        <IconButton
          className={buttonClassName}
          disabled={!toolbarState.canMoveUp}
          icon={moveUpIcon}
          label={moveUpLabel}
          onClick={handleMoveUp}
        />
        <IconButton
          className={buttonClassName}
          disabled={!toolbarState.canMoveDown}
          icon={moveDownIcon}
          label={moveDownLabel}
          onClick={handleMoveDown}
        />
        <IconButton
          className={dangerButtonClassName}
          icon={deleteIcon}
          label={deleteLabel}
          onClick={handleDelete}
        />
        {actionError !== null && (
          <span className={actionErrorClassName} role="alert">
            {actionError.code}
          </span>
        )}
      </div>
    </>
  );
};
