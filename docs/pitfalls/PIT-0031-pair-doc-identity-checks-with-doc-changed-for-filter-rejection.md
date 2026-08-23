# PIT-0031 dispatch 전후 문서 참조 동일성만으로 필터 거절을 감지하지 않는다

- 상태: `ACTIVE`
- 적용 영역: core
- 최초 근거: Issue #28

## 상황과 징후

`EditorState.applyTransaction`이 `filterTransaction`에 의해 거절되면 이전 state를 참조 그대로 돌려준다. 이 참조 동일성(`editor.state.doc === before`)을 "필터가 거절했다"는 신호로 쓰는 헬퍼(`packages/core/src/table-commands.ts`의 `dispatchAndVerify`)는, 실제로는 서로 다른 두 상황에서 똑같이 참이 된다.

1. 필터가 트랜잭션을 거절했다(의도한 신호).
2. 트랜잭션에 애초에 문서를 바꾸는 스텝이 없다(`docChanged: false`, 예: selection만 옮기는 트랜잭션) — 이 경우 필터를 통과해 정상 적용돼도 `newState.doc`은 `tr.before`와 같은 참조다.

지금 `dispatchAndVerify`를 쓰는 4개 호출부(`applyTableGridOperation`, `insertTable`, `pasteTabularData`, `pasteClipboardContent`)는 전부 dispatch 직전에 반드시 `replaceWith`/`insert`로 문서를 바꾸는 스텝을 담으므로 오탐하지 않는다. 이 전제는 코드에서 assert되지 않고 호출부 계약에도 명시돼 있지 않다 — 이 헬퍼를 selection-only dispatch(예: `table-keyboard-extension.ts`의 `goToNextCell(1)(state, editor.view.dispatch)`)에 재사용하면 정상 적용된 트랜잭션을 조용히 거절로 오판한다.

## 근본 원인

`dispatchAndVerify`의 판별식은 "문서가 바뀌었는가"이지 "필터가 거절했는가"가 아니다. 두 사건이 지금까지의 4개 호출부에서는 항상 같이 일어났을 뿐(문서를 바꾸는 트랜잭션만 이 헬퍼를 거쳤으므로), 논리적으로는 독립적인 두 조건이다. 헬퍼 이름과 반환 타입(`TRANSACTION_REJECTED`)이 "필터 거절"만을 가리키므로, 미래의 재사용자가 이 전제를 모르면 자연스럽게 오용하게 된다.

## 예방 규칙

- dispatch 전후 문서 참조 동일성으로 필터 거절을 감지하는 헬퍼를 새 호출부에 쓰기 전에, 그 트랜잭션이 dispatch 시점에 항상 `docChanged: true`인지 확인한다. selection만 옮기거나 stored mark만 바꾸는 트랜잭션에는 이 패턴을 쓰지 않는다.
- selection-only 트랜잭션의 거절 여부를 확인해야 하면 문서 참조 동일성 대신 트랜잭션 자체의 `docChanged`를 먼저 걸러내거나(예: `tr.docChanged && editor.state.doc === before`처럼 조건을 합성), selection을 별도로 비교하는 등 다른 신호를 쓴다.
- 이 패턴의 헬퍼를 새 호출부에 추가할 때는 "이 트랜잭션은 항상 문서를 바꾼다"는 전제를 그 호출부 주변에 짧게 남긴다.

## 검증 방법

새 호출부를 추가하면, 그 호출부가 넘기는 트랜잭션이 no-op(`docChanged: false`)인 경우를 테스트로 만들어 헬퍼가 거절을 오반환하지 않는지(또는 애초에 그 경로에 이 헬퍼를 쓰지 않는지) 확인한다.

## 실제 근거

- 2026-08-24 작업 `20260824-02-issue16-23-28-table-command-hardening` 트랙-6, `IMPL-REVIEW-02` 렌즈 A(F2)·렌즈 E(F2) — `dispatchAndVerify` 정의부 주석의 실행 경로 설명 오류를 조사하다 함께 발견. `table-commands.ts:170-181`의 정의부 주석에 이 전제와 반례를 명시했다.
- 현재 미보호로 남아 있지만 실제로는 안전한 사례: `packages/core/src/table-keyboard-extension.ts:16,36`의 `goToNextCell` dispatch 2곳 — `prosemirror-tables`의 `goToNextCell`은 selection-only 트랜잭션만 만들고, 이 저장소에 등록된 두 `filterTransaction`(`LinkPolicyExtension`, `RevisionGuardExtension`)은 둘 다 `docChanged: false`면 무조건 통과시키므로 현재는 거절될 수 없다. 향후 selection-only 트랜잭션도 거절하는 필터가 추가되면 이 두 곳의 반환값(`boolean`)이 실제 dispatch 성공 여부와 어긋날 수 있다.

## 관련 문서

- 반대쪽 누락(필터 거절 신호를 놓치는 문제) 예방: [`PIT-0003`](./PIT-0003-keep-editor-transactions-atomic.md)
