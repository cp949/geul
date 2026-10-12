/**
 * 실제 편집기에서 미디어 블록 선택을 흉내 내는 공용 test support.
 *
 * jsdom은 ProseMirror NodeSelection을 만들지 못한다. MediaToolbar와 FilePanel이
 * 읽는 `getSelectionMediaBlock`만 `selection.current`로 바꿔 끼우고 나머지
 * 명령과 문서는 실제 컨트롤러를 쓴다. `selection.current`를 바꾼 뒤
 * `fireSelectionChange()`를 부르면 그 시점에 오버레이가 선택을 읽는다.
 * 이 모듈이 그 우회를 단독으로 소유한다(G-TST-002).
 */

import type { EditorController } from "@cp949/geul-core";
import { type ReactNode, useMemo } from "react";

import { EditorContext, useEditor } from "../src/use-editor.js";

/** `getSelectionMediaBlock`이 돌려주는 선택 정보. */
export type SelectedMedia = NonNullable<
  ReturnType<EditorController["getSelectionMediaBlock"]>
>;

/** 덮어쓸 선택을 담는 상자. `current`가 null이면 선택 없음이다. */
export type SelectionBox = { current: SelectedMedia | null };

/** `selection`을 `getSelectionMediaBlock`으로 돌려주는 Provider 래퍼를 만든다. */
export const createSelectionOverride = (selection: SelectionBox) => {
  const WithSelectionOverride = ({ children }: { children: ReactNode }) => {
    const editor = useEditor();
    const overridden = useMemo<EditorController>(
      () =>
        Object.create(editor, {
          getSelectionMediaBlock: { value: () => selection.current },
        }) as EditorController,
      [editor],
    );
    return (
      <EditorContext.Provider value={overridden}>
        {children}
      </EditorContext.Provider>
    );
  };
  return WithSelectionOverride;
};
