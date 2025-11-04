import { NextRequest, NextResponse } from 'next/server';
import { LocalStagingDB } from '@/lib/db/local-staging';
import { addCorsHeaders, handleCors } from '@/lib/cors';

interface BokslutFinancialRecord {
  year: number;
  period: string;
  period_start: string | null;
  period_end: string | null;
  currency: string;
  revenue: number | null;
  profit: number | null;
  employees: number | null;
  be: number | null;
  tr: number | null;
  raw_data: string | null;
}

interface CompanyMetadata {
  phone: string | null;
  email: string | null;
  homepage: string | null;
  location: string | null;
  employees: number | null;
}

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asJsonObject(value: unknown): JsonObject | null {
  return isJsonObject(value) ? value : null;
}

function asJsonArray(value: unknown): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function firstString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = firstString(entry);
      if (result) {
        return result;
      }
    }
  }

  return null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function extractAccounts(raw: JsonObject): Record<string, number> {
  const accounts: Record<string, number> = {};

  const addAccount = (code: unknown, amount: unknown) => {
    if (!code) return;
    const normalizedCode = String(code).trim().toUpperCase();
    if (!/^[A-ZÅÄÖ0-9]{2,6}$/.test(normalizedCode)) {
      return;
    }
    const numericAmount = parseNumber(amount);
    if (numericAmount === null) {
      return;
    }
    accounts[normalizedCode] = numericAmount;
  };

  const addAccountsFrom = (value: unknown) => {
    for (const item of asJsonArray(value)) {
      if (!isJsonObject(item)) continue;
      const codeCandidate = item['code'] ?? item['accountCode'] ?? item['number'];
      const amountCandidate = item['amount'] ?? item['value'] ?? item['balance'];
      addAccount(codeCandidate, amountCandidate);
    }
  };

  addAccountsFrom(raw['accounts']);

  const report = asJsonObject(raw['report']);
  if (report) {
    addAccountsFrom(report['accounts']);
  }

  const dataSection = asJsonObject(raw['data']);
  if (dataSection) {
    addAccountsFrom(dataSection['accounts']);
  }

  const pageProps = asJsonObject(raw['pageProps']);
  if (pageProps) {
    const reportSection = asJsonObject(pageProps['report']);
    if (reportSection) {
      addAccountsFrom(reportSection['accounts']);
    }

    const financialReport = asJsonObject(pageProps['financialReport']);
    if (financialReport) {
      addAccountsFrom(financialReport['accounts']);
    }

    const company = asJsonObject(pageProps['company']);
    if (company) {
      for (const period of asJsonArray(company['companyAccounts'])) {
        const periodRecord = asJsonObject(period);
        if (periodRecord) {
          addAccountsFrom(periodRecord['accounts']);
        }
      }
    }
  }

  for (const period of asJsonArray(raw['companyAccounts'])) {
    const periodRecord = asJsonObject(period);
    if (periodRecord) {
      addAccountsFrom(periodRecord['accounts']);
    }
  }

  Object.entries(raw).forEach(([key, value]) => {
    if (typeof value === 'number' || typeof value === 'string') {
      addAccount(key, value);
    }
  });

  return accounts;
}

function extractCompanyMetadata(raw: JsonObject, existing: CompanyMetadata): CompanyMetadata {
  const pageProps = asJsonObject(raw['pageProps']);
  const pageCompany = pageProps ? asJsonObject(pageProps['company']) : null;
  const topLevelCompany = asJsonObject(raw['company']);
  const dataSection = asJsonObject(raw['data']);
  const dataCompany = dataSection ? asJsonObject(dataSection['company']) : null;

  const companyData = pageCompany || topLevelCompany || dataCompany;
  if (!companyData) {
    return existing;
  }

  const updated: CompanyMetadata = { ...existing };

  const contact = asJsonObject(companyData['contact']);
  const phoneCandidate =
    companyData['phone'] ??
    (contact ? contact['phone'] : undefined) ??
    (Array.isArray(companyData['phones']) ? companyData['phones'][0] : undefined);
  const emailCandidate =
    companyData['email'] ??
    (contact ? contact['email'] : undefined) ??
    (Array.isArray(companyData['emails']) ? companyData['emails'][0] : undefined);
  const homepageCandidate =
    companyData['homepage'] ??
    companyData['website'] ??
    companyData['webpage'] ??
    (Array.isArray(companyData['externalLinks']) ? companyData['externalLinks'][0] : undefined);

  const phone = firstString(phoneCandidate);
  if (!updated.phone && phone) {
    updated.phone = phone;
  }

  const email = firstString(emailCandidate);
  if (!updated.email && email) {
    updated.email = email;
  }

  const homepage = firstString(homepageCandidate);
  if (!updated.homepage && homepage) {
    updated.homepage = homepage;
  }

  const domicileValue = companyData['domicile'];
  if (!updated.location && domicileValue !== undefined && domicileValue !== null) {
    if (typeof domicileValue === 'string') {
      const trimmed = domicileValue.trim();
      if (trimmed.length > 0) {
        updated.location = trimmed;
      }
    } else if (isJsonObject(domicileValue)) {
      const municipality = firstString(
        domicileValue['municipality'] ?? domicileValue['city'] ?? domicileValue['name'],
      );
      const county = firstString(domicileValue['county'] ?? domicileValue['region']);
      const parts = [municipality, county].filter((part): part is string => Boolean(part));
      if (parts.length > 0) {
        updated.location = parts.join(', ');
      }
    }
  }

  if (updated.employees === null || updated.employees === undefined) {
    const employeesCandidate =
      companyData['employees'] ??
      companyData['employeesCount'] ??
      companyData['employeeCount'] ??
      companyData['antalAnstallda'];
    const numericEmployees = parseNumber(employeesCandidate);
    if (numericEmployees !== null) {
      updated.employees = numericEmployees;
    }
  }

  return updated;
}

export async function GET(request: NextRequest, { params }: { params: { orgnr: string } }) {
  const corsResponse = handleCors(request);
  if (corsResponse) {
    return corsResponse;
  }

  const orgnr = params.orgnr;
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return addCorsHeaders(NextResponse.json({ error: 'jobId parameter is required' }, { status: 400 }));
  }

  const localDb = new LocalStagingDB(jobId);

  try {
    const job = localDb.getJob(jobId);
    if (!job) {
      return addCorsHeaders(NextResponse.json({ error: 'Job not found' }, { status: 404 }));
    }

    const company = localDb.getCompanyByOrgnr(jobId, orgnr);
    if (!company) {
      return addCorsHeaders(NextResponse.json({ error: 'Company not found' }, { status: 404 }));
    }

    const companyIdRecord = localDb.getCompanyIdByOrgnr(jobId, orgnr);

    const financialRows = localDb.getFinancialRecordsWithRawData(jobId, orgnr) as BokslutFinancialRecord[];
    if (!financialRows || financialRows.length === 0) {
      return addCorsHeaders(NextResponse.json({ error: 'No financial data found for this company' }, { status: 404 }));
    }

    let metadata: CompanyMetadata = {
      phone: null,
      email: null,
      homepage: company.homepage || null,
      location: null,
      employees: null,
    };

    const financials = financialRows.map((row) => {
      let raw: JsonObject = {};
      if (row.raw_data) {
        try {
          const parsed = JSON.parse(row.raw_data) as unknown;
          raw = asJsonObject(parsed) ?? {};
        } catch (error) {
          console.warn(`Failed to parse raw_data for ${orgnr} ${row.year}/${row.period}:`, error);
        }
      }

      metadata = extractCompanyMetadata(raw, metadata);

      const accounts = extractAccounts(raw);

      if ((metadata.employees === null || metadata.employees === undefined) && row.employees !== null && row.employees !== undefined) {
        const employeesNumber = parseNumber(row.employees);
        if (employeesNumber !== null) {
          metadata = { ...metadata, employees: employeesNumber };
        }
      }

      if (row.revenue !== null && row.revenue !== undefined && accounts['SDI'] === undefined) {
        const revenueNumber = parseNumber(row.revenue);
        if (revenueNumber !== null) {
          accounts['SDI'] = revenueNumber;
        }
      }

      if (row.profit !== null && row.profit !== undefined && accounts['DR'] === undefined) {
        const profitNumber = parseNumber(row.profit);
        if (profitNumber !== null) {
          accounts['DR'] = profitNumber;
        }
      }

      if (row.be !== null && row.be !== undefined && accounts['BE'] === undefined) {
        const beNumber = parseNumber(row.be);
        if (beNumber !== null) {
          accounts['BE'] = beNumber;
        }
      }

      if (row.tr !== null && row.tr !== undefined && accounts['TR'] === undefined) {
        const trNumber = parseNumber(row.tr);
        if (trNumber !== null) {
          accounts['TR'] = trNumber;
        }
      }

      if (accounts['FI'] === undefined && raw['fi'] !== undefined) {
        const fiNumber = parseNumber(raw['fi']);
        if (fiNumber !== null) {
          accounts['FI'] = fiNumber;
        }
      }

      if (accounts['FK'] === undefined && raw['fk'] !== undefined) {
        const fkNumber = parseNumber(raw['fk']);
        if (fkNumber !== null) {
          accounts['FK'] = fkNumber;
        }
      }

      if (accounts['RG'] === undefined && raw['rg'] !== undefined) {
        const rgNumber = parseNumber(raw['rg']);
        if (rgNumber !== null) {
          accounts['RG'] = rgNumber;
        }
      }

      if (accounts['RPE'] === undefined && raw['rpe'] !== undefined) {
        const rpeNumber = parseNumber(raw['rpe']);
        if (rpeNumber !== null) {
          accounts['RPE'] = rpeNumber;
        }
      }

      if (accounts['SKG'] === undefined && raw['skg'] !== undefined) {
        const skgNumber = parseNumber(raw['skg']);
        if (skgNumber !== null) {
          accounts['SKG'] = skgNumber;
        }
      }

      if (accounts['ORS'] === undefined && raw['ors'] !== undefined) {
        const orsNumber = parseNumber(raw['ors']);
        if (orsNumber !== null) {
          accounts['ORS'] = orsNumber;
        }
      }

      if (accounts['EK'] === undefined && raw['ek'] !== undefined) {
        const ekNumber = parseNumber(raw['ek']);
        if (ekNumber !== null) {
          accounts['EK'] = ekNumber;
        }
      }

      if (accounts['SV'] === undefined && raw['sv'] !== undefined) {
        const svNumber = parseNumber(raw['sv']);
        if (svNumber !== null) {
          accounts['SV'] = svNumber;
        }
      }

      if (accounts['SED'] === undefined && raw['sed'] !== undefined) {
        const sedNumber = parseNumber(raw['sed']);
        if (sedNumber !== null) {
          accounts['SED'] = sedNumber;
        }
      }

      if (accounts['KB'] === undefined && raw['kb'] !== undefined) {
        const kbNumber = parseNumber(raw['kb']);
        if (kbNumber !== null) {
          accounts['KB'] = kbNumber;
        }
      }

      if (accounts['LG'] === undefined && raw['lg'] !== undefined) {
        const lgNumber = parseNumber(raw['lg']);
        if (lgNumber !== null) {
          accounts['LG'] = lgNumber;
        }
      }

      if (accounts['SFA'] === undefined && raw['sfa'] !== undefined) {
        const sfaNumber = parseNumber(raw['sfa']);
        if (sfaNumber !== null) {
          accounts['SFA'] = sfaNumber;
        }
      }

      if (accounts['SOM'] === undefined && raw['som'] !== undefined) {
        const somNumber = parseNumber(raw['som']);
        if (somNumber !== null) {
          accounts['SOM'] = somNumber;
        }
      }

      if (accounts['SEK'] === undefined && raw['sek'] !== undefined) {
        const sekNumber = parseNumber(raw['sek']);
        if (sekNumber !== null) {
          accounts['SEK'] = sekNumber;
        }
      }

      return {
        year: row.year,
        period: row.period,
        periodStart: row.period_start ?? null,
        periodEnd: row.period_end ?? null,
        currency: row.currency || 'SEK',
        accounts,
      };
    });

    const response = {
      company: {
        orgnr: company.orgnr,
        companyName: company.companyName,
        companyId: companyIdRecord?.company_id ?? company.companyId ?? null,
        homepage: metadata.homepage,
        phone: metadata.phone,
        email: metadata.email,
        location: metadata.location,
        employees: metadata.employees,
        foundationYear: company.foundationYear ?? null,
      },
      financials,
    };

    return addCorsHeaders(NextResponse.json(response));
  } catch (error: unknown) {
    console.error('Error fetching bokslut data:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return addCorsHeaders(NextResponse.json({ error: message }, { status: 500 }));
  } finally {
    localDb.close();
  }
}
