from django.urls import path

from . import views

app_name = "gear"

urlpatterns = [
    path("items/", views.gear_items, name="items"),
    path("items/<int:item_id>/", views.gear_item_detail, name="item-detail"),
    path("lists/", views.gear_lists, name="lists"),
    path("lists/<int:list_id>/", views.gear_list_detail, name="list-detail"),
    path(
        "lists/<int:list_id>/items/",
        views.gear_list_add_item,
        name="list-add-item",
    ),
    path(
        "lists/<int:list_id>/items/<int:entry_id>/",
        views.gear_list_entry_detail,
        name="list-entry-detail",
    ),
    path(
        "lists/by-slug/<slug:slug>/",
        views.public_gear_list,
        name="list-by-slug",
    ),
    path(
        "g/<slug:slug>/<int:entry_id>/",
        views.gear_link_click,
        name="go",
    ),
    path("import_csv/", views.gear_import_csv, name="import-csv"),
]
