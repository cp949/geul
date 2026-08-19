import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";

import { iconProps } from "./icon-props.js";
import {
  TABLE_BACKGROUND_COLORS,
  TABLE_TEXT_COLORS,
  type TableCellColor,
} from "./table-cell-colors.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useEditor } from "./use-editor.js";

const swatchClassName =
  "geul:h-5 geul:w-5 geul:cursor-pointer geul:rounded geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:p-0";
const sectionLabelClassName =
  "geul:my-1 geul:mx-2 geul:text-[0.75rem] geul:text-[color:var(--be-color-text-muted,#5f6368)]";
const dividerClassName =
  "geul:my-1 geul:mx-0 geul:border-0 geul:border-t geul:border-[color:var(--be-color-border,#dadce0)]";
const alignButtonClassName =
  "geul:flex geul:h-7 geul:min-w-7 geul:cursor-pointer geul:items-center geul:justify-center geul:rounded geul:border-0 geul:bg-transparent geul:p-1 geul:hover:bg-[var(--be-color-accent-muted,#e8f0fe)] geul:text-[color:var(--be-color-text,#202124)]";

export type TableCellFormatMenuProps = {
  tableBlockId: string;
  cellIds: string[];
  left: number;
  top: number;
  onClose: () => void;
};

/**
 * TableSelectionToolbar의 "Cell formatting" 버튼으로 여는 메뉴 — 선택된
 * 셀 목록(cellIds)에 글자색·배경색·정렬을 적용한다. 좌표 클램프는
 * TableHandleMenu와 공용 useClampedMenuPosition 훅을 쓴다(PIT-0011).
 */
export const TableCellFormatMenu = ({
  tableBlockId,
  cellIds,
  left,
  top,
  onClose,
}: TableCellFormatMenuProps) => {
  const editor = useEditor();
  const { menuRef, style } = useClampedMenuPosition(left, top);
  const target = { kind: "cells", cellIds } as const;

  const runAndClose = (run: () => void) => {
    run();
    onClose();
  };

  const applyColor = (property: "text" | "background", color: string | null) =>
    runAndClose(() => {
      if (property === "text") {
        editor.commands.setTableCellTextColor(tableBlockId, target, color);
        return;
      }
      editor.commands.setTableCellBackgroundColor(tableBlockId, target, color);
    });

  const applyAlign = (align: "left" | "center" | "right" | null) =>
    runAndClose(() => {
      editor.commands.setTableCellAlign(tableBlockId, target, align);
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
      style={style}
    >
      {renderPalette("text", "Text color", TABLE_TEXT_COLORS)}
      {renderPalette("background", "Background color", TABLE_BACKGROUND_COLORS)}
      <hr className={dividerClassName} />
      <p className={sectionLabelClassName}>Align</p>
      <div className="geul:flex geul:gap-1 geul:px-2 geul:pb-1">
        <button
          aria-label="Align left"
          className={alignButtonClassName}
          onClick={() => applyAlign("left")}
          onMouseDown={(event) => event.preventDefault()}
          role="menuitem"
          type="button"
        >
          <AlignLeft {...iconProps} />
        </button>
        <button
          aria-label="Align center"
          className={alignButtonClassName}
          onClick={() => applyAlign("center")}
          onMouseDown={(event) => event.preventDefault()}
          role="menuitem"
          type="button"
        >
          <AlignCenter {...iconProps} />
        </button>
        <button
          aria-label="Align right"
          className={alignButtonClassName}
          onClick={() => applyAlign("right")}
          onMouseDown={(event) => event.preventDefault()}
          role="menuitem"
          type="button"
        >
          <AlignRight {...iconProps} />
        </button>
        <button
          aria-label="Align none"
          className={alignButtonClassName}
          onClick={() => applyAlign(null)}
          onMouseDown={(event) => event.preventDefault()}
          role="menuitem"
          type="button"
        >
          ×
        </button>
      </div>
    </div>
  );
};
