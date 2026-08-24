# G-CNV-002 외부 입력은 sanitize한 의미와 raw warning fact를 분리한다

- 상태: `ACTIVE`
- 적용 조건: HTML·GFM importer, sanitizer, warning 또는 source position recovery 변경

## 구현 규칙

- warning fact는 raw HAST에서 수집하고 독자 문서 의미는 sanitized HAST에서만 만든다.
- raw HAST의 text, URL과 attribute를 결과 문서 생성에 사용하지 않는다.
- 미지원 문법도 보이는 text와 block 경계를 보존한다.
- AST가 잃는 reference 형태는 source position과 원문 slice로 복원한다.
- escaped syntax와 실제 reference를 구분하고, 의미 손실은 종류와 위치가 있는 warning으로 반환한다.
- HTML comment를 element나 실행 가능한 text로 취급하지 않는다.

## 검증

unsafe element·attribute·URL, comment, resolved·missing·collapsed·shortcut·escaped·malformed reference를 각각 fixture로 고정한다.
