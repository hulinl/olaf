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
    path("me/todo/", views.me_todo, name="me-todo"),
    path(
        "me/billing-profiles/",
        views.billing_profiles_list,
        name="billing-profiles",
    ),
    path(
        "me/billing-profiles/<int:profile_id>/",
        views.billing_profile_detail,
        name="billing-profile-detail",
    ),
    path("password/reset/request/", views.password_reset_request, name="password-reset-request"),
    path("password/reset/confirm/", views.password_reset_confirm, name="password-reset-confirm"),
]
