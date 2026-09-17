import { useCallback, useRef } from "react";

import { useMirroredState } from "./use-mirrored-state.js";

export type ExclusiveOverlayEntry = {
  onClose: () => void;
};

export type ExclusiveOverlayConfig = Record<string, ExclusiveOverlayEntry>;

export type UseExclusiveOverlayResult = {
  activeId: string | null;
  open: (id: string) => void;
};

// code-block-language-combobox.tsx의 언어 팝오버/caption 편집/더보기 메뉴
// 3-peer 상호배제 전용(01-계획.md "20260918-01-toolbar-exclusive-overlay") —
// 정적 config 객체를 매 렌더 새로 받는다는 전제로 설계했다(각 id의 onClose가
// 그 렌더의 최신 closure를 참조해야 하므로 ref로 캐시하고 의존성 배열에는
// 넣지 않는다). 이 훅은 "형제 오버레이 중 무엇을 닫을지"만 판정한다 —
// 바깥 클릭·Escape 판정(ADR-0013, use-dismiss-on-outside-or-escape.ts)과는
// 별개 계층이라 합성으로만 쓴다(둘을 합치지 않는다). 각 오버레이 자신의
// 열림 상태(true/false, 또는 code-block-caption-editing-store.ts 같은 외부
// store)는 계속 소비처가 소유한다 — 이 훅은 "다른 형제가 열리면 나를
// 닫아라"는 신호(onClose 호출)만 내보낸다.
//
// table-handles.tsx의 activeTableId = hoverTableId ?? selectionTableId
// 파생과는 다르다(그릴링에서 정정) — 그건 여러 상태가 동시에 존재해도
// 되는 수동적 파생이고, 이 훅은 이전 활성 오버레이를 실제로 언마운트시켜야
// 하는 능동적 close다. "단일 소스가 승자를 정한다"는 아이디어만 빌렸다.
export const useExclusiveOverlay = (
  overlays: ExclusiveOverlayConfig,
): UseExclusiveOverlayResult => {
  const [activeId, activeIdRef, updateActiveId] = useMirroredState<
    string | null
  >(null);
  // open()이 이벤트 핸들러 안에서 최신 config를 동기로 읽어야 한다
  // (use-mirrored-state.ts 패턴과 같은 이유 — open 자체는 useCallback으로
  // 참조를 안정시켜 매 렌더 재생성하지 않으므로, config 변화는 ref로만
  // 반영한다).
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;

  const open = useCallback(
    (id: string) => {
      const previous = activeIdRef.current;
      if (previous !== null && previous !== id) {
        overlaysRef.current[previous]?.onClose();
      }
      updateActiveId(id);
    },
    [activeIdRef, updateActiveId],
  );

  return { activeId, open };
};
