import statistics

from config import ARENA_QUEUE_WEIGHTS, ARENA_PASS_THRESHOLDS


def _closeness(p):
    return 1.0 - abs(p["left"]["overall"] - p["right"]["overall"]) / 100.0


def _cat_disagreement(p):
    def nsd(g):
        v = [float(x) for x in g.values()] if g else []
        return min(statistics.pstdev(v) / 50.0, 1.0) if len(v) >= 2 else 0.0
    return max(nsd(p["left"]["grades"]), nsd(p["right"]["grades"]))


def _rank_conflict(p):
    lo, ro = p["left"]["overall"], p["right"]["overall"]
    if lo == ro:
        return 0.0
    lg, rg = p["left"]["grades"], p["right"]["grades"]
    keys = set(lg) & set(rg)
    if not keys:
        return 0.0
    cl = sum(1 for k in keys if lg[k] > rg[k])
    cr = sum(1 for k in keys if rg[k] > lg[k])
    return 1.0 if (cl > cr) != (lo > ro) else 0.0


def _borderline(p, band=5):
    near = lambda x: any(abs(x - t) <= band for t in ARENA_PASS_THRESHOLDS)
    return 1.0 if near(p["left"]["overall"]) or near(p["right"]["overall"]) else 0.0


def score_pair(p):
    w = ARENA_QUEUE_WEIGHTS
    return round(w["closeness"] * _closeness(p) + w["category"] * _cat_disagreement(p)
                 + w["rank_conflict"] * _rank_conflict(p) + w["borderline"] * _borderline(p), 6)


def score_all(pairs):
    for p in pairs:
        p["disagreement"] = score_pair(p)
    return sorted(pairs, key=lambda x: x["disagreement"], reverse=True)
