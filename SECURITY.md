# Security policy

Please report security issues privately through GitHub Security Advisories for
`oncologylab/survscope`.

SurvScope does not require credentials at runtime. PyPI publication uses
short-lived GitHub OIDC credentials through PyPI Trusted Publishing; long-lived
PyPI API tokens must not be stored in the repository or Actions secrets.
