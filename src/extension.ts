// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import { ServiceBusProvider } from './serviceBusProvider'
import { IInteractableItem, SbDependencyBase, ServiceBusItem } from './models/dependencyModel'

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const servicebusProvider = new ServiceBusProvider(context)
  vscode.window.registerTreeDataProvider('anho.peek-ui', servicebusProvider)
  vscode.commands.registerCommand('anho.peek-ui.addConnection', () => {
    servicebusProvider.addConnection()
  })
  vscode.commands.registerCommand('anho.peek-ui.connect', (node: ServiceBusItem) => {
    node.connect(servicebusProvider)
  })
  vscode.commands.registerCommand('anho.peek-ui.refresh', (node: SbDependencyBase) => {
    node.refresh(servicebusProvider)
  })
  vscode.commands.registerCommand('anho.peek-ui.showMessages', async (node: IInteractableItem) => {
    await node.show()
  })
  vscode.commands.registerCommand('anho.peek-ui.transferDeadletterAll', async (node: IInteractableItem) => {
    await node.transfer(servicebusProvider)
  })
  vscode.commands.registerCommand('anho.peek-ui.purgeMessages', async (node: IInteractableItem) => {
    await node.purge(servicebusProvider)
  })
  vscode.commands.registerCommand('anho.peek-ui.purgeDeadletter', async (node: IInteractableItem) => {
    await node.purgeDl(servicebusProvider)
  })
}

// This method is called when your extension is deactivated
export function deactivate() {}
