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
    const messagesHtml = this.createTable(this.messagesDetails.messages)
    const deadLetterHtml = this.createTable(this.messagesDetails.deadletter)

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Messages</title>
          <style>
              body {
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
                font-family: var(--vscode-font-family);
                font-weight: var(--vscode-font-weight);
                font-size: var(--vscode-font-size);
              }
              .labelgroup {
                color: var(--vscode-editor-foreground);
              }
              .tabs {
                display: flex;
                flex-direction: column;
                width: 100%;
                height: 100%;
              }
              .label {
                display: inline-block;
                padding: 10px 30px;
                cursor: pointer;
                font-weight: bold;
                font-size: 16px;
                transition: background 0.1s, color 0.1s;
                border-color: var(--vscode-tab-border);
                background: var(--vscode-tab-inactiveBackground);
                color: var(--vscode-tab-inactiveForeground);
                border: 1px solid;
                border-color: var(--vscode-tab-border);
              }
              .label:hover {
                border-color: var(--vscode-tab-hoverBorder);
                background: var(--vscode-tab-hoverBackground);
                color: var(--vscode-tab-hoverForeground);
              }
              .label.active {
                border-color: var(--vscode-tab-activeBorder);
                background: var(--vscode-tab-activeBackground);
                color: var(--vscode-tab-activeForeground);
              }

              .panel {
                width: 100%;
                display: none;
              }

              .panel.active {
                display: block;
              }

              .table {
                margin: 0;
                width: 100%;
                display: table;
              }

              .row {
                display: table-row;
                background: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                border: 1px solid #fff;
                user-select: none;

                &:hover:not(.header) {
                  background: var(--vscode-list-hoverBackground);
                }

                &:nth-of-type(odd){
                  background: #272727
                }

                &:nth-of-type(odd):hover {
                  background: var(--vscode-list-hoverBackground);
                }

                &.header {
                  color: var(--vscode-editor-foreground);
                  background: var(--vscode-editor-background);
                }
              }
              .cell {
                padding: 6px 12px;
                display: table-cell;
              }
          </style>
      </head>
      <body>
          <div class="tabs">
            <div class="labelgroup">
              <button class="label active" id="tab-1" onclick="openTab('tab-1', 'messages-panel')">Messages</button>
              <button class="label" id="tab-2" onclick="openTab('tab-2', 'deadletter-panel')">Deadletter</button>
            </div>
            
            <div class="panel active" id="messages-panel">
              ${messagesHtml}
            </div>

            <div class="panel" id="deadletter-panel">
              ${deadLetterHtml}
            </div>
          </div>

          <script>
              function openTab(btn, tabName) {
                  // deactivate all panels
                  const panels = document.getElementsByClassName("panel");
                  for (i = 0; i < panels.length; i++) {
                      panels[i].className = panels[i].className.replace(" active", "");
                  }

                  // deactivate all tabs
                  const tabButtons = document.getElementsByClassName("label");
                  for (i = 0; i < tabButtons.length; i++) {
                      tabButtons[i].className = tabButtons[i].className.replace(" active", "");
                  }
                  
                  document.getElementById(tabName).className += " active";
                  document.getElementById(btn).className += " active";
              }
          </script>
      </body>
      </html>
    `
  }

  private createTable(messages: ServiceBusReceivedMessage[]): string {
    const rows = messages.map(m =>
      `<div class="row">
          <div class="cell">${m.messageId}</div>
          <div class="cell">${JSON.stringify(m.body)}</div>
          <div class="cell">${m.enqueuedTimeUtc?.toISOString()}</div>
          <div class="cell">${m.scheduledEnqueueTimeUtc?.toISOString()}</div>
          <div class="cell">${m.deliveryCount}</div>
        </div>`,
    )

    return `<div class="table">
        <div class="row header">
          <div class="cell">MessageId</div>
          <div class="cell">Body</div>
          <div class="cell">EnqueuedTimeUtc</div>
          <div class="cell">Scheduled</div>
          <div class="cell">DeliveryCount</div>
        </div>
        ${rows.join('')}
      </div>`
  }
}
