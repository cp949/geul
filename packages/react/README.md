# @cp949/geul-react

`@cp949/geul-core` 위에 구현한 React 바인딩과 UI 컴포넌트다. `EditorProvider`/`EditorContent`로 에디터를 렌더링하고, `FormattingToolbar`/`LinkToolbar`/`MediaToolbar`/`FilePanel`/`SlashMenu`/`EmojiPicker`/`StaticToolbar` 등 보조 UI를 함께 제공한다. `FormattingToolbar`는 텍스트 선택 시에만 뜨는 반면 `StaticToolbar`는 선택과 무관하게 항상 렌더되는 옵트인 툴바다 — 위치(예: 상단 고정)는 강제하지 않으므로 `className`으로 소비 앱이 직접 CSS(`position: sticky` 등)를 붙인다.

## 최소 사용 예

```tsx
import { EditorContent, EditorProvider } from "@cp949/geul-react";
import "@cp949/geul-react/styles.css";
import { createEmptyDocument, createRandomDocumentId } from "@cp949/geul-model";

// 인자는 블록 id를 만드는 함수다.
// createRandomDocumentId는 Chrome75 호환 UUID v4 생성기다.
const initialDocument = createEmptyDocument(createRandomDocumentId);

function Editor() {
  return (
    <EditorProvider initialDocument={initialDocument}>
      <EditorContent />
    </EditorProvider>
  );
}
```

## 기능 구성과 업로드

### 블록 타입 on/off

`createEditor()`/`EditorProvider`에 `enabledBlockTypes: { mode: "allow" | "deny", types: Block["type"][] }`를 넘기면 지정한 블록만 허용하거나 차단한다. 마운트 시점에 고정되고(런타임 토글 불가), SlashMenu·toolbar 등 UI가 비활성 블록 항목을 자동으로 숨긴다.

```tsx
<EditorProvider
  initialDocument={initialDocument}
  enabledBlockTypes={{ mode: "deny", types: ["table"] }}
>
  <EditorContent />
</EditorProvider>
```

실제 연결 예는 `apps/showcase`의 `src/examples/16-enabled-block-types`를 참고한다.

### 사용자 정의 블록(customBlocks)

`customBlocks: Record<string, CustomBlockDefinition>`를 등록하면 geul 기본 14종 밖의 블록 타입을 문서에 추가할 수 있다. `initialDocument`와 같은 마운트 시점 옵션이라 등록 후 런타임에 추가·해제할 수 없다. `CustomBlockDefinition.render({ block, editor })`는 raw `HTMLElement`만 반환한다 — geul 공개 API에는 Tiptap/ProseMirror 타입이 노출되지 않는다.

```tsx
import { EditorContent, EditorProvider, useEditor } from "@cp949/geul-react";
import type { CustomBlockDefinition } from "@cp949/geul-core";
import type { Document } from "@cp949/geul-model";

const counterWidget: CustomBlockDefinition = {
  render: ({ block }) => {
    const element = document.createElement("div");
    element.className = "counter-widget";
    const count = typeof block.props?.count === "number" ? block.props.count : 0;
    element.textContent = `count: ${count}`;
    return { element };
  },
};

// customBlocks에 등록한 타입은 initialDocument에 직접 심을 수 있다 —
// 문서 blocks 원소 타입은 Block(기본 14종) | CustomBlock 유니온이다.
const initialDocument: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [
    { id: "para-1", type: "paragraph", content: [{ text: "본문" }] },
    { id: "widget-1", type: "counter", content: "none", props: { count: 3 } },
  ],
};

// 새 인스턴스는 editor.commands.insertCustomBlock(afterBlockId, type, content, props?)로 추가한다.
function InsertCounterButton() {
  const editor = useEditor();
  return (
    <button
      onClick={() => {
        const result = editor.commands.insertCustomBlock("para-1", "counter", "none", {
          count: 0,
        });
        if (!result.ok) console.error(result.error); // 미등록 type이면 CUSTOM_BLOCK_TYPE_NOT_REGISTERED
      }}
    >
      카운터 블록 추가
    </button>
  );
}

function Editor() {
  return (
    <EditorProvider initialDocument={initialDocument} customBlocks={{ counter: counterWidget }}>
      <InsertCounterButton />
      <EditorContent />
    </EditorProvider>
  );
}
```

**알려진 제약**: `insertCustomBlock`으로 새 인스턴스를 넣을 수만 있다 — 이미 삽입된 커스텀 블록의 `props`를 바꾸는 공개 명령은 없다. `commands.updateBlock`/`insertBlocks`/`replaceBlocks`는 기본 14종 블록 타입만 대상으로 하고 커스텀 블록은 제외한다(`PartialBlock`이 `Block["type"]` 기준으로만 정의됨). 위젯을 상호작용시키려면 `render()`가 반환한 `element` 안에서 자체 DOM 이벤트로 상태를 관리해야 한다 — 문서 모델을 거쳐 왕복 저장되지 않는다. `content: "inline"`은 model 계약상 값만 존재하고 실제 편집 가능한 내부 콘텐츠는 아직 core가 연결하지 않았다 — atom이고 자식 없는 `"none"`만 실제로 동작한다.

`customStyles`(mark)도 같은 방식으로 등록할 수 있다 — `CustomStyleDefinition`(`@cp949/geul-core`)을 쓴다.

### 사용자 정의 인라인 콘텐츠(customInlineContent)

`customInlineContent: Record<string, CustomInlineContentDefinition>`를 등록하면 geul 기본 텍스트 런 옆에 커스텀 인라인 원소(mention, 인라인 배지 등)를 문서에 추가할 수 있다. `customBlocks`와 같은 마운트 시점 옵션이라 등록 후 런타임에 추가·해제할 수 없다. `CustomInlineContentDefinition.render({ item, editor })`는 raw `HTMLElement`를 직접 반환한다 — `CustomBlockDefinition`과 달리 `{ element }`로 감싸지 않는다(atom·leaf 노드라 자식 콘텐츠 개념이 없다).

```tsx
import { EditorContent, EditorProvider, useEditor } from "@cp949/geul-react";
import type { CustomInlineContentDefinition } from "@cp949/geul-core";

const mentionDefinition: CustomInlineContentDefinition = {
  render: ({ item }) => {
    const element = document.createElement("span");
    const label = typeof item.props?.label === "string" ? item.props.label : "";
    element.textContent = `@${label}`;
    element.className = "mention-chip";
    return element;
  },
};

// insertCustomBlock과 달리 afterBlockId를 받지 않는다 — 현재 selection
// (caret)에 삽입한다(inline 원소는 model에 id가 없어 block처럼 위치를
// 식별할 identity가 없다).
function InsertMentionButton() {
  const editor = useEditor();
  return (
    <button
      onClick={() => {
        const result = editor.commands.insertCustomInlineContent("mention", {
          targetType: "user",
          targetId: "user-1",
          label: "Ada Lovelace",
        });
        if (!result.ok) console.error(result.error); // 미등록 type이면 CUSTOM_INLINE_CONTENT_TYPE_NOT_REGISTERED
      }}
    >
      멘션 삽입
    </button>
  );
}

function Editor() {
  return (
    <EditorProvider
      initialDocument={initialDocument}
      customInlineContent={{ mention: mentionDefinition }}
    >
      <InsertMentionButton />
      <EditorContent />
    </EditorProvider>
  );
}
```

**알려진 제약**: `insertCustomInlineContent`는 caret 앞 텍스트를 지우고 그 자리를 대체하는 offset 기반 API가 아니다 — 현재 selection에 원소를 끼워 넣기만 한다. `@query`처럼 텍스트 트리거로 popup을 여는 UI(mention 등)를 만들려면 소비자가 직접 트리거 감지·팝업·후보 필터링·키보드 네비게이션을 구현해야 한다 — 캐럿-폴링·클램프 위치·바깥클릭/Escape dismiss까지 포함한 실행 가능한 전체 예제는 `apps/showcase`의 `src/examples/17-mention`을 참고한다(`useEditorElement`/`useFocusEditor`/`useClampedMenuPosition`/`useDismissOnOutsideOrEscape`를 그 예제가 그대로 재사용한다). `customInlineContent`의 `toHtml`은 저장만 될 뿐 `io`(HTML/GFM export)에는 아직 연결돼 있지 않다 — 등록해도 HTML/GFM 내보내기에서는 그 원소가 사라진다(기존 갭, 이 문서가 메우지 않는다).

### 이미지 업로드

`EditorProvider`의 `uploadFile: (file, signal) => Promise<UploadResult>` 콜백이 이미지·비디오·오디오·파일 블록의 업로드를 전부 처리한다 — 성공 시 `{ status: "success", url }`, 실패 시 에러 코드, 취소 시 `{ status: "cancelled" }`를 돌려준다. 실제 연결 예는 `apps/showcase`의 `src/examples/07-media`를 참고한다.

```tsx
<EditorProvider
  initialDocument={initialDocument}
  uploadFile={async (file, signal) => {
    const res = await fetch("/api/upload", { method: "POST", body: file, signal });
    if (!res.ok) return { status: "error", code: String(res.status), message: res.statusText };
    const { url } = await res.json();
    return { status: "success", url };
  }}
>
  <EditorContent />
</EditorProvider>
```

### 파일 업로드

이미지와 동일한 `uploadFile` 콜백을 쓴다 — 별도 콜백은 없다. `FilePanel` UI 자체는 `apps/showcase`의 `src/examples/06-file-panel`, 업로드까지 연결된 예는 `07-media`에 있다.

```tsx
<EditorProvider initialDocument={initialDocument} uploadFile={uploadFile}>
  <EditorContent />
  <FilePanel />
</EditorProvider>
```

## 코드 구문 강조 연결

geul은 highlight.js·Prism·Shiki 같은 구문 강조 라이브러리를 소유하지 않는다. `packages/core`가 중립적인 공개 seam 타입 `SyntaxHighlighter`만 정의하고, ProseMirror 연결(decoration 생성·캐시·비동기 재계산)은 내부적으로 [`prosemirror-highlight`](https://www.npmjs.com/package/prosemirror-highlight)가 처리한다. `EditorProvider`에 `syntaxHighlighter` 옵션을 연결하지 않으면 모든 코드 블록은 조용히 plain text로 렌더된다 — 에러도 경고도 없다.

```ts
type SyntaxHighlightToken = {
  /** source 문자열 안 시작 오프셋(0-indexed, code unit 기준). */
  from: number;
  /** source 문자열 안 끝 오프셋(exclusive). */
  to: number;
  /** 적용할 CSS class. 색상 자체는 geul이 소유하지 않는다 — 이 class를 정의하는 스타일시트는 소비자(또는 소비자가 고른 하이라이터의 테마)가 공급한다. */
  className?: string;
};

type SyntaxHighlighter = (input: {
  source: string;
  language: string | undefined;
}) => readonly SyntaxHighlightToken[] | Promise<readonly SyntaxHighlightToken[]>;
```

`syntaxHighlighter`는 `initialDocument`와 같은 마운트 시점 옵션이다 — 런타임에 껐다 켰다 할 수 없다. 아래는 [`lowlight`](https://www.npmjs.com/package/lowlight)(highlight.js 어댑터)로 만든 최소 실행 가능 예제다 — lowlight는 hast(hypertext AST) 트리를 돌려줄 뿐 `SyntaxHighlighter` 시그니처를 모르므로, 트리를 순회해 source 오프셋을 직접 계산하는 얇은 어댑터가 필요하다.

```tsx
import { EditorContent, EditorProvider } from "@cp949/geul-react";
import { createEmptyDocument, createRandomDocumentId } from "@cp949/geul-model";
import "highlight.js/styles/github.css";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

type HastNode = ReturnType<typeof lowlight.highlight>["children"][number];
type Token = { from: number; to: number; className?: string };

// hast 트리를 source 오프셋 기준 token 목록으로 평탄화한다.
function flattenHastToTokens(
  nodes: readonly HastNode[],
  offset: number,
  tokens: Token[],
): number {
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
      tokens.push({ from, to: cursor, ...(className && { className }) });
    }
  }
  return cursor;
}

// 미지원/빈 language는 geul이 관여하지 않는다 — 빈 배열을 돌려주면
// 그 블록은 plain text로 남는다.
function lowlightSyntaxHighlighter({
  source,
  language,
}: {
  source: string;
  language: string | undefined;
}) {
  if (language === undefined || !lowlight.registered(language)) return [];
  const tree = lowlight.highlight(language, source);
  const tokens: Token[] = [];
  flattenHastToTokens(tree.children, 0, tokens);
  return tokens;
}

// 인자는 블록 id를 만드는 함수다.
// createRandomDocumentId는 Chrome75 호환 UUID v4 생성기다.
const initialDocument = createEmptyDocument(createRandomDocumentId);

function Editor() {
  return (
    <EditorProvider
      initialDocument={initialDocument}
      syntaxHighlighter={lowlightSyntaxHighlighter}
    >
      <EditorContent />
    </EditorProvider>
  );
}
```

`EditorProvider`는 언어 선택 콤보박스의 후보 목록을 바꾸는 `codeBlockLanguages` 옵션도 받는다(주지 않으면 javascript·typescript·html·css·json·bash·python·java·kotlin·sql·markdown 11개 기본값). 이 옵션은 `initialDocument`와 달리 매 렌더 반영되는 reactive 옵션이고, 콤보박스가 제안하는 후보만 바꿀 뿐 자유 입력 자체를 막지는 않는다.

```tsx
<EditorProvider
  initialDocument={initialDocument}
  syntaxHighlighter={lowlightSyntaxHighlighter}
  codeBlockLanguages={[
    { id: "javascript", label: "JavaScript", aliases: ["js"] },
    { id: "python", label: "Python", aliases: ["py"] },
  ]}
>
  <EditorContent />
</EditorProvider>
```

highlight.js/lowlight 외 나머지 4개 라이브러리(Prism/refractor, Shiki, CodeMirror/lezer, sugar-high)로 만든 동작 예제는 `apps/showcase`의 `src/examples/10-syntax-highlighting-lowlight`~`14-syntax-highlighting-sugar-high` 5개 폴더가 각각 자기완결적으로 담고 있다 — 라이브러리마다 hast 트리(lowlight·refractor), 콜백 기반 flat 구간(lezer), 오프셋 없는 줄→토큰 트리(sugar-high), 이미 오프셋을 가진 토큰(Shiki)처럼 출력 모양이 달라 어댑터 구현이 서로 다르다.

## 알려진 제약

- `EditorProvider`/`EditorContent`는 서버 렌더 환경에서 `null`을 렌더하고, 실제 편집기 생성(`createEditor()`, `@cp949/geul-core`)은 `useEffect` 안에서만 호출한다. `createEditor()`를 이 경로 없이 직접 호출하는 저수준 사용은 서버 환경에서도 크래시하지 않지만(`EXT-013`), 반환된 controller의 문서는 로드 시점 정규화가 실제 client mount 시점까지 지연된 상태일 수 있다.
- `StaticToolbar`는 아직 안정성이 부족하다. 보완 예정이다.
