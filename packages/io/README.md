# @cp949/geul-io

geul 문서(`@cp949/geul-model`의 `Document`)와 HTML·Markdown 문자열 사이의 변환을 담당하는 패키지다. `exportHtml`/`importHtml`/`exportMarkdown`/`importMarkdown` 4개 함수를 공개한다.

## 서버 환경에서 사용하기

4개 공개 함수 전부 브라우저 DOM 전역(`document`/`window`)을 참조하지 않는다. 순수 Node.js 환경(브라우저·jsdom·에디터 인스턴스 없음)에서도 그대로 동작한다 — Next.js API route, 서버 컴포넌트, 배치 스크립트 등에서 저장된 문서를 HTML/Markdown으로 렌더링하거나, 외부에서 받은 HTML/Markdown을 문서로 가져올 때 쓸 수 있다.

패키지 자체가 이를 컴파일 타임에도 강제한다 — `tsconfig.json`/`tsconfig.test.json`이 `lib`에 `DOM`을 포함하지 않아 소스·테스트 어디서도 `document`/`window`를 전역 식별자로 참조할 수 없다.

이 함수들이 `@cp949/geul-core`의 에디터 인스턴스(`createEditor()`)와 무관하다는 점에 유의한다 — 문서(`Document`) 값만 입출력하는 순수 함수라 에디터를 생성·마운트하지 않고도 호출할 수 있다.

### `exportHtml` / `importHtml`

```ts
import { exportHtml, importHtml } from "@cp949/geul-io";

const result = exportHtml(document); // document: Document (@cp949/geul-model)
if (result.ok) {
  const html: string = result.value;
}

const imported = importHtml(html);
if (imported.ok) {
  const { document, warnings } = imported.value;
}
```

`exportHtml`은 문서에 등록되지 않은 커스텀 블록 타입(`EXT-001`)이 있으면 `{ code: "HTML_DOCUMENT_INVALID" }` 오류로 거절한다. 커스텀 블록을 HTML로 직렬화하려면 `options.customBlockToHtml`에 타입별 렌더러를 등록해야 한다 — 등록하지 않은 타입은 이 옵션으로만 인식되며, geul의 기본 14종 블록 타입과 달리 자동으로 렌더링되지 않는다.

```ts
exportHtml(document, {
  customBlockToHtml: {
    myCustomBlock: (block) => `<div data-my-block>${block.props.text}</div>`,
  },
});
```

`options.syntaxHighlighter`를 주면 codeBlock 텍스트를 `<span class="...">` 강조 마크업과 함께 내보낸다 — `@cp949/geul-core`의 `EditorProvider`가 받는 `syntaxHighlighter`와 같은 타입(`SyntaxHighlighter`, `@cp949/geul-model`에서 재수출)이라 라이브 에디터용으로 이미 만든 함수를 그대로 재사용할 수 있다.

```ts
exportHtml(document, {
  syntaxHighlighter: ({ source, language }) => {
    if (language !== "typescript") return [];
    return [{ from: 0, to: 3, className: "keyword" }]; // 예: "let"만 강조
  },
});
```

- `syntaxHighlighter`가 주어지지 않으면 기존과 동일한 plain 출력이다(회귀 없음).
- `exportHtml`은 완전 동기 함수다 — `syntaxHighlighter`가 Promise를 반환하면(예: 초기화가 비동기인 하이라이터) 그 결과를 기다리지 않고 해당 코드 블록만 강조 없이 plain으로 내보내며 `console.warn`을 낸다.
- 강조 span의 `class`엔 색상이 없다(geul은 색상을 소유하지 않는다) — export 결과를 geul 밖에서 단독으로 열면 매칭되는 CSS 없이는 강조가 보이지 않는다. standalone 표시가 필요하면 소비자가 CSS를 직접 공급한다.
- 강조 span 포함 HTML을 다시 `importHtml`로 가져오면 codeBlock의 source·language는 정확히 복원되지만, span의 `class`는 sanitizer가 제거하면서 `warnings`에 `UNSAFE_ATTRIBUTE_REMOVED`(`element: "span"`, `attribute: "className"`)를 강조 span 개수만큼 남긴다 — codeBlock 모델이 문자 단위 스타일을 저장하지 않으므로 이 경고는 오류가 아니다.

### `exportMarkdown` / `importMarkdown`

```ts
import { exportMarkdown, importMarkdown } from "@cp949/geul-io";

const result = exportMarkdown(document, { mode: "strict" });
if (result.ok) {
  const markdown: string = result.value;
}

const imported = importMarkdown(markdown);
if (imported.ok) {
  const { document, warnings } = imported.value;
}
```

`exportMarkdown`은 `mode: "strict"` | `"lossy"`를 요구한다. 문서에 등록되지 않은 커스텀 블록 타입(`EXT-001`)이 있으면 손실 카테고리 `CUSTOM_BLOCK_LOST`로 취급한다 — `strict` 모드는 `{ code: "MARKDOWN_LOSS_NOT_ALLOWED", losses }`로 거절하고, `lossy` 모드는 해당 블록을 결과에서 폐기하고 `warnings`로 함께 반환한다(`exportHtml`의 단순 거절과 다른 손실 이분법). 커스텀 블록을 직렬화하려면 `options.customBlockToMarkdown`에 타입별 렌더러를 등록한다.

```ts
exportMarkdown(document, {
  mode: "lossy",
  customBlockToMarkdown: {
    myCustomBlock: (block) => `<!-- myCustomBlock: ${block.props.text} -->`,
  },
});
```
