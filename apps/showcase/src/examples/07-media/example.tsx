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
// "reject" 포함 시 실패, 그 외 성공)을 독립적으로 재구현한다. 소스
// 패널이 이 파일을 ?raw로 그대로 보여주므로(스펙 §5) 외부 헬퍼를 import
// 하면 mock 로직 자체가 소스 패널에서 안 보인다 — 자기완결적이어야 한다.
const SHOWCASE_UPLOAD_DELAY_MS = 300;

// 실존하지 않는 https://example.com/uploads/... url은 브라우저가 로드할 수
// 없어 이미지가 안 보였다(2026-09-11 사용자 보고, 00-composite/example.tsx도
// 동일 원인). media url이 data:/blob:도 허용하도록 정책이 바뀌어서
// (spec §3.2 개정, ADR-0017) 실제 네트워크 없이도 즉시 렌더되도록 파일을
// data url로 인코딩해 반환한다.
const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error(`파일 읽기 실패: ${file.name}`));
    reader.readAsDataURL(file);
  });

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
      if (file.name.includes("reject")) {
        resolve({
          status: "error",
          code: "SHOWCASE_UPLOAD_REJECTED",
          message: `Showcase upload rejected: ${file.name}`,
        });
        return;
      }
      readFileAsDataUrl(file).then(
        (url) => resolve({ status: "success", url, name: file.name }),
        (error: unknown) =>
          resolve({
            status: "error",
            code: "SHOWCASE_UPLOAD_READ_FAILED",
            message: `Showcase upload failed to read file: ${file.name} (${String(error)})`,
          }),
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
