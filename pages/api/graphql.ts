import { keystoneContext } from '../../features/keystone/context'
import { useMcpScopeGuard } from '../../features/keystone/mcp-oauth/guard'
import { createYoga, maskError } from "graphql-yoga";
import { GraphQLError } from 'graphql'
import { constraintRefusal, constraintGraphQLError } from '../../features/keystone/lib/constraint-errors'
// @ts-ignore
import processRequest from "graphql-upload/processRequest.js";
import { type NextApiRequest, type NextApiResponse } from 'next'

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const contentType = req.headers["content-type"];
  if (contentType?.startsWith("multipart/form-data")) {
    req.body = await processRequest(req, res);
  }

  return createYoga({
    graphiql: false,
    graphqlEndpoint: "/api/graphql",
    schema: keystoneContext.graphql.schema,
    context: ({ req, res }: { req: any; res: any }) => {
      return keystoneContext.withRequest(req, res);
    },
    multipart: false,
    // A database rule refused a write: answer in words with a stable code. Everything else keeps Yoga's default masking.
    maskedErrors: {
      maskError: (error: unknown, message: string, isDev?: boolean) => {
        const refusal = constraintRefusal(error)
        if (refusal) return error instanceof GraphQLError ? constraintGraphQLError(error, refusal) : new GraphQLError(refusal.message, { extensions: { code: refusal.code } })
        return maskError(error, message, isDev)
      },
    },
    // MCP OAuth scopes only narrow: read-only tokens can't mutate, no token can manage credentials.
    plugins: [useMcpScopeGuard()], // eslint-disable-line react-hooks/rules-of-hooks
  })(req, res);
}