# Python package publishing

[SurvScope 0.4.3 is available on PyPI](https://pypi.org/project/survscope/0.4.3/).
Its wheel and source distribution match the checksummed files in the
[GitHub release](https://github.com/oncologylab/survscope/releases/tag/v0.4.3).
Install this version with:

```bash
python -m pip install survscope==0.4.3
```

## One-time Trusted Publisher registration

The GitHub release workflow uses OIDC Trusted Publishing. A PyPI project owner
must register the workflow in the project's
[Publishing settings](https://pypi.org/manage/project/survscope/settings/publishing/).
Add a GitHub publisher with these exact values:

| Field | Value |
| --- | --- |
| GitHub owner | `oncologylab` |
| Repository | `survscope` |
| Workflow filename | `publish.yml` |
| Environment | `pypi` |

The GitHub owner is the repository's organization, not the PyPI account name.
The workflow field takes the filename alone, without `.github/workflows/`.
The project already exists, so use its Publishing settings instead of adding
a pending publisher under the account. PyPI API tokens authenticate uploads;
they cannot register a Trusted Publisher. See
[PyPI's registration instructions](https://docs.pypi.org/trusted-publishers/adding-a-publisher/).

Verify the registration from the main branch without uploading a release:

```bash
gh workflow run publish.yml --ref main
```

This runs **Verify PyPI Trusted Publisher** in the same workflow and `pypi`
environment used for releases. It asks PyPI to validate GitHub's identity,
then discards the returned short-lived credential. No files are uploaded.
The check follows [PyPI's documented OIDC exchange](https://docs.pypi.org/trusted-publishers/using-a-publisher/#the-manual-way);
release uploads continue to use the maintained PyPA publishing action.

## Future releases and troubleshooting

After registration, publishing a new software release named `vX.Y.Z` triggers
the workflow in `.github/workflows/publish.yml`. Its build job runs the tests,
builds the distributions, and checks their metadata. Its publish job exchanges
the GitHub identity for a short-lived PyPI upload credential.
Do not add an API-token secret to the workflow or repository settings.

An `invalid-publisher` error means PyPI could not match the GitHub identity to
a registered publisher. Check the four fields above and make sure the
registration is on production PyPI, not TestPyPI. See
[PyPI's troubleshooting guide](https://docs.pypi.org/trusted-publishers/troubleshooting/).

Retry a failed upload only after fixing its cause and checking which files are
already on PyPI. Version 0.4.3 has already been uploaded; rerunning its old
failed job would attempt to upload the same files again. Do not replace or
delete published distributions to retry a release. Future software versions
use new `vX.Y.Z` releases; data refreshes use new immutable
`data-vYYYY.MM.DD` releases.
