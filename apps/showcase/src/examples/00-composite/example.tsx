import { exportHtml } from "@cp949/geul-io";
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
  useEditor,
} from "@cp949/geul-react";
import "highlight.js/styles/github.css";
import { common, createLowlight } from "lowlight";
import { Highlight, themes } from "prism-react-renderer";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import "./preview.css";

// 07-media/example.tsx와 동일 이유 — 소스 패널 자기완결성(스펙 §5).
const COMPOSITE_UPLOAD_DELAY_MS = 300;

// 실존하지 않는 https://example.com/uploads/... url은 브라우저가 로드할 수
// 없어 kitchen sink에 이미지가 안 보였다(2026-09-11 사용자 보고). media
// url이 data:/blob:도 허용하도록 정책이 바뀌어서(spec §3.2 개정,
// ADR-0017) 실제 네트워크 없이도 즉시 렌더되도록 파일을 data url로
// 인코딩해 반환한다.
const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error(`파일 읽기 실패: ${file.name}`));
    reader.readAsDataURL(file);
  });

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

// exportHtml()의 라운드트립 전용 속성(data-geul-text-color 등) 중 시각
// 표현이 없는 것만 골라 미리보기에 반영한다. 인라인 mark(textColor,
// backgroundColor)는 exportHtml()이 이미 <span style="..."> 로 내보내
// CSS만으로 충분하지만, 블록 단위 속성(문단/헤딩/인용/목록의
// textColor·backgroundColor·textAlignment, 표 셀의 align)은 속성값만 남고
// style이 없다(io/src/html/export-html.ts textBlockPropsAttributes,
// cellNode) — 라이브 에디터는 이 값을 Tiptap이 별도로 렌더링하지만,
// 정적 HTML은 그 렌더러가 없다. FormattingToolbar가 바로 이 세 속성을
// 조작하는 대표 표면이라 미리보기에서 비워두면 Kitchen sink의 취지와
// 어긋난다.
const applyDataGeulStyles = (root: HTMLElement) => {
  for (const el of root.querySelectorAll<HTMLElement>(
    "[data-geul-text-color]",
  )) {
    el.style.color = el.dataset.geulTextColor ?? "";
  }
  for (const el of root.querySelectorAll<HTMLElement>(
    "[data-geul-background-color]",
  )) {
    el.style.backgroundColor = el.dataset.geulBackgroundColor ?? "";
  }
  for (const el of root.querySelectorAll<HTMLElement>(
    "[data-geul-text-alignment], [data-geul-align]",
  )) {
    el.style.textAlign =
      el.dataset.geulTextAlignment ?? el.dataset.geulAlign ?? "";
  }
};

// HTML 탭 전용 pretty-printer. 새 의존성을 추가하지 않고(그릴링 결정
// 2026-09-11 — 미리보기 CSS와 마찬가지로 로컬 전용, 범위를 좁게 유지)
// DOM API만으로 들여쓴다. 자식이 전부 inline 태그면(문단 텍스트 등) 한
// 줄로 묶어 실제 HTML 포매터에 가까운 결과를 낸다. <pre>는 공백이
// 의미를 가지므로 재포맷하지 않는다. 표시 전용이라 재파싱되지 않는다 —
// 속성값에 `"`가 섞여도 안전 문제는 없다(존재하지도 않는다, data-geul-*
// 값은 전부 UUID·hex color·URL).
const INLINE_TAGS = new Set([
  "a",
  "strong",
  "em",
  "u",
  "s",
  "code",
  "span",
  "img",
  "br",
]);

const isLeafNode = (node: Element): boolean =>
  Array.from(node.children).every(
    (child) =>
      INLINE_TAGS.has(child.tagName.toLowerCase()) && isLeafNode(child),
  );

const prettyPrintHtml = (html: string): string => {
  const container = document.createElement("div");
  container.innerHTML = html;

  const format = (node: ChildNode, depth: number): string => {
    const indent = "  ".repeat(depth);
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      return text ? `${indent}${text}\n` : "";
    }
    if (!(node instanceof Element)) return "";

    const tag = node.tagName.toLowerCase();
    if (tag === "pre" || isLeafNode(node)) {
      return `${indent}${node.outerHTML}\n`;
    }

    const attrs = Array.from(node.attributes)
      .map((attribute) => ` ${attribute.name}="${attribute.value}"`)
      .join("");
    const children = Array.from(node.childNodes)
      .map((child) => format(child, depth + 1))
      .join("");
    if (children.length === 0) return `${indent}<${tag}${attrs}></${tag}>\n`;
    return `${indent}<${tag}${attrs}>\n${children}${indent}</${tag}>\n`;
  };

  return Array.from(container.childNodes)
    .map((node) => format(node, 0))
    .join("")
    .trimEnd();
};

type ResultTab = "preview" | "html";

// 에디터 아래 고정 배치되는 [미리보기 | HTML] 결과 패널. `useEditor()` +
// `exportHtml()`(둘 다 공개 API)만으로 동작하는 진짜 소비자 코드다 —
// EditorProvider Context 밖(ExamplePage의 sourcePane)에서는 라이브 문서를
// 읽을 수 없어(그릴링 결정 2026-09-11) 셸이 아니라 이 예제 자신이
// 갖는다. `revision`은 EditorProvider의 `onChange`가 문서가 바뀔 때마다
// 올려주는 값을 그대로 받아 재계산 시점만 결정한다.
const ResultPanel = ({ revision }: { revision: number }) => {
  const editor = useEditor();
  const [activeTab, setActiveTab] = useState<ResultTab>("preview");
  const previewRef = useRef<HTMLDivElement>(null);

  const exported = useMemo(
    () =>
      // 라이브 에디터에 이미 배선한 compositeSyntaxHighlighter를 그대로
      // 재사용한다 — exportHtml()이 codeBlock을 강조 span 포함 HTML로
      // 내보내는 옵션을 지원해서(io/src/html/code-block-highlight.ts),
      // 미리보기 전용 하이라이터를 새로 로딩할 필요가 없다(2026-09-11,
      // 사용자 요청으로 "plain pre/code" 결정을 뒤집음).
      exportHtml(editor.getDocument(), {
        syntaxHighlighter: compositeSyntaxHighlighter,
      }),
    // editor 인스턴스는 EditorProvider 마운트 동안 안정적이다 — revision이
    // 바뀔 때만 재계산하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision],
  );
  const html = exported.ok ? exported.value : null;
  const pretty = useMemo(
    () => (html === null ? null : prettyPrintHtml(html)),
    [html],
  );

  useLayoutEffect(() => {
    if (previewRef.current === null) return;
    applyDataGeulStyles(previewRef.current);
  }, [html]);

  const handleCopy = () => {
    if (pretty === null) return;
    void navigator.clipboard.writeText(pretty);
  };

  return (
    <div className="composite-result">
      <div
        aria-label="결과"
        className="composite-result__tablist"
        role="tablist"
      >
        <button
          aria-selected={activeTab === "preview"}
          onClick={() => setActiveTab("preview")}
          role="tab"
          type="button"
        >
          미리보기
        </button>
        <button
          aria-selected={activeTab === "html"}
          onClick={() => setActiveTab("html")}
          role="tab"
          type="button"
        >
          HTML
        </button>
      </div>
      {!exported.ok && (
        <p className="composite-result__error" role="alert">
          HTML 변환 실패: {exported.error.message}
        </p>
      )}
      <div hidden={activeTab !== "preview"}>
        <div
          aria-label="미리보기"
          className="composite-result__preview"
          // exportHtml()은 편집기 자신의 문서를 직렬화한 값이다 — 붙여넣기
          // 등 외부 HTML은 import 시점에 이미 sanitize되므로 여기서 다시
          // 신뢰 경계를 넘지 않는다.
          dangerouslySetInnerHTML={{ __html: html ?? "" }}
          ref={previewRef}
        />
      </div>
      <div hidden={activeTab !== "html"}>
        <div aria-label="HTML" className="composite-result__html">
          <div className="composite-result__html-toolbar">
            <button
              disabled={pretty === null}
              onClick={handleCopy}
              type="button"
            >
              복사
            </button>
          </div>
          <Highlight
            code={pretty ?? ""}
            language="markup"
            theme={themes.github}
          >
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre className={className} style={style}>
                {tokens.map((line, lineIndex) => (
                  <div key={lineIndex} {...getLineProps({ line })}>
                    {line.map((token, tokenIndex) => (
                      <span key={tokenIndex} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        </div>
      </div>
    </div>
  );
};

const CompositeExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-composite-block-1"),
  );
  const [revision, setRevision] = useState(0);

  return (
    <EditorProvider
      initialDocument={initialDocument}
      onChange={(event) => setRevision(event.revision)}
      syntaxHighlighter={compositeSyntaxHighlighter}
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
      <ResultPanel revision={revision} />
    </EditorProvider>
  );
};

export default CompositeExample;
