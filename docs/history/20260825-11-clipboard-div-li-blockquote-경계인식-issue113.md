# 20260825-11 clipboard-table-parser.ts div/li/blockquote 문단 경계 인식(#113)

- 레인: qq-workflow (단계 1~4)
- 대상 이슈: #113(종료)
- 작업 브랜치: `fix/113-clipboard-div-li-blockquote-boundary`(`dev` ff-only 이전 후 삭제)

## 목표

혼합 클립보드 붙여넣기에서 `div`/`li`/`blockquote`가 문단 경계로 인식되지 않아 인접 블록과 구분자 없이 병합되는 문제를 고친다(발단 #72).

## 확정 커밋 해시

| 해시 | 제목 |
| --- | --- |
| `b44c5df` | fix(io): 클립보드 붙여넣기에서 div/li/blockquote를 문단 경계로 인식한다 |

작업 브랜치 커밋은 1개(단계-2 구현)뿐이었다 — 단계-3 결함 탐지에서 발견이 없어 후속 수정 커밋이 생기지 않았다. 재조립(cherry-pick 그룹핑)이 필요 없어 생략하고 `dev`로 직접 fast-forward 이전했다(`1ce6346..b44c5df`).

## 바꾼 계약과 파일

공개 계약 변경 없음(내부 클립보드 파서 동작만 변경 — `importHtml`이 쓰는 공유 `htmlAllowedTagNames`는 그대로다).

- `packages/io/src/html/sanitize-schema.ts`(+16/-4) — 클립보드 전용 `clipboardAllowedTagNames`에 `div`/`li`/`blockquote`/`ul`/`ol` 추가(h4~h6 확장과 같은 자리·같은 이유).
- `packages/io/src/clipboard/clipboard-table-parser.ts`(+33) — `blockSequenceFromNodes`에 `div`/`li`/`blockquote` 문단 경계 분기(`flush()`로 감싼 재귀)와 `ul`/`ol` 순수 wrapper 분기(경계 아님, 재귀만) 추가.
- `packages/io/test/clipboard-mixed-content.test.ts`(-152, 순수 이동분 제외 실질 변화 없음) — heading 경계 테스트 6개를 새 파일로 이동.
- `packages/io/test/clipboard-mixed-content-block-boundary.test.ts`(+279, 신규) — 이동한 heading 테스트 6개 + div/li/blockquote/ul/ol 경계 회귀 테스트 5개(연속 div, ul/ol 안 li, blockquote, 중첩 표 보존, 중첩 li).

파일 4개(`+329/-151`).

## 실행한 검증과 결과

단계-3 진입, 단계-4 병합 직전 `pnpm verify` 전량 2회 모두 통과(biome 4 infos 범위 밖·이동된 기존 코드·unit `vitest run` 69 files/1013 tests·boundary·license 통과·e2e chromium+firefox+webkit 115 passed 39.3~39.5s).

```
pnpm --filter @cp949/geul-io exec vitest run --root ../.. test/clipboard-mixed-content.test.ts test/clipboard-mixed-content-block-boundary.test.ts   23 passed (23)
pnpm --filter @cp949/geul-io test                                                                                                                     18 files / 189 passed
pnpm test                                                                                                                                              69 files / 1013 passed
```

결함 탐지 리뷰(단계-3, 읽기 전용 subagent) — G-CNV-001·G-CNV-002, `AGENTS.md` 아키텍처 불변식(sanitized HAST 전용 사용, `Result<T,E>` 계약) 대조. 발견 없음(PASS) — div/li/blockquote와 p/heading 조합 11개 케이스(중첩 p/heading, 빈 요소, `<ul><table>` 비정상 중첩 등)를 직접 실행 재현해 회귀 없음을 확인했고, 테스트 분할이 순수 이동임을 `vitest --reporter=json` 제목 비교로 검증했다. 참고로 2000단 이상 중첩에서 스택오버플로를 재현했으나 구버전(이 diff 이전)에서도 동일 임계치로 발생함을 확인해 이번 변경의 회귀가 아니라고 판단, 보고 대상에서 제외했다.

## 남은 제한

- 2000단 이상 깊이로 중첩된 `div`/`li`/`blockquote`를 붙여넣으면 `rehype-parse`(parse5) 단계에서 스택오버플로가 발생한다 — 이번 변경 이전부터 있던 파싱 계층의 선재 특성이라 이번 diff의 회귀가 아니다. 클립보드 실사용에서 비현실적인 깊이라 별도 이슈로 분리하지 않았다(등록 기준 — 제품 동작 변경·게이트 구멍·거짓 통과 — 미충족).
- `ol`의 번호 재정의(`start`/`value`/`reversed`)는 model에 대응 개념이 없어 보존하지 않는다 — 이슈 본문이 "대응 Block 타입 부재"로 이미 범위 밖으로 명시했다.

## 등록한 이슈와 pitfall

- 신규 이슈 등록 없음.
- 완료 댓글 1건 등록([issuecomment-5404787618](https://github.com/cp949/geul/issues/113#issuecomment-5404787618)) 후 #113 종료.
- 가이드·pitfall 등록 없음(적용 함정 없음으로 판정, 새로 드러난 가이드 공백 없음).

## 절차상 기록

- 계획서(01-계획.md)는 `p`의 "flush → pending 치환 → flush" 패턴을 `div`/`li`/`blockquote`가 그대로 재사용할 것을 제안했으나, 단계-2 구현 subagent가 parse5 실측으로 이 세 태그가 서로(그리고 표)를 실제 자식으로 중첩할 수 있음을 먼저 확인하고 `flush()`로 감싼 재귀로 대체했다 — 리터럴 재사용은 중첩된 `li` 등에서 완료 조건 5(충분성 확인)를 만족하지 못했을 것이다. 이 이탈은 계획서가 명시적으로 허용한 "불충분하면 최소 범위로 대응"에 해당하고, 단계-3 결함 탐지가 코드와 별개 실행으로 재확인해 회귀가 없음을 검증했다.
