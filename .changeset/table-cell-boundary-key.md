---
"@cp949/geul-core": patch
---

표 셀 경계의 Backspace·Delete와 첫 블록이 표일 때의 범위 삭제가 캐럿을 문서 끝으로 보내던 결함을 고친다.

- 셀 맨 앞 Backspace(`Mod-Backspace` 포함)와 셀 맨 끝 Delete(`Mod-Delete` 포함)가 키를 소비하고 문서·selection·undo 스택을 바꾸지 않는다. 이전에는 문서가 그대로인데 캐럿이 문서 끝으로 가고 빈 undo 항목이 남았다. 첫 셀·마지막 셀·빈 셀·중첩 위치 표에서도 수정 후 동작이 같다.
- 같은 표 안 서로 다른 셀에 걸친 범위의 Backspace·Delete도 키를 소비하고 문서를 바꾸지 않는다. 한 셀 안 범위 삭제와 셀 중간 문자 삭제, 셀 맨 앞 Enter는 이전과 같다.
- 첫 블록이 표이고 범위가 첫 셀 시작에서 문서 끝까지면 Backspace·Delete·Cut이 표 구조를 유지하고 텍스트만 지운다. 이전에는 삭제가 통째로 사라졌다.
- 문서 검증이 실패해 변경을 되돌릴 때 selection과 stored mark도 되돌림 전 값으로 복원한다. 이전에는 캐럿이 문서 끝으로 갔다.
