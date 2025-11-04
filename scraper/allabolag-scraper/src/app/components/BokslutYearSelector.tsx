'use client';

import React from 'react';

export interface BokslutFinancialPeriod {
  year: number;
  period: string;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string;
  accounts: Record<string, number>;
}

interface BokslutYearSelectorProps {
  financials: BokslutFinancialPeriod[];
  selectedYear: number;
  selectedPeriod: string;
  onSelectionChange: (year: number, period: string) => void;
}

const formatPeriodLabel = (period: string) => {
  const numeric = parseInt(period, 10);
  if (!Number.isNaN(numeric)) {
    return `${numeric} månader`;
  }
  return period;
};

const BokslutYearSelector: React.FC<BokslutYearSelectorProps> = ({
  financials,
  selectedYear,
  selectedPeriod,
  onSelectionChange,
}) => {
  const years = React.useMemo(() => {
    const uniqueYears = Array.from(new Set(financials.map((item) => item.year)));
    return uniqueYears.sort((a, b) => b - a);
  }, [financials]);

  const periodsForYear = React.useMemo(() => {
    return financials
      .filter((item) => item.year === selectedYear)
      .map((item) => item.period)
      .filter((period, index, array) => array.indexOf(period) === index)
      .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  }, [financials, selectedYear]);

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextYear = parseInt(event.target.value, 10);
    const periods = financials
      .filter((item) => item.year === nextYear)
      .map((item) => item.period);

    const uniquePeriods = Array.from(new Set(periods));
    const defaultPeriod = uniquePeriods.sort((a, b) => parseInt(b, 10) - parseInt(a, 10))[0] || '12';
    onSelectionChange(nextYear, defaultPeriod);
  };

  const handlePeriodChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onSelectionChange(selectedYear, event.target.value);
  };

  if (years.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-4">
      <div>
        <label htmlFor="year" className="block text-sm font-medium text-gray-700">
          Bokslutsår
        </label>
        <select
          id="year"
          value={selectedYear}
          onChange={handleYearChange}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {periodsForYear.length > 1 && (
        <div>
          <label htmlFor="period" className="block text-sm font-medium text-gray-700">
            Period
          </label>
          <select
            id="period"
            value={selectedPeriod}
            onChange={handlePeriodChange}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
          >
            {periodsForYear.map((period) => (
              <option key={period} value={period}>
                {formatPeriodLabel(period)}
              </option>
            ))}
          </select>
        </div>
      )}

      {periodsForYear.length === 1 && (
        <div className="text-sm text-gray-500">
          {formatPeriodLabel(periodsForYear[0])}
        </div>
      )}
    </div>
  );
};

export default BokslutYearSelector;
