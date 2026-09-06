import { createGenericTextCommands } from "./generic-text-commands.js";
import { createGenericBlockTypeCommands } from "./generic-block-type-commands.js";
import { createGenericBlockMoveCommands } from "./generic-block-move-commands.js";
import { createGenericBlockDuplicateCommands } from "./generic-block-duplicate-commands.js";
import { createGenericBlockDeleteCommands } from "./generic-block-delete-commands.js";
import { createGenericBlockNestingCommands } from "./generic-block-nesting-commands.js";
import type { ProductionEditorSession } from "./production-editor-session.js";

// 일반 블록 명령 14종(text·타입·이동·복제·삭제·중첩 6개 factory에 위임하는
// 얇은 wrapper) 묶음. 각 factory는 session 하나만 받는 독립 단위라 서로
// 교차 참조 없이 이 파일에서 합성만 한다(table-command-glue.ts가
// table-commands.ts/table-paste-commands.ts를 합성하는 것과 같은 패턴).
export const createGenericBlockCommands = (
  session: ProductionEditorSession,
) => ({
  ...createGenericTextCommands(session),
  ...createGenericBlockTypeCommands(session),
  ...createGenericBlockMoveCommands(session),
  ...createGenericBlockDuplicateCommands(session),
  ...createGenericBlockDeleteCommands(session),
  ...createGenericBlockNestingCommands(session),
});
