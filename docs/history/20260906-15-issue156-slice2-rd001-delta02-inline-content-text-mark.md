# Issue #156 슬라이스2 RD-001 DELTA-02 — 커스텀 inline 원소·text mark 추가, RD-001 DONE

## 목표

roadmap-workflow RD-001의 두 번째(마지막) DELTA. `InlineContentItem`(EXT-002, leaf 전용)과 `CustomTextMark`(EXT-003) 저장모델·envelope 검증·라우팅 계층을 DELTA-01과 동일한 패턴으로 추가한다(spec §4.2~§4.3).

## 확정 커밋

- `b157743` — feat(model): 커스텀 inline 원소(EXT-002) + text mark(EXT-003) 저장모델·라우팅 추가

## 변경한 계약과 파일

- `packages/model/src/types.ts` — `CustomTextMark`(id 없는 envelope), `InlineContentItem`(text 런 | `type:"custom"` leaf, marks는 `TextMark | CustomTextMark`) 타입 신설. 기존 `TextMark`/`InlineContent`에는 넣지 않는다.
- `packages/model/src/schema.ts` — `customTextMarkSchema`, `KNOWN_TEXT_MARK_TYPES`(기존 `PLAIN_TEXT_MARK_TYPES` 재사용 + link/textColor/backgroundColor), `textMarkOrCustomSchema`(라우팅), `customInlineContentItemSchema`, `textRunItemSchema`, `inlineContentItemSchema`(`type==="custom"` 리터럴 존재 여부로 라우팅), 신규 export `parseInlineContentItem`.
- `packages/model/src/index.ts` — `CustomTextMark`/`InlineContentItem` 타입, `parseInlineContentItem` 함수 export 추가.
- `packages/model/test/document-custom-inline-content.test.ts`(신규) — 9 tests.

**`Document`/`parseDocument`/기존 `InlineContent`/`inlineContentSchema`는 바꾸지 않았다** — DELTA-01과 동일한 설계 결정(RD-002로 이월).

## 검증

- `pnpm --filter @cp949/geul-model exec vitest run --root ../.. test/document-custom-inline-content.test.ts test/document-custom-block.test.ts` — 19 passed.
- `pnpm --filter @cp949/geul-model test`(전체) — 27 files / 401 tests passed, 사전 결함 없음.
- `pnpm --filter @cp949/geul-model typecheck`/`build` — clean.
- `pnpm --filter @cp949/geul-core typecheck` — clean(순수 추가 export).
- post-fix mutation 검증 2건: (1) `KNOWN_TEXT_MARK_TYPES` 라우팅 조건 반전 → 3/9 실패, (2) `inlineContentItemSchema`의 `type==="custom"` 판별 반전 → 5/9 실패. 둘 다 원복 후 재검증(19 passed).

## RD-001 완료 재대조

DELTA-01+DELTA-02로 RD-001의 완료 조건 4개 전부 실측 증거로 재확인했다(`_works/roadmap/RD-001.md`).

- CustomBlock/InlineContentItem/CustomTextMark가 zod로 파싱되고 JSON round-trip이 원본과 동일 — `document-custom-block.test.ts`("알려지지 않은 type은..."), `document-custom-inline-content.test.ts`("type: custom인 원소는...")
- 알려지지 않은 type/customType이 각각 라우팅됨 — 두 파일의 라우팅 테스트 전체
- 기존 14종 block·8종 mark(4개 schema-union 멤버) 에러 메시지 path·품질 유지 — 두 파일의 `parseDocument` 대조 테스트(paragraph/divider/table, link mark)
- props가 JSON 원시값만 허용 — 두 파일의 중첩 객체·배열 거절 테스트

RD-001 `DONE` 전환.

## 등록한 이슈

없음. 범위 밖 발견 없음.

## 남은 제한

- RD-002(core registry 디스패치)·RD-003(io 손실 정책)이 `_works/roadmap/RD-002.md`/`RD-003.md`에 기록한 대로 `Document`/`parseDocument`/기존 `InlineContent`/`Block[]` 소비처 확장을 이어받는다 — RD-001 `DONE` 전환에 따라 readiness probe를 재실행한다.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — RD-001 완료만으로는 슬라이스2 전체 완료 기준(로드맵 전체 완료 조건)을 충족하지 못해 `issue-tracker.md`의 완료 댓글 기준 미충족.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert b157743`(DELTA-02), 필요시 `git revert 8026b43`(DELTA-01)도 함께. 위험: 낮음 — 신규 파일·타입·함수 추가뿐, 기존 공개 계약 변경 없음.
