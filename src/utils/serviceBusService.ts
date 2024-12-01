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

export const purgeQueueMessages = async (connectionString: string, queue: string): Promise<void> => {
  const client = new ServiceBusClient(connectionString)
  const receiver = client.createReceiver(queue, { receiveMode: 'peekLock' }) // use peekLock to avoid losing messages, if transferring fails
  await completeMessages(receiver)
  client.close()
}

export const purgeQueueDeadLetter = async (connectionString: string, queue: string): Promise<void> => {
  const client = new ServiceBusClient(connectionString)
  const receiver = client.createReceiver(`${queue}/$deadletterqueue`, { receiveMode: 'peekLock' })
  await completeMessages(receiver)
  client.close()
}

export const transferQueueDl = async (connectionString: string, queue: string): Promise<void> => {
  const client = new ServiceBusClient(connectionString)
  const sender = client.createSender(queue)

  const dlReceiver = client.createReceiver(queue, { receiveMode: 'peekLock', subQueueType: 'deadLetter' })
  await transferMessages(dlReceiver, sender)
  client.close()
}

export const purgeSubscriptionMessages = async (connectionString: string, topic: string, subscription: string): Promise<void> => {
  const client = new ServiceBusClient(connectionString)
  const receiver = client.createReceiver(topic, subscription, { receiveMode: 'peekLock' })
  await completeMessages(receiver)
  client.close()
}

export const purgeSubscriptionDeadletter = async (connectionString: string, topic: string, subscription: string): Promise<void> => {
  const client = new ServiceBusClient(connectionString)
  const receiver = client.createReceiver(topic, subscription, { receiveMode: 'peekLock', subQueueType: 'deadLetter' })
  await completeMessages(receiver)
  client.close()
}

export const transferSubscriptionDl = async (connectionString: string, topic: string, subscription: string): Promise<void> => {
  const client = new ServiceBusClient(connectionString)
  const sender = client.createSender(topic)

  const dlReceiver = client.createReceiver(`${topic}/Subscriptions/${subscription}/$deadletterqueue`, { receiveMode: 'peekLock' })
  await transferMessages(dlReceiver, sender)
  client.close()
}

const completeMessages = async (receiver: ServiceBusReceiver) => {
  try {
    let messages
    do {
      messages = await receiver.receiveMessages(10, { maxWaitTimeInMs: 150 })
      if (messages.length > 0) {
        for (const message of messages) {
          await receiver.completeMessage(message)
        }
      }
    } while (messages.length > 0)
  }
  finally {
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

const receiveAllMessages = async (receiver: ServiceBusReceiver) => {
  let messages
  let receivedMessages: ServiceBusReceivedMessage[] = []
  do {
    messages = await receiver.receiveMessages(10, { maxWaitTimeInMs: 150 })
    if (messages.length > 0) {
      receivedMessages = receivedMessages.concat(messages)
    }
  } while (messages.length > 0)
  return receivedMessages
}

const transferMessages = async (receiver: ServiceBusReceiver, sender: ServiceBusSender, amount?: number) => {
  try {
    const receivedMessages = await receiveAllMessages(receiver)
    while (receivedMessages.length > 0) {
      const messages = receivedMessages.splice(0, 10)
      const messagesToSend = messages.map(createMessageFromDeadletter)
      await sender.sendMessages(messagesToSend)
      for (const message of messages) {
        await receiver.completeMessage(message)
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
