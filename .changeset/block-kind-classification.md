---
"@cp949/geul-model": patch
"@cp949/geul-core": patch
---

순차 id 팩토리를 쓰는 편집기가 iframe으로 끝나는 문서에서 `Duplicate id`로 던지던 결함을 고친다.

- core: 점유 id 수집이 `file`·`image`·`video`·`audio`만 보고 `iframe`을 빠뜨렸다. 이제 `iframe`도 점유 id로 등록한다.
- model: 블록 종류 분류 표를 추가한다. 신규 export는 `MediaBlockType`, `LeafBlockType`, `isMediaBlockType`, `isLeafBlockType`, `isMediaBlock`, `isLeafBlock`이다.
- model: 알려진 블록 타입 집합이 이 표에서 파생된다. `isKnownBlockType`의 판정은 같다.
- core: `MediaBlockKind`는 `MediaBlockType`의 별칭으로 유지된다. 공개 타입 이름은 바뀌지 않는다.
