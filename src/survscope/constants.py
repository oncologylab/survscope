"""Stable SurvScope constants shared by analysis, plotting, and data building."""

from __future__ import annotations

DEFAULT_DATA_VERSION = "2026.07.28"
SCHEMA_VERSION = 1
EXPRESSION_SCALE = 1000
MISSING_EXPRESSION = 65535
MONTH_DAYS = 30.4375
BUCKET_COUNT = 16

ENDPOINTS = ("OS", "DSS", "PFI", "DFI")
ENDPOINT_COLUMNS = {
    "OS": ("OS.time", "OS"),
    "DSS": ("DSS.time", "DSS"),
    "PFI": ("PFI.time", "PFI"),
    "DFI": ("DFI.time", "DFI"),
}

COHORTS = (
    "ACC",
    "BLCA",
    "BRCA",
    "CESC",
    "CHOL",
    "COAD",
    "DLBC",
    "ESCA",
    "GBM",
    "HNSC",
    "KICH",
    "KIRC",
    "KIRP",
    "LAML",
    "LGG",
    "LIHC",
    "LUAD",
    "LUSC",
    "MESO",
    "OV",
    "PAAD",
    "PCPG",
    "PRAD",
    "READ",
    "SARC",
    "SKCM",
    "STAD",
    "TGCT",
    "THCA",
    "THYM",
    "UCEC",
    "UCS",
    "UVM",
)

COHORT_LABELS = {
    "ACC": "Adrenocortical carcinoma",
    "BLCA": "Bladder urothelial carcinoma",
    "BRCA": "Breast invasive carcinoma",
    "CESC": "Cervical squamous cell carcinoma and endocervical adenocarcinoma",
    "CHOL": "Cholangiocarcinoma",
    "COAD": "Colon adenocarcinoma",
    "DLBC": "Diffuse large B-cell lymphoma",
    "ESCA": "Esophageal carcinoma",
    "GBM": "Glioblastoma multiforme",
    "HNSC": "Head and neck squamous cell carcinoma",
    "KICH": "Kidney chromophobe",
    "KIRC": "Kidney renal clear cell carcinoma",
    "KIRP": "Kidney renal papillary cell carcinoma",
    "LAML": "Acute myeloid leukemia",
    "LGG": "Lower-grade glioma",
    "LIHC": "Liver hepatocellular carcinoma",
    "LUAD": "Lung adenocarcinoma",
    "LUSC": "Lung squamous cell carcinoma",
    "MESO": "Mesothelioma",
    "OV": "Ovarian serous cystadenocarcinoma",
    "PAAD": "Pancreatic adenocarcinoma",
    "PCPG": "Pheochromocytoma and paraganglioma",
    "PRAD": "Prostate adenocarcinoma",
    "READ": "Rectum adenocarcinoma",
    "SARC": "Sarcoma",
    "SKCM": "Skin cutaneous melanoma",
    "STAD": "Stomach adenocarcinoma",
    "TGCT": "Testicular germ cell tumors",
    "THCA": "Thyroid carcinoma",
    "THYM": "Thymoma",
    "UCEC": "Uterine corpus endometrial carcinoma",
    "UCS": "Uterine carcinosarcoma",
    "UVM": "Uveal melanoma",
}

GDC_EXPRESSION_URL = (
    "https://gdc-hub.s3.us-east-1.amazonaws.com/download/TCGA-{cohort}.star_tpm.tsv.gz"
)
GDC_PROBEMAP_URL = (
    "https://gdc-hub.s3.us-east-1.amazonaws.com/download/"
    "gencode.v36.annotation.gtf.gene.probemap"
)
TCGA_CDR_URL = (
    "https://pancanatlas.xenahubs.net/download/"
    "Survival_SupplementalTable_S1_20171025_xena_sp"
)
TCGA_CDR_CITATION_URL = "https://doi.org/10.1016/j.cell.2018.02.052"
GDC_PIPELINE_URL = (
    "https://docs.gdc.cancer.gov/Data/Bioinformatics_Pipelines/Expression_mRNA_Pipeline/"
)
