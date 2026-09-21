# Cite the data behind your analysis

Use **Cite this analysis** in SurvScope to copy references or download BibTeX/RIS for your reference manager. The accompanying methods paragraph includes your gene, cohort, comparison, group sizes, exclusions, and recorded versions. Save a project to keep these references with your edited figure.

Cite SurvScope as software and the original data resources relevant to your selected cohort. A TCGA analysis and a CPTAC analysis have different clinical sources.

## TCGA analyses

- **Clinical outcomes:** Liu J, Lichtenberg T, Hoadley KA, et al. An Integrated TCGA Pan-Cancer Clinical Data Resource to Drive High-Quality Survival Outcome Analytics. *Cell.* 2018;173(2):400–416.e11. [doi:10.1016/j.cell.2018.02.052](https://doi.org/10.1016/j.cell.2018.02.052).
- **Data distribution:** Goldman MJ, Craft B, Hastie M, et al. Visualizing and interpreting cancer genomics data via the Xena platform. *Nature Biotechnology.* 2020;38:675–678. [doi:10.1038/s41587-020-0546-8](https://doi.org/10.1038/s41587-020-0546-8).
- **Data resource:** Heath AP, Ferretti V, Agrawal S, et al. The NCI Genomic Data Commons. *Nature Genetics.* 2021;53:257–262. [doi:10.1038/s41588-021-00791-5](https://doi.org/10.1038/s41588-021-00791-5).

The expression measurements are GDC STAR TPM distributed through UCSC Xena. Survival outcomes come from the TCGA Pan-Cancer Clinical Data Resource (TCGA-CDR). The citation panel also lists the cohort's GDC project and verified original marker publication where available. Follow the [TCGA acknowledgement guidance](https://www.cancer.gov/ccg/research/genome-sequencing/tcga/using-tcga-data/citing).

For example, TCGA-PAAD includes: The Cancer Genome Atlas Research Network. Integrated Genomic Characterization of Pancreatic Ductal Adenocarcinoma. *Cancer Cell.* 2017;32(2):185–203.e13. [doi:10.1016/j.ccell.2017.07.007](https://doi.org/10.1016/j.ccell.2017.07.007).

## CPTAC analyses

- **Source dataset:** National Cancer Institute. Clinical Proteomic Tumor Analysis Consortium, CPTAC-3. NCI Genomic Data Commons; accession **phs001287**. Cite the [CPTAC-3 project](https://portal.gdc.cancer.gov/projects/CPTAC-3) with the source release recorded in your analysis.
- **Data resource:** Heath AP, Ferretti V, Agrawal S, et al. The NCI Genomic Data Commons. *Nature Genetics.* 2021;53:257–262. [doi:10.1038/s41588-021-00791-5](https://doi.org/10.1038/s41588-021-00791-5).
- **Clinical source documentation:** National Cancer Institute. [GDC API: Data Analysis — Survival Analysis](https://docs.gdc.cancer.gov/API/Users_Guide/Data_Analysis/).

These analyses use GDC RNA expression and overall-survival records. They do not use TCGA-CDR, UCSC Xena distribution, or CPTAC protein measurements. See the [official CPTAC source overview](https://gdc.cancer.gov/about-gdc/contributed-genomic-data-cancer-research/clinical-proteomic-tumor-analysis-consortium-cptac) and [program acknowledgement guidance](https://pdc.cancer.gov/pdc/data-use-guidelines).

For example, the CPTAC pancreatic consortium publication is: Cao L, Huang C, Zhou DC, et al. Proteogenomic characterization of pancreatic ductal adenocarcinoma. *Cell.* 2021;184(19):5031–5052.e26. [doi:10.1016/j.cell.2021.08.023](https://doi.org/10.1016/j.cell.2021.08.023).

## Cohort publications and recorded versions

A cohort-associated publication describes the consortium study. SurvScope analyzes eligible patients in the recorded data snapshot; that group need not match the publication's original cohort exactly. This distinction is especially relevant when a source combines discovery and confirmatory studies.

Every supported cohort has dataset and resource citations. The application does not infer a paper from a similar cancer name: for example, a renal carcinoma classified as NOS is not automatically assigned a clear-cell renal publication. Where a cohort publication has not been verified, the panel says so.

For SurvScope data **2026.09.18**, CPTAC provenance records **GDC Data Release 46.0, August 10, 2026**. TCGA assets were reused from SurvScope data **2026.07.28**; their upstream GDC release number was not recorded. Archived projects retain known provenance and display missing versions as “not recorded.”

## Sources used to maintain the citation catalog

Citation records are bundled with the application; opening the panel makes no third-party requests. Reference links open only when you choose them. Catalog associations were checked against these primary sources on September 21, 2026:

- [NCI TCGA Research Network publications](https://www.cancer.gov/ccg/research/genome-sequencing/tcga/publications) and [cancers selected for study](https://www.cancer.gov/ccg/research/genome-sequencing/tcga/studied-cancers).
- [GDC's recommended citation](https://gdc.cancer.gov/content/how-do-i-cite-nci-gdc).
- [GDC CPTAC lung adenocarcinoma publication](https://gdc.cancer.gov/about-data/publications/CPTAC-3_2020_3).
- The original CPTAC [pancreatic](https://pubmed.ncbi.nlm.nih.gov/34534465/), [lung squamous](https://pubmed.ncbi.nlm.nih.gov/34358469/), and [glioblastoma](https://pubmed.ncbi.nlm.nih.gov/33577785/) publication records.

The software citation is provided in [CITATION.cff](../CITATION.cff).
