# Issue #38 슬라이스 1 — 중첩 블록 모델 파운데이션 + 들여쓰기/내어쓰기 UI

- 작업: ff-workflow(트랙 0~8), 작업 브랜치 `feat/38-slice1-nested-block-foundation` → `dev` ff 병합
- 대상 이슈: #38 (R2 슬라이스 1 — `DOC-002`, `UI-006`)
- 확정 커밋: `f2fa7e4`(model) `7db6ead`(core 컨테이너 스키마·codec) `8f50f01`(위치·diff 재귀화) `20a7372`(커스텀 split) `45de1ee`(indent 명령·키보드) `56f4d7c`(io HTML) `39b86e5`(io GFM) `10c7524`(react 툴바) `eb886d3`(사전 테스트 정정) `b731576`(docs 인벤토리) `34df2a2` `53818cc` `cf0a637`(트랙-6 결함 수정) `42c489c`(주석 정리) — 원 26커밋을 의미 단위 14커밋으로 재그룹화

## 목표

중첩 블록을 1급 문서 구조로 도입한다 — model 재귀 타입·검증, PM 진짜 중첩 노드 트리, Tab/툴바 들여쓰기·내어쓰기, HTML 재귀 왕복, GFM 손실 계약.

## 바꾼 계약과 파일

- `model`: `Block` 공통 `children?: Block[]`(optional, `formatVersion` 1 유지), 검증 재귀화(표 전용 4종 포함), `MAX_NESTING_DEPTH=64` 초과 `DOCUMENT_LIMIT_EXCEEDED`, 표 블록 `children` 주입 `DOCUMENT_INVALID` 거절 — `schema.ts`, `types.ts`
- `core`: 신규 `blockContainer`/`blockGroup` 노드(표는 컨테이너 비포장 — "표는 자식 불가"를 content expression이 구조 강제), 재귀 PM↔모델 codec, 위치 프리미티브·`blockChanges` diff 재귀화, `indentBlock`/`outdentBlock`(+Tab/Shift+Tab, `isInTable` 가드), 커스텀 split(Enter)·join(Backspace/Delete) 커맨드. `deleteBlock` 하위 트리 동반, `moveBlockBefore`/`duplicateBlock`은 자식 딸린 블록 거절(D20, 완성은 #125)
- `io`: HTML export/import 재귀 wrapper 왕복, GFM `MarkdownLoss.kind`에 `NESTED_CHILDREN` 추가(공개 타입 확장 — strict 거부, lossy 평탄화+경고)
- `react`: 서식 툴바 들여쓰기/내어쓰기 버튼(core 명령 위임), `blockGroup` padding 시각 렌더링
- `docs`: 인벤토리 `DOC-002`/`UI-006` → `PARTIAL`, `current-status.md` 동기화

계획에서 달라진 승인 결정: D18·D19(flat 시퀀스+depth 속성 → 진짜 중첩 노드 트리 반전 — 계획 리뷰 10라운드 비수렴 원인 해소), D22~D24(Tiptap 기본 `splitBlock`이 컨테이너 스키마에서 완전 무동작으로 실측돼 커스텀 split 도입), D20(이동·복제만 거절, 삭제·뒤 삽입은 하위 트리 정합).

## 실행한 검증과 결과

- 트랙-6 종료 게이트 `pnpm verify` 전량 1회: `verify:packages` 전부 통과, e2e chromium 84/85 — 유일 실패는 이 슬라이스 무관 사전 결함(#131로 등록). focused 최종: model 158, core 507, io 234, react 253 GREEN.
- 트랙-5: 최종 체크리스트 72항목 전원 PASS. 트랙-6: BLOCKER 1·MAJOR 5·MINOR 4 발견·전부 수정(오탐 4건 근거 기각).
- 트랙-8: 재그룹화 그룹 경계 13곳 typecheck 통과(docs-only 1그룹은 코드 동일로 생략), 재조립 트리 diff 빈 출력 2회 확인 후 ff 병합.

## 등록한 이슈·댓글

- 신규 이슈: #127(spec §10 상반 문언), #128(roadmap §4 vs IO-007 PARTIAL 상충), #129(D21 split 계약 spec 영속화), #130(block-segmenter walk 무제한 재귀), #131(툴바 Shift+Tab Bold 미도달 — e2e 잔존 실패), #132(65단 HTML import 전면 거절 계약 결정), #133(툴바 indent 버튼 비활성 표시·연속 적용), #134(표 셀 Enter 중복 cellId 사전 결함 후보)
- #38 댓글 3건: 슬라이스 10 착수 전 확인(D13 이월), 슬라이스 9 착수 전 확인(heading/paragraph 입력 규칙 제거), 슬라이스 1 완료 댓글
- 게시 제외 4건: 전체선택 삭제 크래시·범위 Enter 무동작(트랙-6 해소), Enter 자식 중첩·D19 DOM 사전 테스트(브랜치 내 DELTA-02d/02e 해소)
- #38은 닫지 않았다 — R2 전체 계획 이슈로 슬라이스 2~11이 남았다. #125·#126은 앞서 등록됨.

## 가이드·함정 정비

- `G-EDT-003` 신규(PM 블록 노드 스키마·그룹 채움 계약) — pending-guides 2건 통합 승격. D19 실측과 트랙-6 채움 기본 노드 실사고(BLOCKER — fixture priority 패치가 프로덕션 결함 은폐)가 규칙을 실증했다.
- `PIT-0038` 신규(implementer가 복합 typecheck 대신 tsconfig.json 단독 tsc 실행) — DELTA-02·02a 2회 반복 실증, 지배 가이드 `G-WKS-003`.
- `ff-workflow.md` 보강 2건: 트랙-2 입력에 제품 계약 문서(roadmap·인벤토리) 추가 + 렌즈1에 이연 결정 귀속 대조(라운드 7이 입력 추가 즉시 MAJOR 3건 발견으로 실증), 트랙-4 검증에 "처음 건드리는 패키지 전체 테스트 1회"(DELTA-05에서 사전 결함 2계열 늦은 발견으로 실증). 트랙-2 절차 세부 규칙 5건(초안 라운드 8·10 추가분)은 단일 작업 실증이라 미반영으로 남겼다 — 재발 시 재판단.

## 남은 제한

- 자식 딸린 블록 이동·복제 거절(D20) → #125. 표 들여쓰기 UI 경로 없음 → #126. 붙여넣기 항상 평탄화(중첩 보존은 슬라이스 10 계약 설계에서 결정).
- Backspace join·범위 Enter의 실브라우저(e2e) 레벨 고정 없음 — jsdom 한계, 수정 자체는 PM keymap 계층이라 브라우저 독립적.
- 두 블록 횡단 범위 Enter에서 뒤 블록 id 소멸·재발급(PM replace 의미론, 테스트로 고정) — id 보존이 필요해지면 별도 설계.
- e2e 1건 실패 상존(#131, 이 슬라이스 무관 사전 결함).
