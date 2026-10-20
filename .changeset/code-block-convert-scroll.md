---
"@cp949/geul-core": patch
---

`setBlockType`이 일반 블록을 코드 블록으로, 코드 블록을 일반 블록으로 바꾸면 결과 selection이 화면 안으로 스크롤된다. 코드 블록 언어만 바꿀 때는 selection을 옮기지 않으므로 스크롤하지 않는다.
