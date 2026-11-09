/** AWS Lambda entry point for the API Gateway WebSocket API ($connect, $disconnect, $default). */
import { ApiGatewayManagementApiClient, GoneException, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { handleDisconnect, handleMessage, type Ctx } from './core';
import { DynamoStore } from './dynamo-store';

const store = new DynamoStore(process.env.TABLE_NAME ?? 'empire-relay');
let api: ApiGatewayManagementApiClient | null = null;

interface WsEvent {
  requestContext: { connectionId: string; routeKey: string; domainName: string; stage: string };
  body?: string;
}

export async function handler(event: WsEvent): Promise<{ statusCode: number }> {
  const { connectionId, routeKey, domainName, stage } = event.requestContext;
  api ??= new ApiGatewayManagementApiClient({ endpoint: `https://${domainName}/${stage}` });
  const ctx: Ctx = {
    store,
    now: () => Date.now(),
    send: async (conn, msg) => {
      try {
        await api!.send(new PostToConnectionCommand({ ConnectionId: conn, Data: new TextEncoder().encode(JSON.stringify(msg)) }));
        return true;
      } catch (e) {
        if (e instanceof GoneException || (e as { name?: string }).name === 'GoneException') return false;
        throw e;
      }
    },
  };
  if (routeKey === '$connect') return { statusCode: 200 };
  if (routeKey === '$disconnect') {
    await handleDisconnect(ctx, connectionId);
    return { statusCode: 200 };
  }
  await handleMessage(ctx, connectionId, event.body ?? '');
  return { statusCode: 200 };
}
