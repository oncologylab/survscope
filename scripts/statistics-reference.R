# Independent reference calculations. No application statistical code is imported.
suppressPackageStartupMessages(library(survival))
suppressPackageStartupMessages(library(jsonlite))
args <- commandArgs(trailingOnly = TRUE)
cases <- fromJSON(args[[1]], simplifyVector = FALSE)
number <- function(x) if (is.null(x)) NA_real_ else as.numeric(x)
numbers <- function(x) vapply(x, number, 0.0)
nan <- NA_real_

curve <- function(time, event) {
  if (!length(time)) return(list(timeline = list(), intervals = list(list(), list(), list())))
  fit <- survfit(Surv(time, event) ~ 1, conf.type = "log", conf.int = 0.95, timefix = FALSE)
  timeline <- lapply(seq_along(fit$time), function(i) list(
    timeMonths = fit$time[i] / 30.4375, survival = fit$surv[i],
    atRisk = fit$n.risk[i], events = fit$n.event[i], censored = fit$n.censor[i],
    greenwood = if (is.finite(fit$std.err[i])) fit$std.err[i]^2 else nan
  ))
  intervals <- lapply(c(.90, .95, .99), function(level) {
    ci <- survfit(Surv(time, event) ~ 1, conf.type = "log", conf.int = level, timefix = FALSE)
    lapply(seq_along(ci$time), function(i) c(ci$lower[i], ci$upper[i]))
  })
  list(timeline = timeline, intervals = intervals)
}

analyze_case <- function(item) {
  data <- item$data; spec <- item$grouping
  encoded <- numbers(data$expression)
  tpm <- 2^(encoded / data$scale) - 1
  tpm[encoded == data$missing] <- nan
  endpoints <- groups <- intervals <- list()
  for (endpoint in c("OS", "DSS", "PFI", "DFI")) {
    clinical <- data$clinical$endpoints[[endpoint]]
    time <- numbers(clinical$time); event <- numbers(clinical$event)
    valid <- is.finite(tpm) & is.finite(time) & time > 0 & event %in% c(0, 1)
    indices <- which(valid); x <- tpm[valid]; time <- time[valid]; event <- event[valid]
    median <- data$gene$medians[[endpoint]]
    kind <- if (spec$kind == "extremes") "percentile_groups" else spec$kind
    if (kind == "percentile" && spec$percentile == 50) kind <- "median"
    if (kind == "percentile_groups" && spec$lowerPercent + spec$upperPercent == 100) {
      kind <- if (spec$lowerPercent == 50) "median" else "percentile"
      spec$percentile <- spec$lowerPercent
    }
    lower <- upper <- if (kind == "tpm") spec$threshold else nan
    low <- high <- rep(FALSE, length(x))
    if (length(x)) {
      if (kind == "median") {
        lower <- upper <- number(median$cutoff_tpm)
        if (!is.finite(lower)) lower <- upper <- median(x)
        high <- xor(x > lower, (indices - 1) %in% numbers(median$flips))
        low <- !high
      } else {
        if (kind == "mean") lower <- upper <- mean(x)
        if (kind == "percentile") lower <- upper <- unname(quantile(x, spec$percentile / 100, type = 7))
        if (kind == "percentile_groups") {
          lower <- unname(quantile(x, spec$lowerPercent / 100, type = 7))
          upper <- unname(quantile(x, 1 - spec$upperPercent / 100, type = 7))
        }
        low <- x <= lower; high <- x > upper
      }
    }
    groups[[endpoint]] <- list(low = as.list(indices[low] - 1), high = as.list(indices[high] - 1))
    included <- low | high; eligible <- length(time)
    time <- time[included]; event <- event[included]; high <- high[included]; low <- !high
    df <- data.frame(time = time, event = event, high = as.integer(high))
    lr <- if (any(low) && any(high) && sum(event) > 0) tryCatch(
      # survdiff 3.8-13 leaks an explicit timefix argument into model.frame.
      # Integer ranks preserve every risk set and exact tie, while preventing
      # its default near-tie coalescing. KM/Cox still use the original times.
      survdiff(Surv(rank(time, ties.method = "min"), event) ~ high, data = df, rho = 0),
      error = function(e) NULL
    ) else NULL
    chi2 <- if (!is.null(lr) && is.finite(lr$chisq) && lr$var[1,1] > 0) lr$chisq else nan
    hr <- coxp <- nan
    warnings <- character()
    fit <- if (any(low) && any(high) && sum(event) > 0) tryCatch(withCallingHandlers(
      coxph(Surv(time, event) ~ high, data = df, ties = "breslow",
            control = coxph.control(eps = 1e-10, iter.max = 100, timefix = FALSE)),
      warning = function(w) { warnings <<- c(warnings, conditionMessage(w)); invokeRestart("muffleWarning") }
    ), error = function(e) NULL) else NULL
    if (!is.null(fit) && !length(warnings) && all(is.finite(coef(fit))) && fit$var[1,1] > 0) {
      hr <- exp(coef(fit)[1]); coxp <- 2 * pnorm(-abs(coef(fit)[1] / sqrt(fit$var[1,1])))
    }
    lc <- curve(time[low], event[low]); hc <- curve(time[high], event[high])
    endpoints[[endpoint]] <- list(
      n = length(time), nLow = sum(low), nHigh = sum(high), events = sum(event),
      eventsLow = sum(event[low]), eventsHigh = sum(event[high]),
      eligibleN = eligible, excludedMiddle = eligible - length(time),
      lowerThreshold = lower, upperThreshold = upper,
      logrankChi2 = chi2, logrankP = pchisq(chi2, 1, lower.tail = FALSE),
      coxHr = unname(hr), coxP = unname(coxp), low = list(timeline = lc$timeline),
      high = list(timeline = hc$timeline)
    )
    intervals[[endpoint]] <- list(low = lc$intervals, high = hc$intervals)
  }
  ps <- vapply(endpoints, function(x) x$logrankP, 0.0)
  qs <- rep(nan, 4); qs[is.finite(ps)] <- p.adjust(ps[is.finite(ps)], method = "BH")
  for (i in seq_along(endpoints)) endpoints[[i]]$logrankQ <- qs[i]
  list(id = item$id, endpoints = endpoints, groups = groups, intervals = intervals)
}

# Stream the reference report so whole-catalog validation has bounded output memory.
connection <- file(args[[2]], open = "w")
versions <- list(R = as.character(getRversion()), survival = as.character(packageVersion("survival")),
                 jsonlite = as.character(packageVersion("jsonlite")))
writeLines(paste0('{"versions":', toJSON(versions, auto_unbox = TRUE), ',"results":['), connection)
for (i in seq_along(cases)) {
  if (i > 1) writeLines(",", connection)
  writeLines(toJSON(analyze_case(cases[[i]]), auto_unbox = TRUE, na = "null", null = "null", digits = NA), connection)
  if (i %% 100 == 0) message("R reference: ", i, "/", length(cases), " comparisons")
}
writeLines("]}", connection)
close(connection)
