from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    path("csrf/", views.csrf, name="csrf"),
    path("signup/", views.signup, name="signup"),
    path("verify/", views.verify_email, name="verify"),
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("me/", views.me, name="me"),
    path("password/reset/request/", views.password_reset_request, name="password-reset-request"),
    path("password/reset/confirm/", views.password_reset_confirm, name="password-reset-confirm"),
]
