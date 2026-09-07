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

## Markdown 서버 사용법

(`exportMarkdown`/`importMarkdown` 문서화는 Issue #156 슬라이스9 RD-002에서 이어서 작성한다.)
