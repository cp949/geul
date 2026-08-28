---
status: accepted
---

# 계층형 패키지와 공개 API 경계를 강제한다

Geul은 `io -> model`, `core -> model`, `core -> io`, `react -> core`, `demo -> react, io, model` 의존 방향을 사용한다. `core -> io`는 R1 슬라이스 11(클립보드 붙여넣기)에서 추가됐다 — 클립보드 HTML 파싱이 `io`의 HTML sanitizer와 테이블 변환기를 그대로 재사용해야 같은 로직을 두 곳에 구현하지 않는다(G-TBL-001). `io`는 여전히 문자열 입출력만 다뤄 DOM에 의존하지 않으므로 이 엣지가 `core`에 새 런타임 환경 요구사항을 들여오지 않는다. 하나의 에디터 패키지나 React 중심 구조는 내부 타입 공유가 쉽지만 순수 모델·서버 변환·프레임워크 독립 소비를 분리할 수 없고 Tiptap/ProseMirror 타입이 공개 계약으로 굳어진다. 따라서 model이 공통 canonicalization과 validation을 소유하고, core만 Tiptap을 알고, React 어댑터는 core의 공개 mount·command API와 저장 표현 직렬화 계약만 사용하며, manifest·컴파일 fixture·배포 소비 fixture로 이 경계를 검증한다. 허용 표면의 "저장 표현 직렬화 계약"은 Issue #75에서 추가됐다 — 표 열 목록의 DOM 투영(`data-be-columns`)을 core와 react가 각자 파싱해 방어 수준이 갈렸고, 한쪽만 바꿔도 어긋남이 드러나지 않았다. model이 `serializeTableColumns`/`parseTableColumns` 쌍을 소유하고 core가 re-export하며 `getAttribute` 호출은 react에 남는다. 이 계약이 다루는 값은 문자열과 `TableColumn`뿐이라 Tiptap/ProseMirror 타입을 공개 계약으로 굳히지 않는다는 원래 의도를 해치지 않고, model의 DOM 비의존 불변식도 유지된다.

## Consequences

- model과 io는 DOM, React, Tiptap과 ProseMirror에 의존하지 않는다.
- core의 공개 declaration에는 Tiptap 또는 ProseMirror 타입을 노출하지 않는다.
- React 어댑터는 `@tiptap/react`에 의존하지 않는다.
- 동일 불변식을 여러 패키지가 다시 구현하지 않고 model의 공통 계약을 사용한다.
- `core`가 `io`에 의존하지만 `io`는 여전히 `core`/Tiptap/ProseMirror를 모른다 — 방향은 한쪽으로만 흐른다.
- `core -> io`의 대가: `core`를 쓰는 소비자는 클립보드 붙여넣기를 쓰지 않아도 `io`의 HTML 파서(`parse5`, `hast-util-from-parse5`, `hast-util-sanitize`)를 번들에 포함한다. 파서를 `core`에 다시 구현하는 중복보다 이 번들 비용을 택했다. 붙여넣기를 선택적 확장으로 떼어내면 없앨 수 있으나 R1 범위 밖이다.
