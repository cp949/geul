/**
 * 네이티브 DOM Range/Selection을 조립해 노드에 caret을 두고, 콜백 실행 후
 * 정리하는 공용 헬퍼. table-keyboard-extension.test.ts와
 * indent-keyboard-extension.test.ts가 함께 쓴다(G-TST-002) — 이 로직은
 * TableExtension에 의존하지 않는 순수 Editor/DOM 로직이라
 * table-test-support.ts(표 전용 fixture)를 확장하지 않고 이 파일이 단독
 * 소유한다.
 */
import { expect } from "vitest";

/**
 * attachNode를 document.body에 붙이고 rangeStartNode(생략 시 attachNode
 * 자신) 위치에 collapsed caret을 두는 네이티브 Selection을 만든 뒤 fn을
 * 실행하고 정리한다.
 *
 * jsdom(과 실제 브라우저)의 Selection API는 document.body에 연결된 노드만
 * focusNode로 추적한다 — 부착이 필요한 이유다. 정리(selection 해제 +
 * attachNode 제거)는 fn이 던지더라도 항상 실행된다(G-TST-003).
 */
export const withNativeCaret = (
  attachNode: HTMLElement,
  fn: () => void,
  rangeStartNode: Node = attachNode,
): void => {
  const ownerDocument = attachNode.ownerDocument;
  ownerDocument.body.append(attachNode);
  try {
    const range = ownerDocument.createRange();
    const selection = ownerDocument.getSelection();

    range.setStart(rangeStartNode, 0);
    range.collapse(true);

    expect(selection).not.toBeNull();
    selection?.removeAllRanges();
    selection?.addRange(range);
    // Range/Selection.addRange가 실제로 focusNode를 설정함을 단언한다 —
    // 조용히 건너뛰면(PIT-0027류) 검증 없이 항상 통과하는 공허한 테스트가
    // 된다.
    expect(selection?.focusNode).not.toBeNull();

    fn();
  } finally {
    ownerDocument.getSelection()?.removeAllRanges();
    attachNode.remove();
  }
};
