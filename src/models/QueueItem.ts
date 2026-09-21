import * as vscode from 'vscode'
import { ServiceBusProvider } from '../serviceBusProvider'
import * as service from '../utils/serviceBusService'
import { EntityPath } from '../utils/serviceBusService'
import { InteractableDependencyBase } from './InteractableDependencyBase'
import { mapQueueToDep } from '../utils/dependencyMapper'
import { errorMessage } from '../utils/ui'

export class QueueItem extends InteractableDependencyBase {
  protected get entityPath(): EntityPath {
    return { queue: this.label }
  }

  protected get entityKind() {
    return 'queue' as const
  }

  protected get entityLabel() {
    return this.label
  }

  protected get requeueTargetLabel() {
    return this.label
  }

  protected get deadletterLocationLabel() {
    return 'the deadletter queue'
  }

  protected get transferTargetWord() {
    return 'queue'
  }

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
}
