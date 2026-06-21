"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Dashboard = {
  checkedOut: number;
  spareHeld: number;
  submittedToday: number;
  totalRecords: number;
  staleCheckedOut: number;
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">ダッシュボード</h1>
      <p className="mt-1 text-sm text-slate-500">現況のサマリです。</p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="持ち出し中" value={data?.checkedOut} color="text-blue-600" />
        <Stat label="予備保持中" value={data?.spareHeld} color="text-amber-600" />
        <Stat
          label="本日の提出"
          value={data?.submittedToday}
          color="text-emerald-600"
        />
        <Stat label="累計記録数" value={data?.totalRecords} color="text-slate-700" />
      </div>

      {data && data.staleCheckedOut > 0 && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="font-semibold text-red-700">
            ⚠ 未提出のまま12時間以上経過しているカードが {data.staleCheckedOut} 件あります
          </div>
          <Link
            href="/admin/records?status=checked_out"
            className="mt-1 inline-block text-sm text-red-600 underline"
          >
            該当の記録を確認する →
          </Link>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/admin/records" className="tap-btn-primary px-6 py-3 text-base">
          利用記録を見る
        </Link>
        <Link href="/admin/masters" className="tap-btn px-6 py-3 text-base">
          マスタを管理する
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number | undefined;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${color}`}>
        {value ?? "—"}
      </div>
    </div>
  );
}
