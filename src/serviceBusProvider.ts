import * as vscode from 'vscode'
import * as service from './utils/serviceBusService'
import { mapQueueToDep, mapSubscriptionToDep, mapTopicToDep, mapUnconnectedSbToDep } from './utils/dependencyMapper'
import { SbDependencyBase } from './models/SbDependencyBase'
import { ServiceBusItem } from './models/ServiceBusItem'
import { TopicItem } from './models/TopicItem'
import { confirmDestructive, errorMessage } from './utils/ui'

export class ServiceBusProvider implements vscode.TreeDataProvider<SbDependencyBase>, vscode.Disposable {
  private _onDidChangeTreeData: vscode.EventEmitter<SbDependencyBase | undefined | void> = new vscode.EventEmitter<SbDependencyBase | undefined | void>()
  readonly onDidChangeTreeData: vscode.Event<SbDependencyBase | undefined | void> = this._onDidChangeTreeData.event

  secrets: vscode.SecretStorage

  constructor(private context: vscode.ExtensionContext) {
    this.secrets = context.secrets
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose()
  }

  refresh(item: SbDependencyBase | undefined | void): void {
    this._onDidChangeTreeData.fire(item)
  }

  async addConnection(): Promise<void> {
    const input = await vscode.window.showInputBox({
      prompt: 'Servicebus connectionstring',
      ignoreFocusOut: true,
    })
    if (!input) {
      return
    }
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Peek: adding Service Bus…',
        cancellable: false,
      },
      async (progress) => {
        try {
          progress.report({ message: 'Connecting…' })
          const sbInfo = await service.getServiceBusInfo(input)
          const existing = await this.secrets.get(sbInfo.serviceBusName)
          if (existing) {
            vscode.window.showInformationMessage(`Connection for "${sbInfo.serviceBusName}" already exists.`)
            return
          }
          progress.report({ message: `Saving "${sbInfo.serviceBusName}"…` })
          await this.secrets.store(sbInfo.serviceBusName, sbInfo.connectionString)
          this.refresh()
          vscode.window.showInformationMessage(`Added "${sbInfo.serviceBusName}".`)
        }
        catch (err) {
          vscode.window.showErrorMessage(`Failed to add connection: ${errorMessage(err)}`)
        }
      },
    )
  }

  async removeConnection(node?: ServiceBusItem): Promise<void> {
    let name = node?.label
    if (!name) {
      const keys = await this.secrets.keys()
      if (keys.length === 0) {
        vscode.window.showInformationMessage('No stored connections.')
        return
      }
      name = await vscode.window.showQuickPick(keys, { placeHolder: 'Select a connection to remove' })
      if (!name) {
        return
      }
    }
    if (!await confirmDestructive(`Remove stored connection "${name}"?`, 'Remove')) {
      return
    }
    await this.secrets.delete(name)
    this.refresh()
  }

  getTreeItem(element: SbDependencyBase): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element
  }

  async getChildren(element?: SbDependencyBase): Promise<SbDependencyBase[]> {
    if (!element) {
      const sbNames = await this.secrets.keys()
      const deps: SbDependencyBase[] = []
      for (const name of sbNames) {
        const connectionString = await this.secrets.get(name)
        if (connectionString) {
          deps.push(mapUnconnectedSbToDep(name, connectionString))
        }
      }
      vscode.commands.executeCommand('setContext', 'horgen.peek-ui:isInitialized', true)
      return deps
    }

    if (element instanceof ServiceBusItem) {
      if (element.isConnected) {
        const queues: SbDependencyBase[] = element.queues ? element.queues.map(queue => mapQueueToDep(queue, element.connectionString)) : []
        const topics: SbDependencyBase[] = element.topics ? element.topics.map(topic => mapTopicToDep(topic, element.connectionString)) : []
        return queues.concat(topics)
      }
      return []
    }

    if (element instanceof TopicItem) {
      return element.subscriptions ? element.subscriptions.map(sub => mapSubscriptionToDep(sub, element.connectionString)) : []
    }

    return []
  }
}
