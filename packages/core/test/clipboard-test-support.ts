/**
 * jsdom Clipboard/Drag 폴리필 설치(side-effect) + 붙여넣기·drop 이벤트
 * dispatch helper + own-export wrapper HTML 조립.
 */

// jsdom(27.x)은 Clipboard API(DataTransfer/ClipboardEvent)를 구현하지 않는다
// (jsdom/jsdom#1568) — 실제 ClipboardEvent를 가로채는 handlePaste 계약을
// 검증하려면 TablePasteExtension이 실제로 사용하는 표면(getData)만 최소로
// 폴리필한다. 이후 jsdom이 네이티브로 지원하게 되면 이 블록은 자동으로
// 건너뛴다.
if (typeof globalThis.DataTransfer === "undefined") {
  class JsdomDataTransfer {
    private readonly store = new Map<string, string>();
    // media-drop-paste-extension.test.ts(RD-002 DELTA-01) 전용 — 실제
    // DataTransfer.files/items는 읽기 전용(FileList/DataTransferItemList)이라
    // 테스트가 값을 채우려면 이 필드에 직접 대입해야 한다(아래
    // dataTransferWithFiles/dataTransferWithEntries가 `as unknown as`로
    // 좁은 범위만 우회한다).
    files: File[] = [];
    items: {
      kind: string;
      getAsFile(): File | null;
      webkitGetAsEntry?: () => { isDirectory: boolean } | null;
    }[] = [];

    setData(format: string, data: string): void {
      this.store.set(format, data);
    }

    getData(format: string): string {
      return this.store.get(format) ?? "";
    }
  }

  globalThis.DataTransfer = JsdomDataTransfer as unknown as typeof DataTransfer;
}

if (typeof globalThis.ClipboardEvent === "undefined") {
  class JsdomClipboardEvent extends Event {
    readonly clipboardData: DataTransfer | null;

    constructor(type: string, eventInit?: ClipboardEventInit) {
      super(type, eventInit);
      this.clipboardData = eventInit?.clipboardData ?? null;
    }
  }

  globalThis.ClipboardEvent =
    JsdomClipboardEvent as unknown as typeof ClipboardEvent;
}

// jsdom(27.x)은 document.elementFromPoint도 구현하지 않는다 — 어떤 플러그인도
// handleDrop을 claim하지 않은 drop 이벤트(no-op 회귀 테스트)에서
// prosemirror-view의 기본 drop 처리(EditorView.posAtCoords 내부)가 이
// 함수를 호출해 "elementFromPoint is not a function"으로 던진다. 실제
// 브라우저는 좌표 아래에 요소가 없으면 null을 반환하므로 그 계약대로
// 최소 폴리필한다(media-drop-paste-extension.test.ts).
if (typeof globalThis.document.elementFromPoint !== "function") {
  globalThis.document.elementFromPoint = () => null;
}

// jsdom(27.x)은 DragEvent도 구현하지 않는다(위 Clipboard 폴리필과 같은
// 이유) — MouseEvent는 jsdom이 실제로 구현해 clientX/clientY를 그대로
// 지원하므로 그 위에 dataTransfer 필드만 얹는다(media-drop-paste-extension
// .test.ts, RD-002 DELTA-01).
if (typeof globalThis.DragEvent === "undefined") {
  class JsdomDragEvent extends MouseEvent {
    readonly dataTransfer: DataTransfer | null;

    constructor(type: string, eventInit?: DragEventInit) {
      super(type, eventInit);
      this.dataTransfer = eventInit?.dataTransfer ?? null;
    }
  }

  globalThis.DragEvent = JsdomDragEvent as unknown as typeof DragEvent;
}

/** files만 채운 DataTransfer를 만든다(clipboard paste — 디렉터리 개념 없음). */
const dataTransferWithFiles = (files: readonly File[]): DataTransfer => {
  const data = new DataTransfer();
  (data as unknown as { files: File[] }).files = [...files];
  return data;
};

/** file+isDirectory 쌍(D8 디렉터리 판정)으로 items·files를 함께 채운 DataTransfer를 만든다(drop 전용). */
const dataTransferWithEntries = (
  entries: readonly { file: File; isDirectory: boolean }[],
): DataTransfer => {
  const data = new DataTransfer();
  (
    data as unknown as {
      items: {
        kind: string;
        getAsFile(): File | null;
        webkitGetAsEntry(): { isDirectory: boolean } | null;
      }[];
    }
  ).items = entries.map((entry) => ({
    kind: "file",
    getAsFile: () => entry.file,
    webkitGetAsEntry: () => ({ isDirectory: entry.isDirectory }),
  }));
  (data as unknown as { files: File[] }).files = entries.map((entry) => entry.file);
  return data;
};

/** clipboardData.files만 채운 paste 이벤트를 dispatch한다(text/html·text/plain 없이 File[]만 있는 실제 clipboard paste와 동형). */
export const pasteFiles = (editable: HTMLElement, files: File[]): void => {
  editable.dispatchEvent(
    new ClipboardEvent("paste", {
      clipboardData: dataTransferWithFiles(files),
      bubbles: true,
      cancelable: true,
    }),
  );
};

/**
 * files와 text/html을 함께 담은 paste 이벤트를 dispatch한다(D4 우선순위
 * 테스트 전용 — 브라우저가 파일 복사에 대체 html도 함께 담는 경우와 동형).
 */
export const pasteFilesAndHtml = (
  editable: HTMLElement,
  files: File[],
  html: string,
): void => {
  const data = dataTransferWithFiles(files);
  data.setData("text/html", html);
  editable.dispatchEvent(
    new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    }),
  );
};

/**
 * 좌표(clientX/clientY)를 가진 drop 이벤트를 dispatch한다. `webkitGetAsEntry`
 * 기반 디렉터리 판정(D8)을 검증할 때만 entries를 쓰고, 일반 파일 drop은
 * `dropFiles`(entries를 전부 `isDirectory: false`로 채우는 축약)를 쓴다.
 */
export const dropEntries = (
  editable: HTMLElement,
  entries: { file: File; isDirectory: boolean }[],
  coords: { clientX: number; clientY: number },
): void => {
  editable.dispatchEvent(
    new DragEvent("drop", {
      dataTransfer: dataTransferWithEntries(entries),
      clientX: coords.clientX,
      clientY: coords.clientY,
      bubbles: true,
      cancelable: true,
    }),
  );
};

/** pasteHtml처럼 pasteData/pasteFiles의 drop 축약 — 파일 전부를 디렉터리 아님으로 채운다. */
export const dropFiles = (
  editable: HTMLElement,
  files: File[],
  coords: { clientX: number; clientY: number },
): void =>
  dropEntries(
    editable,
    files.map((file) => ({ file, isDirectory: false })),
    coords,
  );

/** 주어진 MIME → 문자열 항목을 클립보드 데이터로 담아 editable에 paste 이벤트를 dispatch한다(bubbles·cancelable). */
export const pasteData = (
  editable: HTMLElement,
  entries: Record<string, string>,
): void => {
  const data = new DataTransfer();
  for (const [format, value] of Object.entries(entries))
    data.setData(format, value);
  editable.dispatchEvent(
    new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    }),
  );
};

/** text/html 하나만 담는 pasteData 축약. */
export const pasteHtml = (editable: HTMLElement, html: string): void =>
  pasteData(editable, { "text/html": html });

/**
 * jsdom dispatchEvent는 리스너 예외를 재던지지 않는다 — window의 전역
 * error 이벤트로만 실제 미처리 예외 유무를 잡는다. quote-paste-fallback.
 * test.ts가 인라인으로 처음 쓴 패턴을 옛 list-paste-fallback.test.ts(삭제
 * 됨, RD-005)가 로컬 헬퍼로 옮겼고, clipboard-paste-extension.test.ts가
 * 세 번째 소비 파일로 등장해 여기로 승격했다(G-TST-002).
 * clipboard-paste-list.test.ts(RD-005)도 이 헬퍼를 쓴다.
 */
export const withUnhandledErrorTracking = (
  run: (errors: unknown[]) => void,
): void => {
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => errors.push(event.error);
  window.addEventListener("error", onError);
  try {
    run(errors);
  } finally {
    window.removeEventListener("error", onError);
  }
};

/**
 * depth단짜리 own-export 형태 wrapper HTML 체인 — 가장 바깥이 top-level,
 * 안쪽으로 갈수록 한 단씩 중첩된다(`html-depth-support.ts`의
 * buildNestedWrapperHtml과 같은 구조, io/core 패키지 경계 때문에 코드는
 * 독립 작성). 리프는 `t<depth>`, 나머지는 own-export의 두 own-content
 * 자리(자기 자신 + dataBeChildren 컨테이너) 형태를 그대로 쓴다.
 * clipboard-paste-extension.test.ts가 인라인으로 처음 썼고,
 * clipboard-paste-priority.test.ts(RD-006 DELTA-01)가 두 번째 소비 파일로
 * 등장해 여기로 승격했다(G-TST-002).
 */
export const nestedParagraphWrapperHtml = (depth: number): string => {
  let html = "";
  for (let level = depth; level >= 1; level -= 1) {
    html = `<div data-be-block-id="w${level}"><p data-be-block-id="p${level}">t${level}</p><div data-be-children="1">${html}</div></div>`;
  }
  return html;
};
