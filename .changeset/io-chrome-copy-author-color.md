---
"@cp949/geul-io": patch
---

Chrome 복사의 계산 스타일 덤프가 붙은 요소에서 작성자가 쓴 색·배경을 읽는다. 색 `span`을 통째로 포함한 복사에서 색이 사라지던 결함을 고친다.

- 덤프 표식(`style`의 `-webkit-text-stroke-width` 선언)이 있는 요소는 표식 뒤의 마지막 `text-decoration*` 선언 뒤의 선언만 색·배경으로 읽는다. 표식 앞의 `text-decoration*`은 앵커가 아니다. 앵커가 없으면 색을 읽지 않는다.
- Chromium 153은 요소를 통째로 포함한 복사에서 작성자 `color`·`background-color`를 덤프 맨 끝에 붙인다. 같은 속성의 테마 값은 덤프에서 빠진다.
- 줄임 `text-decoration`을 같이 건 `span`도 읽는다.
- `importHtml` 문단, `importHtml` 표 셀, 클립보드 표 셀이 같다. 적용 요소는 `span`·`b`·`strong`·`em`·`i`·`code`·`font`·`mark`와 블록(`p`·`h1`–`h6`·`blockquote`)·`table`이다.
- 작성자 색이 없는 덤프 요소는 이전처럼 색 마크가 없다. 서식 선언은 지금처럼 style 전체에서 읽는다.
- 한계: 요소 안쪽만 복사하면 작성자 색이 덤프 맨 앞에 와서 테마 색과 구분할 수 없다. 읽지 않는다.
- 한계: 색 `span`이 문단의 유일한 자식인 복사도 같은 이유로 읽지 않는다.
- 한계: `u`·`s`·`del`·`strike`·`a`는 `text-decoration*` 선언이 없고 작성자 배경이 테마 배경과 같은 자리에 와서 읽지 않는다.
- 한계: 스타일시트 클래스로 `text-decoration`을 받은 요소는 `text-decoration`이 `style`의 첫 선언(표식 앞)에 와서 읽지 않는다. 인라인 `color`·`background-color`를 같이 걸어도 같다. 테마 색이 작성자 색으로 박히는 오독을 막는다. 밑줄·취소선·굵게 서식은 읽는다.
- 한계: Chromium 153.0.8010.12 한 종에서 잰 직렬화 순서에 기댄다. Firefox·Safari는 측정하지 않았다.
