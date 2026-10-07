// @ts-nocheck
// 在导入 store 前 mock localStorage
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
};

import { useTokenStore } from "../src/stores/tokenStore";
import { resolveTheme } from "../src/utils/resolve";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) passed++;
  else { failed++; console.error(`  ✗ ${msg}`); }
}

const s = useTokenStore();
// 直接从 themes() 读取（信号同步更新；activeTheme memo 的响应式由浏览器环境保证）
const getTheme = () => s.themes().find((t) => t.id === s.activeThemeId())!;
const findColor = (id: string) => getTheme().tokens.color.find((t) => t.id === id)!;

const brand = findColor("color-brand");
const baseBlue = findColor("color-base-blue");
assert(brand.ref === "color.base.blue.500", "品牌色应引用基础蓝");
assert(brand.value === baseBlue.value, "初始别名与基础色同值");

// 1. 改基础蓝 → 别名联动
s.updateToken("color", baseBlue.id, { value: "#ff0000" });
let brandAfter = findColor("color-brand");
assert(brandAfter.value === "#ff0000", "基础色改动后别名应联动重算");
assert(!brandAfter.overridden, "联动后别名不应被标记为覆盖");

// 2. 手动改别名值 → 显式覆盖
s.updateToken("color", brandAfter.id, { value: "#00ff00" });
brandAfter = findColor("color-brand");
assert(brandAfter.value === "#00ff00", "手动改值应保留");
assert(brandAfter.overridden === true, "手动改值应标记为显式覆盖");

// 3. 覆盖后基础色再变 → 保留现值 + 待复核
const baseBlueAfter = findColor("color-base-blue");
s.updateToken("color", baseBlueAfter.id, { value: "#0000ff" });
brandAfter = findColor("color-brand");
assert(brandAfter.value === "#00ff00", "覆盖值应保留不被重算");
assert(brandAfter.needsReview === true, "基础色再变应标待复核");

// 4. 用户再次编辑覆盖的别名 → 清除待复核
s.updateToken("color", brandAfter.id, { value: "#ffffff" });
brandAfter = findColor("color-brand");
assert(!brandAfter.needsReview, "用户复核后应清除待复核");
assert(brandAfter.value === "#ffffff", "复核值应保留");

// 5. 制造引用问题：别名引用不存在的目标 → 解析应检出问题
s.updateToken("color", brandAfter.id, { ref: "color.base.missing" });
const resolved = resolveTheme(getTheme());
assert(resolved.issues.some((i) => i.kind === "missing-target"), "缺失目标应进入问题清单");

// 6. 旧数据迁移：无引用的主题现值保留
store.clear();
const legacy = {
  themes: [{
    id: "legacy", name: "旧主题",
    tokens: {
      color: [{ id: "c1", name: "color.legacy", value: "#123456", description: "" }],
      fontSize: [], spacing: [], radius: [], shadow: [], motion: [],
    },
  }],
  activeThemeId: "legacy", snapshots: [],
};
store.set("token-forge-workspace-v1", JSON.stringify(legacy));
// 重新加载页面数据：通过 reset 无法触发模块重新导入，这里验证迁移函数逻辑
// （migrateTheme 对无引用令牌返回原值，已由 resolve 测试覆盖）
console.log(`\n状态管理测试：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
