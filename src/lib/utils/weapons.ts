/** Display names for normalizeWeapon() keys (src/lib/analysis/movement.ts). */
export const WEAPON_LABEL: Record<string, string> = {
  glock: "Glock-18", hkp2000: "P2000", usp_silencer: "USP-S", p250: "P250",
  elite: "Dual Berettas", fiveseven: "Five-SeveN", tec9: "Tec-9", cz75a: "CZ75-Auto",
  deagle: "Desert Eagle", revolver: "R8 Revolver", mac10: "MAC-10", mp9: "MP9",
  mp7: "MP7", mp5sd: "MP5-SD", ump45: "UMP-45", p90: "P90", bizon: "PP-Bizon",
  ak47: "AK-47", m4a1: "M4A4", m4a1_silencer: "M4A1-S", galilar: "Galil AR",
  famas: "FAMAS", sg556: "SG 553", aug: "AUG", awp: "AWP", ssg08: "SSG 08",
  scar20: "SCAR-20", g3sg1: "G3SG1", nova: "Nova", xm1014: "XM1014",
  mag7: "MAG-7", sawedoff: "Sawed-Off", m249: "M249", negev: "Negev",
};

export const weaponLabel = (w: string) => WEAPON_LABEL[w] ?? w;
