# G-TST-003 테스트가 만든 자원은 소유 범위에서 항상 정리한다

- 상태: `ACTIVE`
- 적용 조건: DOM node, Editor, observer, timer 또는 전역 listener를 테스트가 직접 생성
- 관련 함정: [`PIT-0028`](../pitfalls/PIT-0028-scope-shared-teardown-hooks-to-run-per-file.md)

## 구현 규칙

- `document.body`에 붙인 노드는 생성 직후 `try`를 열고 `finally`에서 제거한다.
- Editor 등 해제 가능한 fixture는 생성한 helper 또는 호출 테스트가 명시적으로 `destroy()`한다.
- 공용 정리 로직은 이름 붙은 함수로 분리한다. hook 실행 여부를 테스트해야 하면 hook scheduler가 아니라 함수를 직접 검증한다.
- 정리 대상 하나의 실패가 나머지 정리를 막지 않게 실패를 집계한다.

## 완료 기준

중간 assertion을 의도적으로 실패시켜도 다음 테스트에 DOM·Editor·listener가 남지 않는다.
