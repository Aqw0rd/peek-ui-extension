import * as vscode from 'vscode'
import { QueueRuntimeProperties, SubscriptionRuntimeProperties } from '@azure/service-bus'
import { MessagesWebView } from '../messagesWebView'
import { TopicCustomProperties } from '../ServiceBusInfo'
import * as service from '../serviceBusService'
import { ServiceBusProvider } from '../serviceBusProvider'
import { mapQueueToDep, mapSbToDep, mapSubscriptionToDep, mapTopicToDep } from './dependencyMapper'

export interface IInteractableItem {
  show(): Promise<void>
  transfer: (provider: ServiceBusProvider) => Promise<void>
  purge: (provider: ServiceBusProvider) => Promise<void>
  purgeDl: (provider: ServiceBusProvider) => Promise<void>
}

export abstract class SbDependencyBase extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly connectionString: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState)
    this.tooltip = `${this.label}}`
  }

  abstract refresh(provider: ServiceBusProvider): Promise<void>
  abstract getDescription(): string
  abstract update(item: SbDependencyBase): void

  setLoading(provider: ServiceBusProvider) {
    this.iconPath = new vscode.ThemeIcon('loading~spin')
    provider.refresh(this)
  }
}

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

export class QueueItem extends SbDependencyBase implements IInteractableItem {
  constructor(
    public readonly label: string,
    public readonly connectionString: string,
    public activeMessageCount: number,
    public deadLetterMessageCount: number,
  ) {
    super(label, connectionString, vscode.TreeItemCollapsibleState.None)

    this.tooltip = `${this.label}}`
    this.description = this.getDescription()
    this.command = {
      command: 'anho.peek-ui.showMessages',
      title: '',
      arguments: [this],
    }
  }

  contextValue = 'interactableDependency'
  iconPath = new vscode.ThemeIcon('database')

  getDescription = () => `${this.activeMessageCount} | ${this.deadLetterMessageCount}`

  refresh = async (provider: ServiceBusProvider) => {
    this.setLoading(provider)
    const queue = await service.getQueueRuntimeProperties(this.connectionString, this.label)
    const dep = mapQueueToDep(queue, this.connectionString)
    this.update(dep)
    provider.refresh(this)
  }

  update = (item: QueueItem) => {
    this.activeMessageCount = item.activeMessageCount
    this.deadLetterMessageCount = item.deadLetterMessageCount
    this.description = item.getDescription()
    this.iconPath = new vscode.ThemeIcon('database')
  }

  transfer = async (provider: ServiceBusProvider) => {
    await service.transferQueueDl(this.connectionString, this.label)
    await this.refresh(provider)
  }

  purge = async (provider: ServiceBusProvider) => {
    await service.purgeQueueMessages(this.connectionString, this.label)
    await this.refresh(provider)
  }

  purgeDl = async (provider: ServiceBusProvider) => {
    await service.purgeQueueDeadLetter(this.connectionString, this.label)
    await this.refresh(provider)
  }

  show = async () => {
    if (this.activeMessageCount < 1 && this.deadLetterMessageCount < 1) {
      return
    }
    const messagesDetails = await service.peekQueueMessages(this.connectionString, this.label, this.activeMessageCount, this.deadLetterMessageCount)
    return new MessagesWebView(this, messagesDetails).show()
  }
}

export class TopicItem extends SbDependencyBase {
  constructor(
    public readonly label: string, // name of sb/queue/topic/subscription
    public readonly connectionString: string,
    public collapsibleState: vscode.TreeItemCollapsibleState,
    public subscriptions: SubscriptionRuntimeProperties[],
  ) {
    super(label, connectionString, collapsibleState)

    this.tooltip = `${this.label}}`
    this.description = this.getDescription()
  }

  contextValue = 'childDependency'
  iconPath = new vscode.ThemeIcon('server-environment')

  getDescription = () => `${this.subscriptions?.length ?? 0} subscriptions`

  refresh = async (provider: ServiceBusProvider) => {
    this.setLoading(provider)
    const topic = await service.getTopicCustomProperties(this.connectionString, this.label)
    const dep = mapTopicToDep(topic, this.connectionString)
    this.update(dep)
    provider.refresh(this)
  }

  update = (item: TopicItem) => {
    this.subscriptions = item.subscriptions
    this.collapsibleState = item.subscriptions.length < 1 ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed
    this.description = item.getDescription()
    this.iconPath = new vscode.ThemeIcon('server-environment')
  }
}

export class SubscriptionItem extends SbDependencyBase implements IInteractableItem {
  constructor(
    public readonly label: string,
    public readonly connectionString: string,
    public activeMessageCount: number,
    public deadLetterMessageCount: number,
    public readonly topicName: string,
  ) {
    super(label, connectionString, vscode.TreeItemCollapsibleState.None)

    this.tooltip = `${this.label}}`
    this.description = this.getDescription()
    this.command = {
      command: 'anho.peek-ui.showMessages',
      title: '',
      arguments: [this],
    }
  }

  contextValue = 'interactableDependency'
  iconPath = new vscode.ThemeIcon('database')

  getDescription = () => `${this.activeMessageCount} | ${this.deadLetterMessageCount}`

  refresh = async (provider: ServiceBusProvider) => {
    this.setLoading(provider)
    const subscription = await service.getSubscriptionRuntimeProperties(this.connectionString, this.topicName, this.label)
    const dep = mapSubscriptionToDep(subscription, this.connectionString)
    this.update(dep)
    provider.refresh(this)
  }

  update = (item: SubscriptionItem) => {
    this.activeMessageCount = item.activeMessageCount
    this.deadLetterMessageCount = item.deadLetterMessageCount
    this.description = item.getDescription()
    this.iconPath = new vscode.ThemeIcon('database')
  }

  transfer = async (provider: ServiceBusProvider) => {
    await service.transferSubscriptionDl(this.connectionString, this.topicName, this.label)
    await this.refresh(provider)
  }

  purge = async (provider: ServiceBusProvider) => {
    await service.purgeSubscriptionMessages(this.connectionString, this.topicName, this.label)
    await this.refresh(provider)
  }

  purgeDl = async (provider: ServiceBusProvider) => {
    await service.purgeSubscriptionDeadletter(this.connectionString, this.topicName, this.label)
    await this.refresh(provider)
  }

  show = async () => {
    if (this.activeMessageCount < 1 && this.deadLetterMessageCount < 1) {
      return
    }
    const messagesDetails = await service.peekSubscriptionMessages(this.connectionString, this.topicName, this.label, this.activeMessageCount, this.deadLetterMessageCount)
    return new MessagesWebView(this, messagesDetails).show()
  }
}
