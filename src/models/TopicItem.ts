import * as vscode from 'vscode'
import { ServiceBusProvider } from '../serviceBusProvider'
import { SbDependencyBase } from './SbDependencyBase'
import * as service from '../utils/serviceBusService'
import { SubscriptionRuntimeProperties } from '@azure/service-bus'
import { mapTopicToDep } from '../utils/dependencyMapper'
import { errorMessage } from '../utils/ui'

export class TopicItem extends SbDependencyBase {
  constructor(
    public readonly label: string,
    public readonly connectionString: string,
    public collapsibleState: vscode.TreeItemCollapsibleState,
    public subscriptions: SubscriptionRuntimeProperties[],
  ) {
    super(label, connectionString, collapsibleState)

    this.tooltip = this.label
    this.description = this.getDescription()
  }

  contextValue = 'childDependency'
  iconPath = new vscode.ThemeIcon('symbol-namespace')

  getDescription = () => `${this.subscriptions?.length ?? 0} subscriptions`

  refresh = async (provider: ServiceBusProvider) => {
    this.setLoading(provider)
    try {
      const topic = await service.getTopicCustomProperties(this.connectionString, this.label)
      const dep = mapTopicToDep(topic, this.connectionString)
      this.update(dep)
      provider.refresh(this)
    }
    catch (err) {
      this.clearLoading(provider)
      vscode.window.showErrorMessage(`Failed to refresh topic ${this.label}: ${errorMessage(err)}`)
    }
  }

  update = (item: TopicItem) => {
    this.subscriptions = item.subscriptions
    this.collapsibleState = item.subscriptions.length < 1 ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed
    this.description = item.getDescription()
    this.iconPath = new vscode.ThemeIcon('symbol-namespace')
  }
}
