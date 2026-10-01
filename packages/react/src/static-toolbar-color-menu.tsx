import { type KeyboardEvent as ReactKeyboardEvent, useEffect } from "react";

import { MenuItemButton } from "./menu-item-button.js";
import { suppressEnterRepeat } from "./suppress-enter-repeat.js";
import {
  TABLE_BACKGROUND_COLORS,
  TABLE_TEXT_COLORS,
  type TableCellColor,
} from "./table-cell-colors.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";

export type ColorMenuProperty = "text" | "background";

// 메뉴 패널 루트의 셀렉터. 닫히거나 바뀔 때 초점이 메뉴 안에 있었는지 판정한다.
export const COLOR_MENU_SELECTOR = "[data-geul-color-menu]";

// 바깥 pointerdown 판정에서 제외할 영역. 트리거를 빼면 열린 상태에서 트리거를
// 다시 누를 때 pointerdown이 먼저 "바깥 클릭"으로 닫아 버리고, 뒤이은 click의
// 토글이 메뉴를 다시 연다(G-UI-001). 모듈 상수로 둔다 — 매 렌더 새 배열을
// 넘기면 훅이 리스너를 매번 다시 건다.
const COLOR_MENU_DISMISS_ALLOW_SELECTORS = [
  COLOR_MENU_SELECTOR,
  "[data-geul-color-trigger]",
] as const;

const SWATCH_SELECTOR = '[role="menuitem"]';

type StaticToolbarColorMenuProps = {
  /** 메뉴 좌상단 앵커의 viewport 좌표. 트리거 하단 기준이다. */
  left: number;
  top: number;

  /** 글자색인지 배경색인지. 팔레트와 스와치 모양이 갈린다. */
  property: ColorMenuProperty;

  /** 메뉴 aria-label이자 구역 제목. 호출부가 사전에서 읽는다. */
  label: string;

  /** 스와치의 색 이름. 사전 문구는 호출부가 소유한다. */
  colorName: (color: TableCellColor) => string;

  /** "색 없음" 스와치의 이름 뒤 부분. */
  noneLabel: string;

  /** 열린 직후 첫 스와치로 포커스를 옮길지. 키보드로 열 때만 `true`다. */
  focusFirst: boolean;

  /** `useDismissOnOutsideOrEscape`가 쓰는 편집기 마운트 요소. */
  element: HTMLElement | null;

  /** 스와치 확정(클릭, Enter, Space). `null`은 색 없음이다. */
  onApply: (color: string | null) => void;

  /** 바깥 클릭. 포커스를 옮기지 않는다. 호출부가 `useCallback`으로 안정시킨다. */
  onOutsideDismiss: () => void;

  /** Escape. 호출부가 편집기로 포커스를 돌린다. 호출부가 `useCallback`으로 안정시킨다. */
  onEscapeDismiss: () => void;

  /** Tab. 호출부가 메뉴를 닫고 해당 트리거로 포커스를 돌린다. */
  onTabDismiss: () => void;
};

/**
 * StaticToolbar의 글자색·배경색 menu.
 *
 * 열려 있을 때만 마운트한다. 호출부가 `key={property}`를 줘서 속성이 바뀌면
 * 다시 마운트한다. 그래야 열림 포커스 effect가 새 메뉴에서 다시 돈다.
 * 화살표·Home·End는 포커스만 옮기고 색을 입히지 않는다. Enter와 Space는
 * 포커스된 스와치 버튼의 기본 click으로 확정한다. 스와치는 모두
 * `tabIndex={-1}`이라 메뉴가 Tab 정지점을 더하지 않는다.
 */
export const StaticToolbarColorMenu = ({
  left,
  top,
  property,
  label,
  colorName,
  noneLabel,
  focusFirst,
  element,
  onApply,
  onOutsideDismiss,
  onEscapeDismiss,
  onTabDismiss,
}: StaticToolbarColorMenuProps) => {
  const { menuRef, style } = useClampedMenuPosition(left, top);

  useDismissOnOutsideOrEscape({
    active: true,
    element,
    allowSelectors: COLOR_MENU_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss,
    onEscapeDismiss,
  });

  // 키보드로 열었을 때만 메뉴 안으로 포커스를 옮긴다. 마우스로 열면 편집기
  // 포커스를 유지한다. 열린 뒤 값은 바뀌지 않으므로 마운트 시점 한 번만
  // 실행한다.
  useEffect(() => {
    if (!focusFirst) return;
    menuRef.current
      ?.querySelector<HTMLElement>(SWATCH_SELECTOR)
      ?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 열림 시점 1회만 실행한다.
  }, []);

  // 스와치 사이 이동은 DOM 순서를 그대로 쓴다. 팔레트가 줄바꿈되는 칸 수는
  // 메뉴 폭에 따라 달라지므로 2차원 이동은 하지 않는다. 포커스 자체가 현재
  // 위치다.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // 버튼은 keydown Enter마다 click을 낸다. 트리거에서 Enter를 누른 채 있으면
    // 반복이 첫 스와치를 확정한다. 이어지는 반복은 편집기로 가서 선택 범위를
    // 줄바꿈으로 바꾼다. 반복은 막는다.
    if (event.key === "Enter") {
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      // 스와치 확정이 포커스를 편집기로 돌린다. 그 뒤의 반복도 막는다.
      suppressEnterRepeat(event.currentTarget.ownerDocument);
      return;
    }
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(SWATCH_SELECTOR),
    );
    const current = items.indexOf(
      event.currentTarget.ownerDocument.activeElement as HTMLElement,
    );
    const last = items.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = Math.min(current + 1, last);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = Math.max(current - 1, 0);
    } else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key === "Tab") {
      event.preventDefault();
      onTabDismiss();
      return;
    }
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus({ preventScroll: true });
  };

  const colors =
    property === "text" ? TABLE_TEXT_COLORS : TABLE_BACKGROUND_COLORS;

  return (
    <div
      aria-label={label}
      className="geul-menu-panel"
      data-geul-color-menu=""
      onKeyDown={handleKeyDown}
      ref={menuRef}
      role="menu"
      style={style}
    >
      <p className="geul-menu-section-label">{label}</p>
      <div className="geul-menu-palette">
        {colors.map((color) => (
          <MenuItemButton
            aria-label={`${label} ${colorName(color)}`}
            className="geul-menu-swatch"
            key={color.value}
            onClick={() => onApply(color.value)}
            style={
              property === "background"
                ? { backgroundColor: color.value }
                : { backgroundColor: "transparent", color: color.value }
            }
            tabIndex={-1}
          >
            {property === "text" ? "A" : ""}
          </MenuItemButton>
        ))}
        <MenuItemButton
          aria-label={`${label} ${noneLabel}`}
          className="geul-menu-swatch"
          onClick={() => onApply(null)}
          tabIndex={-1}
        >
          ×
        </MenuItemButton>
      </div>
    </div>
  );
};
