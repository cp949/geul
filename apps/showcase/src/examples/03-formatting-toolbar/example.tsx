import { createEmptyDocument } from "@cp949/geul-model";
import {
  EditorContent,
  EditorProvider,
  FormattingToolbar,
} from "@cp949/geul-react";
import { useState } from "react";

const FormattingToolbarExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-formatting-toolbar-block-1"),
  );

  return (
    <EditorProvider initialDocument={initialDocument}>
      <FormattingToolbar />
      <EditorContent />
    </EditorProvider>
  );
};

export default FormattingToolbarExample;
