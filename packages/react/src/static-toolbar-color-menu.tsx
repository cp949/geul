import { type KeyboardEvent as ReactKeyboardEvent, useEffect } from "react";

import { MenuItemButton } from "./menu-item-button.js";
import { handleMenuKeyDown } from "./menu-keyboard.js";
import {
  TABLE_BACKGROUND_COLORS,
  TABLE_TEXT_COLORS,
  type TableCellColor,
} from "./table-cell-colors.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissibleOverlay } from "./use-dismissible-overlay.js";

export type ColorMenuProperty = "text" | "background";

// 메뉴 패널 루트의 셀렉터. 닫히거나 바뀔 때 초점이 메뉴 안에 있었는지 판정한다.
export const COLOR_MENU_SELECTOR = "[data-geul-color-menu]";

// 바깥 pointerdown 판정에서 제외할 영역. 트리거를 빼면 열린 상태에서 트리거를
// 다시 누를 때 pointerdown이 먼저 "바깥 클릭"으로 닫아 버리고, 뒤이은 click의
// 토글이 메뉴를 다시 연다(G-UI-001). 모듈 상수로 둔다.
// `useDismissibleOverlay`는 초점이 이 표면 안이면 닫힐 때 편집기로 돌린다.
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

  /** `useDismissibleOverlay`가 쓰는 편집기 마운트 요소. */
  element: HTMLElement | null;

  /** 스와치 확정(클릭, Enter, Space). `null`은 색 없음이다. */
  onApply: (color: string | null) => void;

  /**
   * 바깥 클릭이나 Escape로 닫을 때 부른다. 호출부는 열림 상태만 비운다.
   * 초점은 `useDismissibleOverlay`가 먼저 옮긴다. 바깥 클릭은 초점이 메뉴나
   * 트리거 안일 때만, Escape는 항상 편집기로 돌린다.
   */
  onClose: () => void;

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
  onClose,
  onTabDismiss,
}: StaticToolbarColorMenuProps) => {
  const { menuRef, style } = useClampedMenuPosition(left, top);

  // 열려 있을 때만 마운트하므로 `open`은 고정이다. 열림 초점은 아래 로컬
  // effect가 맡고 `focusOnOpen`은 쓰지 않는다. 속성이 바뀌면 `key`로
  // 다시 마운트해 스택 항목도 새로 올라간다.
  useDismissibleOverlay({
    open: true,
    element,
    allowSelectors: COLOR_MENU_DISMISS_ALLOW_SELECTORS,
    onClose,
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
  // 위치다. Enter 반복·수식 키·Tab·`preventDefault`의 순서는
  // handleMenuKeyDown이 소유한다(Issue #225, #230).
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    handleMenuKeyDown(event, {
      tab: onTabDismiss,
      navigate: (key) => {
        const items = Array.from(
          container.querySelectorAll<HTMLElement>(SWATCH_SELECTOR),
        );
        const current = items.indexOf(
          container.ownerDocument.activeElement as HTMLElement,
        );
        const last = items.length - 1;
        let next: number | null = null;
        if (key === "ArrowRight" || key === "ArrowDown") {
          next = Math.min(current + 1, last);
        } else if (key === "ArrowLeft" || key === "ArrowUp") {
          next = Math.max(current - 1, 0);
        } else if (key === "Home") next = 0;
        else if (key === "End") next = last;
        if (next === null) return false;
        items[next]?.focus({ preventScroll: true });
        return true;
      },
    });
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
