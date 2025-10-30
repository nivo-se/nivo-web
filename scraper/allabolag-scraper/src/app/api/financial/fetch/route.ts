import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { LocalStagingDB } from '@/lib/db/local-staging';
import { filterHash } from '@/lib/hash';
import { getBuildId, fetchFinancialData, withSession } from '@/lib/allabolag';

export async function POST(request: NextRequest) {
  try {
    console.log('Starting financial data fetching job...');
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    
    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId parameter is required' },
        { status: 400 }
      );
    }
    
    console.log('Source job ID:', jobId);
    
    // Work directly with the existing session database
    const localDb = new LocalStagingDB(jobId);
    
    // Update the existing job to show Stage 3 is starting
    localDb.updateJob(jobId, {
      stage: 'stage3_financials',
      status: 'running'
    });
    
    console.log('Starting Stage 3 financial data fetch for existing job');
    
    // Start processing in background
    processFinancialJob(jobId, localDb).catch(async (error: unknown) => {
      console.error('Financial job failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      localDb.updateJob(jobId, { 
        status: 'error', 
        lastError: message
      });
    });
    
    return NextResponse.json({ jobId: jobId });
  } catch (error: unknown) {
    console.error('Error starting financial job:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        error: 'Failed to start financial job',
        details: message
      },
      { status: 500 }
    );
  }
}

async function processFinancialJob(jobId: string, localDb: LocalStagingDB) {
  return withSession(async (session: any) => {
    const buildId = await getBuildId(session);
    const batchSize = 50;
    const concurrency = 3;
    let processedCount = 0;
    
    console.log(`Starting Stage 3 financial data fetch for job ${jobId} with buildId: ${buildId}`);
  
  while (true) {
    // Get batch of companies with resolved company IDs
    // Try different statuses that might exist
    let companyIds = localDb.getCompanyIdsToProcess(jobId, 'pending');
    
    if (companyIds.length === 0) {
      companyIds = localDb.getCompanyIdsToProcess(jobId, 'resolved');
    }
    
    if (companyIds.length === 0) {
      // Also try companies marked as "no_financials" since they might actually have data
      companyIds = localDb.getCompanyIdsToProcess(jobId, 'no_financials');
    }
    
    if (companyIds.length === 0) {
      // If no company IDs found with specific status, get all company IDs
      const allCompanyIds = localDb.getCompanyIds(jobId);
      if (allCompanyIds.length === 0) {
        console.log('No company IDs found for financial data processing');
        break;
      }
      companyIds = allCompanyIds;
    }
    
    if (companyIds.length === 0) {
      console.log('No more company IDs to process for financial data');
      break;
    }
    
    const companiesToProcess = companyIds.slice(0, batchSize);
    console.log(`Processing batch of ${companiesToProcess.length} companies for financial data`);
    
    // Process in chunks with controlled concurrency
    const chunks: any[] = [];
    for (let i = 0; i < companiesToProcess.length; i += concurrency) {
      chunks.push(companiesToProcess.slice(i, i + concurrency));
    }
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (companyIdRecord: any) => {
        try {
          // Get the full company data from the staging_companies table
          const companyData = localDb.getCompanyByOrgnr(jobId, companyIdRecord.orgnr);
          
          if (!companyData) {
            console.log(`No company data found for orgnr ${companyIdRecord.orgnr}`);
            localDb.updateCompanyIdStatus(jobId, companyIdRecord.orgnr, 'no_company_data');
            return;
          }
          
          // Fetch financial data for this company
          const financialData = await fetchCompanyFinancials(buildId, companyData, companyIdRecord.company_id, session);
          
          if (financialData && financialData.length > 0) {
            // Store financial data in local database
            const financialsToInsert = financialData.map((financial: any) => ({
              id: `${companyIdRecord.company_id}_${financial.year}_${financial.period}`,
              companyId: companyIdRecord.company_id,
              orgnr: companyIdRecord.orgnr,
              year: financial.year,
              period: financial.period,
              periodStart: financial.periodStart,
              periodEnd: financial.periodEnd,
              currency: financial.currency || 'SEK',
              revenue: financial.revenue,
              profit: financial.profit,
              employees: financial.employees,
              be: financial.be,
              tr: financial.tr,
              rawData: financial.rawData,
              validationStatus: 'pending',
              scrapedAt: new Date().toISOString(),
              jobId: jobId,
              updatedAt: new Date().toISOString()
            }));
            
            localDb.insertFinancials(financialsToInsert);
            
            // Update company ID status
            localDb.updateCompanyIdStatus(jobId, companyIdRecord.orgnr, 'financials_fetched');
            
            console.log(`Fetched ${financialData.length} financial records for company ${companyIdRecord.company_id}`);
          } else {
            console.log(`No financial data found for company ${companyIdRecord.company_id}`);
            localDb.updateCompanyIdStatus(jobId, companyIdRecord.orgnr, 'no_financials');
          }
          
        } catch (error: unknown) {
          console.error(`Error fetching financials for company ${companyIdRecord.company_id}:`, error);
          const message = error instanceof Error ? error.message : 'Unknown error';
          localDb.updateCompanyIdStatus(jobId, companyIdRecord.orgnr, 'error', message);
        }
      });
      
      await Promise.all(promises);
      processedCount += chunk.length;
      
      // Update job progress
      localDb.updateJob(jobId, {
        processedCount: processedCount
      });
      
      // Small delay between chunks
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // Mark job as done
  localDb.updateJob(jobId, { 
    status: 'done'
  });
  
  console.log(`Stage 3 financial data fetch for job ${jobId} completed, processed ${processedCount} companies`);
  });
}

async function fetchCompanyFinancials(buildId: string, companyData: any, companyId: string, session: any) {
  try {
    console.log(`Fetching financial data for company ${companyData.companyName} (${companyData.orgnr}) - Company ID: ${companyId}`);
    
    // Add the companyId to the companyData
    const enrichedCompanyData = {
      ...companyData,
      companyId: companyId
    };
    
    // Use the real fetchFinancialData function from allabolag.ts
    const { fetchFinancialData } = await import('@/lib/allabolag');
    const financialData = await fetchFinancialData(buildId, companyId, session, companyData.companyName, companyData.naceCategories);
    
    console.log(`Fetched ${financialData.length} financial records for company ${companyData.companyName} (${companyData.orgnr})`);
    return financialData;
  } catch (error: unknown) {
    console.error(`Error fetching financial data for company ${companyData.companyName} (${companyData.orgnr}):`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error details:', message);
    throw error;
  }
}
