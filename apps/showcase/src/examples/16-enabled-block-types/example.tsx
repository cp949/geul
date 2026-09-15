import { createEmptyDocument } from "@cp949/geul-model";
import { EditorContent, EditorProvider, SlashMenu } from "@cp949/geul-react";
import { useState } from "react";

const EnabledBlockTypesExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-enabled-block-types-block-1"),
  );

  return (
    <EditorProvider
      enabledBlockTypes={{ mode: "deny", types: ["table"] }}
      initialDocument={initialDocument}
    >
      <SlashMenu />
      <EditorContent />
    </EditorProvider>
  );
};

export default EnabledBlockTypesExample;
