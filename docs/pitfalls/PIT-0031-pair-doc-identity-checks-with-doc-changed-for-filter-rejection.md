# PIT-0031 doc reference 동일성은 selection-only transaction 거절을 구분하지 못한다

- 상태: `ACTIVE`
- 적용 조건: dispatch 전후 `editor.state.doc === before`로 transaction filter 거절 판별
- 정상 가이드: [`G-EDT-001`](../guides/G-EDT-001-keep-editor-commands-atomic.md)
- 최초 근거: Issue #28

## 오해하기 쉬운 신호

selection-only 또는 stored-mark transaction이 정상 dispatch돼도 document reference가 같아 거절로 오판한다.

## 원인과 회피

`docChanged: false` transaction은 성공해도 document를 교체하지 않는다. reference 동일성 검사는 항상 document를 바꾸는 transaction에만 사용한다. 다른 경로는 `tr.docChanged`, selection 또는 별도 신호로 판정한다.

## 탐지

새 호출부마다 `docChanged: false` 정상 transaction fixture를 추가해 거절 오반환이 없는지 확인한다.
