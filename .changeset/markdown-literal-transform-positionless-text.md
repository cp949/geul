---
"@cp949/geul-io": patch
---

Markdown 가져오기가 이스케이프 URL·NBSP·`\@`와 같은 text에 있는 끊어진 참조 이미지도 평문으로 내리고 경고를 붙인다.

- 이전에는 `https\://a.com ![a][x]`의 `![a][x]`가 원문으로 남고 경고가 없었다.
- 원인: remark-gfm의 autolink literal 변환이 text를 쪼개 위치(`position`)를 지웠다. 위치 없는 text는 소스와 맞출 수 없었다.
- 지금은 파서에서 그 변환만 끈다. 위 입력은 `https://a.com a [x]`와 `IMAGE_DOWNGRADED` 경고 1건을 낸다.
- literal은 이전처럼 link 없는 평문으로 가져온다. 명시 링크와 정의 있는 참조 이미지의 결과는 같다.
