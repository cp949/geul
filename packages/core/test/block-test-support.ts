/**
 * 블록 키보드·native input rule 계약 테스트가 공유하는 keydown·text input
 * 실 디스패치와 블록 텍스트 위치 조회를 소유한다. 두 번째 소비 파일이 생긴
 * 시점에 사본 대신 이 모듈로 올렸다(G-TST-002).
 */
import type { Editor as TiptapEditor } from "@tiptap/core";

/**
 * keydown을 view.someProp("handleKeyDown", ...)로 실 디스패치하고 소비
 * 여부(어떤 핸들러가 true를 반환해 preventDefault될지)를 돌려준다.
 * addKeyboardShortcuts로만 등록된 커맨드는 editor.commands로 노출되지
 * 않으므로(G-WKS-001) 키맵 등록 순서·폴백 체인까지 포함해 검증하려면 이
 * 경로가 유일한 트리거다.
 */
export const dispatchKeydown = (
  tiptap: Pick<TiptapEditor, "view">,
  key: string,
  shiftKey = false,
): boolean =>
  tiptap.view.someProp(
    "handleKeyDown",
    (f) =>
      f(
        tiptap.view,
        new KeyboardEvent("keydown", {
          key,
          shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      ) === true,
  ) === true;

/**
 * Mod-Shift-<key> keydown을 실 디스패치한다("Mod"는 jsdom 기본 플랫폼
 * 기준 ctrlKey). `addKeyboardShortcuts`로만 등록된 커맨드는 editor.commands로
 * 노출되지 않아(G-WKS-001) 이 경로가 유일한 트리거인 이유는 dispatchKeydown과
 * 같다 — block-type-keyboard-extension.test.ts(Mod-Shift-6~9)의 로컬
 * 사본이 두 번째 소비 파일(block-move-commands.test.ts)에서 이 모듈로
 * 올라왔다(G-TST-002).
 */
export const dispatchModShiftKeydown = (
  tiptap: Pick<TiptapEditor, "view">,
  key: string,
): boolean =>
  tiptap.view.someProp(
    "handleKeyDown",
    (f) =>
      f(
        tiptap.view,
        new KeyboardEvent("keydown", {
          key,
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ) === true,
  ) === true;

/**
 * native text input 직전의 ProseMirror handleTextInput 경계를 실
 * 디스패치하고 input rule이 소비했는지(true) 아닌지를 돌려준다. list와
 * block-type native shorthand 테스트가 공유한다(RD-002, 두 번째 소비 파일).
 */
export const dispatchTextInput = (
  tiptap: Pick<TiptapEditor, "view" | "state">,
  text: string,
): boolean => {
  const { from, to } = tiptap.state.selection;
  return (
    tiptap.view.someProp(
      "handleTextInput",
      (handler) =>
        handler(tiptap.view, from, to, text, () =>
          tiptap.state.tr.insertText(text, from, to),
        ) === true,
    ) === true
  );
};

/**
 * input rule 미소비 텍스트를 브라우저 기본 입력과 같은 범위에 삽입한다.
 * dispatchTextInput이 소비하지 않으면(input rule 비대상) 직접 insertText로
 * 폴백해 실제 타이핑과 같은 최종 문서 상태를 만든다.
 */
export const typeNativeText = (
  tiptap: Pick<TiptapEditor, "view" | "state">,
  text: string,
): boolean => {
  const { from, to } = tiptap.state.selection;
  const consumed = dispatchTextInput(tiptap, text);
  if (!consumed)
    tiptap.view.dispatch(tiptap.state.tr.insertText(text, from, to));
  return consumed;
};

/**
 * blockId로 blockContainer를 찾아 그 콘텐츠 노드(paragraph/heading)의
 * 텍스트 시작 위치를 돌려준다. 컨테이너 pos + 1은 콘텐츠 노드 자신,
 * + 2가 그 안 텍스트 시작이다(D19 구조 토큰 산술).
 */
export const contentTextStart = (
  tiptap: Pick<TiptapEditor, "state">,
  blockId: string,
): number => {
  let found: number | null = null;
  tiptap.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "blockContainer" && node.attrs.blockId === blockId) {
      found = pos + 2;
      return false;
    }
    return true;
  });
  if (found === null) throw new Error(`blockContainer ${blockId} 조회 실패`);
  return found;
};
