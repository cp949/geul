import { useEffect, useRef } from "react";

import { useEditor } from "./use-editor.js";

export const EditorContent = () => {
  const editor = useEditor();
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (mount === null) return;

    editor.mount(mount);
    return () => editor.unmount();
  }, [editor]);

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
