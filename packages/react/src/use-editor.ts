import type { Dictionary, EditorController } from "@cp949/geul-core";
import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useContext,
} from "react";

const missingProviderMessage =
  "Editor components must be used within an EditorProvider.";

export const EditorContext = createContext<EditorController | null>(null);

type EditorMountContextValue = {
  element: HTMLElement | null;
  setElement: Dispatch<SetStateAction<HTMLElement | null>>;
};

export const EditorMountContext = createContext<EditorMountContextValue | null>(
  null,
);

export const useEditor = (): EditorController => {
  const editor = useContext(EditorContext);
  if (editor === null) throw new Error(missingProviderMessage);
  return editor;
};

export const useEditorMount = (): EditorMountContextValue => {
  const mount = useContext(EditorMountContext);
  if (mount === null) throw new Error(missingProviderMessage);
  return mount;
};

// spec §8(EXT-009), RD-002-DELTA-01 — 별도 Context를 두지 않고
// `EditorController.getDictionary()`(construction-time readback)를 그대로
// 감싼다. `EditorProvider`의 "external"/"internal" 모드 어느 쪽이든 같은
// 방식으로 동작한다(RD-002.md "## 결정").
export const useDictionary = (): Dictionary => useEditor().getDictionary();
