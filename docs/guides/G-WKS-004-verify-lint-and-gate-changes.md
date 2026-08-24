# G-WKS-004 lint와 gate 변경은 실제 계약을 끝까지 흘려 검증한다

- 상태: `ACTIVE`
- 적용 조건: lint autofix, validator, source enumeration 또는 copy detector 변경

## 구현 규칙

- lint autofix는 대상 API의 실제 type과 대조하고 lint와 typecheck를 모두 다시 실행한다.
- validator는 정확한 허용 집합을 정의하고 여집합 입력을 테스트한다.
- source 열거·copy detection 축을 늘리기 전에 추적 source 전량을 새 token으로 스캔한다. 스캔에 걸린 파일은 진짜 사본인지 우연한 동시 등장인지 개별 판정한다 — 사본은 원본을 import해 없애고, 우연한 동시 등장은 길이 가드 + `toContain()` 반복이나 가운뎃점 나열로 표기를 바꿔 재발을 막는다.
- 허용된 입력을 최종 gate까지 흘려 exit code와 검사 대상 수를 확인한다.
- 임시 CLI flag는 실행 로그의 실제 command line에 추가 `--` 없이 도달했는지 확인한다. pnpm pass-through가 의심되면 package 디렉터리에서 `npx vitest run --root ../.. --project <name> <flags>`처럼 실제 명령을 직접 실행한다.

## 완료 기준

검사 술어를 비우거나 범위를 줄이는 변이, 실제 type을 어긋나게 하는 변이가 관련 test 또는 typecheck를 RED로 만든다.
