import { createEffect, createMemo, createSignal } from "solid-js";
import type { DesignToken, ResolvedTheme, Snapshot, Theme, TokenKind } from "../types/tokens";
import { collectRefIds, resolveTheme, rewriteRefs } from "../utils/resolve";

const STORAGE_KEY = "token-forge-workspace-v1";

const makeTokens = (): Theme["tokens"] => ({
  color: [
    // 基础颜色令牌：原始色板
    { id: "color-base-blue", name: "color.base.blue.500", value: "#356ae6", description: "品牌基础蓝" },
    { id: "color-base-white", name: "color.base.white", value: "#ffffff", description: "基础白" },
    { id: "color-base-neutral-900", name: "color.base.neutral.900", value: "#172033", description: "基础墨色" },
    { id: "color-base-neutral-500", name: "color.base.neutral.500", value: "#68738a", description: "基础灰" },
    { id: "color-base-green-600", name: "color.base.green.600", value: "#16845b", description: "基础绿" },
    { id: "color-base-red-600", name: "color.base.red.600", value: "#c53b4d", description: "基础红" },
    // 语义别名：引用基础令牌，基础色改动后联动重算
    { id: "color-brand", name: "color.brand.primary", value: "#356ae6", description: "品牌主色，用于主操作", ref: "color.base.blue.500" },
    { id: "color-surface", name: "color.surface.default", value: "#ffffff", description: "默认卡片与页面表面", ref: "color.base.white" },
    { id: "color-text", name: "color.text.primary", value: "#172033", description: "正文主文字", ref: "color.base.neutral.900" },
    { id: "color-muted", name: "color.text.muted", value: "#68738a", description: "次级说明文字", ref: "color.base.neutral.500" },
    { id: "color-success", name: "color.status.success", value: "#16845b", description: "成功状态", ref: "color.base.green.600" },
    { id: "color-danger", name: "color.status.danger", value: "#c53b4d", description: "错误与危险状态", ref: "color.base.red.600" },
  ],
  fontSize: [
    { id: "font-xs", name: "font.size.xs", value: "12px", description: "辅助标签" },
    { id: "font-sm", name: "font.size.sm", value: "14px", description: "表格与控件" },
    { id: "font-md", name: "font.size.md", value: "16px", description: "正文" },
    { id: "font-lg", name: "font.size.lg", value: "20px", description: "区块标题" },
    { id: "font-xl", name: "font.size.xl", value: "28px", description: "页面标题" },
  ],
  spacing: [
    { id: "space-1", name: "space.1", value: "4px", description: "最小间距" },
    { id: "space-2", name: "space.2", value: "8px", description: "紧凑间距" },
    { id: "space-3", name: "space.3", value: "12px", description: "控件内间距" },
    { id: "space-4", name: "space.4", value: "16px", description: "常规间距" },
    { id: "space-6", name: "space.6", value: "24px", description: "区块间距" },
    { id: "space-8", name: "space.8", value: "32px", description: "大区块间距" },
  ],
  radius: [
    { id: "radius-sm", name: "radius.sm", value: "4px", description: "小控件" },
    { id: "radius-md", name: "radius.md", value: "8px", description: "卡片与输入框" },
    { id: "radius-full", name: "radius.full", value: "999px", description: "胶囊标签" },
  ],
  shadow: [
    { id: "shadow-sm", name: "shadow.sm", value: "0 1px 2px rgb(22 32 51 / 0.08)", description: "轻微抬升" },
    { id: "shadow-lg", name: "shadow.lg", value: "0 16px 40px rgb(22 32 51 / 0.14)", description: "浮层与弹窗" },
  ],
  motion: [
    { id: "motion-fast", name: "motion.duration.fast", value: "120ms", description: "即时反馈" },
    { id: "motion-base", name: "motion.duration.base", value: "220ms", description: "标准过渡" },
    { id: "motion-slow", name: "motion.duration.slow", value: "420ms", description: "强调过渡" },
  ],
});

function seedThemes(): Theme[] {
  const light = { id: "theme-light", name: "企业浅色", tokens: makeTokens() };
  const dark = structuredClone(light);
  dark.id = "theme-dark";
  dark.name = "夜间模式";
  // 夜间模式显式覆盖了表面/文字/次要色：保留现值，基础色变动时标待复核
  dark.tokens.color = dark.tokens.color.map((token) => {
    if (token.id === "color-surface") return { ...token, value: "#151b28", overridden: true };
    if (token.id === "color-text") return { ...token, value: "#f4f7ff", overridden: true };
    if (token.id === "color-muted") return { ...token, value: "#aab4ca", overridden: true };
    return token;
  });
  const dense = structuredClone(light);
  dense.id = "theme-dense";
  dense.name = "高密度运营";
  dense.tokens.fontSize = dense.tokens.fontSize.map((token) => ({
    ...token,
    value: `${Math.max(11, Number.parseInt(token.value, 10) - 1)}px`,
  }));
  dense.tokens.spacing = dense.tokens.spacing.map((token) => ({
    ...token,
    value: `${Math.max(2, Number.parseInt(token.value, 10) - 2)}px`,
  }));
  return [light, dark, dense];
}

interface PersistedState {
  themes: Theme[];
  activeThemeId: string;
  snapshots: Snapshot[];
}

/**
 * 按引用关系重算主题：
 * - 未覆盖的别名：现值失效后重算为引用链的解析值；
 * - 显式覆盖的别名：保留现值，仅当引用链上游在本次变动时标待复核。
 * changedIds 为本次值发生变化的令牌 id 集合。
 */
function recomputeTheme(theme: Theme, changedIds: Set<string> = new Set()): Theme {
  const { values } = resolveTheme(theme);
  let touched = false;
  const next: Theme = { ...theme, tokens: { ...theme.tokens } };
  (Object.keys(next.tokens) as TokenKind[]).forEach((kind) => {
    next.tokens[kind] = next.tokens[kind].map((token) => {
      if (!token.ref) return token;
      if (token.overridden) {
        if (changedIds.size > 0 && !token.needsReview) {
          const upstream = collectRefIds(token, theme);
          upstream.delete(token.id);
          if ([...upstream].some((id) => changedIds.has(id))) {
            touched = true;
            return { ...token, needsReview: true };
          }
        }
        return token;
      }
      const resolved = values[token.id];
      if (resolved && resolved !== token.value) {
        touched = true;
        return { ...token, value: resolved };
      }
      return token;
    });
  });
  return touched ? next : theme;
}

/** 旧数据迁移：没有引用信息的令牌视为基础令牌，现值即有效值；新数据重算别名缓存。 */
function migrateTheme(theme: Theme): Theme {
  return recomputeTheme(theme);
}

function readPersisted(): PersistedState {
  const fallback: PersistedState = { themes: seedThemes(), activeThemeId: "theme-light", snapshots: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed.themes?.length) return fallback;
    return {
      themes: parsed.themes.map(migrateTheme),
      activeThemeId: parsed.activeThemeId,
      snapshots: parsed.snapshots ?? [],
    };
  } catch {
    return fallback;
  }
}

const initial = readPersisted();
const [themes, setThemes] = createSignal<Theme[]>(initial.themes);
const [activeThemeId, setActiveThemeId] = createSignal(initial.activeThemeId);
const [snapshots, setSnapshots] = createSignal<Snapshot[]>(initial.snapshots);

const activeTheme = createMemo(() => themes().find((theme) => theme.id === activeThemeId()) ?? themes()[0]);

/** 按主题解析后的统一结果：预览、差异、导出读取同一份解析结果 */
const resolvedActiveTheme = createMemo<ResolvedTheme>(() => resolveTheme(activeTheme()));

createEffect(() => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ themes: themes(), activeThemeId: activeThemeId(), snapshots: snapshots() }),
  );
});

function updateTheme(themeId: string, updater: (theme: Theme) => Theme): void {
  setThemes((current) => current.map((theme) => (theme.id === themeId ? updater(theme) : theme)));
}

export function useTokenStore() {
  const updateToken = (kind: TokenKind, id: string, patch: Partial<DesignToken>): void => {
    updateTheme(activeThemeId(), (theme) => {
      const oldToken = theme.tokens[kind].find((token) => token.id === id);
      if (!oldToken) return theme;

      // 重命名时同步改写指向旧名称的引用，避免目标缺失
      let next = theme;
      if (patch.name !== undefined && patch.name !== oldToken.name) {
        next = rewriteRefs(theme, oldToken.name, patch.name);
      }

      const before = next;
      const nextTokens = { ...next.tokens };
      nextTokens[kind] = next.tokens[kind].map((token) => {
        if (token.id !== id) return token;
        const merged: DesignToken = { ...token, ...patch };
        // 编辑别名的值 → 显式覆盖，并清除待复核
        if (token.ref && patch.value !== undefined && patch.value !== token.value) {
          merged.overridden = true;
          merged.needsReview = false;
        }
        // 切换引用目标 → 恢复为纯别名，按引用重算
        if (Object.prototype.hasOwnProperty.call(patch, "ref") && patch.ref !== token.ref) {
          merged.overridden = false;
          merged.needsReview = false;
        }
        return merged;
      });
      next = { ...next, tokens: nextTokens };

      // 收集值发生变化的令牌 id，用于待复核判定
      const changedIds = new Set<string>();
      (Object.keys(next.tokens) as TokenKind[]).forEach((k) => {
        next.tokens[k].forEach((token) => {
          const old = before.tokens[k].find((item) => item.id === token.id);
          if (old && old.value !== token.value) changedIds.add(token.id);
        });
      });

      return recomputeTheme(next, changedIds);
    });
  };

  const addToken = (kind: TokenKind): void => {
    updateTheme(activeThemeId(), (theme) => {
      const next: Theme = {
        ...theme,
        tokens: {
          ...theme.tokens,
          [kind]: [
            ...theme.tokens[kind],
            {
              id: `${kind}-${Date.now()}`,
              name: `${kind}.custom.${theme.tokens[kind].length + 1}`,
              value: kind === "color" ? "#4f46e5" : kind === "shadow" ? "0 8px 24px rgb(0 0 0 / 0.12)" : "8px",
              description: "自定义令牌",
            },
          ],
        },
      };
      return recomputeTheme(next);
    });
  };

  const removeToken = (kind: TokenKind, id: string): void => {
    updateTheme(activeThemeId(), (theme) => {
      const next: Theme = {
        ...theme,
        tokens: { ...theme.tokens, [kind]: theme.tokens[kind].filter((token) => token.id !== id) },
      };
      return recomputeTheme(next);
    });
  };

  const createTheme = (name: string, sourceId = activeThemeId()): string => {
    const source = themes().find((theme) => theme.id === sourceId) ?? themes()[0];
    const id = `theme-${Date.now()}`;
    const cloned = recomputeTheme(structuredClone(source));
    setThemes((current) => [...current, { ...cloned, id, name }]);
    setActiveThemeId(id);
    return id;
  };

  const saveSnapshot = (label: string): void => {
    const snapshot: Snapshot = {
      id: `snapshot-${Date.now()}`,
      label: label.trim() || `快照 ${snapshots().length + 1}`,
      createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      theme: structuredClone(activeTheme()),
    };
    setSnapshots((current) => [snapshot, ...current].slice(0, 20));
  };

  const replaceTheme = (theme: Theme): void => {
    const resolved = recomputeTheme(theme);
    setThemes((current) => [...current, resolved]);
    setActiveThemeId(resolved.id);
  };

  return {
    themes,
    activeTheme,
    activeThemeId,
    setActiveThemeId,
    snapshots,
    resolvedActiveTheme,
    updateToken,
    addToken,
    removeToken,
    createTheme,
    saveSnapshot,
    replaceTheme,
    reset: () => {
      const fresh = seedThemes();
      setThemes(fresh);
      setActiveThemeId(fresh[0].id);
      setSnapshots([]);
    },
  };
}
