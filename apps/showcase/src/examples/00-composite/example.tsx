import { exportHtml } from "@cp949/geul-io";
import { createEmptyDocument } from "@cp949/geul-model";
import type { Document } from "@cp949/geul-model";
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

import "@cp949/geul-io/preview.css";
import "./composite-result.css";

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
// CSS만으로 충분하고, Issue #179부터는 문단/헤딩/인용/목록(TextBlockProps,
// p/h1~h6/blockquote/li/toggle summary)의 블록 레벨 textColor·
// backgroundColor·textAlignment도 exportHtml()이 같은 값을 style로 함께
// 내보내(io/src/html/export-html.ts textBlockPropsAttributes) 마찬가지로
// CSS만으로 충분해졌다 — 이 다섯 태그는 TEXT_BLOCK_PROPS_OWN_TAGS로 각
// 루프에서 제외해 이미 붙은 style을 중복 대입하지 않는다.
// 남은 세 표면은 exportHtml()이 아직 style을 내지 않는다: 표 셀(`td`/`th`)의
// data-geul-text-color/data-geul-background-color/data-geul-align(cellNode,
// 이번 변경이 손대지 않는 별도 계약 — TextBlockProps가 아니다), 미디어
// (image/video)의 data-geul-text-alignment(mediaDataAttributes, Issue
// #178의 media 정렬 처리와 동일 표면), data-geul-preview-width(리사이즈
// 폭, 같은 mediaDataAttributes)다. 앞 둘은 그대로 남긴다. previewWidth는
// textAlignment와 달리 preview.css의 CSS 속성 선택자로 다룰 수 없다 —
// left/right 같은 유한 enum이 아니라 임의 px 값이라 아래에서 style.width로
// 직접 옮긴다(미등록 버그 — 편집기에서 리사이즈해도 미리보기에 반영되지
// 않았다).
const TEXT_BLOCK_PROPS_OWN_TAGS =
  ":not(p):not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(blockquote):not(li):not(summary)";

const applyDataGeulStyles = (root: HTMLElement) => {
  for (const el of root.querySelectorAll<HTMLElement>(
    `[data-geul-text-color]${TEXT_BLOCK_PROPS_OWN_TAGS}`,
  )) {
    el.style.color = el.dataset.geulTextColor ?? "";
  }
  for (const el of root.querySelectorAll<HTMLElement>(
    `[data-geul-background-color]${TEXT_BLOCK_PROPS_OWN_TAGS}`,
  )) {
    el.style.backgroundColor = el.dataset.geulBackgroundColor ?? "";
  }
  for (const el of root.querySelectorAll<HTMLElement>(
    `[data-geul-text-alignment]${TEXT_BLOCK_PROPS_OWN_TAGS}, [data-geul-align]`,
  )) {
    el.style.textAlign =
      el.dataset.geulTextAlignment ?? el.dataset.geulAlign ?? "";
  }
  // caption 있는 이미지/비디오는 data-geul-preview-width가 <img>/<video>가
  // 아니라 그걸 감싼 <figure>에 실린다(export-html.ts mediaBlockNode) —
  // figure 자신에 width를 주면 시각적으로 아무 효과가 없으므로 자식
  // img/video를 찾아 적용한다.
  for (const el of root.querySelectorAll<HTMLElement>(
    "[data-geul-preview-width]",
  )) {
    const width = el.dataset.geulPreviewWidth;
    const target = el.matches("img, video")
      ? el
      : el.querySelector<HTMLElement>("img, video");
    if (target !== null && width !== undefined) {
      target.style.width = `${width}px`;
    }
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

// "샘플 불러오기" 전용 media url. image/file은 data: url로 인코딩해 네트워크
// 없이도 즉시 렌더되게 한다(25-31행 compositeUploadFile 주석과 동일 이유 —
// 실존하지 않는 url은 kitchen sink에서 안 보인다). video/audio는 바이트를
// 직접 손으로 짜 넣을 수 없어 대신 실제로 열리는 공개 샘플 url을 쓴다 —
// 흔히 예시로 쓰이는 storage.googleapis.com/gtv-videos-bucket 경로는 지금
// 403을 반환해(2026-09-15 확인) 대신 test-videos.co.uk(Big Buck Bunny
// 샘플)를, audio는 SoundHelix를 쓴다. 둘 다 data:/blob:와 마찬가지로
// isSupportedMediaUrl(https:)이 허용한다(model/src/link-policy.ts).
const SAMPLE_IMAGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240">' +
  '<rect width="480" height="240" fill="#eef2ff"/>' +
  '<rect x="1" y="1" width="478" height="238" fill="none" stroke="#4f46e5" stroke-width="2"/>' +
  '<text x="240" y="128" font-family="sans-serif" font-size="28" fill="#4f46e5" text-anchor="middle">이미지 블록 샘플</text>' +
  "</svg>";
const SAMPLE_IMAGE_URL = `data:image/svg+xml;utf8,${encodeURIComponent(SAMPLE_IMAGE_SVG)}`;

const SAMPLE_FILE_TEXT =
  "이것은 file 블록 샘플이 가리키는 텍스트 파일이다.\ngeul 예제 문서에서 생성했다.";
const SAMPLE_FILE_URL = `data:text/plain;charset=utf-8,${encodeURIComponent(SAMPLE_FILE_TEXT)}`;

const SAMPLE_VIDEO_URL =
  "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";
const SAMPLE_AUDIO_URL =
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

// "샘플 불러오기" 버튼이 로드하는 kitchen sink 문서. geul이 지원하는 15종
// 블록(model/src/types.ts Block 유니온)을 한 번씩 담아 편집·HTML 출력
// 테스트를 바로 해볼 수 있게 한다(그릴링 결정 2026-09-15). id는
// 10-syntax-highlighting-lowlight/example.tsx와 동일하게 고정 문자열을
// 직접 부여한다 — 버튼을 다시 눌러도 항상 같은 문서로 리셋된다.
const SAMPLE_DOCUMENT: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "showcase-composite-sample-block-1",
      type: "heading",
      level: 1,
      content: [{ text: "샘플 문서 — geul 블록 둘러보기" }],
    },
    {
      id: "showcase-composite-sample-block-2",
      type: "paragraph",
      content: [
        {
          text: "아래 문서는 geul이 지원하는 15종 블록을 한 번씩 담았다. 자유롭게 편집하며 HTML 출력을 확인해보자.",
        },
      ],
    },
    {
      id: "showcase-composite-sample-block-3",
      type: "heading",
      level: 2,
      content: [{ text: "텍스트 블록" }],
    },
    {
      id: "showcase-composite-sample-block-4",
      type: "quote",
      content: [{ text: "인용 블록은 이렇게 표시된다." }],
    },
    {
      id: "showcase-composite-sample-block-5",
      type: "heading",
      level: 2,
      content: [{ text: "목록" }],
    },
    {
      id: "showcase-composite-sample-block-6",
      type: "bulletListItem",
      content: [{ text: "글머리 목록 항목" }],
    },
    {
      id: "showcase-composite-sample-block-7",
      type: "numberedListItem",
      startNumber: 1,
      content: [{ text: "번호 매기기 항목" }],
    },
    {
      id: "showcase-composite-sample-block-8",
      type: "checkListItem",
      checked: false,
      content: [{ text: "체크되지 않은 항목" }],
    },
    {
      id: "showcase-composite-sample-block-9",
      type: "checkListItem",
      checked: true,
      content: [{ text: "체크된 항목" }],
    },
    {
      id: "showcase-composite-sample-block-10",
      type: "toggleListItem",
      collapsed: false,
      content: [{ text: "펼쳐서 보는 토글 항목" }],
      children: [
        {
          id: "showcase-composite-sample-block-11",
          type: "paragraph",
          content: [{ text: "토글 안에 중첩된 문단이다." }],
        },
      ],
    },
    {
      id: "showcase-composite-sample-block-12",
      type: "heading",
      level: 2,
      content: [{ text: "코드" }],
    },
    {
      id: "showcase-composite-sample-block-13",
      type: "codeBlock",
      language: "typescript",
      caption: "타입스크립트 예시",
      content: [{ text: "const greet = (name: string) => `Hello, ${name}!`;" }],
    },
    {
      id: "showcase-composite-sample-block-14",
      type: "heading",
      level: 2,
      content: [{ text: "표" }],
    },
    {
      id: "showcase-composite-sample-block-15",
      type: "table",
      columns: [
        { id: "showcase-composite-sample-col-1", width: 160 },
        { id: "showcase-composite-sample-col-2", width: 160 },
        { id: "showcase-composite-sample-col-3", width: 240 },
      ],
      headerRows: 1,
      headerColumns: 0,
      rows: [
        {
          id: "showcase-composite-sample-row-1",
          cells: [
            {
              id: "showcase-composite-sample-cell-1-1",
              columnId: "showcase-composite-sample-col-1",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "블록" }],
            },
            {
              id: "showcase-composite-sample-cell-1-2",
              columnId: "showcase-composite-sample-col-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "타입" }],
            },
            {
              id: "showcase-composite-sample-cell-1-3",
              columnId: "showcase-composite-sample-col-3",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "설명" }],
            },
          ],
        },
        {
          id: "showcase-composite-sample-row-2",
          cells: [
            {
              id: "showcase-composite-sample-cell-2-1",
              columnId: "showcase-composite-sample-col-1",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "paragraph" }],
            },
            {
              id: "showcase-composite-sample-cell-2-2",
              columnId: "showcase-composite-sample-col-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "텍스트" }],
            },
            {
              id: "showcase-composite-sample-cell-2-3",
              columnId: "showcase-composite-sample-col-3",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "일반 문단" }],
            },
          ],
        },
        {
          id: "showcase-composite-sample-row-3",
          cells: [
            {
              id: "showcase-composite-sample-cell-3-1",
              columnId: "showcase-composite-sample-col-1",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "table" }],
            },
            {
              id: "showcase-composite-sample-cell-3-2",
              columnId: "showcase-composite-sample-col-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "구조" }],
            },
            {
              id: "showcase-composite-sample-cell-3-3",
              columnId: "showcase-composite-sample-col-3",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "지금 보고 있는 이 표" }],
            },
          ],
        },
      ],
    },
    {
      id: "showcase-composite-sample-block-16",
      type: "heading",
      level: 2,
      content: [{ text: "구분선" }],
    },
    { id: "showcase-composite-sample-block-17", type: "divider" },
    {
      id: "showcase-composite-sample-block-18",
      type: "heading",
      level: 2,
      content: [{ text: "미디어" }],
    },
    {
      id: "showcase-composite-sample-block-19",
      type: "image",
      url: SAMPLE_IMAGE_URL,
      caption: "이미지 블록 샘플",
      showPreview: true,
    },
    {
      id: "showcase-composite-sample-block-20",
      type: "video",
      url: SAMPLE_VIDEO_URL,
      caption: "비디오 블록 샘플",
    },
    {
      id: "showcase-composite-sample-block-21",
      type: "audio",
      url: SAMPLE_AUDIO_URL,
      caption: "오디오 블록 샘플",
    },
    {
      id: "showcase-composite-sample-block-22",
      type: "file",
      url: SAMPLE_FILE_URL,
      name: "샘플.txt",
      caption: "파일 블록 샘플",
    },
    {
      id: "showcase-composite-sample-block-23",
      type: "heading",
      level: 2,
      content: [{ text: "콜아웃" }],
    },
    {
      id: "showcase-composite-sample-block-24",
      type: "callout",
      icon: "ℹ️",
      backgroundColor: "#E8F0FE",
      content: [{ text: "콜아웃 블록은 아이콘과 배경색으로 강조된다." }],
    },
  ],
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
  const [sampleLoadError, setSampleLoadError] = useState<string | null>(null);
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

  // SAMPLE_DOCUMENT는 이 파일 안에서 고정 구성된 값이라 항상 유효하지만,
  // replaceDocument()는 Result<T, E>를 돌려주는 공개 계약이라(AGENTS.md
  // "구현 규칙") 02-document-io/example.tsx의 handleImport와 동일하게
  // 실패 분기를 무시하지 않는다.
  const handleLoadSample = () => {
    const result = editor.replaceDocument(SAMPLE_DOCUMENT);
    setSampleLoadError(
      result.ok
        ? null
        : "message" in result.error
          ? result.error.message
          : result.error.code,
    );
  };

  return (
    <div className="composite-result">
      <div className="composite-result__toolbar">
        <button onClick={handleLoadSample} type="button">
          샘플 불러오기
        </button>
        {sampleLoadError !== null && (
          <p className="composite-result__error" role="alert">
            샘플 로드 실패: {sampleLoadError}
          </p>
        )}
      </div>
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
          className="geul-preview"
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
