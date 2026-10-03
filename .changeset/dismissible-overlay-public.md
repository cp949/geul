---
"@cp949/geul-react": patch
---

해제형 오버레이(메뉴, 툴바, 팝업)의 닫힘 규칙을 한곳에 모은 `useDismissibleOverlay`를 공개한다. 옵션 타입 `UseDismissibleOverlayOptions`와 닫힘 이유 타입 `DismissReason`도 함께 공개한다.

- 바깥 pointerdown과 Escape를 `onClose(reason)` 하나로 받는다. reason은 `outside`, `escape`, `invalidated`, `trigger`다.
- reason별 초점 복귀를 훅이 처리한다.
- Escape는 문서별 LIFO다. 겹쳐 열린 오버레이 중 가장 나중에 열린 하나만 닫는다.
- 이미 `preventDefault`된 Escape와 IME 조합 중 Escape는 건너뛴다.
- `focusOnOpen`과 `focusKey`로 키보드로 열린 메뉴의 첫 활성 항목에 초점을 준다.

옛 훅 `useDismissOnOutsideOrEscape`와 `UseDismissOnOutsideOrEscapeOptions`를 삭제한다. 두 이름은 npm 배포본(0.1.0, 0.1.1)에 없었다.
