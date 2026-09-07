# Issue #156 슬라이스11 RD-002 DELTA-01 — dictionary 배선 인프라(core readback + EditorProvider threading + react hook)

## 목표

RD-002(react 문구 추출 + override 배선, `EXT-009`)의 첫 DELTA. readiness probe(2026-09-08)에서 최초 실측치("48건")가 부정확함을 발견했다 — 정정된 실측은 구조적 UI 문구 214건(19개 파일) + `emoji-picker-options.ts` 이모지 label 564건(별도 이월) + aria-label/title 노출 표면 79건(리터럴 63건 + `IconButton` 간접 16건)이다. 이에 따라 RD-002를 8개 네임스페이스(`toolbar`/`menu`/`slashMenu`/`blockType`/`color`/`codeLanguage`/`handle`/`error`·`status`) 기준으로 재계획했다(이후 진행 중 `toolbar.*`가 media/filePanel과 link/tableSelection/blockSelection/formatting 2개 DELTA로 다시 분할돼 최종 10개 DELTA로 완료).

이 DELTA는 그 재계획 전체가 딛고 설 공통 배선 인프라를 완성한다: core `EditorController.getDictionary()` 신설(construction-time readback, 기존 `isUploadEnabled()`와 동일 자리 — `EditorProvider`의 "external"/"internal" 모드 어느 쪽이든 react가 활성 dictionary를 읽는 유일한 경로), `EditorProvider`의 `dictionary` prop → core `CreateEditorOptions.dictionary` threading(기존 R4 확장성 옵션 7개와 동일 패턴, 마운트 시점 고정), react `useDictionary()` hook. 최소 실증으로 `editor-content.tsx`의 "Editor" aria-label 1건을 이 배선으로 옮겼다(나머지 213건은 후속 DELTA 소관).

## 확정 커밋

- `b2f9cde` — feat(core,react): dictionary override 배선 인프라(EXT-009) 완성

## 변경한 계약과 파일

- `packages/core/src/dictionary.ts` — `Dictionary.editor.ariaLabel` 네임스페이스 추가(`DEFAULT_DICTIONARY.editor.ariaLabel = "Editor"`, 기존 하드코딩 값과 동일 — 회귀 없음).
- `packages/core/src/editor-controller-types.ts`/`editor-controller.ts` — `EditorController` interface에 `getDictionary(): Dictionary` 추가, controller facade에 delegate 구현.
- `packages/core/src/production-editor-session.ts` — `getDictionary()` 구현(`this.options.dictionary ?? DEFAULT_DICTIONARY`).
- `packages/react/src/use-editor.ts` — `useDictionary(): Dictionary` hook 추가.
- `packages/react/src/editor-provider.tsx` — 판별 유니온 양쪽 분기에 `dictionary` 필드 추가(external 분기: `never`, internal 분기: `CreateEditorOptions["dictionary"]`), `configuration`에 반영, `createEditor()` 호출에 조건부 스프레드로 전달.
- `packages/react/src/editor-content.tsx` — `aria-label="Editor"` 리터럴을 `useDictionary().editor.ariaLabel`로 치환.
- `packages/react/src/index.ts` — `useDictionary` 공개 export 추가.
- `packages/react/test/editor-provider-extensibility.test.tsx` — `dictionary(EXT-009)` describe 블록 추가.
- `packages/react/test/fake-editor-provider.tsx` — readiness probe에서 못 본 함정이 실측으로 드러남: `withProvider`(76개 호출부 공용) 최소 fake 컨트롤러가 `<EditorContent />`의 신규 `useDictionary()` 호출로 150개 테스트·10개 파일이 깨졌다. 새 객체 스프레드 대신 `mutable.getDictionary ??= () => DEFAULT_DICTIONARY` **제자리 변형(in-place mutation)**으로 참조 동일성 계약(`fake-editor-provider.test.tsx`의 `toBe` 단언)과 새 기본값 제공을 동시에 만족시켜 해결.

## 검증

- `pnpm --filter @cp949/geul-core build` exit 0.
- `pnpm --filter @cp949/geul-react test` 575 passed — "Editor" aria-label이 다수 기존 테스트의 셀렉터라 회귀 탐지 범위가 이 파일 하나가 아니어서 패키지 전체를 돌렸다.
- `pnpm --filter @cp949/geul-react build` exit 0.
- core/react `typecheck` exit 0, eslint/prettier 전부 clean.

## RD-002 진행 상태

DELTA-01 완료. 완료 조건 "`EditorController.getDictionary()`가 공개 API로 존재하고 `EditorProvider`가 `dictionary` prop을 core로 threading한다" 충족(증거: 위 검증). 남은 것은 DELTA-02~10(8개 네임스페이스, 구조적 문구 213건).

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스11)가 미완료라 슬라이스1~10 전례대로 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- 이 DELTA 범위(배선 인프라 + "Editor" aria-label 1건)는 완전히 검증됨. 나머지 213건(구조적) 문구는 후속 DELTA(RD-002-DELTA-02~10) 소관.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert b2f9cde`. 위험: 중간 — 공유 테스트 fake(`fake-editor-provider.tsx`, 76개 호출부)를 제자리 변형으로 수정한 변경이 포함돼 있고, 이후 9개 DELTA 전부가 이 커밋의 `getDictionary()`/`useDictionary()` 배선을 그대로 재사용한다 — 단독 revert 시 이후 커밋들이 참조하는 hook·메서드가 사라져 빌드가 깨진다(체인을 최신 커밋부터 역순으로 revert해야 안전).
