import * as fs from 'fs'
import vscode from 'vscode'
import { ServiceBusMessageDetails } from '../interfaces/ServiceBusInfo'
import { ServiceBusReceivedMessage } from '@azure/service-bus'
import { SbDependencyBase } from '../models/SbDependencyBase'

let extensionUri: vscode.Uri | undefined
let templateCache: string | undefined

export const initMessagesWebView = (uri: vscode.Uri): void => {
  extensionUri = uri
  templateCache = undefined
}

export type MessageActionHandlers = {
  onDelete?: (sequenceNumber: string, fromDeadletter: boolean, messageId: string) => Promise<void>
  onRequeueDl?: (sequenceNumber: string, messageId: string) => Promise<void>
}

type WebviewInboundMessage =
  | { command: 'delete', kind: 'msg' | 'dl', sequenceNumber: string, messageId: string }
  | { command: 'requeue', sequenceNumber: string, messageId: string }

export class MessagesWebView {
  public panel: vscode.WebviewPanel | undefined

  constructor(
    private dependency: SbDependencyBase,
    private messagesDetails: ServiceBusMessageDetails,
    private handlers: MessageActionHandlers = {},
  ) {}

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
    if (!extensionUri) {
      throw new Error('MessagesWebView is not initialised. Call initMessagesWebView from activate() first.')
    }
    this.panel = vscode.window.createWebviewPanel(
      'messages',
      this.dependency.label,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media', 'webview')],
      },
    )

    this.panel.webview.onDidReceiveMessage(async (msg: WebviewInboundMessage) => {
      if (msg.command === 'delete' && this.handlers.onDelete) {
        await this.handlers.onDelete(msg.sequenceNumber, msg.kind === 'dl', msg.messageId)
      }
      else if (msg.command === 'requeue' && this.handlers.onRequeueDl) {
        await this.handlers.onRequeueDl(msg.sequenceNumber, msg.messageId)
      }
    })

    this.panel.webview.html = this.getWebviewContent()
  }

  private getWebviewContent(): string {
    if (!this.panel || !extensionUri) {
      return ''
    }
    const webview = this.panel.webview
    const mediaRoot = vscode.Uri.joinPath(extensionUri, 'media', 'webview')
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'messages.css'))
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'messages.js'))
    const template = loadTemplate(vscode.Uri.joinPath(mediaRoot, 'messages.html').fsPath)

    return renderTemplate(template, {
      cspSource: webview.cspSource,
      nonce: generateNonce(),
      stylesUri: stylesUri.toString(),
      scriptUri: scriptUri.toString(),
      messagesCount: String(this.messagesDetails.messages.length),
      dlCount: String(this.messagesDetails.deadletter.length),
      messagesHtml: createTable(this.messagesDetails.messages, 'msg'),
      deadletterHtml: createTable(this.messagesDetails.deadletter, 'dl'),
    })
  }
}

const loadTemplate = (path: string): string => {
  if (templateCache === undefined) {
    templateCache = fs.readFileSync(path, 'utf8')
  }
  return templateCache
}

const renderTemplate = (template: string, values: Record<string, string>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '')

const createTable = (messages: ServiceBusReceivedMessage[], prefix: 'msg' | 'dl'): string => {
  if (messages.length === 0) {
    return `<div class="empty">No messages.</div>`
  }

  const rows = messages.map((m, i) => {
    const { pretty, preview } = renderBody(m.body)
    const detailsId = `${prefix}-body-${i}`
    const idText = m.messageId?.toString() ?? ''
    const seq = m.sequenceNumber !== undefined ? String(m.sequenceNumber) : ''
    const canAct = seq !== ''
    const idAttr = escapeHtml(idText)
    const seqAttr = escapeHtml(seq)
    const actionButtons = canAct
      ? (prefix === 'dl'
          ? `<button class="action-btn" data-action="requeue" data-seq="${seqAttr}" data-id="${idAttr}" title="Requeue this message to the parent">Requeue</button>
             <button class="action-btn danger" data-action="delete" data-kind="dl" data-seq="${seqAttr}" data-id="${idAttr}" title="Delete this deadletter message">Delete</button>`
          : `<button class="action-btn danger" data-action="delete" data-kind="msg" data-seq="${seqAttr}" data-id="${idAttr}" title="Delete this message">Delete</button>`)
      : ''
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
        <td class="actions">${actionButtons}</td>
      </tr>`
  })

  return `<table>
      <colgroup>
        <col class="c-id">
        <col class="c-body">
        <col class="c-enq">
        <col class="c-sched">
        <col class="c-dc">
        <col class="c-actions">
      </colgroup>
      <thead>
        <tr>
          <th>MessageId</th>
          <th>Body</th>
          <th>Enqueued (UTC)</th>
          <th>Scheduled</th>
          <th>Delivery</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>`
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
