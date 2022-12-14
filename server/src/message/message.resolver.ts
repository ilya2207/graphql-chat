import {
  Args,
  Context,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
  Subscription,
} from '@nestjs/graphql'
import { PubSub } from 'graphql-subscriptions'
import { JwtAuthData } from 'src/auth/auth.types'
import { DataLoaders } from 'src/loader/dataloader.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { User } from 'src/user/types/user.type'
import { AuthUser } from 'src/utils/decorators/user.decorator'
import {
  GetMessagesSort,
  Message,
  messageAddedSub,
  SendMessageInput,
} from './message.types'

@Resolver(() => Message)
export class MessageResolver {
  constructor(private prisma: PrismaService, private pubsub: PubSub) {
    console.log('this.pubsub :>> ', this.pubsub)
  }

  @Query(() => Message)
  async getMessage(@Args('id') id: number) {
    return await this.prisma.message.findUnique({ where: { id } })
  }

  @Query(() => [Message])
  async getMessages(
    @Args('chatId') chatId: number,
    @Args('sort', { nullable: true }) sort: GetMessagesSort
  ) {
    console.log('sort :>> ', sort)
    console.log('chatId :>> ', chatId)
    return await this.prisma.message.findMany({
      where: {
        chatId,
      },
      skip: sort.skip,
      take: sort.take,
      orderBy: {
        id: sort.orderBy,
      },
    })
  }



  @Mutation(() => Message)
  async sendMessage(
    @Args('data') data: SendMessageInput,
    @AuthUser() authData: JwtAuthData
  ) {
    const message = await this.prisma.message.create({
      data: {
        message: data.message,
        chatId: data.chatId,
        senderId: authData.id,
      },
      select: {
        chat: {
          select: {
            chatParticipants: {
              select: {
                userId: true,
              },
            },
          },
        },
        createdAt: true,
        id: true,
        senderId: true,
        message: true,
        chatId: true,
      },
    })
    const { chat, ...messageData } = message
    this.sendPubSubMessages(message, chat.chatParticipants)
    return messageData
  }

  private sendPubSubMessages<T extends { senderId: number; message: string }>(
    message: T,
    users: { userId: number }[]
  ) {
    for (const user of users) {
      if (message.senderId === user.userId) continue
      this.pubsub.publish(`user_${user.userId}`, {
        [messageAddedSub]: message,
      })
    }
  }

  @Subscription(() => Message, { name: messageAddedSub })
  subscribeToMessage(@AuthUser() authData: JwtAuthData) {
    console.log('authData :>> ', authData)
    return this.pubsub.asyncIterator(`user_${authData.id}`)
  }

  @ResolveField(() => User)
  async sender(
    @Parent() message: Message,
    @Context('loaders') dataloaders: DataLoaders
  ) {
    return await dataloaders.getMessageSenders.load(message.senderId)
  }
}
