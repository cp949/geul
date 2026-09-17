import {
  type RefObject,
  useCallback,
  useLayoutEffect,
  useState,
} from "react";

type AnchoredSubmenuPosition = { left: number; top: number };

/**
 * "트리거(⋯) 자신의 rect를 실측해 우측-하단을 서브메뉴 anchor로 쓴다"는
 * media-toolbar.tsx·code-block-language-combobox.tsx 공통 패턴을 추출한다.
 * 코드리뷰 결함 2 — 형제 노드 삽입(actionError span 등)으로 `containerRef`
 * outer 컨테이너 폭이 바뀌면 topRight anchor(`transform: translateX(-100%)`)가
 * 컨테이너 좌표를 다시 계산해 트리거가 화면에서 밀린다. 트리거 자신은
 * 리사이즈되지 않으므로 트리거가 아니라 `containerRef`를 관찰해야 이 이동을
 * 잡는다(G-UI-001). `open`이 아니면 관찰하지 않는다(리소스 누수 방지) —
 * 닫히는 순간 클린업이 disconnect한다.
 *
 * `open` 전환과 컨테이너 리사이즈는 훅이 스스로 재계산한다. 소비처 자신의
 * 사정(예: selection 재조회로 툴바 전체가 재배치되는 경우)으로도 재계산이
 * 필요하면 반환된 `recompute`를 소비처의 `useLayoutEffect` deps에 맞춰
 * 직접 불러야 한다 — 그 트리거 값의 이름·타입이 소비처마다 달라 훅 인자로
 * 못 박을 수 없다.
 */
export const useAnchoredSubmenu = (
  triggerRef: RefObject<HTMLElement | null>,
  containerRef: RefObject<HTMLElement | null>,
  open: boolean,
): {
  anchor: AnchoredSubmenuPosition | null;
  recompute: () => void;
} => {
  const [anchor, setAnchor] = useState<AnchoredSubmenuPosition | null>(null);

  const recompute = useCallback(() => {
    const node = triggerRef.current;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    setAnchor((current) =>
      current !== null &&
      current.left === rect.right &&
      current.top === rect.bottom
        ? current
        : { left: rect.right, top: rect.bottom },
    );
  }, [triggerRef]);

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    recompute();
  }, [open, recompute]);

  useLayoutEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const view = container?.ownerDocument.defaultView ?? null;
    if (container === null || view === null) return;
    // jsdom에는 ResizeObserver가 없다 — 이 보강은 실 레이아웃 엔진이 있는
    // e2e(Chromium)에서만 검증한다.
    if (typeof view.ResizeObserver !== "function") return;
    const observer = new view.ResizeObserver(recompute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [open, recompute, containerRef]);

  return { anchor, recompute };
};
