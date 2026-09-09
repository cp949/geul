# G-UI-004 네이티브 disabled 대신 aria-disabled와 title로 비활성 사유를 설명한다

- 상태: `ACTIVE`
- 적용 조건: 네이티브 `disabled`가 hover·tab을 막아 인터랙티브 컨트롤의 비활성 사유를 설명하지 못하는 경우

## 구현 규칙

- HTML `disabled` 속성 대신 `aria-disabled`를 쓴다. 값은 boolean으로 넘긴다 — React는 `aria-*` 속성을 `data-*`와 달리 boolean이어도 `"true"`/`"false"` 문자열로 렌더한다(속성이 사라지지 않는다).
- 비활성 사유가 있으면 그 사유 문구를 `title`로 노출한다. 활성 상태의 `title`은 컨트롤이 이미 자신의 정체성을 시각적으로 드러내는지에 따라 갈린다.
  - children으로 보이는 텍스트를 가진 컨트롤(`MenuItemButton` 등): `title`을 아예 생략한다(`undefined`를 넘긴다 — 빈 문자열은 "사유 없음"과 "빈 사유"를 구분하지 못한다). 보이는 텍스트가 이미 정체성을 전달해 중복 tooltip이 불필요하다.
  - 아이콘만 있고 시각적 라벨이 없는 컨트롤(`IconButton` 등): `title`이 비어 있으면 안 된다 — accessible name/tooltip을 같은 label에서 파생하는 기존 계약(`icon-button.tsx`)이 항상 hover tooltip을 요구한다. 활성 상태에는 override를 생략해 `title`이 기존 label로 폴백하게 한다(RD-002 결정).
- 클릭 핸들러 맨 앞에 명시적 no-op 가드(`if (!canX) return;`)를 둔다. `aria-disabled`는 `disabled`와 달리 클릭 이벤트를 막지 않는다(브라우저와 jsdom 둘 다 동일) — 가드가 없으면 비활성 상태에서도 클릭이 실제 명령을 호출한다.
- CSS는 `:disabled` 의사 클래스 대신 `[aria-disabled="true"]` 속성 selector를 쓴다. 이 selector 블록에 `pointer-events: none`을 두지 않는다 — 포인터 이벤트를 막으면 hover가 걸리지 않아 `title` 툴팁이 뜨지 않는다(비활성 사유를 설명한다는 목적 자체를 막는다). `cursor: not-allowed`와 낮춘 `opacity`로 시각적 비활성만 표시한다.

## 검증

- 비활성 상태: `aria-disabled="true"`, `title`이 사유 문구와 같다, 클릭해도 대상 명령이 호출되지 않는다(행/열 수 등 관측 가능한 상태 불변 또는 command spy로 검증).
- 활성 상태: `aria-disabled="false"`, `title`은 위 구현 규칙의 컨트롤 종류에 따라 없거나(`getAttribute("title") === null`) 기존 label과 같다.

## 경계

네이티브 `disabled`가 막는 것이 `aria-disabled`로 대체 불가능한 브라우저 자체 동작(예: `<input type="file">`의 파일 선택 다이얼로그)이면 이 가이드를 적용하지 않는다 — `aria-disabled`는 그 동작을 막지 못해 오히려 회귀를 만든다.
