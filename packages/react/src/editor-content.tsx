import { useEffect, useRef } from "react";

import { useEditor, useEditorMount } from "./use-editor.js";

export const EditorContent = () => {
  const editor = useEditor();
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
      aria-label="Editor"
      aria-multiline="true"
      className="be-editor"
      ref={mountRef}
      role="textbox"
      tabIndex={-1}
    />
  );
};
