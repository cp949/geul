import { Palette, TableCellsMerge, TableCellsSplit } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { TableCellFormatMenu } from "./table-cell-format-menu.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useEditor, useEditorMount } from "./use-editor.js";

const mergeLabel = "Merge cells";
const splitLabel = "Split cell";
const formatLabel = "Cell formatting";

const mergeIcon = <TableCellsMerge {...iconProps} />;
const splitIcon = <TableCellsSplit {...iconProps} />;
const formatIcon = <Palette {...iconProps} />;

const buttonClassName =
  "geul:h-7 geul:min-w-7 geul:rounded geul:border-0 geul:bg-transparent geul:px-1.5 geul:py-1 geul:text-[color:var(--be-color-text,#202124)] geul:cursor-pointer";

// 서식 메뉴를 토큰 위치에서 약간 아래로 띄운다 — 정확한 도킹 위치는
// PIT-0011 클램프가 뷰포트 안으로 다시 접어 넣으므로 대략치면 충분하다.
const CELL_FORMAT_MENU_OFFSET = 32;

type ToolbarState = {
  tableBlockId: string;
  cellIds: string[];
  mergeable: boolean;
  splitCellId: string | null;
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

const findCellElement = (
  table: HTMLElement,
  cellId: string,
): HTMLElement | undefined =>
  Array.from(table.querySelectorAll<HTMLElement>("[data-be-cell-id]")).find(
    (candidate) => candidate.getAttribute("data-be-cell-id") === cellId,
  );

// tableEditing 플러그인이 CellSelection에 속한 각 기준 셀 노드에 데코레이션으로
// selectedCell 클래스를 붙인다(@tiptap/pm/tables 저수준 API, spec 6.1). 셀이
// 1개든 여러 개든 이 클래스로 화면 경계를 읽는다 — React는 별도 격자 계산을
// 하지 않는다(spec 6.2). 캐럿이 병합 셀 안에 있을 때(CellSelection이 아닐 때)는
// 이 데코레이션이 없으므로 cellIds[0]의 셀 요소를 직접 찾는다.
const cellSelectionBounds = (
  table: HTMLElement,
  cellIds: string[],
): { left: number; top: number } | null => {
  const decorated = Array.from(
    table.querySelectorAll<HTMLElement>(".selectedCell"),
  );
  if (decorated.length > 0) {
    const rects = decorated.map((cell) => cell.getBoundingClientRect());
    const left = Math.min(...rects.map((rect) => rect.left));
    const right = Math.max(...rects.map((rect) => rect.right));
    const top = Math.min(...rects.map((rect) => rect.top));
    return { left: (left + right) / 2, top };
  }
  const soleCellId = cellIds.length === 1 ? cellIds[0] : undefined;
  if (soleCellId === undefined) return null;
  const cellElement = findCellElement(table, soleCellId);
  if (cellElement === undefined) return null;
  const rect = cellElement.getBoundingClientRect();
  return { left: rect.left + rect.width / 2, top: rect.top };
};

/**
 * 표 안 셀 선택(CellSelection, 트리플클릭한 단일 셀 포함)과 병합 셀 캐럿에
 * 뜨는 툴바. 선택이 서로 다른 기준 셀 2개 이상을 덮으면 병합을, 이미 병합된
 * 셀 하나를 덮으면(또는 그 셀 안에 캐럿이 있으면) 분할을 노출한다. 어느
 * 경우든 Cell formatting 버튼으로 색상·정렬 메뉴를 연다(spec 7.2).
 * SlashMenu가 TableHandles와 함께 자동 마운트한다(공개 export 없음).
 */
export const TableSelectionToolbar = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [toolbarState, setToolbarState] = useState<ToolbarState | null>(null);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const selectionKeyRef = useRef<string | null>(null);
  const focusEditor = useCallback(() => {
    element?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
  }, [element]);
  const closeFormatMenu = useCallback(() => {
    setFormatMenuOpen(false);
    focusEditor();
  }, [focusEditor]);

  useEffect(() => {
    const updateFromSelection = () => {
      const closeAll = () => {
        setToolbarState(null);
        selectionKeyRef.current = null;
        setFormatMenuOpen(false);
      };

      if (element === null) return closeAll();
      const selection = editor.getTableCellSelection();
      if (selection === null) return closeAll();
      const table = findTable(element, selection.tableBlockId);
      if (table === null) return closeAll();
      const bounds = cellSelectionBounds(table, selection.cellIds);
      if (bounds === null) return closeAll();

      const selectionKey = `${selection.tableBlockId} ${selection.cellIds.join(" ")}`;
      if (selectionKeyRef.current !== selectionKey) {
        selectionKeyRef.current = selectionKey;
        setFormatMenuOpen(false);
      }
      setToolbarState({
        tableBlockId: selection.tableBlockId,
        cellIds: selection.cellIds,
        mergeable: selection.mergeable,
        splitCellId: selection.splitCellId,
        left: bounds.left,
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

  // 서식 메뉴는 바깥 pointerdown과 Escape로 닫는다(PIT-0009: 키보드로
  // 닫는 UI는 병렬 e2e로 검증한다 — table-handles.tsx의 closeMenu와 같은 패턴).
  useEffect(() => {
    if (!formatMenuOpen || element === null) return;
    const ownerDocument = element.ownerDocument;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest("[data-be-cell-format-menu]") !== null ||
        target.closest("[data-be-cell-format-trigger]") !== null
      ) {
        return;
      }
      setFormatMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeFormatMenu();
    };

    ownerDocument.addEventListener("pointerdown", handlePointerDown);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown);
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };
  }, [formatMenuOpen, element, closeFormatMenu]);

  const { menuRef, style } = useClampedMenuPosition(
    toolbarState?.left ?? 0,
    toolbarState?.top ?? 0,
    "centerAbove",
  );

  if (toolbarState === null) return null;

  return (
    <>
      <div
        aria-label="Table selection"
        className="geul:fixed geul:z-10 geul:flex geul:gap-0.5 geul:rounded-md geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:bg-[var(--be-color-surface,#fff)] geul:p-1 geul:shadow-[0_1px_4px_rgba(0,0,0,0.15)] geul:[transform:translate(-50%,calc(-100%-0.5rem))]"
        ref={menuRef}
        role="toolbar"
        style={style}
      >
        {toolbarState.mergeable && (
          <IconButton
            className={buttonClassName}
            icon={mergeIcon}
            label={mergeLabel}
            onClick={() => {
              editor.commands.mergeTableCells(toolbarState.tableBlockId);
            }}
            onMouseDown={(event) => event.preventDefault()}
          />
        )}
        {toolbarState.splitCellId !== null && (
          <IconButton
            className={buttonClassName}
            icon={splitIcon}
            label={splitLabel}
            onClick={() => {
              const { tableBlockId, splitCellId } = toolbarState;
              if (splitCellId === null) return;
              editor.commands.splitTableCell(tableBlockId, splitCellId);
            }}
            onMouseDown={(event) => event.preventDefault()}
          />
        )}
        <IconButton
          className={buttonClassName}
          data-be-cell-format-trigger=""
          icon={formatIcon}
          label={formatLabel}
          onClick={() => {
            if (formatMenuOpen) closeFormatMenu();
            else setFormatMenuOpen(true);
          }}
          onMouseDown={(event) => event.preventDefault()}
        />
      </div>
      {formatMenuOpen && (
        <TableCellFormatMenu
          cellIds={toolbarState.cellIds}
          left={toolbarState.left}
          onClose={closeFormatMenu}
          tableBlockId={toolbarState.tableBlockId}
          top={toolbarState.top + CELL_FORMAT_MENU_OFFSET}
        />
      )}
    </>
  );
};
