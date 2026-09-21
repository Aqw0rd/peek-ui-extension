import * as vscode from 'vscode'
import { ServiceBusProvider } from '../serviceBusProvider'
import { SbDependencyBase } from './SbDependencyBase'
import * as service from '../utils/serviceBusService'
import { IInteractableItem } from '../interfaces/IInteractableItem'
import { MessagesWebView } from '../views/messagesWebView'
import { mapQueueToDep } from '../utils/dependencyMapper'
import { confirmDestructive, errorMessage } from '../utils/ui'

export class QueueItem extends SbDependencyBase implements IInteractableItem {
  constructor(
    public readonly label: string,
    public readonly connectionString: string,
    public activeMessageCount: number,
    public deadLetterMessageCount: number,
  ) {
    super(label, connectionString, vscode.TreeItemCollapsibleState.None)

    this.tooltip = this.label
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
      const queue = await service.getQueueRuntimeProperties(this.connectionString, this.label)
      const dep = mapQueueToDep(queue, this.connectionString)
      this.update(dep)
      await this.updateView()
      provider.refresh(this)
    }
    catch (err) {
      this.clearLoading(provider)
      vscode.window.showErrorMessage(`Failed to refresh queue ${this.label}: ${errorMessage(err)}`)
    }
  }

  update = (item: QueueItem) => {
    this.activeMessageCount = item.activeMessageCount
    this.deadLetterMessageCount = item.deadLetterMessageCount
    this.description = item.getDescription()
    this.iconPath = new vscode.ThemeIcon('database')
  }

  updateView = async () => {
    if (this.view) {
      const messagesDetails = await service.peekQueueMessages(this.connectionString, this.label, this.activeMessageCount, this.deadLetterMessageCount)
      this.view.update(messagesDetails)
    }
  }

  transfer = async (provider: ServiceBusProvider) => {
    if (!await confirmDestructive(`Transfer all deadletter messages on ${this.label} back to the queue?`, 'Transfer')) {
      return
    }
    this.setLoading(provider)
    try {
      await service.transferQueueDl(this.connectionString, this.label)
    }
    catch (err) {
      vscode.window.showErrorMessage(`Transfer failed for ${this.label}: ${errorMessage(err)}`)
    }
    await this.refresh(provider)
  }

  purge = async (provider: ServiceBusProvider) => {
    if (!await confirmDestructive(`Permanently delete all messages on ${this.label}? This cannot be undone.`, 'Purge')) {
      return
    }
    this.setLoading(provider)
    try {
      await service.purgeQueueMessages(this.connectionString, this.label)
    }
    catch (err) {
      vscode.window.showErrorMessage(`Purge failed for ${this.label}: ${errorMessage(err)}`)
    }
    await this.refresh(provider)
  }

  purgeDl = async (provider: ServiceBusProvider) => {
    if (!await confirmDestructive(`Permanently delete all deadletter messages on ${this.label}? This cannot be undone.`, 'Purge deadletter')) {
      return
    }
    this.setLoading(provider)
    try {
      await service.purgeQueueDeadLetter(this.connectionString, this.label)
    }
    catch (err) {
      vscode.window.showErrorMessage(`Purge deadletter failed for ${this.label}: ${errorMessage(err)}`)
    }
    await this.refresh(provider)
  }

  deleteMessage = async (provider: ServiceBusProvider, sequenceNumber: string, fromDeadletter: boolean) => {
    const location = fromDeadletter ? 'the deadletter queue' : this.label
    const warning = fromDeadletter
      ? ''
      : ' Note: sibling messages in the queue will have their delivery count incremented while we search.'
    if (!await confirmDestructive(`Permanently delete message with sequence ${sequenceNumber} from ${location}?${warning}`, 'Delete')) {
      return
    }
    this.setLoading(provider)
    try {
      const found = await service.deleteQueueMessage(this.connectionString, this.label, sequenceNumber, fromDeadletter)
      if (!found) {
        vscode.window.showWarningMessage(`Message ${sequenceNumber} was not found — it may already have been consumed.`)
      }
    }
    catch (err) {
      vscode.window.showErrorMessage(`Delete failed for ${this.label}: ${errorMessage(err)}`)
    }
    await this.refresh(provider)
  }

  requeueDlMessage = async (provider: ServiceBusProvider, sequenceNumber: string) => {
    if (!await confirmDestructive(`Requeue deadletter message ${sequenceNumber} back onto ${this.label}?`, 'Requeue')) {
      return
    }
    this.setLoading(provider)
    try {
      const found = await service.requeueQueueDlMessage(this.connectionString, this.label, sequenceNumber)
      if (!found) {
        vscode.window.showWarningMessage(`Message ${sequenceNumber} was not found in the deadletter queue.`)
      }
    }
    catch (err) {
      vscode.window.showErrorMessage(`Requeue failed for ${this.label}: ${errorMessage(err)}`)
    }
    await this.refresh(provider)
  }

  show = async (provider: ServiceBusProvider) => {
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
        messagesDetails = await service.peekQueueMessages(this.connectionString, this.label, this.activeMessageCount, this.deadLetterMessageCount)
      }
      catch (err) {
        vscode.window.showErrorMessage(`Failed to peek messages on ${this.label}: ${errorMessage(err)}`)
        return
      }
    }

    this.view = new MessagesWebView(this, messagesDetails, {
      onDelete: (seq, fromDl) => this.deleteMessage(provider, seq, fromDl),
      onRequeueDl: seq => this.requeueDlMessage(provider, seq),
    })
    this.view.show()
    this.view.panel?.onDidDispose(() => {
      this.view = undefined
    })
  }
}
