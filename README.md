# SurvScope

[![CI](https://github.com/oncologylab/survscope/actions/workflows/ci.yml/badge.svg)](https://github.com/oncologylab/survscope/actions/workflows/ci.yml)
[![Open the app](https://img.shields.io/badge/open-SurvScope-1f2328)](https://oncologylab.github.io/survscope/)

SurvScope shows how a gene's RNA expression relates to cancer survival. You can edit and download the figure. It runs in your browser with no account or install.

[Open SurvScope](https://oncologylab.github.io/survscope/) · [User guide](docs/user-guide.md) · [Methods](docs/methods.md)

![SurvScope showing a survival comparison and the available expression groups](docs/images/comparison.png)

## Quick start

1. Choose a cancer cohort and a gene, such as TP53.
2. Choose how to split patients into lower and higher expression. The median is a good start. Check the group sizes.
3. Select **Create survival plot**.
4. Double-click text to edit it. Use **Properties** and **Layers** to change the figure.
5. Download SVG, PDF or PNG. Use **Save project** to keep editing later.

The [user guide](docs/user-guide.md) covers all comparisons, editor tools and [fonts](docs/user-guide.md#choose-a-font).

## Data

| Program | Cohorts | Outcomes |
| --- | ---: | --- |
| TCGA | 33 | OS, DSS, PFI, DFI (where the source has them) |
| CPTAC-3 | 18 | OS only |

The release covers 59,317 gene symbols. Protein data and CPTAC-2 survival are not included. Some CPTAC groups have only one or two patients. See [CPTAC coverage](docs/cptac.md).

Results are unadjusted associations, not proof of cause. See [how to read the plot](docs/user-guide.md#understand-the-figure).

## Python and command line

```bash
python -m pip install survscope
survscope plot --gene SRD5A1 --cohort PAAD --format pdf svg png --outdir plots
survscope plot --gene TP53 --cohort CPTAC-3-LUAD \
  --grouping percentile_groups --lower-percent 25 --upper-percent 25 --json --outdir plots
```

```python
import survscope
from survscope import GroupingSpec

result = survscope.analyze(
    "SRD5A1", "PAAD",
    grouping=GroupingSpec("percentile_groups", lower_percent=25, upper_percent=25),
)
survscope.plot(result, formats=("pdf", "svg"), output_dir="plots")
```

Add `--show-q` or `show_q=True` for [q-values](docs/methods.md#adjusted-q-values). The editor is browser-only. Wheels are also on the [latest release](https://github.com/oncologylab/survscope/releases/latest).

## Cite

In the app, choose **Cite this analysis** for references, BibTeX, RIS and a methods paragraph. See [citations](docs/citations.md).

## More

- [User guide](docs/user-guide.md): comparisons, editing, downloads, questions
- [Methods](docs/methods.md): statistics and [validation](docs/methods.md#validation)
- [CPTAC](docs/cptac.md): cohorts, sources, rules
- [Data format](docs/data-format.md): asset files
- [Development](docs/development.md): setup, checks, releases

Data releases never change. Projects record data and software versions. The app makes no third-party requests. Data contain no patient IDs or raw matrices.

SurvScope is research software. It is not for diagnosis or clinical decisions.

## License

Code: [MIT](LICENSE). Fonts and numerical code keep their [third-party notices](web/public/third-party-notices.txt). Data keep their original terms.
