import {
  exportHtml,
  exportMarkdown,
  type HtmlImportWarning,
  type ImportWarning,
  importHtml,
  importMarkdown,
  type MarkdownLoss,
} from "@cp949/geul-io";
import {
  createEmptyDocument,
  type Document,
  parseDocument,
} from "@cp949/geul-model";
import {
  type DocumentChangeEvent,
  EditorContent,
  type EditorError,
  EditorProvider,
  FormattingToolbar,
  LinkToolbar,
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

const EditorWorkspace = ({
  changedBlockIds,
  revision,
}: EditorWorkspaceProps) => {
  const editor = useEditor();
  const [source, setSource] = useState("");
  const [errors, setErrors] = useState<DemoError[]>([]);
  const [warnings, setWarnings] = useState<DemoWarning[]>([]);
  const [conversionStatus, setConversionStatus] = useState("Ready.");
  const [detachedDocument, setDetachedDocument] = useState<{
    document: Document;
    revision: number;
  } | null>(null);

  const clearFeedback = (status: string) => {
    setErrors([]);
    setWarnings([]);
    setConversionStatus(status);
  };

  const applyDocument = (document: unknown) => {
    const result = editor.replaceDocument(document);
    setDetachedDocument(null);
    if (!result.ok) {
      setErrors([result.error]);
      if (result.error.code === "EDITOR_FEATURE_UNAVAILABLE") {
        const parsed = parseDocument(document);
        if (parsed.ok) {
          setDetachedDocument({ document: parsed.value, revision });
        }
      }
    }
    return result.ok;
  };

  const documentForExport = () =>
    detachedDocument?.revision === revision
      ? detachedDocument.document
      : editor.getDocument();

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
        <EditorContent />
      </section>

      <section aria-labelledby="source-heading" className="exchange-panel">
        <div>
          <h2 id="source-heading">Source</h2>
          <textarea
            aria-label="Document source"
            onChange={(event) => {
              setSource(event.currentTarget.value);
              setDetachedDocument(null);
            }}
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
    <EditorProvider initialDocument={initialDocument} onChange={onChange}>
      <EditorWorkspace changedBlockIds={changedBlockIds} revision={revision} />
    </EditorProvider>
  );
};
