# PIT-0003 편집기 트랜잭션 원자성을 유지한다

- 상태: `ACTIVE`
- 적용 영역: core command, browser transaction, revision, undo/redo
- 최초 근거: R0 commit `3990396`

## 상황과 징후

명령이 실패 결과를 반환했는데 문서, selection, stored mark, revision 또는 change event 일부가 이미 바뀐다. 특히 브라우저 입력, 잘못된 link, revision 상한과 undo/redo 경계에서 발생할 수 있다.

## 근본 원인

Tiptap/ProseMirror transaction을 먼저 적용하고 독자 문서 검증이나 revision 가능 여부를 나중에 확인하면 실패를 원자적으로 되돌리기 어렵다.

## 예방 규칙

- 실행 가능성, 독자 문서 유효성, revision 증가 가능성을 mutation 전에 판정한다.
- 거절된 명령은 문서, selection, stored mark와 event를 모두 보존한다.
- 한 사용자 조작은 하나의 성공 transaction과 한 번의 undo 단위가 된다.
- DOM에서 직접 들어오는 transaction에도 command와 같은 guard를 적용한다.

## 검증 방법

거절 전후의 독자 문서, Tiptap document, selection, stored mark와 change event 배열을 모두 비교한다.

```bash
pnpm --filter @cp949/geul-core test
```

## 실제 근거

- `packages/core/src/revision-guard-extension.ts`
- `packages/core/src/link-policy-extension.ts`
- `packages/core/test/editor-controller.test.ts`
- commit `3990396`에서 replace, DOM transaction, revision 상한, undo/redo와 stored link mark의 원자성 회귀 테스트를 고정했다.

## 관련 문서

- [독자 저장 모델 ADR](../adr/0001-own-versioned-document-model.md)
