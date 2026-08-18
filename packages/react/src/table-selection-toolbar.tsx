import { TableCellsMerge, TableCellsSplit } from "lucide-react";
import { useEffect, useState } from "react";

import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { useEditor, useEditorMount } from "./use-editor.js";

const mergeLabel = "Merge cells";
const splitLabel = "Split cell";

const mergeIcon = <TableCellsMerge {...iconProps} />;
const splitIcon = <TableCellsSplit {...iconProps} />;

const buttonClassName =
  "geul:h-7 geul:min-w-7 geul:rounded geul:border-0 geul:bg-transparent geul:px-1.5 geul:py-1 geul:text-[color:var(--be-color-text,#202124)] geul:cursor-pointer";

type ToolbarState =
  | { kind: "merge"; tableBlockId: string; left: number; top: number }
  | {
      kind: "split";
      tableBlockId: string;
      cellId: string;
      left: number;
      top: number;
    };

const findTable = (
  element: HTMLElement,
  tableBlockId: string,
): HTMLElement | null =>
  Array.from(
    element.querySelectorAll<HTMLElement>("table[data-be-block-id]"),
  ).find(
    (candidate) => candidate.getAttribute("data-be-block-id") === tableBlockId,
  ) ?? null;

// tableEditing 플러그인이 CellSelection에 속한 각 기준 셀 노드에 데코레이션으로
// selectedCell 클래스를 붙인다(@tiptap/pm/tables 저수준 API, spec 6.1). React는
// 별도 격자 계산 없이 이 클래스로 선택 영역의 화면 경계만 읽는다(spec 6.2).
const mergeSelectionBounds = (
  table: HTMLElement,
): { left: number; top: number } | null => {
  const cells = Array.from(
    table.querySelectorAll<HTMLElement>(".selectedCell"),
  );
  if (cells.length === 0) return null;
  const rects = cells.map((cell) => cell.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.min(...rects.map((rect) => rect.top));
  return { left: (left + right) / 2, top };
};

const findCellElement = (
  table: HTMLElement,
  cellId: string,
): HTMLElement | undefined =>
  Array.from(table.querySelectorAll<HTMLElement>("[data-be-cell-id]")).find(
    (candidate) => candidate.getAttribute("data-be-cell-id") === cellId,
  );

/**
 * 표 안 셀 범위 선택(병합)과 이미 병합된 단일 셀(분할)에 뜨는 툴바.
 * SlashMenu가 TableHandles와 함께 자동 마운트한다(공개 export 없음 — 중복
 * 마운트 방지, TableHandles와 동일한 이유).
 */
export const TableSelectionToolbar = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [toolbarState, setToolbarState] = useState<ToolbarState | null>(null);

  useEffect(() => {
    const updateFromSelection = () => {
      if (element === null) {
        setToolbarState(null);
        return;
      }
      const selection = editor.getTableCellSelection();
      if (selection === null) {
        setToolbarState(null);
        return;
      }
      const table = findTable(element, selection.tableBlockId);
      if (table === null) {
        setToolbarState(null);
        return;
      }

      if (selection.kind === "merge") {
        const bounds = mergeSelectionBounds(table);
        if (bounds === null) {
          setToolbarState(null);
          return;
        }
        setToolbarState({
          kind: "merge",
          tableBlockId: selection.tableBlockId,
          left: bounds.left,
          top: bounds.top,
        });
        return;
      }

      const cellElement = findCellElement(table, selection.cellId);
      if (cellElement === undefined) {
        setToolbarState(null);
        return;
      }
      const rect = cellElement.getBoundingClientRect();
      setToolbarState({
        kind: "split",
        tableBlockId: selection.tableBlockId,
        cellId: selection.cellId,
        left: rect.left + rect.width / 2,
        top: rect.top,
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
      aria-label="Table selection"
      className="geul:fixed geul:z-10 geul:flex geul:gap-0.5 geul:rounded-md geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:bg-[var(--be-color-surface,#fff)] geul:p-1 geul:shadow-[0_1px_4px_rgba(0,0,0,0.15)] geul:[transform:translate(-50%,calc(-100%-0.5rem))]"
      role="toolbar"
      style={{ left: toolbarState.left, top: toolbarState.top }}
    >
      {toolbarState.kind === "merge" ? (
        <IconButton
          className={buttonClassName}
          icon={mergeIcon}
          label={mergeLabel}
          onClick={() => {
            const tableBlockId = toolbarState.tableBlockId;
            editor.commands.mergeTableCells(tableBlockId);
          }}
          onMouseDown={(event) => event.preventDefault()}
        />
      ) : (
        <IconButton
          className={buttonClassName}
          icon={splitIcon}
          label={splitLabel}
          onClick={() => {
            const { tableBlockId, cellId } = toolbarState;
            editor.commands.splitTableCell(tableBlockId, cellId);
          }}
          onMouseDown={(event) => event.preventDefault()}
        />
      )}
    </div>
  );
};
