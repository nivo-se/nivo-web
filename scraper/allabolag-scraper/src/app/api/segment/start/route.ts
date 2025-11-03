import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { LocalStagingDB, StagingCompany } from '@/lib/db/local-staging';
import { filterHash } from '@/lib/hash';
import { getBuildId, fetchSegmentationPage, normalizeCompany, getAllabolagSession, withSession } from '@/lib/allabolag';

const StartSegmentationSchema = z.object({
  revenueFrom: z.number().min(0),
  revenueTo: z.number().min(0),
  profitFrom: z.number().min(0).optional(),
  profitTo: z.number().min(0).optional(),
  companyType: z.literal("AB").optional().default("AB"),
});

export async function POST(request: NextRequest) {
  try {
    console.log('Starting segmentation job...');
    const body = await request.json();
    console.log('Request body:', body);
    
    // Convert null to undefined for optional fields
    const normalizedBody = {
      ...body,
      profitFrom: body.profitFrom ?? undefined,
      profitTo: body.profitTo ?? undefined,
    };
    
    const params = StartSegmentationSchema.parse(normalizedBody);
    console.log('Parsed params:', params);
    
    // Convert millions SEK to thousands SEK for Allabolag.se API
    // Allabolag.se expects values in thousands of SEK
    const scraperParams = {
      ...params,
      revenueFrom: params.revenueFrom * 1000,  // 100M SEK = 100,000 thousands SEK
      revenueTo: params.revenueTo * 1000,      // 101M SEK = 101,000 thousands SEK
      profitFrom: params.profitFrom ? params.profitFrom * 1000 : undefined,  // 3M SEK = 3,000 thousands SEK
      profitTo: params.profitTo ? params.profitTo * 1000 : undefined,        // 5M SEK = 5,000 thousands SEK
    };
    console.log('Scraper params:', scraperParams);
    
    // Compute filter hash using original params (for UI consistency)
    const hash = filterHash(params);
    console.log('Filter hash:', hash);
    
    // Create new job
    const jobId = uuidv4();
    console.log('Job ID:', jobId);
    
    const localDb = new LocalStagingDB(jobId);
    console.log('Local database created');
    
    // Check if job already exists and is running
    const existingJob = localDb.getJob(jobId);
    if (existingJob && existingJob.status === 'running') {
      return NextResponse.json({ 
        jobId: existingJob.id,
        message: 'Job already running' 
      });
    }
    
    // Create new job in local database
    const now = new Date().toISOString();
    console.log('Inserting job into local database...');
    localDb.insertJob({
      id: jobId,
      jobType: 'segmentation',
      filterHash: hash,
      params: params,
      status: 'running',
      stage: 'stage1_segmentation',
      createdAt: now,
      updatedAt: now
    });
    console.log('Job inserted successfully');
    
    // Start processing in background
    processSegmentationJob(jobId, scraperParams, localDb).catch(async (error) => {
      console.error('Segmentation job failed:', error);
      localDb.updateJob(jobId, { 
        status: 'error', 
        lastError: error.message
      });
    });
    
    console.log('Returning job ID:', jobId);
    return NextResponse.json({ jobId });
  } catch (error) {
    console.error('Error starting segmentation job:', error);
    return NextResponse.json(
      { 
        error: 'Failed to start segmentation job',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

async function processSegmentationJob(jobId: string, params: any, localDb: LocalStagingDB) {
  return withSession(async (session) => {
    const buildId = await getBuildId(session);
    let currentPage = 1;
    let emptyPages = 0;
    let totalCompaniesFound = 0;
    const maxPages = 3000;
    const maxEmptyPages = 3;
    const pagesPerBatch = 20; // Process 20 pages per batch
    const concurrency = 15; // 15 concurrent page fetches
    
    console.log(`Starting segmentation job ${jobId} with buildId: ${buildId}`);
    console.log(`Using parallel processing: ${concurrency} concurrent pages per batch`);
    
    while (currentPage <= maxPages) {
      try {
        // Process pages in parallel batches
        const pageBatch: number[] = [];
        for (let page = currentPage; page < Math.min(currentPage + pagesPerBatch, maxPages + 1); page++) {
          pageBatch.push(page);
        }
        
        console.log(`Processing pages ${pageBatch[0]}-${pageBatch[pageBatch.length - 1]} in parallel (${pageBatch.length} pages)`);
        
        // Process pages in chunks with controlled concurrency
        const chunks: number[][] = [];
        for (let i = 0; i < pageBatch.length; i += concurrency) {
          chunks.push(pageBatch.slice(i, i + concurrency));
        }
        
        let batchEmptyPages = 0;
        let batchCompaniesFound = 0;
        
        for (const chunk of chunks) {
          // Process pages concurrently within chunk
          const promises = chunk.map(async (pageNum: number) => {
            try {
              console.log(`Fetching page ${pageNum}...`);
              const response = await fetchSegmentationPage(buildId, {
                ...params,
                page: pageNum,
              }, session);
              
              const companies = response?.pageProps?.companies || [];
              console.log(`Page ${pageNum}: Found ${companies.length} companies`);
              
              return { pageNum, companies, isEmpty: companies.length === 0 };
            } catch (error: any) {
              console.error(`Error fetching page ${pageNum}:`, error);
              // Check if it's a proxy error - stop job
              if (error.message?.includes('Oxylabs proxy') || error.message?.includes('proxy')) {
                throw new Error(`Proxy error on page ${pageNum}: ${error.message}`);
              }
              return { pageNum, companies: [], isEmpty: true, error: error.message };
            }
          });
          
          const results = await Promise.all(promises);
          
          // Process results
          for (const result of results) {
            if (result.error && result.error.includes('proxy')) {
              throw new Error(result.error);
            }
            
            if (result.isEmpty) {
              batchEmptyPages++;
            } else {
              batchEmptyPages = 0; // Reset counter on non-empty page
              batchCompaniesFound += result.companies.length;
              
              // Process and insert companies into local database
              const companiesToInsert = [];
              
              for (const company of result.companies) {
                const normalized = normalizeCompany(company);
                
                if (!normalized.orgnr) {
                  console.warn('Skipping company without orgnr:', company);
                  continue;
                }
                
                companiesToInsert.push({
                  orgnr: normalized.orgnr,
                  companyName: normalized.companyName,
                  companyId: normalized.companyId,
                  companyIdHint: normalized.companyIdHint,
                  homepage: normalized.homepage,
                  naceCategories: normalized.naceCategories,
                  segmentName: normalized.segmentName,
                  revenueSek: normalized.revenueSek,
                  profitSek: normalized.profitSek,
                  foundationYear: normalized.foundationYear,
                  companyAccountsLastYear: normalized.companyAccountsLastYear,
                  scrapedAt: new Date().toISOString(),
                  jobId: jobId,
                  status: 'pending',
                  updatedAt: new Date().toISOString()
                });
              }
              
              // Insert companies in batch
              if (companiesToInsert.length > 0) {
                localDb.insertCompanies(companiesToInsert as StagingCompany[]);
              }
            }
          }
          
          // Check if we've hit too many empty pages
          if (batchEmptyPages >= maxEmptyPages) {
            console.log(`Reached ${maxEmptyPages} empty pages in batch, stopping`);
            emptyPages = batchEmptyPages;
            break;
          }
        }
        
        totalCompaniesFound += batchCompaniesFound;
        emptyPages = batchEmptyPages;
        currentPage = pageBatch[pageBatch.length - 1] + 1;
        
        // Update job progress
        localDb.updateJob(jobId, {
          lastPage: currentPage - 1,
          processedCount: totalCompaniesFound,
          totalCompanies: totalCompaniesFound
        });
        
        console.log(`Job ${jobId} progress: Page ${currentPage - 1}, Total companies found: ${totalCompaniesFound}`);
        
        // Stop if we hit too many empty pages
        if (emptyPages >= maxEmptyPages) {
          console.log(`Reached ${maxEmptyPages} empty pages, stopping`);
          break;
        }
      
    } catch (error: any) {
      console.error(`❌ Error processing page ${currentPage}:`, error);
      
      // Check if it's a proxy error - stop job and mark as error
      if (error.message?.includes('Oxylabs proxy') || error.message?.includes('proxy')) {
        console.error('❌ Proxy error detected - stopping job');
        localDb.updateJob(jobId, {
          status: 'error',
          lastError: `Proxy error on page ${currentPage}: ${error.message}`,
          updatedAt: new Date().toISOString()
        });
        throw new Error(`Proxy error: ${error.message}. Job stopped. Fix proxy and resume from page ${currentPage}.`);
      }
      
      // For other errors, also stop but allow retry
      localDb.updateJob(jobId, {
        status: 'error',
        lastError: `Error on page ${currentPage}: ${error.message}`,
        updatedAt: new Date().toISOString()
      });
      throw error;
    }
  }
  
  // Mark job as done
  localDb.updateJob(jobId, { 
    status: 'done',
    totalCompanies: totalCompaniesFound,
    processedCount: totalCompaniesFound
  });
  
    console.log(`Segmentation job ${jobId} completed:`);
    console.log(`- Total pages processed: ${currentPage - 1}`);
    console.log(`- Total companies found: ${totalCompaniesFound}`);
    console.log(`- Companies stored in database: ${totalCompaniesFound}`);
  });
}




