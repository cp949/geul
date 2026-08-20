# Pitfall Index

다음 계획과 리뷰에서 재사용할 예방 규칙의 탐색 목록이다. 상세 원인과 검증법은 링크된 문서가 소유한다.

| ID | 제목 | 상태 | 영역 | 최초 근거 | 상세 |
| --- | --- | --- | --- | --- | --- |
| `PIT-0001` | 소비자 증거로 패키지 경계 검증 | `ACTIVE` | workspace | R0 | [상세](./PIT-0001-enforce-boundaries-with-consumer-proofs.md) |
| `PIT-0002` | canonicalization과 validation 중앙화 | `ACTIVE` | model·io·core | R0 | [상세](./PIT-0002-centralize-canonicalization-and-validation.md) |
| `PIT-0003` | 편집기 트랜잭션 원자성 유지 | `ACTIVE` | core | R0 | [상세](./PIT-0003-keep-editor-transactions-atomic.md) |
| `PIT-0004` | 저장 배열 대신 논리 테이블 순서 사용 | `ACTIVE` | model·io·core | R0 | [상세](./PIT-0004-use-logical-table-order.md) |
| `PIT-0005` | 미지원 Markdown 원문 의미 보존 | `ACTIVE` | io | R0 | [상세](./PIT-0005-preserve-unsupported-markdown-meaning.md) |
| `PIT-0006` | 배포 산출물 검증 전 build 수행 | `ACTIVE` | build·fixture | R0 | [상세](./PIT-0006-build-before-distribution-verification.md) |
| `PIT-0007` | HTML 경고 수집과 의미 변환 분리 | `ACTIVE` | io·security | R0 | [상세](./PIT-0007-separate-html-warnings-from-semantics.md) |
| `PIT-0008` | 클로저 경계를 넘는 객체 타입 좁히기 회피 | `ACTIVE` | core | R1 | [상세](./PIT-0008-avoid-object-narrowing-across-closures.md) |
| `PIT-0009` | UI를 닫는 키보드 핸들러는 병렬 e2e로 검증 | `ACTIVE` | react·e2e | R1 | [상세](./PIT-0009-verify-keyboard-close-with-parallel-e2e.md) |
| `PIT-0010` | 병합 셀에서는 오버레이 hit-test와 selection 이동을 명시적으로 다룸 | `ACTIVE` | react·core | R1 | [상세](./PIT-0010-position-overlays-and-selection-for-merged-cells.md) |
| `PIT-0011` | 화면 밖으로 나가는 fixed 오버레이는 렌더 후 크기를 재서 접음 | `ACTIVE` | react | R1 | [상세](./PIT-0011-clamp-fixed-overlays-into-viewport.md) |
| `PIT-0012` | 합성 paste 이벤트는 ClipboardEventInit이 아니라 defineProperty로 clipboardData를 얹음 | `ACTIVE` | e2e | R1 | [상세](./PIT-0012-synthesize-paste-events-without-clipboardeventinit.md) |
| `PIT-0013` | 오버레이 바깥 클릭·Escape 닫기는 공용 훅으로 구현 | `ACTIVE` | react·e2e | R1 | [상세](./PIT-0013-share-outside-click-escape-dismiss-via-hook.md) |
| `PIT-0014` | jsdom 테스트 fake는 contentEditable IDL 대신 속성으로 세움 | `ACTIVE` | react·test | Issue #48 | [상세](./PIT-0014-set-contenteditable-attribute-in-jsdom-fakes.md) |
| `PIT-0015` | composite tsconfig 패키지는 test 전용 tsconfig.test.json을 따로 둠 | `ACTIVE` | workspace·build | Issue #32 | [상세](./PIT-0015-separate-tsconfig-for-composite-package-tests.md) |
| `PIT-0016` | workspace 밖 TS 디렉터리는 전용 tsconfig로 typecheck 대상에 넣음 | `ACTIVE` | workspace·build | Issue #57 | [상세](./PIT-0016-give-non-package-ts-directories-their-own-tsconfig.md) |
| `PIT-0017` | document.body에 직접 붙인 테스트 노드는 finally에서 정리함 | `ACTIVE` | react·test | Issue #51 | [상세](./PIT-0017-clean-up-body-appended-test-nodes-in-finally.md) |
| `PIT-0018` | 복잡도 회귀는 wall-clock 상한이 아니라 결정적 단언으로 잡음 | `ACTIVE` | io·test | Issue #58 | [상세](./PIT-0018-gate-complexity-regressions-deterministically.md) |
| `PIT-0019` | 안정 key로 재사용되는 DOM의 억제 키는 이동 후 상태로 맞춤 | `ACTIVE` | react·e2e | Issue #17 | [상세](./PIT-0019-anchor-suppression-keys-to-post-move-state.md) |
