import pytest


@pytest.mark.parametrize("method,path", [
    ("POST", "/api/users/me/avatar"),
    ("POST", "/api/workspaces/1/icon"), ("PATCH", "/api/workspaces/1/icon"),
    ("POST", "/api/workspaces/1/messages"), ("GET", "/api/workspaces/1/messages"),
    ("POST", "/api/users/2/direct_messages"), ("GET", "/api/users/2/direct_messages"),
    ("GET", "/api/direct_conversations"), ("GET", "/socket.io/"),
])
def test_retired_features_cannot_be_used(client, method, path):
    # BrowserClient supplies the CSRF headers: a rejection is not just missing CSRF.
    response = client.open(path, method=method, json={})
    assert response.status_code in (404, 405)
