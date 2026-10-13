"""ESTA (awpy 1.x CS:GO JSON, .json.xz) -> the app's WpMatch JSON (src/lib/winprob/features.ts).

    python ml/esta/to_wp.py <dir of .json.xz> <out dir>

Used only to build the shipped prior (ml/fit_prior_esta.py). Bombsite centres
come from where bombs were planted on each map across the whole input (the
app uses the game's callouts, which ESTA does not have).
"""
from __future__ import annotations

import collections
import json
import lzma
import os
import sys
from concurrent.futures import ProcessPoolExecutor

REASON = {
    "TargetBombed": "BOMB_EXPLODED",
    "BombDefused": "BOMB_DEFUSED",
    "TargetSaved": "TIME_RAN_OUT",
    "TerroristsWin": "ELIMINATION",
    "CTWin": "ELIMINATION",
}
BOMB = {"plant_begin": "PLANT_BEGIN", "plant": "PLANTED", "defuse_start": "DEFUSE_BEGIN", "defuse": "DEFUSED"}
WEAPON = {
    "AK-47": "ak47", "M4A1": "m4a1_silencer", "M4A4": "m4a1", "AWP": "awp", "Galil AR": "galilar", "FAMAS": "famas",
    "SG 553": "sg556", "AUG": "aug", "SSG 08": "ssg08", "SCAR-20": "scar20", "G3SG1": "g3sg1", "MAC-10": "mac10",
    "MP9": "mp9", "MP7": "mp7", "MP5-SD": "mp5sd", "UMP-45": "ump45", "P90": "p90", "PP-Bizon": "bizon", "Nova": "nova",
    "XM1014": "xm1014", "MAG-7": "mag7", "Sawed-Off": "sawedoff", "M249": "m249", "Negev": "negev", "Knife": "knife",
    "Desert Eagle": "deagle", "USP-S": "usp_silencer", "Glock-18": "glock", "P2000": "hkp2000", "P250": "p250",
    "Tec-9": "tec9", "Five-SeveN": "fiveseven", "CZ75 Auto": "cz75a", "Dual Berettas": "elite", "R8 Revolver": "revolver",
    "C4": "c4", "Flashbang": "flashbang", "Smoke Grenade": "smokegrenade", "HE Grenade": "hegrenade",
    "Molotov": "molotov", "Incendiary Grenade": "incgrenade", "Decoy Grenade": "decoy",
}


def sid(v) -> str:
    return str(v) if v is not None else ""


def read(path: str) -> dict:
    with lzma.open(path) as fh:
        return json.load(fh)


def plants(path: str) -> list[tuple[str, str, float, float, float]]:
    d = read(path)
    return [
        (d["mapName"], b["bombSite"], b["playerX"], b["playerY"], b["playerZ"])
        for r in d["gameRounds"] or []
        for b in r["bombEvents"] or []
        if b["bombAction"] == "plant" and b.get("bombSite") in ("A", "B")
    ]


def convert(args: tuple[str, str, dict]) -> int:
    src, out, sites = args
    d = read(src)
    rounds = []
    for r in d["gameRounds"] or []:
        if r.get("isWarmup") or r.get("winningSide") not in ("CT", "T") or r.get("roundEndReason") not in REASON:
            continue
        frames, equip = [], {}
        for fr in r["frames"] or []:
            players = []
            for side in ("t", "ct"):
                for p in (fr.get(side) or {}).get("players") or []:
                    weapon = p["activeWeapon"] or ""
                    players.append({
                        "steamId": sid(p["steamID"]), "team": side.upper(), "x": p["x"], "y": p["y"], "z": p["z"],
                        "velX": p["velocityX"], "velY": p["velocityY"], "health": p["hp"], "armor": p["armor"],
                        "isAlive": bool(p["isAlive"]), "weapon": WEAPON.get(weapon, weapon.lower()),
                    })
                    equip.setdefault(sid(p["steamID"]), p.get("equipmentValueFreezetimeEnd") or 0)
            frames.append({"tick": fr["tick"], "players": players})
        rounds.append({
            "number": r["roundNum"], "startTick": r["startTick"], "endTick": r["endTick"],
            "winner": r["winningSide"], "winReason": REASON[r["roundEndReason"]], "frames": frames,
            "kills": [
                {"tick": k["tick"], "attackerSteamId": sid(k["attackerSteamID"]), "victimSteamId": sid(k["victimSteamID"])}
                for k in r["kills"] or []
            ],
            "bombs": [
                {"tick": b["tick"], "type": BOMB[b["bombAction"]], "playerSteamId": sid(b["playerSteamID"]),
                 "posX": b["playerX"], "posY": b["playerY"], "posZ": b["playerZ"], "site": b.get("bombSite")}
                for b in r["bombEvents"] or [] if b["bombAction"] in BOMB
            ],
            # The app stores grenades at detonation; ESTA's destroyTick is the closest.
            "grenades": [{"tick": g["destroyTick"], "throwerSteamId": sid(g["throwerSteamID"])} for g in r["grenades"] or []],
            "equip": equip,
        })
    name = os.path.basename(src).split(".")[0]
    with open(os.path.join(out, name + ".json"), "w", encoding="utf-8") as fh:
        json.dump({"id": name, "map": d["mapName"], "tickRate": d["tickRate"], "sites": sites.get(d["mapName"], {}), "rounds": rounds}, fh)
    return len(rounds)


def main() -> None:
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    files = [os.path.join(src, f) for f in sorted(os.listdir(src)) if f.endswith(".json.xz")]
    with ProcessPoolExecutor() as ex:
        acc = collections.defaultdict(list)
        for rows in ex.map(plants, files):
            for m, s, x, y, z in rows:
                acc[(m, s)].append((x, y, z))
        sites: dict[str, dict] = collections.defaultdict(dict)
        for (m, s), pts in acc.items():
            sites[m][s] = {k: sum(p[i] for p in pts) / len(pts) for i, k in enumerate("xyz")}
        n = sum(ex.map(convert, [(f, out, sites) for f in files]))
    print(f"{len(files)} matches, {n} rounds -> {out}")


if __name__ == "__main__":
    main()
