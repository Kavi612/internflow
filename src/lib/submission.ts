import mammoth from 'mammoth';

// Dynamic import or require for pdf-parse to handle any bundling differences
async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse is a CommonJS module
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = (pdfParseModule.default || pdfParseModule) as (dataBuffer: Buffer) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (err) {
    console.error('[PDF Parse Error]', err);
    return 'Error extracting text from PDF file.';
  }
}

export interface SubmissionParseResult {
  rawContent: string;
  summary: string;
  fileName?: string;
  fileType?: string;
  link?: string;
}

/**
 * Fetches repository structure and README from a public GitHub repository.
 */
export async function fetchGitHubRepoDetails(url: string): Promise<{ text: string; summary: string }> {
  try {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      return {
        text: `Provided link: ${url}`,
        summary: `External link submitted: ${url}`,
      };
    }

    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');

    const headers: Record<string, string> = {
      'User-Agent': 'InternFlow-Review-Automation',
      Accept: 'application/vnd.github.v3+json',
    };

    // 1. Fetch README
    let readmeContent = '';
    try {
      const readmeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
        headers: { ...headers, Accept: 'application/vnd.github.v3.raw' },
      });
      if (readmeRes.ok) {
        readmeContent = await readmeRes.text();
      }
    } catch (e) {
      console.warn('Failed to fetch README from GitHub:', e);
    }

    // 2. Fetch File Tree (top 40 files)
    let fileTreeText = '';
    try {
      const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`, {
        headers,
      });

      let treeData;
      if (treeRes.ok) {
        treeData = await treeRes.json();
      } else {
        // Try master branch
        const masterRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`, {
          headers,
        });
        if (masterRes.ok) {
          treeData = await masterRes.json();
        }
      }

      if (treeData && Array.isArray(treeData.tree)) {
        const filePaths = treeData.tree
          .filter((item: any) => item.type === 'blob')
          .slice(0, 45)
          .map((item: any) => `- ${item.path}`)
          .join('\n');
        fileTreeText = `Repository File Tree (${treeData.tree.length} total files):\n${filePaths}`;
      }
    } catch (e) {
      console.warn('Failed to fetch file tree from GitHub:', e);
    }

    const fullContent = [
      `GitHub Repository: ${owner}/${repo}`,
      fileTreeText ? `\n--- File Structure ---\n${fileTreeText}` : '',
      readmeContent ? `\n--- README.md Content ---\n${readmeContent.substring(0, 6000)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      text: fullContent,
      summary: `GitHub repo ${owner}/${repo} parsed with ${readmeContent ? 'README' : 'no README'} and file structure.`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      text: `Link: ${url}\nNote: Could not inspect GitHub API details: ${msg}`,
      summary: `Link: ${url}`,
    };
  }
}

/**
 * Extracts raw textual content from an uploaded file (PDF, DOCX, TXT/code).
 */
export async function extractContentFromFile(
  buffer: Buffer,
  fileName: string,
  mimeType?: string
): Promise<SubmissionParseResult> {
  const extension = fileName.split('.').pop()?.toLowerCase();

  // 1. PDF
  if (extension === 'pdf' || mimeType === 'application/pdf') {
    const text = await parsePdf(buffer);
    return {
      rawContent: text.trim(),
      summary: `PDF document "${fileName}" (${text.length} characters extracted)`,
      fileName,
      fileType: 'pdf',
    };
  }

  // 2. DOCX
  if (extension === 'docx' || mimeType?.includes('wordprocessingml')) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value || '';
      return {
        rawContent: text.trim(),
        summary: `Word document "${fileName}" (${text.length} characters extracted)`,
        fileName,
        fileType: 'docx',
      };
    } catch (docxErr) {
      console.error('[Mammoth DOCX Error]', docxErr);
      return {
        rawContent: 'Error extracting text from DOCX document.',
        summary: `Failed to extract DOCX: ${fileName}`,
        fileName,
        fileType: 'docx',
      };
    }
  }

  // 3. Plain Text, Markdown, or Code
  const text = buffer.toString('utf-8');
  return {
    rawContent: text.trim(),
    summary: `Text file "${fileName}" (${text.length} characters)`,
    fileName,
    fileType: extension || 'txt',
  };
}
