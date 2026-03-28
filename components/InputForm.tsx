"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  type PropertyInput,
  type RepaymentMethod,
  simulate,
  getDefaults,
  generateProjection,
  type SimulationResult,
  type YearlyProjection,
} from "@/lib/finance";

// ---------- 型 ----------

interface FieldState {
  raw: string;
  override?: number;
}

const EMPTY_FIELD: FieldState = { raw: "" };

interface FormState {
  price: string;
  annualRent: string;
  loanAmount: FieldState;
  closingCost: FieldState;
  equity: FieldState;
  interestRate: FieldState;
  loanTermYears: FieldState;
  vacancyRate: FieldState;
  opexRate: FieldState;
  exitPrice: FieldState;
  sellingCost: FieldState;
  rentDeclineRate: FieldState;
  majorRepairCost: FieldState;
  majorRepairYear: FieldState;
  holdingPeriod: FieldState;
  holdingPeriodUnit: "years" | "months";
  repaymentMethod: RepaymentMethod;
}

const INITIAL: FormState = {
  price: "",
  annualRent: "",
  loanAmount: EMPTY_FIELD,
  closingCost: EMPTY_FIELD,
  equity: EMPTY_FIELD,
  interestRate: EMPTY_FIELD,
  loanTermYears: EMPTY_FIELD,
  vacancyRate: EMPTY_FIELD,
  opexRate: EMPTY_FIELD,
  exitPrice: EMPTY_FIELD,
  sellingCost: EMPTY_FIELD,
  rentDeclineRate: EMPTY_FIELD,
  majorRepairCost: EMPTY_FIELD,
  majorRepairYear: EMPTY_FIELD,
  holdingPeriod: EMPTY_FIELD,
  holdingPeriodUnit: "years",
  repaymentMethod: "equal_payment",
};

export interface SimulationOutput {
  result: SimulationResult;
  projection: YearlyProjection[];
}

interface Props {
  onResult: (output: SimulationOutput | null) => void;
}

type OverrideKey = keyof Omit<FormState, "price" | "annualRent" | "repaymentMethod" | "holdingPeriodUnit">;

// ---------- カンマ付き数値ユーティリティ ----------

/** 全角数字・記号を半角に変換 */
function toHalfWidth(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/．/g, ".")
    .replace(/ー/g, "-")
    .replace(/、/g, ",");
}

/** カンマを除去して数値文字列に戻す */
function stripCommas(s: string): string {
  return s.replace(/,/g, "");
}

/** 数値文字列にカンマを付与（入力中の小数点も保持） */
function addCommas(s: string): string {
  const stripped = stripCommas(s);
  if (stripped === "" || stripped === "-") return stripped;
  // 小数点で分割
  const parts = stripped.split(".");
  const intPart = parts[0];
  // 整数部にカンマ付与（負号を保持）
  const sign = intPart.startsWith("-") ? "-" : "";
  const digits = intPart.replace("-", "");
  const withCommas = sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.length > 1 ? withCommas + "." + parts[1] : withCommas;
}

function toMan(n: number): string {
  return (n / 10_000).toLocaleString("ja-JP", { maximumFractionDigits: 0 });
}

function pct(n: number, digits = 2): string {
  return (n * 100).toFixed(digits) + "%";
}

// ---------- カンマ付き入力フィールド ----------

function CommaInput({
  value,
  onChange,
  placeholder,
  suffix,
  className,
}: {
  value: string;
  onChange: (numericStr: string) => void;
  placeholder: string;
  suffix: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorPosRef = useRef<number | null>(null);

  // React の再レンダリング後にカーソル位置を復元
  useEffect(() => {
    if (cursorPosRef.current !== null && inputRef.current) {
      const pos = cursorPosRef.current;
      inputRef.current.setSelectionRange(pos, pos);
      cursorPosRef.current = null;
    }
  });

  const displayValue = addCommas(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const rawCursor = el.selectionStart ?? 0;
    const raw = el.value;

    // カーソル位置より前の数字の個数（カンマを除く）
    const digitsBeforeCursor = raw.slice(0, rawCursor).replace(/,/g, "").length;

    // 全角→半角変換し、数字・小数点・マイナスのみ許可
    const halfWidth = toHalfWidth(raw);
    const cleaned = stripCommas(halfWidth).replace(/[^\d.\-]/g, "");

    // フォーマット後のカーソル位置を計算
    const formatted = addCommas(cleaned);
    let count = 0;
    let newPos = formatted.length;
    for (let i = 0; i < formatted.length; i++) {
      if (formatted[i] !== ",") count++;
      if (count === digitsBeforeCursor) {
        newPos = i + 1;
        break;
      }
    }
    cursorPosRef.current = newPos;

    onChange(cleaned);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        style={{ imeMode: "disabled" } as React.CSSProperties}
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        className={className}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
        {suffix}
      </span>
    </div>
  );
}

// ---------- OverrideField ----------

function OverrideField({
  label,
  rawValue,
  defaultValue,
  suffix,
  isPercent,
  isOverridden,
  onChange,
  onReset,
}: {
  label: string;
  rawValue: string;
  defaultValue: number | undefined;
  suffix: string;
  isPercent?: boolean;
  isOverridden: boolean;
  onChange: (raw: string) => void;
  onReset: () => void;
}) {
  const displayDefault =
    defaultValue !== undefined
      ? isPercent
        ? (defaultValue * 100).toFixed(2)
        : Math.round(defaultValue).toLocaleString("ja-JP")
      : "—";

  const useComma = !isPercent && (suffix === "円");

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-500">{label}</label>
        {isOverridden && (
          <button type="button" onClick={onReset} className="text-[10px] text-blue-500 hover:text-blue-700">
            リセット
          </button>
        )}
      </div>
      {useComma ? (
        <CommaInput
          value={rawValue}
          onChange={onChange}
          placeholder={displayDefault}
          suffix={suffix}
          className={`w-full rounded border bg-white px-3 py-1.5 pr-10 text-right text-sm
            placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500
            ${isOverridden ? "border-blue-400" : "border-gray-200"}`}
        />
      ) : (
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            style={{ imeMode: "disabled" } as React.CSSProperties}
            value={rawValue}
            onChange={(e) => {
              const half = toHalfWidth(e.target.value);
              const cleaned = half.replace(/[^\d.\-]/g, "");
              onChange(cleaned);
            }}
            placeholder={displayDefault}
            className={`w-full rounded border bg-white px-3 py-1.5 pr-10 text-right text-sm
              placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500
              ${isOverridden ? "border-blue-400" : "border-gray-200"}`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
            {suffix}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------- メインコンポーネント ----------

export default function InputForm({ onResult }: Props) {
  const [form, setForm] = useState<FormState>(INITIAL);

  const price = parseFloat(form.price) || 0;
  const annualRent = parseFloat(form.annualRent) || 0;

  const defaults = useMemo(
    () => (price > 0 && annualRent > 0 ? getDefaults(price, annualRent) : null),
    [price, annualRent],
  );

  const defaultLoanAmount = useMemo(() => {
    if (price <= 0) return undefined;
    const cc = form.closingCost.override ?? price * 0.07;
    const eq = form.equity.override ?? price * 0.10;
    return price + cc - eq;
  }, [price, form.closingCost.override, form.equity.override]);

  const defaultEquity = useMemo(() => {
    if (price <= 0) return undefined;
    const cc = form.closingCost.override ?? price * 0.07;
    if (form.loanAmount.override !== undefined) {
      return price + cc - form.loanAmount.override;
    }
    return price * 0.10;
  }, [price, form.closingCost.override, form.loanAmount.override]);

  // 保有期間を年数に変換
  const holdingYearsValue = useMemo(() => {
    if (form.holdingPeriod.override === undefined) return undefined;
    if (form.holdingPeriodUnit === "months") {
      return Math.round(form.holdingPeriod.override / 12);
    }
    return form.holdingPeriod.override;
  }, [form.holdingPeriod.override, form.holdingPeriodUnit]);

  const output: SimulationOutput | null = useMemo(() => {
    if (price <= 0 || annualRent <= 0) return null;
    const input: PropertyInput = {
      price,
      annualRent,
      loanAmount: form.loanAmount.override,
      closingCost: form.closingCost.override,
      equity: form.equity.override,
      interestRate: form.interestRate.override,
      loanTermYears: form.loanTermYears.override,
      vacancyRate: form.vacancyRate.override,
      opexRate: form.opexRate.override,
      exitPrice: form.exitPrice.override,
      sellingCost: form.sellingCost.override,
      rentDeclineRate: form.rentDeclineRate.override,
      majorRepairCost: form.majorRepairCost.override,
      majorRepairYear: form.majorRepairYear.override,
      repaymentMethod: form.repaymentMethod,
      holdingYears: holdingYearsValue,
    };
    return {
      result: simulate(input),
      projection: generateProjection(input),
    };
  }, [form, price, annualRent, holdingYearsValue]);

  useEffect(() => {
    onResult(output);
  }, [output, onResult]);

  // --- ハンドラー ---

  const handlePrimaryChange = useCallback(
    (field: "price" | "annualRent") => (numericStr: string) => {
      setForm((prev) => ({ ...prev, [field]: numericStr }));
    },
    [],
  );

  const handleOverrideChange = useCallback(
    (field: OverrideKey, isPercent?: boolean) => (raw: string) => {
      if (raw === "") {
        setForm((prev) => ({ ...prev, [field]: EMPTY_FIELD }));
        return;
      }
      const parsed = parseFloat(raw);
      setForm((prev) => ({
        ...prev,
        [field]: {
          raw,
          override: isNaN(parsed) ? undefined : isPercent ? parsed / 100 : parsed,
        },
      }));
    },
    [],
  );

  const handleReset = useCallback(
    (field: OverrideKey) => () => {
      setForm((prev) => ({ ...prev, [field]: EMPTY_FIELD }));
    },
    [],
  );

  // ---------- レンダリング ----------

  return (
    <div className="space-y-4">
      {/* 基本情報 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">基本情報</h2>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">物件価格</label>
          <CommaInput
            value={form.price}
            onChange={handlePrimaryChange("price")}
            placeholder="50,000,000"
            suffix="円"
            className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 pr-8 text-right text-sm placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {price > 0 && <p className="text-[10px] text-gray-400 text-right mt-0.5">{toMan(price)} 万円</p>}
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">想定年間賃料</label>
          <CommaInput
            value={form.annualRent}
            onChange={handlePrimaryChange("annualRent")}
            placeholder="4,200,000"
            suffix="円"
            className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 pr-8 text-right text-sm placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {annualRent > 0 && <p className="text-[10px] text-gray-400 text-right mt-0.5">月額 {toMan(annualRent / 12)} 万円</p>}
        </div>

        {price > 0 && (
          <OverrideField label="融資額" rawValue={form.loanAmount.raw} defaultValue={defaultLoanAmount} suffix="円"
            isOverridden={form.loanAmount.override !== undefined} onChange={handleOverrideChange("loanAmount")} onReset={handleReset("loanAmount")} />
        )}

        {price > 0 && annualRent > 0 && (
          <p className="text-[10px] text-gray-400 border-t border-gray-100 pt-2">
            表面利回り <span className="text-gray-700 font-medium">{pct(annualRent / price)}</span>
          </p>
        )}
      </div>

      {/* 詳細設定 */}
      {defaults && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">詳細設定</h2>

          <OverrideField label="諸経費" rawValue={form.closingCost.raw} defaultValue={defaults.closingCost} suffix="円"
            isOverridden={form.closingCost.override !== undefined} onChange={handleOverrideChange("closingCost")} onReset={handleReset("closingCost")} />
          <OverrideField label="自己資金" rawValue={form.equity.raw} defaultValue={defaultEquity} suffix="円"
            isOverridden={form.equity.override !== undefined} onChange={handleOverrideChange("equity")} onReset={handleReset("equity")} />

          <div className="grid grid-cols-2 gap-2">
            <OverrideField label="金利" rawValue={form.interestRate.raw} defaultValue={defaults.interestRate} suffix="%" isPercent
              isOverridden={form.interestRate.override !== undefined} onChange={handleOverrideChange("interestRate", true)} onReset={handleReset("interestRate")} />
            <OverrideField label="ローン期間" rawValue={form.loanTermYears.raw} defaultValue={defaults.loanTermYears} suffix="年"
              isOverridden={form.loanTermYears.override !== undefined} onChange={handleOverrideChange("loanTermYears")} onReset={handleReset("loanTermYears")} />
          </div>

          {/* 返済方法 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">返済方法</label>
            <div className="grid grid-cols-2 gap-1">
              {([["equal_payment", "元利均等"], ["equal_principal", "元金均等"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, repaymentMethod: val }))}
                  className={`rounded border py-1.5 text-xs transition-colors
                    ${form.repaymentMethod === val
                      ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <OverrideField label="空室率" rawValue={form.vacancyRate.raw} defaultValue={defaults.vacancyRate} suffix="%" isPercent
              isOverridden={form.vacancyRate.override !== undefined} onChange={handleOverrideChange("vacancyRate", true)} onReset={handleReset("vacancyRate")} />
            <OverrideField label="運営費率" rawValue={form.opexRate.raw} defaultValue={defaults.opexRate} suffix="%" isPercent
              isOverridden={form.opexRate.override !== undefined} onChange={handleOverrideChange("opexRate", true)} onReset={handleReset("opexRate")} />
          </div>

          <OverrideField label="家賃下落率（年率）" rawValue={form.rentDeclineRate.raw} defaultValue={defaults.rentDeclineRate} suffix="%" isPercent
            isOverridden={form.rentDeclineRate.override !== undefined} onChange={handleOverrideChange("rentDeclineRate", true)} onReset={handleReset("rentDeclineRate")} />

          <div className="grid grid-cols-2 gap-2">
            <OverrideField label="大規模修繕費" rawValue={form.majorRepairCost.raw} defaultValue={defaults.majorRepairCost} suffix="円"
              isOverridden={form.majorRepairCost.override !== undefined} onChange={handleOverrideChange("majorRepairCost")} onReset={handleReset("majorRepairCost")} />
            <OverrideField label="修繕タイミング" rawValue={form.majorRepairYear.raw} defaultValue={defaults.majorRepairYear} suffix="年目"
              isOverridden={form.majorRepairYear.override !== undefined} onChange={handleOverrideChange("majorRepairYear")} onReset={handleReset("majorRepairYear")} />
          </div>

          {/* 売却 */}
          <div className="border-t border-gray-100 pt-3 space-y-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">売却想定</p>

            {/* 売却時期: 年/月切替 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-500">売却時期</label>
                {form.holdingPeriod.override !== undefined && (
                  <button type="button" onClick={handleReset("holdingPeriod")} className="text-[10px] text-blue-500 hover:text-blue-700">
                    リセット
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  {form.holdingPeriodUnit === "years" ? (
                    <OverrideField label="" rawValue={form.holdingPeriod.raw}
                      defaultValue={defaults.holdingYears}
                      suffix={form.holdingPeriodUnit === "years" ? "年後" : "ヶ月後"}
                      isOverridden={form.holdingPeriod.override !== undefined}
                      onChange={handleOverrideChange("holdingPeriod")}
                      onReset={handleReset("holdingPeriod")} />
                  ) : (
                    <OverrideField label="" rawValue={form.holdingPeriod.raw}
                      defaultValue={defaults.holdingYears * 12}
                      suffix="ヶ月後"
                      isOverridden={form.holdingPeriod.override !== undefined}
                      onChange={handleOverrideChange("holdingPeriod")}
                      onReset={handleReset("holdingPeriod")} />
                  )}
                </div>
                <div className="flex gap-0.5 self-end">
                  {([["years", "年"], ["months", "月"]] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          holdingPeriodUnit: val,
                          holdingPeriod: EMPTY_FIELD,
                        }));
                      }}
                      className={`rounded border px-2 py-1.5 text-xs transition-colors
                        ${form.holdingPeriodUnit === val
                          ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {form.holdingPeriodUnit === "months" && form.holdingPeriod.override !== undefined && (
                <p className="text-[10px] text-gray-400 text-right mt-0.5">
                  ≒ {Math.round(form.holdingPeriod.override / 12)} 年
                </p>
              )}
            </div>

            <OverrideField label="売却額" rawValue={form.exitPrice.raw} defaultValue={defaults.exitPrice} suffix="円"
              isOverridden={form.exitPrice.override !== undefined} onChange={handleOverrideChange("exitPrice")} onReset={handleReset("exitPrice")} />
            <OverrideField label="売却諸経費" rawValue={form.sellingCost.raw} defaultValue={defaults.sellingCost} suffix="円"
              isOverridden={form.sellingCost.override !== undefined} onChange={handleOverrideChange("sellingCost")} onReset={handleReset("sellingCost")} />
          </div>
        </div>
      )}
    </div>
  );
}
