/**
 * The MCP server as a Durable Object (agents SDK `McpAgent`).
 *
 * One instance per MCP session. The kaloricketabulky.cz login cookie lives on
 * the instance, so a session logs in once and reuses it across tool calls.
 */

import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KtClient } from '../kt/client.js';
import { registerTools } from './tools.js';

export class KtMCP extends McpAgent<Env> {
  server = new McpServer(
    { name: 'kaloricketabulky', version: '0.2.0' },
    {
      instructions:
        "Logs food into the user's kaloricketabulky.cz diary. The food database is Czech: search with Czech terms for the best matches. " +
        'When the user gives a count rather than a weight ("3 eggs"), call get_food_portions and log a natural portion unit instead of estimating grams.',
    },
  );

  async init(): Promise<void> {
    registerTools(this.server, new KtClient({ email: this.env.KT_EMAIL, password: this.env.KT_PASSWORD }));
  }
}
