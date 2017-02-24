"""
Custom Django Model mixins.
"""
from django.db import models


class DeprecatedModel(models.Model):  # pylint: disable=model-missing-unicode
    """
    Used to make a class unusable in practice, but leave database tables intact.
    """
    def __init__(self, *args, **kwargs):  # pylint: disable=super-init-not-called
        """
        Override to kill usage of this model.
        """
        raise NotImplementedError("This model has been deprecated and should not be used.")

    class Meta:
        abstract = True
