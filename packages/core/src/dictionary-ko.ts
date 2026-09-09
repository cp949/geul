import type { Dictionary } from "./dictionary.js";

// spec §8(EXT-009/EXT-010), RD-003-DELTA-01 — 독자 한국어 번역이다.
// BlockNote의 문구를 참조하지 않는다(spec §8.2와 동일 원칙, key 구조뿐
// 아니라 문구도 새로 쓴다). `{level}`/`{kind}` 토큰은 그대로 유지하고
// 주변 문구만 옮긴다(dictionary.ts의 토큰 치환 관용구와 동일).
//
// 어조 원칙:
// - 메뉴·버튼 라벨(menu/toolbar/handle 등)은 한국어 소프트웨어 UI의 공통
//   관례대로 명사형·동사 어간형을 쓴다("삭제"/"취소"/"저장") — 존댓말
//   어미를 붙이지 않는다.
// - 에러·상태 알림(error/status)은 화면에 알림으로 노출되는 완결 문장이라
//   하십시오체("~습니다")를 쓴다.
// - `Dictionary` 타입이 모든 필드를 필수로 요구하므로 이 선언 자체가
//   누락 key를 컴파일 에러로 잡는다 — "번역 완성"의 기계적 검증 수단이다.
export const KO_DICTIONARY: Dictionary = {
  placeholder: {
    paragraph: "텍스트를 입력하거나 '/'를 입력해 명령을 실행하세요",
    heading: "제목 {level}",
    quote: "인용구",
    codeBlock: "코드",
    listItem: "목록 항목",
  },
  editor: {
    ariaLabel: "편집기",
  },
  blockType: {
    paragraph: { label: "본문", description: "일반 문단 텍스트" },
    "heading-1": { label: "제목 1", description: "큰 섹션 제목" },
    "heading-2": { label: "제목 2", description: "중간 섹션 제목" },
    "heading-3": { label: "제목 3", description: "작은 섹션 제목" },
    "heading-4": { label: "제목 4", description: "더 작은 섹션 제목" },
    "heading-5": { label: "제목 5", description: "매우 작은 섹션 제목" },
    "heading-6": { label: "제목 6", description: "가장 작은 섹션 제목" },
    "toggle-heading-1": {
      label: "접이식 제목 1",
      description: "접을 수 있는 큰 제목",
    },
    "toggle-heading-2": {
      label: "접이식 제목 2",
      description: "접을 수 있는 중간 제목",
    },
    "toggle-heading-3": {
      label: "접이식 제목 3",
      description: "접을 수 있는 작은 제목",
    },
    "toggle-heading-4": {
      label: "접이식 제목 4",
      description: "접을 수 있는 더 작은 제목",
    },
    "toggle-heading-5": {
      label: "접이식 제목 5",
      description: "접을 수 있는 매우 작은 제목",
    },
    "toggle-heading-6": {
      label: "접이식 제목 6",
      description: "접을 수 있는 가장 작은 제목",
    },
    quote: { label: "인용구", description: "인용문 삽입" },
    code: { label: "코드", description: "일반 코드 작성" },
    "bullet-list": {
      label: "글머리 기호 목록",
      description: "글머리 기호 목록 만들기",
    },
    "numbered-list": {
      label: "번호 매기기 목록",
      description: "번호 매기기 목록 만들기",
    },
    "check-list": {
      label: "체크리스트",
      description: "체크리스트로 할 일 관리",
    },
    "toggle-list": {
      label: "접이식 목록",
      description: "접을 수 있는 목록 만들기",
    },
  },
  slashMenu: {
    ariaLabel: "슬래시 메뉴",
    noMatches: "일치하는 항목 없음",
    table: { label: "표", description: "표 삽입" },
    divider: { label: "구분선", description: "가로 구분선 삽입" },
    file: { label: "파일", description: "파일 삽입" },
    image: { label: "이미지", description: "이미지 삽입" },
    video: { label: "비디오", description: "비디오 삽입" },
    audio: { label: "오디오", description: "오디오 파일 삽입" },
  },
  menu: {
    blockMenuAriaLabel: "블록 메뉴",
    turnInto: "블록 변환",
    indent: "들여쓰기",
    outdent: "내어쓰기",
    duplicate: "복제",
    delete: "삭제",
    align: "정렬",
    alignLeft: "왼쪽 정렬",
    alignCenter: "가운데 정렬",
    alignRight: "오른쪽 정렬",
    alignNone: "정렬 해제",
    tableRowMenuAriaLabel: "표 행 메뉴",
    tableColumnMenuAriaLabel: "표 열 메뉴",
    insertRowAbove: "위에 행 삽입",
    insertRowBelow: "아래에 행 삽입",
    insertColumnLeft: "왼쪽에 열 삽입",
    insertColumnRight: "오른쪽에 열 삽입",
    deleteRow: "행 삭제",
    deleteColumn: "열 삭제",
    headerRow: "머리글 행",
    headerColumn: "머리글 열",
    cellFormattingAriaLabel: "셀 서식",
  },
  color: {
    textLabel: "글자색",
    backgroundLabel: "배경색",
    none: "없음",
    names: {
      gray: "회색",
      red: "빨강",
      orange: "주황",
      yellow: "노랑",
      green: "초록",
      blue: "파랑",
      purple: "보라",
      pink: "분홍",
    },
  },
  toolbar: {
    kindNames: {
      file: "파일",
      image: "이미지",
      video: "비디오",
      audio: "오디오",
    },
    media: {
      ariaLabel: "미디어 툴바",
      replaceAriaLabel: "파일 교체",
      replace: "교체",
      rename: "이름 변경",
      editCaptionAriaLabel: "캡션 편집",
      caption: "캡션",
      preview: "미리보기",
      alignLeft: "왼쪽 정렬",
      alignCenter: "가운데 정렬",
      alignRight: "오른쪽 정렬",
      deleteAriaLabel: "미디어 블록 삭제",
      delete: "삭제",
      download: "다운로드",
      nameInputAriaLabel: "{kind} 이름",
      captionInputAriaLabel: "{kind} 캡션",
      saveNameAriaLabel: "이름 저장",
      saveCaptionAriaLabel: "캡션 저장",
      save: "저장",
      cancel: "취소",
      replaceFileInputAriaLabel: "{kind} 파일",
      retry: "재시도",
    },
    filePanel: {
      ariaLabel: "파일 패널",
      sourceAriaLabel: "미디어 소스",
      embedTab: "삽입",
      uploadTab: "업로드",
      urlInputAriaLabel: "{kind} URL 입력",
      saveUrl: "URL 저장",
      save: "저장",
      namePrefix: "이름: ",
      fileInputAriaLabel: "{kind} 파일",
      cancel: "취소",
      retry: "재시도",
      closeAriaLabel: "파일 패널 닫기",
      close: "닫기",
    },
    link: {
      ariaLabel: "링크",
      addLink: "링크 추가",
      openLink: "링크 열기",
      editLink: "링크 편집",
      removeLink: "링크 제거",
      urlInputAriaLabel: "링크 URL",
      saveLink: "링크 저장",
      cancelAriaLabel: "링크 편집 취소",
      cancel: "취소",
    },
    tableSelection: {
      ariaLabel: "표 선택",
      mergeCells: "셀 병합",
      splitCell: "셀 분할",
    },
    blockSelection: {
      ariaLabel: "블록 선택",
      moveUp: "선택 항목 위로 이동",
      moveDown: "선택 항목 아래로 이동",
      delete: "선택한 블록 삭제",
      moveUpDisabledReason: "맨 위 항목이라 더 위로 이동할 수 없습니다",
      moveDownDisabledReason: "맨 아래 항목이라 더 아래로 이동할 수 없습니다",
    },
    formatting: {
      ariaLabel: "서식",
    },
  },
  handle: {
    dragRow: "드래그해서 행 순서 변경, 클릭하면 옵션 표시",
    dragColumn: "드래그해서 열 순서 변경, 클릭하면 옵션 표시",
    addRow: "행 추가",
    addColumn: "열 추가",
    indentTable: "표 들여쓰기",
    outdentTable: "표 내어쓰기",
    selectTable: "표 선택",
    dragBlock: "드래그해서 순서 변경, 클릭하면 옵션 표시",
    addBlock: "블록 추가",
  },
  nesting: {
    indentDisabledReason: "더 들여쓸 수 없습니다",
    outdentDisabledReason: "더 내어쓸 수 없습니다",
  },
  codeLanguage: {
    plainText: "일반 텍스트",
    label: "코드 언어",
    suggestionsAriaLabel: "코드 언어 제안",
  },
  error: {
    lastRow: "마지막 행은 삭제할 수 없습니다",
    lastColumn: "마지막 열은 삭제할 수 없습니다",
    cellNotFound: "셀을 더 이상 찾을 수 없습니다",
    invalidColor: "지원하지 않는 색상입니다",
    invalidAlign: "지원하지 않는 정렬입니다",
    notRectangular: "선택 영역이 직사각형이 아닙니다",
    actionFailed: "작업에 실패했습니다",
  },
  status: {
    uploading: "업로드 중…",
    uploadCouldNotStart: "업로드를 시작할 수 없습니다.",
    unsupportedLinkUrl: "지원하지 않는 링크 URL입니다",
    unsupportedMediaUrl: "지원하지 않는 미디어 URL입니다",
  },
};
