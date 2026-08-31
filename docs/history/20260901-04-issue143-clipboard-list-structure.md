# Issue #143 클립보드 목록 구조 보존

## 목표

클립보드 붙여넣기 경로 (b)(표 혼합 클립보드)와 (c)(PM 기본 붙여넣기 폴백)에서 외부 HTML 목록 구조(마커 타입·중첩 계층·`ol[start]`, 목록 항목 안에 중첩된 표 포함)를 (a)(전체 문서 Import HTML)와 동등하게 보존한다.

## 확정 커밋

- `06cd986` — clipboard 표 혼합 경로(b)에서 ul/ol 목록 구조를 보존한다
- `5003c03` — core 소비 레이어가 클립보드 목록 항목을 에디터 문서에 삽입한다
- `1c85df3` — PM 기본 붙여넣기 폴백에서도 외부 ul/ol 목록 구조를 보존한다
- `9160ed9` — 트랙-6 결함 탐지: 클립보드 목록 붙여넣기 두 경로의 모델↔에디터 desync 크래시를 막고 포맷을 정정한다

## 변경한 계약과 파일

- `@cp949/geul-io`의 `ClipboardContentBlock`(`packages/io/src/clipboard/clipboard-content.ts`)에 목록 variant를 추가했다 — 표 혼합 클립보드가 목록을 파싱해 반환한다(이전엔 `paragraph|heading|table` 닫힌 union). 파싱은 신규 `packages/io/src/html/list-block-builder.ts`(clipboard 전용 독립 모듈, `import-html.ts`의 `splitListItemChildren` 정책을 복제)가 담당한다.
- `core`가 확장된 union을 소비해 표 혼합 클립보드 붙여넣기 시 실제 에디터 문서에 목록 PM 노드 트리를 삽입한다(`packages/core/src/table-paste-sequence.ts`, `table-paste-commands.ts`).
- PM 기본 붙여넣기 폴백 경로는 신규 `packages/core/src/list-paste-fallback-extension.ts`(`handlePaste` 가로채기)로 목록 구조를 보존한다. 계획 시점 설계(`parseHTML` 개방)는 중첩 목록에서 ProseMirror `ContentMatch.findWrapping`이 항상 최단 경로(평탄화)를 택해 구조적으로 실패함을 구현 중 실측 확인해 재설계했다.
- `MAX_NESTING_DEPTH`(64) 초과 입력을 대상 위치 깊이 + slice 내부 목록 중첩 높이 합산 기준으로 예외 없이 평탄화한다.
- `block-segmenter.ts`(io)·`production-editor-assembly.ts`(core)의 낡은 주석을 실제 동작과 일치하게 정정했다.
- 트랙-6 결함 수정: 경로(b)의 목록 중첩 깊이 미검증, `ol[start]` model 범위(0~999,999,999) 밖 값 미검증 — 둘 다 dispatch 후 model↔editor가 영구 desync되는 crash였다. 경로(b)는 거절(`CLIPBOARD_CONTENT_INVALID`), 경로(c)는 기존 처리(explicit start 없음으로 접음)를 확장하는 정규화로 각자의 기존 아키텍처를 그대로 따라 막았다 — 통일하지 않은 의도적 선택이다.
- 신규 런타임 의존성, 패키지 경계 변경, ADR-0002 갱신 없음.

## 검증

- 트랙-5(누락 탐지): 완료 체크리스트 15개 항목 전부 `PASS`, `FAIL`·`BLOCKED` 0건.
- 트랙-6(결함 탐지, Full 3리뷰어): BLOCKER 2건(모델↔에디터 desync crash) 수정·검증, MINOR 2건은 범위 밖 제품 결정 필요로 별도 이슈 분리, 부수로 DELTA-03 시점부터 있던 사전 tsc 에러(공식 `typecheck` 스크립트 누락 경로) 1건과 prettier 포맷 불일치 1건도 같은 트랙에서 정정.
- `pnpm --filter @cp949/geul-core test` 66 files / 944 tests, `pnpm --filter @cp949/geul-io test` 44 files / 382 tests `PASS`.
- `pnpm verify` 전량: lint·format:check·build·check:escompat·typecheck(turbo+configs/e2e/tests/scripts)·test 165 files/2075 tests·check:boundaries·check:licenses·test:e2e(chromium) 115 tests 전부 `PASS`.
- 재그룹화 경계: DELTA-01(io 단독) 그룹까지 `@cp949/geul-io` typecheck `PASS`. DELTA-02 그룹 추가 후 `@cp949/geul-core` typecheck `PASS`. DELTA-03 그룹 추가 시점엔 `list-paste-fallback.test.ts`의 discriminated union 미narrowing으로 `@cp949/geul-core` typecheck 5건 실패(트랙-6이 이미 문서화한 사전 결함, F5) — 트랙-6 결함 수정 그룹을 합친 최종 tip에서 두 패키지 모두 typecheck `PASS`로 해소 확인. 최종 원본 tree diff는 빈 출력.

## 상태와 남은 제한

- Issue #143 완료 댓글: `https://github.com/cp949/geul/issues/143#issuecomment-5485710579`. 완료 기준 3개(3경로 목록 동작 결정·문서화, 회귀 테스트 최소 1건 이상 — 실제 11건, 낡은 주석 정정) 전부 충족해 이슈를 닫았다.
- 후속 이슈 2건 등록: `#145`(Import HTML의 blockquote 중첩 표 조상 마크 미전파 회귀), `#146`(`list-paste-fallback-extension.ts`의 `targetDepth` off-by-one, 안전한 방향 과대계산이라 crash 없음). 둘 다 이 작업 범위 밖 제품·설계 결정이 필요해 미착수 상태로 남겼다.
- 경로(b)·(c)의 `ol[start]` 범위 밖 값 처리 방식(거절 vs 정규화)이 서로 다르다 — 각자의 기존 아키텍처를 따른 의도적 선택이며 완료 댓글에 명시했다.
- push·tag·PR·`dev -> main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 4개와 이 이력 커밋을 `dev`에서 역순으로 `git revert`한다.
