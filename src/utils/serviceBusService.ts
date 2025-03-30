import type {
  EntitiesResponse,
  QueueRuntimeProperties,
  TopicRuntimeProperties,
  SubscriptionRuntimeProperties,
  ServiceBusReceiver,
  ServiceBusSender,
  ServiceBusReceivedMessage,
  ServiceBusMessage,
} from '@azure/service-bus'
import type { ServiceBusInfo, ServiceBusMessageDetails, TopicCustomProperties } from '../interfaces/ServiceBusInfo'

import { ServiceBusAdministrationClient, ServiceBusClient } from '@azure/service-bus'

import type { Progress, CancellationToken } from 'vscode'

type ProgressReport = {
  increment?: number
  message?: string
}

export const getServiceBusInfo = async (connectionString: string): Promise<ServiceBusInfo> => {
  const client = new ServiceBusAdministrationClient(connectionString)

  const nameSpace = await client.getNamespaceProperties()
  const serviceBusName = nameSpace.name
  const queues = client.listQueuesRuntimeProperties().byPage() as AsyncIterableIterator<EntitiesResponse<QueueRuntimeProperties>>
  const topics = client.listTopicsRuntimeProperties().byPage() as AsyncIterableIterator<EntitiesResponse<TopicRuntimeProperties>>

  const queueResults: QueueRuntimeProperties[] = []
  const topicResults: TopicCustomProperties[] = []
  const topicRuntimeResults: TopicRuntimeProperties[] = []

  for await (const queue of queues) {
    queueResults.push(...queue)
  }

  for await (const topic of topics) {
    topicRuntimeResults.push(...topic)
  }

  for await (const topic of topicRuntimeResults) {
    const subscriptions = client
      .listSubscriptionsRuntimeProperties(topic.name)
      .byPage() as AsyncIterableIterator<EntitiesResponse<SubscriptionRuntimeProperties>>
    const subscriptionResults: SubscriptionRuntimeProperties[] = []
    for await (const subscription of subscriptions) {
      subscriptionResults.push(...subscription)
    }
    topicResults.push({
      properties: topic,
      subscriptions: subscriptionResults,
    })
  }

  return { connectionString, serviceBusName, queues: queueResults, topics: topicResults }
}

export const getQueueRuntimeProperties = async (connectionString: string, queue: string): Promise<QueueRuntimeProperties> => {
  const client = new ServiceBusAdministrationClient(connectionString)
  return await client.getQueueRuntimeProperties(queue)
}

export const getTopicCustomProperties = async (connectionString: string, topic: string): Promise<TopicCustomProperties> => {
  const client = new ServiceBusAdministrationClient(connectionString)
  const topicRuntimeProperties = await client.getTopicRuntimeProperties(topic)
  const subscriptions = client
    .listSubscriptionsRuntimeProperties(topic)
    .byPage() as AsyncIterableIterator<EntitiesResponse<SubscriptionRuntimeProperties>>
  const subscriptionResults: SubscriptionRuntimeProperties[] = []
  for await (const subscription of subscriptions) {
    subscriptionResults.push(...subscription)
  }
  return { properties: topicRuntimeProperties, subscriptions: subscriptionResults }
}

export const getSubscriptionRuntimeProperties = async (connectionString: string, topic: string, subscription: string): Promise<SubscriptionRuntimeProperties> => {
  const client = new ServiceBusAdministrationClient(connectionString)
  return await client.getSubscriptionRuntimeProperties(topic, subscription)
}

export const peekQueueMessages = async (connectionString: string, queue: string, amount: number, dlAmount: number): Promise<ServiceBusMessageDetails> => {
  if (amount < 1 && dlAmount < 1) {
    return { messages: [], deadletter: [] }
  }
  if (amount > 32) {
    amount = 32
  }
  if (dlAmount > 32) {
    dlAmount = 32
  }

  const client = new ServiceBusClient(connectionString)
  const receiver = client.createReceiver(queue, { receiveMode: 'peekLock' })
  const messages = await peekMessages(receiver, amount)

  const dlReceiver = client.createReceiver(queue, { receiveMode: 'peekLock', subQueueType: 'deadLetter' })
  const deadletter = await peekMessages(dlReceiver, dlAmount)

  client.close()
  return { messages, deadletter }
}

export const peekSubscriptionMessages = async (connectionString: string, topic: string, subscription: string, amount: number, dlAmount: number): Promise<ServiceBusMessageDetails> => {
  if (amount < 1 && dlAmount < 1) {
    return { messages: [], deadletter: [] }
  }
  if (amount > 32) {
    amount = 32
  }
  if (dlAmount > 32) {
    dlAmount = 32
  }

  const client = new ServiceBusClient(connectionString)
  const receiver = client.createReceiver(topic, subscription, { receiveMode: 'peekLock' })
  const messages = await peekMessages(receiver, amount)

  const dlReceiver = client.createReceiver(topic, subscription, { receiveMode: 'peekLock', subQueueType: 'deadLetter' })
  const deadletter = await peekMessages(dlReceiver, dlAmount)

  client.close()
  return { messages, deadletter }
}

export const purgeQueueMessages = async (connectionString: string, queue: string, progress: Progress<ProgressReport>, token: CancellationToken): Promise<void> => {
  const client = new ServiceBusClient(connectionString)
  const receiver = client.createReceiver(queue, { receiveMode: 'peekLock' }) // use peekLock to avoid losing messages, if transferring fails
  const runtimeProperties = await getQueueRuntimeProperties(connectionString, queue)
  await completeMessages(receiver, runtimeProperties.activeMessageCount, progress, token)
  client.close()
}

export const purgeQueueDeadLetter = async (connectionString: string, queue: string, progress: Progress<ProgressReport>, token: CancellationToken): Promise<void> => {
  const client = new ServiceBusClient(connectionString)
  const receiver = client.createReceiver(`${queue}/$deadletterqueue`, { receiveMode: 'peekLock' })
  const runtimeProperties = await getQueueRuntimeProperties(connectionString, queue)
  await completeMessages(receiver, runtimeProperties.deadLetterMessageCount, progress, token)
  client.close()
}

export const transferQueueDl = async (connectionString: string, queue: string, progress: Progress<ProgressReport>, token: CancellationToken): Promise<void> => {
  const client = new ServiceBusClient(connectionString)
  const sender = client.createSender(queue)
  const runtimeProperties = await getQueueRuntimeProperties(connectionString, queue)

  const dlReceiver = client.createReceiver(queue, { receiveMode: 'peekLock', subQueueType: 'deadLetter' })
  await transferMessages(dlReceiver, sender, runtimeProperties.deadLetterMessageCount, progress, token)
  client.close()
}

export const purgeSubscriptionMessages = async (connectionString: string, topic: string, subscription: string, progress: Progress<ProgressReport>, token: CancellationToken): Promise<void> => {
  const client = new ServiceBusClient(connectionString)
  const receiver = client.createReceiver(topic, subscription, { receiveMode: 'peekLock' })
  const runtimeOptions = await getSubscriptionRuntimeProperties(connectionString, topic, subscription)
  await completeMessages(receiver, runtimeOptions.activeMessageCount, progress, token)
  client.close()
}

export const purgeSubscriptionDeadletter = async (connectionString: string, topic: string, subscription: string, progress: Progress<ProgressReport>, token: CancellationToken): Promise<void> => {
  const client = new ServiceBusClient(connectionString)
  const receiver = client.createReceiver(topic, subscription, { receiveMode: 'peekLock', subQueueType: 'deadLetter' })
  const runtimeOptions = await getSubscriptionRuntimeProperties(connectionString, topic, subscription)
  await completeMessages(receiver, runtimeOptions.deadLetterMessageCount, progress, token)
  client.close()
}

export const transferSubscriptionDl = async (connectionString: string, topic: string, subscription: string, progress: Progress<ProgressReport>, token: CancellationToken): Promise<void> => {
  const client = new ServiceBusClient(connectionString)
  const sender = client.createSender(topic)
  const runtimeOptions = await getSubscriptionRuntimeProperties(connectionString, topic, subscription)

  const dlReceiver = client.createReceiver(`${topic}/Subscriptions/${subscription}/$deadletterqueue`, { receiveMode: 'peekLock' })
  await transferMessages(dlReceiver, sender, runtimeOptions.deadLetterMessageCount, progress, token)
  client.close()
}

const completeMessages = async (receiver: ServiceBusReceiver, amountToDelete: number, progress: Progress<ProgressReport>, token: CancellationToken) => {
  const increment = Math.floor(100 / amountToDelete)
  let completed = 0, batchCompleted = 0
  try {
    let messages
    do {
      messages = await receiver.receiveMessages(20, { maxWaitTimeInMs: 200 })
      if (messages.length > 0) {
        const completePromises = messages.map(message =>
          receiver.completeMessage(message),
        )
        await Promise.all(completePromises) // Complete all messages in parallel

        completed += messages.length
        batchCompleted += messages.length

        if (batchCompleted >= 50) {
          progress.report({
            increment: increment * batchCompleted, // Adjust increment for batched messages
            message: `Deleted ${completed}/${amountToDelete} messages`,
          })
          batchCompleted = 0 // Reset batch completed count
        }
      }
    } while (messages.length > 0 && !token.isCancellationRequested && completed < amountToDelete)
  }
  finally {
    if (token.isCancellationRequested) {
      progress.report({ increment: 100, message: 'Cancelled' })
    }
    else {
      progress.report({ increment: 100, message: 'Completed' })
    }
    await receiver.close()
  }
}

const peekMessages = async (receiver: ServiceBusReceiver, amount: number) => {
  try {
    return amount > 0 ? await receiver.peekMessages(amount) : []
  }
  finally {
    await receiver.close()
  }
}

const receiveAllMessages = async (receiver: ServiceBusReceiver, amount: number, progress: Progress<ProgressReport>, token: CancellationToken) => {
  let messages
  let receivedMessages: ServiceBusReceivedMessage[] = []
  const increment = Math.floor(200 / amount) // 100 for transfer, 100 for complete
  let completed = 0, batchCompleted = 0
  do {
    if (token.isCancellationRequested) {
      break
    }
    messages = await receiver.receiveMessages(20, { maxWaitTimeInMs: 200 })
    if (messages.length > 0) {
      receivedMessages = receivedMessages.concat(messages)
      completed += messages.length
      batchCompleted += messages.length
      if (batchCompleted >= 50) {
        progress.report({
          increment: increment * batchCompleted, // Adjust increment for batched messages
          message: `Retrieving ${completed}/${amount} messages`,
        })
        batchCompleted = 0 // Reset batch completed count
      }
    }
  } while (messages.length > 0 && !token.isCancellationRequested && completed < amount)
  return receivedMessages
}

const transferMessages = async (receiver: ServiceBusReceiver, sender: ServiceBusSender, amount: number, progress: Progress<ProgressReport>, token: CancellationToken) => {
  const increment = Math.floor(200 / amount) // 100 for transfer, 100 for complete
  let completed = 0, batchCompleted = 0
  try {
    const receivedMessages = await receiveAllMessages(receiver, amount, progress, token)
    while (receivedMessages.length > 0 && !token.isCancellationRequested) {
      const messages = receivedMessages.splice(0, 10)
      const messagesToSend = messages.map(createMessageFromDeadletter)
      await sender.sendMessages(messagesToSend)

      const completePromises = messages.map(message =>
        receiver.completeMessage(message),
      )
      await Promise.all(completePromises) // Complete all messages in parallel
      completed += messages.length
      batchCompleted += messages.length
      if (batchCompleted >= 50) {
        progress.report({
          increment: increment,
          message: `Transferred ${completed}/${amount} messages`,
        })
        batchCompleted = 0 // Reset batch completed count
      }
    }
  }
  finally {
    await receiver.close()
    await sender.close()
  }
}

const createMessageFromDeadletter = (message: ServiceBusReceivedMessage): ServiceBusMessage => {
  return {
    body: message.body,
    contentType: message.contentType,
  }
}
