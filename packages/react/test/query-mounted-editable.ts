/**
 * 마운트된 편집 영역 노드를 얻는다.
 *
 * `EditorContent`가 렌더하는 host div(`role="textbox"`, `aria-label="Editor"`)는
 * 편집 영역이 아니다 — 컨트롤러가 그 안에 contenteditable 자식을 따로 넣는다.
 * 오버레이의 초점 복구(`focusEditor`)는 전부
 * `element?.querySelector<HTMLElement>('[contenteditable="true"]')`로 대상을
 * 찾으므로(G-TST-001), 테스트도 같은 경로로 얻어야 초점 단언이 공허해지지 않는다.
 *
 * 실제 마운트한 ProseMirror view도 IDL이 아니라 `contenteditable` 속성을
 * 세우므로(실측 확인) 이 헬퍼는 fake DOM과 실제 편집기 양쪽에서 같이 동작한다.
 */
export const queryMountedEditable = (host: HTMLElement): HTMLElement => {
  const editable = host.querySelector<HTMLElement>('[contenteditable="true"]');
  if (editable === null) throw new Error("Editable was not mounted");
  return editable;
};
