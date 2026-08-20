# PIT-0017 document.body에 직접 붙인 테스트 노드는 finally에서 정리한다

- 상태: `ACTIVE`
- 적용 영역: react, test
- 최초 근거: Issue #51

## 상황과 징후

"메뉴/툴바 바깥을 클릭하면 닫힌다"류 테스트는 클릭 대상으로 쓸 버튼을 `document.body.append(outsideButton)`로 직접 붙인다. `afterEach(cleanup)`(React Testing Library)은 `render()`가 만든 컨테이너만 언마운트하고, 이렇게 직접 붙인 노드는 정리 대상이 아니다. 정리 호출(`outsideButton.remove()`)을 `fireEvent`와 `expect` 뒤에 순차 문장으로 두면, 그 사이 assertion이 던지는 순간 정리 문장이 실행되지 않고 `<button>outside</button>`이 `document.body`에 남는다. 남은 버튼은 이후 테스트의 `getByRole("button", ...)`를 "multiple elements" 실패로 만들어, 정작 원인인 초점 복구 회귀를 가린다 — 진단이 가장 필요한 순간에 노이즈가 덮인다.

## 근본 원인

DOM 정리 문장이 예외를 던질 수 있는 코드(`fireEvent`, `expect`) 뒤에 `try/finally` 없이 순차 배치되어 있다. JS는 예외가 던져지면 그 문장 이후의 순차 코드를 건너뛰므로, 정리는 "정상 경로에서만 실행되는" 부수 효과가 되어 실패 시 정확히 실행되어야 할 때 실행되지 않는다.

## 예방 규칙

- `document.body`(또는 렌더 컨테이너 밖 어디든)에 직접 붙인 임시 DOM 노드는 생성 직후부터 `try` 블록을 열어, 그 노드를 쓰는 `fireEvent`/`expect`를 전부 `try` 안에 두고 `remove()`를 `finally`로 옮긴다. `table-selection-toolbar.test.tsx`의 `try { fireEvent.pointerDown(outsideButton); expect(...); expect(...); } finally { outsideButton.remove(); }` 형태가 표준이다.
- 새 "바깥 클릭" 테스트를 추가할 때 이 형태를 그대로 복제한다 — 정리 위치를 예외 발생 가능 코드 뒤 평문으로 쓰지 않는다.
- 리뷰에서 `document.body.append(...)`와 짝인 `remove()` 호출이 있으면, 그 `remove()`가 `finally` 블록 안에 있는지 `grep -n -A5 remove()` 또는 diff 컨텍스트로 확인한다.
- 이 패턴이 한 파일에서 여러 곳 반복되면(3곳 이상) 공용 헬퍼로 추출하는 것도 고려한다 — 다만 헬퍼 추출은 테스트 파일을 다시 건드리는 별도 범위 판단이 필요하다(Issue #54의 판단: 3곳뿐이라 이번엔 추출하지 않고 형태만 통일).

## 검증 방법

```bash
grep -rn "outsideButton.remove()" packages/react/test/
```

3곳 전부가 `finally` 블록 안에 있는지 확인한다. 변이 절차: 대상 테스트의 `try` 블록 안 첫 `expect`를 일부러 실패하는 값으로 바꾼 뒤(예: `expect(document.activeElement).toBe(document.body)`처럼 항상 거짓이 되는 조건), 해당 테스트만 단독 실행하고 이어서 같은 버튼 텍스트(`"outside"`)를 조회하는 다른 테스트나 `document.body.innerHTML`을 확인해 leaked 노드가 없는지 본다. 확인 후 즉시 되돌린다.

## 실제 근거

- 커밋 `03d711f`(Issue #51 리뷰) — `table-selection-toolbar.test.tsx`, `table-handles.test.tsx` 2곳을 `try/finally` 형태로 고쳤다. 같은 패턴의 `block-side-menu.test.tsx`가 누락됐다.
- 커밋 `814fafe`(Issue #54) — 누락된 `block-side-menu.test.tsx:109-124`를 동일 형태로 고쳤다. 격리 사본에서 대조 확인: 수정 전 형태로 되돌리고 `try` 안 첫 assertion을 강제 실패시키면 `outside` 버튼이 `document.body`에 남고(누수 재현), 수정본은 남지 않는다 — 예방 규칙이 실제로 진단 가능성을 개선함을 실측했다.

## 관련 문서

- [PIT-0014 jsdom 테스트 fake는 contentEditable IDL 대신 속성으로 세운다](./PIT-0014-set-contenteditable-attribute-in-jsdom-fakes.md)
