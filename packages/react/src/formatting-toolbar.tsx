import type { BlockTypeDescriptor, EditorController } from "@cp949/geul-core";
import { Bold, Code, Italic, Strikethrough, Underline } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";

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

type ToolbarState = {
  activeMarks: SelectionMark[];
  blockSelection: { blockId: string; blockType: BlockTypeDescriptor } | null;
  left: number;
  top: number;
};

export const FormattingToolbar = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [toolbarState, setToolbarState] = useState<ToolbarState | null>(null);

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
      {toolbarButtons.map(({ mark, label, icon, toggle }) => (
        <IconButton
          aria-pressed={toolbarState.activeMarks.includes(mark)}
          className="geul-formatting-toolbar__mark-button"
          icon={icon}
          key={mark}
          label={label}
          onClick={() => {
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
