/**
 * File Upload Scanner — discovers file inputs and drag-drop zones.
 * Does NOT use overbroad aria-label selectors (foto/photo/image)
 * which falsely matched profile images and photo buttons.
 */

import type { Tool } from '../../types';
import { BaseScanner } from './base-scanner';

export class FileUploadScanner extends BaseScanner {
  readonly category = 'file-upload' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];

    // ── Standard file inputs (unambiguous) ──
    const fileInputs = (root as ParentNode).querySelectorAll('input[type="file"]');
    for (const inp of fileInputs) {
      if (tools.length >= this.maxTools) break;
      if (this.isClaimed(inp)) continue;

      const inputEl = inp as HTMLInputElement;
      const label = this.getLabel(inp) || inputEl.accept || 'file';
      const slug = this.slugify(label);
      const accept = inputEl.accept || '*/*';

      this.claim(inp);
      tools.push(
        this.createTool(
          `upload.file-${slug}`,
          `Upload file (${accept}): ${label}`,
          inp,
          this.makeInputSchema([
            {
              name: 'file_path',
              type: 'string',
              description: `Path to file to upload (accepts: ${accept})`,
              required: true,
            },
          ]),
          0.95,
          {
            title: `Upload: ${label}`,
            annotations: this.makeAnnotations({ destructive: true, idempotent: false }),
          },
        ),
      );
    }

    // ── Drop zones — only explicit drop-zone/upload patterns ──
    const dropZones = (root as ParentNode).querySelectorAll(
      '[class*="drop-zone" i], [class*="dropzone" i], [class*="upload-area" i], ' +
        '[data-testid*="upload" i], [data-testid*="dropzone" i]',
    );
    for (const zone of dropZones) {
      if (tools.length >= this.maxTools) break;
      if ((zone as HTMLInputElement).tagName === 'INPUT' && (zone as HTMLInputElement).type === 'file')
        continue;
      if (this.isClaimed(zone)) continue;
      if (!this.isVisible(zone)) continue;

      const label = this.getLabel(zone) || 'upload area';
      // Skip garbage labels
      if (label.length > 60 || label.includes('\n')) continue;
      const slug = this.slugify(label);

      const hiddenInput =
        zone.querySelector('input[type="file"]') ||
        zone.parentElement?.querySelector('input[type="file"]');

      this.claim(zone);
      tools.push(
        this.createTool(
          `upload.drop-${slug}`,
          `Upload via drop zone: ${label}`,
          (hiddenInput as Element) || zone,
          this.makeInputSchema([
            {
              name: 'file_path',
              type: 'string',
              description: 'Path to file to upload',
              required: true,
            },
          ]),
          0.7,
          {
            title: `Upload: ${label}`,
            annotations: this.makeAnnotations({ destructive: true, idempotent: false }),
          },
        ),
      );
    }

    return tools;
  }
}
