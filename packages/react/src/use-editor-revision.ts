import { createContext, useContext } from "react";

const missingProviderMessage =
  "Editor components must be used within an EditorProvider.";

// packages/react 내부 전용 primitive다(Issue #141, 01-계획.md "결정" 2) —
// index.ts에 export하지 않는다. `getDocument()`를 렌더 시점에만 읽고
// 구독하지 않는 오버레이(block-side-menu-menu.tsx 등)가 외부
// `EditorController` command로 인한 문서 변경을 감지하는 데 쓴다.
//
// EditorProvider가 내부에서 `createEditor()`를 호출하는 "internal
// ownership" 경로(editor prop 없이 initialDocument로 마운트)에서만 문서가
// 바뀔 때마다 증가한다. `EditorController`에는 subscribe류 API가 없고
// (editor-controller.ts), `editor` prop으로 컨트롤러를 직접 넘기는
// "external ownership" 경로는 EditorProvider가 그 컨트롤러의 onChange를
// 아예 설정하지 않으므로(EditorProviderProps external 분기는
// `onChange?: never`) 그 경로에서는 이 revision이 절대 바뀌지 않는다 —
// Issue 본문이 요구한 "React adapter의 controller change 구독 seam"은
// EditorProvider가 컨트롤러를 직접 만드는 경로에서만 세울 수 있다.
export const EditorRevisionContext = createContext<number | null>(null);

export const useEditorRevision = (): number => {
  const revision = useContext(EditorRevisionContext);
  if (revision === null) throw new Error(missingProviderMessage);
  return revision;
};
