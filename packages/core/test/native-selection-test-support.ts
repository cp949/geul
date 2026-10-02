/**
 * 네이티브 DOM Range/Selection을 조립해 노드에 caret을 두고, 콜백 실행 후
 * 정리하는 공용 헬퍼. table-keyboard-extension.test.ts와
 * indent-keyboard-extension.test.ts가 함께 쓴다(G-TST-002) — 이 로직은
 * TableExtension에 의존하지 않는 순수 Editor/DOM 로직이라
 * table-test-support.ts(표 전용 fixture)를 확장하지 않고 이 파일이 단독
 * 소유한다.
 */
import type { Editor as TiptapEditor } from "@tiptap/core";
import { expect, vi } from "vitest";

/**
 * attachNode를 document.body에 붙이고 rangeStartNode(생략 시 attachNode
 * 자신)의 rangeStartOffset(기본 0) 위치에 collapsed caret을 두는 네이티브
 * Selection을 만든 뒤 fn을 실행하고 정리한다.
 *
 * jsdom(과 실제 브라우저)의 Selection API는 document.body에 연결된 노드만
 * focusNode로 추적한다 — 부착이 필요한 이유다. 정리(selection 해제 +
 * attachNode 제거)는 fn이 던지더라도 항상 실행된다(G-TST-003).
 */
export const withNativeCaret = (
  attachNode: HTMLElement,
  fn: () => void,
  rangeStartNode: Node = attachNode,
  rangeStartOffset = 0,
): void => {
  const ownerDocument = attachNode.ownerDocument;
  ownerDocument.body.append(attachNode);
  try {
    const range = ownerDocument.createRange();
    const selection = ownerDocument.getSelection();

    range.setStart(rangeStartNode, rangeStartOffset);
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

/**
 * attachNode를 document.body에 붙이고 anchor/focus 방향을 보존한 native
 * Text Selection을 만든 뒤 fn을 실행한다. CodeBlock 범위 삭제 테스트가 PM
 * selection과 같은 방향의 DOM selection을 조립할 때 사용한다.
 */
export const withNativeSelection = (
  attachNode: HTMLElement,
  fn: () => void,
  anchorNode: Node,
  anchorOffset: number,
  focusNode: Node,
  focusOffset: number,
): void => {
  const ownerDocument = attachNode.ownerDocument;
  ownerDocument.body.append(attachNode);
  try {
    const selection = ownerDocument.getSelection();
    expect(selection).not.toBeNull();
    selection?.removeAllRanges();
    selection?.setBaseAndExtent(
      anchorNode,
      anchorOffset,
      focusNode,
      focusOffset,
    );
    expect(selection?.anchorNode).toBe(anchorNode);
    expect(selection?.anchorOffset).toBe(anchorOffset);
    expect(selection?.focusNode).toBe(focusNode);
    expect(selection?.focusOffset).toBe(focusOffset);
    fn();
  } finally {
    ownerDocument.getSelection()?.removeAllRanges();
    attachNode.remove();
  }
};

/**
 * jsdom Range에는 geometry API(getClientRects)가 없어, 네이티브 caret이
 * 조립된 상태에서 문서를 실제로 바꾸는 transaction(구조 변경·undo/redo)이
 * ProseMirror의 scrollToSelection을 실행하면 테스트 환경에서만 TypeError를
 * 던진다. fn 동안 scrollToSelection을 no-op으로 바꿔 이 환경 한계를
 * 우회한다 — 두 번째 소비 파일(list-item-join.test.ts)이 생긴 시점에
 * code-block-load-save.test.ts의 사본 대신 이 모듈로 올렸다(G-TST-002).
 */
export const withoutScrollCrash = (
  tiptap: TiptapEditor,
  fn: () => void,
): void => {
  const viewWithScroll = tiptap.view as typeof tiptap.view & {
    scrollToSelection(): void;
  };
  const scrollSpy = vi
    .spyOn(viewWithScroll, "scrollToSelection")
    .mockImplementation(() => {});
  try {
    fn();
  } finally {
    scrollSpy.mockRestore();
  }
};

/**
 * 정리 함수를 모두 실행한다. 하나가 던져도 나머지를 막지 않고 실패를
 * 모아 AggregateError로 던진다(G-TST-003). 시나리오가 붙인 DOM 노드와
 * selection과 Editor를 한 번에 해제할 때 쓴다.
 */
export const runCleanups = (
  cleanups: readonly (() => void)[],
  message: string,
): void => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, message);
};

/**
 * 편집기 첫 문단의 텍스트 노드 offset 위치에 DOM selection을 둔다. jsdom은
 * ProseMirror selection을 DOM selection에 동기화하지 않으므로(편집기에
 * 포커스가 없다) 직접 만든다. 실제 브라우저에서 툴바 버튼에 포커스가 가도
 * selection이 편집기에 남는 상태를 재현한다. editable은 문서에 붙어 있어야
 * 한다.
 */
export const placeDomSelectionInFirstParagraph = (
  editable: HTMLElement,
  offset: number,
): void => {
  const paragraph = editable.querySelector("p");
  const text = paragraph?.firstChild;
  if (text === null || text === undefined) {
    throw new Error("편집기 문단 텍스트 노드 조회 실패");
  }
  const selection = document.getSelection();
  expect(selection).not.toBeNull();
  selection?.setBaseAndExtent(text, offset, text, offset);
  expect(editable.contains(selection?.focusNode ?? null)).toBe(true);
};
