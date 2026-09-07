import { useEffect, useRef } from "react";

import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";

export const EditorContent = () => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { setElement } = useEditorMount();
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (mount === null) return;

    editor.mount(mount);
    setElement(mount);
    return () => {
      setElement(null);
      editor.unmount();
    };
  }, [editor, setElement]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: The controller mounts its own contenteditable child into this accessible host.
    <div
      aria-label={dictionary.editor.ariaLabel}
      aria-multiline="true"
      className="geul-editor"
      ref={mountRef}
      role="textbox"
      tabIndex={-1}
    />
  );
};
