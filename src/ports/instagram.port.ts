/**
 * IInstagramPort — contract for Instagram platform interactions.
 * Provides methods for stories, feed, reels, DMs, profile, and navigation.
 */

export type InstagramSection = 'feed' | 'stories' | 'reels' | 'profile' | 'explore' | 'dm' | 'unknown';

export interface IInstagramPort {
  // Stories
  viewStory(username: string): Promise<void>;
  nextStory(): Promise<void>;
  previousStory(): Promise<void>;
  replyToStory(message: string): Promise<void>;

  // Feed
  likePost(): Promise<void>;
  unlikePost(): Promise<void>;
  savePost(): Promise<void>;
  unsavePost(): Promise<void>;
  commentOnPost(text: string): Promise<void>;
  sharePost(username: string): Promise<void>;
  scrollFeed(direction: 'up' | 'down'): Promise<void>;

  // Reels
  likeReel(): Promise<void>;
  commentOnReel(text: string): Promise<void>;
  nextReel(): Promise<void>;
  shareReel(username: string): Promise<void>;

  // DM
  sendDM(username: string, message: string): Promise<void>;
  openConversation(username: string): Promise<void>;

  // Profile
  followUser(username: string): Promise<void>;
  unfollowUser(username: string): Promise<void>;

  // Navigation
  goToExplore(): Promise<void>;
  goToReels(): Promise<void>;
  goToProfile(username?: string): Promise<void>;
  searchUser(query: string): Promise<void>;

  // State detection
  isOnInstagram(): boolean;
  getCurrentSection(): InstagramSection;
}
