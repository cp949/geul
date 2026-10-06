import { isMacOS, isiOS } from "@tiptap/core";

type KeyHandler = () => boolean;

// Tiptap Keymap이 handleBackspace·handleDelete에 묶는 키 계열의 단일 원본이다
// (Issue #276). Backspace·Delete만 바인딩한 확장은 같은 방향 수식 키가 자기
// 로직을 건너뛰고 Tiptap 기본 체인으로 새는 결함을 낳는다. 예를 들어 input
// rule 복원이나 빈 codeBlock 삭제를 우회한다. Backspace·Delete를 바인딩하는
// 모든 확장이 이 함수로 키를 묶는다.
//
// Mod-Backspace·Shift-Backspace는 backward, Mod-Delete는 forward다. Mac·iOS는
// Ctrl-h·Alt-Backspace(backward)와 Ctrl-d·Ctrl-Alt-Backspace·Alt-Delete·
// Alt-d(forward)를 더한다. 플랫폼 판정은 Tiptap Keymap과 같은 함수다. 그래서
// PC에서는 이 키에 새 동작이 생기지 않는다.
export function deleteKeyBindings(
  direction: "backward" | "forward",
  handler: KeyHandler,
): Record<string, KeyHandler> {
  const keys =
    direction === "backward"
      ? ["Backspace", "Mod-Backspace", "Shift-Backspace"]
      : ["Delete", "Mod-Delete"];
  if (isMacOS() || isiOS()) {
    keys.push(
      ...(direction === "backward"
        ? ["Ctrl-h", "Alt-Backspace"]
        : ["Ctrl-d", "Ctrl-Alt-Backspace", "Alt-Delete", "Alt-d"]),
    );
  }
  return Object.fromEntries(keys.map((key) => [key, handler]));
}
