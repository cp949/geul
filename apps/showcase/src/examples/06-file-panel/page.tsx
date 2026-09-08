import { ExamplePage } from "../../example-shell/example-page.js";
import FilePanelExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const FilePanelPage = () => (
  <ExamplePage
    description="'/' 입력 후 Image를 선택하면 빈 이미지 블록이 생긴다. 그 블록을 선택하면 File Panel이 열려 URL이나 파일을 넣을 수 있다(업로드 mock은 다음 예제 'Media'에서 다룬다)."
    source={exampleSource}
    title="File panel"
  >
    <FilePanelExample />
  </ExamplePage>
);

export default FilePanelPage;
