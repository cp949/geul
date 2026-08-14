import type { EditorController } from "@cp949/geul-core";
import { createContext, useContext } from "react";

const missingProviderMessage =
  "Editor components must be used within an EditorProvider.";

export const EditorContext = createContext<EditorController | null>(null);

export const useEditor = (): EditorController => {
  const editor = useContext(EditorContext);
  if (editor === null) throw new Error(missingProviderMessage);
  return editor;
};
