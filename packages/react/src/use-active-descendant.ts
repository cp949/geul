import { useEffect } from "react";

/**
 * 편집기 contenteditable에 `aria-activedescendant`를 알리고 정리하는 훅.
 *
 * 캐럿 트리거 팝업(`EmojiPicker`)은 초점을 갖지 않는다. 캐럿이 계속 편집기에
 * 머물므로 속성은 팝업이 아니라 실제 contenteditable에 달아야 한다.
 *
 * - 대상은 `EditorContent` host div(role="textbox")가 아니다.
 * - PM이 host 안에 만든 `[contenteditable="true"]` 자식이다.
 * - 조회 방식은 `use-focus-editor.ts`와 같다.
 *
 * `activeOptionId`가 `undefined`면 아무것도 하지 않는다(빈 id 참조 방지).
 * 값이 바뀌거나 언마운트되면 속성을 제거한다. `slash-menu.tsx`의 같은 effect와
 * 동작이 같다. 이 훅은 `index.ts`로 공개하지 않는다.
 */
export const useActiveDescendant = (
  element: HTMLElement | null,
  activeOptionId: string | undefined,
): void => {
  useEffect(() => {
    const editable = element?.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    );
    if (!editable || activeOptionId === undefined) return;
    editable.setAttribute("aria-activedescendant", activeOptionId);
    return () => {
      editable.removeAttribute("aria-activedescendant");
    };
  }, [activeOptionId, element]);
};
