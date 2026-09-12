import { Extension } from "@tiptap/core";
import { isInTable } from "@tiptap/pm/tables";

// heading(level 2~6)/paragraph/quote/list-item(bullet/numbered/check/toggle
// 4종)에서 Shift+Enter로 같은 블록 안에 hardBreak(줄바꿈)를 삽입한다(RD-002,
// 그릴링 결정 Q3 — soft line break, 새 블록/셀 생성 아님). heading level
// 1(h1)은 완전히 무시한다(그릴링 결정 Q2 — 여러 줄 입력 대상이 아니다).
//
// 대상 노드 타입을 명시적으로 허용 목록으로 판정한다 — "스키마가 알아서
// 거부하겠지"에 기대지 않는다. 실측 결과 codeBlock(content: "text*")
// 안에서도 editor.commands.insertContent({type:"hardBreak"})가 조용히
// 성공해(Tiptap이 유효한 인접 위치를 찾아 끼워 넣는다) hardBreak가
// 생겼다 — RD-002 DELTA-01 RED 사이클에서 발견. table 안은 이 허용
// 목록에 넣지 않고 isInTable로 먼저 걸러 table-keyboard-extension.ts
// (RD-003)에 위임한다.
const HARD_BREAK_TARGET_NODE_TYPES: ReadonlySet<string> = new Set([
  "paragraph",
  "heading",
  "quote",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "toggleListItem",
]);

export const HardBreakKeyboardExtension = Extension.create({
  name: "hardBreakKeyboard",
  addKeyboardShortcuts() {
    return {
      "Shift-Enter": () => {
        if (isInTable(this.editor.state)) return false;

        const { $from } = this.editor.state.selection;
        const parentType = $from.parent.type.name;
        if (!HARD_BREAK_TARGET_NODE_TYPES.has(parentType)) return false;
        if (parentType === "heading" && $from.parent.attrs.level === 1) {
          return true;
        }

        return this.editor.chain().insertContent({ type: "hardBreak" }).run();
      },
    };
  },
});
