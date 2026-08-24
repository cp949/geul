# G-WKS-004 lint와 gate 변경은 실제 계약을 끝까지 흘려 검증한다

- 상태: `ACTIVE`
- 적용 조건: lint autofix, validator, source enumeration 또는 copy detector 변경
- 관련 함정: [`PIT-0027`](../pitfalls/PIT-0027-define-what-a-validator-accepts-not-what-it-rejects.md), [`PIT-0029`](../pitfalls/PIT-0029-verify-pnpm-passthrough-flags-reach-the-real-command.md), [`PIT-0035`](../pitfalls/PIT-0035-treat-copy-detection-scan-passes-as-partial-coverage.md)

## 구현 규칙

- lint autofix는 대상 API의 실제 type과 대조하고 lint와 typecheck를 모두 다시 실행한다.
- validator는 정확한 허용 집합을 정의하고 여집합 입력을 테스트한다.
- source 열거·copy detection 축을 늘리기 전에 추적 source 전량을 새 token으로 스캔한다.
- 허용된 입력을 최종 gate까지 흘려 exit code와 검사 대상 수를 확인한다.
- 임시 CLI flag는 실행 로그의 실제 command line에 추가 `--` 없이 도달했는지 확인한다.

## 완료 기준

검사 술어를 비우거나 범위를 줄이는 변이, 실제 type을 어긋나게 하는 변이가 관련 test 또는 typecheck를 RED로 만든다.
