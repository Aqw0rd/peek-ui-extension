import * as vscode from 'vscode'
import { ServiceBusProvider } from '../serviceBusProvider'

export abstract class SbDependencyBase extends vscode.TreeItem {
  private previousIcon: vscode.ThemeIcon | undefined

  constructor(
    public readonly label: string,
    public readonly connectionString: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState)
    this.tooltip = this.label
  }

  abstract refresh(provider: ServiceBusProvider): Promise<void>
  abstract getDescription(): string
  abstract update(item: SbDependencyBase): void

  setLoading(provider: ServiceBusProvider) {
    if (this.iconPath instanceof vscode.ThemeIcon) {
      this.previousIcon = this.iconPath
    }
    this.iconPath = new vscode.ThemeIcon('loading~spin')
    provider.refresh(this)
  }

  clearLoading(provider: ServiceBusProvider) {
    if (this.previousIcon) {
      this.iconPath = this.previousIcon
      this.previousIcon = undefined
    }
    provider.refresh(this)
  }
}
