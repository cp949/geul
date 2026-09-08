# Issue #162 BLK-017 RD-002 DELTA-01 — `EditorProvider` `syntaxHighlighter` threading

## 목표

RD-002의 첫 DELTA. `packages/react`의 `EditorProvider`가 RD-001이 만든
core의 `CreateEditorOptions.syntaxHighlighter`를 그대로 받아
`createEditor()`로 전달하게 한다(RD-002 완료 조건 1). `codeBlockLanguages`
옵션·언어 콤보박스 갱신은 DELTA-02 범위다.

## 확정 커밋

- `f1d73d6` — feat(react): EditorProvider가 syntaxHighlighter 옵션을
  core로 threading

## 변경한 계약과 파일

- `packages/react/src/editor-provider.tsx`:
  - `EditorProviderProps`의 `editor` 외부소유 분기에 `syntaxHighlighter?: never;`
    추가(기존 `dictionary?: never;` 등과 동일한 discriminated union 계약).
  - 내부소유 분기에 `syntaxHighlighter?: CreateEditorOptions["syntaxHighlighter"];`
    추가 — `dictionary`/`attributeOverrides`와 같은 마운트 시점 고정
    패턴(아래 "결정" 참고).
  - `configuration`(useState 초기화자)과 `createEditor()` 호출부에
    `dictionary`와 동일한 `...(x === undefined ? {} : {x})` 관용구로
    threading.
- `packages/react/test/editor-provider-extensibility.test.tsx` — 새
  `describe("EditorProvider — syntaxHighlighter(BLK-017)")` 블록에 두
  characterization 추가: 연결 시 강조 span 렌더, 미연결 시 plain
  text(무회귀). core의 `code-block-highlight-extension.test.ts`(RD-001)와
  동형 fixture(`{from,to,className}`, `code span.<class>` selector).

## 결정 — 마운트 시점 고정(latest-ref 아님)

`RD-002.md` 최초본이 "마운트 시점 고정 또는 latest-ref 혼합 중 적합한
쪽을 DELTA에서 판단"으로 남겨 둔 것을 이 DELTA가 확정했다. core의
`code-block-highlight-extension.ts`(`createParserFromHighlighter`)는
`syntaxHighlighter` 함수를 `addProseMirrorPlugins()` 호출 시점에 한 번
캡처해 Tiptap `Extension.configure()` 옵션 값으로 박는다 —
`uploadFile`/`onChange`처럼 매 호출마다 `ref.current`를 다시 읽는 래퍼가
core 안에 없다. core 자신이 이미 "마운트 시점 값만 쓴다"는 계약이라,
react 쪽에서 latest-ref로 감싸도 core가 갱신을 반영할 길이 없다 —
`dictionary`와 동일하게 마운트 시점 고정을 택했다. 근거는
`RD-002.md` "## 결정"에도 기록했다.

## 검증

- RED: `syntaxHighlighter`를 넘겨도 강조 span이 렌더되지 않아
  `연결하면 지정한 오프셋 범위에 강조 span이 렌더된다` 테스트 실패
  확인(threading 미구현 상태).
- GREEN: `pnpm --filter @cp949/geul-react test` 45 files/624 tests
  passed(회귀 0건, 신규 2건), `typecheck`/`build` exit 0, `pnpm lint`
  clean, `pnpm check:boundaries`("14 public core declarations" — 새
  export 없음, 회귀 확인용).
- 검출력 검증(돌연변이): `createEditor()` 호출부의 `syntaxHighlighter`
  스프레드 가드를 제거 → "연결하면..." 테스트만 실패 확인 → 원복,
  전체 GREEN 재확인.
- 재조립(ff-workflow "재그룹화 실행 명령"): 단일 커밋, 그룹 1개,
  `git diff <pre-squash> <tip> --stat` 빈 출력으로 무결성 확인, `dev`에
  `--ff-only` 병합 성공.

## RD-002 진행 상태 — `ACTIVE`

완료 조건 1(`syntaxHighlighter` threading) 충족 — 증거: 위 GREEN 검증,
`editor-provider-extensibility.test.tsx`의
`EditorProvider — syntaxHighlighter(BLK-017)` 두 테스트. 완료 조건
2·3(`codeBlockLanguages` + 콤보박스, 자유 입력 회귀 없음)은 DELTA-02
몫으로 남는다. 다음 DELTA: DELTA-02(`codeBlockLanguages` 옵션 정의 +
`code-block-language-combobox.tsx` 갱신).

## 등록한 이슈

없음. 이 DELTA와 무관하게 `dev` HEAD에서 `pnpm format:check`가 이미
실패 상태(9개 파일, 순수 서식 드리프트)임을 검증 중 발견해
`_works/roadmap/pending-issues/02.md`에 미등록 초안으로만 남겼다 — 이
DELTA가 건드리지 않는 파일들이라 범위 밖으로 판단해 지금 함께 고치지
않았다. 등록 여부는 사용자 지시를 기다린다.

## 게시

없음 — roadmap 전체(RD-001~003)가 미완료라 Issue #156 슬라이스 전례대로
통합 완료 시점에 한 번만 Issue #162에 게시한다.

## 남은 위험

- RD-002-DELTA-01 범위 안에서는 없음.
- (참고, 이 DELTA 밖) `dev` HEAD의 `pnpm format:check` 실패 9개 파일 —
  위 "등록한 이슈" 참고, `_works/roadmap/pending-issues/02.md`.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert f1d73d6`. 위험: 낮음 — 이 커밋은 `EditorProvider`에 옵션
하나를 추가만 했을 뿐(기존 threading 로직·다른 옵션을 변경하지 않음),
단독 revert가 다른 커밋에 영향을 주지 않는다.
