import type { DesignToken, ResolvedTheme, TokenIssue, TokenKind, Theme } from "../types/tokens";

interface LocatedToken {
  token: DesignToken;
  kind: TokenKind;
}

const ISSUE_LABELS: Record<TokenIssue["kind"], string> = {
  cycle: "引用成环",
  "type-mismatch": "类型不符",
  "missing-target": "目标缺失",
};

export function issueLabel(kind: TokenIssue["kind"]): string {
  return ISSUE_LABELS[kind];
}

/**
 * 按主题解析令牌引用。
 *
 * - 基础令牌（无 ref）：现值即有效值。
 * - 别名（有 ref）且未显式覆盖：沿引用链解析到基础令牌。
 * - 别名且显式覆盖：保留现值（覆盖值），但仍校验引用完整性。
 *
 * 解析过程中收集引用问题：成环、类型不符、目标缺失。
 * 预览、版本差异与导出都应读取同一份解析结果（values）。
 */
export function resolveTheme(theme: Theme): ResolvedTheme {
  const byName = new Map<string, LocatedToken>();
  (Object.keys(theme.tokens) as TokenKind[]).forEach((kind) => {
    theme.tokens[kind].forEach((token) => {
      if (!byName.has(token.name)) byName.set(token.name, { token, kind });
    });
  });

  const values: Record<string, string> = {};
  const issues: TokenIssue[] = [];
  const state = new Map<string, "visiting" | "done">();

  const pushIssue = (issue: TokenIssue): void => {
    if (!issues.some((item) => item.tokenId === issue.tokenId && item.kind === issue.kind)) {
      issues.push(issue);
    }
  };

  const resolve = (token: DesignToken, kind: TokenKind, stack: string[]): string | null => {
    if (state.get(token.id) === "done") return values[token.id] ?? null;
    if (state.get(token.id) === "visiting") {
      const ringStart = stack.indexOf(token.name);
      const ring = ringStart >= 0 ? [...stack.slice(ringStart), token.name] : [...stack, token.name];
      pushIssue({
        tokenId: token.id,
        tokenName: token.name,
        kind: "cycle",
        message: `引用成环：${ring.join(" → ")}`,
      });
      return null;
    }

    state.set(token.id, "visiting");

    let result: string | null;
    if (!token.ref) {
      // 基础令牌：现值即有效值
      result = token.value;
    } else if (token.overridden) {
      // 显式覆盖：保留现值，但仍校验引用完整性
      result = token.value;
      const target = byName.get(token.ref);
      if (!target) {
        pushIssue({
          tokenId: token.id,
          tokenName: token.name,
          kind: "missing-target",
          message: `引用目标缺失：${token.ref}`,
        });
      } else if (target.kind !== kind) {
        pushIssue({
          tokenId: token.id,
          tokenName: token.name,
          kind: "type-mismatch",
          message: `类型不符：${token.name}（${kind}）引用了 ${target.token.name}（${target.kind}）`,
        });
      }
    } else {
      const target = byName.get(token.ref);
      if (!target) {
        pushIssue({
          tokenId: token.id,
          tokenName: token.name,
          kind: "missing-target",
          message: `引用目标缺失：${token.ref}`,
        });
        result = null;
      } else if (target.kind !== kind) {
        pushIssue({
          tokenId: token.id,
          tokenName: token.name,
          kind: "type-mismatch",
          message: `类型不符：${token.name}（${kind}）引用了 ${target.token.name}（${target.kind}）`,
        });
        result = null;
      } else {
        result = resolve(target.token, target.kind, [...stack, token.name]);
      }
    }

    state.set(token.id, "done");
    // 解析失败时回退到现值，保证预览不空白
    values[token.id] = result ?? token.value;
    return result;
  };

  (Object.keys(theme.tokens) as TokenKind[]).forEach((kind) => {
    theme.tokens[kind].forEach((token) => resolve(token, kind, []));
  });

  return { values, issues };
}

/** 收集某令牌引用链上的全部令牌 id（含自身），用于判断基础令牌变动是否波及 */
export function collectRefIds(token: DesignToken, theme: Theme): Set<string> {
  const seen = new Set<string>();
  const byName = new Map<string, DesignToken>();
  (Object.keys(theme.tokens) as TokenKind[]).forEach((kind) => {
    theme.tokens[kind].forEach((item) => {
      if (!byName.has(item.name)) byName.set(item.name, item);
    });
  });

  const walk = (current: DesignToken): void => {
    if (seen.has(current.id)) return;
    seen.add(current.id);
    if (current.ref) {
      const target = byName.get(current.ref);
      if (target) walk(target);
    }
  };
  walk(token);
  return seen;
}

/** 重命名令牌时，把指向旧名称的引用改写为新名称，避免目标缺失 */
export function rewriteRefs(theme: Theme, oldName: string, newName: string): Theme {
  if (oldName === newName) return theme;
  const next: Theme = structuredClone(theme);
  (Object.keys(next.tokens) as TokenKind[]).forEach((kind) => {
    next.tokens[kind] = next.tokens[kind].map((token) =>
      token.ref === oldName ? { ...token, ref: newName } : token,
    );
  });
  return next;
}
