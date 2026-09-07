// spec §8(EXT-009), RD-001-DELTA-01 — core/react 전역 하드코딩 영어 문구를
// 키로 추출하는 최상위 계약이다. BlockNote의 key 구조·문구는 그대로
// 가져오지 않는다(spec §8.2, geul UI 컴포넌트 구성이 달라 1:1 매핑이
// 성립하지 않는다) — geul 자체 문구 목록을 기준으로 새로 설계한다.
//
// `placeholder`는 이 DELTA가 채우는 첫 네임스페이스다(core 하드코딩 지점이
// placeholder-extension.ts 하나뿐이라 실측됨, spec §8.1). react 쪽 문구
// (block-type-options.ts/slash-menu.tsx/toolbar aria-label 등, RD-002)는
// 이 타입에 네임스페이스를 추가하는 방식으로 확장한다 — 기존 필드를
// 바꾸지 않는 한 하위 호환 확장이다.
export type Dictionary = {
  placeholder: {
    paragraph: string;
    // "{level}" 토큰을 실제 heading 레벨(1~6) 숫자로 치환해 쓴다
    // (placeholder-extension.ts). 함수 타입 대신 토큰 문자열을 쓰는 이유는
    // Dictionary 전체를 순수 데이터로 유지해 locale 파일(en/ko, RD-003)이
    // 평범한 객체 literal로 남게 하기 위해서다.
    heading: string;
    quote: string;
    codeBlock: string;
    listItem: string;
  };
  // RD-002-DELTA-01 — react `EditorContent`의 contenteditable 호스트 aria-label.
  // 수십 개 react 테스트가 `getByRole("textbox", { name: "Editor" })`로 이
  // 값을 셀렉터로 쓴다 — 기본값을 바꾸면 이 DELTA 범위 밖에서 무더기
  // 회귀가 난다(의도된 회귀 가드, RD-002-DELTA-01.md 참고).
  editor: {
    ariaLabel: string;
  };
  // RD-002-DELTA-02 — react `block-type-options.ts`의 `BLOCK_TYPE_OPTIONS`
  // 19항목(label·description). key는 그 배열의 `id` 문자열을 그대로 쓴다
  // (별도 camelCase 매핑 없음 — react `blockTypeText()` 헬퍼가
  // `dictionary.blockType[id]`로 직접 인덱싱한다). `BLOCK_TYPE_OPTIONS`
  // 자신의 `label`/`description`은 검색 매칭(`slash-menu.tsx`의
  // `matchesQuery`) 전용으로 남고 dictionary와 무관하게 고정 영어를
  // 유지한다 — 이 네임스페이스는 렌더 텍스트만 담당한다(RD-002-DELTA-02.md
  // "결정").
  blockType: {
    paragraph: { label: string; description: string };
    "heading-1": { label: string; description: string };
    "heading-2": { label: string; description: string };
    "heading-3": { label: string; description: string };
    "heading-4": { label: string; description: string };
    "heading-5": { label: string; description: string };
    "heading-6": { label: string; description: string };
    "toggle-heading-1": { label: string; description: string };
    "toggle-heading-2": { label: string; description: string };
    "toggle-heading-3": { label: string; description: string };
    "toggle-heading-4": { label: string; description: string };
    "toggle-heading-5": { label: string; description: string };
    "toggle-heading-6": { label: string; description: string };
    quote: { label: string; description: string };
    code: { label: string; description: string };
    "bullet-list": { label: string; description: string };
    "numbered-list": { label: string; description: string };
    "check-list": { label: string; description: string };
    "toggle-list": { label: string; description: string };
  };
  // RD-002-DELTA-03 — react `slash-menu.tsx` 자체 문구. `file`/`image`/
  // `video`/`audio` key는 `MediaBlockKind`(core `media-block-kind.ts`) 리터럴과
  // 정확히 일치한다 — react가 `item.mediaKind`로 직접 인덱싱한다.
  // `TABLE_SLASH_ITEM` 등 slash-menu.tsx 모듈 상수의 `label`/`description`은
  // blockType과 동일 이유로 검색 매칭 전용으로 남고 dictionary와 무관하다.
  slashMenu: {
    ariaLabel: string;
    noMatches: string;
    table: { label: string; description: string };
    divider: { label: string; description: string };
    file: { label: string; description: string };
    image: { label: string; description: string };
    video: { label: string; description: string };
    audio: { label: string; description: string };
  };
  // RD-002-DELTA-04 — `block-side-menu-menu.tsx`/`table-handle-menu.tsx`/
  // `table-cell-format-menu.tsx`의 색상 무관 문구. `align*`/`cellFormattingAriaLabel`
  // 등은 세 컴포넌트가 지금 각자 하드코딩으로 중복 소유하던 것을 하나로
  // 합친 key다(실측, RD-002-DELTA-04.md 참고). 색상 이름·"Text color"/
  // "Background color" property 라벨은 `color.*`(DELTA-05) 소관이라 여기
  // 없다.
  menu: {
    blockMenuAriaLabel: string;
    turnInto: string;
    indent: string;
    outdent: string;
    duplicate: string;
    delete: string;
    align: string;
    alignLeft: string;
    alignCenter: string;
    alignRight: string;
    alignNone: string;
    tableRowMenuAriaLabel: string;
    tableColumnMenuAriaLabel: string;
    insertRowAbove: string;
    insertRowBelow: string;
    insertColumnLeft: string;
    insertColumnRight: string;
    deleteRow: string;
    deleteColumn: string;
    headerRow: string;
    headerColumn: string;
    cellFormattingAriaLabel: string;
  };
  // RD-002-DELTA-05 — 색상 이름 8종과 "Text color"/"Background color"
  // property 라벨. `names`의 key는 react `table-cell-colors.ts`의
  // `TableCellColorId`와 정확히 일치한다. 3곳(`table-cell-color-palettes.tsx`,
  // `block-side-menu-menu.tsx`, `formatting-toolbar.tsx`)이 각자
  // `${textLabel} ${names[id]}` 형태로 조합해 aria-label을 만든다 — 이
  // 네임스페이스는 조합 전 조각만 소유한다.
  color: {
    textLabel: string;
    backgroundLabel: string;
    none: string;
    names: {
      gray: string;
      red: string;
      orange: string;
      yellow: string;
      green: string;
      blue: string;
      purple: string;
      pink: string;
    };
  };
  // RD-002-DELTA-06 — `toolbar.kindNames`는 react `media-toolbar.tsx`/
  // `file-panel.tsx`가 지금 각자 복제해 갖고 있던 `kindLabel(kind)`(첫
  // 글자만 대문자화)를 대체하는 공유 조회 테이블이다. `nameInputAriaLabel`
  // 등 `{kind}` 토큰을 포함한 필드는 `placeholder.heading`의 `{level}`과
  // 동일한 문자열 치환 관용구를 쓴다(별도 함수 타입 없음). `toolbar.link`/
  // `toolbar.tableSelection`/`toolbar.blockSelection`/`toolbar.formatting`은
  // DELTA-07이 추가한다.
  toolbar: {
    kindNames: { file: string; image: string; video: string; audio: string };
    media: {
      ariaLabel: string;
      replaceAriaLabel: string;
      replace: string;
      rename: string;
      editCaptionAriaLabel: string;
      caption: string;
      preview: string;
      alignLeft: string;
      alignCenter: string;
      alignRight: string;
      deleteAriaLabel: string;
      delete: string;
      download: string;
      nameInputAriaLabel: string;
      captionInputAriaLabel: string;
      saveNameAriaLabel: string;
      saveCaptionAriaLabel: string;
      save: string;
      cancel: string;
      replaceFileInputAriaLabel: string;
      retry: string;
    };
    filePanel: {
      ariaLabel: string;
      sourceAriaLabel: string;
      embedTab: string;
      uploadTab: string;
      urlInputAriaLabel: string;
      saveUrl: string;
      save: string;
      namePrefix: string;
      fileInputAriaLabel: string;
      cancel: string;
      retry: string;
      closeAriaLabel: string;
      close: string;
    };
    // RD-002-DELTA-07 — `tableSelection`의 "Cell formatting"은 별도 key를
    // 두지 않는다. `table-selection-toolbar.tsx`가 `Dictionary.menu.
    // cellFormattingAriaLabel`(DELTA-04)을 그대로 재사용한다 — 실측 결과
    // 완전히 같은 문구를 세 번째 파일이 독립적으로 하드코딩하고 있었다.
    link: {
      ariaLabel: string;
      addLink: string;
      openLink: string;
      editLink: string;
      removeLink: string;
      urlInputAriaLabel: string;
      saveLink: string;
      cancelAriaLabel: string;
      cancel: string;
    };
    tableSelection: {
      ariaLabel: string;
      mergeCells: string;
      splitCell: string;
    };
    blockSelection: {
      ariaLabel: string;
      moveUp: string;
      moveDown: string;
      delete: string;
    };
    formatting: {
      ariaLabel: string;
    };
  };
};

// CreateEditorOptions.dictionary가 없을 때 쓰는 기본값(en)이자, override
// 작성자가 스프레드해 필요한 key만 바꾸는 기준값이다(자동 딥 병합 없음,
// 소비자가 직접 병합 — spec §8.1, "단순함 우선").
export const DEFAULT_DICTIONARY: Dictionary = {
  placeholder: {
    paragraph: "Enter text or type '/' for commands",
    heading: "Heading {level}",
    quote: "Quote",
    codeBlock: "Code",
    listItem: "List item",
  },
  editor: {
    ariaLabel: "Editor",
  },
  blockType: {
    paragraph: { label: "Text", description: "Plain paragraph text" },
    "heading-1": { label: "Heading 1", description: "Large section heading" },
    "heading-2": {
      label: "Heading 2",
      description: "Medium section heading",
    },
    "heading-3": { label: "Heading 3", description: "Small section heading" },
    "heading-4": {
      label: "Heading 4",
      description: "Smaller section heading",
    },
    "heading-5": {
      label: "Heading 5",
      description: "Extra small section heading",
    },
    "heading-6": {
      label: "Heading 6",
      description: "Smallest section heading",
    },
    "toggle-heading-1": {
      label: "Toggle Heading 1",
      description: "Large collapsible heading",
    },
    "toggle-heading-2": {
      label: "Toggle Heading 2",
      description: "Medium collapsible heading",
    },
    "toggle-heading-3": {
      label: "Toggle Heading 3",
      description: "Small collapsible heading",
    },
    "toggle-heading-4": {
      label: "Toggle Heading 4",
      description: "Smaller collapsible heading",
    },
    "toggle-heading-5": {
      label: "Toggle Heading 5",
      description: "Extra small collapsible heading",
    },
    "toggle-heading-6": {
      label: "Toggle Heading 6",
      description: "Smallest collapsible heading",
    },
    quote: { label: "Quote", description: "Capture a quote" },
    code: { label: "Code", description: "Write plain code" },
    "bullet-list": {
      label: "Bulleted List",
      description: "Create a bulleted list",
    },
    "numbered-list": {
      label: "Numbered List",
      description: "Create a numbered list",
    },
    "check-list": {
      label: "Check List",
      description: "Track tasks with a checklist",
    },
    "toggle-list": {
      label: "Toggle List",
      description: "Create a collapsible toggle list",
    },
  },
  slashMenu: {
    ariaLabel: "Slash menu",
    noMatches: "No matches",
    table: { label: "Table", description: "Insert a table" },
    divider: { label: "Divider", description: "Insert a horizontal divider" },
    file: { label: "File", description: "Insert a file" },
    image: { label: "Image", description: "Insert an image" },
    video: { label: "Video", description: "Insert a video" },
    audio: { label: "Audio", description: "Insert an audio file" },
  },
  menu: {
    blockMenuAriaLabel: "Block menu",
    turnInto: "Turn into",
    indent: "Indent",
    outdent: "Outdent",
    duplicate: "Duplicate",
    delete: "Delete",
    align: "Align",
    alignLeft: "Align left",
    alignCenter: "Align center",
    alignRight: "Align right",
    alignNone: "Align none",
    tableRowMenuAriaLabel: "Table row menu",
    tableColumnMenuAriaLabel: "Table column menu",
    insertRowAbove: "Insert row above",
    insertRowBelow: "Insert row below",
    insertColumnLeft: "Insert column left",
    insertColumnRight: "Insert column right",
    deleteRow: "Delete row",
    deleteColumn: "Delete column",
    headerRow: "Header row",
    headerColumn: "Header column",
    cellFormattingAriaLabel: "Cell formatting",
  },
  color: {
    textLabel: "Text color",
    backgroundLabel: "Background color",
    none: "None",
    names: {
      gray: "Gray",
      red: "Red",
      orange: "Orange",
      yellow: "Yellow",
      green: "Green",
      blue: "Blue",
      purple: "Purple",
      pink: "Pink",
    },
  },
  toolbar: {
    kindNames: { file: "File", image: "Image", video: "Video", audio: "Audio" },
    media: {
      ariaLabel: "Media toolbar",
      replaceAriaLabel: "Replace file",
      replace: "Replace",
      rename: "Rename",
      editCaptionAriaLabel: "Edit caption",
      caption: "Caption",
      preview: "Preview",
      alignLeft: "Align left",
      alignCenter: "Align center",
      alignRight: "Align right",
      deleteAriaLabel: "Delete media block",
      delete: "Delete",
      download: "Download",
      nameInputAriaLabel: "{kind} name",
      captionInputAriaLabel: "{kind} caption",
      saveNameAriaLabel: "Save name",
      saveCaptionAriaLabel: "Save caption",
      save: "Save",
      cancel: "Cancel",
      replaceFileInputAriaLabel: "{kind} file",
      retry: "Retry",
    },
    filePanel: {
      ariaLabel: "File panel",
      sourceAriaLabel: "Media source",
      embedTab: "Embed",
      uploadTab: "Upload",
      urlInputAriaLabel: "{kind} URL",
      saveUrl: "Save URL",
      save: "Save",
      namePrefix: "Name: ",
      fileInputAriaLabel: "{kind} file",
      cancel: "Cancel",
      retry: "Retry",
      closeAriaLabel: "Close file panel",
      close: "Close",
    },
    link: {
      ariaLabel: "Link",
      addLink: "Add link",
      openLink: "Open link",
      editLink: "Edit link",
      removeLink: "Remove link",
      urlInputAriaLabel: "Link URL",
      saveLink: "Save link",
      cancelAriaLabel: "Cancel link edit",
      cancel: "Cancel",
    },
    tableSelection: {
      ariaLabel: "Table selection",
      mergeCells: "Merge cells",
      splitCell: "Split cell",
    },
    blockSelection: {
      ariaLabel: "Block selection",
      moveUp: "Move selection up",
      moveDown: "Move selection down",
      delete: "Delete selected blocks",
    },
    formatting: {
      ariaLabel: "Formatting",
    },
  },
};
