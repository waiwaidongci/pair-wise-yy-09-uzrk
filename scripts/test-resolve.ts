import { resolveTheme, collectRefIds, rewriteRefs } from "../src/utils/resolve";
import type { Theme } from "../src/types/tokens";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function makeTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: "t",
    name: "测试",
    tokens: {
      color: [
        { id: "base-blue", name: "color.base.blue", value: "#356ae6", description: "" },
        { id: "base-red", name: "color.base.red", value: "#c53b4d", description: "" },
        { id: "alias-brand", name: "color.brand", value: "#000000", description: "", ref: "color.base.blue" },
        { id: "alias-danger", name: "color.danger", value: "#000000", description: "", ref: "color.base.red" },
      ],
      fontSize: [
        { id: "font-md", name: "font.size.md", value: "16px", description: "" },
        { id: "font-alias", name: "font.alias", value: "0px", description: "", ref: "font.size.md" },
      ],
      spacing: [],
      radius: [],
      shadow: [],
      motion: [],
    },
    ...overrides,
  };
}

// 1. 基础解析：别名沿引用链解析
{
  const theme = makeTheme();
  const { values, issues } = resolveTheme(theme);
  assert(values["alias-brand"] === "#356ae6", "别名应解析到基础蓝");
  assert(values["alias-danger"] === "#c53b4d", "别名应解析到基础红");
  assert(values["base-blue"] === "#356ae6", "基础令牌现值即有效值");
  assert(values["font-alias"] === "16px", "字号别名应解析");
  assert(issues.length === 0, "正常引用无问题");
}

// 2. 基础令牌改动后别名联动
{
  const theme = makeTheme();
  theme.tokens.color[0].value = "#ff0000"; // 改基础蓝
  const { values } = resolveTheme(theme);
  assert(values["alias-brand"] === "#ff0000", "基础色改动后别名应联动");
}

// 3. 显式覆盖保留现值
{
  const theme = makeTheme();
  theme.tokens.color[2].overridden = true;
  theme.tokens.color[2].value = "#111111";
  const { values } = resolveTheme(theme);
  assert(values["alias-brand"] === "#111111", "显式覆盖应保留现值");
}

// 4. 引用成环检测
{
  const theme = makeTheme();
  theme.tokens.color[0].ref = "color.brand"; // base-blue → alias-brand → base-blue
  const { issues } = resolveTheme(theme);
  assert(issues.some((i) => i.kind === "cycle"), "应检测到成环");
}

// 5. 类型不符检测
{
  const theme = makeTheme();
  theme.tokens.color[2].ref = "font.size.md"; // color 引用 fontSize
  const { issues } = resolveTheme(theme);
  assert(issues.some((i) => i.kind === "type-mismatch"), "应检测到类型不符");
}

// 6. 目标缺失检测
{
  const theme = makeTheme();
  theme.tokens.color[2].ref = "color.base.nonexistent";
  const { issues } = resolveTheme(theme);
  assert(issues.some((i) => i.kind === "missing-target"), "应检测到目标缺失");
}

// 7. collectRefIds：收集引用链
{
  const theme = makeTheme();
  const ids = collectRefIds(theme.tokens.color[2], theme);
  assert(ids.has("alias-brand") && ids.has("base-blue"), "应包含自身和引用目标");
}

// 8. rewriteRefs：重命名时改写引用
{
  const theme = makeTheme();
  const next = rewriteRefs(theme, "color.base.blue", "color.base.blue.500");
  assert(next.tokens.color[2].ref === "color.base.blue.500", "引用应随重命名改写");
  assert(theme.tokens.color[2].ref === "color.base.blue", "原主题不应被修改");
}

// 9. 多层引用链
{
  const theme = makeTheme();
  theme.tokens.color.push({ id: "alias-2", name: "color.alias2", value: "#000", description: "", ref: "color.brand" });
  const { values } = resolveTheme(theme);
  assert(values["alias-2"] === "#356ae6", "多层引用应解析到基础值");
}

// 10. 无引用的旧数据：现值即有效值
{
  const theme = makeTheme();
  theme.tokens.color.forEach((t) => { delete t.ref; });
  const { values, issues } = resolveTheme(theme);
  assert(values["alias-brand"] === "#000000", "无引用时现值即有效值");
  assert(issues.length === 0, "无引用无问题");
}

console.log(`\n解析逻辑测试：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
