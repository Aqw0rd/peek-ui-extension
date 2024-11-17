import * as vscode from 'vscode'
import { MessagesWebView } from '../views/messagesWebView'
import * as service from '../utils/serviceBusService'
import { ServiceBusProvider } from '../serviceBusProvider'
import { mapSubscriptionToDep } from '../utils/dependencyMapper'
import { IInteractableItem } from '../interfaces/IInteractableItem'
import { SbDependencyBase } from './SbDependencyBase'

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
