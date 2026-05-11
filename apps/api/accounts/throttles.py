import re

from rest_framework.throttling import AnonRateThrottle

_RATE_RE = re.compile(r"^(\d+)/(\d*)([smhd])$")
_DURATIONS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


class _ConfigurableAnonThrottle(AnonRateThrottle):
    """Anonymous throttle that accepts rates like '5/15m' (DRF only handles '5/m')."""

    def parse_rate(self, rate):
        if rate is None:
            return (None, None)
        match = _RATE_RE.match(rate)
        if not match:
            return super().parse_rate(rate)
        num, multiplier, period = match.groups()
        duration = _DURATIONS[period] * int(multiplier or 1)
        return int(num), duration


class RegisterThrottle(_ConfigurableAnonThrottle):
    """PRD §6 — 5 registration attempts per hour per IP."""

    scope = "register"


class LoginThrottle(_ConfigurableAnonThrottle):
    """PRD §6 — 5 login attempts per 15 minutes per IP."""

    scope = "login"


class PasswordResetThrottle(_ConfigurableAnonThrottle):
    """5 password-reset requests per hour per IP."""

    scope = "password_reset"
