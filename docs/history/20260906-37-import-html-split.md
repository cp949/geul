# import-html.ts 책임별 파일 분리

- 레인: qq-workflow (사용자 지시)
- 대상 이슈: 없음
- 작업 폴더: `_works/20260906-02-import-html-split/`(gitignore, 저장소에는 남지 않음)
- 확정 커밋: `1a52232`(dev, `refactor(io): import-html.ts 책임별 파일 9개로 분리`)

## 목표

`packages/io/src/html/import-html.ts`(1839줄)를 동작 변경 없이 책임별 파일로 분리해 파일당 인지 부하를 줄인다. 최근 `editor-controller.ts` 6분리(`cc140c8`)와 같은 계열의 내부 구조 리팩터.

## 바꾼 계약과 파일

신규 파일 8개 + 축소된 진입점(순수 이동, 로직 변경 없음):

- `import-html-sanitize-schema.ts` — document-import 전용 sanitize schema
- `import-html-helpers.ts` — 텍스트·id·TextBlockProps leaf 유틸리티
- `import-html-table.ts` — `parseTable`과 header 추론
- `import-html-list.ts` — production 목록류 마커 판별과 블록 생성
- `import-html-media.ts` — 4종 미디어 블록 판별과 디코드
- `import-html-segment-policy.ts` — `importBlockSegmentPolicy`와 heading 레벨 표
- `import-html-wrappers.ts` — children/details wrapper 구조 판정
- `import-html-blocks.ts` — `blocksFromSegments`/`blocksFromNodes`/`blocksFromListItem`/`blocksFromListElement`/`documentFromRoot` 상호재귀 클러스터
- `import-html.ts` — 1839줄 → 109줄, `importHtml` 진입점만 남음

`packages/io/src/index.ts`의 공개 export는 변경하지 않았다.

**계획 중 판단(Ruling-01)**: 최초 파일 배정대로 나누면 순환 import가 2건(`blocks.ts↔list.ts`, `segment-policy.ts↔wrappers.ts`) 생기는 것을 구현 subagent가 파일 생성 전에 발견해 보고했다. 메인 세션이 원본 호출 그래프를 직접 grep 대조로 검증하고 `blocksFromListItem`/`blocksFromListElement`를 `import-html-blocks.ts`로, `headingLevelByTagName`을 `import-html-segment-policy.ts`로 재배정해 순환 없는 단방향 DAG로 정리했다. 완료 조건의 실질은 바뀌지 않아 사용자 확인 없이 메인 세션이 판정했다(계획서 01-계획.md "## 결정" 참고).

## 실행한 검증과 결과

- `pnpm --filter @cp949/geul-io test` — 73 files / 656 tests pass
- `pnpm --filter @cp949/geul-io typecheck` — pass(복합 스크립트 `tsc -p tsconfig.json && tsc -p tsconfig.test.json` 그대로 실행, PIT-0038 준수)
- `pnpm --filter @cp949/geul-io build` — pass
- 단계-3 결함 탐지(읽기 전용 subagent, 계획 문서 비공개) — 발견 0건. `importHtml` 함수 본문이 원본과 byte-identical임을 diff로 확인
- 병합 직전 `pnpm build`, `pnpm check:escompat`, `pnpm typecheck`(전 패키지 + configs/e2e/tests/scripts), `pnpm test`(258 files / 3288 tests), `pnpm check:boundaries`, `pnpm check:licenses` — 전부 pass
- `pnpm run format:check` — 30개 파일 실패. `dev`에서 동일 명령을 실행해 같은 30개 파일·같은 목록임을 대조 확인 — 이 변경과 무관한 기존 baseline 실패(최근 `editor-controller.ts` 분리 커밋도 같은 30건을 baseline으로 확인한 바 있음). 다만 신규 파일 중 `import-html-media.ts` 1건은 이번 변경이 새로 만든 포맷 위반이었다(3개 이상 named import 줄바꿈 누락) — `pnpm exec prettier --write`로 그 파일만 수정하고 같은 커밋에 amend, 재검증으로 baseline 30건과 정확히 일치함을 재확인했다.
- **`pnpm test:e2e`(chromium) 미실행 — 사용자가 이 실행에서 명시적으로 생략을 지시함**("e2e 테스트는 생략해"). 순수 구조 이동이고 io 패키지 unit test 전량과 전 패키지 typecheck/build/전체 unit test가 이미 통과해 회귀 위험은 낮다고 판단했지만, e2e 자체는 실행하지 않았다는 사실을 여기 명시한다.

## 남은 제한

- e2e(chromium) 회귀는 이번 병합에서 실행하지 않았다. 후속에서 필요하면 별도로 `pnpm test:e2e --project=chromium` 실행을 권한다.
- 작업 중 첫 구현 시도가 순환 조사 과정에서 `docs/research/2026-09-07-file-dependency-cycles.md`(G-PRC-001 위반 — 저장소 안 조사 문서)를 남겼다. 메인 세션이 발견해 `_works/20260906-02-import-html-split/pending-guides/01-순환의존-예방-제안.md`로 옮기고 원 위치를 삭제했다. 내용은 패키지 내부 파일 import에 폴더 계층 규칙과 `dependency-cruiser` cycle 게이트 도입을 제안하는 초안이다 — 새 외부 devDependency를 전제해 이번 작업에서 등록·승격하지 않았다(AGENTS.md "새 런타임 의존성이 필요하면 추가 전에 필요성과 라이선스 영향을 사용자에게 알린다"). 사용자가 검토를 원하면 그 파일을 참고한다.
- 등록한 이슈 없음 — 이번 작업은 순수 구조 리팩터이고 제품 동작·게이트 구멍·거짓 통과를 드러내지 않아 issue-tracker.md "등록 기준"을 통과하는 발견이 없었다.
