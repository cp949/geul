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

const MENU_VIEWPORT_MARGIN = 8;

export type TableCellFormatMenuProps = {
  tableBlockId: string;
  cellIds: string[];
  left: number;
  top: number;
  onClose: () => void;
};

/**
 * TableSelectionToolbar의 "Cell formatting" 버튼으로 여는 메뉴 — 선택된
 * 셀 목록(cellIds)에 글자색·배경색을 적용한다. 좌표 클램프는
 * TableHandleMenu와 같은 이유로 같은 방식을 쓴다(PIT-0011) — 서로 다른
 * 진입점(핸들 vs 셀 선택)이라 로직은 각자 갖는다.
 */
export const TableCellFormatMenu = ({
  tableBlockId,
  cellIds,
  left,
  top,
  onClose,
}: TableCellFormatMenuProps) => {
  const editor = useEditor();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left, top });
  const target = { kind: "cells", cellIds } as const;

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

  const applyColor = (
    property: "text" | "background",
    color: string | null,
  ) =>
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
      aria-label="Cell formatting"
      className="geul:fixed geul:z-10 geul:flex geul:max-h-[calc(100vh-1rem)] geul:w-48 geul:flex-col geul:gap-0.5 geul:overflow-y-auto geul:rounded-md geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:bg-[var(--be-color-surface,#fff)] geul:p-1 geul:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
      data-be-cell-format-menu=""
      ref={menuRef}
      role="menu"
      style={{ left: position.left, top: position.top }}
    >
      {renderPalette("text", "Text color", TABLE_TEXT_COLORS)}
      {renderPalette("background", "Background color", TABLE_BACKGROUND_COLORS)}
    </div>
  );
};
