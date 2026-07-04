// Types + helpers for API Gateway WebSocket Lambda handlers.

export interface WsRequestContext {
  connectionId: string;
  domainName: string;
  stage: string;
  routeKey: string;
}

export interface WsEvent {
  requestContext: WsRequestContext;
  queryStringParameters?: Record<string, string | undefined> | null;
  headers?: Record<string, string | undefined> | null;
  body?: string | null;
}

export interface WsResult {
  statusCode: number;
  body?: string;
}

/** Build the Management API callback endpoint from the incoming event. */
export function endpointFromEvent(event: WsEvent): string {
  const { domainName, stage } = event.requestContext;
  return `https://${domainName}/${stage}`;
}

export function parseWsBody<T>(event: WsEvent): T {
  if (!event.body) return {} as T;
  try {
    return JSON.parse(event.body) as T;
  } catch {
    return {} as T;
  }
}
