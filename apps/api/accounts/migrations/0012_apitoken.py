# Personal access tokens for the OLAF JSON API (used by external
# clients like the mountain-guide Claude Code skill).

import django.utils.timezone
from django.conf import settings
from django.db import migrations, models

import accounts.models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0011_user_notify_on_discussion_mention_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='APIToken',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                (
                    'label',
                    models.CharField(
                        help_text='User-picked nickname, e.g. "mountain-guide laptop".',
                        max_length=80,
                    ),
                ),
                (
                    'key',
                    models.CharField(
                        db_index=True,
                        default=accounts.models._generate_token,
                        max_length=64,
                        unique=True,
                    ),
                ),
                (
                    'created_at',
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                ('last_used_at', models.DateTimeField(blank=True, null=True)),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name='api_tokens',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                'db_table': 'accounts_apitoken',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(
                        fields=['user', 'revoked_at'],
                        name='accounts_ap_user_id_revoked_idx',
                    )
                ],
            },
        ),
    ]
