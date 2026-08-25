---
status: accepted
---

# 디펜던시의 Chrome 75 런타임 API 격차는 사용처 core-js에 위임한다

Geul의 공식 browser floor는 Chrome 75다(ADR 0008). 이 floor를 지키는 책임은 코드의 소유자와 격차의 종류에 따라 넷으로 갈린다 — 자기 소스의 문법은 tsc `target: "ES2019"`(react 배포 산출물은 esbuild `--target=chrome75`를 추가로 거친다)가 downlevel하고, 자기 소스의 런타임 API는 소스 규율과 `pnpm check:escompat` 게이트(dist 전량을 Chrome >= 75의 ES 표준 기준으로 검사, 대상 0건이면 실패)가 막고, 디펜던시의 문법은 사용처 번들러의 `build.target`이 downlevel하고, 디펜던시의 런타임 API는 사용처가 로드하는 core-js가 채운다. 대안은 디펜던시의 미지원 API 호출을 `pnpm patch`로 고치는 것이었고 실제로 `@tiptap/core`의 `Array.prototype.findLast`(Chrome 97+)를 그렇게 치환했지만(Issue #120), 이 방식은 디펜던시 버전을 올릴 때마다 전체 API 표면을 다시 감사해야 하고 패치 수가 디펜던시 수에 비례해 늘어나 유지할 수 없다. polyfill 로드 여부는 라이브러리가 아니라 애플리케이션(사용처)이 결정해야 하는 전역 상태이므로, **디펜던시의 런타임 API 격차는 패치하지 않고 사용처의 core-js 1회 로드에 위임한다.** 최초 사례로 tiptap findLast 패치를 제거했다(Issue #122).

| 격차 | 책임 | 수단 |
| --- | --- | --- |
| 자기 소스 문법 | Geul | tsc `target: "ES2019"` (+ react는 esbuild `--target=chrome75`) |
| 자기 소스 런타임 API | Geul | 소스 규율 + `pnpm check:escompat` 게이트 |
| 디펜던시 문법 | 사용처 | 번들러 `build.target: 'chrome75'` |
| 디펜던시 런타임 API | 사용처 | `import "core-js/stable"` 1회 |

## Consequences

- Chrome 75 지원이 필요한 사용처는 엔트리 첫 import로 `import "core-js/stable"`을 넣고 번들러 target을 `chrome75`로 둔다. `apps/demo`가 이 사용처 조건의 재현 예시이고 `pnpm test:e2e:chrome83`이 실검증한다. 최신 Chrome만 지원하는 사용처는 아무 조치도 필요 없다 — polyfill 없이 그대로 동작한다.
- ADR 0006과의 경계: 출력이 동일한 성능 패치(micromark-extension-gfm-table, Issue #26)는 0006이 계속 소유한다. 브라우저 호환성 패치는 이 ADR이 금지하고 사용처에 위임한다 — 최초 사례가 이번에 제거한 tiptap findLast 패치(Issue #120 도입, #122 제거)다.
- ADR 0008을 승계한다: Chrome 75 floor 선언은 그대로이고, 이 ADR은 그 floor를 지키는 책임의 배분만 정한다. Safari/Firefox 구형 지원은 여전히 범위 밖이다.
- `check:escompat`은 Geul 자기 소스 게이트다 — `packages/*`의 dist JS 전량(목록은 workspace 열거에서 파생)이 대상이고 `verify:packages`의 build 뒤에 돈다. 디펜던시 코드는 이 게이트의 대상이 아니다(사용처 책임이므로).
- core-js는 사용처 역할인 `apps/demo`에만 추가한다. `packages/*`에 추가하지 않는다 — 라이브러리가 전역 polyfill을 로드하면 사용처의 전역 상태를 무단으로 바꾸게 된다.
- Web API 격차(`crypto.randomUUID` 등)는 core-js 범위 밖이고 Issue #121이 소유한다.
