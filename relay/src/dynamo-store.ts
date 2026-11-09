/**
 * DynamoDB-backed store. One table, keyed by pk/sk:
 *   GAME#code / META            game record (lobby, seats, token hashes, version, whose turn)
 *   GAME#code / STATE#version   packed state, split into PART#i items if over ~350 KB
 *   GAME#code / UP#id#i         upload chunks (expire after a day)
 *   GAME#code / CONN#id         live connections for broadcasts (expire after a day)
 *   CONN#id   / CONN            reverse lookup for disconnects
 * Items carry `ttl` where they are temporary. Finished games expire after 90 days of inactivity.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { ChatMessage } from '../../src/net/protocol';
import type { GameRecord, Store } from './store';

const PART = 350_000;
const DAY = 86_400;

export class DynamoStore implements Store {
  private db: DynamoDBDocumentClient;
  constructor(private table: string, client = new DynamoDBClient({})) {
    this.db = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  }

  private ttl(days: number): number {
    return Math.floor(Date.now() / 1000) + days * DAY;
  }

  async getGame(code: string): Promise<GameRecord | null> {
    const r = await this.db.send(new GetCommand({ TableName: this.table, Key: { pk: `GAME#${code}`, sk: 'META' } }));
    return (r.Item?.game as GameRecord) ?? null;
  }

  async putGame(game: GameRecord, expectVersion?: number): Promise<boolean> {
    try {
      await this.db.send(new PutCommand({
        TableName: this.table,
        Item: { pk: `GAME#${game.code}`, sk: 'META', game, version: game.version, ttl: this.ttl(90) },
        ...(expectVersion !== undefined ? { ConditionExpression: 'attribute_not_exists(pk) OR version = :v', ExpressionAttributeValues: { ':v': expectVersion } } : {}),
      }));
      return true;
    } catch (e) {
      if ((e as { name?: string }).name === 'ConditionalCheckFailedException') return false;
      throw e;
    }
  }

  async getState(code: string, version: number): Promise<string | null> {
    const r = await this.db.send(new QueryCommand({
      TableName: this.table, KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
      ExpressionAttributeValues: { ':p': `GAME#${code}`, ':s': `STATE#${version}#` },
    }));
    const items = (r.Items ?? []).sort((a, b) => (a.part as number) - (b.part as number));
    if (items.length === 0) return null;
    return items.map((i) => i.data as string).join('');
  }

  async putState(code: string, version: number, data: string): Promise<void> {
    for (let i = 0, part = 0; i < data.length || part === 0; i += PART, part++) {
      await this.db.send(new PutCommand({
        TableName: this.table,
        Item: { pk: `GAME#${code}`, sk: `STATE#${version}#${String(part).padStart(3, '0')}`, part, data: data.slice(i, i + PART), ttl: this.ttl(90) },
      }));
    }
  }

  async deleteState(code: string, version: number): Promise<void> {
    const r = await this.db.send(new QueryCommand({
      TableName: this.table, KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
      ExpressionAttributeValues: { ':p': `GAME#${code}`, ':s': `STATE#${version}#` }, ProjectionExpression: 'pk, sk',
    }));
    for (const it of r.Items ?? []) await this.db.send(new DeleteCommand({ TableName: this.table, Key: { pk: it.pk, sk: it.sk } }));
  }

  async putChunk(code: string, upload: string, i: number, data: string): Promise<void> {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { pk: `GAME#${code}`, sk: `UP#${upload}#${i}`, data, ttl: this.ttl(1) } }));
  }

  async getChunks(code: string, upload: string, n: number): Promise<string[] | null> {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const r = await this.db.send(new GetCommand({ TableName: this.table, Key: { pk: `GAME#${code}`, sk: `UP#${upload}#${i}` } }));
      if (!r.Item) return null;
      out.push(r.Item.data as string);
    }
    return out;
  }

  async deleteChunks(code: string, upload: string, n: number): Promise<void> {
    const keys = [...Array(n)].map((_, i) => ({ DeleteRequest: { Key: { pk: `GAME#${code}`, sk: `UP#${upload}#${i}` } } }));
    for (let i = 0; i < keys.length; i += 25) {
      await this.db.send(new BatchWriteCommand({ RequestItems: { [this.table]: keys.slice(i, i + 25) } }));
    }
  }

  async addConnection(conn: string, code: string, faction: string | null): Promise<void> {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { pk: `GAME#${code}`, sk: `CONN#${conn}`, conn, faction, ttl: this.ttl(1) } }));
    await this.db.send(new PutCommand({ TableName: this.table, Item: { pk: `CONN#${conn}`, sk: 'CONN', code, ttl: this.ttl(1) } }));
  }

  async removeConnection(conn: string): Promise<void> {
    const r = await this.db.send(new GetCommand({ TableName: this.table, Key: { pk: `CONN#${conn}`, sk: 'CONN' } }));
    if (r.Item?.code) await this.db.send(new DeleteCommand({ TableName: this.table, Key: { pk: `GAME#${r.Item.code}`, sk: `CONN#${conn}` } }));
    await this.db.send(new DeleteCommand({ TableName: this.table, Key: { pk: `CONN#${conn}`, sk: 'CONN' } }));
  }

  async putMessage(code: string, m: ChatMessage): Promise<void> {
    await this.db.send(new PutCommand({
      TableName: this.table,
      Item: { pk: `GAME#${code}`, sk: `MSG#${String(m.at).padStart(15, '0')}#${m.id}`, message: m, ttl: this.ttl(90) },
    }));
  }

  async listMessages(code: string, since: number, limit: number): Promise<ChatMessage[]> {
    const r = await this.db.send(new QueryCommand({
      TableName: this.table, KeyConditionExpression: 'pk = :p AND sk BETWEEN :a AND :b',
      ExpressionAttributeValues: { ':p': `GAME#${code}`, ':a': `MSG#${String(since + 1).padStart(15, '0')}`, ':b': 'MSG#~' },
      ScanIndexForward: false, Limit: limit,
    }));
    return (r.Items ?? []).map((i) => i.message as ChatMessage).reverse();
  }

  async connections(code: string): Promise<{ conn: string; faction: string | null }[]> {
    const r = await this.db.send(new QueryCommand({
      TableName: this.table, KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
      ExpressionAttributeValues: { ':p': `GAME#${code}`, ':s': 'CONN#' },
    }));
    return (r.Items ?? []).map((i) => ({ conn: i.conn as string, faction: (i.faction as string | null) ?? null }));
  }
}
