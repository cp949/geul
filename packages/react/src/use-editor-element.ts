import { useEditorMount } from "./use-editor.js";

/**
 * `EditorContent`가 마운트한 편집기 DOM element를 읽기 전용으로 공개한다
 * (Issue #210 "## 결정" D4). `useEditorMount()`가 함께 갖고 있는
 * `setElement`(내부 전용 mutator — `Dispatch<SetStateAction<HTMLElement |
 * null>>`, `EditorContent`만 호출해야 한다)는 그대로 노출하지 않는다 —
 * 공개하면 소비자가 편집기 마운트 참조를 직접 덮어쓸 길이 생긴다. 이
 * 훅은 `element`만 얇게 감싼다.
 *
 * `EmojiPicker`/`SlashMenu`가 내부적으로 쓰던 캐럿-폴링·keydown 리스너
 * 배선(이 element의 `ownerDocument`/`ownerWindow`에 건다)을 소비자 앱이
 * 자체 트리거 popup(예: `apps/showcase`의 mention 예제)을 만들 때도 그대로
 * 재사용할 수 있도록 `useFocusEditor`/`useClampedMenuPosition`/
 * `useDismissOnOutsideOrEscape`와 함께 공개 표면으로 승격했다.
 */
export const useEditorElement = (): HTMLElement | null =>
  useEditorMount().element;
