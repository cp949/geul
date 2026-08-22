/**
 * DOM 선택을 세우고 `selectionchange`를 발행한다.
 *
 * jsdom(27.0.1)은 `Selection.addRange`·`removeAllRanges`로 선택이 실제로
 * 바뀌면 `selectionchange`를 발행하지만 **매크로태스크로 큐잉한다** — 호출
 * 직후와 마이크로태스크 시점의 리스너 호출은 0회이고 다음 매크로태스크에서
 * 1회다(실측 확인). 선택이 실제로 바뀌지 않으면 아예 발행하지 않는다(이미 빈
 * 선택에서 `removeAllRanges`는 0회). 동기로 진행하는 테스트 본문은 그 이벤트를
 * 절대 보지 못하므로, 선택을 바꾼 테스트가 이벤트를 직접 쏴야 한다.
 * `selectionchange`를 구독하는 오버레이는 마운트 시 선택을 1회 직접 읽고 그
 * 뒤로는 다시 읽을 계기를 이벤트로 받으므로(다른 계기도 구독하지만 프로그램적
 * 선택 변경은 그중 무엇도 일으키지 않는다), 그 계기를 만드는 것은 테스트의
 * 몫이다. 이 모듈이 그 규칙을 단독으로 소유한다.
 *
 * 큐잉된 이벤트는 사라지지 않는다 — 호출부에 `await`가 있으면 뒤늦게 도착한다.
 * 실측: 빈 선택에서 `selectText()` 1회는 동기 1회·다음 매크로태스크까지 누적
 * 2회, 선택이 이미 있으면 3회다(`removeAllRanges`와 `addRange`가 각각 1회씩
 * 큐잉한다). `collapseSelection()`은 선택이 있으면 동기 1회·누적 2회이고, 이미
 * 빈 선택에서는 지울 것이 없어 지연분 없이 누적 1회다. `act()`는 이 지연분을
 * 앞당기지 않는다(실측 확인). 실제 편집기에 캐럿을 놓는 `placeCaret`도 같은
 * 지연분을 남긴다 — 두 번째 `selectionchange`가 언제 필요한지는 Issue #85가
 * 소유한다.
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
