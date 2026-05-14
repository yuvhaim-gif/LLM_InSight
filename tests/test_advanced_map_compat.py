import pytest


class TestAdvancedMapCompat:
    def test_save_canonical_keys(self, auth_client):
        resp = auth_client.post(
            "/save_advanced_models",
            json={
                "layer1a_models": {"1": "m"},
                "layer1b_models": {"1": "m"},
                "layer2_models": {"1": "m"},
            },
            content_type="application/json",
        )
        assert resp.get_json()["success"] is True
        get_resp = auth_client.get("/get_advanced_models")
        data = get_resp.get_json()
        assert data["layer1a"] == {"1": "m"}
        assert data["layer1a_models"] == {"1": "m"}
        assert data["layer1b"] == {"1": "m"}
        assert data["layer1b_models"] == {"1": "m"}
        assert data["layer2"] == {"1": "m"}
        assert data["layer2_models"] == {"1": "m"}

    def test_save_alias_keys(self, auth_client):
        resp = auth_client.post(
            "/save_advanced_models",
            json={
                "layer1a": {"1": "m"},
                "layer1b": {"1": "m"},
                "layer2": {"1": "m"},
            },
            content_type="application/json",
        )
        assert resp.get_json()["success"] is True
        get_resp = auth_client.get("/get_advanced_models")
        data = get_resp.get_json()
        assert data["layer1a"] == {"1": "m"}
        assert data["layer1a_models"] == {"1": "m"}

    def test_save_mixed_keys(self, auth_client):
        resp = auth_client.post(
            "/save_advanced_models",
            json={
                "layer1a_models": {"1": "a"},
                "layer1b": {"1": "b"},
                "layer2_models": {"1": "c"},
            },
            content_type="application/json",
        )
        assert resp.get_json()["success"] is True
        get_resp = auth_client.get("/get_advanced_models")
        data = get_resp.get_json()
        assert data["layer1a"] == {"1": "a"}
        assert data["layer1b"] == {"1": "b"}
        assert data["layer2"] == {"1": "c"}

    def test_get_response_dual_keys(self, auth_client):
        auth_client.post(
            "/save_advanced_models",
            json={
                "layer1a_models": {"1": "x"},
                "layer1b_models": {"2": "y"},
                "layer2_models": {"3": "z"},
            },
            content_type="application/json",
        )
        get_resp = auth_client.get("/get_advanced_models")
        data = get_resp.get_json()
        expected_keys = {"layer1a", "layer1b", "layer2", "layer1a_models", "layer1b_models", "layer2_models", "success"}
        assert expected_keys.issubset(set(data.keys()))
        assert data["layer1a"] == data["layer1a_models"]
        assert data["layer1b"] == data["layer1b_models"]
        assert data["layer2"] == data["layer2_models"]

    def test_clear_advanced_models(self, auth_client):
        auth_client.post(
            "/save_advanced_models",
            json={"layer1a_models": {"1": "m"}, "layer1b_models": {"1": "m"}, "layer2_models": {"1": "m"}},
            content_type="application/json",
        )
        resp = auth_client.post("/clear_advanced_models", content_type="application/json")
        assert resp.get_json()["success"] is True
        get_resp = auth_client.get("/get_advanced_models")
        data = get_resp.get_json()
        for key in ("layer1a", "layer1b", "layer2", "layer1a_models", "layer1b_models", "layer2_models"):
            assert data[key] == {}

    def test_save_empty_maps(self, auth_client):
        resp = auth_client.post(
            "/save_advanced_models",
            json={"layer1a_models": {}, "layer1b_models": {}, "layer2_models": {}},
            content_type="application/json",
        )
        assert resp.get_json()["success"] is True
        get_resp = auth_client.get("/get_advanced_models")
        data = get_resp.get_json()
        for key in ("layer1a", "layer1b", "layer2"):
            assert data[key] == {}

    def test_save_preserves_session_across_requests(self, auth_client):
        auth_client.post(
            "/save_advanced_models",
            json={"layer1a_models": {"1": "kept"}, "layer1b_models": {}, "layer2_models": {}},
            content_type="application/json",
        )
        auth_client.post(
            "/set_degradation_break",
            json={"enabled": True},
            content_type="application/json",
        )
        get_resp = auth_client.get("/get_advanced_models")
        data = get_resp.get_json()
        assert data["layer1a"] == {"1": "kept"}

    def test_backup_includes_advanced_maps(self, auth_client):
        auth_client.post(
            "/save_advanced_models",
            json={"layer1a_models": {"1": "a"}, "layer1b_models": {"2": "b"}, "layer2_models": {"3": "c"}},
            content_type="application/json",
        )
        resp = auth_client.get("/get_backup_data")
        sd = resp.get_json()["backup_data"]["session_data"]
        assert sd["advanced_layer1a_models"] == {"1": "a"}
        assert sd["advanced_layer1b_models"] == {"2": "b"}
        assert sd["advanced_layer2_models"] == {"3": "c"}
