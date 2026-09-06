import type { Result } from "@cp949/geul-model";

import {
  type InsertCustomBlockError,
  insertCustomBlock as insertCustomBlockCommand,
} from "./custom-block-commands.js";
import {
  type InsertCustomInlineContentError,
  insertCustomInlineContent as insertCustomInlineContentCommand,
} from "./custom-inline-content-commands.js";
import {
  type DividerCommandError,
  insertDivider as insertDividerCommand,
} from "./divider-commands.js";
import type { EditorError } from "./errors.js";
import type { MediaBlockKind } from "./media-block-kind.js";
import {
  type InsertMediaBlockError,
  insertMediaBlock as insertMediaBlockCommand,
} from "./media-commands.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";

// 새 블록을 삽입하는 명령 4종(divider/media/customBlock/customInlineContent)
// 묶음 — 전용 명령 모듈(divider-commands.ts 등)의 Result를
// session.runDocumentCommand의 boolean 위에서 꺼내는 동일 구조 래퍼다.
// editor-controller.ts의 createEditor에서 분리했다 — 다른 커맨드 그룹과
// 교차 참조가 없어 session 하나만 받는 독립 팩토리로 뗀다.
export const createInsertBlockCommands = (session: ProductionEditorSession) => {
  // divider 삽입 명령(divider-commands.ts)의 Result를 session.runDocumentCommand의
  // boolean 위에서 꺼내는 래퍼. runTableCommand를 재사용하지 않는다 — 그
  // 실행기는 TableCommandError 전체(격자 오류 detail 추출·tableErrorFromCode
  // 분기)를 전제하는데 divider 명령의 오류는 BLOCK_NOT_FOUND·
  // TRANSACTION_REJECTED 둘뿐이라 표 의미를 빌릴 이유가 없다.
  //
  // G-EDT-001 회피 규칙: 클로저 밖으로 나오는 값은 mutate만 하는 const 홀더
  // 객체(captured)에 담는다 — runTableCommand의 errorDetail과 같은 형태다.
  // `let x: T | null = null` 원시 캡처는 TS가 클로저 안 대입을 보지 못해
  // 초기 리터럴 null로 좁히고, `x !== null` 블록 안에서 x가 never가 된다 —
  // 비교식이 통과하는 건 never가 모든 타입과 comparable이기 때문이지 좁히기가
  // 옳아서가 아니다(속성 접근·switch로 바꾸면 깨진다). 홀더 객체의 속성은
  // 초기 리터럴로 좁혀지지 않아 클로저 대입 뒤에도 정상 narrowing이다.
  // BLOCK_NOT_FOUND의 blockId는 명령이 조회하는 유일한 블록인 afterBlockId
  // 그 자체라 따로 캡처하지 않는다.
  const insertDivider = (
    afterBlockId: string,
    options?: { clearAfterBlockText?: boolean },
  ): Result<{ blockId: string }, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("insertDivider");
    const captured: {
      code: DividerCommandError["code"] | null;
      blockId: string | null;
    } = { code: null, blockId: null };

    const result = session.runDocumentCommand("insertDivider", "local", () => {
      const outcome = insertDividerCommand(
        session.editor,
        afterBlockId,
        session.createId,
        options,
      );
      if (!outcome.ok) {
        captured.code = outcome.error.code;
        return false;
      }
      captured.blockId = outcome.value.blockId;
      return true;
    });

    if (captured.code !== null) {
      return captured.code === "BLOCK_NOT_FOUND"
        ? {
            ok: false,
            error: { code: "BLOCK_NOT_FOUND", blockId: afterBlockId },
          }
        : { ok: false, error: { code: "TRANSACTION_REJECTED" } };
    }
    if (!result.ok) return result;
    if (captured.blockId === null) {
      return commandNotApplicable("insertDivider");
    }
    return { ok: true, value: { blockId: captured.blockId } };
  };

  // insertDivider 래퍼와 동일 구조(media-commands.ts::insertMediaBlock의
  // Result를 session.runDocumentCommand의 boolean 위에서 꺼낸다) — kind만
  // 추가로 그대로 전달한다. 오류가 BLOCK_NOT_FOUND·TRANSACTION_REJECTED
  // 둘뿐인 것도 divider와 같다(InsertMediaBlockError).
  const insertMediaBlock = (
    afterBlockId: string,
    kind: MediaBlockKind,
    options?: { clearAfterBlockText?: boolean },
  ): Result<{ blockId: string }, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("insertMediaBlock");
    const captured: {
      code: InsertMediaBlockError["code"] | null;
      blockId: string | null;
    } = { code: null, blockId: null };

    const result = session.runDocumentCommand(
      "insertMediaBlock",
      "local",
      () => {
        const outcome = insertMediaBlockCommand(
          session.editor,
          afterBlockId,
          kind,
          session.createId,
          options,
        );
        if (!outcome.ok) {
          captured.code = outcome.error.code;
          return false;
        }
        captured.blockId = outcome.value.blockId;
        return true;
      },
    );

    if (captured.code !== null) {
      return captured.code === "BLOCK_NOT_FOUND"
        ? {
            ok: false,
            error: { code: "BLOCK_NOT_FOUND", blockId: afterBlockId },
          }
        : { ok: false, error: { code: "TRANSACTION_REJECTED" } };
    }
    if (!result.ok) return result;
    if (captured.blockId === null) {
      return commandNotApplicable("insertMediaBlock");
    }
    return { ok: true, value: { blockId: captured.blockId } };
  };

  // insertMediaBlock 래퍼와 동일 구조 — 오류 유니온만 다르다
  // (InsertCustomBlockError, DELTA-11.md "결정" 5).
  const insertCustomBlock = (
    afterBlockId: string,
    type: string,
    content: "none" | "inline",
    props?: Record<string, string | number | boolean | null>,
    options?: { clearAfterBlockText?: boolean },
  ): Result<{ blockId: string }, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("insertCustomBlock");
    const captured: {
      code: InsertCustomBlockError["code"] | null;
      blockId: string | null;
    } = { code: null, blockId: null };

    const result = session.runDocumentCommand(
      "insertCustomBlock",
      "local",
      () => {
        const outcome = insertCustomBlockCommand(
          session.editor,
          afterBlockId,
          type,
          content,
          props,
          session.createId,
          options,
        );
        if (!outcome.ok) {
          captured.code = outcome.error.code;
          return false;
        }
        captured.blockId = outcome.value.blockId;
        return true;
      },
    );

    if (captured.code !== null) {
      if (captured.code === "CUSTOM_BLOCK_TYPE_NOT_REGISTERED") {
        return { ok: false, error: { code: captured.code, type } };
      }
      return captured.code === "BLOCK_NOT_FOUND"
        ? {
            ok: false,
            error: { code: "BLOCK_NOT_FOUND", blockId: afterBlockId },
          }
        : { ok: false, error: { code: "TRANSACTION_REJECTED" } };
    }
    if (!result.ok) return result;
    if (captured.blockId === null) {
      return commandNotApplicable("insertCustomBlock");
    }
    return { ok: true, value: { blockId: captured.blockId } };
  };

  // insertCustomBlock 래퍼와 같은 캡처 구조이지만 afterBlockId가 없다 —
  // 현재 selection(caret)에 삽입한다(RD-002-DELTA-18.md "결정" 5, inline
  // 원소는 model에 id가 없어 block처럼 위치를 식별할 identity가 없다).
  const insertCustomInlineContent = (
    type: string,
    props?: Record<string, string | number | boolean | null>,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) {
      return commandNotApplicable("insertCustomInlineContent");
    }
    const captured: {
      code: InsertCustomInlineContentError["code"] | null;
    } = { code: null };

    const result = session.runDocumentCommand(
      "insertCustomInlineContent",
      "local",
      () => {
        const outcome = insertCustomInlineContentCommand(
          session.editor,
          type,
          props,
        );
        if (!outcome.ok) {
          captured.code = outcome.error.code;
          return false;
        }
        return true;
      },
    );

    if (captured.code !== null) {
      return captured.code === "CUSTOM_INLINE_CONTENT_TYPE_NOT_REGISTERED"
        ? { ok: false, error: { code: captured.code, type } }
        : { ok: false, error: { code: "TRANSACTION_REJECTED" } };
    }
    return result;
  };

  return {
    insertDivider,
    insertMediaBlock,
    insertCustomBlock,
    insertCustomInlineContent,
  };
};
