# Python package publishing

The [v0.4.2 GitHub release](https://github.com/oncologylab/survscope/releases/tag/v0.4.2)
contains the tested wheel and source distribution. The website and immutable
data release are already public. Install the GitHub wheel directly:

```bash
python -m pip install \
  https://github.com/oncologylab/survscope/releases/download/v0.4.2/survscope-0.4.2-py3-none-any.whl
```

The first PyPI upload was rejected with `invalid-publisher`: the signed GitHub
identity did not match a registered publisher. The
[publish run](https://github.com/oncologylab/survscope/actions/runs/35413131991)
built and tested both distributions successfully; only the PyPI exchange failed.

## One-time PyPI registration

Sign in to the PyPI account that should own the project and open
[account publishing settings](https://pypi.org/manage/account/publishing/).
Add a pending GitHub Trusted Publisher with these values:

| Field | Value |
| --- | --- |
| PyPI project name | `survscope` |
| GitHub owner | `oncologylab` |
| Repository | `survscope` |
| Workflow filename | `publish.yml` |
| Environment | `pypi` |

If the project already exists, configure these same values in that project's
Publishing settings. See PyPI's instructions for
[creating a project with a pending publisher](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/)
and [diagnosing publisher mismatches](https://docs.pypi.org/trusted-publishers/troubleshooting/).

After registration, retry the publishing job for the latest software release.
For the historical first upload, the command was:

```bash
gh run rerun 35413131991 --failed
```

The existing workflow already uses the `pypi` environment and GitHub OIDC.
Do not create an API-token secret or replace the published release assets.
Future software versions use new `vX.Y.Z` releases; data refreshes use new
immutable `data-vYYYY.MM.DD` releases.
