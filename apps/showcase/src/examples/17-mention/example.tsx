import type { InlineContentItem } from "@cp949/geul-model";
import { createEmptyDocument } from "@cp949/geul-model";
import {
  EditorContent,
  EditorProvider,
  type EditorController,
  useEditor,
} from "@cp949/geul-react";
import { useCallback, useState } from "react";

import { MentionPicker } from "./mention-picker.js";

// `apps/showcase`는 `@cp949/geul-core`를 직접 의존하지 않는다(react만 통해
// 간접 사용) — `CustomInlineContentDefinition`(core 전용 타입)을 import하는
// 대신, `@cp949/geul-react`가 이미 재노출하는 `EditorController`와
// `@cp949/geul-model`의 `InlineContentItem`만으로 같은 모양을 구조적으로
// 맞춘다. `render()`는 raw HTMLElement를 직접 반환한다(CustomBlockDefinition과
// 달리 `{element}`로 감싸지 않는다 — `custom-extension-definitions.ts`의
// CustomInlineContentDefinition 계약). `packages/react/README.md`의 "사용자
// 정의 인라인 콘텐츠(customInlineContent)" 절이 이 예제를 링크한다.
type MentionInlineItem = Extract<InlineContentItem, { type: "custom" }>;

const mentionDefinition = {
  render: ({
    item,
  }: {
    item: MentionInlineItem;
    editor: EditorController;
  }): HTMLElement => {
    const element = document.createElement("span");
    const props = item.props ?? {};
    const label = typeof props.label === "string" ? props.label : "mention";
    element.textContent = `@${label}`;
    element.setAttribute("data-geul-mention", "true");
    element.style.display = "inline-flex";
    element.style.alignItems = "center";
    element.style.borderRadius = "0.25rem";
    element.style.padding = "0 0.25rem";
    element.style.background = "#e0e7ff";
    element.style.color = "#3730a3";
    element.style.fontWeight = "600";
    return element;
  },
};

// 02-document-io/example.tsx와 같은 방식의 "Export JSON"/"Import JSON"
// round-trip 검증 버튼(01-계획.md "2. 변경 대상").
const DocumentPanel = () => {
  const editor = useEditor();
  const [json, setJson] = useState("");
  const [status, setStatus] = useState("Ready.");

  const handleExport = useCallback(() => {
    setJson(JSON.stringify(editor.getDocument(), null, 2));
    setStatus("Exported.");
  }, [editor]);

  const handleImport = useCallback(() => {
    let parsedDocument: unknown;
    try {
      parsedDocument = JSON.parse(json);
    } catch {
      setStatus("Invalid JSON.");
      return;
    }
    const result = editor.replaceDocument(parsedDocument);
    setStatus(
      result.ok
        ? "Imported."
        : "message" in result.error
          ? result.error.message
          : result.error.code,
    );
  }, [editor, json]);

  return (
    <div>
      <div aria-label="Document actions" role="toolbar">
        <button onClick={handleExport} type="button">
          Export JSON
        </button>
        <button onClick={handleImport} type="button">
          Import JSON
        </button>
      </div>
      <MentionPicker />
      <EditorContent />
      <textarea
        aria-label="Document JSON"
        onChange={(event) => setJson(event.currentTarget.value)}
        value={json}
      />
      <p role="status">{status}</p>
    </div>
  );
};

const MentionExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-mention-block-1"),
  );

  return (
    <EditorProvider
      customInlineContent={{ mention: mentionDefinition }}
      initialDocument={initialDocument}
    >
      <DocumentPanel />
    </EditorProvider>
  );
};

export default MentionExample;
