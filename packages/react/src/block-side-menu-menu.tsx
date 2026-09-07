import { isNestableBlockType } from "@cp949/geul-core";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";

import { findBlockTypeDescriptor } from "./block-side-menu-block-type.js";
import {
  blockTypeText,
  type BlockTypeOption,
  getBlockTypeOptionsForSource,
} from "./block-type-options.js";
import { iconProps } from "./icon-props.js";
import { MenuItemButton } from "./menu-item-button.js";
import {
  TABLE_BACKGROUND_COLORS,
  TABLE_TEXT_COLORS,
} from "./table-cell-colors.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDictionary, useEditor } from "./use-editor.js";

const blockMenuItemClassName = "geul-block-menu__item";

// RD-003 DELTA-02: 블록 메뉴 색상·정렬 섹션. 클래스는 DELTA-01(formatting-toolbar.tsx)·
// TableCellColorPalettes·TableCellFormatMenu와 같은 공유 scss(_menu-shared.scss,
// _table-cell-format-menu.scss)를 재사용한다 — 신규 scss 없음.
const colorSectionLabelClassName = "geul-menu-section-label";
const colorSwatchClassName = "geul-menu-swatch";
const alignButtonClassName = "geul-cell-format-menu__align-button";

const alignLeftIcon = <AlignLeft {...iconProps} />;
const alignCenterIcon = <AlignCenter {...iconProps} />;
const alignRightIcon = <AlignRight {...iconProps} />;

export type BlockSideMenuMenuProps = {
  blockId: string;
  left: number;
  top: number;
  onClose: () => void;
};

/**
 * 블록 gutter 핸들 클릭 시 열리는 팝업 메뉴(Turn into, Indent/Outdent,
 * Duplicate/Delete, 색상·정렬 — RD-003 DELTA-02). 좌표 계산은 BlockSideMenu가
 * 하고 이 컴포넌트는 표시와 명령 호출만 한다(table-handle-menu.tsx와 같은 경계).
 */
export const BlockSideMenuMenu = ({
  blockId,
  left,
  top,
  onClose,
}: BlockSideMenuMenuProps) => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { menuRef, style } = useClampedMenuPosition(left, top);

  // Turn into 옵션과 색상·정렬 섹션 게이트(RD-003 DELTA-02)가 같은 source
  // descriptor를 쓴다 — 여기서 한 번만 구한다.
  const blockMenuSource = findBlockTypeDescriptor(
    editor.getDocument().blocks,
    blockId,
  );
  const blockTypeOptions =
    blockMenuSource === null
      ? []
      : getBlockTypeOptionsForSource(blockMenuSource);
  // Indent/Outdent 비활성 판정은 core의 getBlockNestingActionState 한 곳을
  // 공유한다(formatting-toolbar.tsx와 같은 관용구, Issue #126) — 표는 이
  // gutter의 hover 대상에서 이미 제외돼 blockId가 표를 가리킬 일이 없다.
  const nestingActions = editor.getBlockNestingActionState(blockId);

  // 색상·정렬은 Indent/Outdent와 같은 "재조정 가능" 액션이라 적용 후에도
  // 메뉴를 닫지 않는다(Turn into/Duplicate/Delete 같은 일회성 액션과 다른
  // 분류 — RD-003-DELTA-02 계획 "배경" 절).
  const applyBlockTextColor = (color: string | null) => {
    editor.commands.setBlockTextColor(blockId, color);
  };
  const applyBlockBackgroundColor = (color: string | null) => {
    editor.commands.setBlockBackgroundColor(blockId, color);
  };
  const applyBlockTextAlignment = (
    align: "left" | "center" | "right" | null,
  ) => {
    editor.commands.setBlockTextAlignment(blockId, align);
  };

  const handleTurnInto = (item: BlockTypeOption) => {
    const source = findBlockTypeDescriptor(
      editor.getDocument().blocks,
      blockId,
    );
    const isAllowed =
      source !== null &&
      getBlockTypeOptionsForSource(source).some(
        (option) => option.id === item.id,
      );
    if (isAllowed) {
      editor.commands.setBlockType(blockId, item.blockType);
    }
    onClose();
  };

  const handleIndentBlock = () => {
    editor.commands.indentBlock(blockId);
    onClose();
  };

  const handleOutdentBlock = () => {
    editor.commands.outdentBlock(blockId);
    onClose();
  };

  const handleDuplicate = () => {
    editor.commands.duplicateBlock(blockId);
    onClose();
  };

  const handleDeleteBlock = () => {
    editor.commands.deleteBlock(blockId);
    onClose();
  };

  return (
    // max-h-[calc(100vh-1rem)] + overflow-y-auto: 클램프는 좌표만 접으므로
    // 뷰포트보다 큰 메뉴는 아래쪽 항목에 닿을 수 없다(PIT-0011 예방 규칙).
    // 1rem은 useClampedMenuPosition의 MENU_VIEWPORT_MARGIN 8px가 위·아래로
    // 두 번 들어간 값이라 클램프 결과와 정확히 맞물린다. R2에서 블록 타입
    // 목록이 늘면 일반 뷰포트에서도 넘친다.
    <div
      aria-label="Block menu"
      className="geul-block-menu"
      data-geul-block-menu=""
      ref={menuRef}
      role="menu"
      style={style}
    >
      <p className="geul-block-menu__label">Turn into</p>
      {blockTypeOptions.map((option) => (
        <MenuItemButton
          className={blockMenuItemClassName}
          key={option.id}
          onClick={() => handleTurnInto(option)}
        >
          {blockTypeText(dictionary, option.id).label}
        </MenuItemButton>
      ))}
      {/* mx-0(SCSS margin-inline: 0)에 대응: preflight 미포함이라 UA의
          margin-inline auto가 남으면 flex column에서 hr이 0폭으로
          붕괴한다 */}
      <hr className="geul-block-menu__divider" />
      <MenuItemButton
        className={blockMenuItemClassName}
        disabled={nestingActions?.canIndent !== true}
        onClick={handleIndentBlock}
      >
        Indent
      </MenuItemButton>
      <MenuItemButton
        className={blockMenuItemClassName}
        disabled={nestingActions?.canOutdent !== true}
        onClick={handleOutdentBlock}
      >
        Outdent
      </MenuItemButton>
      <MenuItemButton
        className={blockMenuItemClassName}
        onClick={handleDuplicate}
      >
        Duplicate
      </MenuItemButton>
      <MenuItemButton
        className={`${blockMenuItemClassName} geul-block-menu__item--danger`}
        onClick={handleDeleteBlock}
      >
        Delete
      </MenuItemButton>
      {blockMenuSource !== null &&
        isNestableBlockType(blockMenuSource.type) && (
          <>
            {/* table/divider/codeBlock은 TextBlockProps 대상이 아니다(spec
                §3.3) — isNestableBlockType이 정확히 그 7개 대상 타입만
                인정한다(RD-002 DELTA-02와 같은 predicate). table 자체는
                gutter hover 대상에서 이미 제외돼 blockMenuSource.type이
                "table"일 일이 없다(위 nestingActions 주석과 같은 불변식). */}
            <hr className="geul-block-menu__divider" />
            <p className={colorSectionLabelClassName}>Text color</p>
            <div className="geul-menu-palette">
              {TABLE_TEXT_COLORS.map((color) => (
                <MenuItemButton
                  aria-label={`Text color ${color.name}`}
                  className={colorSwatchClassName}
                  key={color.value}
                  onClick={() => applyBlockTextColor(color.value)}
                  style={{
                    backgroundColor: "transparent",
                    color: color.value,
                  }}
                >
                  A
                </MenuItemButton>
              ))}
              <MenuItemButton
                aria-label="Text color None"
                className={colorSwatchClassName}
                onClick={() => applyBlockTextColor(null)}
              >
                ×
              </MenuItemButton>
            </div>
            <p className={colorSectionLabelClassName}>Background color</p>
            <div className="geul-menu-palette">
              {TABLE_BACKGROUND_COLORS.map((color) => (
                <MenuItemButton
                  aria-label={`Background color ${color.name}`}
                  className={colorSwatchClassName}
                  key={color.value}
                  onClick={() => applyBlockBackgroundColor(color.value)}
                  style={{ backgroundColor: color.value }}
                >
                  {""}
                </MenuItemButton>
              ))}
              <MenuItemButton
                aria-label="Background color None"
                className={colorSwatchClassName}
                onClick={() => applyBlockBackgroundColor(null)}
              >
                ×
              </MenuItemButton>
            </div>
            <p className={colorSectionLabelClassName}>Align</p>
            <div className="geul-cell-format-menu__align-row">
              <MenuItemButton
                aria-label="Align left"
                className={alignButtonClassName}
                onClick={() => applyBlockTextAlignment("left")}
              >
                {alignLeftIcon}
              </MenuItemButton>
              <MenuItemButton
                aria-label="Align center"
                className={alignButtonClassName}
                onClick={() => applyBlockTextAlignment("center")}
              >
                {alignCenterIcon}
              </MenuItemButton>
              <MenuItemButton
                aria-label="Align right"
                className={alignButtonClassName}
                onClick={() => applyBlockTextAlignment("right")}
              >
                {alignRightIcon}
              </MenuItemButton>
              <MenuItemButton
                aria-label="Align none"
                className={alignButtonClassName}
                onClick={() => applyBlockTextAlignment(null)}
              >
                ×
              </MenuItemButton>
            </div>
          </>
        )}
    </div>
  );
};
