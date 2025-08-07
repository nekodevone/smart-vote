import '@std/dotenv/load'
import {
  type AnyThreadChannel,
  ChannelType,
  Client,
  Collection,
  IntentsBitField,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User
} from 'discord.js'

const TOKEN = Deno.env.get('TOKEN')!
const REACT_ID = Deno.env.get('REACT_ID')!
const CHANNEL_ID = Deno.env.get('CHANNEL_ID')!

const CACHED_THREADS = new Collection<string, AnyThreadChannel>()
const CACHED_MESSAGES = new Collection<string, Message>()

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildMessageReactions
  ]
})

client.on('messageReactionAdd', async (reaction, user) => {
  // Incorrect message (only first counts)
  if (!CACHED_MESSAGES.has(reaction.message.id)) {
    console.log('Incorrect message')
    return
  }

  const shouldBeKept = await isValidReaction(reaction, user)

  // Incorrect reaction
  if (!shouldBeKept) {
    await trySafe(() => reaction.remove())
    return
  }
})

// Login
await client.login(TOKEN)
console.log(`Logged in as ${client.user?.username}`)

// Fetch threads
await fetchThreads()

// Utilities
async function fetchThreads() {
  const channel = await client.channels.fetch(CHANNEL_ID)

  if (!channel || channel.type !== ChannelType.GuildForum) {
    throw new Error('Channel not found or is not forum')
  }

  const { threads } = await channel.threads.fetch()

  await Promise.all(
    [...threads.values()].map(async (thread) => {
      CACHED_THREADS.set(thread.id, thread)

      const messages = await thread.messages.fetch({
        after: '0',
        limit: 1,
        cache: true
      })

      for (const [id, message] of messages) {
        CACHED_MESSAGES.set(id, message)
      }
    })
  )

  console.log(`Collected ${threads.size} threads`)
}

async function isValidReaction(
  reaction: PartialMessageReaction | MessageReaction,
  user: PartialUser | User
): Promise<boolean> {
  // Incorrect reaction
  if (reaction.emoji.id !== REACT_ID) {
    return false
  }

  // Fetch member
  const member = await reaction.message.guild?.members.fetch(user.id)

  if (!member || !member.joinedAt) {
    return false
  }

  // Joined less than 1 month ago
  if (member.joinedAt.getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000) {
    return false
  }

  return true
}

async function trySafe<T>(callback: () => T): Promise<T | false> {
  try {
    return await callback()
  } catch (error) {
    console.error('Error catched:', error)
    return false
  }
}
