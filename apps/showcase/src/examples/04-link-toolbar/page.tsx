import { ExamplePage } from "../../example-shell/example-page.js";
import LinkToolbarExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const LinkToolbarPage = () => (
  <ExamplePage
    description="텍스트를 입력하고 드래그로 선택한 뒤 버튼을 누르면 링크가 붙고 Link Toolbar가 나타난다. 다시 클릭해 href를 바꿔볼 수 있다."
    source={exampleSource}
    title="Link toolbar"
  >
    <LinkToolbarExample />
  </ExamplePage>
);

export default LinkToolbarPage;
