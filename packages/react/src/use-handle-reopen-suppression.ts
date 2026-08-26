import { useCallback, useMemo, useRef } from "react";

export type HandleClickOutcome = "suppressed" | "close" | "open";

type ConsumeClickOptions = {
  /** event.detail !== 0 — 포인터로 온 click인지(0이면 키보드 활성화). */
  isPointerClick: boolean;
  /** 억제 여부를 비교할 키. 드래그 종료 시 markSuppressed에 넘긴 키와 같은
   *  축이어야 한다(table-handles.tsx는 안정 id, block-side-menu.tsx는
   *  blockId). */
  suppressionKey: string;
  /** pointerdown 시점 스냅샷과 비교할 키 — "재오픈" 판정용. table-handles.tsx는
   *  이 값이 suppressionKey와 다른 축(위치 index)일 수 있다. */
  reopenKey: string;
  /** 지금 이 핸들에 대해 메뉴가 열려 있는지(라이브 상태). */
  isCurrentlyOpen: boolean;
};

/**
 * 핸들 클릭이 "메뉴 열기 / 닫기 / 무시"인지 판정하는 재열림 억제 상태 머신.
 * table-handles.tsx, block-side-menu.tsx가 각자 복제해온
 * suppressedHandleClickRef/wasMenuOpenForHandleRef 쌍을 하나로 모은다
 * (Issue #52).
 *
 * 두 문제를 함께 다룬다:
 * 1. 드래그로 끝난 제스처가 합성하는 click은 메뉴 열기로 해석하지 않는다 —
 *    pointerup에서 markSuppressed(key)를 부르고, 뒤이은 click이
 *    consumeClick으로 같은 key를 만나면 "suppressed"를 반환한다.
 * 2. 실제 마우스 클릭은 pointerdown → pointerup → click 순으로 온다.
 *    pointerdown이 메뉴 상태를 무조건 null로 리셋해 React 18이 그 변경을
 *    click보다 먼저 flush하므로, click이 읽는 라이브 메뉴 상태는 재클릭
 *    시 항상 닫힌 것처럼 보인다 — 그대로면 "닫는 쪽"을 절대 타지 못하고
 *    매번 "여는 쪽"(재오픈)만 탄다. onPointerDown이 리셋 직전 상태를
 *    스냅샷해두면 consumeClick이 그 스냅샷으로 판정할 수 있다.
 *
 * 두 키(suppressionKey/reopenKey)를 분리해 받는 이유: table-handles.tsx는
 * 억제 비교를 안정 id로(이동 성공 후에도 id는 안 바뀐다), 재오픈 비교를
 * 위치 index로 한다 — 이 훅은 그 축이 같은지 모르는 채로 문자열만 비교한다.
 */
export const useHandleReopenSuppression = () => {
  const suppressedKeyRef = useRef<string | null>(null);
  const wasOpenKeyRef = useRef<string | null>(null);

  const onPointerDown = useCallback((openSnapshotKey: string | null) => {
    suppressedKeyRef.current = null;
    wasOpenKeyRef.current = openSnapshotKey;
  }, []);

  const markSuppressed = useCallback((key: string) => {
    suppressedKeyRef.current = key;
  }, []);

  const consumeClick = useCallback(
    ({
      isPointerClick,
      suppressionKey,
      reopenKey,
      isCurrentlyOpen,
    }: ConsumeClickOptions): HandleClickOutcome => {
      const suppressed = suppressedKeyRef.current;
      suppressedKeyRef.current = null;
      const wasOpen = wasOpenKeyRef.current;
      wasOpenKeyRef.current = null;

      if (isPointerClick && suppressed === suppressionKey) return "suppressed";
      if (wasOpen === reopenKey || isCurrentlyOpen) return "close";
      return "open";
    },
    [],
  );

  // 반환 객체를 memo하지 않으면 매 렌더 새 참조가 나가 이 훅을 쓰는
  // 호출부의 effect 의존성 배열에 이 값 전체를 넣을 때마다 매 렌더
  // 리스너를 떼었다 다시 붙인다 — onPointerDown/markSuppressed/consumeClick
  // 자체는 useCallback([])로 이미 안정적이므로 memo 자체도 안정적이다.
  return useMemo(
    () => ({ onPointerDown, markSuppressed, consumeClick }),
    [onPointerDown, markSuppressed, consumeClick],
  );
};
