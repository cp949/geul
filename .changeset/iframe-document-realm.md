---
"@cp949/geul-core": patch
"@cp949/geul-react": patch
---

iframe 문서에 렌더한 편집기의 오버레이와 undo·redo가 메인 문서와 같게 동작한다. custom style `render`가 iframe 문서 요소를 반환해도 같다.

- 바깥 pointerdown과 편집기 안 React 요소가 막은 Escape로 오버레이가 닫힌다.
- 표 hover 뒤 편집기 밖으로 옮기면 행·열 핸들이 사라진다.
- 블록 타입 메뉴, 표 행 메뉴, 표 그립 메뉴가 자동으로 닫히면 초점이 편집기로 돌아온다.
- StaticToolbar의 ArrowLeft·ArrowRight·Home·End와 블록 타입 메뉴의 화살표 키가 초점을 옮긴다.
- 스크롤 영역 밖 표 행·열 핸들이 숨는다.
- iframe 블록의 Interact 버튼을 다시 누르면 상호작용이 풀린다.
- 노드 판정을 전역 DOM 생성자 `instanceof` 대신 `nodeType` 기준으로 바꿨다. React가 iframe 문서에 그린 노드는 다른 realm 인스턴스라 판정이 거짓이었다.
- iframe 문서의 편집기 밖 버튼에 초점이 있을 때 `Mod-z`가 undo하고 `Mod-Shift-z`·`Mod-y`가 redo한다.
- custom style `render`가 iframe 문서로 만든 HTML 요소를 반환해도 그 태그와 속성으로 렌더한다. 편집기 위치와 무관하다.
- core의 노드 판정도 `nodeType` 기준으로 바꿨다. iframe 문서가 만든 keydown 대상과 `render` 반환 요소에서 판정이 거짓이었다.
