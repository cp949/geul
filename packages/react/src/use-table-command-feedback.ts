import type { EditorError, Result } from "@cp949/geul-core";
import { useCallback, useState } from "react";

/**
 * 표 명령의 Result를 확인해 실패하면 actionError에 남기고, 성공하면
 * actionError를 지우고 onSuccess(있으면)를 호출한다.
 * TableHandleMenu/TableCellFormatMenu는 onSuccess로 onClose를 넘겨 성공
 * 시에만 메뉴를 닫는다. TableSelectionToolbar의 merge/split은 닫을 메뉴가
 * 없어 onSuccess를 생략한다(Issue #66).
 *
 * runCommand/clearActionError를 useCallback으로 안정화한다 —
 * TableSelectionToolbar가 clearActionError를 selection 리스너를 등록하는
 * useEffect의 의존성 배열에 넣는다. 매 렌더 새로 생기는 함수면 그 effect가
 * 매 렌더 리스너를 떼었다 다시 붙인다.
 */
export const useTableCommandFeedback = () => {
  const [actionError, setActionError] = useState<EditorError | null>(null);

  const runCommand = useCallback(
    (run: () => Result<void, EditorError>, onSuccess?: () => void) => {
      const result = run();
      if (result.ok) {
        setActionError(null);
        onSuccess?.();
        return;
      }
      setActionError(result.error);
    },
    [],
  );

  const clearActionError = useCallback(() => setActionError(null), []);

  return { actionError, runCommand, clearActionError };
};
