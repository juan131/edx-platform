"""Models providing Programs support for the LMS and Studio."""
from urlparse import urljoin

from django.utils.translation import ugettext_lazy as _
from django.db import models

from config_models.models import ConfigurationModel


class ProgramsApiConfig(ConfigurationModel):
    """
    This Model no longer fronts an API, but now sets a few config-related values for the idea of programs in general.

    A rename to ProgramsConfig would likely be more accurate, but costly in terms of developer time.
    """

    marketing_path = models.CharField(
        max_length=255,
        blank=True,
        help_text=_(
            'Path used to construct URLs to programs marketing pages (e.g., "/foo").'
        )
    )