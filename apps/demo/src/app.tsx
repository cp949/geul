import {
  exportHtml,
  exportMarkdown,
  type HtmlImportWarning,
  type ImportWarning,
  importHtml,
  importMarkdown,
  type MarkdownLoss,
} from "@cp949/geul-io";
import { createEmptyDocument } from "@cp949/geul-model";
import {
  type CreateEditorOptions,
  type DocumentChangeEvent,
  EditorContent,
  type EditorError,
  EditorProvider,
  FilePanel,
  FormattingToolbar,
  LinkToolbar,
  MediaToolbar,
  SlashMenu,
  useEditor,
} from "@cp949/geul-react";
import { useCallback, useState } from "react";

type JsonSyntaxError = {
  code: "JSON_SYNTAX_ERROR";
  message: string;
};

type DemoError = EditorError | JsonSyntaxError | Record<string, unknown>;
type DemoWarning = HtmlImportWarning | ImportWarning | MarkdownLoss;

type EditorWorkspaceProps = {
  changedBlockIds: readonly string[];
  revision: number;
};

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

// e2e(RD-003 DELTA-04)가 업로드 성공/실패/취소 3분기와 경합 가드를
// 결정적으로 재현하기 위한 데모 전용 mock — 실제 서버 업로드가 없어
// 파일명으로 분기한다("reject" 포함 시 실패, 그 외 성공). 지연은 e2e가
// loading 상태를 관찰하고 취소·undo 같은 경합 조작을 끼워 넣을 시간을
// 준다. url은 isSupportedLinkHref(https만 허용, blob: 등은 거부)를
// 통과해야 하므로 https 스킴을 쓴다.
const DEMO_UPLOAD_DELAY_MS = 300;

const demoUploadFile: CreateEditorOptions["uploadFile"] = (file, signal) => {
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
              code: "DEMO_UPLOAD_REJECTED",
              message: `Demo upload rejected: ${file.name}`,
            }
          : {
              status: "success",
              url: `https://example.com/uploads/${encodeURIComponent(file.name)}`,
              name: file.name,
            },
      );
    }, DEMO_UPLOAD_DELAY_MS);
    signal.addEventListener("abort", onAbort);
  });
};

const EditorWorkspace = ({
  changedBlockIds,
  revision,
}: EditorWorkspaceProps) => {
  const editor = useEditor();
  const [source, setSource] = useState("");
  const [errors, setErrors] = useState<DemoError[]>([]);
  const [warnings, setWarnings] = useState<DemoWarning[]>([]);
  const [conversionStatus, setConversionStatus] = useState("Ready.");

  const clearFeedback = (status: string) => {
    setErrors([]);
    setWarnings([]);
    setConversionStatus(status);
  };

  const applyDocument = (document: unknown) => {
    const result = editor.replaceDocument(document);
    if (!result.ok) setErrors([result.error]);
    return result.ok;
  };

  const documentForExport = () => editor.getDocument();

  const saveJson = () => {
    setSource(JSON.stringify(documentForExport(), null, 2));
    clearFeedback("JSON export succeeded.");
  };

  const loadJson = () => {
    let document: unknown;
    try {
      document = JSON.parse(source);
    } catch (error) {
      setErrors([
        {
          code: "JSON_SYNTAX_ERROR",
          message: errorMessage(error, "Invalid JSON source."),
        },
      ]);
      setWarnings([]);
      setConversionStatus("JSON parsing failed.");
      return;
    }

    setWarnings([]);
    setConversionStatus("JSON parsing succeeded.");
    if (applyDocument(document)) setErrors([]);
  };

  const saveHtml = () => {
    const result = exportHtml(documentForExport());
    if (!result.ok) {
      setErrors([result.error]);
      setWarnings([]);
      setConversionStatus("HTML export failed.");
      return;
    }

    setSource(result.value);
    clearFeedback("HTML export succeeded.");
  };

  const loadHtml = () => {
    const result = importHtml(source);
    if (!result.ok) {
      setErrors([result.error]);
      setWarnings([]);
      setConversionStatus("HTML conversion failed.");
      return;
    }

    setWarnings(result.value.warnings);
    setConversionStatus("HTML conversion succeeded.");
    if (applyDocument(result.value.document)) setErrors([]);
  };

  const saveMarkdown = (mode: "strict" | "lossy") => {
    if (mode === "strict") {
      const result = exportMarkdown(documentForExport(), { mode });
      if (!result.ok) {
        setErrors([result.error]);
        setWarnings([]);
        setConversionStatus("Strict GFM export failed.");
        return;
      }

      setSource(result.value);
      clearFeedback("Strict GFM export succeeded.");
      return;
    }

    const result = exportMarkdown(documentForExport(), { mode });
    if (!result.ok) {
      setErrors([result.error]);
      setWarnings([]);
      setConversionStatus("Lossy GFM export failed.");
      return;
    }

    setSource(result.value.markdown);
    setErrors([]);
    setWarnings(result.value.warnings);
    setConversionStatus("Lossy GFM export succeeded.");
  };

  const loadMarkdown = () => {
    const result = importMarkdown(source);
    if (!result.ok) {
      setErrors([result.error]);
      setWarnings([]);
      setConversionStatus("GFM conversion failed.");
      return;
    }

    setWarnings(result.value.warnings);
    setConversionStatus("GFM conversion succeeded.");
    if (applyDocument(result.value.document)) setErrors([]);
  };

  return (
    <main className="demo-shell">
      <header className="demo-header">
        <div>
          <p className="eyebrow">Independent editor foundation</p>
          <h1>Geul R0</h1>
          <p>
            Public package entrypoints only, with explicit document exchange.
          </p>
        </div>
        <div aria-label="Document actions" className="toolbar" role="toolbar">
          <button onClick={saveJson} type="button">
            Save JSON
          </button>
          <button onClick={loadJson} type="button">
            Load JSON
          </button>
          <button onClick={saveHtml} type="button">
            Export HTML
          </button>
          <button onClick={loadHtml} type="button">
            Import HTML
          </button>
          <button onClick={() => saveMarkdown("strict")} type="button">
            Export GFM strict
          </button>
          <button onClick={() => saveMarkdown("lossy")} type="button">
            Export GFM lossy
          </button>
          <button onClick={loadMarkdown} type="button">
            Import GFM
          </button>
        </div>
      </header>

      <section aria-labelledby="editor-heading" className="editor-panel">
        <div className="panel-heading">
          <h2 id="editor-heading">Editor</h2>
          <dl className="revision-summary">
            <div>
              <dt>Revision</dt>
              <dd>{revision}</dd>
            </div>
            <div>
              <dt>Changed block IDs</dt>
              <dd>{changedBlockIds.join(", ") || "None"}</dd>
            </div>
          </dl>
        </div>
        <FormattingToolbar />
        <LinkToolbar />
        <SlashMenu />
        <FilePanel />
        <MediaToolbar />
        <EditorContent />
      </section>

      <section aria-labelledby="source-heading" className="exchange-panel">
        <div>
          <h2 id="source-heading">Source</h2>
          <textarea
            aria-label="Document source"
            onChange={(event) => setSource(event.currentTarget.value)}
            placeholder="Paste JSON, HTML, or GFM here."
            spellCheck={false}
            value={source}
          />
        </div>
        <aside aria-label="Conversion feedback" className="feedback-panel">
          <p aria-live="polite" className="conversion-status">
            {conversionStatus}
          </p>
          <h3>Errors</h3>
          <pre>{JSON.stringify(errors, null, 2)}</pre>
          <h3>Warnings</h3>
          <pre>{JSON.stringify(warnings, null, 2)}</pre>
        </aside>
      </section>
    </main>
  );
};

export const App = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "demo-block-1"),
  );
  const [revision, setRevision] = useState(initialDocument.revision);
  const [changedBlockIds, setChangedBlockIds] = useState<readonly string[]>([]);
  const onChange = useCallback((event: DocumentChangeEvent) => {
    setRevision(event.revision);
    setChangedBlockIds(event.changedBlockIds);
  }, []);

  return (
    <EditorProvider
      initialDocument={initialDocument}
      onChange={onChange}
      uploadFile={demoUploadFile}
    >
      <EditorWorkspace changedBlockIds={changedBlockIds} revision={revision} />
    </EditorProvider>
  );
};
