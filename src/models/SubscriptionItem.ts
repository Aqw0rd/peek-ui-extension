import * as vscode from 'vscode'
import { MessagesWebView } from '../views/messagesWebView'
import * as service from '../utils/serviceBusService'
import { ServiceBusProvider } from '../serviceBusProvider'
import { mapSubscriptionToDep } from '../utils/dependencyMapper'
import { IInteractableItem } from '../interfaces/IInteractableItem'
import { SbDependencyBase } from './SbDependencyBase'
import { confirmDestructive, errorMessage } from '../utils/ui'

export class SubscriptionItem extends SbDependencyBase implements IInteractableItem {
  constructor(
    public readonly label: string,
    public readonly connectionString: string,
    public activeMessageCount: number,
    public deadLetterMessageCount: number,
    public readonly topicName: string,
  ) {
    super(label, connectionString, vscode.TreeItemCollapsibleState.None)

    this.tooltip = `${this.topicName}/${this.label}`
    this.description = this.getDescription()
    this.command = {
      command: 'horgen.peek-ui.showMessages',
      title: '',
      arguments: [this],
    }
    this.view = undefined
  }

  contextValue = 'interactableDependency'
  iconPath = new vscode.ThemeIcon('database')
  view: MessagesWebView | undefined

  getDescription = () => `${this.activeMessageCount} | ${this.deadLetterMessageCount}`

  refresh = async (provider: ServiceBusProvider) => {
    this.setLoading(provider)
    try {
      const subscription = await service.getSubscriptionRuntimeProperties(this.connectionString, this.topicName, this.label)
      const dep = mapSubscriptionToDep(subscription, this.connectionString)
      this.update(dep)
      await this.updateView()
      provider.refresh(this)
    }
    catch (err) {
      this.clearLoading(provider)
      vscode.window.showErrorMessage(`Failed to refresh subscription ${this.label}: ${errorMessage(err)}`)
    }
  }

  update = (item: SubscriptionItem) => {
    this.activeMessageCount = item.activeMessageCount
    this.deadLetterMessageCount = item.deadLetterMessageCount
    this.description = item.getDescription()
    this.iconPath = new vscode.ThemeIcon('database')
  }

  updateView = async () => {
    if (this.view) {
      const messagesDetails = await service.peekSubscriptionMessages(this.connectionString, this.topicName, this.label, this.activeMessageCount, this.deadLetterMessageCount)
      this.view.update(messagesDetails)
    }
  }

  transfer = async (provider: ServiceBusProvider) => {
    if (!await confirmDestructive(`Transfer all deadletter messages on ${this.topicName}/${this.label} back to the topic?`, 'Transfer')) {
      return
    }
    this.setLoading(provider)
    try {
      await service.transferSubscriptionDl(this.connectionString, this.topicName, this.label)
    }
    catch (err) {
      vscode.window.showErrorMessage(`Transfer failed for ${this.label}: ${errorMessage(err)}`)
    }
    await this.refresh(provider)
  }

  purge = async (provider: ServiceBusProvider) => {
    if (!await confirmDestructive(`Permanently delete all messages on ${this.topicName}/${this.label}? This cannot be undone.`, 'Purge')) {
      return
    }
    this.setLoading(provider)
    try {
      await service.purgeSubscriptionMessages(this.connectionString, this.topicName, this.label)
    }
    catch (err) {
      vscode.window.showErrorMessage(`Purge failed for ${this.label}: ${errorMessage(err)}`)
    }
    await this.refresh(provider)
  }

  purgeDl = async (provider: ServiceBusProvider) => {
    if (!await confirmDestructive(`Permanently delete all deadletter messages on ${this.topicName}/${this.label}? This cannot be undone.`, 'Purge deadletter')) {
      return
    }
    this.setLoading(provider)
    try {
      await service.purgeSubscriptionDeadletter(this.connectionString, this.topicName, this.label)
    }
    catch (err) {
      vscode.window.showErrorMessage(`Purge deadletter failed for ${this.label}: ${errorMessage(err)}`)
    }
    await this.refresh(provider)
  }

  show = async () => {
    if (this.view) {
      this.view.reveal()
      return
    }

    let messagesDetails
    if (this.activeMessageCount < 1 && this.deadLetterMessageCount < 1) {
      messagesDetails = { messages: [], deadletter: [] }
    }
    else {
      try {
        messagesDetails = await service.peekSubscriptionMessages(this.connectionString, this.topicName, this.label, this.activeMessageCount, this.deadLetterMessageCount)
      }
      catch (err) {
        vscode.window.showErrorMessage(`Failed to peek messages on ${this.label}: ${errorMessage(err)}`)
        return
      }
    }

    this.view = new MessagesWebView(this, messagesDetails)
    this.view.show()
    this.view.panel?.onDidDispose(() => {
      this.view = undefined
    })
  }
}
