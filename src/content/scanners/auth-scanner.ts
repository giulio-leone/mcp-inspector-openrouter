/**
 * Auth Scanner — discovers login forms (password inputs) and logout links/buttons.
 */

import type { Tool, ToolParameter } from '../../types';
import { BaseScanner } from './base-scanner';

export class AuthScanner extends BaseScanner {
  readonly category = 'auth' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];

    // ── Login forms (detect via password input) ──
    const passwordInputs = (root as ParentNode).querySelectorAll(
      'input[type="password"]',
    );
    for (const pwd of passwordInputs) {
      const form = (pwd as Element).closest('form');
      if (!form || form.getAttribute('toolname')) continue;

      const emailInput = form.querySelector(
        'input[type="email"], input[name*="email" i], input[name*="user" i], input[name*="login" i]',
      );

      const fields: ToolParameter[] = [];
      if (emailInput) {
        fields.push({
          name: (emailInput as HTMLInputElement).name || 'email',
          type: 'string',
          description: 'Email or username',
          required: true,
        });
      }
      fields.push({
        name: (pwd as HTMLInputElement).name || 'password',
        type: 'string',
        description: 'Password',
        required: true,
      });

      tools.push(
        this.createTool(
          'auth.login',
          'Sign in / Log in',
          form,
          this.makeInputSchema(fields),
          0.95,
          {
            title: 'Sign In',
            annotations: this.makeAnnotations({ destructive: true, idempotent: false }),
          },
        ),
      );
    }

    // ── Logout links/buttons ──
    const logoutEls = (root as ParentNode).querySelectorAll(
      'a[href*="logout" i], a[href*="sign-out" i], a[href*="signout" i], ' +
        'button[class*="logout" i], [data-action="logout"]',
    );
    for (const el of logoutEls) {
      tools.push(
        this.createTool(
          'auth.logout',
          'Sign out / Log out',
          el,
          this.makeInputSchema([]),
          0.9,
          {
            title: 'Sign Out',
            annotations: this.makeAnnotations({ destructive: true, idempotent: true }),
          },
        ),
      );
      break; // Only one logout tool per page
    }

    return tools;
  }
}
