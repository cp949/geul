# Issue #162 BLK-017 RD-002 DELTA-02 — `codeBlockLanguages` + 언어 콤보박스 갱신(RD-002 DONE)

## 목표

RD-002의 두 번째이자 마지막 DELTA. spec §6의 `CodeBlockLanguageOption`/
`codeBlockLanguages` 공개 계약을 `packages/react`에 신설하고,
`code-block-language-combobox.tsx`가 그 값으로 후보 목록을 완전
교체하도록 갱신한다. 이 DELTA로 RD-002 완료 조건 1~3 전부가 충족돼
RD-002가 `DONE`이 됐다.

## 확정 커밋

- `a7ec864` — feat(react): codeBlockLanguages 옵션 + 언어 콤보박스
  완전 교체 지원

## 변경한 계약과 파일

- 신규 `packages/react/src/code-block-language-option.ts`: 공개 타입
  `CodeBlockLanguageOption`(`id`/`label`/`aliases?`, spec §6 그대로),
  비공개 `CodeBlockLanguagesContext`(React Context)와 내부 훅
  `useCodeBlockLanguages()`.
- `packages/react/src/editor-provider.tsx`: `EditorProviderProps`에
  `codeBlockLanguages?: readonly CodeBlockLanguageOption[]`를 discriminated
  union의 두 분기(외부소유 `editor`/내부소유) **공통** 필드로 추가
  (`(A | B) & C` 타입 구성) — 다른 8개 옵션과 달리 외부소유 분기에서도
  `never`로 막지 않는다. `EditorProvider` 본문이 매 렌더
  `props.codeBlockLanguages`를 `CodeBlockLanguagesProvider`로 그대로
  흘린다(`configuration`/useState를 거치지 않는 reactive threading).
- `packages/react/src/code-block-language-combobox.tsx`: 내부
  `LanguageOption`(`id`/`language`/`label`/`aliases`)을 없애고 공개
  `CodeBlockLanguageOption`을 그대로 쓴다 — `id`가 committed language
  값을 겸한다(기존 `id`/`language`는 12개 항목 전부에서 항상 같은
  값이었다). `useCodeBlockLanguages()` 결과가 있으면 그 값을, 없으면
  기존 기본 12개(`DEFAULT_LANGUAGE_OPTIONS`, 개명만)를 쓴다.
- `packages/react/src/index.ts`: `CodeBlockLanguageOption` 타입 공개
  export 추가.
- `packages/react/test/mount-editor.tsx`(공용 test-support,
  G-TST-002): `MountBlockEditorOptions.codeBlockLanguages` 추가,
  `mountBlockEditor()`가 `EditorProvider`의 `editor`(외부소유) prop과
  함께 `codeBlockLanguages`를 threading — `dictionary`와 달리
  `createEditor()`가 아니라 `EditorProvider` prop 경로로 흘린다(아래
  "결정" 참고).
- `packages/react/test/code-block-language-combobox.test.tsx`: 완전
  교체·미지정 시 기본 12개 유지·자유 입력 무회귀 3개 characterization
  추가.

## 결정 — 두 분기 공통 필드 + reactive threading(계획 시점 미확정을 이 DELTA가 확정)

`RD-002.md` 최초본은 `codeBlockLanguages`의 소유 분기·threading 방식을
명시하지 않았다(spec §6도 `EditorProviderProps`에 필드 하나만 정의할
뿐 분기·reactivity는 규정하지 않는다). 이 DELTA가 실측으로 확정했다.

- **분기**: `packages/react/test/mount-editor.tsx`의 `mountBlockEditor`/
  `mountTableEditor`(콤보박스의 유일한 기존 test harness)가 예외 없이
  `<EditorProvider editor={editor}>`(외부소유)로 마운트함을 실측 —
  `codeBlockLanguages`를 다른 8개 옵션처럼 내부소유 전용(`never`)으로
  막으면 이 기존 harness로 테스트할 수 없다. `codeBlockLanguages`는
  `createEditor()`에 전혀 관여하지 않는 순수 렌더 목록이라(다른 8개가
  `never`인 이유인 PM 스키마 재구성 비용이 여기엔 없다) 소유 방식과
  무관하게 허용하기로 했다.
- **reactive**: 같은 이유로(구성 비용 없음) 마운트 시점에 얼릴 이유가
  없어 매 렌더 반영되게 했다.
- **`id`가 `language`를 흡수**: spec §6 타입에 `language` 필드가 없다
  — 기존 내부 `id`/`language`가 12개 항목 전부에서 항상 같은 값이었기
  때문에 하나로 합쳤다.

두 결정 모두 `RD-002.md` "## 결정"에 근거와 함께 기록했다.

## 검증

- GREEN: `pnpm --filter @cp949/geul-react test` 45 files/627 tests
  passed(회귀 0건, 신규 3건), `typecheck`/`build` exit 0, `pnpm lint`
  (변경 파일 대상) clean, `pnpm check:boundaries`("14 public core
  declarations" — 새 export는 `packages/react`뿐, PM 타입 아님).
- 검출력 검증(돌연변이) 2건:
  - `languageOptions = configured ?? DEFAULT`를
    `[...DEFAULT, ...(configured ?? [])]`(병합)로 바꾸면 "완전 교체"
    테스트가 14개 옵션을 받아 실패 확인 → 원복.
  - `commit(option.id)`를 `commit(option.label)`로 바꾸면 "option.id가
    그대로 commit된다" 테스트와 기존 "option click은 canonical
    language를 commit한다" 테스트가 함께 실패 확인(표시 라벨이 committed
    language로 잘못 저장) → 원복.
- 재조립(ff-workflow "재그룹화 실행 명령"): 단일 커밋, 그룹 1개,
  `git diff <pre-squash> <tip> --stat` 빈 출력으로 무결성 확인, `dev`에
  `--ff-only` 병합 성공.

## RD-002 진행 상태 — `DONE`

완료 조건 1~3 전부 충족(재대조):

1. `syntaxHighlighter` threading — DELTA-01(`f1d73d6`).
2. `codeBlockLanguages` 완전 교체/미지정 시 기본값 유지 — DELTA-02(이
   문서), 증거: "지정하면 후보 목록이 완전 교체되고..."·"미지정 시
   기존 기본 12개가 그대로 유지된다..." 테스트.
3. 자유 입력 회귀 없음 — DELTA-02(이 문서), 증거: "codeBlockLanguages를
   지정해도 목록에 없는 값 직접 입력은 그대로 commit된다..." 테스트.

RD-002를 `DONE`으로 전환한다. 다음은 RD-003(showcase 예제 5개 + README
+ 문서 갱신) readiness probe — 진입 조건("RD-002의 `EditorProvider`
옵션 threading이 `dev`에 존재")이 이제 충족됐다.

## 등록한 이슈

없음(신규). `pending-issues/02.md`(`dev`의 `pnpm format:check` 기존
실패, DELTA-01에서 발견)는 여전히 미등록 상태로 남아 있다 — 이 DELTA와도
무관해 함께 처리하지 않았다.

## 게시

없음 — roadmap 전체(RD-001~003)가 미완료라 Issue #156 슬라이스 전례대로
통합 완료 시점에 한 번만 Issue #162에 게시한다. RD-002 `DONE`은 RD-003이
남아 있어 아직 게시 시점이 아니다.

## 남은 위험

- RD-002 범위 안에서는 없음.
- (참고, RD-002 밖) `dev`의 `pnpm format:check` 실패 9개 파일 —
  `pending-issues/02.md` 참고, 등록 여부는 사용자 지시 대기.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert a7ec864`. 위험: 낮음 — 이 커밋은 `packages/react`에 새
옵션·타입·Context를 추가만 했고(기존 콤보박스 표시·commit 동작은
내부 필드명만 바뀌었을 뿐 동작은 무회귀로 테스트가 고정), 단독
revert가 DELTA-01(`f1d73d6`)이나 다른 커밋에 영향을 주지 않는다.
