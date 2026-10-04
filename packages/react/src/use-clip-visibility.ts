import { useLayoutEffect, useRef, useState } from "react";

import {
  isPointInClipBoxes,
  isRectInClipBoxes,
  readScrollClipBoxes,
} from "./scroll-clip.js";

/** clip 판정 대상 오버레이 노드 하나와 그 판정 옵션. */
export type ClipTarget = {
  node: HTMLElement;

  /** 호출부 상태 면제(드래그 중, 열린 메뉴, 편집 중). `true`면 항상 보인다. */
  exempt?: boolean;

  /** 노드 박스를 판정에 쓴다. 기본값은 `true`다. */
  box?: boolean;

  /** 있으면 앵커 점(viewport 기준)도 clip 영역 안이어야 보인다. */
  anchor?: { left: number; top: number };
};

/**
 * 안쪽 스크롤 컨테이너 밖으로 나간 오버레이를 `visibility`로 숨긴다(G-UI-003).
 * clip 판정과 면제 규칙은 이 훅 한 곳에만 둔다.
 *
 * 오버레이는 컨테이너 바깥에 그려져 컨테이너가 잘라내지 못한다. 그래서 영역 밖이면
 * 직접 숨긴다. 단, 포커스를 가진 요소가 든 오버레이는 숨기지 않는다. 숨기면 브라우저가
 * 포커스를 body로 빼 입력의 포커스를 잃는다.
 *
 * - 보임 조건: `exempt`이거나 노드 안에 `activeElement`가 있거나, `box`와 `anchor` 판정이
 *   모두 영역 안이다.
 * - 판정은 렌더마다 `useLayoutEffect`(deps 없음)에서 돈다. 스크롤은 호출부가 렌더를
 *   일으킨다.
 * - `activeElement`는 매 effect에서 읽는다. 포커스 state를 두지 않는다.
 * - 포커스가 보관 노드 밖으로 나가면 앵커가 그대로여도 렌더를 강제해 다시 판정한다.
 *   보관 노드 사이의 이동은 무시한다. 이동 중에는 `activeElement`가 body라 그대로
 *   판정하면 숨고 다음 요소로 포커스를 못 옮긴다.
 * - 판정 대상은 마지막 렌더의 `collect()` 결과다. 빈 결과면 아무것도 건드리지 않는다.
 * - `element`가 `null`이면 판정도 구독도 하지 않는다.
 *
 * `collect`는 매 렌더 새 함수여도 된다. 호출부는 오버레이 노드의 `style`에
 * `visibility`를 두지 않는다. 다음 렌더가 덮어쓴다.
 */
export const useClipVisibility = (
  element: HTMLElement | null,
  collect: () => Iterable<ClipTarget>,
): void => {
  // 값은 쓰지 않는다. 증가시켜 렌더를 일으키는 용도다.
  const [, setTick] = useState(0);
  // 마지막 렌더가 판정한 노드. 포커스 이탈 리스너가 읽는다.
  const nodesRef = useRef<readonly HTMLElement[]>([]);

  // 의존 배열이 없다. 스크롤마다 앵커와 박스가 움직인다. 매 렌더 판정한다.
  useLayoutEffect(() => {
    if (element === null) {
      nodesRef.current = [];
      return;
    }
    const targets = Array.from(collect());
    nodesRef.current = targets.map((target) => target.node);
    if (targets.length === 0) return;
    const boxes = readScrollClipBoxes(element);
    const activeElement = element.ownerDocument.activeElement;
    for (const { node, exempt = false, box = true, anchor } of targets) {
      const visible =
        exempt ||
        node.contains(activeElement) ||
        ((!box || isRectInClipBoxes(node.getBoundingClientRect(), boxes)) &&
          (anchor === undefined ||
            isPointInClipBoxes(anchor.left, anchor.top, boxes)));
      node.style.visibility = visible ? "" : "hidden";
    }
  });

  useLayoutEffect(() => {
    if (element === null) return;
    const ownerDocument = element.ownerDocument;
    const handleFocusOut = (event: FocusEvent) => {
      const nodes = nodesRef.current;
      const { target, relatedTarget } = event;
      if (!(target instanceof Node)) return;
      if (!nodes.some((node) => node.contains(target))) return;
      if (
        relatedTarget instanceof Node &&
        nodes.some((node) => node.contains(relatedTarget))
      ) {
        return;
      }
      setTick((tick) => tick + 1);
    };
    ownerDocument.addEventListener("focusout", handleFocusOut, true);
    return () => {
      ownerDocument.removeEventListener("focusout", handleFocusOut, true);
    };
  }, [element]);
};
