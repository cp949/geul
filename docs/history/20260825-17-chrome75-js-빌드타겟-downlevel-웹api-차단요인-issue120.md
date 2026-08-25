# 20260825-17 Chrome 75 JS 빌드 타겟·downlevel·Web API 차단 요인 해소(#120), crypto.randomUUID 잔여 결함 분리(#121)

- 레인: ff-workflow (트랙 0~8)
- 대상 이슈: #120(종료)
- 신규 등록: #121
- 작업 브랜치: `feat/120-chrome75-js-downlevel-verify`(`dev` ff-only 이전 후 삭제)

## 목표

Issue #119가 정리한 Chrome 75 차단 요인 5개(TS 빌드 타겟 ES2022, downlevel 단계 부재, Vite build target 미설정, `.at()`/`structuredClone` 미지원 API 사용 8곳, 실제 브라우저 검증 인프라 부재)를 구현으로 해소한다.

## 확정 커밋 해시

| 해시 | 제목 |
| --- | --- |
| `01df416` | feat(build): TS 빌드 타겟을 Chrome75 파싱 가능 수준으로 낮추고 react에 esbuild downlevel 스텝을 추가한다 |
| `f474ec5` | feat(build): demo 프로덕션 빌드 타겟을 Chrome75로 명시한다 |
| `999c10b` | fix(io): inline mark 병합 로직에서 Array.prototype.at()을 인덱스 접근으로 치환한다 |
| `f38f7d4` | fix(core): table-commands의 Array.prototype.at()을 인덱스 접근으로 치환한다 |
| `2457906` | fix(core): editor-controller의 structuredClone을 JSON 왕복 deep-clone으로 치환한다 |
| `bba20e7` | feat(e2e): Chrome83 Docker 실검증 인프라를 추가하고 @tiptap/core의 findLast를 patch로 치환한다 |

작업 브랜치 커밋 12개(트랙-4 구현 9개 + 트랙-6 수정 3개)를 6개 그룹으로 재조립했다. 상쇄 쌍은 없었다 — 전부 순증분이거나 직전 그룹의 같은 파일을 잇는 후속 수정이었다. `89fc1e1`(devDependency 허용목록 반영, DELTA-01 잔여 갭)은 원래 위치(DELTA-04 이후)가 아니라 DELTA-01 그룹(`01df416`)에 결합했다 — `packages/react/package.json`에 `esbuild`를 추가한 그 커밋 자체의 완결을 위해서다. `4aaf469`(cell-text.ts 병합분기 테스트)는 DELTA-03a 그룹(`999c10b`)에, `b71e6d9`(webServer 격리)·`72c61ed`(라이선스 문서 경로 정정)는 DELTA-04 그룹(`bba20e7`)에 결합했다 — 각각 그 그룹이 만든 파일(`playwright.config.ts`, `dependency-licenses.md`)의 자체 결함을 트랙-6이 바로 다음에 고친 것이라 분리된 역사로 남길 값이 없었다. `refs/backup/<브랜치>-pre-squash` 대비 트리 diff 2회(재조립 직후, 병합 직전) 모두 빈 출력. 재조립 그룹 경계 6곳 전부 `pnpm typecheck` 통과. 기준선은 `d87dc5f`, `dev`는 fast-forward됐다(`d87dc5f..bba20e7`).

가이드 정비: `docs/guides/G-WKS-005-run-pnpm-inside-bind-mounted-containers.md` 신규 등록(아래 "등록한 이슈와 가이드" 참고).

## 바꾼 계약과 파일

공개 계약 변경: `packages/react`의 배포 `dist/*.js`가 esbuild downlevel을 거친다(동작 동일, 문법만 Chrome75 호환으로 하향). `pnpm-workspace.yaml`에 `patchedDependencies`(`@tiptap/core@3.30.1`) 추가. 내부 전용(기존 게이트 미포함): `docker/chrome83/`, `test:e2e:chrome83` 스크립트, `chrome83` playwright project.

- `tsconfig.base.json`(target ES2022→ES2019, lib 불변), `packages/react/package.json`(esbuild devDependency + downlevel build 스텝), `pnpm-workspace.yaml`(allowBuilds), `tests/workspace-boundaries.test.ts`(esbuild 허용목록) — DELTA-01.
- `apps/demo/vite.config.ts`(build.target: "chrome75") — DELTA-02.
- `packages/io/src/{clipboard/cell-text.ts, html/import-html.ts, html/inline-content.ts, markdown/import-markdown.ts}`, `packages/io/test/cell-text.test.ts`(신규) — DELTA-03a.
- `packages/core/src/table-commands.ts` — DELTA-03b.
- `packages/core/src/editor-controller.ts`, `packages/core/test/editor-controller-revision.test.ts` — DELTA-03c.
- `docker/chrome83/Dockerfile`(신규), `patches/@tiptap__core@3.30.1.patch`(신규), `packages/core/test/tiptap-core-patch-integrity.test.ts`(신규), `docs/product/dependency-licenses.md`, `playwright.config.ts`, `package.json`, `tests/playwright-webserver-isolation.test.ts`(신규), `tests/tsconfig.json` — DELTA-04 + 트랙-6 F1·F2.

파일 22개(`+740/-103`, `pnpm-lock.yaml` 포함).

## 실행한 검증과 결과

트랙-5 진입 1회, 트랙-6 재실행 1회, 트랙-8 병합 직전 1회 — `pnpm verify` 전량 3회 모두 통과(lint 205 files 오류 0 · build 5/5 · typecheck 전 패키지+configs+e2e+tests+scripts · vitest 72 files/1024 tests · check:boundaries 7 manifests · check:licenses 6 manifests/140 packages · test:e2e chromium 81+firefox 7+webkit 7=95 passed 32.3~32.5s).

```
pnpm test:e2e:chrome83    [chrome83] link-toolbar.spec.ts:7 선택 텍스트에 링크를 만들고 undo 1회로 복원한다 @core — 1 passed
```

재조립 그룹 경계 6곳 전부 `pnpm typecheck` 통과.

트랙-6(결함 탐지, Full 3렌즈, 2회 실행) — 1차 실행에서 F1(MAJOR, `playwright.config.ts`의 `webServer` 배열이 `--project` 필터와 무관하게 항상 기동해 chrome83 전용 build+preview가 기존 3-엔진·perf 게이트에도 결합)·F2(MINOR, `dependency-licenses.md` 패치 경로 오타)·F3(MINOR, `cell-text.ts` 병합분기 테스트 갭) 발견, 전부 수정·재검증 GREEN. 2차 실행(재실행)은 신규 결함 0건 — F1~F3 재발 없음 확인. 두 실행 모두 `crypto.randomUUID()` Chrome75/83 미지원(F5)을 발견했으나 이 이슈의 DELTA-04가 선택한 검증 시나리오를 막지 않아 편입을 강제하지 않고 별도 이슈(#121)로 분리했다(에이전트 결정, D13).

## 남은 제한

- 이슈 완료기준4의 "실제 Chrome 75"는 Chrome83으로 대체됐다 — Playwright(1.0.0~1.62.1 전 버전)가 CDP `Browser.setDownloadBehavior`를 무조건 호출하는데 이 메서드가 Chrome82부터 존재해 Chrome75/76/81에서는 Playwright 자체가 구조적으로 동작하지 않는다(Chromium 소스 bisect로 확인). ADR 0008의 공식 floor(Chrome75)는 바뀌지 않았다.
- `test:e2e:chrome83`은 `--network host`를 써 Linux Docker 전용이다. CI에 포함하지 않았다(로컬·수동 실행 전용).
- `@tiptap/core` 패치는 업스트림이 `findLast` 대신 구식 API로 되돌리거나 Chrome75 지원을 공식화하면 제거 대상이다(ADR 0006 §5).
- **#121로 분리한 잔여 결함**: `crypto.randomUUID()`(Chrome92+)를 기본 ID factory로 쓰는 3곳(`packages/model/src/create-document.ts`, `packages/core/src/{editor-controller.ts,block-id-extension.ts}`)이 실제 Chrome75/83에서 `TypeError`를 던진다 — Enter로 블록 분리, 표 행/열 추가 등 `createId()`를 거치는 대다수 편집 동작이 대상이다.
- 문서 정밀도 수준 갭(grep 오탐, 베이스라인 카운트 불일치)은 `_works/`에 기록만 하고 등록 기준(제품 동작·게이트 구멍·거짓 통과) 미달로 이슈 미등록.

## 등록한 이슈와 가이드

- 신규 이슈 1건 등록: #121(`crypto.randomUUID()` Chrome75/83 미지원, 3곳·2패키지 중복 정의).
- 완료 댓글 1건 등록 후 #120 종료.
- 가이드 신규 등록 1건: `docs/guides/G-WKS-005-run-pnpm-inside-bind-mounted-containers.md`(호스트 저장소를 bind-mount한 Docker 컨테이너 안에서 pnpm deps-status-check가 root 재설치를 강행해 파일 소유권을 오염시키는 문제와 우회법) — DELTA-04 스파이크 중 실제로 겪은 오염 사고(15,824개 파일 root 소유 전환)의 재사용 가능 지식을 `pending-guides/01.md`에서 승격했다. `docs/guides/INDEX.md`에 `G-WKS-005` 행 동기화. pitfall 승격은 없음(반복된 에이전트 오해가 아니라 최초 발견이라 가이드 신설로 충분).

## 절차상 기록

- 리뷰 트랙을 생략하지 않았다 — 트랙-5(발견 0건)와 트랙-6(Full 3렌즈, 2회 실행)을 모두 실행했고 `IMPL-REVIEW-01`~`03`이 남았다.
- 사용자가 트랙-6에서 F5(`crypto.randomUUID`)의 처리 방향("편입" / "분리" / "기타")을 에이전트에게 위임했다 — 실제 결함 범위가 최초 보고보다 넓다는 사실(2패키지 3곳)을 재확인 과정에서 추가로 찾아 "분리"로 판단했다(`01-계획.md` D13).
