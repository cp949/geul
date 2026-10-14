---
"@cp949/geul-io": patch
---

Markdown 가져오기가 선두 BOM(U+FEFF)의 유무와 개수에 상관없이 같은 결과를 낸다.

- 이전에는 BOM이 붙은 소스에서 참조 이미지 후처리가 offset을 한 글자 어긋나게 읽었다. BOM이 둘 이상이면 BOM 글자가 문단에 남았다.
- 끊어진 참조 이미지: `IMAGE_DOWNGRADED` 경고와 평문화가 사라지고 `![그림][missing]`이 그대로 남았다.
- list 중첩 가드: 한 줄 안 중첩(`- - - x`)이 BOM에 가려져 `MARKDOWN_LIST_NESTING_TOO_DEEP` 거절을 통과했다.
- 지금은 선두 BOM을 입력 단계에서 모두 떼고 가드·파서·후처리가 같은 문자열을 본다. BOM 없는 소스와 결과가 같다.
- 선두가 아닌 위치의 BOM은 글자로 남긴다.
