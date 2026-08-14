# Pitfall Index

다음 계획과 리뷰에서 재사용할 예방 규칙의 탐색 목록이다. 상세 원인과 검증법은 링크된 문서가 소유한다.

| ID | 제목 | 상태 | 영역 | 최초 근거 | 상세 |
| --- | --- | --- | --- | --- | --- |
| `PIT-0001` | 소비자 증거로 패키지 경계 검증 | `ACTIVE` | workspace | R0 | [상세](./PIT-0001-enforce-boundaries-with-consumer-proofs.md) |
| `PIT-0002` | canonicalization과 validation 중앙화 | `ACTIVE` | model·io·core | R0 | [상세](./PIT-0002-centralize-canonicalization-and-validation.md) |
| `PIT-0003` | 편집기 트랜잭션 원자성 유지 | `ACTIVE` | core | R0 | [상세](./PIT-0003-keep-editor-transactions-atomic.md) |
| `PIT-0004` | 저장 배열 대신 논리 테이블 순서 사용 | `ACTIVE` | model·io·core | R0 | [상세](./PIT-0004-use-logical-table-order.md) |
| `PIT-0005` | 미지원 Markdown 원문 의미 보존 | `ACTIVE` | io | R0 | [상세](./PIT-0005-preserve-unsupported-markdown-meaning.md) |
| `PIT-0006` | 배포 산출물 검증 전 build 수행 | `ACTIVE` | build·fixture | R0 | [상세](./PIT-0006-build-before-distribution-verification.md) |
| `PIT-0007` | HTML 경고 수집과 의미 변환 분리 | `ACTIVE` | io·security | R0 | [상세](./PIT-0007-separate-html-warnings-from-semantics.md) |
| `PIT-0008` | 클로저 경계를 넘는 객체 타입 좁히기 회피 | `ACTIVE` | core | R1 | [상세](./PIT-0008-avoid-object-narrowing-across-closures.md) |
