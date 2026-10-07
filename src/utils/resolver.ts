import type {
  DesignToken,
  ResolvedTheme,
  ResolvedToken,
  Theme,
  TokenIssue,
  TokenIssueKind,
  TokenKind,
} from "../types/tokens";

export const TOKEN_KINDS: TokenKind[] = ["color", "fontSize", "spacing", "radius", "shadow", "motion"];

export const ISSUE_LABELS: Record<TokenIssueKind, string> = {
  cycle: "引用成环",
  missing: "目标缺失",
  "type-mismatch": "类型不符",
};

interface IndexedToken {
  token: DesignToken;
  kind: TokenKind;
}

function indexTheme(theme: Theme): Map<string, IndexedToken> {
  const index = new Map<string, IndexedToken>();
  TOKEN_KINDS.forEach((kind) => {
    (theme.tokens[kind] ?? []).forEach((token) => {
      if (!index.has(token.name)) index.set(token.name, { token, kind });
    });
  });
  return index;
}

/**
 * 按主题解析令牌引用，产出预览、差异与导出共用的同一份结果。
 * - 未覆盖的别名沿引用链重算；
 * - 显式覆盖（override）保留自身值，引用仅做存在性与类型校验；
 * - 引用成环、类型不符、目标缺失的令牌记入 issues，值回退到自身字面量。
 */
export function resolveTheme(theme: Theme): ResolvedTheme {
  const index = indexTheme(theme);
  const issues: TokenIssue[] = [];
  const issueByTokenId = new Map<string, TokenIssueKind>();
  const issueByName = new Map<string, TokenIssueKind>();
  const cache = new Map<string, string>();

  const flag = (entry: IndexedToken, problem: TokenIssueKind, detail: string): void => {
    if (issueByTokenId.has(entry.token.id)) return;
    issueByTokenId.set(entry.token.id, problem);
    issueByName.set(entry.token.name, problem);
    issues.push({ tokenId: entry.token.id, tokenName: entry.token.name, kind: entry.kind, problem, detail });
  };

  const resolveEntry = (entry: IndexedToken, path: string[]): string => {
    const { token, kind } = entry;
    if (!token.ref) return token.value;
    const target = index.get(token.ref);
    if (!target) {
      flag(entry, "missing", `引用的目标令牌「${token.ref}」不存在`);
      return token.value;
    }
    if (target.kind !== kind) {
      flag(entry, "type-mismatch", `「${token.ref}」属于 ${target.kind} 类型，与当前 ${kind} 类型不匹配`);
      return token.value;
    }
    if (token.override) return token.value;
    if (path.includes(target.token.name)) {
      const loop = [...path.slice(path.indexOf(target.token.name)), token.name];
      const label = `引用成环：${[...loop, target.token.name].join(" → ")}`;
      loop.forEach((name) => {
        const loopEntry = index.get(name);
        if (loopEntry) flag(loopEntry, "cycle", label);
      });
      return token.value;
    }
    const resolved = cache.get(target.token.name) ?? resolveEntry(target, [...path, token.name]);
    cache.set(target.token.name, resolved);
    const upstreamIssue = issueByName.get(target.token.name);
    if (upstreamIssue) {
      flag(entry, upstreamIssue, `引用链上游「${target.token.name}」存在问题`);
    }
    return resolved;
  };

  const byId: Record<string, ResolvedToken> = {};
  const byName: Record<string, ResolvedToken> = {};
  const flat: Record<string, string> = {};

  TOKEN_KINDS.forEach((kind) => {
    (theme.tokens[kind] ?? []).forEach((token) => {
      const resolvedValue = resolveEntry({ token, kind }, []);
      cache.set(token.name, resolvedValue);
      const resolvedToken: ResolvedToken = { ...token, kind, resolvedValue, issue: issueByTokenId.get(token.id) };
      byId[token.id] = resolvedToken;
      if (!(token.name in byName)) byName[token.name] = resolvedToken;
      if (!(token.name in flat)) flat[token.name] = resolvedValue;
    });
  });

  return { byId, byName, flat, issues };
}

/**
 * 找出引用链经过 changedNames 且带显式覆盖的令牌，
 * 基础令牌改动后这些覆盖需要被标记为待复核。
 */
export function findOverrideDependents(theme: Theme, changedNames: ReadonlySet<string>): Array<{ kind: TokenKind; id: string }> {
  const index = indexTheme(theme);
  const dependents: Array<{ kind: TokenKind; id: string }> = [];
  TOKEN_KINDS.forEach((kind) => {
    (theme.tokens[kind] ?? []).forEach((token) => {
      if (!token.ref || !token.override) return;
      const seen = new Set<string>([token.name]);
      let current = token.ref ? index.get(token.ref) : undefined;
      while (current && !seen.has(current.token.name)) {
        if (changedNames.has(current.token.name)) {
          dependents.push({ kind, id: token.id });
          return;
        }
        seen.add(current.token.name);
        // 覆盖的中间节点会阻断变化继续向上游传播
        current = current.token.ref && !current.token.override ? index.get(current.token.ref) : undefined;
      }
    });
  });
  return dependents;
}

/**
 * 旧数据没有引用信息时按现值升级：补齐缺失字段，
 * 没有 ref 的令牌保持字面量语义，已有主题和快照继续能打开。
 */
export function migrateTheme(theme: Theme): Theme {
  const source = theme.tokens ?? ({} as Theme["tokens"]);
  const tokens = {} as Theme["tokens"];
  TOKEN_KINDS.forEach((kind) => {
    const list = Array.isArray(source[kind]) ? source[kind] : [];
    tokens[kind] = list.map((token, index) => ({
      id: typeof token.id === "string" && token.id ? token.id : `${kind}-legacy-${index}`,
      name: typeof token.name === "string" && token.name ? token.name : `${kind}.legacy.${index + 1}`,
      value: typeof token.value === "string" ? token.value : "",
      description: typeof token.description === "string" ? token.description : "",
      ...(typeof token.ref === "string" && token.ref ? { ref: token.ref } : {}),
      ...(token.override ? { override: true } : {}),
      ...(token.needsReview ? { needsReview: true } : {}),
    }));
  });
  return { id: theme.id, name: typeof theme.name === "string" ? theme.name : "未命名主题", tokens };
}
