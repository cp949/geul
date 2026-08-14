import type { EditorController } from "@cp949/geul-core";
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
