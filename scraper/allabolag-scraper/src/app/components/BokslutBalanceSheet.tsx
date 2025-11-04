'use client';

import React from 'react';
import { BokslutFinancialPeriod } from './BokslutYearSelector';

interface BokslutBalanceSheetProps {
  financial: BokslutFinancialPeriod | null;
}

const formatCurrency = (value: number | undefined) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return <span className="text-gray-400">N/A</span>;
  }

  const formatter = new Intl.NumberFormat('sv-SE');
  return `${formatter.format(value)} kkr`;
};

const assetsRows = [
  { code: 'SOM', label: 'Summa omsättningstillgångar' },
  { code: 'SFA', label: 'Summa finansiella anläggningstillgångar' },
  { code: 'SEK', label: 'Likvida medel' },
  { code: 'SV', label: 'Summa tillgångar' },
];

const liabilitiesRows = [
  { code: 'EK', label: 'Eget kapital' },
  { code: 'KB', label: 'Kortfristiga skulder' },
  { code: 'LG', label: 'Långfristiga skulder' },
  { code: 'SED', label: 'Summa eget kapital och skulder' },
];

const BokslutBalanceSheet: React.FC<BokslutBalanceSheetProps> = ({ financial }) => {
  if (!financial) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800">Balansräkning</h2>
        <p className="mt-4 text-sm text-gray-500">Ingen balansräkning hittades för valt år.</p>
      </div>
    );
  }

  const totalAssets = financial.accounts['SV'];
  const totalEquityLiabilities = financial.accounts['SED'];
  const totalsMatch =
    totalAssets !== undefined &&
    totalEquityLiabilities !== undefined &&
    totalAssets !== null &&
    totalEquityLiabilities !== null &&
    Math.abs(totalAssets - totalEquityLiabilities) < 1e-3;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Balansräkning</h2>
          <p className="text-sm text-gray-500">
            År {financial.year} · {financial.period} månader · Valuta {financial.currency || 'SEK'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-gray-100 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Tillgångar
          </div>
          <table className="min-w-full divide-y divide-gray-100">
            <tbody className="divide-y divide-gray-100">
              {assetsRows.map((row) => (
                <tr key={row.code}>
                  <td className="px-4 py-3 text-sm text-gray-700 font-medium">
                    <div>{row.label}</div>
                    <div className="text-xs text-gray-400">{row.code}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 font-medium">
                    {formatCurrency(financial.accounts[row.code])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border border-gray-100 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Eget kapital och skulder
          </div>
          <table className="min-w-full divide-y divide-gray-100">
            <tbody className="divide-y divide-gray-100">
              {liabilitiesRows.map((row) => (
                <tr key={row.code}>
                  <td className="px-4 py-3 text-sm text-gray-700 font-medium">
                    <div>{row.label}</div>
                    <div className="text-xs text-gray-400">{row.code}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 font-medium">
                    {formatCurrency(financial.accounts[row.code])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalAssets !== undefined && totalEquityLiabilities !== undefined && (
        <div className={`mt-4 text-sm font-medium ${totalsMatch ? 'text-green-600' : 'text-red-600'}`}>
          {totalsMatch
            ? 'Tillgångar matchar eget kapital och skulder.'
            : 'Tillgångar matchar inte eget kapital och skulder.'}
        </div>
      )}
    </div>
  );
};

export default BokslutBalanceSheet;
