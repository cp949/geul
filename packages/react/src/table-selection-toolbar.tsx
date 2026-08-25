import { Palette, TableCellsMerge, TableCellsSplit } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { TableCellFormatMenu } from "./table-cell-format-menu.js";
import { tableCommandErrorMessage } from "./table-command-error-messages.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useEditor, useEditorMount } from "./use-editor.js";
import { useTableCommandFeedback } from "./use-table-command-feedback.js";

const mergeLabel = "Merge cells";
const splitLabel = "Split cell";
const formatLabel = "Cell formatting";

const mergeIcon = <TableCellsMerge {...iconProps} />;
const splitIcon = <TableCellsSplit {...iconProps} />;
const formatIcon = <Palette {...iconProps} />;

const buttonClassName = "geul-table-selection-toolbar__button";

const actionErrorClassName = "geul-table-selection-toolbar__error";

// 서식 메뉴를 토큰 위치에서 약간 아래로 띄운다 — 정확한 도킹 위치는
// PIT-0011 클램프가 뷰포트 안으로 다시 접어 넣으므로 대략치면 충분하다.
const CELL_FORMAT_MENU_OFFSET = 32;

// useDismissOnOutsideOrEscape allow-list. table-handles.tsx와 같은 이유로
// 모듈 스코프 상수로 둔다.
const CELL_FORMAT_MENU_DISMISS_ALLOW_SELECTORS = [
  "[data-be-cell-format-menu]",
  "[data-be-cell-format-trigger]",
] as const;

type ToolbarState = {
  tableBlockId: string;
  cellIds: string[];
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

  const { actionError, runCommand, clearActionError } =
    useTableCommandFeedback();

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
      // 실패 메시지는 그때 선택돼 있던 셀에 대한 것이다 — 대상이 바뀌면
      // 다른 셀을 가리키는 낡은 메시지가 되므로 지운다(TableHandleMenu가
      // table-handles.tsx의 key로 리마운트해 얻는 초기화와 같은 효과다).
      // 실패한 명령은 트랜잭션을 dispatch하지 않아 selection이 그대로이므로
      // (editor-controller.ts의 runDocumentCommand) 방금 띄운 메시지가 이
      // 분기에 걸려 곧바로 사라지지는 않는다.
      if (selectionKeyRef.current !== selectionKey) {
        selectionKeyRef.current = selectionKey;
        setFormatMenuOpen(false);
        clearActionError();
      }
      setToolbarState({
        tableBlockId: selection.tableBlockId,
        cellIds: selection.cellIds,
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
  }, [editor, element, clearActionError]);

  // 서식 메뉴는 바깥 pointerdown과 Escape로 닫는다(G-TST-001: 키보드로
  // 닫는 UI는 병렬 e2e로 검증한다). 리스너는 useDismissOnOutsideOrEscape가
  // 소유한다 — table-handles.tsx의 closeMenu와 같은 훅(Issue #20).
  const dismissFormatMenu = useCallback(() => setFormatMenuOpen(false), []);
  useDismissOnOutsideOrEscape({
    active: formatMenuOpen,
    element,
    allowSelectors: CELL_FORMAT_MENU_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss: dismissFormatMenu,
    onEscapeDismiss: closeFormatMenu,
  });

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
        className="geul-table-selection-toolbar"
        ref={menuRef}
        role="toolbar"
        style={style}
      >
        {toolbarState.cellIds.length > 1 && (
          <IconButton
            className={buttonClassName}
            icon={mergeIcon}
            label={mergeLabel}
            onClick={() => {
              runCommand(() =>
                editor.commands.mergeTableCells(toolbarState.tableBlockId),
              );
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
              runCommand(() =>
                editor.commands.splitTableCell(tableBlockId, splitCellId),
              );
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
            if (formatMenuOpen) {
              closeFormatMenu();
              return;
            }
            // 서식 메뉴도 자기 role="alert"를 갖는다 — 툴바의 병합·분할
            // 실패 메시지를 남긴 채로 열면 live region 두 개가 동시에
            // 존재해 스크린리더가 둘 다 읽는다. 다른 액션으로 옮겼다는
            // 뜻이므로 툴바 메시지를 지우고 연다.
            clearActionError();
            setFormatMenuOpen(true);
          }}
          onMouseDown={(event) => event.preventDefault()}
        />
        {actionError !== null && (
          <span className={actionErrorClassName} role="alert">
            {tableCommandErrorMessage(actionError)}
          </span>
        )}
      </div>
      {/* toolbarState.left/top은 원본(비클램프) 앵커 좌표다 — 위 메인 툴바가
          useClampedMenuPosition으로 접어 넣은 화면상 위치(menuRef.style)가
          아니다. 의도적으로 원본을 그대로 넘긴다: TableCellFormatMenu는
          자신도 topLeft anchor로 독립 클램프하므로 항상 뷰포트 안에서 열리고
          클릭 가능함이 e2e(table-format.spec.ts PIT-0011 케이스)로 보장된다.
          부모가 화면 끝에서 접혀 부모·자식 사이 위치가 시각적으로 약간
          어긋나는 코스메틱 트레이드오프이며, 부모의 클램프된 좌표를 읽어
          전달하려면 useClampedMenuPosition이 그 좌표를 다시 공개해야 해
          #44에서 축소한 훅 표면(항목 2)과 상충한다(#44 항목 6). */}
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
