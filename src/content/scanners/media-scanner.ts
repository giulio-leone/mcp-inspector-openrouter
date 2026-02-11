/**
 * Media Scanner — discovers video and audio elements.
 */

import type { Tool } from '../../types';
import { BaseScanner } from './base-scanner';

export class MediaScanner extends BaseScanner {
  readonly category = 'media' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];

    // ── Videos ──
    const videos = (root as ParentNode).querySelectorAll('video');
    for (const video of videos) {
      const label =
        this.getLabel(video) || video.getAttribute('aria-label') || 'video';
      const id = this.slugify(video.id || label);

      tools.push(
        this.createTool(
          `media.play-${id}`,
          `Play video: ${label}`,
          video,
          this.makeInputSchema([]),
          0.9,
          {
            title: `Play: ${label}`,
            annotations: this.makeAnnotations({ readOnly: true, idempotent: true }),
          },
        ),
      );

      tools.push(
        this.createTool(
          `media.pause-${id}`,
          `Pause video: ${label}`,
          video,
          this.makeInputSchema([]),
          0.9,
          {
            title: `Pause: ${label}`,
            annotations: this.makeAnnotations({ readOnly: true, idempotent: true }),
          },
        ),
      );

      if (video.duration) {
        tools.push(
          this.createTool(
            `media.seek-${id}`,
            `Seek video to time: ${label}`,
            video,
            this.makeInputSchema([
              { name: 'time', type: 'number', description: 'Time in seconds' },
            ]),
            0.85,
            {
              title: `Seek: ${label}`,
              annotations: this.makeAnnotations({ readOnly: true, idempotent: true }),
            },
          ),
        );
      }
    }

    // ── Audio ──
    const audios = (root as ParentNode).querySelectorAll('audio');
    for (const audio of audios) {
      const label = this.getLabel(audio) || 'audio';
      const id = this.slugify(audio.id || label);
      tools.push(
        this.createTool(
          `media.play-audio-${id}`,
          `Play audio: ${label}`,
          audio,
          this.makeInputSchema([]),
          0.9,
          {
            title: `Play Audio: ${label}`,
            annotations: this.makeAnnotations({ readOnly: true, idempotent: true }),
          },
        ),
      );
    }

    return tools;
  }
}
