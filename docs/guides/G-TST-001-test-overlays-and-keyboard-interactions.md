# G-TST-001 overlay·키보드 interaction을 실제 event 순서로 검증한다

- 상태: `ACTIVE`
- 적용 조건: menu·toolbar·popover의 닫기, 초점 복구, paste 또는 pointer interaction 변경
- 관련 함정: [`PIT-0009`](../pitfalls/PIT-0009-verify-keyboard-close-with-parallel-e2e.md), [`PIT-0012`](../pitfalls/PIT-0012-synthesize-paste-events-without-clipboardeventinit.md), [`PIT-0014`](../pitfalls/PIT-0014-set-contenteditable-attribute-in-jsdom-fakes.md)

## 구현·검증 규칙

- fake보다 실제 `createEditor()` mount를 우선한다. fake를 쓰면 production selector가 읽는 HTML 속성을 그대로 설정한다.
- 브라우저 순서가 계약이면 `pointerdown` → `click`, selection 변경 → keydown처럼 실제 event 순서를 재현한다.
- 닫힘은 하위 요소가 아니라 `role="toolbar"`·`role="menu"` 컨테이너 부재로 단언한다.
- Escape는 편집 대상의 초점 복구까지, 바깥 클릭은 클릭 대상의 자연스러운 초점 이동까지 확인한다.
- keyboard close 경로는 기본 worker 수로 반복해 재오픈 race를 확인한다.
- 브라우저 event 합성 helper는 Chromium·Firefox·WebKit 최소 재현으로 먼저 검증한다.

## 완료 기준

관련 unit test와 focused E2E가 통과하고, 닫기·초점 배선을 제거하거나 뒤집는 변이가 대상 테스트를 RED로 만든다.
