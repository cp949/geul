import type { BlockTypeDescriptor, EditorController } from "@cp949/geul-core";
import {
  Bold,
  Code,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Strikethrough,
  Underline,
} from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";

import {
  BLOCK_TYPE_OPTIONS,
  blockTypeToOptionId,
} from "./block-type-options.js";
import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useEditor, useEditorMount } from "./use-editor.js";

type SelectionMark = ReturnType<EditorController["getSelectionMarks"]>[number];

// 아이콘 element를 모듈 레벨 상수로 만들어 두면 매 렌더에서 같은 참조가
// 재사용되어 React가 아이콘 subtree 재렌더를 통째로 건너뛴다. 툴바는 표시 중
// scroll·selectionchange·keyup마다 재렌더되므로 렌더당 아이콘 비용을 없앤다.
const toolbarButtons: ReadonlyArray<{
  mark: SelectionMark;
  label: string;
  icon: ReactElement;
  toggle: (editor: EditorController) => void;
}> = [
  {
    mark: "bold",
    label: "Bold",
    icon: <Bold {...iconProps} />,
    toggle: (editor) => void editor.commands.toggleBold(),
  },
  {
    mark: "italic",
    label: "Italic",
    icon: <Italic {...iconProps} />,
    toggle: (editor) => void editor.commands.toggleItalic(),
  },
  {
    mark: "underline",
    label: "Underline",
    icon: <Underline {...iconProps} />,
    toggle: (editor) => void editor.commands.toggleUnderline(),
  },
  {
    mark: "strike",
    label: "Strikethrough",
    icon: <Strikethrough {...iconProps} />,
    toggle: (editor) => void editor.commands.toggleStrike(),
  },
  {
    mark: "code",
    label: "Inline code",
    icon: <Code {...iconProps} />,
    toggle: (editor) => void editor.commands.toggleCode(),
  },
];

// indentBlock/outdentBlock은 mark가 아니라 1회성 블록 액션이라 위 배열의
// 형태(mark 키, aria-pressed 눌림 상태)에 맞지 않는다 — 별도 아이콘
// 상수·버튼 그룹으로 둔다(DELTA-05). 아이콘 element를 모듈 상수로 두는
// 이유는 toolbarButtons와 동일하다(재렌더 시 참조 안정).
const indentIcon = <IndentIncrease {...iconProps} />;
const outdentIcon = <IndentDecrease {...iconProps} />;

type ToolbarState = {
  activeMarks: SelectionMark[];
  blockSelection: { blockId: string; blockType: BlockTypeDescriptor } | null;
  left: number;
  top: number;
};

/**
 * 서식 툴바가 추적한 자기 에디터 Range를 DOM selection으로 복원한다.
 * 이미 교체된 노드를 가리키는 Range나 다른 에디터의 Range는 적용하지 않는다.
 */
const restoreEditorSelection = (
  element: HTMLElement | null,
  range: Range | null,
) => {
  const selection = element?.ownerDocument.getSelection();
  if (
    element === null ||
    range === null ||
    selection === undefined ||
    selection === null ||
    !element.contains(range.startContainer) ||
    !element.contains(range.endContainer)
  ) {
    return;
  }

  selection.removeAllRanges();
  selection.addRange(range);
};

export const FormattingToolbar = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [toolbarState, setToolbarState] = useState<ToolbarState | null>(null);
  const trackedRange = useRef<Range | null>(null);

  useEffect(() => {
    const updateFromSelection = () => {
      const selection = element?.ownerDocument.getSelection();
      if (
        element === null ||
        selection === undefined ||
        selection === null ||
        selection.rangeCount === 0 ||
        selection.isCollapsed ||
        selection.anchorNode === null ||
        selection.focusNode === null ||
        !element.contains(selection.anchorNode) ||
        !element.contains(selection.focusNode)
      ) {
        setToolbarState(null);
        return;
      }

      const range = selection.getRangeAt(0);
      trackedRange.current = range.cloneRange();
      const bounds = range.getBoundingClientRect?.() ?? {
        left: 0,
        top: 0,
        width: 0,
      };
      setToolbarState({
        activeMarks: editor.getSelectionMarks(),
        blockSelection: editor.getSelectionBlockType(),
        left: bounds.left + bounds.width / 2,
        top: bounds.top,
      });
    };

    const ownerDocument = element?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    ownerDocument?.addEventListener("selectionchange", updateFromSelection);
    ownerDocument?.addEventListener("mouseup", updateFromSelection);
    ownerDocument?.addEventListener("keyup", updateFromSelection);
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
      ownerWindow?.removeEventListener("scroll", updateFromSelection, true);
      ownerWindow?.removeEventListener("resize", updateFromSelection);
    };
  }, [editor, element]);

  const { menuRef, style } = useClampedMenuPosition(
    toolbarState?.left ?? 0,
    toolbarState?.top ?? 0,
    "centerAbove",
  );

  if (toolbarState === null) return null;

  return (
    <div
      aria-label="Formatting"
      className="geul-formatting-toolbar"
      ref={menuRef}
      role="toolbar"
      style={style}
    >
      {toolbarState.blockSelection !== null && (
        <select
          aria-label="Block type"
          className="geul-formatting-toolbar__select"
          onChange={(event) => {
            const blockSelection = toolbarState.blockSelection;
            if (blockSelection === null) return;
            const option = BLOCK_TYPE_OPTIONS.find(
              (candidate) => candidate.id === event.currentTarget.value,
            );
            if (option === undefined) return;
            editor.commands.setBlockType(
              blockSelection.blockId,
              option.blockType,
            );
            setToolbarState((current) =>
              current === null
                ? null
                : {
                    ...current,
                    blockSelection: editor.getSelectionBlockType(),
                  },
            );
          }}
          onMouseDown={(event) => event.preventDefault()}
          value={blockTypeToOptionId(toolbarState.blockSelection.blockType)}
        >
          {BLOCK_TYPE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      {toolbarState.blockSelection !== null && (
        <>
          {/* 표 셀 안에서는 blockSelection이 이미 null이라(기존 동작,
              getSelectionBlockType) 위 블록 타입 select와 같은 게이트를
              재사용하는 것만으로 셀 안 자동 숨김이 성립한다(DELTA-05) —
              별도 코드 불필요. aria-pressed는 쓰지 않는다: 토글 상태가
              없는 1회성 액션 버튼이다. */}
          <IconButton
            className="geul-formatting-toolbar__mark-button"
            icon={indentIcon}
            key="indent"
            label="Indent"
            onClick={() => {
              const blockSelection = toolbarState.blockSelection;
              if (blockSelection === null) return;
              // Result 실패(COMMAND_NOT_APPLICABLE 등)는 기존 mark
              // 버튼과 같은 방식으로 조용히 버린다 — Tab 키 경로(D9)와
              // 동일선상.
              editor.commands.indentBlock(blockSelection.blockId);
            }}
          />
          <IconButton
            className="geul-formatting-toolbar__mark-button"
            icon={outdentIcon}
            key="outdent"
            label="Outdent"
            onClick={() => {
              const blockSelection = toolbarState.blockSelection;
              if (blockSelection === null) return;
              editor.commands.outdentBlock(blockSelection.blockId);
            }}
          />
        </>
      )}
      {toolbarButtons.map(({ mark, label, icon, toggle }) => (
        <IconButton
          aria-pressed={toolbarState.activeMarks.includes(mark)}
          className="geul-formatting-toolbar__mark-button"
          icon={icon}
          key={mark}
          label={label}
          onClick={(event) => {
            // 키보드로 활성화한 button click은 WebKit에서 편집기의 DOM
            // selection을 잃을 수 있다. 툴바가 표시될 때 자기 에디터에서
            // 추적한 Range만 command 전에 복원한다. 포인터 click(detail > 0)은
            // IconButton의 mousedown 기본 동작 억제 계약을 그대로 사용한다.
            if (event.detail === 0) {
              restoreEditorSelection(element, trackedRange.current);
            }
            toggle(editor);
            setToolbarState((current) =>
              current === null
                ? null
                : { ...current, activeMarks: editor.getSelectionMarks() },
            );
          }}
        />
      ))}
    </div>
  );
};
