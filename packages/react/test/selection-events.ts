/**
 * DOM 선택을 세우고 `selectionchange`를 발행한다.
 *
 * jsdom(27.0.1)은 `Selection.addRange`·`removeAllRanges`로 선택이 실제로
 * 바뀌어도 `selectionchange`를 스스로 발행하지 않는다 — 두 호출 뒤 리스너 호출
 * 0회, 손으로 dispatch해야 1회다(실측 확인). 오버레이는 선택을 다시 읽을 계기를
 * 이벤트로만 받고 네 오버레이 전부 `selectionchange`를 구독하므로(다른 계기도
 * 구독하지만 프로그램적 선택 변경은 그중 무엇도 일으키지 않는다), 선택을 바꾼
 * 테스트가 그 계기를 직접 만들어야 한다. 이 모듈이 그 규칙을 단독으로 소유한다.
 *
 * 발행은 `act()` 안에서 한다. 리스너가 오버레이의 React state를 갱신하므로
 * 감싸지 않으면 단언 시점에 렌더가 끝나 있지 않다(실측 확인).
 */

import { act } from "react";

/** 선택이 바뀌었음을 알린다. 선택 자체는 바꾸지 않는다. */
export const fireSelectionChange = () => {
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
};

/**
 * 노드 안의 [start, end) 구간을 선택하고 알린다. 오프셋은 노드가 텍스트
 * 노드면 문자 단위, 요소 노드면 자식 단위다(Range의 규약 그대로).
 */
export const selectText = (node: Node, start: number, end: number) => {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireSelectionChange();
};

/** 선택을 전부 지우고(`rangeCount === 0`) 알린다. */
export const collapseSelection = () => {
  window.getSelection()?.removeAllRanges();
  fireSelectionChange();
};
