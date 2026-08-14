import type { BlockTypeDescriptor, EditorController } from "@cp949/geul-core";
import { useEffect, useState } from "react";

import {
  BLOCK_TYPE_OPTIONS,
  blockTypeToOptionId,
} from "./block-type-options.js";
import { useEditor, useEditorMount } from "./use-editor.js";

type SelectionMark = ReturnType<EditorController["getSelectionMarks"]>[number];

const toolbarButtons: ReadonlyArray<{
  mark: SelectionMark;
  label: string;
  glyph: string;
  toggle: (editor: EditorController) => void;
}> = [
  {
    mark: "bold",
    label: "Bold",
    glyph: "B",
    toggle: (editor) => void editor.commands.toggleBold(),
  },
  {
    mark: "italic",
    label: "Italic",
    glyph: "I",
    toggle: (editor) => void editor.commands.toggleItalic(),
  },
  {
    mark: "underline",
    label: "Underline",
    glyph: "U",
    toggle: (editor) => void editor.commands.toggleUnderline(),
  },
  {
    mark: "strike",
    label: "Strikethrough",
    glyph: "S",
    toggle: (editor) => void editor.commands.toggleStrike(),
  },
  {
    mark: "code",
    label: "Inline code",
    glyph: "</>",
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
      const viewportWidth = element.ownerDocument.defaultView?.innerWidth ?? 0;
      const left = Math.min(
        Math.max(bounds.left + bounds.width / 2, 96),
        Math.max(viewportWidth - 96, 96),
      );
      setToolbarState({
        activeMarks: editor.getSelectionMarks(),
        blockSelection: editor.getSelectionBlockType(),
        left,
        top: Math.max(bounds.top, 48),
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

  if (toolbarState === null) return null;

  return (
    <div
      aria-label="Formatting"
      className="be-formatting-toolbar"
      role="toolbar"
      style={{ left: toolbarState.left, top: toolbarState.top }}
    >
      {toolbarState.blockSelection !== null && (
        <select
          aria-label="Block type"
          className="be-formatting-toolbar-block-type"
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
      {toolbarButtons.map(({ mark, label, glyph, toggle }) => (
        <button
          aria-label={label}
          aria-pressed={toolbarState.activeMarks.includes(mark)}
          className="be-formatting-toolbar-button"
          key={mark}
          onClick={() => {
            toggle(editor);
            setToolbarState((current) =>
              current === null
                ? null
                : { ...current, activeMarks: editor.getSelectionMarks() },
            );
          }}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          {glyph}
        </button>
      ))}
    </div>
  );
};
