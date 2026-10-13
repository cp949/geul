---
"@cp949/geul-io": patch
---

markdown 내보내기가 빈 글자 런과 이모지 옆 여러 겹 mark 런에서 깨진 문자 참조를 출력하던 결함을 고친다.

- 빈 글자 런 뒤의 bold·italic, bold·strike 등 여러 겹 mark 런이 `&#xNAN;`을 출력하던 결함이 고쳐진다.
- 이모지 옆의 여러 겹 mark 런이 깨진 서로게이트를 출력하고 `importMarkdown`이 실패하던 결함이 고쳐진다.
- 원인은 내부 markdown 직렬화 의존 `mdast-util-to-markdown@2.1.2`다. 2.2.0으로 올려서 고친다. 소스 변경은 없다.
- 여러 겹 mark 표기가 `***a***`에서 `**_a_**`로 바뀐다. 재가져오기 결과는 같다.
- 단어 안 밑줄과 링크 글자의 밑줄을 더 이상 `\_`로 이스케이프하지 않는다. 예: `snake\_case`가 `snake_case`로, `한글\_밑줄`이 `한글_밑줄`로 나간다. 재가져오기 결과는 이전과 같다. 단어 가장자리 밑줄(`\_x\_`)은 그대로 이스케이프한다.
- 전이 의존 `micromark-util-character`, `micromark-util-html-tag-name`이 늘어난다. 둘 다 MIT 라이선스다.
