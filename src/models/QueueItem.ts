import * as vscode from 'vscode'
import { ServiceBusProvider } from '../serviceBusProvider'
import { SbDependencyBase } from './SbDependencyBase'
import * as service from '../utils/serviceBusService'
import { IInteractableItem } from '../interfaces/IInteractableItem'
import { MessagesWebView } from '../views/messagesWebView'
import { mapQueueToDep } from '../utils/dependencyMapper'

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
    const queue = await service.getQueueRuntimeProperties(this.connectionString, this.label)
    const dep = mapQueueToDep(queue, this.connectionString)
    this.update(dep)
    await this.updateView()
    provider.refresh(this)
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
    if (this.view) {
      this.view.reveal()
      return
    }

    let messagesDetails
    if (this.activeMessageCount < 1 && this.deadLetterMessageCount < 1) {
      messagesDetails = { messages: [], deadletter: [] }
    }
    else {
      messagesDetails = await service.peekQueueMessages(this.connectionString, this.label, this.activeMessageCount, this.deadLetterMessageCount)
    }

    this.view = new MessagesWebView(this, messagesDetails)
    this.view.show()
    this.view.panel?.onDidDispose(() => {
      this.view = undefined
    })
  }
}
