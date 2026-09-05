# Issue #152 슬라이스 6 — HTML/GFM round-trip (RD-001·RD-002 DONE, roadmap 완료)

## 목표

R3(파일·미디어 parity) 슬라이스6 — 4종 미디어 블록(`file`/`image`/`video`/`audio`)의 HTML `<figure>`+`<figcaption>`+`data-be-*` export/import와 GFM strict/lossy 손실 정책·image-only 매핑을 구현한다(spec §7). 사용자가 슬라이스1~5와 같은 이유로 roadmap-workflow를 지정했다. roadmap은 2026-09-05~06 두 세션에 걸쳐 실행됐다 — RD-001(HTML)은 첫 세션, RD-002(GFM)는 이어지는 세션이 완료했다.

## 확정 커밋

### RD-001(HTML round-trip)

- `4670928` — feat(io): 미디어 블록 4종 HTML export 구현
- `be8e4cb` — feat(io): 미디어 블록 4종 HTML import 구현
- `d0ee4de` — test(io): 미디어 블록 4종 HTML export-import 연결 round-trip 고정

### RD-002(GFM round-trip)

- `fb66e90` — feat(io): GFM 미디어 블록 손실 분석·export 강등 구현
- `a137274` — feat(io): GFM 미디어 블록 import — 단일 이미지 승격 구현
- `7df2607` — test(io): GFM 미디어 블록 4종 export-import 연결 round-trip 고정

## 변경한 계약과 파일

### RD-001(HTML export/import, `packages/io/src/html/*`)

- **DELTA-01(export)** — `export-html.ts`에 `mediaDataAttributes`/`mediaAnchorNode`/`mediaVisualNode`/`mediaBlockNode` 4개 helper. `data-be-media-type`을 own-format 마커 겸 showPreview:false 강등 시 타입 판별자로, `data-be-name`을 4종 공통 name 단일 진실 공급원으로 도입.
- **DELTA-02(import)** — `sanitize-schema.ts`는 건드리지 않고 `import-html.ts`의 로컬 `htmlImportSanitizeSchema`에만 media 태그 allowlist 추가(공유 목록에 넣으면 clipboard 붙여넣기 sanitize도 상속해 의도치 않게 동작이 바뀐다 — hast-util-sanitize의 `tagNames`가 `strip`보다 항상 우선임을 실측 확인). `block-segmenter.ts`에 `isMediaNode` 노드-레벨 predicate(own-format 마커 확인, `isTableNode`와 같은 시그니처)와 `media` 세그먼트 kind 추가. `mediaTypeFromNode`/`mediaBlockFromNode`로 figure/div/bare 태그 3가지 구조를 디코드, figure 안 media+figcaption 중복 생성 방지 가드. `import-warnings.ts`의 img/audio/video "제거됨" 오보 정정.
- **DELTA-03(연결 round-trip)** — `html-media-round-trip.test.ts` 신규, `exportHtml`→`importHtml` 연결 항등 대조 18개(4종×prop 조합×showPreview 강등 + 혼합 문서 순서 보존). 소스 변경 없음, 최초 실행부터 전부 GREEN.

### RD-002(GFM export/import, `packages/io/src/markdown/*`)

- **DELTA-01(손실 분석 + export)** — `loss-analysis.ts`의 `MarkdownLoss.kind`에 `MEDIA_PREVIEW_WIDTH`/`MEDIA_SHOW_PREVIEW`/`MEDIA_TEXT_ALIGNMENT`/`MEDIA_CAPTION`(spec 명명) + `MEDIA_TYPE_LOST`(spec 미명명, 이 DELTA가 도입) 5개 추가. `backgroundColor`는 신규 kind 없이 기존 `BLOCK_COLOR` 재사용(table의 `CELL_COLOR`와 달리 media에는 별도 location 축이 없다). video/audio/file은 다른 prop과 무관하게 항상 `MEDIA_TYPE_LOST`를 보고한다(`TOGGLE_STATE_LOST`와 동일 논리 — 재import 시 어떤 조합으로도 원래 타입이 복원되지 않는다). `export-markdown.ts`의 `blockNode` placeholder를 실제 image/link mdast 출력으로 교체 — Image는 `showPreview !== false`일 때만 image 구문, 그 외(video/audio/file 전체 + showPreview:false인 image)는 `[name](url)` 링크로 강등(HTML export의 동일 조건 재사용, ADR-0002).
- **DELTA-02(import 승격)** — `import-markdown.ts`에 `imageBlockFromSingleChild` 신규 helper. paragraph가 image/imageReference 노드 하나만 담을 때 ImageBlock으로 승격 — image 타입은 url 유무와 무관하게 항상 승격(`![alt]()`도 정당한 상태), imageReference는 참조가 해석됐을 때만 승격하고 끊어진 참조는 기존 다운그레이드(`IMAGE_DOWNGRADED` + `[identifier]` 텍스트)를 유지해 실패 정보를 보존한다. Video/Audio/File GFM import 경로는 신설하지 않음(spec §7.3 명시) — 확장자 스니핑 없음을 회귀로 고정.
- **DELTA-03(연결 round-trip)** — `markdown-media-round-trip.test.ts` 신규, `exportMarkdown`→`importMarkdown` 연결 11개(Image strict round-trip 2개, 손실 prop별 lossy 강등 5개, video/audio/file lossy 강등 3개, 4종 혼합 문서 1개). 소스 변경 없음, 최초 실행부터 전부 GREEN.

## 구현 중 계획과 달랐던 사실

1. **RD-002 readiness probe가 spec 문면의 nuance 2건을 미리 발견**(DELTA-01 착수 전 확정, 사용자 확인 불필요로 판단 — 내부 enum 값 선택이라 공개 계약에 영향 없음): spec §7.2가 5개 prop(previewWidth/showPreview/textAlignment/backgroundColor/caption)을 "표현 불가"로 나열하지만 새 카테고리는 4개만 명명해 `backgroundColor` 몫이 없었다(→ `BLOCK_COLOR` 재사용으로 해소). "Video/Audio/File은 GFM 표현 수단이 없어 strict 거절"이 prop 값과 무관하게 항상인지 spec 문면이 모호했다(→ `MEDIA_TYPE_LOST` 신설로 해소, `TOGGLE_STATE_LOST` 전례 재사용).
2. **RD-002 완료 조건 자체 재검토·정정**(DELTA-02 완료 시점) — DELTA-01·02 각각의 독립 fixture만으로 "Image strict round-trip" 완료 조건을 성급히 체크했으나, 자체 리뷰에서 `exportMarkdown`→`importMarkdown`을 실제로 연결한 fixture가 없다는 간극을 발견해 체크를 되돌렸다(RD-001이 DELTA-03에서 이 연결을 별도로 고정한 전례와 같은 패턴이었다). DELTA-03이 그 간극을 채웠다.
3. **RD-001 DELTA-02에서 clipboard sanitize 격리 필요성을 실측 발견**(위 "변경한 계약과 파일" 참고) — 계획 단계 가정보다 정밀화, RD-001.md "결정"에 기록.
4. **RD-001 DELTA-02에서 기존 테스트 회귀 1건 발견·수정**(`html-security.test.ts`) — `<img onerror>`가 이제 독립 media 세그먼트로 승격돼 img 태그 자체는 "제거됨"이 아니게 됨(보안 posture는 그대로, onerror 속성은 여전히 제거·경고). 새 정확한 동작에 맞춰 테스트 기대값 갱신.
5. **RD-002 DELTA-01에서 테스트 기대값 오류 1건 발견·수정**(구현 버그 아님) — `remark-stringify`가 링크 텍스트===url이면 autolink `<url>` 구문으로 축약해 내는 라이브러리 동작을 미처 반영하지 못한 기대값을 실제 동작에 맞춰 수정.

## 검증

- `pnpm --filter @cp949/geul-io test` — 71 files / 633 tests(RD-001 완료 시점 67/589, RD-002가 신규 4개 파일·44개 테스트 추가).
- `pnpm --filter @cp949/geul-io exec tsc --noEmit -p .`(tsconfig.json + tsconfig.test.json) · `pnpm lint` · `pnpm run format:check` — 전부 clean(매 DELTA마다 재확인).
- 각 DELTA 완료 시 메인 세션이 직접 RED→GREEN·완료 조건 대조를 수행했다(subagent dispatch 없음, 경량 DELTA 사이클 — roadmap-workflow.md 기본값).

## 등록한 이슈

- 없음. 슬라이스6 완료를 반영한 진행 댓글·체크박스 갱신(Issue #152)과 게시 여부는 이 이력 작성과 별도로 사용자 확인 후 수행한다(슬라이스1~5와 동일한 관례). 슬라이스7(Chromium/Firefox/WebKit 3-엔진 게이트, R3 완료 판정)이 남아 있어 Issue #152 자체는 닫지 않는다 — 슬라이스6 체크박스만 갱신 대상이다.

## 남은 제한

- Chromium/Firefox/WebKit 3-엔진 게이트, R3 완료 판정(슬라이스7)은 이 roadmap 범위 밖 — 다음 착수 대상.
- `docs/product/blocknote-free-feature-inventory.md`·`current-status.md` 갱신은 슬라이스7(R3 전체 완료 판정)로 미룬다 — 슬라이스6 단독으로는 제품 기능 상태가 사용자에게 관찰 가능하게 바뀌지 않는다(HTML/GFM round-trip은 io 계층 내부 계약, R3 전체 완료 시 한 번에 갱신하는 것이 development-lifecycle.md의 기존 관례와 일치).
- push, tag, PR, `dev` → `main` 병합은 실행하지 않았다.

## rollback

RD-001 3개 커밋(`4670928`→`be8e4cb`→`d0ee4de`)과 RD-002 3개 커밋(`fb66e90`→`a137274`→`7df2607`)은 각각 독립 DELTA 순서 의존이다(각 RD 안에서 export→import→연결 round-trip 순). 두 RD는 서로 다른 파일 집합(`html/*` vs `markdown/*`)이라 상호 의존 없이 개별 revert 가능하다. 되돌릴 때는 역순으로 하고 그때마다 `pnpm --filter @cp949/geul-io test`로 재확인한다. 위험: 낮음 — 전부 신규 export/import 분기 추가(feat 커밋)이거나 순수 테스트 추가(test 커밋)라 기존 공개 계약을 깨지 않는다.
