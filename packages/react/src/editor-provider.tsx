import type { CreateEditorOptions, EditorController } from "@cp949/geul-core";
import { createEditor } from "@cp949/geul-core";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { EditorContext, EditorMountContext } from "./use-editor.js";

export type EditorProviderProps =
  | {
      children: ReactNode;
      editor: EditorController;
      initialDocument?: never;
      onChange?: never;
      onPasteRejected?: never;
    }
  | {
      children: ReactNode;
      editor?: never;
      initialDocument: CreateEditorOptions["initialDocument"];
      onChange?: CreateEditorOptions["onChange"];
      onPasteRejected?: CreateEditorOptions["onPasteRejected"];
    };

export const EditorProvider = (props: EditorProviderProps) => {
  const latestOnChange = useRef<CreateEditorOptions["onChange"]>(undefined);
  const latestOnPasteRejected =
    useRef<CreateEditorOptions["onPasteRejected"]>(undefined);
  if (props.editor === undefined) {
    latestOnChange.current = props.onChange;
    latestOnPasteRejected.current = props.onPasteRejected;
  }

  const [configuration] = useState(() => {
    if (props.editor !== undefined) {
      return { ownership: "external" } as const;
    }
    return {
      initialDocument: props.initialDocument,
      ownership: "internal",
    } as const;
  });
  const [internalEditor, setInternalEditor] = useState<EditorController | null>(
    null,
  );
  const [mountElement, setMountElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (configuration.ownership === "external") return;

    const controller = createEditor({
      initialDocument: configuration.initialDocument,
      onChange: (event) => latestOnChange.current?.(event),
      onPasteRejected: (reason) => latestOnPasteRejected.current?.(reason),
    });
    setInternalEditor(controller);
    return () => controller.destroy();
  }, [configuration]);

  const controller =
    configuration.ownership === "external"
      ? (props.editor ?? null)
      : internalEditor;
  if (controller === null) return null;

  return (
    <EditorContext.Provider value={controller}>
      <EditorMountContext.Provider
        value={{ element: mountElement, setElement: setMountElement }}
      >
        {props.children}
      </EditorMountContext.Provider>
    </EditorContext.Provider>
  );
};
