import { createEmptyDocument } from "@cp949/geul-model";
import { EditorContent, EditorProvider } from "@cp949/geul-react";
import { useState } from "react";

const MinimalEditorExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-minimal-editor-block-1"),
  );

  return (
    <EditorProvider initialDocument={initialDocument}>
      <EditorContent />
    </EditorProvider>
  );
};

export default MinimalEditorExample;
