import re
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from PIL import Image, UnidentifiedImageError
from PIL.Image import DecompressionBombError

_MAX_BYTES = 5 * 1024 * 1024
_MAX_EDGE = 4096
UPLOAD_URL = re.compile(
    r"/static/(avatars|workspace_icons)/[0-9]+_[a-f0-9]{32}\.(jpg|jpeg|png|webp)"
)


def read_upload(file_storage):
    """Decode an upload and return new image bytes plus a safe extension."""
    data = file_storage.read(_MAX_BYTES + 1)
    if not data or len(data) > _MAX_BYTES:
        return None
    try:
        Image.MAX_IMAGE_PIXELS = _MAX_EDGE * _MAX_EDGE
        with Image.open(BytesIO(data)) as image:
            if image.width > _MAX_EDGE or image.height > _MAX_EDGE or image.width < 1:
                return None
            image.load()
            if image.format == "JPEG":
                image = image.convert("RGB")
                extension, image_format = "jpg", "JPEG"
            elif image.format == "PNG":
                extension, image_format = "png", "PNG"
            elif image.format == "WEBP":
                extension, image_format = "webp", "WEBP"
            else:
                return None
            output = BytesIO()
            image.save(output, format=image_format)
    except (UnidentifiedImageError, DecompressionBombError, OSError, ValueError):
        return None
    encoded = output.getvalue()
    if not encoded or len(encoded) > _MAX_BYTES:
        return None
    return encoded, extension


def stored_name(owner_id, ext):
    return f"{owner_id}_{uuid4().hex}.{ext}"


def remove_upload(static_folder, url):
    if not isinstance(url, str):
        return
    match = UPLOAD_URL.fullmatch(url)
    if match is None:
        return
    directory = (Path(static_folder) / match.group(1)).resolve()
    path = (directory / url.rsplit("/", 1)[-1]).resolve()
    if path.parent != directory:
        return
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass
