# Issue #38 슬라이스 10 RD-002 DELTA-01 — production `data-be-block-group` wrapper 편입, RD-002 DONE

## 목표

roadmap-workflow RD-002의 유일한 DELTA. 생산 편집기 in-editor copy가 만드는 실제 렌더 DOM(`blockContainer`→`div[data-be-block-id]`, `blockGroup`→`div[data-be-block-group]`)을 `io.importHtml`이 spec §7.1 own wrapper 계약의 alternate 표현으로 인식해, 중첩 `children`과 원본 블록 id를 보존한다. RD-003(목록류)·RD-004(통합 clipboard 확장)가 이 결과를 이어받는다.

## 확정 커밋

- `eaf9c05` — production data-be-block-group wrapper를 own wrapper로 편입 (Issue #38 슬라이스 10, RD-002 DELTA-01)

## 변경한 계약과 파일

- `packages/io/src/html/sanitize-schema.ts` — `div` 허용 속성에 `dataBeBlockGroup` 추가.
- `packages/io/src/html/import-html.ts`:
  - `isOwnBoundaryTag`를 모듈 top-level 함수로 승격하고 `blockquote`·`pre`를 추가(생산 편집기가 quote·codeBlock도 같은 blockContainer wrapper에 낸다).
  - `isChildrenContainerMarker` 신설 — `dataBeChildren`(own-export)과 `dataBeBlockGroup`(생산 편집기, 값이 항상 빈 문자열이라 raw property 존재로 판정)을 동등하게 인식.
  - `findChildrenWrapper`에 "element 자식 정확히 1개"(children 없는 leaf, 생산 편집기 형태) 분기 신설 — 바깥 div 자신의 `dataBeBlockId`가 있을 때만 인정해 임의 외부 HTML(`<div><p>...</p></div>` 류) 오인식을 막는다. codeBlock(`pre`)이 2-child 분기(children 컨테이너 형제 있음)에 오면 방어적으로 거절한다 — model `CodeBlock`엔 children 필드가 없어 이 조합은 정상 생산 출력에 나타날 수 없다.
  - 호출부 `ownBlock.type` 허용 목록을 `"paragraph"|"heading"`에서 `"quote"`·`"codeBlock"`까지 확장.
  - id 보존: own-content 태그 자신에 `dataBeBlockId`가 없을 때만(생산 편집기 형태) 바깥 wrapper div의 id로 보충한다. own-export는 안쪽에 이미 id가 있어 그대로 안쪽이 이긴다(기존 계약 불변, 아래 "구현 중 발견" 참고).
- `packages/io/test/html-block-group-wrapper-import.test.ts`(신규) — 10건. 비중첩 단일 블록, paragraph/heading/quote를 부모로 한 중첩, divider·codeBlock을 자식으로 한 중첩, id 보존, 임의 외부 HTML 오인식 방지 2건, codeBlock+blockGroup 조작 입력 방어, `dataBeBlockGroup` sanitize 통과.

## 구현 중 계획과 달랐던 사실

1. `dataBeBlockGroup`은 값이 항상 빈 문자열이라 기존 `propertyString`(빈 문자열을 "없음"으로 접는 관례) 판정으로는 존재를 확인할 수 없었다 — raw property 접근으로 교체.
2. **id 보존 규칙 정정**: 처음엔 "바깥이 항상 이긴다"로 구현했으나 `pnpm --filter @cp949/geul-io test` 전체 실행에서 `html-security-block-boundary.test.ts`의 깊이-체인 회귀(바깥·안쪽에 서로 다른 id를 쓰는 기존 fixture)가 깨졌다 — own-export는 안쪽 own-content 태그 자신이 이미 id를 갖고 바깥 wrapper의 같은 속성은 장식이라는 기존 계약을 발견해 "안쪽에 id가 없을 때만 바깥으로 보충"으로 좁혔다.
3. codeBlock은 model에 children 필드가 없어 `{...ownBlock, children}` 스프레드가 타입 오류를 냈다(`pnpm --filter @cp949/geul-io typecheck`가 실측) — `findChildrenWrapper`에서 `pre`가 2-child 분기에 오면 거절하는 방어 분기를 추가하고 신규 테스트 1건을 더했다.

## 검증

- RED: `pnpm --filter @cp949/geul-io exec vitest run --root ../.. packages/io/test/html-block-group-wrapper-import.test.ts` → 7 failed / 2 passed(구현 전).
- GREEN(중간 단계에서 위 1·2·3번을 순서대로 발견·수정) → 최종 10 passed.
- 회귀 목록(`html-round-trip`·`html-heading-divider`·`html-blockquote`·`html-toggle-import`·`html-check-list-item-import`·`html-security-block-boundary`) → 7 files / 97 tests passed.
- 변이 검증 3건(sanitize allowlist 되돌림, `isOwnBoundaryTag`에서 blockquote/pre 제거, id 오버라이드 비활성화) 모두 계획대로 검출 확인 후 원상 복구.
- `pnpm --filter @cp949/geul-io test`(전체) → 63 files / 505 tests passed(회귀 없음).
- `pnpm --filter @cp949/geul-io typecheck` → 통과.
- `pnpm exec eslint`·`pnpm exec prettier --check`(변경 파일 3개) → 발견 0건.

## 등록한 이슈

없음. Issue #38 완료 댓글은 roadmap(RD-001~006) 전체 완료 시점까지 보류한다(`_works/roadmap/roadmap.md` "전체 완료 조건").

## 남은 제한

- RD-002는 이 DELTA로 `DONE`이다(완료 조건 1~3 전부 실측 증거 충족, `_works/roadmap/RD-002.md`).
- `data-be-code-block` 속성이 sanitize에서 계속 제거된다(codeBlock 인식은 태그명만으로 판정해 구조에 영향 없음) — 순수 경고 노이즈, 이슈 등록 기준 미달.
- RD-003(목록류 production 마커)·RD-004(통합 clipboard 확장, depth-clamp)가 아직 이 결과를 소비하지 않는다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert eaf9c05`. 위험: 낮음 — `io` 패키지 내부 2파일 확장(신규 분기 추가, 기존 경로는 회귀 스위트로 무변경 확인)과 신규 테스트 파일 1개뿐, 소비자 없음(RD-003·RD-004 미착수).
