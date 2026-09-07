# Issue #156 슬라이스11 RD-001 DELTA-01 — Dictionary 타입 인프라 신설 + core 문구 추출

## 목표

RD-001(Dictionary 타입 인프라, `EXT-009`)의 유일 DELTA. `Dictionary` 타입(`placeholder` 네임스페이스)을 신설하고 `CreateEditorOptions.dictionary?: Dictionary`로 override를 받게 배선한다(자동 딥 병합 없음, 소비자 스프레드 병합 — spec §8.1, 2026-09-06 사용자 승인). core 유일 하드코딩 지점인 `placeholder-extension.ts`의 영어 문구 5종(paragraph/heading/quote/codeBlock/listItem)을 key로 추출하고 기본(en) `DEFAULT_DICTIONARY`를 내장한다.

readiness probe(2026-09-08)에서 core 하드코딩 문구가 `placeholder-extension.ts` 하나뿐임을 확인해, 최초 계획의 DELTA-01(타입+배선)과 DELTA-02(추출+테스트)를 이 DELTA 하나로 합쳤다(`_works/roadmap/progress.md` readiness probe 기록).

## 확정 커밋

- `e339f90` — feat(core): i18n Dictionary 타입 신설, core placeholder 문구 override 배선

## 변경한 계약과 파일

- `packages/core/src/dictionary.ts`(신규) — `Dictionary` 타입 + `DEFAULT_DICTIONARY`(en) 상수.
- `packages/core/src/editor-controller-types.ts` — `CreateEditorOptions.dictionary?: Dictionary` 필드 추가(기존 R4 확장성 옵션 7개와 동일 자리·패턴).
- `packages/core/src/production-editor-session.ts`/`production-editor-assembly.ts` — `dictionary` 옵션을 `attributeOverrides`와 동일한 `...(x === undefined ? {} : {x})` 관용구로 배선, 미지정 시 `DEFAULT_DICTIONARY` 사용.
- `packages/core/src/placeholder-extension.ts` — 모듈 최상위 상수(`PARAGRAPH_PLACEHOLDER` 등)를 제거하고 `Extension.create<{ dictionary: Dictionary }>`로 전환, `addProseMirrorPlugins()` 클로저 안에서 `this.options.dictionary.placeholder`를 읽는다. `{level}` 토큰은 문자열 치환으로 처리.
- `packages/core/src/index.ts` — `Dictionary` 타입, `DEFAULT_DICTIONARY` 값을 공개 export.
- `packages/core/test/placeholder-extension.test.ts` — `dictionary` override로 paragraph·heading(`{level}` 토큰 포함) 문구가 실제로 바뀜을 검증하는 케이스 추가, 기존 5개 characterization 케이스는 dictionary 미지정 상태로 유지.

## 검증

- RED: override 케이스가 배선 전 항상 `DEFAULT_DICTIONARY` 기본값만 반환해 실패 확인.
- GREEN: `pnpm --filter @cp949/geul-core test` 1622 passed(회귀 0건), `pnpm --filter @cp949/geul-core build` exit 0, lint/format 통과(`progress.md` 기록).

## RD-001 진행 상태

DELTA-01(유일 DELTA) 완료로 RD-001 완료 조건 2개(`Dictionary` 타입 공개 API화 + `CreateEditorOptions.dictionary` override, core 문구 override 검증) 모두 충족 — RD-001 `DONE`. 다음은 RD-002(react 문구 추출 + override 배선) readiness probe.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스11)가 미완료라 슬라이스1~10 전례대로 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- result 문서(`_works/roadmap/result/RD-001-DELTA-01.md`)에 별도 "남은 위험" 기재 없음(이 DELTA는 "계획" 절만 남아 있고 "결과" 절이 없다 — 실제 완료·검증 수치는 `_works/roadmap/progress.md`의 RD 전환 기록으로 확인).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert e339f90`. 위험: 중간 — `placeholder-extension.ts`를 모듈 상수 방식에서 `Extension.create` 옵션 방식으로 구조 전환했고, 이후 11개 DELTA 전체가 이 커밋이 만든 `Dictionary` 타입 위에 네임스페이스를 계속 추가하며 쌓인다 — 이 커밋만 단독으로 revert하면 이후 커밋들의 `dictionary.ts` 확장이 충돌·컴파일 실패로 이어진다(체인을 최신 커밋부터 역순으로 revert해야 안전).
