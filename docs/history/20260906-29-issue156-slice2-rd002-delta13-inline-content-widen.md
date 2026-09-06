# Issue #156 슬라이스2 RD-002 DELTA-13 — `model`의 `InlineContent`를 `InlineContentItem[]`로 위젠

## 목표

roadmap-workflow RD-002의 열세 번째 DELTA. `model`의 `InlineContent`(기존 8종 nestable/codeBlock content, table 셀 content가 공유하는 배열)를 `InlineContentItem[]`(텍스트 런 | `{type:"custom"}` 커스텀 원소, EXT-002)로 위젠하고, 텍스트 런의 `marks`가 `CustomTextMark`(EXT-003)도 받아들이게 한다. DELTA-12 착수 전 재조사로 이 위젠이 아직 하나도 안 됐고 파급 범위가 `Document`/`Block[]` 위젠(DELTA-01~10a, 10개 DELTA)과 같은 규모임을 확인해 미뤄 뒀던 것을 이번에 시작한다 — `model` 패키지 안에서 끝난다(DELTA-01과 같은 패턴). `core`/`io` 소비처 정리와 `customInlineContent`/`customStyles` registry 배선은 DELTA-14+로 넘긴다.

## 확정 커밋

- `a81257e` — feat(model): InlineContent를 InlineContentItem[]로 위젠(RD-002-DELTA-13)

## 변경한 계약과 파일

- `packages/model/src/types.ts` — `InlineContent = InlineContentItem[]`로 위젠(기존 "core/react/io가 즉시 깨진다" 이연 문구 제거, 이번에 실제로 배선).
- `packages/model/src/inline-content-kind.ts`(신규) — `isTextRunItem` predicate. `InlineContentItem`의 두 변형(텍스트 런 | 커스텀)을 `"type" in item`으로 구분한다. `schema.ts`(zod 의존)와 `inline-content-merge.ts`(zod 미의존) 양쪽이 재사용해야 해서 `schema.ts`가 아닌 전용 파일에 뒀다(`block-kind.ts`와 같은 결).
- `packages/model/src/schema.ts`:
  - `inlineContentSchema`를 `z.lazy((): z.ZodType<InlineContentItem[]> => z.array(inlineContentItemSchema))`로 교체 — `inlineContentItemSchema`(RD-001-DELTA-02가 이미 추가한 라우팅 스키마)가 파일 아래쪽에 있어 순방향 참조가 필요한데, 재귀 `children` 필드가 뒤에 오는 `blockSchema`를 참조하는 기존 `z.lazy` 전례를 그대로 재사용해 파일을 재배치하지 않았다.
  - `isKnownTextMarkType` 신규 export(`KNOWN_TEXT_MARK_TYPES`를 감싼 predicate, `isKnownBlockType`과 동일 패턴).
  - `validateContent`: 커스텀 inline 원소는 `continue`(envelope은 zod가 이미 검증), 텍스트 런의 `marks`는 "알려진 마크만" 필터링해 링크·색상·중복 link·canonical 순서 4개 판정을 원본 인덱스로 되짚어 수행 — `CustomTextMark.type: string`(비literal)이 discriminated union 좁히기를 흐리는 문제(`CustomBlock.type`과 동일 원인, DELTA-01 "설계 발견")를 이 필터링으로 우회했다.
  - `validateBlocksAt`의 `codeBlock` 분기 — `known.content[0]`을 `isTextRunItem`으로 좁힌 뒤 `.text` 접근(새 거절 로직 아님, 순수 타입 좁히기 — `codeBlockContentSchema`가 이미 커스텀 원소를 거절한다).
- `packages/model/src/inline-content-merge.ts` — `appendOrMergeInlineItem`의 `previous`를 `isTextRunItem`으로 좁혀 `.text`/`.marks` 접근(이 함수는 텍스트 런만 push하므로 실제로는 항상 텍스트 런).
- `packages/model/src/index.ts` — `isKnownTextMarkType`, `isTextRunItem` 재수출.
- `packages/model/test/document-custom-inline-content.test.ts` — 신규 describe 블록(5 tests): paragraph content 안 커스텀 원소 round-trip, 알려지지 않은 mark, table 셀 content, 알려진 마크 canonical 순서 위반의 원본 인덱스 보존, codeBlock 커스텀 원소 거절(characterization).
- `packages/model/test/{code-block,document-mark-ordering}.test.ts` — 위젠으로 깨진 기존 typecheck 캐스트 보정(`content[0]`을 `isTextRunItem`/명시 캐스트로 좁힘, 두 fixture 모두 텍스트 런만 담아 안전).

## 검증

- RED→GREEN: 계획한 5개 완료 조건 중 4개를 신규 테스트로 작성 → 전부 계획대로 RED(옛 `inlineContentSchema`가 `type:"custom"`/미등록 마크를 거절) → 구현 후 4/4 GREEN. 5번째(codeBlock 거절)는 characterization으로 사전 통과.
- post-fix mutation 3건 전부 의도한 대로 정확히 실패 확인 후 원복: `inlineContentSchema`를 옛 좁은 정의로 되돌림(신규 4건 정확히 실패) / canonical-순서 위반 인덱스 되짚기를 필터된 인덱스 그대로 쓰게 바꿈(canonical 순서 테스트만 정확히 실패, 다른 3건은 영향 없음 — 격리 확인) / `isTextRunItem` 판별 조건 반전(기존 스위트 47개 테스트 연쇄 실패 — 전체 텍스트 검증의 전제임을 확인).
- `pnpm --filter @cp949/geul-model test`(전체) — 27 files / 410 tests passed(기존 405 + 신규 5). 회귀 없음.
- `pnpm --filter @cp949/geul-model typecheck` — 0건(src+test). `npx eslint`(변경 파일 전체) — 0 문제.
- 소비처 영향 실측(정보용, 이 DELTA의 완료 조건 아님, DELTA-14+ 계획 입력) — `model` build 후 `core`/`io`/`react`의 stale `tsbuildinfo` 삭제 재측정: `core` src 1파일(`model-to-tiptap.ts`)/9곳, `core` test 7파일/32곳(project reference로 `io` src 8파일/39곳 포함), `io` test 3파일/7곳, `react` 0건.
- `pnpm --filter @cp949/geul-core test` — `public-types.test.ts`(내부에서 `tsc -b` 실행) 1건만 실패, 나머지 1561 passed + 1 skipped(변화 없음) — DELTA-02 착수 전과 동일한 기존 패턴("DELTA-14까지는 이 테스트가 실패하는 게 알려진 상태"). `pnpm --filter @cp949/geul-io test`(639)·`pnpm --filter @cp949/geul-react test`(505) — 둘 다 변화 없음(vitest가 tsc 전체 검사를 타지 않아 typecheck 에러와 무관하게 통과, DELTA-05 착수 전 발견과 동일 이유).

## 등록한 이슈

없음.

## 남은 위험

- `CustomTextMark`와 알려진 마크가 섞였을 때의 배열 내 순서 정책(예: 커스텀 마크가 항상 맨 끝에 와야 하는지)은 spec §4.2가 정하지 않아 판단하지 않았다 — 현재 구현은 원본 위치를 그대로 보존하고 "알려진 마크끼리만" canonical 순서를 판정한다. `customStyles` registry 배선(DELTA-14+)에서 필요해지면 재검토한다.
- `core`/`io`의 typecheck 에러(위 실측)는 이번 DELTA가 의도적으로 남긴 것이다(DELTA-01→02/03과 동일 패턴) — `pnpm verify`/`core`의 `public-types.test.ts`는 DELTA-14 완료 전까지 실패 상태로 남는다.
- RD-002는 아직 `ACTIVE`(DELTA-14+: `core`/`io` 소비처 typecheck 정리 → `customInlineContent`/`customStyles` registry 배선 남음). 완료 조건 3개 중 "PM 노드가 스키마에 등록되지 않는다"만 DELTA-12로 충족, 나머지 둘은 미충족.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — RD-002 전체 완료 기준 대비 부분 진행이다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert a81257e`. 위험: 낮음 — 위젠은 순수 추가적 변경이라(기존 텍스트 런/8종 마크 문서는 필터링이 no-op) `pnpm --filter @cp949/geul-model test`가 기존 405개 테스트 그대로 통과함을 확인했다. 신규 export(`isKnownTextMarkType`, `isTextRunItem`)만 추가돼 기존 공개 계약을 깨지 않는다. 단, `core`/`io`의 typecheck 에러는 이 커밋이 노출한 것이므로(DELTA-14 착수 전 되돌리면 그 typecheck 에러도 함께 사라진다) 되돌리기 전에 DELTA-14 진행 여부를 먼저 확인한다.
