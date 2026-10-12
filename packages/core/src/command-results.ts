import type { Result } from "@cp949/geul-model";

import type { EditorError } from "./errors.js";

// 명령이 대상에 적용되지 않을 때의 공통 결과. leaf라 어느 명령 파일이든
// 순환 의존 없이 import한다. production-editor-session.ts가 같은 이름으로
// re-export하므로 기존 import 경로도 그대로 동작한다.
export const commandNotApplicable = (
  command: string,
): Result<never, EditorError> => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});

export const blockNotFound = (blockId: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "BLOCK_NOT_FOUND", blockId },
});
