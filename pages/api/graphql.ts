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
    renderGraphiQL: () => {
      return `
        <!DOCTYPE html>
        <html lang="en">
          <body style="margin: 0; overflow-x: hidden; overflow-y: hidden">
          <div id="explorer" style="height:100vh; width:100vw;"></div>
          <script src="https://embeddable-sandbox.cdn.apollographql.com/_latest/embeddable-sandbox.umd.production.min.js"></script>
          <script>
          new window.EmbeddedSandbox({
            target: "#explorer",
            // Pass through your server href if you are embedding on an endpoint.
            // Otherwise, you can pass whatever endpoint you want Sandbox to start up with here.
            initialEndpoint: window.location.href,
            hideCookieToggle: false,
            initialState: {
              includeCookies: true
            }
          });
          // advanced options: https://www.apollographql.com/docs/studio/explorer/sandbox#embedding-sandbox
          </script>
          </body>
        </html>`;
    },
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
    plugins: [useMcpScopeGuard()],
  })(req, res);
}