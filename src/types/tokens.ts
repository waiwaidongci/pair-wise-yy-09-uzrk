export type TokenKind = "color" | "fontSize" | "spacing" | "radius" | "shadow" | "motion";

export interface DesignToken {
  id: string;
  name: string;
  value: string;
  description: string;
  /** 引用的目标令牌名称（按 name 定位）；为空表示基础令牌 */
  ref?: string;
  /** 显式覆盖：用户手动指定了值。解析时保留该值，但会标成待复核 */
  overridden?: boolean;
  /** 待复核：引用的基础令牌已变动，而当前令牌是显式覆盖 */
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

/** 引用问题类型：成环 / 类型不符 / 目标缺失 */
export type TokenIssueKind = "cycle" | "type-mismatch" | "missing-target";

export interface TokenIssue {
  tokenId: string;
  tokenName: string;
  kind: TokenIssueKind;
  message: string;
}

/** 按主题解析引用后的结果：每个令牌的有效值 + 引用问题清单 */
export interface ResolvedTheme {
  /** tokenId → 解析后的有效值（显式覆盖保留现值，否则沿引用链解析） */
  values: Record<string, string>;
  /** 存在引用问题的令牌（成环 / 类型不符 / 目标缺失） */
  issues: TokenIssue[];
}
