import type {
  EntitiesResponse,
  QueueRuntimeProperties,
  TopicRuntimeProperties,
  SubscriptionRuntimeProperties,
  ServiceBusClient,
  ServiceBusReceiver,
  ServiceBusReceiverOptions,
  ServiceBusSender,
  ServiceBusReceivedMessage,
  ServiceBusMessage,
} from '@azure/service-bus'
import type { ServiceBusInfo, ServiceBusMessageDetails, TopicCustomProperties } from '../interfaces/ServiceBusInfo'

import { ServiceBusAdministrationClient, ServiceBusClient as SbClient } from '@azure/service-bus'

const RECEIVE_BATCH = 32
const RECEIVE_WAIT_MS = 5000
const EMPTY_ROUNDS_UNTIL_DONE = 2
const PEEK_MAX = 250

/** A queue, or a topic + subscription pair — the two kinds of entity messages can be received from. */
export type EntityPath =
  | { queue: string }
  | { topic: string, subscription: string }

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

export const peekMessagesFor = async (connectionString: string, path: EntityPath, amount: number, dlAmount: number): Promise<ServiceBusMessageDetails> => {
  if (amount < 1 && dlAmount < 1) {
    return { messages: [], deadletter: [] }
  }
  amount = Math.min(amount, PEEK_MAX)
  dlAmount = Math.min(dlAmount, PEEK_MAX)

  const client = new SbClient(connectionString)
  try {
    const receiver = createEntityReceiver(client, path, { receiveMode: 'peekLock' })
    const messages = await peekMessages(receiver, amount)

    const dlReceiver = createEntityReceiver(client, path, { receiveMode: 'peekLock', subQueueType: 'deadLetter' })
    const deadletter = await peekMessages(dlReceiver, dlAmount)

    return { messages, deadletter }
  }
  finally {
    await client.close()
  }
}

export const purgeMessages = async (connectionString: string, path: EntityPath): Promise<void> => {
  const client = new SbClient(connectionString)
  try {
    const receiver = createEntityReceiver(client, path, { receiveMode: 'receiveAndDelete' })
    await drainMessages(receiver)
  }
  finally {
    await client.close()
  }
}

export const purgeDeadLetter = async (connectionString: string, path: EntityPath): Promise<void> => {
  const client = new SbClient(connectionString)
  try {
    const receiver = createEntityReceiver(client, path, { receiveMode: 'receiveAndDelete', subQueueType: 'deadLetter' })
    await drainMessages(receiver)
  }
  finally {
    await client.close()
  }
}

export const transferDeadLetter = async (connectionString: string, path: EntityPath): Promise<void> => {
  const client = new SbClient(connectionString)
  try {
    const sender = createEntitySender(client, path)
    const dlReceiver = createEntityReceiver(client, path, { receiveMode: 'peekLock', subQueueType: 'deadLetter' })
    await streamTransfer(dlReceiver, sender)
  }
  finally {
    await client.close()
  }
}

export const deleteMessage = async (connectionString: string, path: EntityPath, sequenceNumber: string, fromDeadletter: boolean): Promise<boolean> => {
  const client = new SbClient(connectionString)
  try {
    const receiver = createEntityReceiver(client, path, fromDeadletter
      ? { receiveMode: 'peekLock', subQueueType: 'deadLetter' }
      : { receiveMode: 'peekLock' })
    return await findAndAct(receiver, sequenceNumber, m => receiver.completeMessage(m))
  }
  finally {
    await client.close()
  }
}

export const requeueDlMessage = async (connectionString: string, path: EntityPath, sequenceNumber: string): Promise<boolean> => {
  const client = new SbClient(connectionString)
  try {
    const sender = createEntitySender(client, path)
    const receiver = createEntityReceiver(client, path, { receiveMode: 'peekLock', subQueueType: 'deadLetter' })
    try {
      return await findAndAct(receiver, sequenceNumber, async (m) => {
        await sender.sendMessages(cloneMessage(m))
        await receiver.completeMessage(m)
      })
    }
    finally {
      await sender.close()
    }
  }
  finally {
    await client.close()
  }
}

const createEntityReceiver = (client: ServiceBusClient, path: EntityPath, options: ServiceBusReceiverOptions): ServiceBusReceiver =>
  'queue' in path
    ? client.createReceiver(path.queue, options)
    : client.createReceiver(path.topic, path.subscription, options)

const createEntitySender = (client: ServiceBusClient, path: EntityPath): ServiceBusSender =>
  client.createSender('queue' in path ? path.queue : path.topic)

const findAndAct = async (
  receiver: ServiceBusReceiver,
  sequenceNumber: string,
  action: (message: ServiceBusReceivedMessage) => Promise<void>,
): Promise<boolean> => {
  try {
    const seen = new Set<string>()
    let emptyRounds = 0
    while (emptyRounds < EMPTY_ROUNDS_UNTIL_DONE) {
      const batch = await receiver.receiveMessages(RECEIVE_BATCH, { maxWaitTimeInMs: RECEIVE_WAIT_MS })
      if (batch.length === 0) {
        emptyRounds++
        continue
      }
      emptyRounds = 0

      const target = batch.find(m => String(m.sequenceNumber) === sequenceNumber)
      if (target) {
        await action(target)
        for (const m of batch) {
          if (m !== target) {
            await receiver.abandonMessage(m)
          }
        }
        return true
      }

      const allSeen = batch.every(m => seen.has(String(m.sequenceNumber)))
      for (const m of batch) {
        seen.add(String(m.sequenceNumber))
        await receiver.abandonMessage(m)
      }
      if (allSeen) {
        return false
      }
    }
    return false
  }
  finally {
    await receiver.close()
  }
}

const drainMessages = async (receiver: ServiceBusReceiver) => {
  try {
    let emptyRounds = 0
    while (emptyRounds < EMPTY_ROUNDS_UNTIL_DONE) {
      const messages = await receiver.receiveMessages(RECEIVE_BATCH, { maxWaitTimeInMs: RECEIVE_WAIT_MS })
      if (messages.length === 0) {
        emptyRounds++
      }
      else {
        emptyRounds = 0
      }
    }
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

const streamTransfer = async (receiver: ServiceBusReceiver, sender: ServiceBusSender) => {
  try {
    let emptyRounds = 0
    while (emptyRounds < EMPTY_ROUNDS_UNTIL_DONE) {
      const messages = await receiver.receiveMessages(RECEIVE_BATCH, { maxWaitTimeInMs: RECEIVE_WAIT_MS })
      if (messages.length === 0) {
        emptyRounds++
        continue
      }
      emptyRounds = 0
      const toSend = messages.map(cloneMessage)
      await sender.sendMessages(toSend)
      for (const message of messages) {
        await receiver.completeMessage(message)
      }
    }
  }
  finally {
    await sender.close()
    await receiver.close()
  }
}

const cloneMessage = (message: ServiceBusReceivedMessage): ServiceBusMessage => {
  return {
    body: message.body,
    contentType: message.contentType,
    correlationId: message.correlationId,
    messageId: message.messageId,
    subject: message.subject,
    replyTo: message.replyTo,
    replyToSessionId: message.replyToSessionId,
    to: message.to,
    sessionId: message.sessionId,
    partitionKey: message.partitionKey,
    timeToLive: message.timeToLive,
    scheduledEnqueueTimeUtc: message.scheduledEnqueueTimeUtc,
    applicationProperties: message.applicationProperties,
  }
}
