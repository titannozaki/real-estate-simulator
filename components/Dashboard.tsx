"use client";

import {
  type SimulationResult,
  type YearlyProjection,
  type Rank,
  type SaleSummary,
} from "@/lib/finance";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

// ---------- ユーティリティ ----------

function toMan(n: number): string {
  return (n / 10_000).toLocaleString("ja-JP", { maximumFractionDigits: 0 });
}

function pct(n: number, digits = 2): string {
  return (n * 100).toFixed(digits) + "%";
}

// ---------- ランクスタイル ----------

const RANK_STYLES: Record<Rank, { text: string; bg: string; badge: string }> = {
  S: {
    text: "text-blue-700",
    bg: "border-blue-200 bg-blue-50",
    badge: "bg-blue-600 text-white",
  },
  A: {
    text: "text-blue-600",
    bg: "border-blue-100 bg-blue-50/50",
    badge: "bg-blue-500 text-white",
  },
  B: {
    text: "text-gray-700",
    bg: "border-gray-200 bg-white",
    badge: "bg-gray-400 text-white",
  },
  C: {
    text: "text-gray-500",
    bg: "border-gray-200 bg-gray-50",
    badge: "bg-gray-300 text-white",
  },
};

// ---------- 評価基準 ----------

interface CriteriaRow {
  metric: string;
  s: string;
  a: string;
  b: string;
  c: string;
}

const CRITERIA: CriteriaRow[] = [
  { metric: "IRR",    s: "15%以上", a: "10〜15%", b: "5〜10%",  c: "5%未満" },
  { metric: "CCR",    s: "15%以上", a: "10〜15%", b: "5〜10%",  c: "5%未満" },
  { metric: "返済比率", s: "40%以下", a: "40〜50%", b: "50〜60%", c: "60%超" },
  { metric: "CF利回り", s: "3%以上",  a: "2〜3%", b: "1〜2%", c: "1%未満" },
];

// ---------- Props ----------

interface Props {
  result: SimulationResult;
  projection: YearlyProjection[];
}

// ---------- メインコンポーネント ----------

export default function Dashboard({ result, projection }: Props) {
  const r = result.resolved;

  const chartData = projection.map((d) => ({
    year: `${d.year}年`,
    yearNum: d.year,
    キャッシュフロー: Math.round(d.cashFlow / 10_000),
    累積CF: Math.round(d.cumulativeCF / 10_000),
    ローン残債: Math.round(d.loanBalance / 10_000),
  }));

  return (
    <div className="space-y-5">
      {/* ===== スコアカード ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ScoreCard label={`IRR（${r.holdingYears}年）`} value={pct(result.irr.value)} rank={result.irr.rank} sub="内部収益率" />
        <ScoreCard label="CCR" value={pct(result.ccr.value)} rank={result.ccr.rank} sub="自己資金配当率" />
        <ScoreCard label="返済比率" value={pct(result.debtServiceRatio.value)} rank={result.debtServiceRatio.rank} sub="ローン/賃料" />
        <ScoreCard label="CF利回り" value={pct(result.cashFlowToPrice.value)} rank={result.cashFlowToPrice.rank} sub="CF/物件価格" />
      </div>

      {/* ===== 評価基準 ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          評価基準
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left font-medium pb-1.5 pr-3">指標</th>
                <th className="font-medium pb-1.5 px-2"><span className="inline-block rounded px-1.5 py-0.5 bg-blue-600 text-white text-[10px] font-bold">S</span></th>
                <th className="font-medium pb-1.5 px-2"><span className="inline-block rounded px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold">A</span></th>
                <th className="font-medium pb-1.5 px-2"><span className="inline-block rounded px-1.5 py-0.5 bg-gray-400 text-white text-[10px] font-bold">B</span></th>
                <th className="font-medium pb-1.5 px-2"><span className="inline-block rounded px-1.5 py-0.5 bg-gray-300 text-white text-[10px] font-bold">C</span></th>
              </tr>
            </thead>
            <tbody>
              {CRITERIA.map((row) => (
                <tr key={row.metric} className="border-t border-gray-50">
                  <td className="py-1.5 pr-3 text-gray-600 font-medium">{row.metric}</td>
                  <td className="py-1.5 px-2 text-center text-gray-500">{row.s}</td>
                  <td className="py-1.5 px-2 text-center text-gray-500">{row.a}</td>
                  <td className="py-1.5 px-2 text-center text-gray-500">{row.b}</td>
                  <td className="py-1.5 px-2 text-center text-gray-500">{row.c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== 収支内訳 ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          年間収支内訳（初年度）
        </h2>
        <div className="space-y-1.5 text-sm">
          <BreakdownRow label="実効賃料（空室考慮後）" value={`${toMan(result.effectiveRent)} 万円`} />
          <BreakdownRow label="運営費" value={`-${toMan(result.annualOpex)} 万円`} negative />
          <BreakdownRow label="ローン返済" value={`-${toMan(result.annualDebtService)} 万円`} negative />
          <div className="border-t border-gray-100 pt-1.5">
            <BreakdownRow
              label="手残りキャッシュフロー"
              value={`${toMan(result.annualCashFlow)} 万円`}
              bold
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] text-gray-400 sm:grid-cols-3">
          <span>ローン額: {toMan(r.loanAmount)}万</span>
          <span>金利: {pct(r.interestRate)}</span>
          <span>期間: {r.loanTermYears}年</span>
          <span>空室率: {pct(r.vacancyRate)}</span>
          <span>運営費率: {pct(r.opexRate)}</span>
          <span>家賃下落率: {pct(r.rentDeclineRate)}/年</span>
          <span>返済: {r.repaymentMethod === "equal_payment" ? "元利均等" : "元金均等"}</span>
          <span>売却: {r.holdingYears}年後 / {toMan(r.exitPrice)}万</span>
        </div>
      </div>

      {/* ===== 売却サマリー ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          売却サマリー（{r.holdingYears}年後）
        </h2>
        <div className="space-y-1.5 text-sm">
          <BreakdownRow label="売却額" value={`${toMan(result.saleSummary.exitPrice)} 万円`} />
          <BreakdownRow label="売却諸経費" value={`-${toMan(result.saleSummary.sellingCosts)} 万円`} negative />
          <BreakdownRow label="ローン残債一括返済" value={`-${toMan(result.saleSummary.remainingLoan)} 万円`} negative />
          <div className="border-t border-gray-100 pt-1.5">
            <BreakdownRow label="売却手取り" value={`${toMan(result.saleSummary.netSaleProceeds)} 万円`} bold />
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 p-4">
          <div className="space-y-1.5 text-sm">
            <BreakdownRow label="保有期間中の累積CF" value={`${toMan(result.saleSummary.cumulativeOperatingCF)} 万円`} />
            <BreakdownRow label="売却手取り" value={`${toMan(result.saleSummary.netSaleProceeds)} 万円`} />
            <BreakdownRow label="自己資金（投資額）" value={`-${toMan(r.equity)} 万円`} negative />
            <div className="border-t border-blue-200 pt-1.5">
              <div className="flex justify-between">
                <span className="font-bold text-gray-900">トータル利益</span>
                <span className={`font-bold text-lg ${result.saleSummary.totalProfit >= 0 ? "text-blue-600" : "text-red-500"}`}>
                  {result.saleSummary.totalProfit >= 0 ? "+" : ""}{toMan(result.saleSummary.totalProfit)} 万円
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== グラフ: CF推移 + ローン残債 ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {r.holdingYears}年キャッシュフロー推移 & ローン残債
        </h2>
        <div className="h-64 sm:h-72 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                interval="preserveStartEnd"
                tickFormatter={(v: string) => v.replace("年", "")}
                stroke="#D1D5DB"
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                tickFormatter={(v: number) => `${v}万`}
                width={60}
                stroke="#D1D5DB"
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                tickFormatter={(v: number) => `${v}万`}
                width={60}
                stroke="#D1D5DB"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #E5E7EB",
                  borderRadius: "0.375rem",
                  fontSize: "0.75rem",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                }}
                labelStyle={{ color: "#374151" }}
                formatter={(value: number, name: string) => [`${value.toLocaleString()} 万円`, name]}
              />
              <Legend wrapperStyle={{ fontSize: "0.7rem", color: "#6B7280" }} />
              <ReferenceLine yAxisId="left" y={0} stroke="#D1D5DB" strokeDasharray="2 2" />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="累積CF"
                fill="#3B82F6"
                fillOpacity={0.08}
                stroke="#3B82F6"
                strokeWidth={2}
                name="累積CF"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="ローン残債"
                stroke="#EF4444"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                name="ローン残債"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ===== グラフ: 年間CF ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          年間キャッシュフロー
        </h2>
        <div className="h-40 sm:h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData.slice(1)} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                interval="preserveStartEnd"
                tickFormatter={(v: string) => v.replace("年", "")}
                stroke="#D1D5DB"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                tickFormatter={(v: number) => `${v}万`}
                width={60}
                stroke="#D1D5DB"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #E5E7EB",
                  borderRadius: "0.375rem",
                  fontSize: "0.75rem",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                }}
                formatter={(value: number, name: string) => [`${value.toLocaleString()} 万円`, name]}
              />
              <Area
                type="stepAfter"
                dataKey="キャッシュフロー"
                fill="#3B82F6"
                fillOpacity={0.06}
                stroke="#3B82F6"
                strokeWidth={1.5}
                name="年間CF"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ---------- サブコンポーネント ----------

function ScoreCard({
  label,
  value,
  rank,
  sub,
}: {
  label: string;
  value: string;
  rank: Rank;
  sub: string;
}) {
  const style = RANK_STYLES[rank];
  return (
    <div className={`rounded-lg border p-4 ${style.bg}`}>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] text-gray-500 leading-tight">{label}</p>
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${style.badge}`}>
          {rank}
        </span>
      </div>
      <p className={`text-xl font-bold tracking-tight ${style.text}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-gray-400">{sub}</p>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  negative,
  bold,
}: {
  label: string;
  value: string;
  negative?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-semibold text-gray-900" : "text-gray-500"}>
        {label}
      </span>
      <span
        className={
          bold
            ? "font-semibold text-gray-900"
            : negative
              ? "text-red-500"
              : "text-gray-700"
        }
      >
        {value}
      </span>
    </div>
  );
}
