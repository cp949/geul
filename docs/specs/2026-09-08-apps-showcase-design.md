# apps/showcase 설계

## 1. 결정 요약

`apps/showcase`를 신설한다. `@cp949/geul-react` 공개 표면(`packages/react/src/index.ts`) 전체를 좌측 메뉴 + URL 라우팅으로 묶어, 단순한 예제부터 점점 복잡한 예제까지 단계적으로 보여주는 앱이다.

목적은 세 가지다.

1. **개발/회귀 확인**: 컨트리뷰터가 로컬에서 각 기능이 실제로 동작하는지 빠르게 확인.
2. **디자인·UX 품질 제시**: "이런 것도 가능하다"를 사용자가 체감하는 자리. 디자인·UX가 나쁘면 이 목적 자체가 무의미해지므로 설계 전반에서 우선한다.
3. **에이전트 주도 UX 결함 탐지**: 정적 스크린샷이 아니라 실제 상호작용(hover, 타이핑, 드래그, 붙여넣기)을 에이전트가 브라우저로 직접 밟아 타이밍성·상호작용성 결함(예: 현재 `apps/demo`에서 관측된 "paragraph 사이드 메뉴가 너무 빨리 사라져 사람이 선택할 수 없는" 문제)을 찾아내는 표면.

`apps/demo`는 그대로 둔다 — e2e 30+ spec, chrome83 검증, 폴리필 계약(`tests/demo-polyfill-entry.test.ts`)이 이미 그 위에 고정 배선돼 있고(2026-09-08 이전 대화 조사), showcase의 목적과 겹치지 않는다. demo에서 발견된 사이드 메뉴 버그 자체는 이 스펙의 범위가 아니다 — 별도로 이슈 등록·수정한다.

## 2. 범위

### 포함

- `@cp949/geul-react`가 export하는 표면 전체: `EditorProvider`, `EditorContent`, `useEditor`/`useDictionary`, `FormattingToolbar`, `LinkToolbar`, `SlashMenu`(+ `SlashMenuCustomItem`), `FilePanel`, `MediaToolbar`, `MediaResizeHandles`, `EmojiPicker`.
- 좌측 사이드바 메뉴 + URL 라우팅(새로고침·링크 공유 가능).
- 각 예제의 라이브 데모 + 실제 소스 파일을 그대로 보여주는 소스 패널.

### 제외 (2026-09-08 브레인스토밍에서 합의)

- `@cp949/geul-io`의 HTML/GFM/JSON 변환 예제 — react 어댑터 표면만 다룬다(2026-09-11 정정 — Kitchen sink(Example 0)에 한해 `exportHtml()`로 미리보기/HTML 탭을 추가한다. react 표면 자체를 벗어나는 별도 io 변환 예제를 신설하는 것이 아니라, 대표 예제의 결과물을 확인하는 부속 기능이다. `showcase -> react, io, model`로 의존 방향 추가, ADR-0002 갱신).
- 복합 실사용 시나리오(블로그 에디터, 댓글 등) — 기능 단위 데모 + 마지막 kitchen-sink 조합까지만.
- SSR/Next.js 통합 예제(`EXT-013`) — react 표면 자체가 아니라 프레임워크 통합 주제라 범위 밖.
- 자동 e2e 회귀 게이트 — 최초 도입 시점엔 포함하지 않는다(§7).
- Chrome75 호환 재현 — 그 역할은 `apps/demo`가 전담(ADR-0009), showcase는 최신 evergreen 브라우저만 타겟.

## 3. 구조

```
apps/showcase/
  src/
    main.tsx              # 일반 React 엔트리. core-js/stable 불필요(§6)
    root-layout.tsx        # 좌측 사이드바 + <Outlet/>
    routes.tsx             # 카테고리 -> 예제 route 정의. 사이드바 메뉴도 이 목록에서 파생
    examples/
      01-minimal/
        example.tsx        # 라이브 데모 컴포넌트(?raw로도 import됨)
        page.tsx           # example.tsx 렌더 + 소스 패널 배치
      02-document-io/
      03-formatting-toolbar/
      04-link-toolbar/
      05-slash-menu/
      06-file-panel/
      07-media/
      08-emoji-picker/
      09-dictionary-override/
      00-composite/
  vite.config.ts
  package.json              # name: "@cp949/geul-showcase" (apps/demo의 "@cp949/geul-demo" 네이밍 패턴)
  tsconfig.json            # references: packages/react, packages/model. types: ["vite/client"](?raw 타입)
  tsconfig.configs.json     # demo 패턴과 동일(vite.config.ts 등 설정 파일 typecheck용)
```

라우팅은 `react-router`(선언적 모드, SSR 프레임워크 모드 아님)를 쓴다. 새 워크스페이스 의존성 1개가 늘지만 nested route/layout route로 셸을 표준 패턴으로 구현하고 active-link 하이라이트·뒤로가기를 별도 구현 없이 얻는다.

예제 하나 = 폴더 하나(`example.tsx` + `page.tsx`) 원칙. 새 예제 추가 시 `routes.tsx`에 한 줄만 등록하면 사이드바·라우트에 함께 반영된다.

## 4. 예제 목록과 진행 순서

`@cp949/geul-react` 공개 표면 10개 항목을 단순 -> 복잡 순으로 1:1 매핑한다. 각 단계는 그 단계가 보여주려는 표면에 실제로 필요한 컴포넌트만 장착한다 — 이전 단계의 컴포넌트는 지금 단계가 기능적으로 의존할 때만 유지한다(예: File panel은 SlashMenu로 미디어 placeholder 블록을 만들어야 열리므로 SlashMenu를 유지하지만, 관련 없는 FormattingToolbar/LinkToolbar까지 안고 갈 필요는 없다). 모든 표면을 한 번에 다 얹는 "전부 누적"은 Example 0 Kitchen sink 하나가 전담한다 — 그 뒤 1~9번을 전부 이해하고 나서 봐야 이해되는 문서를 매 단계 반복하지 않기 위해서다. Kitchen sink는 대표 예제이므로 Example 0과 사이드바 최상단에 고정한다. 이후 개별 예제 추가는 Kitchen sink의 번호와 위치에 영향을 주지 않는다(2026-09-08 구현 중 확정, 초안의 "각 단계는 이전 단계에 컴포넌트 하나만 더한다"는 이 의도를 정확히 담지 못해 정정).

| #   | 예제                    | 새로 추가되는 표면                                                         | 비고                                                                                                  |
| --- | ----------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | Minimal editor          | `EditorProvider` + `EditorContent`                                         | 툴바 없는 순수 에디터                                                                                 |
| 2   | Document 읽기/쓰기      | `useEditor`(`getDocument`/`replaceDocument`, `revision`/`changedBlockIds`) | JSON 왕복만, io 변환은 범위 밖                                                                        |
| 3   | Formatting toolbar      | `FormattingToolbar`                                                        |                                                                                                       |
| 4   | Link toolbar            | `LinkToolbar`                                                              |                                                                                                       |
| 5   | Slash menu              | `SlashMenu`(+ `SlashMenuCustomItem`)                                       | 커스텀 아이템 등록 예제 포함                                                                          |
| 6   | File panel              | `FilePanel`                                                                |                                                                                                       |
| 7   | Media                   | `MediaToolbar` + `MediaResizeHandles`                                      | 업로드는 `apps/demo`의 `demoUploadFile`(app.tsx) mock 패턴 재사용 — 파일명 기반 성공/실패 결정적 분기 |
| 8   | Emoji picker            | `EmojiPicker`                                                              |                                                                                                       |
| 9   | Dictionary override     | `useDictionary`                                                            | `color.*`/`menu.*`/`slashMenu.*`/`blockType.*` 네임스페이스(EXT-009) 실사용 예                        |
| 0   | 전체 조합(Kitchen sink) | 위 전부 동시 장착                                                          | 대표 예제. `apps/demo`의 현재 구성과 동급                                                             |

사이드바는 이 순번을 4개 섹션으로 묶어 표시한다: **Composite**(0) / **Basics**(1-2) / **Toolbars & Menus**(3-6) / **Media & Extras**(7-9). Composite는 최상단에 고정한다.

관찰 가능한 상태(문서 revision, 에러/경고, 사용자 조작의 성공·실패 결과 등)를 만들어내는 예제는 그 상태를 화면에 노출한다 — 에이전트가 상호작용 결과를 브라우저에서 관찰할 수 있어야 한다는 §1의 목적 3을 만족하기 위한 작성 규칙이다. `EditorProvider`+`EditorContent`만으로 끝나는 순수 렌더 예제(예: Minimal editor)처럼 애초에 노출할 상태가 없는 경우까지 인위적인 상태 표시를 얹지 않는다 — 이 규칙은 "상태가 있으면 숨기지 않는다"이지 "모든 예제에 상태 표시 UI를 붙인다"가 아니다(2026-09-08 구현 중 정정).

## 5. 소스 패널 메커니즘

`page.tsx`가 같은 파일을 두 방식으로 import한다.

```ts
import Example from "./example.tsx"; // 라이브 렌더용 — tsc/eslint 검증 대상
import exampleSource from "./example.tsx?raw"; // 표시용 원문 문자열 — 별도 사본 아님
```

`?raw`는 Vite 내장 기능. 별도 문자열 사본이 없으므로 `example.tsx`를 고치면 라이브 데모와 표시되는 소스가 항상 함께 바뀐다 — 드리프트가 구조적으로 불가능하다(2026-09-08 브레인스토밍에서 확인한 사용자 요구사항: "소스코드가 변경된 문법 체크가 가능하다면 추가").

타입 지원을 위해 `tsconfig.json`에 `"types": ["vite/client"]` 추가(`*.tsx?raw` 모듈 선언).

하이라이팅은 `prism-react-renderer`를 쓴다 — 동기 렌더링(워커·WASM 불필요), React 통합 간단, 번들 가볍다. Shiki 대비 정확도는 낮지만 비동기 로딩·테마 번들 관리 비용이 이 규모엔 과하다.

## 6. 스타일과 브라우저 타겟

- 라이브 데모 영역은 `@cp949/geul-react`가 배포하는 컴파일된 스타일(`dist/styles.css`)을 그대로 import — 실제 소비자가 보는 모습 그대로 재현한다.
- 쇼케이스 셸(사이드바·레이아웃·소스 패널)은 CSS Modules로 분리한다. `apps/demo/src/app.css`처럼 unlayered 전역 클래스를 쓰면 데모에서 이미 관측된 문제(전역 CSS가 패키지 스타일과 이름 충돌, `e2e/tailwind-migration.spec.ts`가 그 회귀를 가드)를 셸에서 재현할 위험이 있다. Modules는 클래스명이 자동 스코프되어 셸 스타일과 라이브 데모 스타일이 양방향으로 새지 않는다.
- Chrome75 재현 책임은 `apps/demo`가 전담(ADR-0009). showcase는 최신 evergreen 브라우저만 타겟한다 — `core-js/stable` 첫 import 계약도, `vite.config.ts`의 chrome75 downlevel 타겟 설정도 필요 없다.

## 7. 테스트/CI 방침

최초 도입 시점엔 자동 **e2e** 회귀 게이트(`pnpm test:e2e`, Playwright)에 넣지 않는다 — 품질 검증은 §1 목적 3대로 에이전트의 직접 조작에 맡긴다.

`pnpm verify`가 이미 실행하는 워크스페이스 전역 태스크(`turbo run build`/`typecheck`, `pnpm test`의 vitest 스위트, `pnpm check:boundaries`/`check:licenses`, `pnpm lint`/`format:check`)는 다른 workspace 패키지와 동일하게 `apps/showcase`도 자동으로 편입된다 — turbo·vitest·eslint 설정이 패키지 이름을 가리지 않고 대상을 도출하는 구조라 별도 배선이 필요 없고, 막을 이유도 없다(2026-09-08 구현 중 정정 — 초안은 "pnpm verify에 편입하지 않는다"고 썼으나 실제로 막은 건 e2e뿐이었다).

주된 품질 검증 수단은 에이전트가 claude-in-chrome 등으로 직접 조작하며 타이밍성·상호작용성 UX 결함을 찾는 것이다(§1 목적 3) — Playwright 단언으로는 "렌더된다"만 확인되고 "사람이 실제로 조작 가능한 타이밍인가"는 확인되지 않는다.

`apps/demo`의 `tests/demo-polyfill-entry.test.ts` 같은 정적 계약 가드는 showcase엔 해당하지 않는다 — core-js 계약 자체가 없다(§6).

자동 e2e 게이트 추가 여부는 이 스펙의 결정 사항이 아니다 — 필요성이 드러나면 별도 후속 결정으로 다룬다(§8).

## 8. 저장소 영향(구현 계획에 반드시 포함)

1. **`tests/workspace-boundaries.test.ts`의 `allowedDependencies`에 `"apps/showcase"` 항목 신규 등재 필수** — 없으면 "열거된 workspace 패키지 전량이 등재돼 있다" 테스트가 하드 실패한다. 예상 의존성: `@cp949/geul-react`, `@cp949/geul-model`(workspace:*), `react`, `react-dom`, `react-router`, `prism-react-renderer`.
2. `docs/adr/0002-enforce-layered-package-boundaries.md`의 의존 방향 문장("demo -> react, io, model")에 `showcase -> react, model` 추가.
3. `README.md`의 아키텍처 목록(`apps/demo: ...` 줄)에 `apps/showcase` 한 줄 추가.
4. `pnpm-workspace.yaml`(`packages: - apps/*`)과 `turbo.json`(태스크가 이름 기반이 아니라 전 패키지 공통 적용)은 변경 불필요.

## 9. 미결 사항

- **공개 배포 여부**: 지금은 로컬 dev 전용으로 시작한다. GitHub Pages 등 공개 배포는 이 스펙 밖 — 구조(정적 빌드 산출물, URL 라우팅)는 나중에 배포해도 되게 짜지만, 배포 파이프라인 자체는 다루지 않는다.
- **자동 e2e 게이트 도입 시점**: §7에서 명시한 대로 이 스펙에서 결정하지 않는다.
- **`apps/demo`의 사이드 메뉴 타이밍 버그**: 이 스펙과 별개로 이슈 등록이 필요하다 — 이 스펙 구현 중에 고치지 않는다.
