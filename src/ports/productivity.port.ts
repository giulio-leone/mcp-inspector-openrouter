/**
 * IProductivityPort — contract for productivity platform interactions.
 * Covers Notion, GitHub, Google Docs, and generic productivity tools.
 */

export type ProductivityPlatform = 'notion' | 'github' | 'google-docs' | 'trello' | 'unknown';

export interface INotionPort {
  isOnNotion(): boolean;

  // Pages
  createPage(title: string, parentId?: string): Promise<void>;
  duplicatePage(): Promise<void>;
  deletePage(): Promise<void>;

  // Blocks
  addBlock(type: 'text' | 'heading' | 'todo' | 'bullet' | 'code', content: string): Promise<void>;
  toggleTodo(): Promise<void>;

  // Database
  addDatabaseRow(): Promise<void>;
  filterDatabase(property: string, value: string): Promise<void>;
  sortDatabase(property: string, direction: 'asc' | 'desc'): Promise<void>;

  // Navigation
  searchPages(query: string): Promise<void>;
  goToPage(title: string): Promise<void>;
  toggleSidebar(): Promise<void>;
}

export interface IGitHubPort {
  isOnGitHub(): boolean;

  // Repository
  starRepo(): Promise<void>;
  unstarRepo(): Promise<void>;
  forkRepo(): Promise<void>;

  // Issues
  createIssue(title: string, body?: string): Promise<void>;
  closeIssue(): Promise<void>;
  reopenIssue(): Promise<void>;
  addComment(text: string): Promise<void>;
  addLabel(label: string): Promise<void>;

  // PRs
  approvePR(): Promise<void>;
  requestChanges(comment: string): Promise<void>;
  mergePR(): Promise<void>;

  // Navigation
  goToIssues(): Promise<void>;
  goToPullRequests(): Promise<void>;
  goToActions(): Promise<void>;
  searchRepo(query: string): Promise<void>;

  // Code
  toggleFileView(): Promise<void>;
  copyPermalink(): Promise<void>;
}

export interface IProductivityPort {
  detectPlatform(): ProductivityPlatform;
  isProductivityApp(): boolean;
  notion: INotionPort;
  github: IGitHubPort;
}
