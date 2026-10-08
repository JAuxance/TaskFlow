from flask import Blueprint, current_app

privacy_bp = Blueprint("privacy", __name__)


@privacy_bp.get("/api/privacy")
def privacy_contact():
    # Only this public contact is exposed, never the application configuration.
    return {"contact_email": current_app.config.get("PRIVACY_CONTACT_EMAIL") or None}
