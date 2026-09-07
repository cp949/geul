# Issue #156 슬라이스5 RD-002 DELTA-03 — `attributeOverrides.blockGroup` 신설

## 목표

`attributeOverrides.blockGroup`을 신설해 자식 블록 목록 wrapper DOM(`data-geul-block-group`을 가진 div)에 임의 attribute를 주입할 수 있게 한다. DELTA-02의 `mergeAttributeOverrides` 헬퍼를 그대로 재사용한다 — 새 병합 로직 없음.

## 확정 커밋

- `8436505` — feat(core): attributeOverrides.blockGroup 신설 및 배선

## 변경한 계약과 파일

- `packages/core/src/block-container-extension.ts`(`BlockGroupExtension`도 이 파일 소유) — `addOptions`/`.configure()`로 옵션화, `renderHTML`이 `{ ...HTMLAttributes, "data-geul-block-group": "" }`를 base로 `mergeAttributeOverrides` 적용.
- `packages/core/src/production-editor-assembly.ts` — `BlockGroupExtension.configure({ attributeOverrides: options.attributeOverrides?.blockGroup ?? {} })`.
- `packages/core/src/editor-controller-types.ts`/`production-editor-session.ts` — `attributeOverrides.blockGroup` 필드 추가.
- `packages/core/test/attribute-overrides-blockgroup.test.ts`(신규, 3건) — nestable 블록(`paragraphBlock`의 `children`)으로 blockGroup을 실제 렌더시켜 검증.

## 검증

- RED: override 반영·충돌 무시 2건이 배선 전 실패 확인(baseline characterization은 즉시 통과).
- GREEN: `attribute-overrides-blockgroup.test.ts` 3/3, RD-002 신규 테스트 전체(DELTA-01~03) 4 files/15 tests 회귀 없음.
- `pnpm --filter @cp949/geul-core typecheck`, `pnpm --filter @cp949/geul-react typecheck` clean.
- 패키지 전체: `pnpm --filter @cp949/geul-core test` 137 files / 1606 tests 통과.
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-002 진행 상태

DELTA-01~03 완료. 남은 것은 DELTA-04(색상-전환 지점 겸용 시나리오 회귀 테스트) — 충족하면 RD-002 `DONE`, roadmap 전체(슬라이스5) 완료.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스5)가 미완료라 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- 없음 — 신규 optional 필드, 미지정 시 기존 렌더 결과 100% 불변.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 8436505`. 위험: 낮음.
