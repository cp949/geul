import { type RefObject, useLayoutEffect, useRef, useState } from "react";

const MENU_VIEWPORT_MARGIN = 8;

export type ClampedMenuPosition = {
  left: number;
  top: number;
};

/**
 * position: fixed 메뉴는 스크롤로 화면 안에 들어오지 않는다 — 렌더 직후
 * 실제 크기를 재서 뷰포트 안으로 접어 넣는다(PIT-0011). 앵커 좌표(left,
 * top)만으로 위치를 정하면 가변 높이 메뉴가 화면 밖으로 밀려 그 항목은
 * 클릭 자체가 불가능해진다. TableHandleMenu와 TableCellFormatMenu가
 * 공용으로 쓴다.
 */
export const useClampedMenuPosition = (
  left: number,
  top: number,
): {
  menuRef: RefObject<HTMLDivElement | null>;
  position: ClampedMenuPosition;
} => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<ClampedMenuPosition>({ left, top });

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

  return { menuRef, position };
};
