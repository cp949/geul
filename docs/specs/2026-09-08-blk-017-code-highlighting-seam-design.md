# BLK-017 — 코드 블록 구문 강조 seam 설계

## 1. 결정 요약

geul은 구문 강조 라이브러리(highlight.js, Prism, Shiki 등)를 소유하지 않는다. `packages/core`가 중립적인 공개 seam 타입(`SyntaxHighlighter`)만 정의하고, ProseMirror 연결(decoration 생성·캐시·비동기 재계산)은 `prosemirror-highlight`(MIT)를 내부 구현으로 채택한다. 소비자가 원하는 하이라이터로 만든 `SyntaxHighlighter` 함수를 `EditorProvider`에 연결하면 동작한다. 연결하지 않으면 조용히 plain text로 렌더된다.

이 설계는 [Issue #162](https://github.com/cp949/geul/issues/162)의 그릴링 세션 결과를 공식 계약으로 고정한다(`ADR-0002`의 공개 API ProseMirror/Tiptap 비노출 불변식, `ADR-0005`의 "이미 풀린 문제는 외부 라이브러리로" 원칙을 따른다).

Issue #162가 1차 릴리즈 제외로 남긴 "io(HTML/GFM export) 강조 span 포함"은 [Issue #172](https://github.com/cp949/geul/issues/172)가 이어받는다 — §2·§10 참고. §9의 제외 bullet은 Issue #172 roadmap이 완료될 때까지 여전히 현재 동작을 뜻한다(§10은 확정된 설계이지 이미 shipping된 상태가 아니다).

## 2. 패키지 배치와 의존성

- `packages/model`: `SyntaxHighlighter`/`SyntaxHighlightToken` 공개 타입 소유(Issue #172로 `packages/core`에서 이동 — `io`가 `core`에 의존하지 않는 layering(`ADR-0002`)에서 `io`도 이 계약을 참조해야 했기 때문이다).
- `packages/core`: `index.ts`가 위 두 타입을 `@cp949/geul-model`에서 re-export한다(`ADR-0002` §7의 model→core re-export 선례 — `serializeTableColumns`/`parseTableColumns`와 동일 패턴, §8 완료 기준을 그대로 유지). `prosemirror-highlight`를 `dependencies`에 추가(exact version, 구현 시점에 최신 안정판 고정). 하이라이터 라이브러리(highlight.js 등)는 `packages/core`/`packages/react`에 전혀 의존하지 않는다.
- `packages/io`: `exportHtml`이 `ExportHtmlOptions.syntaxHighlighter?`로 같은 계약을 소비한다(§9, Issue #172).
- `packages/react`: `EditorProvider`가 `syntaxHighlighter`·`codeBlockLanguages` 옵션을 core로 threading. `code-block-language-combobox.tsx`가 `codeBlockLanguages`를 소비. `CreateEditorOptions["syntaxHighlighter"]` 인덱스 참조만 쓰므로 타입 위치 이동의 영향을 받지 않는다.
- `apps/showcase`: 예제별로 선택한 하이라이터 라이브러리를 devDependency로 추가(하이라이터별 exact version·license는 §7 참고, RD-003 착수 전 확정).

## 3. 공개 타입 — `SyntaxHighlighter`

정의 위치는 `packages/model`이다(§2, Issue #172). `packages/core`가 그대로 re-export해 이 절의 shape·계약은 변경되지 않는다.

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
  readonly SyntaxHighlightToken[] | Promise<readonly SyntaxHighlightToken[]>;
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
- 이 옵션은 팝오버가 제안하는 후보 목록만 바꾼다. 현재 팝오버의 검색 input은 자유 입력 필드라(`code-block-language-combobox.tsx`의 `search`/`commit` 상태, 실측 확인 — Issue #173 이전에는 `draft`였다) 사용자가 목록에 없는 문자열을 직접 타이핑하거나 import된 문서가 임의의 `language` 값을 가진 채로 로드되는 것을 막지 않는다 — `codeBlockLanguages`는 문서 검증 계약을 바꾸지 않는다.

## 7. showcase 예제 범위

라이브러리별 별도 example 폴더로 다음을 시연한다. 각 라이브러리는 `apps/showcase`에만 추가하는 devDependency다(exact version·license는 RD-003 착수 시점에 재확인 — 2026-09-08 조사 기준 아래 모두 permissive):

| 라이브러리                                    | 역할                           | 버전(조사 시점)                                                                                            | 라이선스                                                                                  |
| --------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `lowlight` (+ `highlight.js`)                 | 동기 대표, highlight.js 어댑터 | lowlight 3.3.0, highlight.js 11.12.0                                                                       | MIT / BSD-3-Clause                                                                        |
| `refractor`                                   | 동기, Prism 어댑터             | 5.0.0                                                                                                      | MIT                                                                                       |
| `shiki`                                       | 비동기 대표, VS Code 문법 엔진 | 4.4.3                                                                                                      | MIT                                                                                       |
| `@lezer/highlight` + 언어별 `@lezer/*` 패키지 | CodeMirror 문법 엔진           | @lezer/highlight 1.2.3 (언어별 패키지는 RD-003에서 개별 확인 필요 — 11개 언어만큼 패키지가 늘어날 수 있음) | MIT                                                                                       |
| `sugar-high`                                  | 경량 정규식 기반 하이라이터    | 2.3.1                                                                                                      | MIT (지원 언어 범위가 geul 11개 언어를 다 커버하는지는 RD-003 착수 전 확인 필요 — 미확인) |

`prosemirror-highlight`(core 의존, §2)는 이 표와 별개다 — 하이라이터가 아니라 배관이며 이미 §1에서 결정됐다.

5개 전부를 유지할지, CodeMirror·sugar-high 두 개(언어 커버리지·패키지 구조가 나머지 셋과 다름)를 별도 후속 이슈로 분리할지는 RD-003 착수 시점에 재확인한다(Issue #162 논의 참고).

## 8. 완료 기준

- [ ] `SyntaxHighlighter`/`SyntaxHighlightToken`이 `packages/model`에 정의되고 `packages/core`의 공개 export가 이를 re-export하며, `CodeBlockLanguageOption`이 `packages/react`의 공개 export에 정확히 이 shape로 존재한다.
- [ ] §4의 edge case 5개(범위 밖, 겹침, 거절된 Promise, 미지원/빈 language, stale 비동기) 각각 회귀 테스트로 고정된다.
- [ ] 공개 API에 ProseMirror `Decoration`이나 `prosemirror-highlight`의 타입이 노출되지 않는다(package boundary 검증, `G-WKS-001`).

§10의 io export 계약에 대한 완료 기준은 이 문서가 중복 보유하지 않는다 — Issue #172와 `_works/roadmap/RD-001.md`~`RD-003.md`가 소유한다.

## 9. 범위 밖

- ~~`io`(HTML/GFM export)의 강조 span 포함 — 1차 릴리즈 제외(Issue #162 "제외 범위").~~ Issue #172(2026-09-11, roadmap-workflow RD-001~003)가 §10대로 구현을 완료했다 — 더 이상 범위 밖이 아니다. `docs/product/roadmap.md`·`docs/product/current-status.md`·`docs/product/blocknote-free-feature-inventory.md`도 함께 갱신했다.
- R5 나머지(`BLK-018`·`BLK-019`·`INL-012`·`EXT-011`).

## 10. io export 구문 강조 계약 (Issue #172, 구현 완료)

Issue #162가 1차 릴리즈 제외로 남긴 범위(§9)를 여기서 확정하고, Issue #172(2026-09-11, roadmap-workflow RD-001~003)가 구현을 완료했다. `packages/io`의 `exportHtml`이 codeBlock을 강조 span 포함 HTML로 내보내고, `importHtml`이 이를 다시 codeBlock으로 복원한다.

- **옵션**: `ExportHtmlOptions`에 `syntaxHighlighter?: SyntaxHighlighter`를 추가한다(`customBlockToHtml`과 동일한 선택적 확장 패턴). §3의 계약을 그대로 재사용한다 — io 전용 별도 타입을 만들지 않는다.
- **동기 전용**: `exportHtml`은 `Result<string, ExportError>`를 즉시 반환하는 동기 함수로 남긴다. `syntaxHighlighter`가 Promise를 반환하면 해당 코드 블록만 강조 없이 plain으로 export하고 `console.warn`으로 알린다 — §4 "거절된 Promise"와 동일한 결의 처리이지만, 여기서는 관찰(resolve/reject 전) 자체가 export의 동기 반환 시점을 넘기므로 무조건 plain 처리한다(`docs/adr/0016-keep-exporthtml-synchronous-for-syntax-highlighting.md`).
- **markup**: `<span class="...">`만 생성한다. `SyntaxHighlightToken.className`엔 색상이 없으므로(§3) export 결과를 geul 밖에서 단독으로 열면 CSS 없이는 강조가 안 보인다 — 이것도 `ADR-0005`가 이미 정한 "색상은 geul이 소유하지 않는다"의 자연스러운 결과다. standalone 표시가 필요하면 소비자가 CSS를 직접 공급한다.
- **import 쪽 변경 없음, 단 경고는 난다**: `packages/io/src/html/sanitize-schema.ts`의 `span` 태그는 이미 허용 목록에 있다(`htmlAllowedTagNames`) — 강조 span의 `class`는 제거되지만 텍스트는 보존된다. **제거는 조용하지 않다** — 일반 sanitize 경고 채널(`UNSAFE_ATTRIBUTE_REMOVED`, `element: "span"`, `attribute: "className"`)을 그대로 타므로, 강조 span 개수만큼 `importHtml` 결과의 `warnings`가 채워진다(RD-003 실측으로 정정 — 최초 설계 시 "조용히"라고 잘못 적었다). codeBlock 모델(`content: text*, marks: ""`)이 애초에 문자 단위 스타일을 저장하지 않으므로 class 제거 자체는 정확한 동작이고, geul 자신의 export를 되읽을 때도 나는 이 경고는 오류 신호가 아니다 — sanitizer 스키마를 바꾸지 않고 그대로 수용한다(사용자 결정, 2026-09-11).
- **제외**: 클립보드 "복사" 경로 신설(현재 없음), 인라인 코드 강조, export 결과에 테마 CSS를 embed하는 것.
