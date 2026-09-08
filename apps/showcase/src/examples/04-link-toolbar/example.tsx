import { createEmptyDocument } from "@cp949/geul-model";
import {
  EditorContent,
  EditorProvider,
  LinkToolbar,
  useEditor,
} from "@cp949/geul-react";
import { useCallback, useState } from "react";

const LinkToolbarPanel = () => {
  const editor = useEditor();
  const [status, setStatus] = useState("");

  const addLink = useCallback(() => {
    const result = editor.commands.setLink("https://github.com/cp949/geul");
    setStatus(
      result.ok
        ? "링크를 추가했다."
        : "message" in result.error
          ? result.error.message
          : result.error.code,
    );
  }, [editor]);

  return (
    <div>
      <div role="toolbar">
        <button onClick={addLink} type="button">
          선택한 텍스트에 링크 추가
        </button>
      </div>
      <LinkToolbar />
      <EditorContent />
      <p role="status">{status}</p>
    </div>
  );
};

const LinkToolbarExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-link-toolbar-block-1"),
  );

  return (
    <EditorProvider initialDocument={initialDocument}>
      <LinkToolbarPanel />
    </EditorProvider>
  );
};

export default LinkToolbarExample;
