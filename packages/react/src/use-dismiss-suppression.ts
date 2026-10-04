import { useMemo, useRef } from "react";

/**
 * selection·input 관측만으로 여는 overlay가 Escape(또는 그에 준하는 dismiss)로
 * 닫힌 뒤에도 같은 상태가 재관측되면 다시 열리는 문제를 막는다(G-UI-001
 * "selection·input 관측으로 열리는 overlay는 닫은 상태의 안정 key를 ref에
 * 기록하고 같은 상태의 재관측만 무시한다"). 억제 여부는 `isEqual`로만
 * 판정한다. 다른 key를 관측해도 억제 키는 자동으로 풀리지 않는다. 해제는
 * 호출부 책임이다. `clear()`를 부르지 않으면 나중에 같은 key로 돌아왔을 때
 * 다시 막힌다(Issue #259).
 * - `formatting-toolbar.tsx`·`link-toolbar.tsx`·`media-toolbar.tsx`: 억제를
 *   통과해 overlay를 열 때와 대상이 사라질 때 `clear()`한다.
 * - `file-panel.tsx`: 대상이 사라지거나 채워진 블록으로 옮겨갈 때 `clear()`한다.
 *   같은 블록의 새 제스처는 제스처 순번으로 억제를 건너뛴다.
 *
 * `formatting-toolbar.tsx`/`link-toolbar.tsx`는 `Range` 경계 비교(아래
 * `rangeBoundariesEqual`)로, `media-toolbar.tsx`/`file-panel.tsx`는 blockId
 * 문자열 비교(기본값 `Object.is`)로 각자 다른 key 타입을 넘긴다.
 *
 * table-handles.tsx의 useHandleReopenSuppression과 이름이 비슷하지만 다른
 * 문제를 푼다 — 그쪽은 pointerdown/click 시퀀스의 "드래그로 끝난 제스처"를
 * 가려내고, 이쪽은 "dismiss 직후 동일 key 재관측"을 가려낸다. 두 축 모두
 * 안정적인 참조를 위해 반환 객체를 memo한다(호출부 effect 의존성 배열에 이
 * 값을 넣을 때 매 렌더 리스너를 떼었다 다시 붙이지 않도록).
 */
export const useDismissSuppression = <K>(
  isEqual: (a: K, b: K) => boolean = Object.is,
) => {
  const dismissedKeyRef = useRef<K | null>(null);

  return useMemo(
    () => ({
      /** dismiss 시점의 key를 억제 키로 기록한다. */
      dismiss: (key: K | null) => {
        dismissedKeyRef.current = key;
      },
      /** key가 완전히 사라지는 등 새 시작으로 볼 때 억제를 해제한다. */
      clear: () => {
        dismissedKeyRef.current = null;
      },
      /** key가 마지막으로 dismiss한 key와 같으면 재오픈을 막는다. */
      isSuppressed: (key: K): boolean => {
        const dismissed = dismissedKeyRef.current;
        if (dismissed === null) return false;
        return isEqual(dismissed, key);
      },
    }),
    [isEqual],
  );
};

/** `Range` 경계(시작·끝)가 모두 같으면 같은 selection으로 본다. */
export const rangeBoundariesEqual = (a: Range, b: Range): boolean =>
  a.compareBoundaryPoints(Range.START_TO_START, b) === 0 &&
  a.compareBoundaryPoints(Range.END_TO_END, b) === 0;
