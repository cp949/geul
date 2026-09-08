# BLK-017 — 코드 블록 구문 강조 seam 설계

## 1. 결정 요약

geul은 구문 강조 라이브러리(highlight.js, Prism, Shiki 등)를 소유하지 않는다. `packages/core`가 중립적인 공개 seam 타입(`SyntaxHighlighter`)만 정의하고, ProseMirror 연결(decoration 생성·캐시·비동기 재계산)은 `prosemirror-highlight`(MIT)를 내부 구현으로 채택한다. 소비자가 원하는 하이라이터로 만든 `SyntaxHighlighter` 함수를 `EditorProvider`에 연결하면 동작한다. 연결하지 않으면 조용히 plain text로 렌더된다.

이 설계는 [Issue #162](https://github.com/cp949/geul/issues/162)의 그릴링 세션 결과를 공식 계약으로 고정한다(`ADR-0002`의 공개 API ProseMirror/Tiptap 비노출 불변식, `ADR-0005`의 "이미 풀린 문제는 외부 라이브러리로" 원칙을 따른다).

## 2. 패키지 배치와 의존성

- `packages/core`: `SyntaxHighlighter`/`SyntaxHighlightToken` 공개 타입 소유. `prosemirror-highlight`를 `dependencies`에 추가(exact version, 구현 시점에 최신 안정판 고정). 하이라이터 라이브러리(highlight.js 등)는 `packages/core`/`packages/react`에 전혀 의존하지 않는다.
- `packages/react`: `EditorProvider`가 `syntaxHighlighter`·`codeBlockLanguages` 옵션을 core로 threading. `code-block-language-combobox.tsx`가 `codeBlockLanguages`를 소비.
- `apps/showcase`: 예제별로 선택한 하이라이터 라이브러리를 devDependency로 추가(하이라이터별 exact version·license는 §7 참고, RD-003 착수 전 확정).

## 3. 공개 타입 — `SyntaxHighlighter`

```ts
type SyntaxHighlightToken = {
  /** source 문자열 안 시작 오프셋(0-indexed, code unit 기준) */
  from: number;
  /** source 문자열 안 끝 오프셋(exclusive) */
  to: number;
  /** 적용할 CSS class. 색상 자체는 geul이 소유하지 않는다 — 이 class를 정의하는 스타일시트는 소비자(또는 소비자가 고른 하이라이터의 테마)가 공급한다. */
  className?: string;
};

type SyntaxHighlighter = (input: {
  source: string;
  language: string | undefined;
}) =>
  | readonly SyntaxHighlightToken[]
  | Promise<readonly SyntaxHighlightToken[]>;
```

`from`/`to` 오프셋 방식을 택했다(연속 텍스트 조각 배열 방식 대신). 이유:

- `prosemirror-highlight`의 내부 `Parser`가 이미 위치 기반 `Decoration`을 다루므로, geul 내부 adapter(`SyntaxHighlighter` → `Parser`)가 위치 정보를 다시 계산할 필요가 없다.
- 텍스트 조각 배열 방식은 조각들이 source 전체를 빠짐없이 이어붙여야 위치가 안 어긋난다 — 소비자가 만든 adapter가 한 글자라도 놓치면 그 뒤 전체가 밀린다. 오프셋 방식은 각 token이 독립적이라 한 token의 오류가 나머지로 전파되지 않는다(장애 반경이 국소적).

## 4. edge case 규칙

- **범위 밖 token**(`from`/`to`가 `[0, source.length]` 밖이거나 `from > to`): 유효 범위로 clamp하고 `console.warn` 1회(개발 중 소비자가 만든 하이라이터 함수의 버그를 알아챌 수 있게 — "연결 안 함"과는 다른 상황이라 경고한다).
- **겹치는 token**: 별도 우선순위 규칙을 두지 않는다. ProseMirror는 겹치는 inline decoration을 두 class를 함께 적용해(공백으로 이어붙여) 렌더링한다 — geul이 병합·우선순위 로직을 추가로 구현하지 않는다.
- **거절된(rejected) Promise**: catch해서 그 시도만 실패로 처리한다(이전에 표시된 decoration을 유지하거나, 처음이면 plain text 유지) + `console.warn`으로 원인 에러를 알린다.
- **미지원/빈 language**: geul은 관여하지 않는다 — `SyntaxHighlighter` 함수가 알아서 빈 배열을 반환하면 그 블록은 plain text로 남는다.
- **비동기 최신 결과만 반영(stale 방지)**: `prosemirror-highlight`의 캐시·invalidate 메커니즘이 처리한다(구현 세부는 core 내부, 공개 계약 아님). 편집 중 오래된 Promise가 늦게 resolve해도 최신 문서 위치를 오염시키지 않음을 회귀 테스트로 직접 증명한다(RD-001 완료 조건, §6).

## 5. 미연결 시 동작

`syntaxHighlighter` 옵션을 주지 않으면 모든 코드 블록이 plain text로 렌더된다. 경고를 내지 않는다(BlockNote 기본 동작과 동일 — 사용자 결정, §4의 "범위 밖 token"·"거절된 Promise"처럼 **연결은 했는데 잘못된 결과**를 반환하는 경우와는 구분한다).

## 6. `codeBlockLanguages` — 언어 콤보박스 후보 목록

`packages/react`의 `EditorProvider` 전용 옵션이다(core는 소비하지 않는다 — model의 `CodeBlock.language`는 이미 자유 문자열이고 어떤 고정 목록도 강제하지 않는다, `isValidCodeBlockLanguage`가 금지 문자만 검사).

```ts
type CodeBlockLanguageOption = {
  id: string;
  label: string;
  aliases?: readonly string[];
};

type EditorProviderProps = {
  // ...
  codeBlockLanguages?: readonly CodeBlockLanguageOption[];
};
```

- 값을 주면 콤보박스 후보 목록을 그 값으로 **완전히 교체**한다(기존 `enabledBlockTypes`와 동일한 "안 주면 전체 기본값, 주면 그 값" 패턴).
- 이 옵션은 콤보박스가 제안하는 후보 목록만 바꾼다. 현재 콤보박스는 자유 입력 필드라(`code-block-language-combobox.tsx`의 `draft`/`commit` 상태, 실측 확인) 사용자가 목록에 없는 문자열을 직접 타이핑하거나 import된 문서가 임의의 `language` 값을 가진 채로 로드되는 것을 막지 않는다 — `codeBlockLanguages`는 문서 검증 계약을 바꾸지 않는다.

## 7. showcase 예제 범위

라이브러리별 별도 example 폴더로 다음을 시연한다. 각 라이브러리는 `apps/showcase`에만 추가하는 devDependency다(exact version·license는 RD-003 착수 시점에 재확인 — 2026-09-08 조사 기준 아래 모두 permissive):

| 라이브러리 | 역할 | 버전(조사 시점) | 라이선스 |
| --- | --- | --- | --- |
| `lowlight` (+ `highlight.js`) | 동기 대표, highlight.js 어댑터 | lowlight 3.3.0, highlight.js 11.12.0 | MIT / BSD-3-Clause |
| `refractor` | 동기, Prism 어댑터 | 5.0.0 | MIT |
| `shiki` | 비동기 대표, VS Code 문법 엔진 | 4.4.3 | MIT |
| `@lezer/highlight` + 언어별 `@lezer/*` 패키지 | CodeMirror 문법 엔진 | @lezer/highlight 1.2.3 (언어별 패키지는 RD-003에서 개별 확인 필요 — 11개 언어만큼 패키지가 늘어날 수 있음) | MIT |
| `sugar-high` | 경량 정규식 기반 하이라이터 | 2.3.1 | MIT (지원 언어 범위가 geul 11개 언어를 다 커버하는지는 RD-003 착수 전 확인 필요 — 미확인) |

`prosemirror-highlight`(core 의존, §2)는 이 표와 별개다 — 하이라이터가 아니라 배관이며 이미 §1에서 결정됐다.

5개 전부를 유지할지, CodeMirror·sugar-high 두 개(언어 커버리지·패키지 구조가 나머지 셋과 다름)를 별도 후속 이슈로 분리할지는 RD-003 착수 시점에 재확인한다(Issue #162 논의 참고).

## 8. 완료 기준

- [ ] `SyntaxHighlighter`/`SyntaxHighlightToken`/`CodeBlockLanguageOption` 타입이 `packages/core`/`packages/react`의 공개 export에 정확히 이 shape로 존재한다.
- [ ] §4의 edge case 5개(범위 밖, 겹침, 거절된 Promise, 미지원/빈 language, stale 비동기) 각각 회귀 테스트로 고정된다.
- [ ] 공개 API에 ProseMirror `Decoration`이나 `prosemirror-highlight`의 타입이 노출되지 않는다(package boundary 검증, `G-WKS-001`).

## 9. 범위 밖

- `io`(HTML/GFM export)의 강조 span 포함 — 1차 릴리즈 제외(Issue #162 "제외 범위").
- R5 나머지(`BLK-018`·`BLK-019`·`INL-012`·`EXT-011`).
