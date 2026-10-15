from app.core.config import Settings


def jwt_signing_key(settings: Settings) -> str:
    return settings.jwt_secret.get_secret_value()
