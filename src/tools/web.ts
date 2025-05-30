import { createTool, type ToolExecuteOptions, type ToolExecutionContext } from "@voltagent/core";
import { z } from "zod";
import { load } from "cheerio";
import { Octokit } from "octokit";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "fs-extra";
import path from "path";
import { marked } from "marked";
import * as yaml from "yaml";

/**
 * Enhanced Web Search Tool - Uses DuckDuckGo with multiple fallbacks
 */
export const webSearchTool = createTool({
  name: 'web_search',
  description: 'Search the internet for current information, news, and answers to questions using DuckDuckGo',
  parameters: z.object({
    query: z.string().describe('Search query - be specific for better results'),
    max_results: z.number().min(1).max(20).optional().default(5).describe('Maximum number of results to return'),
    search_type: z.enum(['web', 'news', 'images']).optional().default('web').describe('Type of search'),
  }),
  execute: async ({ query, max_results = 5, search_type = 'web' }: { 
    query: string; 
    max_results?: number; 
    search_type?: 'web' | 'news' | 'images';
  }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
    console.log('[🔧 Tool] web_search started', { query, max_results, search_type });
    try {
      let searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      if (search_type === 'news') {
        searchUrl += '&iar=news';
      } else if (search_type === 'images') {
        searchUrl += '&iax=images&ia=images';
      }
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });
      if (!response.ok) throw new Error(`DuckDuckGo search failed: HTTP ${response.status}`);
      const html = await response.text();
      const $ = load(html);
      const results: any[] = [];
      $(".result").each((_, el) => {
        if (results.length >= max_results) return false;
        const link = $(el).find("a.result__a");
        const snippet = $(el).find("a.result__snippet").text().replace(/\s+/g, ' ').trim();
        const title = link.text().replace(/\s+/g, ' ').trim();
        const url = link.attr("href") || "";
        const domain = url ? new URL(url).hostname : undefined;
        if (title && url) results.push({ title, url, snippet, domain });
      });
      if (results.length === 0) {
        const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
        const apiResp = await fetch(apiUrl);
        if (apiResp.ok) {
          const apiData = await apiResp.json();
          if (apiData.RelatedTopics && Array.isArray(apiData.RelatedTopics)) {
            for (const topic of apiData.RelatedTopics) {
              if (topic.Text && topic.FirstURL && results.length < max_results) {
                results.push({
                  url: topic.FirstURL,
                  title: topic.Text.split(' - ')[0],
                  snippet: topic.Text,
                });
              }
            }
          }
        }
      }
      const result: Record<string, any> = {
        success: true,
        query,
        results,
        total_results: results.length,
        search_timestamp: new Date().toISOString(),
        source: 'DuckDuckGo',
        search_type,
        note: results.length === 0 ? 'No results found or rate-limited. DuckDuckGo scraping is unofficial and may break.' : undefined,
      };
      console.log('[✅ Tool] web_search completed', result);
      return result;
    } catch (error) {
      console.error('[❌ Tool] web_search failed', error);
      return {
        success: false,
        error: `Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        query,
        search_type,
      };
    }
  }
});

/**
 * Advanced URL Fetch Tool - Extract comprehensive content from URLs
 */
export const urlFetchTool = createTool({
  name: 'url_fetch',
  description: 'Fetch and analyze content from URLs with comprehensive extraction capabilities',
  parameters: z.object({
    url: z.string().url().describe('URL to fetch and analyze'),
    extract_type: z.enum(['text', 'metadata', 'links', 'images', 'structured', 'all']).default('text').describe('Type of content to extract'),
    max_content_length: z.number().min(100).max(50000).default(10000).describe('Maximum content length to return'),
  }),
  execute: async ({ url, extract_type = 'text', max_content_length = 10000 }: { 
    url: string; 
    extract_type?: 'text' | 'metadata' | 'links' | 'images' | 'structured' | 'all';
    max_content_length?: number;
  }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
    console.log('[🔧 Tool] url_fetch started', { url, extract_type, max_content_length });
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const contentType = response.headers.get('content-type') || '';
      const html = await response.text();
      const $ = load(html);
      const result: Record<string, any> = {
        url,
        content_type: contentType,
        extract_type,
        fetch_timestamp: new Date().toISOString(),
      };
      if (extract_type === 'text' || extract_type === 'all') {
        $('script, style, nav, footer, aside').remove();
        const title = $('title').text().trim();
        const mainContent = $('main, article, .content, #content').first();
        const textContent = mainContent.length > 0 ? mainContent.text() : $('body').text();
        result.text = {
          title,
          content: textContent.replace(/\s+/g, ' ').trim().substring(0, max_content_length),
          word_count: textContent.split(/\s+/).length,
        };
      }
      if (extract_type === 'metadata' || extract_type === 'all') {
        result.metadata = {
          title: $('title').text().trim(),
          description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content'),
          keywords: $('meta[name="keywords"]').attr('content'),
          author: $('meta[name="author"]').attr('content'),
          canonical: $('link[rel="canonical"]').attr('href'),
          og_title: $('meta[property="og:title"]').attr('content'),
          og_image: $('meta[property="og:image"]').attr('content'),
          og_type: $('meta[property="og:type"]').attr('content'),
          twitter_card: $('meta[name="twitter:card"]').attr('content'),
          language: $('html').attr('lang') || $('meta[http-equiv="content-language"]').attr('content'),
        };
      }
      if (extract_type === 'links' || extract_type === 'all') {
        const links: any[] = [];
        $('a[href]').each((_: number, el: any) => {
          const href = $(el).attr('href');
          const text = $(el).text().trim();
          if (href && text && links.length < 100) {
            const isExternal = href.startsWith('http') && !href.includes(new URL(url).hostname);
            links.push({ text, href, external: isExternal });
          }
        });
        result.links = links;
      }
      if (extract_type === 'images' || extract_type === 'all') {
        const images: any[] = [];
        $('img[src]').each((_: number, el: any) => {
          const src = $(el).attr('src');
          const alt = $(el).attr('alt') || '';
          const title = $(el).attr('title');
          if (src && images.length < 50) {
            images.push({ src, alt, title });
          }
        });
        result.images = images;
      }
      if (extract_type === 'structured' || extract_type === 'all') {
        const structuredData: any[] = [];
        $('script[type="application/ld+json"]').each((index: number, el: any) => {
          try {
            const data = JSON.parse($(el).html() || '{}');
            structuredData.push(data);
          } catch (_) { /* empty */ }
        });        result.structured_data = structuredData;      }
      const out = { success: true, ...result };
      console.log('[✅ Tool] url_fetch completed', out);
      return out;
    } catch (error) {
      console.error('[❌ Tool] url_fetch failed', error);
      return {
        success: false,
        error: `URL fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        url,
        extract_type,
      };
    }
  }
});

/**
 * GitHub Tool - Comprehensive GitHub repository operations using Octokit
 */
export const githubTool = createTool({
  name: 'github',
  description: 'Interact with GitHub repositories, search code, get issues, PRs, and repository information',
  parameters: z.object({
    action: z.enum(['repo_info', 'search_repos', 'search_code', 'get_file', 'list_files', 'get_issues', 'get_prs', 'get_commits', 'get_releases']).describe('GitHub action to perform'),
    owner: z.string().optional().describe('Repository owner (required for repo-specific actions)'),
    repo: z.string().optional().describe('Repository name (required for repo-specific actions)'),
    query: z.string().optional().describe('Search query (for search actions)'),
    path: z.string().optional().describe('File path (for get_file action)'),
    branch: z.string().optional().default('main').describe('Branch name'),
    limit: z.number().min(1).max(100).optional().default(10).describe('Maximum number of results'),
  }),
  execute: async ({ action, owner, repo, query, path, branch = 'main', limit = 10 }: {
    action: 'repo_info' | 'search_repos' | 'search_code' | 'get_file' | 'list_files' | 'get_issues' | 'get_prs' | 'get_commits' | 'get_releases';
    owner?: string;
    repo?: string;
    query?: string;
    path?: string;
    branch?: string;
    limit?: number;
  }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
    console.log('[🔧 Tool] github started', { action, owner, repo, query, path, branch, limit });
    try {
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      switch (action) {
        case 'repo_info':
          { if (!owner || !repo) throw new Error('Owner and repo are required for repo_info');
          const repoData = await octokit.rest.repos.get({ owner, repo });
          const repoInfoResult = {
            success: true,
            action,
            data: {
              name: repoData.data.name,
              full_name: repoData.data.full_name,
              description: repoData.data.description,
              language: repoData.data.language,
              stars: repoData.data.stargazers_count,
              forks: repoData.data.forks_count,
              open_issues: repoData.data.open_issues_count,
              created_at: repoData.data.created_at,
              updated_at: repoData.data.updated_at,
              homepage: repoData.data.homepage,
              topics: repoData.data.topics,
            },
          };
          console.log('[✅ Tool] github repo_info completed', repoInfoResult);
          return repoInfoResult; }

        case 'search_repos':
          { if (!query) throw new Error('Query is required for search_repos');
          const repoSearch = await octokit.rest.search.repos({
            q: query,
            per_page: limit,
            sort: 'stars',
            order: 'desc',
          });
          const repoSearchResult = {
            success: true,
            action,
            data: repoSearch.data.items.map(item => ({
              name: item.name,
              full_name: item.full_name,
              description: item.description,
              language: item.language,
              stars: item.stargazers_count,
              url: item.html_url,
            })),
          };
          console.log('[✅ Tool] github search_repos completed', repoSearchResult);
          return repoSearchResult; }

        case 'search_code':
          { if (!query) throw new Error('Query is required for search_code');
          const codeSearch = await octokit.rest.search.code({
            q: query,
            per_page: limit,
          });
          const codeSearchResult = {
            success: true,
            action,
            data: codeSearch.data.items.map(item => ({
              name: item.name,
              path: item.path,
              repository: item.repository.full_name,
              url: item.html_url,
              score: item.score,
            })),
          };
          console.log('[✅ Tool] github search_code completed', codeSearchResult);
          return codeSearchResult; }

        case 'get_file':
          { if (!owner || !repo || !path) throw new Error('Owner, repo, and path are required for get_file');
          const fileData = await octokit.rest.repos.getContent({
            owner,
            repo,
            path,
            ref: branch,
          });
          if (Array.isArray(fileData.data) || fileData.data.type !== 'file') {
            throw new Error('Path does not point to a file');
          }
          const content = fileData.data.encoding === 'base64' 
            ? Buffer.from(fileData.data.content, 'base64').toString('utf-8')
            : fileData.data.content;
          const fileResult = {
            success: true,
            action,
            data: {
              name: fileData.data.name,
              path: fileData.data.path,
              size: fileData.data.size,
              content: content.substring(0, 10000), // Limit content size
              encoding: fileData.data.encoding,
              sha: fileData.data.sha,
            },
          };
          console.log('[✅ Tool] github get_file completed', fileResult);
          return fileResult; }

        case 'list_files':
          { if (!owner || !repo) throw new Error('Owner and repo are required for list_files');
          const treeData = await octokit.rest.git.getTree({
            owner,
            repo,
            tree_sha: branch,
            recursive: 'true',
          });
          const listFilesResult = {
            success: true,
            action,
            data: treeData.data.tree.slice(0, limit).map(item => ({
              path: item.path,
              type: item.type,
              size: item.size,
              mode: item.mode,
            })),
          };
          console.log('[✅ Tool] github list_files completed', listFilesResult);
          return listFilesResult; }

        case 'get_issues':
          { if (!owner || !repo) throw new Error('Owner and repo are required for get_issues');
          const issues = await octokit.rest.issues.listForRepo({
            owner,
            repo,
            state: 'open',
            per_page: limit,
          });
          const getIssuesResult = {
            success: true,
            action,
            data: issues.data.map(issue => ({
              number: issue.number,
              title: issue.title,
              body: issue.body?.substring(0, 500),
              state: issue.state,
              user: issue.user?.login,
              created_at: issue.created_at,
              labels: issue.labels.map((label: any) => label.name),
            })),
          };
          console.log('[✅ Tool] github get_issues completed', getIssuesResult);
          return getIssuesResult; }

        case 'get_prs':
          { if (!owner || !repo) throw new Error('Owner and repo are required for get_prs');
          const prs = await octokit.rest.pulls.list({
            owner,
            repo,
            state: 'open',
            per_page: limit,
          });
          const getPrsResult = {
            success: true,
            action,
            data: prs.data.map(pr => ({
              number: pr.number,
              title: pr.title,
              body: pr.body?.substring(0, 500),
              state: pr.state,
              user: pr.user?.login,
              created_at: pr.created_at,
              base: pr.base.ref,
              head: pr.head.ref,
            })),
          };
          console.log('[✅ Tool] github get_prs completed', getPrsResult);
          return getPrsResult; }

        case 'get_commits':
          { if (!owner || !repo) throw new Error('Owner and repo are required for get_commits');
          const commits = await octokit.rest.repos.listCommits({
            owner,
            repo,
            sha: branch,
            per_page: limit,
          });
          const getCommitsResult = {
            success: true,
            action,
            data: commits.data.map(commit => ({
              sha: commit.sha.substring(0, 7),
              message: commit.commit.message,
              author: commit.commit.author?.name,
              date: commit.commit.author?.date,
              url: commit.html_url,
            })),
          };
          console.log('[✅ Tool] github get_commits completed', getCommitsResult);
          return getCommitsResult; }

        case 'get_releases':
          { if (!owner || !repo) throw new Error('Owner and repo are required for get_releases');
          const releases = await octokit.rest.repos.listReleases({
            owner,
            repo,
            per_page: limit,
          });
          const getReleasesResult = {
            success: true,
            action,
            data: releases.data.map(release => ({
              tag_name: release.tag_name,
              name: release.name,
              body: release.body?.substring(0, 500),
              published_at: release.published_at,
              prerelease: release.prerelease,
              draft: release.draft,
            })),
          };
          console.log('[✅ Tool] github get_releases completed', getReleasesResult);
          return getReleasesResult; }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      console.error('[❌ Tool] github failed', error);
      return {
        success: false,
        error: `GitHub operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        action,
      };
    }
  }
});

/**
 * Git Tool - Local git operations using isomorphic-git
 */
export const gitTool = createTool({
  name: 'git',
  description: 'Perform local git operations like clone, status, log, diff, and file operations',
  parameters: z.object({
    action: z.enum(['clone', 'status', 'log', 'diff', 'add', 'commit', 'push', 'pull', 'branch', 'checkout', 'list_files']).describe('Git action to perform'),
    repo_url: z.string().optional().describe('Repository URL (for clone)'),
    local_path: z.string().optional().describe('Local repository path'),
    message: z.string().optional().describe('Commit message (for commit)'),
    branch: z.string().optional().describe('Branch name'),
    file_path: z.string().optional().describe('File path (for add, diff)'),
    limit: z.number().min(1).max(100).optional().default(10).describe('Maximum number of results'),
  }),
  execute: async ({ action, repo_url, local_path = './temp-repo', message, branch, file_path, limit = 10 }: {
    action: 'clone' | 'status' | 'log' | 'diff' | 'add' | 'commit' | 'push' | 'pull' | 'branch' | 'checkout' | 'list_files';
    repo_url?: string;
    local_path?: string;
    message?: string;
    branch?: string;
    file_path?: string;
    limit?: number;
  }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
    console.log('[🔧 Tool] git started', { action, repo_url, local_path, message, branch, file_path, limit });
    try {
      const fullPath = path.resolve(local_path);
      switch (action) {
        case 'clone':
          { if (!repo_url) throw new Error('Repository URL is required for clone');
          await fs.ensureDir(fullPath);
          await git.clone({
            fs,
            http,
            dir: fullPath,
            url: repo_url,
            depth: 1, // Shallow clone for efficiency
          });
          const cloneResult = {
            success: true,
            action,
            message: `Repository cloned to ${fullPath}`,
            local_path: fullPath,
          };
          console.log('[✅ Tool] git clone completed', cloneResult);
          return cloneResult; }

        case 'status':
          { const status = await git.statusMatrix({
            fs,
            dir: fullPath,
          });
          const statusFiles = status.map(([filepath, head, workdir, stage]) => ({
            filepath,
            status: head === 1 && workdir === 1 && stage === 1 ? 'unmodified' :
                   head === 0 && workdir === 1 && stage === 1 ? 'added' :
                   head === 1 && workdir === 0 && stage === 0 ? 'deleted' :
                   head === 1 && workdir === 1 && stage === 0 ? 'modified' : 'unknown'
          })).filter(f => f.status !== 'unmodified').slice(0, limit);
          const statusResult = {
            success: true,
            action,
            data: statusFiles,
          };
          console.log('[✅ Tool] git status completed', statusResult);
          return statusResult; }

        case 'log':
          { const commits = await git.log({
            fs,
            dir: fullPath,
            depth: limit,
          });
          const logResult = {
            success: true,
            action,
            data: commits.map(commit => ({
              oid: commit.oid.substring(0, 7),
              message: commit.commit.message,
              author: commit.commit.author.name,
              email: commit.commit.author.email,
              date: new Date(commit.commit.author.timestamp * 1000).toISOString(),
            })),
          };
          console.log('[✅ Tool] git log completed', logResult);
          return logResult; }

        case 'branch':
          { const branches = await git.listBranches({
            fs,
            dir: fullPath,
          });
          const branchResult = {
            success: true,
            action,
            data: branches,
          };
          console.log('[✅ Tool] git branch completed', branchResult);
          return branchResult; }

        case 'list_files':
          { const files = await git.listFiles({
            fs,
            dir: fullPath,
          });
          const listFilesResult = {
            success: true,
            action,
            data: files.slice(0, limit),
          };
          console.log('[✅ Tool] git list_files completed', listFilesResult);
          return listFilesResult; }

        case 'add':
          { if (!file_path) throw new Error('File path is required for add');
          await git.add({
            fs,
            dir: fullPath,
            filepath: file_path,
          });
          const addResult = {
            success: true,
            action,
            message: `Added ${file_path} to staging`,
          };
          console.log('[✅ Tool] git add completed', addResult);
          return addResult; }

        case 'commit':
          { if (!message) throw new Error('Commit message is required for commit');
          const commitOid = await git.commit({
            fs,
            dir: fullPath,
            message,
            author: {
              name: 'VoltAgent',
              email: 'voltagent@example.com',
            },
          });
          const commitResult = {
            success: true,
            action,
            commit_id: commitOid,
            message: `Committed with message: ${message}`,
          };
          console.log('[✅ Tool] git commit completed', commitResult);
          return commitResult; }

        default:
          throw new Error(`Action ${action} not implemented yet`);
      }
    } catch (error) {
      console.error('[❌ Tool] git failed', error);
      return {
        success: false,
        error: `Git operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        action,
      };
    }
  }
});

// Generated on 2025-05-27
