import * as vscode from 'vscode'
import { ServiceBusProvider } from '../serviceBusProvider'
import { QueueRuntimeProperties } from '@azure/service-bus'
import { TopicCustomProperties } from '../interfaces/ServiceBusInfo'
import { mapSbToDep } from '../utils/dependencyMapper'
import { SbDependencyBase } from './SbDependencyBase'
import * as service from '../utils/serviceBusService'

export class ServiceBusItem extends SbDependencyBase {
  constructor(
    public readonly label: string, // name of sb/queue/topic/subscription
    public readonly connectionString: string,
    public collapsibleState: vscode.TreeItemCollapsibleState,
    public isConnected: boolean,
    public queues?: QueueRuntimeProperties[], // queue when sb, subscription when topic
    public topics?: TopicCustomProperties[],
  ) {
    super(label, connectionString, isConnected ? collapsibleState : vscode.TreeItemCollapsibleState.None)

    this.description = this.getDescription()
    this.contextValue = isConnected ? 'connectedSbItem' : 'disconnectedSbItem'
  }

  iconPath = new vscode.ThemeIcon('server-environment')

  connect(provider: ServiceBusProvider) {
    this.refresh(provider)
  }

  refresh = async (provider: ServiceBusProvider) => {
    this.setLoading(provider)
    const sbInfo = await service.getServiceBusInfo(this.connectionString)
    const dep = mapSbToDep(sbInfo, true)
    this.update(dep)
    provider.refresh(this)
  }

  update = (item: ServiceBusItem) => {
    this.queues = item.queues
    this.topics = item.topics
    this.description = item.getDescription()
    this.isConnected = item.isConnected
    this.collapsibleState = item.collapsibleState
    this.contextValue = 'connectedSbItem'
    this.iconPath = new vscode.ThemeIcon('server-environment')
  }

  getDescription = () => this.isConnected ? `${this.queues?.length ?? 0} queues | ${this.topics?.length ?? 0} topics` : 'Disconnected'
}
