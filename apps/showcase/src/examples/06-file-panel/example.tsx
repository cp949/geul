import { createEmptyDocument } from "@cp949/geul-model";
import {
  EditorContent,
  EditorProvider,
  FilePanel,
  SlashMenu,
} from "@cp949/geul-react";
import { useState } from "react";

const FilePanelExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-file-panel-block-1"),
  );

  return (
    <EditorProvider initialDocument={initialDocument}>
      <SlashMenu />
      <FilePanel />
      <EditorContent />
    </EditorProvider>
  );
};

export default FilePanelExample;
