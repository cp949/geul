# 20260827-03 chrome83 webServer stale preview 재사용 방지(#123)

- 레인: qq-workflow
- 대상 이슈: #123(종료)
- 작업 브랜치: `fix/123-chrome83-webserver-reuse`(`dev` ff-only 이전 후 삭제)

## 목표

`chrome83` project 전용 `chrome83WebServer` 엔트리의 `reuseExistingServer: !process.env.CI`가 stale preview 서버를 재사용해 거짓 통과·거짓 실패를 만드는 경로를 없앴다(Issue #123). `test:e2e:chrome83`은 `docker run`에 `CI`를 설정하지 않아 로컬 실행에서 항상 재사용을 시도했고, host에 남은 과거 `vite preview` 프로세스를 그대로 서빙해 stale build 위에서 게이트가 통과·실패로 보고될 수 있었다.

레인 선택 근거: 변경 대상이 `playwright.config.ts` 1개 파일, 수 줄로 ff-workflow "크기 규칙" 상한(diff 700줄/파일 6개/전문 2000줄)을 크게 하회했고 분할 신호도 없어 qq로 확정했다.

## 확정 커밋 해시

`dev`는 fast-forward됐다(`269d275..92b82b4`, 재조립 1개 그룹).

| 해시 | 제목 |
| --- | --- |
| `92b82b4` | fix(e2e): chrome83 webServer가 stale preview를 재사용하지 않게 한다 |

작업 브랜치 커밋 2개(단계-2 구현 1 + 단계-3 결함 탐지 수정 1)를 1개 그룹으로 재조립했다 — 결함 탐지 수정(회귀 테스트 추가)이 구현 커밋 자신이 만든 표면(값 변경)의 검증 갭이라 별도 그룹으로 둘 이유가 없었다. `refs/backup/<브랜치>-pre-squash` 대비 트리 diff 2회(재조립 직후, 병합 직전) 모두 빈 출력.

## 바꾼 계약과 파일

- `playwright.config.ts` — `chrome83WebServer` 엔트리의 `reuseExistingServer`를 `!process.env.CI`에서 `false`로 고정. 기본 webServer(포트 5173, dev 서버) 엔트리는 그대로 둠.
- `tests/playwright-webserver-isolation.test.ts` — `reuseExistingServer` 값을 단언하는 회귀 테스트 신설.

파일 2개(`+19/-3`).

## 실행한 검증과 결과

```
pnpm lint                    → 통과
pnpm typecheck:configs       → 통과
pnpm test:e2e:chrome83 (x2, 단계-2)  → 매 실행 GREEN, 임시 표식(TEMP-MARKER-A/B)으로 매 실행 최신 빌드 반영 실측 확인 후 표식 완전 제거
npx vitest run tests/playwright-webserver-isolation.test.ts → RED(구 값)→GREEN(신 값) 확인
pnpm typecheck (재조립 그룹 경계 1곳) → 통과
pnpm verify(전량, 병합 직전 1회)      → 통과(lint/build/typecheck/unit/boundary/license/e2e chromium 83 tests)
git diff --check / git status --short → 클린
```

## 단계-3 결함 탐지

읽기 전용 subagent 1개(diff 범위, AGENTS.md 아키텍처 불변식, guides/pitfalls INDEX 대조) dispatch. F1 "회귀 테스트 없이 버그 수정 커밋됨"(MAJOR, AGENTS.md 구현 규칙 위반)을 확정하고 즉시 수정했다. 그 외 결함 없음 — 아키텍처 불변식, ACTIVE guide/pitfall 전부 이 diff와 무관함을 확인. 상세는 `IMPL-REVIEW-01.md`(작업 폴더, gitignore 대상)가 원본.

## 등록한 이슈와 pitfall

- 완료 댓글 등록 후 #123 종료(https://github.com/cp949/geul/issues/123#issuecomment-5432919423). 신규 이슈·가이드·pitfall 등록 없음 — 발견한 결함(MAJOR 1건)은 이번 diff 안에서 즉시 수정했다.

## 남은 제한

호스트에 고아 상태로 남은 `vite preview` 프로세스가 실제로 재사용되던 원래 버그 시나리오(수정 전 상태)를 직접 재현하지는 않았다 — `reuseExistingServer: false` + `--strictPort` 조합상 포트 4174가 이미 점유돼 있으면 조용한 재사용 대신 시작 실패로 명시적으로 드러나므로 구조적으로 닫힌 위험으로 판단해 범위 밖으로 남겼다.
