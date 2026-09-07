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

## 알려진 제약

- `"use client"`는 다른 번들러·런타임(Vite, CRA 등)에서는 무해한 문자열 리터럴이다 — Next.js가 아닌 프로젝트에도 그대로 쓸 수 있다.
- 위 self-guard는 `EditorProvider`/`EditorContent` 경로에만 적용된다. `@cp949/geul-core`의 `createEditor()`를 직접(`EditorProvider` 없이) 호출하는 저수준 사용은 서버 환경에서도 크래시하지 않지만(`EXT-013`), 반환된 controller의 문서는 로드 시점 정규화가 실제 client mount 시점까지 지연된 상태일 수 있다.
