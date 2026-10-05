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
import { useClipVisibility } from "./use-clip-visibility.js";

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

/**
 * 트리거 버튼 아래에 오른쪽 끝을 맞춰 메뉴를 펼칠 때의 앵커 좌표를 읽는다.
 * 왼쪽은 트리거의 오른쪽 가장자리, 위쪽은 트리거 하단이다. 간격은 0이다.
 * `clampAnchor: "topRight"`와 짝이다. 공식은 `readAnchorBelowTrigger`와 달라서
 * 이 파일에 형제로 둔다. 문서에서 떨어진 트리거는 `null`이다.
 */
export const readAnchorBelowTriggerEnd = (
  trigger: Element,
): FixedPlacementAnchor | null => {
  if (!trigger.isConnected) return null;
  const rect = trigger.getBoundingClientRect();
  return { left: rect.right, top: rect.bottom };
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

  /**
   * `true`면 앵커 점(clamp 전 좌표)이 스크롤 컨테이너의 보이는 영역 밖일 때
   * 메뉴를 숨긴다. 선택에 붙는 popover와 블록에 붙는 fixed 오버레이용이다
   * (`useClipVisibility`). 후자는 `clipBox`를 함께 준다.
   * 메뉴는 `position: fixed`로 컨테이너 바깥에 그려져 컨테이너가 잘라내지
   * 못하므로 앵커가 스크롤돼 나가면 가장자리에 clamp된 채 남는다. 트리거를
   * 따라가는 메뉴는 `false`로 둔다(#218). 기본값은 `false`이고 이때 메뉴의
   * `visibility`를 읽지도 쓰지도 않는다.
   *
   * 숨김은 `visibility`다. 호출부가 `style`에 `visibility`를 넣으면 렌더가
   * 덮어쓴다. 메뉴 안에 포커스가 있으면 숨기지 않는다(`useClipVisibility`).
   */
  clip?: boolean;

  /**
   * `true`면 `clip`이 메뉴를 숨기지 않는다. 앵커 판정을 면제한다.
   * `clipBox`이면 박스 판정도 면제한다.
   * - 이 메뉴의 자식 메뉴가 열려 있을 때 준다. 부모 메뉴만 숨고 자식 메뉴만
   *   떠 있는 상태를 막는다.
   * - 블록 오버레이는 드래그 중일 때와 이 오버레이로 연 메뉴가 열려 있을 때 준다.
   * `clip`이 아니면 쓰이지 않는다. 기본값은 `false`다.
   */
  clipExempt?: boolean;

  /**
   * `true`면 `clip`이 앵커 점과 함께 메뉴 박스도 본다. 둘 다 영역 안이어야
   * 보인다. 블록에 붙는 fixed 오버레이(블록 gutter, 미디어 툴바)용이다(#267).
   * - 박스만 보면 viewport clamp가 박스를 영역 안으로 끌어와 영역 밖 블록의
   *   오버레이가 남는다.
   * - 앵커만 보면 박스가 영역 경계에 걸쳐 삐져나온다.
   *
   * `clip`이 아니면 쓰이지 않는다. 기본값은 `false`다.
   */
  clipBox?: boolean;
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
  clip = false,
  clipExempt = false,
  clipBox = false,
}: UseFixedPlacementOptions): {
  menuRef: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
} => {
  const [anchor, setAnchor] = useState<FixedPlacementAnchor | null>(null);
  // 값은 쓰지 않는다. 증가시켜 렌더를 일으키는 용도다.
  const [, setTick] = useState(0);
  const readAnchorRef = useRef(readAnchor);
  // `anchor` 상태의 최신 값. effect가 `setState` 없이 변화를 판정하는 데 쓴다.
  const anchorRef = useRef<FixedPlacementAnchor | null>(null);

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

  // 의존 배열이 없다. 렌더마다 읽는다. 같은 좌표면 `setState`를 부르지 않는다. 같은
  // 값으로 부르면 React가 eager bailout을 못 하는 렌더(대기 중인 lane이 남은 fiber)에서
  // 업데이트를 큐에 넣고, 이 effect가 매 커밋 다시 돌아 "Maximum update depth
  // exceeded"가 난다. 그래서 상태와 같은 값을 ref에도 두고 ref로 먼저 거른다.
  // NaN은 `===`로 같지 않아 `Object.is`로 비교한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 렌더 직후 읽기가 계약이다.
  useLayoutEffect(() => {
    if (!open) {
      if (anchorRef.current === null) return;
      anchorRef.current = null;
      setAnchor(null);
      return;
    }
    const next = readAnchorRef.current();
    if (next === null) return;
    const current = anchorRef.current;
    if (
      current !== null &&
      Object.is(current.left, next.left) &&
      Object.is(current.top, next.top)
    ) {
      return;
    }
    anchorRef.current = next;
    setAnchor(next);
  });

  const placed = anchor ?? fallbackAnchor;
  const placement = useClampedMenuPosition(
    placed?.left ?? 0,
    placed?.top ?? 0,
    clampAnchor,
  );

  // 판정과 면제는 `useClipVisibility`가 소유한다. 이 훅은 앵커 점을 넘긴다. 박스는
  // `clipBox`일 때만 본다. popover는 앵커 위나 아래에 붙어 박스가 경계 밖으로 조금
  // 삐져나올 수 있다. 앵커 점은 clamp 전 좌표다. 박스는 clamp 뒤 렌더된 박스다.
  // 닫혀 있을 때나 앵커가 없을 때, `clip`이 아닐 때는 `element`를 `null`로 줘
  // `visibility`를 읽지도 쓰지도 않는다.
  useClipVisibility(
    clip && open && placed !== undefined ? element : null,
    () => {
      const node = placement.menuRef.current;
      if (node === null || placed === undefined) return [];
      return [{ node, exempt: clipExempt, box: clipBox, anchor: placed }];
    },
  );

  return placement;
};
