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
    
    const params = StartSegmentationSchema.parse(body);
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
    
    console.log(`Starting segmentation job ${jobId} with buildId: ${buildId}`);
    
    while (currentPage <= maxPages) {
      try {
        console.log(`Processing page ${currentPage} for job ${jobId}`);
        
        const response = await fetchSegmentationPage(buildId, {
          ...params,
          page: currentPage,
        }, session);
      
      const companies = response?.pageProps?.companies || [];
      console.log(`Page ${currentPage}: Found ${companies.length} companies`);
      
      if (companies.length === 0) {
        emptyPages++;
        console.log(`Empty page ${currentPage}, count: ${emptyPages}`);
        
        if (emptyPages >= maxEmptyPages) {
          console.log(`Reached ${maxEmptyPages} empty pages, stopping`);
          break;
        }
      } else {
        emptyPages = 0; // Reset counter on non-empty page
        totalCompaniesFound += companies.length; // Accumulate total companies
        
        // Process and insert companies into local database (skip duplicates)
        const companiesToInsert = [];
        let duplicatesSkipped = 0;
        
        for (const company of companies) {
          const normalized = normalizeCompany(company);
          
          if (!normalized.orgnr) {
            console.warn('Skipping company without orgnr:', company);
            continue;
          }
          
          // Note: Duplicate checking is handled by the local staging database
          
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
        
        if (duplicatesSkipped > 0) {
          console.log(`Page ${currentPage}: Skipped ${duplicatesSkipped} duplicate companies`);
        }
        
        // Insert companies in batch
        if (companiesToInsert.length > 0) {
          localDb.insertCompanies(companiesToInsert as StagingCompany[]);
        }
      }
      
      // Update job progress
      localDb.updateJob(jobId, {
        lastPage: currentPage,
        processedCount: totalCompaniesFound,
        totalCompanies: totalCompaniesFound
      });
      
      console.log(`Job ${jobId} progress: Page ${currentPage}, Total companies found: ${totalCompaniesFound}`);
      
      // Log first two orgnrs for debugging
      if (companies.length > 0) {
        const firstTwoOrgnrs = companies.slice(0, 2).map((c: any) => c.organisationNumber);
        console.log(`Page ${currentPage} first two orgnrs:`, firstTwoOrgnrs);
      }
      
      currentPage++;
      
      // Small delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Error processing page ${currentPage}:`, error);
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




