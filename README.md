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

Next.js 통합, 구문 강조 연결 같은 상세 사용법은 [`@cp949/geul-react`](./packages/react)를 본다. React 없이 저수준 API로 직접 제어하려면 [`@cp949/geul-core`](./packages/core), 서버에서 문서를 HTML/Markdown으로 변환하려면 [`@cp949/geul-io`](./packages/io)를 본다.

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

공식 browser floor는 Chrome 75다. Geul 패키지 자체는 Chrome 75 문법으로 빌드되고, 자기 소스가 쓰는 런타임 API는 ES 표준 기준으로 검증된다 — 의존성이 쓰는 최신 런타임 API의 polyfill은 사용처 책임이다.

Chrome 75를 지원해야 하면 두 가지를 설정한다.

1. 앱 엔트리의 첫 import로 `import "core-js/stable";`을 넣는다.
2. 번들러 target을 Chrome 75로 둔다(Vite: `build.target: 'chrome75'`).

최신 Chrome만 지원하는 사용처는 아무 조치도 필요 없다.

## 상태

R0~R4(저장 모델, 표, 기본 블록 parity, 파일·미디어, 확장성) 완료, 1차 릴리즈를 준비 중이다. 최신 진행 상황은 [현재 프로젝트 상태](./docs/product/current-status.md)를 참고한다.

## 라이선스

[MIT](./LICENSE)

## 기여

개발 환경, 검증 명령과 내부 문서 지도는 [CONTRIBUTING.md](./CONTRIBUTING.md)를 본다. 버그·기능 요청은 [GitHub Issues](https://github.com/cp949/geul/issues)에 남긴다.
