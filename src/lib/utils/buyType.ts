export type BuyTypeKey =
  | "FULL_BUY"
  | "FORCE_BUY"
  | "HALF_BUY"
  | "ECO"
  | "PISTOL"
  | "UNKNOWN";

export const BUY_TYPE_LABELS: Record<BuyTypeKey, string> = {
  FULL_BUY: "Full",
  FORCE_BUY: "Force",
  HALF_BUY: "Half",
  ECO: "Eco",
  PISTOL: "Pistol",
  UNKNOWN: "—",
};

export const BUY_TYPE_COLORS: Record<BuyTypeKey, string> = {
  FULL_BUY: "var(--success)",
  FORCE_BUY: "var(--warning)",
  HALF_BUY: "#f59e0b",
  ECO: "var(--error)",
  PISTOL: "var(--accent)",
  UNKNOWN: "var(--text-disabled)",
};
