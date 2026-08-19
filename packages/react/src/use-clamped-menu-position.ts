import {
  type CSSProperties,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const MENU_VIEWPORT_MARGIN = 8;

export type ClampedMenuPosition = {
  left: number;
  top: number;
};

/**
 * 오버레이 루트가 CSS `transform`으로 앵커 좌표(left, top)에서 시각적으로
 * 얼마나 벗어나 그려지는지 기술한다. 값이 바뀌면 아래 `ANCHOR_OFFSETS`도
 * 함께 바꿔야 한다 — 각 이름은 실제 컴포넌트의 `transform` 값과 정확히
 * 대응한다.
 *
 * - `topLeft`(기본값): transform 없음 — 렌더된 박스의 좌상단이 곧
 *   (left, top)이다. `TableHandleMenu`, `TableCellFormatMenu`, `SlashMenu`,
 *   `BlockSideMenu` 블록 메뉴가 쓴다.
 * - `centerAbove`: `translate(-50%, calc(-100% - 0.5rem))`. `FormattingToolbar`,
 *   `TableSelectionToolbar`가 쓴다.
 * - `centerBelow`: `translate(-50%, 0.5rem)`. `LinkToolbar`가 쓴다.
 * - `leftGutter`: `translate(-3.5rem, 0)`. `BlockSideMenu` 사이드 버튼이 쓴다.
 */
export type ClampAnchor =
  | "topLeft"
  | "centerAbove"
  | "centerBelow"
  | "leftGutter";

type BoxOffset = { dx: number; dy: number };

const ANCHOR_OFFSETS: Record<
  ClampAnchor,
  (rect: { width: number; height: number }) => BoxOffset
> = {
  topLeft: () => ({ dx: 0, dy: 0 }),
  centerAbove: (rect) => ({ dx: -rect.width / 2, dy: -rect.height - 8 }),
  centerBelow: (rect) => ({ dx: -rect.width / 2, dy: 8 }),
  leftGutter: () => ({ dx: -56, dy: 0 }),
};

/**
 * position: fixed 메뉴는 스크롤로 화면 안에 들어오지 않는다 — 렌더 직후
 * 실제 크기를 재서 뷰포트 안으로 접어 넣는다(PIT-0011). 앵커 좌표(left,
 * top)만으로 위치를 정하면 가변 높이 메뉴가 화면 밖으로 밀려 그 항목은
 * 클릭 자체가 불가능해진다. 여러 오버레이 컴포넌트가 공용으로 쓴다
 * (각 anchor별 소비자는 `ClampAnchor` 타입 참고). `style`은 소비 측이
 * `{ left: position.left, top: position.top }`를 매번 다시 조립하지
 * 않도록 완성된 형태로 제공한다 — 반환된 `style`은 여전히 `left`/`top`
 * CSS 프로퍼티일 뿐, `transform` className은 그대로 컴포넌트가 갖는다.
 *
 * `anchor`가 `"topLeft"`가 아니면 (left, top)은 박스의 좌상단이 아니므로,
 * 클램프가 실제 렌더된 박스 기준으로 여백을 계산하려면 `ANCHOR_OFFSETS`로
 * 그 오프셋을 상쇄한다(자세한 anchor 정의는 `ClampAnchor` 타입 참고).
 *
 * 앵커 좌표가 그대로여도 박스 자체가 커지면 이전 크기로 계산한 클램프는
 * 낡은 값이 된다. 예: `LinkToolbar`가 view -> editing으로 바뀌면 폭이 약
 * 80px -> 350px로 늘고, `centerBelow`(dx = -width/2)라 늘어난 폭의 절반이
 * 오른쪽으로 밀려 뷰포트를 넘는다. `ResizeObserver`로 박스 크기 변화를
 * 관찰해 다시 클램프한다.
 */
export const useClampedMenuPosition = (
  left: number,
  top: number,
  anchor: ClampAnchor = "topLeft",
): {
  menuRef: RefObject<HTMLDivElement | null>;
  position: ClampedMenuPosition;
  style: CSSProperties;
} => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<ClampedMenuPosition>({ left, top });

  useLayoutEffect(() => {
    const node = menuRef.current;
    const view = node?.ownerDocument.defaultView ?? null;
    if (node === null || view === null) return;

    const clampToViewport = () => {
      const rect = node.getBoundingClientRect();
      const { dx, dy } = ANCHOR_OFFSETS[anchor](rect);
      const minLeft = MENU_VIEWPORT_MARGIN - dx;
      const maxLeft = Math.max(
        minLeft,
        view.innerWidth - rect.width - MENU_VIEWPORT_MARGIN - dx,
      );
      const minTop = MENU_VIEWPORT_MARGIN - dy;
      const maxTop = Math.max(
        minTop,
        view.innerHeight - rect.height - MENU_VIEWPORT_MARGIN - dy,
      );
      const nextLeft = Math.min(Math.max(left, minLeft), maxLeft);
      const nextTop = Math.min(Math.max(top, minTop), maxTop);
      // 좌표가 같으면 같은 객체를 유지한다 — ResizeObserver가 초기 관찰과
      // 크기 변화마다 부르므로 매번 새 객체를 넣으면 불필요한 렌더가 난다.
      setPosition((current) =>
        current.left === nextLeft && current.top === nextTop
          ? current
          : { left: nextLeft, top: nextTop },
      );
    };

    clampToViewport();

    // jsdom에는 ResizeObserver가 없다 — 단위 테스트는 마운트 직후 클램프만
    // 검증하고 여기서 그대로 빠져나간다.
    if (typeof view.ResizeObserver !== "function") return;
    const observer = new view.ResizeObserver(clampToViewport);
    observer.observe(node);
    return () => observer.disconnect();
  }, [left, top, anchor]);

  return {
    menuRef,
    position,
    style: { left: position.left, top: position.top },
  };
};
