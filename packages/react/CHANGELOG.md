# @cp949/geul-react

## 0.1.1

### Patch Changes

- - 코드블록에 wrap 토글, caption(클릭 편집), toolbar(복사·삭제·hover 노출) 추가
  - 미디어 4종 블록에 기본 margin과 caption 클릭 편집 추가, toolbar를 more 메뉴로 재설계해 다음 블록과의 겹침 제거
  - 표 인접, atom(구분선·미디어) 인접 Backspace/Delete가 선택 대신 건너뛰어 병합하도록 수정
  - 표 셀 화살표 키 이동 stale selection, 토글 블록 Backspace 오동작, 블록 경계 밖 클릭 시 커서 미생성 결함 수정
  - CodeBlock↔Text 경계 병합/분리, selection copy-paste, toolbar 상호 배타성 등 CodeBlock 결함 다수 수정
  - 미디어 caption 레이아웃(문서 flow 높이 미반영, 좌측 정렬 미추종, 코드블록 caption 간격) 결함 수정
  - markdown list 중첩 파싱에 사전 스캔 가드를 추가해 초선형 시간 폭발(DoS) 취약점 차단
  - sass 전이 의존 immutable을 5.1.9로 올려 Dependabot 취약점 2건 해소, devDependencies 9개 minor 업그레이드
- Updated dependencies
  - @cp949/geul-core@0.1.1
