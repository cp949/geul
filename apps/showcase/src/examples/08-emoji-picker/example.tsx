import { createEmptyDocument } from "@cp949/geul-model";
import {
  EditorContent,
  EditorProvider,
  EmojiPicker,
} from "@cp949/geul-react";
import { useState } from "react";

const EmojiPickerExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-emoji-picker-block-1"),
  );

  return (
    <EditorProvider initialDocument={initialDocument}>
      <EmojiPicker />
      <EditorContent />
    </EditorProvider>
  );
};

export default EmojiPickerExample;
