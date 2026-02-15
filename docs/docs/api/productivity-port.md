---
sidebar_position: 11
---

# IProductivityPort

Composite port for productivity platform interactions.

## Interface

```typescript
type ProductivityPlatform = 'notion' | 'github' | 'google-docs' | 'trello' | 'slack' | 'unknown';

interface IProductivityPort {
  detectPlatform(): ProductivityPlatform;
  isProductivityApp(): boolean;
  notion: INotionPort;
  github: IGitHubPort;
  googleDocs: IGoogleDocsPort;
  trello: ITrelloPort;
  slack: ISlackPort;
}
```

## Sub-Ports

### INotionPort
Pages (create, duplicate, delete), blocks (add text/heading/todo/code), database (add row, filter, sort), navigation (search, go to page, toggle sidebar).

### IGitHubPort
Repository (star, fork), issues (create, close, reopen, comment, label), PRs (approve, request changes, merge), navigation, code (file view, permalink).

### IGoogleDocsPort

```typescript
interface IGoogleDocsPort {
  isOnGoogleDocs(): boolean;
  getDocTitle(): string;
  setDocTitle(title: string): Promise<void>;
  insertText(text: string): Promise<void>;
  formatBold(): Promise<void>;
  formatItalic(): Promise<void>;
  formatHeading(level: number): Promise<void>;
  insertLink(url: string): Promise<void>;
  addComment(text: string): Promise<void>;
  resolveComment(): Promise<void>;
  goToBeginning(): Promise<void>;
  goToEnd(): Promise<void>;
  findAndReplace(find: string, replace: string): Promise<void>;
  shareDoc(): Promise<void>;
  getShareLink(): string;
}
```

Document (title get/set), editing (insert text, bold, italic, heading, link), comments (add, resolve), navigation (beginning, end, find/replace), sharing (share dialog, get link).

### ITrelloPort

```typescript
interface ITrelloPort {
  isOnTrello(): boolean;
  createCard(title: string): Promise<void>;
  moveCard(listName: string): Promise<void>;
  archiveCard(): Promise<void>;
  addLabel(label: string): Promise<void>;
  addComment(text: string): Promise<void>;
  assignMember(member: string): Promise<void>;
  setDueDate(date: string): Promise<void>;
  createList(name: string): Promise<void>;
  archiveList(): Promise<void>;
  searchCards(query: string): Promise<void>;
  filterByLabel(label: string): Promise<void>;
  filterByMember(member: string): Promise<void>;
}
```

Cards (create, move, archive, label, comment, assign, due date), lists (create, archive), search & filter (search cards, filter by label/member).

### ISlackPort

```typescript
interface ISlackPort {
  isOnSlack(): boolean;
  sendMessage(text: string): Promise<void>;
  replyInThread(text: string): Promise<void>;
  addReaction(emoji: string): Promise<void>;
  editLastMessage(): Promise<void>;
  deleteLastMessage(): Promise<void>;
  switchChannel(channel: string): Promise<void>;
  searchMessages(query: string): Promise<void>;
  createChannel(name: string): Promise<void>;
  setStatus(status: string): Promise<void>;
  setAvailability(available: boolean): Promise<void>;
  uploadFile(): Promise<void>;
  goToThreads(): Promise<void>;
  goToDMs(): Promise<void>;
  goToMentions(): Promise<void>;
}
```

Messages (send, reply in thread, react, edit last, delete last), channels (switch, search, create), status (set status, set availability), files (upload), navigation (threads, DMs, mentions).

## Adapters

Each platform has a dedicated DOM-based adapter:
- `NotionAdapter` — Notion keyboard shortcuts + DOM
- `GitHubAdapter` — GitHub-specific selectors
- `GoogleDocsAdapter` — Google Docs iframe + menu selectors
- `TrelloAdapter` — Trello board/card DOM selectors
- `SlackAdapter` — Slack webapp DOM selectors
