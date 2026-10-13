---
"@cp949/geul-core": patch
---

Backspace가 문서를 바꾸지 않는데 undo 단위를 남기던 경우를 고친다. 이제 문서와 undo 이력은 그대로고 캐럿만 앞 블록 끝으로 옮겨 간다.

- 마지막 블록이 heading, 목록 항목, divider, 표, 자식 딸린 문단일 때 자동 trailing 문단 선두의 Backspace가 그 문단을 지웠다가 새 blockId로 되붙이던 것이 사라진다.
- 캐럿은 병합 접점으로 이동한다. 접힌 toggle 뒤에서는 숨은 자손이 아니라 toggle 라벨 끝으로 간다.
- Mod-Backspace와 Shift-Backspace도 같다.
- 앞 블록이 자식 없는 문단이면 빈 마지막 문단은 이전처럼 Backspace로 지워진다.
- 마지막 빈 문단에 색이나 정렬이 있으면 Backspace가 이전처럼 병합해 그 속성을 지운다. 속성이 사라지므로 실제 변화다.
- 마지막 코드 블록 뒤 trailing 문단의 Backspace는 이전처럼 코드 블록을 문단으로 흡수한다.
