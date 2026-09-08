import { createEmptyDocument } from "@cp949/geul-model";
import {
  type CreateEditorOptions,
  EditorContent,
  EditorProvider,
  EmojiPicker,
  FilePanel,
  FormattingToolbar,
  LinkToolbar,
  MediaResizeHandles,
  MediaToolbar,
  SlashMenu,
} from "@cp949/geul-react";
import { useState } from "react";

const COMPOSITE_UPLOAD_DELAY_MS = 300;

const compositeUploadFile: CreateEditorOptions["uploadFile"] = (
  file,
  signal,
) => {
  if (signal.aborted) return Promise.resolve({ status: "cancelled" });
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve({ status: "cancelled" });
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(
        file.name.includes("reject")
          ? {
              status: "error",
              code: "SHOWCASE_UPLOAD_REJECTED",
              message: `Showcase upload rejected: ${file.name}`,
            }
          : {
              status: "success",
              url: `https://example.com/uploads/${encodeURIComponent(file.name)}`,
              name: file.name,
            },
      );
    }, COMPOSITE_UPLOAD_DELAY_MS);
    signal.addEventListener("abort", onAbort);
  });
};

const CompositeExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-composite-block-1"),
  );

  return (
    <EditorProvider
      initialDocument={initialDocument}
      uploadFile={compositeUploadFile}
    >
      <FormattingToolbar />
      <LinkToolbar />
      <SlashMenu />
      <FilePanel />
      <MediaToolbar />
      <MediaResizeHandles />
      <EmojiPicker />
      <EditorContent />
    </EditorProvider>
  );
};

export default CompositeExample;
