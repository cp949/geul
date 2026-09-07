# Issue #156 슬라이스11 RD-002 DELTA-08 — handle.* 네임스페이스

## 목표

`table-handle-constants.tsx`(6건, 표 행/열 드래그 핸들·추가·들여쓰기 버튼)와 `block-side-menu.tsx`의 블록 드래그·추가 핸들 2건을 `Dictionary.handle`로 추출한다. 둘 다 hover 오버레이 아이콘 버튼이라는 같은 성격의 문구다.

## 확정 커밋

- `cb35086` — feat(core,react): handle.* dictionary 네임스페이스 배선(EXT-009)

## 변경한 계약과 파일

- `packages/core/src/dictionary.ts` — `Dictionary.handle` 네임스페이스 신설: `dragRow`/`dragColumn`/`addRow`/`addColumn`/`indentTable`/`outdentTable`(표 6종), `dragBlock`/`addBlock`(블록 2종).
- `packages/react/src/table-handle-constants.tsx` — `rowHandleLabel`/`columnHandleLabel`/`addRowLabel`/`addColumnLabel`/`indentTableLabel`/`outdentTableLabel` 6개 모듈 상수(문자열 export)를 제거 — 이 파일은 이제 아이콘·클래스명만 export한다.
- `packages/react/src/table-handle-overlays.tsx` — 순수 프레젠테이셔널 컴포넌트지만 `useDictionary()`를 직접 호출한다(`table-handle-menu.tsx`와 같은 "리프 컴포넌트가 직접 훅을 부른다" 패턴, 부모가 prop으로 내려주지 않음). 함수 컴포넌트를 표현식 반환에서 블록 반환(`const dictionary = useDictionary(); return (...)`)으로 바꾸며 내부 JSX 전체가 재들여쓰기됨(diff가 302줄로 크지만 실질 로직 변경은 6개 `label={...}`를 `dictionary.handle.*`로 바꾼 것뿐).
- `packages/react/src/block-side-menu.tsx` — 이미 `useEditor()`를 호출하던 자리에 `useDictionary()` 추가, `dragHandleLabel`/`addBlockLabel` 모듈 상수를 제거하고 `dictionary.handle.dragBlock`/`addBlock`로 교체.
- `packages/react/test/table-handles.test.tsx`/`block-side-menu.test.tsx` — override 검증 2건 추가.

## 검증

`pnpm --filter @cp949/geul-core build` exit 0, `pnpm --filter @cp949/geul-react test` 595 passed, `pnpm --filter @cp949/geul-react build` exit 0(`table-handle-constants.tsx`에서 지운 6개 export의 잔여 참조가 있었다면 여기서 잡혔을 것), core/react `typecheck` exit 0, eslint/prettier 전부 clean.

## RD-002 진행 상태

DELTA-08 완료. `Dictionary`에 `handle`(8건) 네임스페이스 추가. 남은 것은 DELTA-09(codeLanguage)·DELTA-10(error·status) 2개뿐.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스11)가 미완료라 슬라이스1~10 전례대로 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- result 문서에 별도 기재된 남은 위험 없음.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert cb35086`. 위험: 낮음 — `table-handle-overlays.tsx`의 큰 diff(302줄)는 표현식→블록 반환 전환에 따른 들여쓰기 변경이 대부분이고 실질 로직은 라벨 배선뿐이다. 체인 최신 커밋부터 역순으로 revert해야 DELTA-09 이후와 충돌하지 않는다.
