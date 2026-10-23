# Citations

In SurvScope, choose **Cite this analysis** to copy references or download BibTeX or RIS. The methods paragraph lists your gene, cohort, comparison, group sizes, exclusions and versions. It mentions BH adjustment only when the [q-value](methods.md#adjusted-q-values) is shown.

Cite SurvScope as software ([CITATION.cff](../CITATION.cff)). Also cite the data sources for your cohort. TCGA and CPTAC have different sources.

## TCGA analyses

Expression is GDC STAR TPM from UCSC Xena. Outcomes are from the TCGA Pan-Cancer Clinical Data Resource (TCGA-CDR).

- Clinical outcomes: Liu J, Lichtenberg T, Hoadley KA, et al. An Integrated TCGA Pan-Cancer Clinical Data Resource to Drive High-Quality Survival Outcome Analytics. *Cell.* 2018;173(2):400–416.e11. [doi:10.1016/j.cell.2018.02.052](https://doi.org/10.1016/j.cell.2018.02.052).
- Data distribution: Goldman MJ, Craft B, Hastie M, et al. Visualizing and interpreting cancer genomics data via the Xena platform. *Nature Biotechnology.* 2020;38:675–678. [doi:10.1038/s41587-020-0546-8](https://doi.org/10.1038/s41587-020-0546-8).
- Data resource: Heath AP, Ferretti V, Agrawal S, et al. The NCI Genomic Data Commons. *Nature Genetics.* 2021;53:257–262. [doi:10.1038/s41588-021-00791-5](https://doi.org/10.1038/s41588-021-00791-5).

The panel also lists the cohort's GDC project and its checked publication, when there is one. Follow the [TCGA acknowledgement guidance](https://www.cancer.gov/ccg/research/genome-sequencing/tcga/using-tcga-data/citing).

Example cohort paper for TCGA-PAAD: The Cancer Genome Atlas Research Network. Integrated Genomic Characterization of Pancreatic Ductal Adenocarcinoma. *Cancer Cell.* 2017;32(2):185–203.e13. [doi:10.1016/j.ccell.2017.07.007](https://doi.org/10.1016/j.ccell.2017.07.007).

## CPTAC analyses

These use GDC RNA expression and overall-survival records. They do not use TCGA-CDR, UCSC Xena or CPTAC protein data.

- Source dataset: National Cancer Institute. Clinical Proteomic Tumor Analysis Consortium, CPTAC-3. NCI Genomic Data Commons; accession phs001287. Cite the [CPTAC-3 project](https://portal.gdc.cancer.gov/projects/CPTAC-3) with the source release recorded in your analysis.
- Data resource: Heath AP, Ferretti V, Agrawal S, et al. The NCI Genomic Data Commons. *Nature Genetics.* 2021;53:257–262. [doi:10.1038/s41588-021-00791-5](https://doi.org/10.1038/s41588-021-00791-5).
- Clinical source documentation: National Cancer Institute. [GDC API: Data Analysis — Survival Analysis](https://docs.gdc.cancer.gov/API/Users_Guide/Data_Analysis/).

See the [CPTAC source overview](https://gdc.cancer.gov/about-gdc/contributed-genomic-data-cancer-research/clinical-proteomic-tumor-analysis-consortium-cptac) and [acknowledgement guidance](https://pdc.cancer.gov/pdc/data-use-guidelines).

Example cohort paper for CPTAC pancreatic cancer: Cao L, Huang C, Zhou DC, et al. Proteogenomic characterization of pancreatic ductal adenocarcinoma. *Cell.* 2021;184(19):5031–5052.e26. [doi:10.1016/j.cell.2021.08.023](https://doi.org/10.1016/j.cell.2021.08.023).

## Cohort papers and versions

SurvScope's patients may differ from a cohort paper's patients. A paper is listed only when its link to the cohort was checked. The app does not guess from a similar name: renal carcinoma NOS does not get the clear-cell paper. Every cohort still has dataset and resource citations.

For SurvScope data 2026.09.18, CPTAC records GDC Data Release 46.0 (August 10, 2026). TCGA assets come from SurvScope data 2026.07.28. Their GDC release number was not recorded. Missing versions show as “not recorded.”

## Sources for the citation catalog

Citations are bundled. The panel makes no third-party requests. The catalog was checked against these sources on September 21, 2026:

- [NCI TCGA Research Network publications](https://www.cancer.gov/ccg/research/genome-sequencing/tcga/publications) and [cancers selected for study](https://www.cancer.gov/ccg/research/genome-sequencing/tcga/studied-cancers)
- [GDC's recommended citation](https://gdc.cancer.gov/content/how-do-i-cite-nci-gdc)
- [GDC CPTAC lung adenocarcinoma publication](https://gdc.cancer.gov/about-data/publications/CPTAC-3_2020_3)
- The CPTAC [pancreatic](https://pubmed.ncbi.nlm.nih.gov/34534465/), [lung squamous](https://pubmed.ncbi.nlm.nih.gov/34358469/) and [glioblastoma](https://pubmed.ncbi.nlm.nih.gov/33577785/) publication records
