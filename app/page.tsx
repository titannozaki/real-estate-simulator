"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import InputForm, { type SimulationOutput } from "@/components/InputForm";

const Dashboard = dynamic(() => import("@/components/Dashboard"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center">
      <p className="text-gray-400 text-sm">読み込み中...</p>
    </div>
  ),
});

export default function Page() {
  const [output, setOutput] = useState<SimulationOutput | null>(null);

  const handleResult = useCallback((o: SimulationOutput | null) => {
    setOutput(o);
  }, []);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
            不動産投資シミュレーター
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            物件情報を入力すると即座に投資指標を算出します
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-12">
          <aside className="lg:col-span-4 xl:col-span-3">
            <div className="lg:sticky lg:top-8">
              <InputForm onResult={handleResult} />
            </div>
          </aside>

          <main className="lg:col-span-8 xl:col-span-9">
            {output ? (
              <Dashboard
                result={output.result}
                projection={output.projection}
              />
            ) : (
              <div className="flex h-full min-h-[400px] items-center justify-center rounded-lg border border-dashed border-gray-200">
                <p className="text-sm text-gray-400">
                  左のフォームに入力すると結果が表示されます
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
