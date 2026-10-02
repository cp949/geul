import { ExamplePage } from "../../example-shell/example-page.js";
import StaticToolbarExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const StaticToolbarPage = () => (
  <ExamplePage
    description="선택 없이도 항상 보이는 옵트인 툴바 StaticToolbar 예제다. FormattingToolbar와 커맨드 세트는 같지만 위치는 geul이 강제하지 않는다 — 이 예제는 스크롤 영역에 CSS sticky를 직접 붙여 '상단 고정'을 시연한다. 아래로 스크롤해 보라. 글자를 선택하면 뜨는 서식 popover(FormattingToolbar), 링크 툴바, 슬래시 메뉴, 이모지 picker, 미디어·표 편집 UI 등 Kitchen sink의 표면 전부를 함께 쓴다. 에디터 아래 샘플 불러오기 버튼과 미리보기/HTML 탭으로 exportHtml() 결과를 확인할 수 있다."
    source={exampleSource}
    title="Static toolbar"
    wide
  >
    <StaticToolbarExample />
  </ExamplePage>
);

export default StaticToolbarPage;
