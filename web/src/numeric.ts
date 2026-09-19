// Cephes erf/erfc coefficients (Stephen L. Moshier), SciPy bounded Brent,
// and NumPy pairwise summation. Adapted under the licenses in
// public/third-party-notices.txt. SciPy source: v1.15.3, special/xsf/cephes/ndtr.h
// and optimize/_optimize.py. NumPy: core/src/umath/loops_utils.h.src.

const P = [
  2.46196981473530512524e-10, 5.64189564831068821977e-1, 7.46321056442269912687,
  4.86371970985681366614e1, 1.96520832956077098242e2, 5.26445194995477358631e2,
  9.3452852717195760754e2, 1.02755188689515710272e3, 5.57535335369399327526e2,
];
const Q = [
  1, 1.32281951154744992508e1, 8.67072140885989742329e1,
  3.54937778887819891062e2, 9.75708501743205489753e2, 1.82390916687909736289e3,
  2.24633760818710981792e3, 1.65666309194161350182e3, 5.57535340817727675546e2,
];
const R = [
  5.64189583547755073984e-1, 1.27536670759978104416, 5.01905042251180477414,
  6.16021097993053585195, 7.4097426995044893916, 2.9788666537210024067,
];
const S = [
  1, 2.2605286322011727659, 9.39603524938001434673, 1.20489539808096656605e1,
  1.70814450747565897222e1, 9.60896809063285878198, 3.3690764510008151605,
];
const T = [
  9.60497373987051638749, 9.00260197203842689217e1, 2.23200534594684319226e3,
  7.00332514112805075473e3, 5.55923013010394962768e4,
];
const U = [
  1, 3.35617141647503099647e1, 5.21357949780152679795e2,
  4.59432382970980127987e3, 2.26290000613890934246e4, 4.92673942608635921086e4,
];

function polynomial(x: number, coefficients: number[]): number {
  let value = coefficients[0];
  for (let i = 1; i < coefficients.length; i++)
    value = value * x + coefficients[i];
  return value;
}

export function erfc(a: number): number {
  if (Number.isNaN(a)) return Number.NaN;
  const x = Math.abs(a);
  if (x < 1) return 1 - (a * polynomial(a * a, T)) / polynomial(a * a, U);
  const value =
    x > 27.3
      ? 0
      : (Math.exp(-a * a) * polynomial(x, x < 8 ? P : R)) /
        polynomial(x, x < 8 ? Q : S);
  return a < 0 ? 2 - value : value;
}

// Match the reduction used by numpy.sum for contiguous float64 arrays.
export function numpySum(
  values: number[],
  start = 0,
  count = values.length,
): number {
  if (count < 8) {
    let result = -0;
    for (let i = start; i < start + count; i++) result += values[i];
    return result;
  }
  if (count <= 128) {
    const r = values.slice(start, start + 8);
    let i = 8;
    for (; i < count - (count % 8); i += 8) {
      for (let j = 0; j < 8; j++) r[j] += values[start + i + j];
    }
    let result = r[0] + r[1] + (r[2] + r[3]) + (r[4] + r[5] + (r[6] + r[7]));
    for (; i < count; i++) result += values[start + i];
    return result;
  }
  let half = Math.floor(count / 2);
  half -= half % 8;
  return (
    numpySum(values, start, half) + numpySum(values, start + half, count - half)
  );
}

export function boundedMinimum(
  func: (x: number) => number,
  lower: number,
  upper: number,
): number {
  const sqrtEps = Math.sqrt(2.2e-16),
    goldenMean = 0.5 * (3 - Math.sqrt(5));
  let a = lower,
    b = upper;
  let fulc = a + goldenMean * (b - a),
    nfc = fulc,
    xf = fulc;
  let rat = 0,
    e = 0,
    fx = func(xf),
    ffulc = fx,
    fnfc = fx;
  let xm = 0.5 * (a + b),
    tol1 = sqrtEps * Math.abs(xf) + 1e-5 / 3,
    tol2 = 2 * tol1;
  let count = 1;
  while (Math.abs(xf - xm) > tol2 - 0.5 * (b - a)) {
    let golden = true;
    if (Math.abs(e) > tol1) {
      const r = (xf - nfc) * (fx - ffulc);
      let q = (xf - fulc) * (fx - fnfc);
      let p = (xf - fulc) * q - (xf - nfc) * r;
      q = 2 * (q - r);
      if (q > 0) p = -p;
      q = Math.abs(q);
      const oldE = e;
      e = rat;
      if (
        Math.abs(p) < Math.abs(0.5 * q * oldE) &&
        p > q * (a - xf) &&
        p < q * (b - xf)
      ) {
        golden = false;
        rat = (p + 0) / q;
        const x = xf + rat;
        if (x - a < tol2 || b - x < tol2)
          rat = tol1 * (Math.sign(xm - xf) || 1);
      }
    }
    if (golden) {
      e = xf >= xm ? a - xf : b - xf;
      rat = goldenMean * e;
    }
    const x = xf + (Math.sign(rat) || 1) * Math.max(Math.abs(rat), tol1);
    const fu = func(x);
    if (!Number.isFinite(fu) || ++count >= 500) return Number.NaN;
    if (fu <= fx) {
      if (x >= xf) a = xf;
      else b = xf;
      fulc = nfc;
      ffulc = fnfc;
      nfc = xf;
      fnfc = fx;
      xf = x;
      fx = fu;
    } else {
      if (x < xf) a = x;
      else b = x;
      if (fu <= fnfc || nfc === xf) {
        fulc = nfc;
        ffulc = fnfc;
        nfc = x;
        fnfc = fu;
      } else if (fu <= ffulc || fulc === xf || fulc === nfc) {
        fulc = x;
        ffulc = fu;
      }
    }
    xm = 0.5 * (a + b);
    tol1 = sqrtEps * Math.abs(xf) + 1e-5 / 3;
    tol2 = 2 * tol1;
  }
  return Number.isFinite(fx) ? xf : Number.NaN;
}
