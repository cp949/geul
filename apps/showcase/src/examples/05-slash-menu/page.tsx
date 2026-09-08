import { ExamplePage } from "../../example-shell/example-page.js";
import SlashMenuExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const SlashMenuPage = () => (
  <ExamplePage
    description="빈 줄에서 '/'를 입력하면 슬래시 메뉴가 열린다. 목록 맨 아래 'Say hello' 커스텀 항목도 확인해 보라."
    source={exampleSource}
    title="Slash menu"
  >
    <SlashMenuExample />
  </ExamplePage>
);

export default SlashMenuPage;
