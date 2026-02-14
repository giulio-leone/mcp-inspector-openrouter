/**
 * <security-dialog> — Light DOM Lit component for security confirmation
 * before executing tier 1/2 tool calls.
 */
import { html, LitElement, nothing } from 'lit';

export class SecurityDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    toolName: { type: String, attribute: 'tool-name' },
    action: { type: String },
    securityTier: { type: Number, attribute: 'security-tier' },
    details: { type: String },
  };

  declare open: boolean;
  declare toolName: string;
  declare action: string;
  declare securityTier: number;
  declare details: string;

  constructor() {
    super();
    this.open = false;
    this.toolName = '';
    this.action = '';
    this.securityTier = 1;
    this.details = '';
  }

  /** Light DOM — inherits existing sidebar CSS */
  override createRenderRoot(): this {
    return this;
  }

  /**
   * Open the dialog with the given configuration.
   */
  show(config: {
    toolName: string;
    action?: string;
    securityTier?: number;
    details?: string;
  }): void {
    this.toolName = config.toolName;
    this.action = config.action ?? '';
    this.securityTier = config.securityTier ?? 1;
    this.details = config.details ?? '';
    this.open = true;
    // Focus the native dialog after render
    this.updateComplete.then(() => {
      const dialog = this.querySelector('dialog') as HTMLDialogElement | null;
      if (dialog && !dialog.open) dialog.showModal();
    });
  }

  private _approve(): void {
    this.dispatchEvent(
      new CustomEvent('security-approve', {
        bubbles: true,
        composed: true,
        detail: { toolName: this.toolName, securityTier: this.securityTier },
      }),
    );
    this._close();
  }

  private _deny(): void {
    this.dispatchEvent(
      new CustomEvent('security-deny', {
        bubbles: true,
        composed: true,
        detail: { toolName: this.toolName, securityTier: this.securityTier },
      }),
    );
    this._close();
  }

  private _close(): void {
    this.open = false;
    const dialog = this.querySelector('dialog') as HTMLDialogElement | null;
    if (dialog?.open) dialog.close();
  }

  private _handleCancel(e: Event): void {
    e.preventDefault();
    this._deny();
  }

  protected override render(): unknown {
    if (!this.open) return nothing;

    const tierLabel = this.securityTier === 2 ? 'mutation' : 'navigation';
    const description =
      this.details ||
      `This tool performs a ${tierLabel} action: ${this.toolName}. Are you sure you want to execute it?`;

    return html`
      <dialog class="security-dialog" @cancel=${this._handleCancel}>
        <div class="dialog-body">
          <p class="dialog-title">⚠️ <span class="security-dialog-tool-name">${this.toolName}</span></p>
          <p class="dialog-desc">${description}</p>
          <div class="dialog-actions">
            <button class="btn-cancel" @click=${this._deny}>Cancel</button>
            <button class="btn-danger" @click=${this._approve}>Execute</button>
          </div>
        </div>
      </dialog>
    `;
  }
}

customElements.define('security-dialog', SecurityDialog);
