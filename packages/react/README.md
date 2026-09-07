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

다만 `"use client"`는 "이 모듈이 클라이언트에서 실행돼야 한다"만 표시할 뿐, 서버 렌더 단계에서 컴포넌트가 아예 평가되지 않음을 보장하지 않는다. `EditorProvider`는 마운트 시 `createEditor()`(`@cp949/geul-core`)를 호출하는데, 서버 환경(Node.js, `document` 전역 없음)에서도 크래시하지 않도록 방어돼 있지만(`EXT-013`), 로드 시점 문서 정규화(trailing paragraph 보정 등)는 실제 client mount 시점까지 지연된다. 그래서 에디터는 **client-only로만 마운트**하는 것을 권장한다 — 두 가지 동등한 방법이 있다.

### 방법 1 — `next/dynamic({ ssr: false })`(Next.js 전용, 권장)

Next.js 공식 client-only 통합 패턴이다.

```tsx
"use client";

import dynamic from "next/dynamic";

const Editor = dynamic(() => import("./editor"), { ssr: false });

export default function Page() {
  return <Editor />;
}
```

`./editor.tsx`에는 위 "최소 사용 예"의 `Editor` 컴포넌트를 그대로 둔다. `next/dynamic`의 `ssr: false`가 서버 렌더 단계에서 이 모듈을 아예 평가하지 않고, client에서만 코드를 불러와 마운트한다.

### 방법 2 — 수동 client-only guard(Next.js 외 SSR 프레임워크에도 적용 가능)

`next/dynamic` 없이 직접 마운트를 클라이언트로 미루는 범용 패턴이다.

```tsx
"use client";

import { useEffect, useState } from "react";
import { EditorContent, EditorProvider } from "@cp949/geul-react";

function EditorGuard() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  if (!isClient) return null;
  return (
    <EditorProvider initialDocument={initialDocument}>
      <EditorContent />
    </EditorProvider>
  );
}
```

`useEffect`는 서버에서 실행되지 않으므로 첫 서버 렌더(및 client 첫 렌더)는 `null`을 반환하고, client에서 mount된 뒤에만 실제 에디터가 렌더된다 — 서버 렌더 단계에서 editor DOM이 전혀 평가되지 않는다.

## 알려진 제약

- `"use client"`는 다른 번들러·런타임(Vite, CRA 등)에서는 무해한 문자열 리터럴이다 — Next.js가 아닌 프로젝트에도 그대로 쓸 수 있다.
- 서버 환경에서 `createEditor()` 자체는 크래시하지 않지만(`@cp949/geul-core`), 그 결과로 얻은 controller의 문서는 아직 로드 시점 정규화가 적용되지 않았을 수 있다. 위 두 client-only 패턴을 따르면 이 결과를 실제로 관찰할 일이 없다(서버에서 에디터를 마운트하지 않으므로).
