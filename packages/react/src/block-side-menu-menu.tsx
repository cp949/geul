import { isNestableBlockType } from "@cp949/geul-core";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
import { useEditorRevision } from "./use-editor-revision.js";
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

  // Issue #141 — 열려 있는 동안 외부 EditorController command가 이
  // blockId의 type을 바꾸면 메뉴를 닫는다(옵션 재계산이 아니다 — 01-계획.md
  // "결정" 1). open 시점 type을 한 번만 캡처하고(useState lazy init),
  // 문서가 바뀔 때마다(useEditorRevision) 같은 blockId를 다시 조회해
  // 비교한다 — 비교 대상은 이 blockId 하나뿐이라 다른 block의 외부 변경은
  // 메뉴를 닫지 않는다("결정" 3). onClose는 latestOnClose ref로 최신값을
  // 읽는다(editor-provider.tsx의 latestOnChange와 같은 패턴) — blockId·
  // editor·openedBlockType은 메뉴 생애주기 동안 고정값이라 deps에 넣지
  // 않는다. "internal" ownership에서만 editorRevision이 실제로 바뀐다
  // (use-editor-revision.ts) — "external" ownership에서는 이 effect가 mount
  // 이후 다시 돌지 않아(RD-005의 click 시점 guard가 그대로 방어선을 맡는다).
  const editorRevision = useEditorRevision();
  const [openedBlockType] = useState(() => blockMenuSource?.type ?? null);
  const latestOnClose = useRef(onClose);
  latestOnClose.current = onClose;
  useEffect(() => {
    const currentBlockType =
      findBlockTypeDescriptor(editor.getDocument().blocks, blockId)?.type ??
      null;
    if (currentBlockType !== openedBlockType) latestOnClose.current();
    // editorRevision만 재실행 트리거다 — 위 주석 참고.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorRevision]);

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
    // G-UI-004: aria-disabled는 disabled와 달리 클릭 이벤트를 막지 않는다 —
    // 명시적 가드로 비활성 상태의 클릭을 막는다. 가드가 없으면 명령이
    // 거절돼도 onClose()가 무조건 불려 사유를 볼 틈 없이 메뉴가 닫힌다.
    if (nestingActions?.canIndent !== true) return;
    editor.commands.indentBlock(blockId);
    onClose();
  };

  const handleOutdentBlock = () => {
    if (nestingActions?.canOutdent !== true) return;
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
    // max-height: min(16rem, calc(100vh-1rem)) + overflow-y: auto
    // (_block-side-menu.scss) — Turn into가 heading×toggle 12개를 평평한
    // 목록으로 내다 보니 뷰포트가 넉넉해도 메뉴 하나가 화면을 거의 다
    // 채우던 문제를 고정 상한으로 막는다(slash-menu·emoji-picker와 같은
    // 관례). calc(100vh-1rem) 쪽은 PIT-0011 예방 규칙 그대로다 — 클램프는
    // 좌표만 접으므로 뷰포트보다 큰 메뉴는 아래쪽 항목에 닿을 수 없다.
    <div
      aria-label={dictionary.menu.blockMenuAriaLabel}
      className="geul-block-menu"
      data-geul-block-menu=""
      ref={menuRef}
      role="menu"
      style={style}
    >
      <p className="geul-block-menu__label">{dictionary.menu.turnInto}</p>
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
        aria-disabled={nestingActions?.canIndent !== true}
        className={blockMenuItemClassName}
        onClick={handleIndentBlock}
        title={
          nestingActions?.canIndent === true
            ? undefined
            : dictionary.nesting.indentDisabledReason
        }
      >
        {dictionary.menu.indent}
      </MenuItemButton>
      <MenuItemButton
        aria-disabled={nestingActions?.canOutdent !== true}
        className={blockMenuItemClassName}
        onClick={handleOutdentBlock}
        title={
          nestingActions?.canOutdent === true
            ? undefined
            : dictionary.nesting.outdentDisabledReason
        }
      >
        {dictionary.menu.outdent}
      </MenuItemButton>
      <MenuItemButton
        className={blockMenuItemClassName}
        onClick={handleDuplicate}
      >
        {dictionary.menu.duplicate}
      </MenuItemButton>
      <MenuItemButton
        className={`${blockMenuItemClassName} geul-block-menu__item--danger`}
        onClick={handleDeleteBlock}
      >
        {dictionary.menu.delete}
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
            <p className={colorSectionLabelClassName}>
              {dictionary.color.textLabel}
            </p>
            <div className="geul-menu-palette">
              {TABLE_TEXT_COLORS.map((color) => (
                <MenuItemButton
                  aria-label={`${dictionary.color.textLabel} ${dictionary.color.names[color.id]}`}
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
                aria-label={`${dictionary.color.textLabel} ${dictionary.color.none}`}
                className={colorSwatchClassName}
                onClick={() => applyBlockTextColor(null)}
              >
                ×
              </MenuItemButton>
            </div>
            <p className={colorSectionLabelClassName}>
              {dictionary.color.backgroundLabel}
            </p>
            <div className="geul-menu-palette">
              {TABLE_BACKGROUND_COLORS.map((color) => (
                <MenuItemButton
                  aria-label={`${dictionary.color.backgroundLabel} ${dictionary.color.names[color.id]}`}
                  className={colorSwatchClassName}
                  key={color.value}
                  onClick={() => applyBlockBackgroundColor(color.value)}
                  style={{ backgroundColor: color.value }}
                >
                  {""}
                </MenuItemButton>
              ))}
              <MenuItemButton
                aria-label={`${dictionary.color.backgroundLabel} ${dictionary.color.none}`}
                className={colorSwatchClassName}
                onClick={() => applyBlockBackgroundColor(null)}
              >
                ×
              </MenuItemButton>
            </div>
            <p className={colorSectionLabelClassName}>
              {dictionary.menu.align}
            </p>
            <div className="geul-cell-format-menu__align-row">
              <MenuItemButton
                aria-label={dictionary.menu.alignLeft}
                className={alignButtonClassName}
                onClick={() => applyBlockTextAlignment("left")}
              >
                {alignLeftIcon}
              </MenuItemButton>
              <MenuItemButton
                aria-label={dictionary.menu.alignCenter}
                className={alignButtonClassName}
                onClick={() => applyBlockTextAlignment("center")}
              >
                {alignCenterIcon}
              </MenuItemButton>
              <MenuItemButton
                aria-label={dictionary.menu.alignRight}
                className={alignButtonClassName}
                onClick={() => applyBlockTextAlignment("right")}
              >
                {alignRightIcon}
              </MenuItemButton>
              <MenuItemButton
                aria-label={dictionary.menu.alignNone}
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
