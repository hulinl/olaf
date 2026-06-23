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
    path(
        "me/push-subscriptions/",
        views.push_subscriptions,
        name="push-subscriptions",
    ),
    path(
        "me/push-subscriptions/<int:sub_id>/",
        views.push_subscription_detail,
        name="push-subscription-detail",
    ),
    path("me/push-test/", views.push_test, name="push-test"),
    path(
        "me/integrations/notion/",
        views.notion_integration,
        name="notion-integration",
    ),
    path(
        "me/integrations/anthropic/",
        views.anthropic_integration,
        name="anthropic-integration",
    ),
    path("me/people/", views.creator_people, name="creator-people"),
    path(
        "me/people/hidden/",
        views.creator_hidden_people,
        name="creator-hidden-people",
    ),
    path(
        "me/people/<int:user_id>/",
        views.creator_person_detail,
        name="creator-person-detail",
    ),
    path(
        "me/people/<int:user_id>/hide/",
        views.creator_person_hide,
        name="creator-person-hide",
    ),
    path(
        "me/api-tokens/",
        views.api_tokens,
        name="api-tokens",
    ),
    path(
        "me/api-tokens/<int:token_id>/",
        views.api_token_detail,
        name="api-token-detail",
    ),
    path("password/reset/request/", views.password_reset_request, name="password-reset-request"),
    path("password/reset/confirm/", views.password_reset_confirm, name="password-reset-confirm"),
]
