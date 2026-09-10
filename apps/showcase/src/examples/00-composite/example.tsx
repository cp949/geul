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
import "highlight.js/styles/github.css";
import { common, createLowlight } from "lowlight";
import { useState } from "react";

// 07-media/example.tsx와 동일 이유 — 소스 패널 자기완결성(스펙 §5).
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

// 10-syntax-highlighting-lowlight/example.tsx와 동일 이유 — 소스 패널
// 자기완결성(스펙 §5). 어댑터를 공용 모듈로 뽑지 않고 그대로 복제한다.
const lowlight = createLowlight(common);

type HastRoot = ReturnType<typeof lowlight.highlight>;
type HastNode = HastRoot["children"][number];
type Token = { from: number; to: number; className?: string };

const flattenHastToTokens = (
  nodes: readonly HastNode[],
  offset: number,
  tokens: Token[],
): number => {
  let cursor = offset;
  for (const node of nodes) {
    if (node.type === "text") {
      cursor += node.value.length;
      continue;
    }
    if (node.type === "element") {
      const from = cursor;
      cursor = flattenHastToTokens(node.children, cursor, tokens);
      const classNameProp = node.properties?.className;
      const className = Array.isArray(classNameProp)
        ? classNameProp.join(" ")
        : typeof classNameProp === "string"
          ? classNameProp
          : undefined;
      tokens.push({
        from,
        to: cursor,
        ...(className === undefined ? {} : { className }),
      });
    }
  }
  return cursor;
};

const compositeSyntaxHighlighter: CreateEditorOptions["syntaxHighlighter"] = ({
  source,
  language,
}) => {
  if (language === undefined || !lowlight.registered(language)) return [];
  const tree = lowlight.highlight(language, source);
  const tokens: Token[] = [];
  flattenHastToTokens(tree.children, 0, tokens);
  return tokens;
};

const CompositeExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-composite-block-1"),
  );

  return (
    <EditorProvider
      initialDocument={initialDocument}
      uploadFile={compositeUploadFile}
      syntaxHighlighter={compositeSyntaxHighlighter}
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
