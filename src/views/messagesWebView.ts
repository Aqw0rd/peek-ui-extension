import vscode from 'vscode'
import { ServiceBusMessageDetails } from '../interfaces/ServiceBusInfo'
import { ServiceBusReceivedMessage } from '@azure/service-bus'
import { SbDependencyBase } from '../models/SbDependencyBase'

export class MessagesWebView {
  public panel: vscode.WebviewPanel | undefined

  constructor(private dependency: SbDependencyBase, private messagesDetails: ServiceBusMessageDetails) {}

  public reveal() {
    if (this.panel?.visible === false) {
      this.panel.reveal()
    }
  }

  public update(messagesDetails: ServiceBusMessageDetails) {
    if (this.panel?.visible) {
      this.messagesDetails = messagesDetails
      this.panel.webview.html = this.getWebviewContent()
    }
  }

  public show() {
    this.panel = vscode.window.createWebviewPanel(
      'messages',
      `${this.dependency.label}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
      },
    )

    this.panel.webview.html = this.getWebviewContent()
  }

  private getWebviewContent(): string {
    const nonce = generateNonce()
    const cspSource = this.panel?.webview.cspSource ?? ''
    const messagesHtml = this.createTable(this.messagesDetails.messages, 'msg')
    const deadLetterHtml = this.createTable(this.messagesDetails.deadletter, 'dl')
    const messagesCount = this.messagesDetails.messages.length
    const dlCount = this.messagesDetails.deadletter.length

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Messages</title>
          <style>
              :root {
                --border: var(--vscode-panel-border, var(--vscode-editorWidget-border, #444));
              }
              html, body {
                overflow-x: hidden;
                max-width: 100%;
              }
              body {
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
                font-family: var(--vscode-font-family);
                font-weight: var(--vscode-font-weight);
                font-size: var(--vscode-font-size);
                margin: 0;
                padding: 0;
              }

              .tabs {
                display: flex;
                flex-direction: column;
                width: 100%;
                min-height: 100vh;
              }
              .labelgroup {
                display: flex;
                border-bottom: 1px solid var(--border);
                background: var(--vscode-editorGroupHeader-tabsBackground, transparent);
              }
              .label {
                border: none;
                border-right: 1px solid var(--border);
                padding: 10px 24px;
                cursor: pointer;
                font-weight: 600;
                font-size: 13px;
                background: var(--vscode-tab-inactiveBackground);
                color: var(--vscode-tab-inactiveForeground);
                font-family: inherit;
              }
              .label:hover {
                background: var(--vscode-tab-hoverBackground);
                color: var(--vscode-tab-hoverForeground);
              }
              .label.active {
                background: var(--vscode-tab-activeBackground);
                color: var(--vscode-tab-activeForeground);
                box-shadow: inset 0 -2px 0 var(--vscode-tab-activeBorderTop, var(--vscode-focusBorder));
              }
              .badge {
                margin-left: 6px;
                padding: 0 6px;
                border-radius: 8px;
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                font-size: 11px;
                font-weight: 600;
              }

              .panel {
                width: 100%;
                display: none;
                padding: 0;
              }
              .panel.active {
                display: block;
              }
              .empty {
                padding: 24px;
                color: var(--vscode-descriptionForeground);
                font-style: italic;
              }

              table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed;
              }
              thead th {
                text-align: left;
                padding: 8px 12px;
                background: var(--vscode-editor-background);
                border-bottom: 1px solid var(--border);
                white-space: nowrap;
                font-weight: 600;
                position: sticky;
                top: 0;
                z-index: 1;
              }
              tbody tr {
                border-bottom: 1px solid var(--border);
              }
              tbody tr:hover {
                background: var(--vscode-list-hoverBackground);
              }
              tbody td {
                padding: 8px 12px;
                vertical-align: top;
                overflow-wrap: anywhere;
                word-break: break-word;
                max-width: 0; /* forces fixed layout to respect col widths */
                overflow: hidden;
              }
              tbody td > * {
                max-width: 100%;
                box-sizing: border-box;
              }
              td.mono, th.mono {
                font-family: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
                font-size: var(--vscode-editor-font-size, 12px);
              }
              td.num {
                text-align: right;
                font-variant-numeric: tabular-nums;
              }
              td.truncate {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }

              /* proportional column widths.
                 Body ('c-body') has no explicit width and absorbs the remainder. */
              col.c-id    { width: 28%; }
              col.c-enq   { width: 15%; }
              col.c-sched { width: 15%; }
              col.c-dc    { width: 72px; }

              td.id {
                font-family: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
                font-size: var(--vscode-editor-font-size, 12px);
                word-break: break-all;
                overflow-wrap: anywhere;
                user-select: all; /* one click + Ctrl+C copies the whole id */
                cursor: text;
              }

              details.body {
                margin: 0;
              }
              details.body > summary {
                cursor: pointer;
                list-style: none;
                padding: 4px 0;
                color: var(--vscode-descriptionForeground);
                font-size: 12px;
                user-select: none;
              }
              details.body > summary::-webkit-details-marker { display: none; }
              details.body > summary::before {
                content: '▸ ';
                display: inline-block;
                width: 1em;
              }
              details.body[open] > summary::before {
                content: '▾ ';
              }
              details.body > summary .preview {
                color: var(--vscode-editor-foreground);
                font-family: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
                font-size: var(--vscode-editor-font-size, 12px);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                display: inline-block;
                max-width: calc(100% - 2em);
                vertical-align: bottom;
              }
              pre.body {
                margin: 6px 0 0 0;
                padding: 10px 12px;
                background: var(--vscode-textCodeBlock-background, var(--vscode-editorWidget-background, rgba(127,127,127,0.1)));
                border: 1px solid var(--border);
                border-radius: 4px;
                overflow: auto;
                max-height: 400px;
                max-width: 100%;
                box-sizing: border-box;
                font-family: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
                font-size: var(--vscode-editor-font-size, 12px);
                white-space: pre;
              }
          </style>
      </head>
      <body>
          <div class="tabs">
            <div class="labelgroup" role="tablist">
              <button class="label active" data-tab-btn="tab-msg" data-tab-panel="messages-panel">
                Messages<span class="badge">${messagesCount}</span>
              </button>
              <button class="label" data-tab-btn="tab-dl" data-tab-panel="deadletter-panel">
                Deadletter<span class="badge">${dlCount}</span>
              </button>
            </div>

            <div class="panel active" id="messages-panel" role="tabpanel">
              ${messagesHtml}
            </div>

            <div class="panel" id="deadletter-panel" role="tabpanel">
              ${deadLetterHtml}
            </div>
          </div>

          <script nonce="${nonce}">
              function openTab(btnId, panelId) {
                  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
                  document.querySelectorAll('.label').forEach(t => t.classList.remove('active'));
                  document.getElementById(panelId).classList.add('active');
                  document.querySelector('[data-tab-btn="' + btnId + '"]').classList.add('active');
              }
              document.querySelectorAll('[data-tab-btn]').forEach(btn => {
                  btn.addEventListener('click', () => openTab(btn.dataset.tabBtn, btn.dataset.tabPanel));
              });
          </script>
      </body>
      </html>
    `
  }

  private createTable(messages: ServiceBusReceivedMessage[], prefix: string): string {
    if (messages.length === 0) {
      return `<div class="empty">No messages.</div>`
    }

    const rows = messages.map((m, i) => {
      const { pretty, preview } = renderBody(m.body)
      const detailsId = `${prefix}-body-${i}`
      const idText = m.messageId?.toString() ?? ''
      return `<tr>
          <td class="id">${escapeHtml(idText)}</td>
          <td>
            <details class="body" id="${detailsId}">
              <summary><span class="preview">${escapeHtml(preview)}</span></summary>
              <pre class="body">${escapeHtml(pretty)}</pre>
            </details>
          </td>
          <td class="mono" title="${escapeHtml(m.enqueuedTimeUtc?.toISOString() ?? '')}">${escapeHtml(formatTimestamp(m.enqueuedTimeUtc))}</td>
          <td class="mono" title="${escapeHtml(m.scheduledEnqueueTimeUtc?.toISOString() ?? '')}">${escapeHtml(formatTimestamp(m.scheduledEnqueueTimeUtc))}</td>
          <td class="num">${escapeHtml(String(m.deliveryCount ?? ''))}</td>
        </tr>`
    })

    return `<table>
        <colgroup>
          <col class="c-id">
          <col class="c-body">
          <col class="c-enq">
          <col class="c-sched">
          <col class="c-dc">
        </colgroup>
        <thead>
          <tr>
            <th>MessageId</th>
            <th>Body</th>
            <th>Enqueued (UTC)</th>
            <th>Scheduled</th>
            <th>Delivery</th>
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>`
  }
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const renderBody = (body: unknown): { pretty: string, preview: string } => {
  const raw = bodyToString(body)
  const trimmed = raw.trim()
  let pretty = raw
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      pretty = JSON.stringify(JSON.parse(trimmed), null, 2)
    }
    catch {
      pretty = raw
    }
  }
  const preview = pretty.replace(/\s+/g, ' ').trim().slice(0, 200)
  return { pretty, preview }
}

const formatTimestamp = (date: Date | undefined): string => {
  if (!date) {
    return ''
  }
  const iso = date.toISOString()
  // "2026-09-10T14:23:45.123Z" -> "2026-09-10 14:23:45"
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`
}

const bodyToString = (body: unknown): string => {
  if (body === null || body === undefined) {
    return ''
  }
  if (typeof body === 'string') {
    return body
  }
  if (Buffer.isBuffer(body)) {
    return body.toString('utf8')
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString('utf8')
  }
  try {
    return JSON.stringify(body)
  }
  catch {
    return String(body)
  }
}

const generateNonce = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return out
}
