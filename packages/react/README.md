# @cp949/geul-react

`@cp949/geul-core` 위에 구현한 React 바인딩과 UI 컴포넌트다. `EditorProvider`/`EditorContent`로 에디터를 렌더링하고, `FormattingToolbar`/`LinkToolbar`/`MediaToolbar`/`FilePanel`/`SlashMenu`/`EmojiPicker` 등 보조 UI를 함께 제공한다.

## 최소 사용 예

```tsx
import { EditorContent, EditorProvider } from "@cp949/geul-react";
import "@cp949/geul-react/styles.css";
import { createEmptyDocument } from "@cp949/geul-model";

const initialDocument = createEmptyDocument(() => crypto.randomUUID());

function Editor() {
  return (
    <EditorProvider initialDocument={initialDocument}>
      <EditorContent />
    </EditorProvider>
  );
}
```

## Next.js(SSR) 통합

패키지 진입점(`@cp949/geul-react`)에는 이미 `"use client"` 지시어가 포함돼 있다 — App Router의 Server Component 트리에서 별도 wrapper 없이 바로 import할 수 있다.

**추가 client-only guard 코드가 필요 없다.** `EditorProvider`는 실제 편집기 생성(`createEditor()`, `@cp949/geul-core`)을 렌더 중이 아니라 `useEffect` 안에서만 호출한다. `useEffect`는 서버 렌더(`react-dom/server`의 `renderToString`을 포함해 Next.js가 내부에서 쓰는 모든 SSR 경로)에서 절대 실행되지 않으므로, `EditorProvider`는 서버에서 항상 `null`을 렌더한다 — editor DOM도, `createEditor()` 호출도 서버 단계에서는 아예 일어나지 않는다. 위 "최소 사용 예"를 그대로 Client Component 안에 두면 SSR에서 안전하게 빈 결과를 내고, client에서 mount된 뒤에만 실제 에디터가 나타난다.

```tsx
"use client";

import { EditorContent, EditorProvider } from "@cp949/geul-react";
import { createEmptyDocument } from "@cp949/geul-model";

const initialDocument = createEmptyDocument(() => crypto.randomUUID());

export default function Page() {
  return (
    <EditorProvider initialDocument={initialDocument}>
      <EditorContent />
    </EditorProvider>
  );
}
```

### 선택 사항 — `next/dynamic({ ssr: false })`

정확성을 위해 필요하지는 않지만(`EditorProvider`가 이미 서버에서 no-op이다), Next.js가 서버에서 이 컴포넌트 트리를 아예 평가하지 않게 해 그만큼의 서버 렌더 비용을 아끼고 싶다면 공식 client-only 패턴을 그대로 쓸 수 있다.

```tsx
"use client";

import dynamic from "next/dynamic";

const Editor = dynamic(() => import("./editor"), { ssr: false });

export default function Page() {
  return <Editor />;
}
```

`./editor.tsx`에는 위 "최소 사용 예"의 `Editor` 컴포넌트를 그대로 둔다.

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
import { createEmptyDocument } from "@cp949/geul-model";
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

const initialDocument = createEmptyDocument(() => crypto.randomUUID());

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

- `"use client"`는 다른 번들러·런타임(Vite, CRA 등)에서는 무해한 문자열 리터럴이다 — Next.js가 아닌 프로젝트에도 그대로 쓸 수 있다.
- 위 self-guard는 `EditorProvider`/`EditorContent` 경로에만 적용된다. `@cp949/geul-core`의 `createEditor()`를 직접(`EditorProvider` 없이) 호출하는 저수준 사용은 서버 환경에서도 크래시하지 않지만(`EXT-013`), 반환된 controller의 문서는 로드 시점 정규화가 실제 client mount 시점까지 지연된 상태일 수 있다.
