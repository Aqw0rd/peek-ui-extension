import * as vscode from 'vscode'
import { ServiceBusProvider } from './serviceBusProvider'
import { IInteractableItem } from './interfaces/IInteractableItem'
import { SbDependencyBase } from './models/SbDependencyBase'
import { ServiceBusItem } from './models/ServiceBusItem'
import { initMessagesWebView } from './views/messagesWebView'

export function activate(context: vscode.ExtensionContext) {
  initMessagesWebView(context.extensionUri)
  const servicebusProvider = new ServiceBusProvider(context)
  context.subscriptions.push(
    servicebusProvider,
    vscode.window.registerTreeDataProvider('horgen.peek-ui', servicebusProvider),
    vscode.commands.registerCommand('horgen.peek-ui.addConnection', () => servicebusProvider.addConnection()),
    vscode.commands.registerCommand('horgen.peek-ui.removeConnection', (node?: ServiceBusItem) => servicebusProvider.removeConnection(node)),
    vscode.commands.registerCommand('horgen.peek-ui.connect', (node: ServiceBusItem) => node.connect(servicebusProvider)),
    vscode.commands.registerCommand('horgen.peek-ui.refresh', (node: SbDependencyBase) => node.refresh(servicebusProvider)),
    vscode.commands.registerCommand('horgen.peek-ui.showMessages', (node: IInteractableItem) => node.show()),
    vscode.commands.registerCommand('horgen.peek-ui.transferDeadletterAll', (node: IInteractableItem) => node.transfer(servicebusProvider)),
    vscode.commands.registerCommand('horgen.peek-ui.purgeMessages', (node: IInteractableItem) => node.purge(servicebusProvider)),
    vscode.commands.registerCommand('horgen.peek-ui.purgeDeadletter', (node: IInteractableItem) => node.purgeDl(servicebusProvider)),
  )
}

export function deactivate() { }
