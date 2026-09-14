# Geul

독자 JSON 문서 모델과 안전한 HTML/GFM 상호운용을 제공하는 TypeScript 블록 에디터다. 헤드리스 코어 위에 React 바인딩을 제공하며, 저장 형식과 공개 API는 특정 에디터 구현에 의존하지 않는다.

## 설치

```bash
npm install @cp949/geul-react @cp949/geul-model
```

## 빠른 시작

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

기능 구성, 업로드, 구문 강조 연결 같은 상세 사용법은 [`@cp949/geul-react`](./packages/react)를 본다. React 없이 저수준 API로 직접 제어하려면 [`@cp949/geul-core`](./packages/core), 서버에서 문서를 HTML/Markdown으로 변환하려면 [`@cp949/geul-io`](./packages/io)를 본다.

## 패키지

| 패키지                                  | 역할                                                          |
| --------------------------------------- | ------------------------------------------------------------- |
| [`@cp949/geul-model`](./packages/model) | 독자 문서 타입, shape·의미 검증, 표 논리 격자 검증            |
| [`@cp949/geul-io`](./packages/io)       | model과 HTML/GFM 사이의 변환, HTML sanitize                   |
| [`@cp949/geul-core`](./packages/core)   | Tiptap을 비공개 구현으로 감싼 headless editor controller      |
| [`@cp949/geul-react`](./packages/react) | React 바인딩과 UI 컴포넌트(툴바, 슬래시 메뉴, 이모지 피커 등) |

```text
io   -> model
core -> model
react -> core
```

## 브라우저 지원

공식 browser floor는 Chrome 75다. Geul 자체는 Chrome 75 문법으로 빌드되지만, 참조하는 라이브러리는 그렇지 않아 polyfill이 필요하다 — 설정 예시는 [`apps/demo`](./apps/demo)를 참고한다.

## 상태

R0~R4(저장 모델, 표, 기본 블록 parity, 파일·미디어, 확장성) 완료. 최신 진행 상황은 [현재 프로젝트 상태](./docs/product/current-status.md)를 참고한다.

## 라이선스

[MIT](./LICENSE)

## 기여

저장소를 clone했다면 다음으로 전체 컴포넌트 showcase를 띄운다.

```bash
pnpm install
pnpm build
pnpm showcase
```

`apps/showcase`는 빌드된 패키지(dist)를 소비한다 — `pnpm build` 없이 실행하면 오래된 dist가 뜬다.

개발 환경, 검증 명령과 내부 문서 지도는 [CONTRIBUTING.md](./CONTRIBUTING.md)를 본다. 버그·기능 요청은 [GitHub Issues](https://github.com/cp949/geul/issues)에 남긴다.
