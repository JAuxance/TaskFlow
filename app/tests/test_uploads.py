import io
import struct
import zlib

from unittest.mock import Mock

from PIL import Image
from werkzeug.datastructures import FileStorage

from app.routes.media import media_bp
from app.uploads import read_upload


def _png(size=(2, 2), extra=b""):
    buffer = io.BytesIO()
    Image.new("RGB", size, "red").save(buffer, format="PNG")
    return buffer.getvalue() + extra


def _upload(payload):
    return FileStorage(stream=io.BytesIO(payload), filename="upload.bin", content_type=None)


def _declared_png(width, height):
    data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    crc = zlib.crc32(b"IHDR" + data) & 0xFFFFFFFF
    chunk = struct.pack(">I", 13) + b"IHDR" + data + struct.pack(">I", crc)
    iend = struct.pack(">I", 0) + b"IEND" + struct.pack(">I", zlib.crc32(b"IEND") & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk + iend


def test_garbage_and_truncated_images_are_rejected():
    assert read_upload(_upload(b"this is not an image")) is None
    assert read_upload(_upload(b"\x89PNG")) is None
    assert read_upload(_upload(b"\xff\xd8\xff")) is None
    assert read_upload(_upload(_png(size=(4097, 1)))) is None
    assert read_upload(_upload(_declared_png(6000, 6000))) is None




def test_image_is_reencoded_without_trailing_bytes():
    payload = _png() + b"SecretCamera trailing text"
    result = read_upload(_upload(payload))
    assert result is not None
    data, extension = result
    assert extension == "png"
    assert b"SecretCamera" not in data
    with Image.open(io.BytesIO(data)) as image:
        assert image.size == (2, 2)
        assert image.format == "PNG"


def test_static_aliases_do_not_return_the_file(client, app, tmp_path):
    if "media" not in app.blueprints:
        app.register_blueprint(media_bp)
    avatar_dir = tmp_path / "avatars"
    avatar_dir.mkdir()
    name = "999_" + ("a" * 32) + ".png"
    (avatar_dir / name).write_bytes(b"secret-bytes")
    app.static_folder = str(tmp_path)
    dotted = client.get(f"/static/avatars/./{name}")
    encoded = client.get(f"/static/avatars/%2e/{name}")
    assert dotted.status_code == 404
    assert encoded.status_code == 404
    assert b"secret-bytes" not in dotted.data
    assert b"secret-bytes" not in encoded.data
    assert client.get(f"/static/avatars/{name}").status_code == 401


def test_hidden_media_is_not_found(client, app, monkeypatch):
    if "media" not in app.blueprints:
        app.register_blueprint(media_bp)
    cursor = Mock()
    cursor.fetchone.return_value = None
    cursor.__enter__ = Mock(return_value=cursor)
    cursor.__exit__ = Mock(return_value=False)
    connection = Mock()
    connection.cursor.return_value = cursor
    connection.__enter__ = Mock(return_value=connection)
    connection.__exit__ = Mock(return_value=False)
    monkeypatch.setattr("app.routes.media.get_db_connection", lambda: connection)
    monkeypatch.setattr("app.routes.media.get_authenticated_user", lambda: (4, None))

    avatar = client.get(f"/static/avatars/9_{'ab' * 16}.png")
    icon = client.get(f"/static/workspace_icons/3_{'cd' * 16}.webp")
    assert avatar.status_code == 404
    assert icon.status_code == 404


def test_allowed_user_receives_the_image(client, app, tmp_path, monkeypatch):
    if "media" not in app.blueprints:
        app.register_blueprint(media_bp)
    avatar_dir = tmp_path / "avatars"
    avatar_dir.mkdir()
    name = "4_" + ("ab" * 16) + ".png"
    payload = _png()
    (avatar_dir / name).write_bytes(payload)
    app.static_folder = str(tmp_path)
    monkeypatch.setattr("app.routes.media.get_authenticated_user", lambda: (4, None))
    monkeypatch.setattr("app.routes.media._avatar_visible", lambda user_id, path: True)
    response = client.get(f"/static/avatars/{name}")
    assert response.status_code == 200
    assert response.data == payload
    assert response.headers["Cache-Control"] == "no-store, private"
