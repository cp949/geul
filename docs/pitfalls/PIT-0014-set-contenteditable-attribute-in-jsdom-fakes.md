# PIT-0014 jsdom의 contentEditable IDL은 contenteditable 속성을 만들지 않는다

- 상태: `ACTIVE`
- 적용 조건: `[contenteditable="true"]`를 찾는 production UI를 fake DOM으로 테스트
- 정상 가이드: [`G-TST-001`](../guides/G-TST-001-test-overlays-and-keyboard-interactions.md)
- 최초 근거: Issue #48

## 오해하기 쉬운 신호

`el.contentEditable = "true"`로 만든 fake가 편집 가능해 보이지만 CSS selector는 찾지 못해 focus 복구가 실패한다.

## 원인과 회피

jsdom의 IDL property와 HTML attribute가 동기화되지 않는다. 실제 editor mount를 우선하고, fake가 필요하면 `el.setAttribute("contenteditable", "true")`를 사용한다.

## 탐지

focus 호출을 제거하거나 Escape·outside callback을 바꾸는 변이가 관련 test를 RED로 만드는지 확인한다.
