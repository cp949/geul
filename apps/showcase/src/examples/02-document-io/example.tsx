import { createEmptyDocument } from "@cp949/geul-model";
import {
  type DocumentChangeEvent,
  EditorContent,
  EditorProvider,
  useEditor,
} from "@cp949/geul-react";
import { useCallback, useState } from "react";

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

const DocumentIoExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-document-io-block-1"),
  );
  const [revision, setRevision] = useState(initialDocument.revision);
  const [changedBlockIds, setChangedBlockIds] = useState<readonly string[]>([]);
  const onChange = useCallback((event: DocumentChangeEvent) => {
    setRevision(event.revision);
    setChangedBlockIds(event.changedBlockIds);
  }, []);

  return (
    <EditorProvider initialDocument={initialDocument} onChange={onChange}>
      <p>
        Revision: {revision} / Changed block IDs:{" "}
        {changedBlockIds.join(", ") || "None"}
      </p>
      <DocumentPanel />
    </EditorProvider>
  );
};

export default DocumentIoExample;
