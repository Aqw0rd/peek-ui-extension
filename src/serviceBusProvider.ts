import * as vscode from 'vscode'
import * as service from './serviceBusService'
import { IServiceBusItem } from './serviceBusItem'
import { SbDependencyBase, TopicItem, ServiceBusItem } from './models/dependencyModel'
import { mapQueueToDep, mapSbToDep, mapSubscriptionToDep, mapTopicToDep, mapUnconnectedSbToDep } from './models/dependencyMapper'

export class ServiceBusProvider implements vscode.TreeDataProvider<SbDependencyBase> {
  private _onDidChangeTreeData: vscode.EventEmitter<SbDependencyBase | undefined | void> = new vscode.EventEmitter<SbDependencyBase | undefined | void>()
  readonly onDidChangeTreeData: vscode.Event<SbDependencyBase | undefined | void> = this._onDidChangeTreeData.event

  state: vscode.Memento

  constructor(private context: vscode.ExtensionContext) {
    this.state = context.globalState
  }

  refresh(item: SbDependencyBase | undefined | void): void {
    this._onDidChangeTreeData.fire(item)
  }

  addConnection(): void {
    vscode.window.showInputBox({ prompt: 'Servicebus connectionstring' }).then(async (input) => {
      if (!input) {
        return
      }
      const sbInfo = await service.getServiceBusInfo(input)
      const current = this.state.get<IServiceBusItem[]>('anho.peek-ui.state', [])
      if (current.find(c => c.connectionString === sbInfo.connectionString)) {
        return
      }
      const updated = [...current, { connectionString: sbInfo.connectionString, name: sbInfo.serviceBusName }]
      this.state.update('anho.peek-ui.state', updated)
      this.refresh()
    })
  }

  getTreeItem(element: SbDependencyBase): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element
  }

  async getChildren(element?: SbDependencyBase): Promise<SbDependencyBase[]> {
    if (!element) {
      const sbItems = this.state.get<IServiceBusItem[]>('anho.peek-ui.state', [])
      const deps = sbItems.map(item => mapUnconnectedSbToDep(item.name, item.connectionString))
      vscode.commands.executeCommand('setContext', 'anho.peek-ui:isInitialized', true)
      return deps.flat()
    }

    if (element instanceof ServiceBusItem) {
      if (element.isConnected) {
        const queues: SbDependencyBase[] = element.queues ? element.queues.map(queue => mapQueueToDep(queue, element.connectionString)) : []
        const topics: SbDependencyBase[] = element.topics ? element.topics.map(topic => mapTopicToDep(topic, element.connectionString)) : []
        return Promise.resolve(queues.concat(topics))
      }
      return Promise.resolve([])
    }

    if (element instanceof TopicItem) {
      const subscriptions = element.subscriptions ? element.subscriptions.map(sub => mapSubscriptionToDep(sub, element.connectionString)) : []
      return Promise.resolve(subscriptions)
    }

    return Promise.resolve([])
  }
}
