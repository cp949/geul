# Issue #156 슬라이스11 RD-002 DELTA-07 — toolbar.link·tableSelection·blockSelection·formatting 네임스페이스

## 목표

`toolbar.*`(원래 하나의 네임스페이스로 계획됐다가 DELTA-06에서 media/filePanel과 이 DELTA로 분할됨, 이유는 DELTA-06 이력 참고) 나머지 4개 컨테이너를 마무리한다: `link-toolbar.tsx`(8건), `table-selection-toolbar.tsx`(4건, "Cell formatting" 라벨은 새 key를 만들지 않고 DELTA-04가 만든 `Dictionary.menu.cellFormattingAriaLabel`을 재사용), `block-selection-toolbar.tsx`(4건), `formatting-toolbar.tsx`(컨테이너 "Formatting" 1건만 — 나머지는 DELTA-02/05에서 이미 완료).

## 확정 커밋

- `01b5b2d` — feat(core,react): toolbar.link/tableSelection/blockSelection/formatting 배선(EXT-009)

## 변경한 계약과 파일

- `packages/core/src/dictionary.ts` — `Dictionary.toolbar`에 4개 하위 네임스페이스 추가.
  - `toolbar.link`: ariaLabel, addLink, openLink, editLink, removeLink, urlInputAriaLabel, saveLink, cancel(AriaLabel).
  - `toolbar.tableSelection`: ariaLabel, mergeCells, splitCell. "Cell formatting"은 새 key 없이 `dictionary.menu.cellFormattingAriaLabel` 재사용.
  - `toolbar.blockSelection`: ariaLabel, moveUp, moveDown, delete.
  - `toolbar.formatting`: ariaLabel("Formatting").
- `packages/react/src/link-toolbar.tsx` — `useDictionary()` 추가, 8건 배선(aria-label≠텍스트 1쌍: "Cancel link edit"/"Cancel").
- `packages/react/src/table-selection-toolbar.tsx` — `formatLabel` 상수를 지우고 `dictionary.menu.cellFormattingAriaLabel`을 직접 참조. `mergeLabel`/`splitLabel` 상수를 `dictionary.toolbar.tableSelection.*`로 대체.
- `packages/react/src/block-selection-toolbar.tsx` — `deleteLabel`/`moveUpLabel`/`moveDownLabel` 상수를 `dictionary.toolbar.blockSelection.*`로 대체.
- `packages/react/src/formatting-toolbar.tsx` — 컨테이너 aria-label 2곳("Formatting")을 `dictionary.toolbar.formatting.ariaLabel`로 교체(이미 `useDictionary()` 보유, DELTA-02).
- `packages/react/test/{link-toolbar,table-selection-toolbar,block-selection-toolbar,formatting-toolbar}.test.tsx` — 4개 소비처 override 검증 추가(`dictionary.menu.cellFormattingAriaLabel` 하나만 override해도 `TableCellFormatMenu`와 `TableSelectionToolbar` 양쪽이 함께 바뀜을 확인하는 재사용 증거 케이스 포함).

## 검증

`pnpm --filter @cp949/geul-core build` exit 0, `pnpm --filter @cp949/geul-react test` 593 passed, `pnpm --filter @cp949/geul-react build` exit 0, core/react `typecheck` exit 0, eslint/prettier 전부 clean.

## RD-002 진행 상태

DELTA-07 완료로 `toolbar.*` 전체(6개 파일, DELTA-06+07)가 완료됐다. `Dictionary`는 이제 placeholder/editor/blockType/slashMenu/menu/color/toolbar 7개 최상위 네임스페이스를 갖는다. 남은 것은 DELTA-08(handle)~10(error·status).

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스11)가 미완료라 슬라이스1~10 전례대로 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- result 문서에 별도 기재된 남은 위험 없음.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 01b5b2d`. 위험: 낮음 — 4개 소비처의 렌더 텍스트 치환뿐, 로직 변경은 없다. `dictionary.menu.cellFormattingAriaLabel` 재사용은 DELTA-04에 이미 존재하는 key라 이 커밋 자체는 새 계약을 만들지 않는다. 체인 최신 커밋부터 역순으로 revert해야 DELTA-08 이후와 충돌하지 않는다.
