'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import BokslutYearSelector, { BokslutFinancialPeriod } from '@/app/components/BokslutYearSelector';
import BokslutPandL from '@/app/components/BokslutPandL';
import BokslutBalanceSheet from '@/app/components/BokslutBalanceSheet';
import BokslutCompanyInfo from '@/app/components/BokslutCompanyInfo';

interface BokslutCompany {
  orgnr: string;
  companyName: string;
  companyId: string | null;
  homepage: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  employees: number | null;
  foundationYear: number | null;
}

interface BokslutResponse {
  company: BokslutCompany;
  financials: BokslutFinancialPeriod[];
  error?: string;
}

interface BokslutPageProps {
  params: {
    orgnr: string;
  };
}

const BokslutPage: React.FC<BokslutPageProps> = ({ params }) => {
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId');
  const [data, setData] = useState<BokslutResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('12');

  useEffect(() => {
    if (!jobId) {
      setError('jobId parameter saknas.');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/bokslut/${params.orgnr}?jobId=${jobId}`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || 'Kunde inte hämta bokslut.');
        }

        const sortedFinancials = (payload.financials || []).sort((a: BokslutFinancialPeriod, b: BokslutFinancialPeriod) => {
          if (a.year === b.year) {
            return parseInt(b.period, 10) - parseInt(a.period, 10);
          }
          return b.year - a.year;
        });

        const nextData: BokslutResponse = {
          ...payload,
          financials: sortedFinancials,
        };

        setData(nextData);

        if (sortedFinancials.length > 0) {
          setSelectedYear(sortedFinancials[0].year);
          setSelectedPeriod(sortedFinancials[0].period);
        } else {
          setSelectedYear(null);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Okänt fel vid hämtning av bokslut.';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [jobId, params.orgnr]);

  const handleSelectionChange = (year: number, period: string) => {
    setSelectedYear(year);
    setSelectedPeriod(period);
  };

  const selectedFinancial = useMemo(() => {
    if (!data || selectedYear === null) {
      return null;
    }

    return (
      data.financials.find((item) => item.year === selectedYear && item.period === selectedPeriod) ||
      data.financials.find((item) => item.year === selectedYear) ||
      null
    );
  }, [data, selectedYear, selectedPeriod]);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href={jobId ? `/?jobId=${jobId}#validation` : '/'}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← Tillbaka till validering
          </Link>
        </div>

        {loading && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-500">Laddar bokslut…</div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-lg border border-red-200 p-6 text-sm text-red-600">{error}</div>
        )}

        {!loading && !error && data && (
          <>
            <BokslutCompanyInfo company={data.company} />

            {selectedYear !== null && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">Finansiella perioder</h2>
                    <p className="text-sm text-gray-500">
                      Visa detaljer från bokslut hämtade via Allabolag.se
                    </p>
                  </div>
                  <BokslutYearSelector
                    financials={data.financials}
                    selectedYear={selectedYear}
                    selectedPeriod={selectedPeriod}
                    onSelectionChange={handleSelectionChange}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BokslutPandL financial={selectedFinancial} />
              <BokslutBalanceSheet financial={selectedFinancial} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BokslutPage;
