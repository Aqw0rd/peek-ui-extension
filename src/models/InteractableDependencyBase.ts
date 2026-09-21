import * as vscode from 'vscode'
import { ServiceBusProvider } from '../serviceBusProvider'
import { SbDependencyBase } from './SbDependencyBase'
import { IInteractableItem } from '../interfaces/IInteractableItem'
import { MessagesWebView } from '../views/messagesWebView'
import * as service from '../utils/serviceBusService'
import { EntityPath } from '../utils/serviceBusService'
import { confirmDestructive, errorMessage } from '../utils/ui'

/**
 * Shared behaviour for the two "leaf" entities messages can be read from: queues and
 * subscriptions. Everything that only differs by how the entity is addressed (its
 * `EntityPath`) or worded in confirmation dialogs lives here; refreshing runtime
 * properties stays per-subclass since the admin API calls genuinely differ.
 */
export abstract class InteractableDependencyBase extends SbDependencyBase implements IInteractableItem {
  constructor(
    public readonly label: string,
    public readonly connectionString: string,
    public activeMessageCount: number,
    public deadLetterMessageCount: number,
  ) {
    super(label, connectionString, vscode.TreeItemCollapsibleState.None)

    this.description = this.getDescription()
    this.command = {
      command: 'horgen.peek-ui.showMessages',
      title: '',
      arguments: [this],
    }
  }

  contextValue = 'interactableDependency'
  iconPath = new vscode.ThemeIcon('database')
  view: MessagesWebView | undefined

  protected abstract get entityPath(): EntityPath
  /** "queue" or "subscription" — used to word the delivery-count warning. */
  protected abstract get entityKind(): 'queue' | 'subscription'
  /** Name used for this entity in confirmation dialogs, e.g. "orders" or "orders-topic/billing-sub". */
  protected abstract get entityLabel(): string
  /** What a requeued deadletter message lands back on: itself for a queue, the parent topic for a subscription. */
  protected abstract get requeueTargetLabel(): string
  /** Location text for a delete confirmation when deleting from the deadletter sub-queue. */
  protected abstract get deadletterLocationLabel(): string
  /** "queue" or "topic" — what deadletter messages get transferred back onto. */
  protected abstract get transferTargetWord(): string

  getDescription = () => `${this.activeMessageCount} | ${this.deadLetterMessageCount}`

  updateView = async () => {
    if (this.view) {
      const messagesDetails = await service.peekMessagesFor(this.connectionString, this.entityPath, this.activeMessageCount, this.deadLetterMessageCount)
      this.view.update(messagesDetails)
    }
  }

  transfer = async (provider: ServiceBusProvider) => {
    if (!await confirmDestructive(`Transfer all deadletter messages on ${this.entityLabel} back to the ${this.transferTargetWord}?`, 'Transfer')) {
      return
    }
    this.setLoading(provider)
    try {
      await service.transferDeadLetter(this.connectionString, this.entityPath)
    }
    catch (err) {
      vscode.window.showErrorMessage(`Transfer failed for ${this.label}: ${errorMessage(err)}`)
    }
    await this.refresh(provider)
  }

  purge = async (provider: ServiceBusProvider) => {
    if (!await confirmDestructive(`Permanently delete all messages on ${this.entityLabel}? This cannot be undone.`, 'Purge')) {
      return
    }
    this.setLoading(provider)
    try {
      await service.purgeMessages(this.connectionString, this.entityPath)
    }
    catch (err) {
      vscode.window.showErrorMessage(`Purge failed for ${this.label}: ${errorMessage(err)}`)
    }
    await this.refresh(provider)
  }

  purgeDl = async (provider: ServiceBusProvider) => {
    if (!await confirmDestructive(`Permanently delete all deadletter messages on ${this.entityLabel}? This cannot be undone.`, 'Purge deadletter')) {
      return
    }
    this.setLoading(provider)
    try {
      await service.purgeDeadLetter(this.connectionString, this.entityPath)
    }
    catch (err) {
      vscode.window.showErrorMessage(`Purge deadletter failed for ${this.label}: ${errorMessage(err)}`)
    }
    await this.refresh(provider)
  }

  deleteMessage = async (provider: ServiceBusProvider, sequenceNumber: string, fromDeadletter: boolean) => {
    const location = fromDeadletter ? this.deadletterLocationLabel : this.entityLabel
    const warning = fromDeadletter
      ? ''
      : ` Note: sibling messages in the ${this.entityKind} will have their delivery count incremented while we search.`
    if (!await confirmDestructive(`Permanently delete message with sequence ${sequenceNumber} from ${location}?${warning}`, 'Delete')) {
      return
    }
    this.setLoading(provider)
    try {
      const found = await service.deleteMessage(this.connectionString, this.entityPath, sequenceNumber, fromDeadletter)
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
    if (!await confirmDestructive(`Requeue deadletter message ${sequenceNumber} back onto ${this.requeueTargetLabel}?`, 'Requeue')) {
      return
    }
    this.setLoading(provider)
    try {
      const found = await service.requeueDlMessage(this.connectionString, this.entityPath, sequenceNumber)
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
        messagesDetails = await service.peekMessagesFor(this.connectionString, this.entityPath, this.activeMessageCount, this.deadLetterMessageCount)
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
