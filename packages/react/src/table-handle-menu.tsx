import type { TableCellTarget } from "@cp949/geul-core";
import { useLayoutEffect, useRef, useState } from "react";

import {
  TABLE_BACKGROUND_COLORS,
  TABLE_TEXT_COLORS,
  type TableCellColor,
} from "./table-cell-colors.js";
import { useEditor } from "./use-editor.js";

const menuItemClassName =
  "geul:cursor-pointer geul:rounded geul:border-0 geul:bg-transparent geul:px-2 geul:py-1.5 geul:text-left geul:hover:bg-[var(--be-color-accent-muted,#e8f0fe)] geul:text-[color:var(--be-color-text,#202124)]";
const swatchClassName =
  "geul:h-5 geul:w-5 geul:cursor-pointer geul:rounded geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:p-0";
const sectionLabelClassName =
  "geul:my-1 geul:mx-2 geul:text-[0.75rem] geul:text-[color:var(--be-color-text-muted,#5f6368)]";
const dividerClassName =
  "geul:my-1 geul:mx-0 geul:border-0 geul:border-t geul:border-[color:var(--be-color-border,#dadce0)]";

const MENU_VIEWPORT_MARGIN = 8;

export type TableHandleMenuProps = {
  kind: "row" | "column";
  tableBlockId: string;
  index: number;
  /** 헤더는 첫 행/첫 열에만 있을 수 있다(모델 headerRows/headerColumns: 0|1). */
  headerToggleAvailable: boolean;
  headerEnabled: boolean;
  left: number;
  top: number;
  onClose: () => void;
};

/**
 * 행/열 핸들 클릭 시 열리는 메뉴(spec 7.2 — 추가, 삭제, 헤더와 색상).
 * 좌표 계산은 TableHandles가 하고 이 컴포넌트는 표시와 명령 호출만 한다.
 */
export const TableHandleMenu = ({
  kind,
  tableBlockId,
  index,
  headerToggleAvailable,
  headerEnabled,
  left,
  top,
  onClose,
}: TableHandleMenuProps) => {
  const editor = useEditor();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left, top });
  const isRow = kind === "row";
  const target: TableCellTarget = isRow
    ? { kind: "row", index }
    : { kind: "column", index };

  // position: fixed 메뉴는 스크롤로 화면 안에 들어오지 않는다 — 렌더 직후
  // 실제 크기를 재서 뷰포트 안으로 접어 넣는다. 팔레트가 화면 밖으로
  // 밀리면 클릭 자체가 불가능해진다(실브라우저에서 확인).
  useLayoutEffect(() => {
    const node = menuRef.current;
    const view = node?.ownerDocument.defaultView ?? null;
    if (node === null || view === null) return;
    const rect = node.getBoundingClientRect();
    const maxLeft = Math.max(
      MENU_VIEWPORT_MARGIN,
      view.innerWidth - rect.width - MENU_VIEWPORT_MARGIN,
    );
    const maxTop = Math.max(
      MENU_VIEWPORT_MARGIN,
      view.innerHeight - rect.height - MENU_VIEWPORT_MARGIN,
    );
    setPosition({
      left: Math.min(Math.max(left, MENU_VIEWPORT_MARGIN), maxLeft),
      top: Math.min(Math.max(top, MENU_VIEWPORT_MARGIN), maxTop),
    });
  }, [left, top]);

  const runAndClose = (run: () => void) => {
    run();
    onClose();
  };

  const insertBefore = () =>
    runAndClose(() => {
      if (isRow) editor.commands.insertTableRow(tableBlockId, index);
      else editor.commands.insertTableColumn(tableBlockId, index);
    });

  const insertAfter = () =>
    runAndClose(() => {
      if (isRow) editor.commands.insertTableRow(tableBlockId, index + 1);
      else editor.commands.insertTableColumn(tableBlockId, index + 1);
    });

  const remove = () =>
    runAndClose(() => {
      if (isRow) editor.commands.deleteTableRow(tableBlockId, index);
      else editor.commands.deleteTableColumn(tableBlockId, index);
    });

  const toggleHeader = () =>
    runAndClose(() => {
      if (isRow) editor.commands.toggleTableHeaderRow(tableBlockId);
      else editor.commands.toggleTableHeaderColumn(tableBlockId);
    });

  const applyColor = (property: "text" | "background", color: string | null) =>
    runAndClose(() => {
      if (property === "text") {
        editor.commands.setTableCellTextColor(tableBlockId, target, color);
        return;
      }
      editor.commands.setTableCellBackgroundColor(tableBlockId, target, color);
    });

  const renderPalette = (
    property: "text" | "background",
    label: string,
    colors: TableCellColor[],
  ) => (
    <>
      <p className={sectionLabelClassName}>{label}</p>
      <div className="geul:flex geul:flex-wrap geul:gap-1 geul:px-2 geul:pb-1">
        {colors.map((color) => (
          <button
            aria-label={`${label} ${color.name}`}
            className={swatchClassName}
            key={color.value}
            onClick={() => applyColor(property, color.value)}
            onMouseDown={(event) => event.preventDefault()}
            role="menuitem"
            style={
              property === "background"
                ? { backgroundColor: color.value }
                : { backgroundColor: "transparent", color: color.value }
            }
            type="button"
          >
            {property === "text" ? "A" : ""}
          </button>
        ))}
        <button
          aria-label={`${label} None`}
          className={swatchClassName}
          onClick={() => applyColor(property, null)}
          onMouseDown={(event) => event.preventDefault()}
          role="menuitem"
          type="button"
        >
          ×
        </button>
      </div>
    </>
  );

  return (
    <div
      aria-label={isRow ? "Table row menu" : "Table column menu"}
      className="geul:fixed geul:z-10 geul:flex geul:max-h-[calc(100vh-1rem)] geul:w-48 geul:flex-col geul:gap-0.5 geul:overflow-y-auto geul:rounded-md geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:bg-[var(--be-color-surface,#fff)] geul:p-1 geul:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
      data-be-table-menu=""
      ref={menuRef}
      role="menu"
      style={{ left: position.left, top: position.top }}
    >
      <button
        className={menuItemClassName}
        onClick={insertBefore}
        onMouseDown={(event) => event.preventDefault()}
        role="menuitem"
        type="button"
      >
        {isRow ? "Insert row above" : "Insert column left"}
      </button>
      <button
        className={menuItemClassName}
        onClick={insertAfter}
        onMouseDown={(event) => event.preventDefault()}
        role="menuitem"
        type="button"
      >
        {isRow ? "Insert row below" : "Insert column right"}
      </button>
      <button
        className={`${menuItemClassName} geul:text-[color:var(--be-color-danger,#d93025)]`}
        onClick={remove}
        onMouseDown={(event) => event.preventDefault()}
        role="menuitem"
        type="button"
      >
        {isRow ? "Delete row" : "Delete column"}
      </button>
      {headerToggleAvailable && (
        <>
          <hr className={dividerClassName} />
          <button
            aria-checked={headerEnabled}
            className={menuItemClassName}
            onClick={toggleHeader}
            onMouseDown={(event) => event.preventDefault()}
            role="menuitemcheckbox"
            type="button"
          >
            {isRow ? "Header row" : "Header column"}
          </button>
        </>
      )}
      <hr className={dividerClassName} />
      {renderPalette("text", "Text color", TABLE_TEXT_COLORS)}
      {renderPalette("background", "Background color", TABLE_BACKGROUND_COLORS)}
    </div>
  );
};
