---
status: accepted
---

# BlockNote는 행동 기준선으로만 사용한다

Geul은 BlockNote v0.54.0의 MPL-2.0 패키지가 제공하는 제품 기능을 parity 기준선으로 사용하되 BlockNote의 코드, 컴포넌트, 스타일, 아이콘, 공개 API와 저장 포맷을 복제하거나 호환 목표로 삼지 않는다. 직접 호환은 기능 조사와 전환 비용을 낮출 수 있지만 독자 공개 계약과 시각 설계를 제한하고 라이선스 경계를 흐린다. `xl-*`, GPL/AGPL, 상용 패키지는 기준선에서 제외하고, 기준 버전 변경은 자동 추종이 아닌 별도 gap review로 결정한다.

## Consequences

- parity는 같은 사용자 결과를 뜻하며 같은 내부 구조나 픽셀 복제를 뜻하지 않는다.
- BlockNote 기준 버전과 commit을 제품 인벤토리에 고정한다.
- 독자 기능과 강화 기능은 `CUSTOM` 또는 `ENHANCED`로 명시한다.
