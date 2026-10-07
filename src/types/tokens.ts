export type TokenKind = "color" | "fontSize" | "spacing" | "radius" | "shadow" | "motion";

export interface DesignToken {
  id: string;
  name: string;
  /** 字面量值；存在 ref 且未覆盖时仅作为解析失败时的回退 */
  value: string;
  description: string;
  /** 引用的目标令牌名，如 color.brand.primary；为空表示字面量令牌 */
  ref?: string;
  /** true 表示显式覆盖引用结果，保留自身 value */
  override?: boolean;
  /** 覆盖后上游基础令牌又发生变化，标记为待复核 */
  needsReview?: boolean;
}

export interface Theme {
  id: string;
  name: string;
  tokens: Record<TokenKind, DesignToken[]>;
}

export interface Snapshot {
  id: string;
  label: string;
  createdAt: string;
  theme: Theme;
}

export interface TokenDifference {
  path: string;
  before: string;
  after: string;
  kind: "changed" | "added" | "removed";
}

export type TokenIssueKind = "cycle" | "missing" | "type-mismatch";

export interface TokenIssue {
  tokenId: string;
  tokenName: string;
  kind: TokenKind;
  problem: TokenIssueKind;
  detail: string;
}

export interface ResolvedToken extends DesignToken {
  kind: TokenKind;
  /** 沿引用链解析后的有效值；解析失败时回退到自身 value */
  resolvedValue: string;
  issue?: TokenIssueKind;
}

export interface ResolvedTheme {
  byId: Record<string, ResolvedToken>;
  byName: Record<string, ResolvedToken>;
  /** 令牌名 → 解析后的有效值，预览、差异与导出共用这一份结果 */
  flat: Record<string, string>;
  issues: TokenIssue[];
}
