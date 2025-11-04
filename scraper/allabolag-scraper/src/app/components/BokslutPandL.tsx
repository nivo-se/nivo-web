'use client';

import React from 'react';
import { BokslutFinancialPeriod } from './BokslutYearSelector';

interface BokslutPandLProps {
  financial: BokslutFinancialPeriod | null;
}

const formatCurrency = (value: number | undefined) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return <span className="text-gray-400">N/A</span>;
  }

  const formatter = new Intl.NumberFormat('sv-SE');
  return `${formatter.format(value)} kkr`;
};

const rows = [
  { code: 'SDI', label: 'Nettoomsättning' },
  { code: 'BE', label: 'Bruttoresultat' },
  { code: 'TR', label: 'Totala rörelsekostnader' },
  { code: 'RG', label: 'Rörelseresultat (EBIT)' },
  { code: 'FI', label: 'Finansiella intäkter' },
  { code: 'FK', label: 'Finansiella kostnader' },
  { code: 'RPE', label: 'Resultat efter finansiella poster' },
  { code: 'SKG', label: 'Skatt på årets resultat' },
  { code: 'DR', label: 'Årets resultat' },
];

const BokslutPandL: React.FC<BokslutPandLProps> = ({ financial }) => {
  if (!financial) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800">Resultaträkning</h2>
        <p className="mt-4 text-sm text-gray-500">Ingen finansiell data hittades för valt år.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Resultaträkning</h2>
          <p className="text-sm text-gray-500">
            År {financial.year} · {financial.period} månader · Valuta {financial.currency || 'SEK'}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-100">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Post</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Belopp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
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
  );
};

export default BokslutPandL;
