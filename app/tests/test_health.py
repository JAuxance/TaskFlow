from unittest.mock import MagicMock

def test_health_returns_ok_when_database_is_available(client, monkeypatch):
    fake_connection = MagicMock()

    monkeypatch.setattr(
        "app.app.get_db_connection",
        lambda: fake_connection
    )

    response = client.get("/health")

    assert response.status_code == 200
    assert response.get_json() == {
        "api": "ok",
        "database": "ok"
    }
def test_health_returns_500_when_database_is_unavailable(client, monkeypatch):
    def fake_db_connection():
        raise Exception("database unavailable")
    monkeypatch.setattr(
        "app.app.get_db_connection",
        fake_db_connection
    )

    response = client.get("/health")

    assert response.status_code == 500
    assert response.get_json() == {
        "api": "ok",
        "database": "error"
    }
