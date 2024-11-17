import * as vscode from 'vscode'
import { ServiceBusProvider } from '../serviceBusProvider'

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
