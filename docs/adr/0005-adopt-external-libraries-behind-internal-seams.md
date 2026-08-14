---
status: accepted
---

# 외부 라이브러리는 내부 seam 뒤에서 선택적으로 사용한다

Geul은 저장 형식, 편집 transaction, TableGrid 연산, 명령·오류와 변환 의미론을 직접 소유하고, 브라우저 geometry·구문 강조·압축처럼 이미 풀린 범용 문제만 외부 라이브러리로 해결한다. 범용 스택을 선제 도입하면 사용하지 않는 상태 모델과 설정이 공개 계약에 스며들고, 외부 의존성을 모두 피하면 검증된 플랫폼 문제를 반복 구현하게 된다. 따라서 실제 요구가 확인된 capability만 책임 seam 단위로 채택하고, 구현 라이브러리의 타입·설정과 상태 권한은 Geul의 소비자 interface에 노출하지 않는다.

## Consequences

- 각 기능 spec은 저장 원본, 편집 transaction, 복제 운영 상태, 외부 store와 projection의 권한 및 변환 방향을 명시한다. 같은 책임에는 계획되지 않은 두 번째 권한을 만들지 않는다.
- 같은 의미론적 책임은 Geul 구현과 외부 라이브러리가 나눠 소유하지 않는다. 서로 독립된 capability는 필요한 seam만 채택할 수 있다.
- ADR 0002의 package 방향과 공개 declaration 경계를 유지하고, 구현 라이브러리의 타입·설정·source scan을 소비자에게 요구하지 않는다.
- 설치되는 direct dependency와 devDependency는 exact version으로 고정한다. host runtime의 peer range는 publication 계약에서 호환 범위·test matrix·자동 검사 예외를 함께 승인한 경우에만 허용한다.
- 후보는 exact registry snapshot과 배포 tarball의 public types·문서·필요한 구현을 owner source로 판정한다. 라이선스, install script, 전이 그래프와 유지보수·배포 채널 위험을 기록하고, 문서만으로 실행 적합성을 확정할 수 없을 때만 폐기 가능한 spike를 수행한다.
- 선택 기능의 JavaScript, CSS와 font asset은 default export와 기본 stylesheet에서 격리하고, 기본·선택 consumer fixture로 전달 비용과 설정 누출을 검증한다.
- 개별 라이브러리, 버전과 도입 순서는 이 ADR이 고정하지 않는다. 해당 기능의 spec과 GitHub Issue가 현재 후보, 승인 gate, 검증 결과와 rollback 단위를 소유하며 의존성 추가 시 license 문서와 자동 검사를 함께 갱신한다.
