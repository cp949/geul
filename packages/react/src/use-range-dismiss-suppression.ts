import { useMemo, useRef } from "react";

/**
 * selection 관측(selectionchange/mouseup/keyup/scroll/resize, useSelectionRefresh
 * 참고)만으로 여는 overlay가 Escape로 닫힌 뒤에도 같은 selection이 재관측되면
 * 다시 열리는 문제를 막는다(G-UI-001 "selection·input 관측으로 열리는
 * overlay는 닫은 상태의 안정 key를 ref에 기록하고 같은 상태의 재관측만
 * 무시한다"). Escape가 아닌 다른 이유로 selection이 바뀌면(Range 경계가
 * 달라지면) 억제는 자동으로 풀린다 — 새 Range가 dismissedRange와 더 이상
 * 같지 않기 때문이다. formatting-toolbar.tsx가 최초 소비처다.
 *
 * table-handles.tsx의 useHandleReopenSuppression과 이름이 비슷하지만 다른
 * 문제를 푼다 — 그쪽은 pointerdown/click 시퀀스의 "드래그로 끝난 제스처"를
 * 가려내고, 이쪽은 "Escape 직후 동일 selection 재관측"을 가려낸다. 두 축
 * 모두 안정적인 참조를 위해 반환 객체를 memo한다(호출부 effect 의존성
 * 배열에 이 값을 넣을 때 매 렌더 리스너를 떼었다 다시 붙이지 않도록).
 */
export const useRangeDismissSuppression = () => {
  const dismissedRangeRef = useRef<Range | null>(null);

  return useMemo(
    () => ({
      /** Escape로 닫는 시점의 Range를 억제 키로 기록한다. */
      dismiss: (range: Range | null) => {
        dismissedRangeRef.current = range;
      },
      /** selection이 완전히 사라지는 등 새 시작으로 볼 때 억제를 해제한다. */
      clear: () => {
        dismissedRangeRef.current = null;
      },
      /** range가 마지막으로 dismiss한 Range와 경계가 같으면 재오픈을 막는다. */
      isSuppressed: (range: Range): boolean => {
        const dismissed = dismissedRangeRef.current;
        if (dismissed === null) return false;
        return (
          dismissed.compareBoundaryPoints(Range.START_TO_START, range) === 0 &&
          dismissed.compareBoundaryPoints(Range.END_TO_END, range) === 0
        );
      },
    }),
    [],
  );
};
