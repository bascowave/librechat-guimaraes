import type { Model } from 'mongoose';
import type { IConversation, IMessage, IUser } from '~/types';
import type { ITransaction } from '~/schema/transaction';

export type GAUsageRow = {
  user: string;
  model: string | null;
  tokenType: 'prompt' | 'completion';
  rawAmount: number;
  tokenValue: number;
  count: number;
};

type GAMessageRow = { user: string; count: number };
type GAIdentity = { email: string; name: string };
export type GAUsage = {
  transactions: Array<GAUsageRow & GAIdentity>;
  messages: Array<GAMessageRow & GAIdentity>;
};
export type GASummary = { users: number; conversations: number; messages: number };
export type GAAdminMethods = {
  getGAUsage: (since: Date, tenantId?: string) => Promise<GAUsage>;
  getGASummary: (tenantId?: string) => Promise<GASummary>;
};

export function createGAAdminMethods(mongoose: typeof import('mongoose')): GAAdminMethods {
  const User = mongoose.models.User as Model<IUser>;
  const Message = mongoose.models.Message as Model<IMessage>;
  const Conversation = mongoose.models.Conversation as Model<IConversation>;
  const Transaction = mongoose.models.Transaction as Model<ITransaction>;
  const scope = (tenantId?: string) => (tenantId ? { tenantId } : { tenantId: { $exists: false } });

  return {
    async getGAUsage(since, tenantId) {
      const match = { ...scope(tenantId), createdAt: { $gte: since } };
      const [transactions, messages] = await Promise.all([
        Transaction.aggregate<GAUsageRow>([
          { $match: { ...match, tokenType: { $in: ['prompt', 'completion'] } } },
          {
            $group: {
              _id: { user: '$user', model: '$model', tokenType: '$tokenType' },
              rawAmount: { $sum: '$rawAmount' },
              tokenValue: { $sum: '$tokenValue' },
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              user: { $toString: '$_id.user' },
              model: { $ifNull: ['$_id.model', null] },
              tokenType: '$_id.tokenType',
              rawAmount: 1,
              tokenValue: 1,
              count: 1,
            },
          },
          { $sort: { user: 1, model: 1, tokenType: 1 } },
        ]),
        Message.aggregate<GAMessageRow>([
          { $match: { ...match, isCreatedByUser: true } },
          { $group: { _id: '$user', count: { $sum: 1 } } },
          { $project: { _id: 0, user: { $toString: '$_id' }, count: 1 } },
          { $sort: { user: 1 } },
        ]),
      ]);
      const ids = [...new Set([...transactions, ...messages].map((row) => row.user))].filter((id) =>
        mongoose.Types.ObjectId.isValid(id),
      );
      const users = await User.find({ ...scope(tenantId), _id: { $in: ids } })
        .select('_id email name')
        .lean();
      const identities = new Map(
        users.map((user) => [String(user._id), { email: user.email ?? '', name: user.name ?? '' }]),
      );
      const identity = (user: string): GAIdentity =>
        identities.get(user) ?? { email: '', name: '' };
      return {
        transactions: transactions.map((row) => ({ ...row, ...identity(row.user) })),
        messages: messages.map((row) => ({ ...row, ...identity(row.user) })),
      };
    },
    async getGASummary(tenantId) {
      const filter = scope(tenantId);
      const [users, conversations, messages] = await Promise.all([
        User.countDocuments(filter),
        Conversation.countDocuments(filter),
        Message.countDocuments(filter),
      ]);
      return { users, conversations, messages };
    },
  };
}
