---
status: accepted
---

# 계층형 패키지와 공개 API 경계를 강제한다

Geul은 `io -> model`, `core -> model`, `react -> core`, `demo -> react, io, model` 의존 방향을 사용한다. 하나의 에디터 패키지나 React 중심 구조는 내부 타입 공유가 쉽지만 순수 모델·서버 변환·프레임워크 독립 소비를 분리할 수 없고 Tiptap/ProseMirror 타입이 공개 계약으로 굳어진다. 따라서 model이 공통 canonicalization과 validation을 소유하고, core만 Tiptap을 알고, React 어댑터는 core의 공개 mount·command API만 사용하며, manifest·컴파일 fixture·배포 소비 fixture로 이 경계를 검증한다.

## Consequences

- model과 io는 DOM, React, Tiptap과 ProseMirror에 의존하지 않는다.
- core의 공개 declaration에는 Tiptap 또는 ProseMirror 타입을 노출하지 않는다.
- React 어댑터는 `@tiptap/react`에 의존하지 않는다.
- 동일 불변식을 여러 패키지가 다시 구현하지 않고 model의 공통 계약을 사용한다.
