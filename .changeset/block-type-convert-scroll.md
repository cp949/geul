---
"@cp949/geul-core": patch
---

`setBlockType`·`setBlockTypes`와 블록 타입 단축키가 일반 블록 종류를 바꾸면 결과 selection이 화면 안으로 스크롤된다. 변환 뒤 selection이 대상 블록 밖에 있으면(사이드 메뉴 Turn into 등) 스크롤하지 않는다.
