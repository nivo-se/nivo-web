'use client';

import React from 'react';

interface BokslutCompanyInfoProps {
  company: {
    companyName: string;
    orgnr: string;
    companyId: string | null;
    homepage: string | null;
    phone: string | null;
    email: string | null;
    location: string | null;
    employees: number | null;
    foundationYear: number | null;
  } | null;
}

const BokslutCompanyInfo: React.FC<BokslutCompanyInfoProps> = ({ company }) => {
  if (!company) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{company.companyName}</h1>
          <p className="text-sm text-gray-500">Organisationsnummer: {company.orgnr}</p>
          {company.companyId && (
            <p className="text-sm text-gray-500">Allabolag ID: {company.companyId}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div>
            <span className="font-medium text-gray-900">Grundat:</span>{' '}
            {company.foundationYear || <span className="text-gray-400">N/A</span>}
          </div>
          <div>
            <span className="font-medium text-gray-900">Anställda:</span>{' '}
            {company.employees !== null && company.employees !== undefined ? (
              company.employees
            ) : (
              <span className="text-gray-400">N/A</span>
            )}
          </div>
          <div>
            <span className="font-medium text-gray-900">Telefon:</span>{' '}
            {company.phone ? company.phone : <span className="text-gray-400">N/A</span>}
          </div>
          <div>
            <span className="font-medium text-gray-900">E-post:</span>{' '}
            {company.email ? company.email : <span className="text-gray-400">N/A</span>}
          </div>
          <div className="md:col-span-2">
            <span className="font-medium text-gray-900">Adress / Ort:</span>{' '}
            {company.location ? company.location : <span className="text-gray-400">N/A</span>}
          </div>
          <div className="md:col-span-2">
            <span className="font-medium text-gray-900">Webbplats:</span>{' '}
            {company.homepage ? (
              <a href={company.homepage} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
                {company.homepage}
              </a>
            ) : (
              <span className="text-gray-400">N/A</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BokslutCompanyInfo;
