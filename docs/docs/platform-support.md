---
sidebar_position: 5
---

# Platform Support

OneGenUI Deep Agents provides built-in support for various web platforms through specialized scanners and media players.

## Media Players

| Platform | Player Class | Features |
|----------|-------------|----------|
| **YouTube** | `YouTubePlayer` | Play, pause, seek, volume, playback rate, fullscreen |
| **Vimeo** | `VimeoPlayer` | Play, pause, seek, volume, playback rate |
| **Twitch** | `TwitchPlayer` | Play, pause, seek, volume, quality |
| **Dailymotion** | `DailymotionPlayer` | Play, pause, seek, volume |
| **Spotify** | Embed detection | Play/pause via embed API |
| **SoundCloud** | Embed detection | Play/pause via embed API |
| **Bandcamp** | Embed detection | Play/pause detection |
| **HTML5 Video/Audio** | Native `<video>`/`<audio>` | Full media API support |
| **Custom Players** | VideoJS, Plyr, JWPlayer, MediaElement | Framework-specific controls |

### LiveState Awareness

The AI knows the current playback state before acting:
- Won't try to play an already-playing video
- Uses `seek(0) + play` to restart instead of toggling
- Adjusts commands based on `paused`, `currentTime`, `duration`

## Social Media

| Platform | Supported Actions |
|----------|------------------|
| **Instagram** | Like, comment, share, follow, save, message |
| **Twitter/X** | Like, retweet, reply, follow, bookmark (via `data-testid`) |
| **Facebook** | Like, comment, share, follow |
| **LinkedIn** | Like, comment, share, connect |
| **TikTok** | Like, comment, share, follow |
| **Reddit** | Upvote, downvote, comment, save, join |
| **Threads** | Like, comment, share, follow |

## E-commerce (Generic)

Works with any platform using standard patterns:

| Feature | Detection Method |
|---------|-----------------|
| **Add to cart** | Button text, `[data-action="add-to-cart"]`, schema.org Product |
| **Quantity** | Input near cart buttons, `[name*="quantity"]` |
| **Product info** | Schema.org `itemtype="Product"`, Open Graph meta |
| **Price** | `[class*="price"]`, schema.org offers |

## Form Recognition

The form scanner detects fields using a fallback chain:

1. `name` attribute
2. `id` attribute
3. `aria-label`
4. `placeholder`
5. `data-testid`
6. Auto-generated `field-N` index

This ensures modern SPAs (React, Vue, Angular) that skip `name`/`id` attributes are still fully supported.

## Navigation & Overlays

| Feature | Detection |
|---------|-----------|
| **Cookie banners** | Class/ID patterns: `cookie`, `consent`, `gdpr` |
| **Popups/modals** | `[class*="overlay"]`, `[role="dialog"]`, `[aria-modal]` |
| **Loading spinners** | `[class*="spinner"]`, `[class*="skeleton"]`, `[aria-busy]` |
| **Login forms** | `[type="password"]`, OAuth buttons |
| **Scroll position** | `scrollY / scrollHeight` percentage |
