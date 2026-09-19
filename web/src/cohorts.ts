export function cohortDisplayName(cohort: string): string {
  return /^(CPTAC|TCGA)-/.test(cohort) ? cohort : `TCGA-${cohort}`;
}

export function figureFilename(gene: string, cohort: string, extension: string): string {
  return `${gene}_${cohortDisplayName(cohort).replaceAll("-", "_")}_KM_survival.${extension}`;
}
