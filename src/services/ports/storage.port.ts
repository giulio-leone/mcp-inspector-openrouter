/**
 * Storage port — abstract interface for key-value persistence.
 * Implementations: LocalStorageAdapter, ChromeStorageAdapter (Phase 3)
 */

/** Abstract storage interface (hexagonal port) */
export interface IStorage {
  /** Retrieve a value by key, or null if not found */
  get<T>(key: string): Promise<T | null>;

  /** Store a value by key */
  set<T>(key: string, value: T): Promise<void>;

  /** Remove a value by key */
  remove(key: string): Promise<void>;
}
