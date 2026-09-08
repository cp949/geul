import { createEmptyDocument } from "@cp949/geul-model";
import {
  type CreateEditorOptions,
  EditorContent,
  EditorProvider,
  FilePanel,
  MediaResizeHandles,
  MediaToolbar,
  SlashMenu,
} from "@cp949/geul-react";
import { useState } from "react";

// showcase 전용 mock — apps/demo의 demoUploadFile과 같은 기법(파일명에
// "reject" 포함 시 실패, 그 외 성공)을 독립적으로 재구현한다. 앱 간에는
// 코드를 공유하지 않는다(ADR-0002, apps는 각자 react/model만 의존).
const SHOWCASE_UPLOAD_DELAY_MS = 300;

const showcaseUploadFile: CreateEditorOptions["uploadFile"] = (
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
    }, SHOWCASE_UPLOAD_DELAY_MS);
    signal.addEventListener("abort", onAbort);
  });
};

const MediaExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-media-block-1"),
  );

  return (
    <EditorProvider
      initialDocument={initialDocument}
      uploadFile={showcaseUploadFile}
    >
      <SlashMenu />
      <FilePanel />
      <MediaToolbar />
      <MediaResizeHandles />
      <EditorContent />
    </EditorProvider>
  );
};

export default MediaExample;
