# G-EDT-003 PM 블록 노드 스키마와 그룹 채움 계약을 설계한다

- 상태: `ACTIVE`
- 적용 조건: PM 블록 노드 타입 신설(컨테이너·그룹 노드 도입, 부모-자식 constraint의 스키마 표현), 스키마 그룹(`group: "block"` 등)에 참여하는 노드의 추가·제거, 노드 priority 변경

## 구현 규칙

### 노드 구조

- identity 속성(`blockId` 등)은 항상 "삭제·복제·이동의 단위가 되는 노드"(컨테이너)가 소유한다. 내용 노드(`paragraph`/`heading` 등)에 두면 컨테이너 도입 시 재배치가 필요해진다.
- "타입 X는 자식 불가"류 불변식은 수기 가드가 아니라 content expression으로 강제한다 — 컨테이너로 감싸지 않아 자식 그룹을 가질 수 없게 하는 방식. 수기 가드는 대상 열거가 수렴하지 않는다.
- split/join 산출을 좌우하는 노드 옵션(`defining`/`priority` 등)은 참조 구현(예: BlockNote `packages/core/src/pm-nodes/`)의 기본값을 출발점으로 잡고, 완료 조건에 "스키마-유효·구조 불변" 계약을 걸어 구현 단계가 실측 확정한다 — 정확한 값을 계획 시점에 확정하려 하지 않는다. DOM 표현(wrapper 요소·속성명)도 같다.

### 비포장 그룹 멤버

`table`·`divider`처럼 `blockContainer`로 감싸지 않고 직접 `group: "block"`에 참여하는 노드는 컨테이너가 제공하던 identity·DOM parse·명령 selection 계약을 직접 책임진다.

- `blockId`는 삽입 명령과 model↔PM 변환기가 명시 배정한다. `BlockIdExtension`의 사후 배정 대상에 추가하지 않는다. 배정·중복 해소 경로를 둘로 만들지 않는다.
- 자체 DOM은 `renderHTML`에서 `data-be-block-id`를 출력하되 `parseHTML`을 선언하지 않는다. 편집기 DOM을 다시 parse하면 id가 없거나 자기 복사로 중복된 id가 생긴다. 외부 HTML·clipboard 입력은 `io` 변환 경계가 별도로 소유한다.
- 인접 Backspace/Delete는 `Selection.findFrom`만 사용하지 않는다. 이 탐색은 atom을 건너뛴다. 시각적으로 인접한 리프를 찾고 atom이면 해당 노드 위치에 `NodeSelection.create`를 직접 둔다. `selectNodeBackward`/`selectNodeForward`는 형제 인접에서는 쓸 수 있지만 중첩 위치에서 조상 컨테이너를 선택하므로 직접 위치를 계산한다. 표는 atom이 아니므로 table-cell 조상 판정을 별도로 유지한다.
- 공개 block command 표면을 전수 대조한다. `afterBlockId` 삽입 명령, 복제·삭제·이동, 종류 변경, indent/outdent, caret API마다 `거절` 또는 `지원 + selection` 계약을 완료 조건으로 둔다. `nodeSize - 2` 같은 산술은 `blockContainer` 내부 text selection 전제이므로 비포장 노드에 재사용하지 않는다.

### 그룹 채움 기본 노드

PM은 `"block+"` 같은 콘텐츠 자리를 새로 채울 때 `ContentMatch.defaultType` — 그룹 멤버 중 스키마 등록 순서가 앞선 첫 생성 가능 노드 — 를 쓴다. 채움은 전체선택 삭제, 유일 자식 삭제, slice-fitting 등 도처에서 일어나고, attrs 기본값이 불완전한 노드가 이기면 id 없는 손상 노드가 조용히 주입돼 model 변환이 예외로 죽는다.

- 그룹의 의도된 기본 채움 노드를 하나 정하고 그 노드의 priority를 그룹 내 최고로 명시한다(현재: `blockContainer` 1000). 새 그룹 멤버는 그보다 **엄격히 낮게** 둔다. 동률을 허용하지 않는다.
- 테스트 fixture에 프로덕션과 다른 priority를 두지 않는다 — 채움 경로의 결함이 fixture에서 원리적으로 재현 불가가 된다. fixture 소유 규칙은 [`G-TST-002`](./G-TST-002-own-shared-test-support.md)를 따른다.
- Tiptap(3.30.1 실측)에서 priority는 두 축을 따로 움직인다: priority가 높을수록 스키마 등록이 앞서 defaultType 경쟁에서 이긴다. 같은 priority의 스키마 등록은 stable sort 때문에 확장 배열 선언 순서를 유지하지만, keymap은 나중 등록 확장이 먼저 실행된다(`sortExtensions(...).reverse()`). 배열 순서를 채움 안전판으로 인용하거나 keymap 순서로 스키마 순서를 추정하지 않는다.
- 채움 계약 변이는 새 그룹 멤버 priority를 기본 채움 노드보다 **초과**시킨다(현재 `1001`). 동률 `1000`은 배열 순서 때문에 GREEN일 수 있어 검출력 증거가 아니다.

## 완료 기준

- 프로덕션 스키마에서 `doc`과 각 그룹 컨테이너의 `contentMatch.defaultType`을 단언하는 계약 테스트가 있다 — `packages/core/test/block-filler-default.test.ts`가 예시이자 기존 helper다.
- 채움을 실제로 유발하는 사용자 경로(전체선택 삭제 등) 1개 이상을 keymap 레벨로 고정한다.
- 신설 노드의 구조 불변식(자식 불가·귀속 규칙)이 content expression 자체 또는 그것을 단언하는 테스트로 고정된다.
- 비포장 그룹 멤버는 `parseDOM === undefined`, 명시적 id 배정, atom·표 인접 selection과 공개 command별 지원·거절 계약을 테스트한다.
