from preference import active_learning as al


def _pair(lo, ro, lg=None, rg=None):
    return {
        "left": {"overall": lo, "grades": lg or {}},
        "right": {"overall": ro, "grades": rg or {}},
    }


def test_closeness_direction():
    assert al._closeness(_pair(70, 70)) == 1.0
    assert al._closeness(_pair(10, 90)) < al._closeness(_pair(40, 60))


def test_category_disagreement_direction():
    low = al._cat_disagreement(_pair(50, 50, {"a": 50, "b": 50}, {"a": 50, "b": 50}))
    high = al._cat_disagreement(_pair(50, 50, {"a": 10, "b": 90}, {"a": 50, "b": 50}))
    assert high > low
    assert al._cat_disagreement(_pair(50, 50, {"a": 50}, {"a": 50})) == 0.0


def test_rank_conflict_direction():
    conflict = _pair(80, 70, {"a": 10, "b": 10}, {"a": 90, "b": 90})
    agree = _pair(80, 70, {"a": 90, "b": 90}, {"a": 10, "b": 10})
    assert al._rank_conflict(conflict) == 1.0
    assert al._rank_conflict(agree) == 0.0
    assert al._rank_conflict(_pair(70, 70)) == 0.0


def test_borderline_direction():
    assert al._borderline(_pair(50, 20)) == 1.0
    assert al._borderline(_pair(74, 20)) == 1.0
    assert al._borderline(_pair(30, 22)) == 0.0


def test_score_all_sorted_desc_and_hard_ranks_first():
    hard = _pair(60, 61, {"a": 10, "b": 90}, {"a": 90, "b": 10})
    easy = _pair(20, 95, {"a": 20, "b": 20}, {"a": 95, "b": 95})
    out = al.score_all([easy, hard])
    assert out[0] is hard
    assert out[0]["disagreement"] >= out[1]["disagreement"]
