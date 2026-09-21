import * as vscode from 'vscode'
import { ServiceBusProvider } from '../serviceBusProvider'
import * as service from '../utils/serviceBusService'
import { EntityPath } from '../utils/serviceBusService'
import { InteractableDependencyBase } from './InteractableDependencyBase'
import { mapSubscriptionToDep } from '../utils/dependencyMapper'
import { errorMessage } from '../utils/ui'

export class SubscriptionItem extends InteractableDependencyBase {
  constructor(
    public readonly label: string,
    connectionString: string,
    activeMessageCount: number,
    deadLetterMessageCount: number,
    public readonly topicName: string,
  ) {
    super(label, connectionString, activeMessageCount, deadLetterMessageCount)
    this.tooltip = `${this.topicName}/${this.label}`
  }

  protected get entityPath(): EntityPath {
    return { topic: this.topicName, subscription: this.label }
  }

  protected get entityKind() {
    return 'subscription' as const
  }

  protected get entityLabel() {
    return `${this.topicName}/${this.label}`
  }

  protected get requeueTargetLabel() {
    return this.topicName
  }

  protected get deadletterLocationLabel() {
    return `${this.topicName}/${this.label} (deadletter)`
  }

  protected get transferTargetWord() {
    return 'topic'
  }

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
}
