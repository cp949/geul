# Issue #156 슬라이스11 RD-002 DELTA-05 — color.* 네임스페이스

## 목표

색상 이름 8종(Gray/Red/Orange/Yellow/Green/Blue/Purple/Pink)과 "Text color"/"Background color" property 라벨을 `Dictionary.color`로 추출한다. 3곳(`table-cell-color-palettes.tsx`, `block-side-menu-menu.tsx`, `formatting-toolbar.tsx`)이 이 문구를 각자 독립적으로 하드코딩하고 있었다(`table-cell-colors.ts`의 `TableCellColor.name`을 공유 데이터로 갖고 있었지만, property 라벨은 3곳 모두 별도 리터럴).

## 확정 커밋

- `e223351` — feat(core,react): color.* dictionary 네임스페이스 배선(EXT-009)

## 변경한 계약과 파일

- `packages/react/src/table-cell-colors.ts` — `TableCellColor`에서 `name: string` 필드를 제거하고 `id: TableCellColorId`(8개 리터럴 유니온)로 교체. `TABLE_TEXT_COLORS`/`TABLE_BACKGROUND_COLORS`의 hex 값은 그대로 유지.
- `packages/core/src/dictionary.ts` — `Dictionary.color` 네임스페이스 신설: `textLabel`("Text color"), `backgroundLabel`("Background color"), `none`("None"), `names`(8개 `TableCellColorId` key). `DEFAULT_DICTIONARY.color`는 기존 "Text color Blue" 등 조합 문자열 characterization 테스트와 정확히 일치하도록 채움.
- `packages/react/src/table-cell-color-palettes.tsx` — `useDictionary()` 추가, `color.name` 참조를 `dictionary.color.names[color.id]`로, property 라벨과 "None" 조합을 dictionary 기반으로 교체.
- `packages/react/src/block-side-menu-menu.tsx` — 색상 섹션(헤더 2곳, 동적 aria-label 2곳, 하드코딩 "Text color None"/"Background color None" 2곳)을 `dictionary.color.*` 조합식으로 치환.
- `packages/react/src/formatting-toolbar.tsx` — `colorMenuPropertyLabel` 모듈 상수를 제거하고 `dictionary.color.textLabel`/`backgroundLabel`로 대체.
- `packages/react/test/{block-side-menu,formatting-toolbar-colors,table-cell-format-menu}.test.tsx` — 4개 소비처 override 검증 추가.

## 검증

`pnpm --filter @cp949/geul-core build` exit 0, `pnpm --filter @cp949/geul-react test` 586 passed, `pnpm --filter @cp949/geul-react build` exit 0, core/react `typecheck` exit 0(`name` 필드 제거 후 3개 소비처 전환 누락이 있었다면 타입 에러로 잡혔을 것 — 실제로는 한 번에 clean), eslint/prettier 전부 clean. 리뷰 중 `FormattingToolbarFakeController.getDictionary` 필드가 `Mock` 타입을 요구해 테스트의 일반 함수를 `vi.fn(...)`으로 고쳤다(typecheck가 즉시 발견).

## RD-002 진행 상태

DELTA-05 완료. `Dictionary`에 `color` 네임스페이스 추가, `TableCellColor.name`을 `id` 기반 조회로 전환. 이것으로 `menu.*`/`color.*` 두 DELTA가 함께 처리하기로 계획했던 색상 관련 문구 전량이 완료됐다. 남은 것은 DELTA-06~10(toolbar×2/handle/codeLanguage/error·status).

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스11)가 미완료라 슬라이스1~10 전례대로 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- result 문서에 별도 기재된 남은 위험 없음.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert e223351`. 위험: 중간 — `TableCellColor.name` 필드 제거는 3개 소비처를 함께 바꾼 내부 리팩터링이다(react 패키지 공개 export 표면(`packages/react/src/index.ts`)에는 `TableCellColor`가 없어 외부 소비자 영향은 없음, 패키지 내부로 한정). 체인 최신 커밋부터 역순으로 revert해야 이후 DELTA와 충돌하지 않는다.
