import mercurius, { IResolvers } from 'mercurius'
import { generateTokens, getTokenPayload } from '../../utils/auth/jwt'
const { ErrorWithProps } = mercurius

export const authMutation: IResolvers = {
  Mutation: {
    login: async (_, { data }, { prisma, reply }) => {
      const findedUser = await prisma.user.findFirst({
        where: {
          login: data?.login,
        },
      })
      if (!findedUser) throw new ErrorWithProps('Пользователь не найден')
      const isPasswordEquals = data?.password === findedUser.password
      if (!isPasswordEquals) throw new ErrorWithProps('Пароль неверный')
      const { accessToken, refreshToken } = generateTokens(findedUser)
      reply.setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        maxAge: 1000 * 3600 * 24 * 30,
      })
      return { user: findedUser, accessToken: accessToken }
    },
    register: async (_, { user: userData }, { prisma, reply }) => {
      const isUserExists = await prisma.user.findFirst({
        where: {
          login: userData.login,
        },
      })
      if (isUserExists)
        throw new ErrorWithProps('Пользователь с таким логином существует', {
          login: userData.login,
          code: 'USER_LOGIN_EXISTS',
        })

      const user = await prisma.user.create({
        data: userData,
      })
      const { accessToken, refreshToken } = generateTokens(user)
      reply.setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        maxAge: 1000 * 3600 * 24 * 30,
      })

      return { accessToken: accessToken, user: user }
    },
    refresh: async (_, __, { req, prisma, reply }) => {
      const oldRefreshToken = req.cookies.refreshToken
      console.log('req.cookies :>> ', req.cookies)
      console.log('oldRefreshToken :>> ', oldRefreshToken)
      if (!oldRefreshToken)
        throw new ErrorWithProps('Ошибка авторизации', {}, 401)
      const authData = getTokenPayload(oldRefreshToken, 'refresh')
      const user = await prisma.user.findUnique({
        where: {
          id: authData.id,
        },
      })
      if (!user) throw new ErrorWithProps('Ошибка авторизации', {}, 401)

      const { accessToken, refreshToken } = generateTokens(user)
      reply.setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        maxAge: 1000 * 3600 * 24 * 30,
      })
      return { accessToken }
    },
  },
}
