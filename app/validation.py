from flask import request


def get_json_object():
    try:
        data = request.get_json(silent=True)
    except (ValueError, RecursionError):
        data = None
    if not isinstance(data, dict) or not data:
        return None, ({"error": "invalid JSON body"}, 400)
    return data, None


def is_valid_text(value, *, allow_empty=True, max_length=None, allow_nul=False):
    if not isinstance(value, str):
        return False
    if not allow_empty and not value.strip():
        return False
    if max_length is not None and len(value) > max_length:
        return False
    if not allow_nul and "\x00" in value:
        return False
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True


def is_valid_id(value):
    return type(value) is int and 1 <= value <= 2147483647


def get_pagination():
    try:
        page = int(request.args.get("page", "1"))
        limit = int(request.args.get("limit", "20"))
    except ValueError:
        return None, ({"error": "invalid pagination"}, 400)
    offset = (page - 1) * limit
    if page < 1 or not 1 <= limit <= 100 or offset > 9223372036854775807:
        return None, ({"error": "invalid pagination"}, 400)
    return (limit, offset), None
