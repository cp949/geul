# @cp949/geul-model

geul 문서의 독자 JSON 스키마와 검증을 담당하는 패키지다. 프레임워크·렌더러·DOM 어디에도 의존하지 않는 순수 타입과 함수만 내보낸다 — `@cp949/geul-io`·`@cp949/geul-core`·`@cp949/geul-react`가 공유하는 문서 타입의 단일 소스다.

## 서버 환경에서 사용하기

공개 함수 전부 브라우저 DOM 전역(`document`/`window`)을 참조하지 않는다. 순수 Node.js 환경에서도 그대로 동작한다 — 저장된 문서를 검증하거나, 클라이언트가 보낸 JSON을 신뢰하기 전에 서버에서 재검증할 때 쓸 수 있다.

패키지 자체가 이를 컴파일 타임에도 강제한다 — `tsconfig.json`이 `lib`에 `DOM`을 포함하지 않아 소스 어디서도 `document`/`window`를 전역 식별자로 참조할 수 없다.

## 최소 사용 예

```ts
import { createEmptyDocument, createRandomDocumentId, parseDocument } from "@cp949/geul-model";

// 인자는 블록 id를 만드는 함수다.
// createRandomDocumentId는 Chrome75 호환 UUID v4 생성기이자 createEmptyDocument의
// 기본값이다 — 인자를 생략해도 같지만, 여기서는 명시했다.
const emptyDocument = createEmptyDocument(createRandomDocumentId);

// 외부(저장소, API 요청 body 등)에서 받은 값은 신뢰하지 않고 재검증한다.
const result = parseDocument(rawJsonFromStorage);
if (result.ok) {
  const validated = result.value; // Document
} else {
  result.error; // { code: DocumentErrorCode, path, message }
}
```

## 담고 있는 것

- **문서 타입**: `Document`, `Block`(paragraph·heading·table·image 등 14종), `InlineContentItem`, `TextMark`
- **검증**: `parseDocument`(전체 문서 shape·의미 검증), `isValidDocumentId`, `isValidCodeBlockSource`, `isSupportedLinkHref`/`isSupportedMediaUrl` 등 필드별 판정 함수
- **표 유틸**: `parseTableColumns`/`serializeTableColumns`(표 열 폭 속성 왕복), `GridCell` 등 논리 격자 타입 — 표는 셀 병합을 포함한 논리 격자 정합성까지 이 패키지가 검증한다
- **텍스트 마크**: `canonicalizeTextMarks`/`isCanonicalTextMarks`(마크 정규형), `appendOrMergeInlineItem`

## 알려진 제약

- 렌더링·직렬화는 이 패키지 몫이 아니다 — HTML/GFM 변환은 [`@cp949/geul-io`](../io), 에디터 편집 세션은 [`@cp949/geul-core`](../core)가 담당한다.
- `Document`는 순수 데이터다 — 편집 히스토리(undo/redo)나 에디터 세션 상태를 포함하지 않는다.
