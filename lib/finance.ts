// ============================================================
// 不動産投資シミュレーター — 計算ロジック
// ============================================================

// ---------- 型定義 ----------

export type RepaymentMethod = "equal_payment" | "equal_principal";

export interface PropertyInput {
  price: number;
  annualRent: number;
  closingCost?: number;
  equity?: number;
  loanAmount?: number;
  interestRate?: number;
  loanTermYears?: number;
  vacancyRate?: number;
  opexRate?: number;
  /** 売却額（円） — デフォルト: price と同額 */
  exitPrice?: number;
  /** 売却諸経費（円） — デフォルト: exitPrice * 0.05 */
  sellingCost?: number;
  /** 家賃下落率（年率, 小数） — デフォルト: 0.01 */
  rentDeclineRate?: number;
  /** 大規模修繕費（円） — デフォルト: 0 */
  majorRepairCost?: number;
  /** 大規模修繕の実施時期（年目） — デフォルト: 10 */
  majorRepairYear?: number;
  /** 返済方法 — デフォルト: equal_payment（元利均等） */
  repaymentMethod?: RepaymentMethod;
  /** 売却時期（年） — デフォルト: 30 */
  holdingYears?: number;
  /** 売却時期（月） — holdingYears より優先 */
  holdingMonths?: number;
}

export interface ResolvedInput {
  price: number;
  annualRent: number;
  closingCost: number;
  equity: number;
  loanAmount: number;
  interestRate: number;
  loanTermYears: number;
  vacancyRate: number;
  opexRate: number;
  exitPrice: number;
  sellingCost: number;
  rentDeclineRate: number;
  majorRepairCost: number;
  majorRepairYear: number;
  repaymentMethod: RepaymentMethod;
  holdingYears: number;
  /** 保有月数（常に解決済み） */
  holdingMonths: number;
  /** 月単位で指定されたか */
  isMonthly: boolean;
}

export type Rank = "S" | "A" | "B" | "C";

export interface RankedMetric<T = number> {
  value: T;
  rank: Rank;
}

export interface SaleSummary {
  /** 売却額 */
  exitPrice: number;
  /** 売却諸経費 */
  sellingCosts: number;
  /** 売却時ローン残債 */
  remainingLoan: number;
  /** 売却手取り（売却額 − 諸経費 − 残債） */
  netSaleProceeds: number;
  /** 保有期間中の累積CF（売却益除く） */
  cumulativeOperatingCF: number;
  /** トータル利益（累積CF + 売却手取り − 自己資金） */
  totalProfit: number;
}

export interface SimulationResult {
  resolved: ResolvedInput;
  irr: RankedMetric;
  ccr: RankedMetric;
  debtServiceRatio: RankedMetric;
  annualCashFlow: number;
  cashFlowToPrice: RankedMetric;
  /** 初年度の年間ローン返済額（円） */
  annualDebtService: number;
  /** 初年度の実効賃料（円） */
  effectiveRent: number;
  /** 初年度の年間運営費（円） */
  annualOpex: number;
  /** 売却サマリー */
  saleSummary: SaleSummary;
}

// ---------- スマートデフォルト ----------

const DEFAULTS = {
  closingCostRate: 0.07,
  equityRate: 0.10,
  interestRate: 0.02,
  loanTermYears: 30,
  vacancyRate: 0.05,
  opexRate: 0.20,
  sellingCostRate: 0.05, // used as default multiplier
  rentDeclineRate: 0.01,
  majorRepairCost: 0,
  majorRepairYear: 10,
  repaymentMethod: "equal_payment" as RepaymentMethod,
  holdingYears: 30,
} as const;

export function resolveInput(input: PropertyInput): ResolvedInput {
  const { price, annualRent } = input;

  const closingCost = input.closingCost ?? price * DEFAULTS.closingCostRate;
  const totalCost = price + closingCost;

  // 融資額と自己資金の相互依存を解決
  // 優先順位: 両方指定 → そのまま使用、片方指定 → 他方を逆算、両方未指定 → デフォルト
  let equity: number;
  let loanAmount: number;
  if (input.loanAmount !== undefined && input.equity !== undefined) {
    // 両方指定: そのまま使用
    loanAmount = input.loanAmount;
    equity = input.equity;
  } else if (input.loanAmount !== undefined) {
    // 融資額指定 → 自己資金を逆算
    loanAmount = input.loanAmount;
    equity = totalCost - loanAmount;
  } else if (input.equity !== undefined) {
    // 自己資金指定 → 融資額を逆算
    equity = input.equity;
    loanAmount = totalCost - equity;
  } else {
    // 両方未指定 → デフォルト
    equity = price * DEFAULTS.equityRate;
    loanAmount = totalCost - equity;
  }
  const interestRate = input.interestRate ?? DEFAULTS.interestRate;
  const loanTermYears = input.loanTermYears ?? DEFAULTS.loanTermYears;
  const vacancyRate = input.vacancyRate ?? DEFAULTS.vacancyRate;
  const opexRate = input.opexRate ?? DEFAULTS.opexRate;
  const exitPrice = input.exitPrice ?? price;
  const sellingCost = input.sellingCost ?? (exitPrice * DEFAULTS.sellingCostRate);
  const rentDeclineRate = input.rentDeclineRate ?? DEFAULTS.rentDeclineRate;
  const majorRepairCost = input.majorRepairCost ?? DEFAULTS.majorRepairCost;
  const majorRepairYear = input.majorRepairYear ?? DEFAULTS.majorRepairYear;
  const repaymentMethod = input.repaymentMethod ?? DEFAULTS.repaymentMethod;
  const isMonthly = input.holdingMonths !== undefined;
  const holdingMonths = input.holdingMonths ?? (input.holdingYears ?? DEFAULTS.holdingYears) * 12;
  const holdingYears = isMonthly ? holdingMonths / 12 : (input.holdingYears ?? DEFAULTS.holdingYears);

  return {
    price, annualRent, closingCost, equity, loanAmount,
    interestRate, loanTermYears, vacancyRate, opexRate,
    exitPrice, sellingCost, rentDeclineRate, majorRepairCost, majorRepairYear,
    repaymentMethod, holdingYears, holdingMonths, isMonthly,
  };
}

export function getDefaults(price: number, annualRent: number) {
  return {
    closingCost: price * DEFAULTS.closingCostRate,
    equity: price * DEFAULTS.equityRate,
    interestRate: DEFAULTS.interestRate,
    loanTermYears: DEFAULTS.loanTermYears,
    vacancyRate: DEFAULTS.vacancyRate,
    opexRate: DEFAULTS.opexRate,
    exitPrice: price,
    sellingCost: price * DEFAULTS.sellingCostRate,
    rentDeclineRate: DEFAULTS.rentDeclineRate,
    majorRepairCost: DEFAULTS.majorRepairCost,
    majorRepairYear: DEFAULTS.majorRepairYear,
    holdingYears: DEFAULTS.holdingYears,
  };
}

// ---------- ローン計算 ----------

/**
 * 元利均等返済: y 年目の年間返済額（一定）
 */
function equalPaymentAnnualDS(loan: number, rate: number, termYears: number): number {
  if (loan <= 0) return 0;
  if (rate === 0) return loan / termYears;
  const mr = rate / 12;
  const n = termYears * 12;
  const mp = loan * (mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1);
  return mp * 12;
}

/**
 * 元金均等返済: y 年目（1-indexed）の年間返済額
 */
function equalPrincipalAnnualDS(
  loan: number, rate: number, termYears: number, year: number,
): number {
  if (loan <= 0) return 0;
  const monthlyPrincipal = loan / (termYears * 12);
  const mr = rate / 12;
  let total = 0;
  for (let m = 0; m < 12; m++) {
    const monthIndex = (year - 1) * 12 + m; // 0-indexed month
    const remainingPrincipal = Math.max(0, loan - monthlyPrincipal * monthIndex);
    const interest = remainingPrincipal * mr;
    total += monthlyPrincipal + interest;
  }
  return total;
}

/** y 年目の年間返済額を返す（方式に応じて分岐） */
function annualDebtServiceForYear(
  loan: number, rate: number, termYears: number,
  method: RepaymentMethod, year: number,
): number {
  if (year > termYears) return 0;
  if (method === "equal_principal") {
    return equalPrincipalAnnualDS(loan, rate, termYears, year);
  }
  return equalPaymentAnnualDS(loan, rate, termYears);
}

/** n 年後のローン残高（元利均等） */
function loanBalanceEqualPayment(
  loan: number, rate: number, termYears: number, yearsElapsed: number,
): number {
  if (loan <= 0 || yearsElapsed >= termYears) return 0;
  if (rate === 0) return Math.max(0, loan - (loan / termYears) * yearsElapsed);
  const mr = rate / 12;
  const n = termYears * 12;
  const m = yearsElapsed * 12;
  const mp = loan * (mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1);
  const balance = loan * Math.pow(1 + mr, m) - mp * ((Math.pow(1 + mr, m) - 1) / mr);
  return Math.max(0, balance);
}

/** n 年後のローン残高（元金均等） */
function loanBalanceEqualPrincipal(
  loan: number, termYears: number, yearsElapsed: number,
): number {
  if (loan <= 0) return 0;
  const paid = (loan / termYears) * yearsElapsed;
  return Math.max(0, loan - paid);
}

function loanBalanceAfter(
  loan: number, rate: number, termYears: number,
  method: RepaymentMethod, yearsElapsed: number,
): number {
  if (method === "equal_principal") {
    return loanBalanceEqualPrincipal(loan, termYears, yearsElapsed);
  }
  return loanBalanceEqualPayment(loan, rate, termYears, yearsElapsed);
}

// ---------- 月次ヘルパー ----------

/** 特定の月（1-indexed）の月次ローン返済額 */
function monthlyDS(
  loan: number, rate: number, termYears: number, method: RepaymentMethod, month: number,
): number {
  if (loan <= 0) return 0;
  const totalMonths = termYears * 12;
  if (month > totalMonths) return 0;
  const mr = rate / 12;

  if (method === "equal_payment") {
    if (rate === 0) return loan / totalMonths;
    return loan * (mr * Math.pow(1 + mr, totalMonths)) / (Math.pow(1 + mr, totalMonths) - 1);
  } else {
    const monthlyPrincipal = loan / totalMonths;
    const remaining = Math.max(0, loan - monthlyPrincipal * (month - 1));
    return monthlyPrincipal + remaining * mr;
  }
}

/** N ヶ月後のローン残高 */
function loanBalanceAfterMonths(
  loan: number, rate: number, termYears: number, method: RepaymentMethod, monthsElapsed: number,
): number {
  if (loan <= 0) return 0;
  const n = termYears * 12;
  if (monthsElapsed >= n) return 0;
  const mr = rate / 12;

  if (method === "equal_principal") {
    return Math.max(0, loan - (loan / n) * monthsElapsed);
  }
  if (rate === 0) return Math.max(0, loan - (loan / n) * monthsElapsed);
  const mp = loan * (mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1);
  const balance = loan * Math.pow(1 + mr, monthsElapsed) - mp * ((Math.pow(1 + mr, monthsElapsed) - 1) / mr);
  return Math.max(0, balance);
}

/** 特定の月（1-indexed）の月次キャッシュフロー */
function monthlyCFForMonth(r: ResolvedInput, month: number): number {
  const year = Math.ceil(month / 12);
  const monthlyRent = effectiveRentForYear(r.annualRent, r.vacancyRate, r.rentDeclineRate, year) / 12;
  const monthlyOpex = monthlyRent * r.opexRate;
  const ds = monthlyDS(r.loanAmount, r.interestRate, r.loanTermYears, r.repaymentMethod, month);
  // 大規模修繕: majorRepairYear年目の最初の月に発生
  const repairMonth = (r.majorRepairYear - 1) * 12 + 1;
  const repair = (month === repairMonth) ? r.majorRepairCost : 0;
  return monthlyRent - monthlyOpex - ds - repair;
}

// ---------- 年次キャッシュフロー計算 ----------

/** y 年目（1-indexed）の実効賃料（家賃下落考慮） */
function effectiveRentForYear(
  annualRent: number, vacancyRate: number, rentDeclineRate: number, year: number,
): number {
  return annualRent * Math.pow(1 - rentDeclineRate, year - 1) * (1 - vacancyRate);
}

/** y 年目の年間キャッシュフロー（大規模修繕は majorRepairYear 年目に発生） */
function annualCFForYear(r: ResolvedInput, year: number): number {
  const rent = effectiveRentForYear(r.annualRent, r.vacancyRate, r.rentDeclineRate, year);
  const opex = rent * r.opexRate;
  const ds = annualDebtServiceForYear(r.loanAmount, r.interestRate, r.loanTermYears, r.repaymentMethod, year);
  const repair = (year === r.majorRepairYear) ? r.majorRepairCost : 0;
  return rent - opex - ds - repair;
}

// ---------- IRR（ニュートン法） ----------

function npv(rate: number, cashFlows: number[]): number {
  return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

function npvDerivative(rate: number, cashFlows: number[]): number {
  return cashFlows.reduce(
    (sum, cf, t) => (t === 0 ? sum : sum - (t * cf) / Math.pow(1 + rate, t + 1)), 0,
  );
}

function calcIRR(cashFlows: number[], guess = 0.1, maxIter = 200, tol = 1e-8): number {
  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    const f = npv(rate, cashFlows);
    const fPrime = npvDerivative(rate, cashFlows);
    if (Math.abs(fPrime) < 1e-14) break;
    const next = rate - f / fPrime;
    if (Math.abs(next - rate) < tol) return next;
    rate = next;
  }
  return NaN;
}

// ---------- ランク判定 ----------

interface RankThresholds { s: number; a: number; b: number; }

function rankByThresholds(value: number, t: RankThresholds, higherIsBetter: boolean): Rank {
  if (higherIsBetter) {
    if (value >= t.s) return "S";
    if (value >= t.a) return "A";
    if (value >= t.b) return "B";
    return "C";
  }
  if (value <= t.s) return "S";
  if (value <= t.a) return "A";
  if (value <= t.b) return "B";
  return "C";
}

const RANK_THRESHOLDS = {
  irr: { s: 0.15, a: 0.10, b: 0.05 },
  ccr: { s: 0.15, a: 0.10, b: 0.05 },
  debtServiceRatio: { s: 0.40, a: 0.50, b: 0.60 },
  cashFlowToPrice: { s: 0.03, a: 0.02, b: 0.01 },
} as const;

function ranked(value: number, key: keyof typeof RANK_THRESHOLDS): RankedMetric {
  const higherIsBetter = key !== "debtServiceRatio";
  return { value, rank: rankByThresholds(value, RANK_THRESHOLDS[key], higherIsBetter) };
}

// ---------- 30 年プロジェクション（グラフ用） ----------

export interface YearlyProjection {
  year: number;
  cashFlow: number;
  cumulativeCF: number;
  loanBalance: number;
}

// ---------- 月次プロジェクション（グラフ用） ----------

export interface MonthlyProjection {
  month: number;
  cashFlow: number;
  cumulativeCF: number;
  loanBalance: number;
}

export function generateMonthlyProjection(input: PropertyInput): MonthlyProjection[] {
  const r = resolveInput(input);
  const totalMonths = r.holdingMonths;
  const data: MonthlyProjection[] = [];
  let cumCF = 0;

  for (let m = 0; m <= totalMonths; m++) {
    let balance = loanBalanceAfterMonths(r.loanAmount, r.interestRate, r.loanTermYears, r.repaymentMethod, m);
    // 月0: 初期投資（自己資金 = 物件価格 + 諸経費 − 融資額）の支出
    let cf = m === 0 ? -r.equity : monthlyCFForMonth(r, m);

    // 売却月: 売却手取りを加算し、ローンを一括返済
    if (m === totalMonths && m > 0) {
      const remainingLoan = balance;
      const netSaleProceeds = r.exitPrice - r.sellingCost - remainingLoan;
      cf += netSaleProceeds;
      balance = 0;
    }

    cumCF += cf;
    data.push({
      month: m,
      cashFlow: Math.round(cf),
      cumulativeCF: Math.round(cumCF),
      loanBalance: Math.round(balance),
    });
  }
  return data;
}

export function generateProjection(input: PropertyInput): YearlyProjection[] {
  const r = resolveInput(input);
  const years = r.holdingYears;

  const data: YearlyProjection[] = [];
  let cumCF = 0;

  for (let y = 0; y <= years; y++) {
    let balance = loanBalanceAfter(r.loanAmount, r.interestRate, r.loanTermYears, r.repaymentMethod, y);
    // 年0: 初期投資（自己資金 = 物件価格 + 諸経費 − 融資額）の支出
    let cf = y === 0 ? -r.equity : annualCFForYear(r, y);

    // 売却年: 売却手取りを加算し、ローンを一括返済（残債0）
    if (y === years && y > 0) {
      const remainingLoan = balance;
      const netSaleProceeds = r.exitPrice - r.sellingCost - remainingLoan;
      cf += netSaleProceeds;
      balance = 0; // 売却時に一括返済
    }

    cumCF += cf;
    data.push({
      year: y,
      cashFlow: Math.round(cf),
      cumulativeCF: Math.round(cumCF),
      loanBalance: Math.round(balance),
    });
  }
  return data;
}

// ---------- メインシミュレーション ----------

export function simulate(input: PropertyInput): SimulationResult {
  const r = resolveInput(input);

  // 初年度の数値（表示用）
  const effectiveRent = effectiveRentForYear(r.annualRent, r.vacancyRate, r.rentDeclineRate, 1);
  const annualOpex = effectiveRent * r.opexRate;
  const annualDebtService = annualDebtServiceForYear(
    r.loanAmount, r.interestRate, r.loanTermYears, r.repaymentMethod, 1,
  );
  const annualCF = effectiveRent - annualOpex - annualDebtService;

  // --- IRR（保有期間想定） ---
  const initialInvestment = r.equity;
  let irr: number;
  let cumulativeOperatingCF = 0;
  let netSaleProceeds: number;
  let remainingLoan: number;

  if (r.isMonthly) {
    // 月次キャッシュフローでIRR計算
    const totalMonths = r.holdingMonths;
    const monthlyCFs = [-initialInvestment];
    for (let m = 1; m < totalMonths; m++) {
      const mcf = monthlyCFForMonth(r, m);
      monthlyCFs.push(mcf);
      cumulativeOperatingCF += mcf;
    }
    // 最終月: CF + 売却手取り
    remainingLoan = loanBalanceAfterMonths(
      r.loanAmount, r.interestRate, r.loanTermYears, r.repaymentMethod, totalMonths,
    );
    netSaleProceeds = r.exitPrice - r.sellingCost - remainingLoan;
    const lastMonthCF = monthlyCFForMonth(r, totalMonths);
    cumulativeOperatingCF += lastMonthCF;
    monthlyCFs.push(lastMonthCF + netSaleProceeds);

    const monthlyIRR = calcIRR(monthlyCFs, 0.01);
    // 月次IRR → 年次IRRに変換
    irr = isNaN(monthlyIRR) ? NaN : Math.pow(1 + monthlyIRR, 12) - 1;
  } else {
    // 年次キャッシュフローでIRR計算
    const cashFlows = [-initialInvestment];
    for (let y = 1; y < r.holdingYears; y++) {
      const ycf = annualCFForYear(r, y);
      cashFlows.push(ycf);
      cumulativeOperatingCF += ycf;
    }
    remainingLoan = loanBalanceAfter(
      r.loanAmount, r.interestRate, r.loanTermYears, r.repaymentMethod, r.holdingYears,
    );
    netSaleProceeds = r.exitPrice - r.sellingCost - remainingLoan;
    const lastYearCF = annualCFForYear(r, r.holdingYears);
    cumulativeOperatingCF += lastYearCF;
    cashFlows.push(lastYearCF + netSaleProceeds);

    irr = calcIRR(cashFlows);
  }

  // --- 売却サマリー ---
  const saleSummary: SaleSummary = {
    exitPrice: r.exitPrice,
    sellingCosts: r.sellingCost,
    remainingLoan,
    netSaleProceeds,
    cumulativeOperatingCF,
    totalProfit: cumulativeOperatingCF + netSaleProceeds - initialInvestment,
  };

  // --- CCR（初年度ベース） ---
  const ccr = initialInvestment > 0 ? annualCF / initialInvestment : 0;

  // --- 返済比率（初年度） ---
  const debtServiceRatio = r.annualRent > 0 ? annualDebtService / r.annualRent : 0;

  // --- CF 対価格率（初年度） ---
  const cashFlowToPrice = r.price > 0 ? annualCF / r.price : 0;

  return {
    resolved: r,
    irr: ranked(isNaN(irr) ? 0 : irr, "irr"),
    ccr: ranked(ccr, "ccr"),
    debtServiceRatio: ranked(debtServiceRatio, "debtServiceRatio"),
    annualCashFlow: annualCF,
    cashFlowToPrice: ranked(cashFlowToPrice, "cashFlowToPrice"),
    annualDebtService,
    effectiveRent,
    annualOpex,
    saleSummary,
  };
}
