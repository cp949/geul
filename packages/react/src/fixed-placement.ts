import {
  type CSSProperties,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  type ClampAnchor,
  useClampedMenuPosition,
} from "./use-clamped-menu-position.js";

/** viewport 기준 앵커 좌표. `useClampedMenuPosition`의 (left, top)과 같은 좌표계다. */
export type FixedPlacementAnchor = {
  left: number;
  top: number;
};

/** 트리거 하단과 메뉴 상단 사이 간격(px). */
const TRIGGER_MENU_GAP_PX = 4;

/**
 * 트리거 버튼 아래에 메뉴를 펼칠 때의 앵커 좌표를 읽는다. 왼쪽은 트리거의
 * 왼쪽 가장자리, 위쪽은 하단 + 4px다. 이 공식은 이 함수 한 곳에만 둔다.
 * 문서에서 떨어진 트리거는 `null`이다. 그러면 `useFixedPlacement`가 마지막 좌표를
 * 유지한다.
 */
export const readAnchorBelowTrigger = (
  trigger: Element,
): FixedPlacementAnchor | null => {
  if (!trigger.isConnected) return null;
  const rect = trigger.getBoundingClientRect();
  return { left: rect.left, top: rect.bottom + TRIGGER_MENU_GAP_PX };
};

type UseFixedPlacementOptions = {
  /** 열려 있는 동안만 scroll·resize를 구독한다. */
  open: boolean;

  /** 편집기 마운트 요소. owner window를 얻는 출처다. `null`이면 구독하지 않는다. */
  element: HTMLElement | null;

  /**
   * 앵커 좌표를 DOM에서 지금 읽어 돌려준다. 오프셋(예: 트리거 하단 + 4)은 이
   * 함수가 한 번만 정의한다. DOM을 읽을 수 없으면 `null`을 돌려준다. 그러면
   * 마지막 좌표를 유지한다. 닫기는 호출부 책임이다.
   *
   * 열린 첫 읽기가 `null`이면 `fallbackAnchor`를 쓴다. 옵션이 없으면 호출부
   * 버그다. 그 경우 `useClampedMenuPosition`의 초기 좌표 (0, 0)이 쓰인다.
   *
   * 매 렌더 새 함수여도 된다. 이 훅은 ref로 최신 함수만 쓰고 구독을 다시
   * 걸지 않는다.
   */
  readAnchor: () => FixedPlacementAnchor | null;

  /** 렌더된 박스와 앵커 좌표의 기하 관계. 기본값은 `"topLeft"`다. */
  clampAnchor?: ClampAnchor;

  /**
   * 열린 뒤 첫 읽기가 `null`일 때만 쓰는 좌표. 앵커가 DOM에 없을 수 있는
   * 호출부(예: 편집기 밖에 DOM 선택이 있는 캐럿 메뉴)가 (0, 0) 구석 대신
   * 화면 안 기본 위치를 정한다. 한 번 좌표를 읽은 뒤의 `null`은 마지막 좌표를
   * 유지한다. 이 옵션은 그때 쓰이지 않는다.
   */
  fallbackAnchor?: FixedPlacementAnchor;
};

/**
 * `position: fixed` 해제형 오버레이의 배치를 맡는 내부 hook(Issue #234).
 * 앵커 읽기, 재측정 구독, viewport clamp를 한 곳에 모은다.
 *
 * 열림 상태가 클릭 시점 rect를 값으로 보관하면 스크롤에서 앵커와 떨어진다.
 * 호출부는 rect 대신 `readAnchor`를 넘긴다. 이 훅이 렌더마다 앵커를 다시 읽는다.
 * 호출부는 열림 상태에 `open`과 식별자만 둔다.
 *
 * 읽기 시점은 이벤트 핸들러가 아니라 렌더 직후다. scroll·resize는 강제 렌더만
 * 일으킨다. 앵커가 다른 오버레이 안에 있을 때(예: 툴바 안의 트리거) 그
 * 오버레이는 이벤트 뒤 한 번 더 렌더된 뒤에야 움직인다. 이벤트 시점에 읽으면
 * 낡은 rect를 읽는다. 렌더 직후 읽고, 같은 좌표면 상태를 유지해 수렴한다.
 * 앵커를 움직이는 상태가 이 훅을 부른 컴포넌트 안에 있어야 수렴한다. 그
 * 상태가 다른 컴포넌트에 있으면 그 컴포넌트가 다시 렌더돼도 이 훅은 다시 읽지 않는다.
 *
 * 구독은 `element.ownerDocument.defaultView`의 scroll(capture)·resize다.
 * 안쪽 스크롤 컨테이너의 scroll은 버블링하지 않아 capture로 window에서 듣는다
 * (G-UI-001).
 *
 * clamp는 `useClampedMenuPosition`이 맡는다. 호출부는 그 훅을 직접 부르지 않는다.
 */
export const useFixedPlacement = ({
  open,
  element,
  readAnchor,
  clampAnchor = "topLeft",
  fallbackAnchor,
}: UseFixedPlacementOptions): {
  menuRef: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
} => {
  const [anchor, setAnchor] = useState<FixedPlacementAnchor | null>(null);
  // 값은 쓰지 않는다. 증가시켜 렌더를 일으키는 용도다.
  const [, setTick] = useState(0);
  const readAnchorRef = useRef(readAnchor);

  // 읽기 effect보다 먼저 선언한다. 같은 렌더의 최신 함수를 읽게 한다.
  useLayoutEffect(() => {
    readAnchorRef.current = readAnchor;
  });

  useLayoutEffect(() => {
    if (!open) return;
    const view = element?.ownerDocument.defaultView ?? null;
    if (view === null) return;
    const refresh = () => setTick((tick) => tick + 1);
    view.addEventListener("scroll", refresh, true);
    view.addEventListener("resize", refresh);
    return () => {
      view.removeEventListener("scroll", refresh, true);
      view.removeEventListener("resize", refresh);
    };
  }, [open, element]);

  // 의존 배열이 없다. 렌더마다 읽고, 같은 좌표면 같은 객체를 유지해 무한 렌더를 막는다.
  // NaN은 `===`로 같지 않아 `Object.is`로 비교한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 렌더 직후 읽기가 계약이다.
  useLayoutEffect(() => {
    if (!open) {
      setAnchor((current) => (current === null ? current : null));
      return;
    }
    const next = readAnchorRef.current();
    if (next === null) return;
    setAnchor((current) =>
      current !== null &&
      Object.is(current.left, next.left) &&
      Object.is(current.top, next.top)
        ? current
        : next,
    );
  });

  const placed = anchor ?? fallbackAnchor;
  return useClampedMenuPosition(
    placed?.left ?? 0,
    placed?.top ?? 0,
    clampAnchor,
  );
};
