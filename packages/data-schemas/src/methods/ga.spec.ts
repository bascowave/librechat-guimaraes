import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createTransactionModel } from '../models/transaction';
import { createConversationModel } from '../models/convo';
import { createMessageModel } from '../models/message';
import { createUserModel } from '../models/user';
import { createGAAdminMethods } from './ga';

let server: MongoMemoryServer;
beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
  createUserModel(mongoose);
  createMessageModel(mongoose);
  createConversationModel(mongoose);
  createTransactionModel(mongoose);
});
afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});

test('soma tipos e modelos, conta apenas mensagens do usuário e isola período e tenant', async () => {
  const user = new mongoose.Types.ObjectId();
  const other = new mongoose.Types.ObjectId();
  const now = new Date();
  const old = new Date('2000-01-01');
  await mongoose.models.User.collection.insertMany([
    { _id: user, email: 'ga@example.com', name: 'GA', tenantId: 'ga' },
    { _id: other, email: 'other@example.com', tenantId: 'other' },
  ]);
  await mongoose.models.Transaction.collection.insertMany([
    {
      user,
      tenantId: 'ga',
      model: 'model-a',
      tokenType: 'prompt',
      rawAmount: 10,
      tokenValue: -20,
      createdAt: now,
    },
    {
      user,
      tenantId: 'ga',
      model: 'model-a',
      tokenType: 'prompt',
      rawAmount: 5,
      tokenValue: -10,
      createdAt: now,
    },
    {
      user,
      tenantId: 'ga',
      model: 'model-a',
      tokenType: 'completion',
      rawAmount: 3,
      tokenValue: -12,
      createdAt: now,
    },
    { user, tenantId: 'ga', model: 'model-b', tokenType: 'prompt', rawAmount: 2, createdAt: now },
    { user, tenantId: 'ga', tokenType: 'credits', rawAmount: 1000, createdAt: now },
    {
      user,
      tenantId: 'ga',
      model: 'model-a',
      tokenType: 'prompt',
      rawAmount: 9999,
      createdAt: old,
    },
    {
      user: other,
      tenantId: 'other',
      model: 'model-a',
      tokenType: 'prompt',
      rawAmount: 9999,
      createdAt: now,
    },
  ]);
  await mongoose.models.Message.collection.insertMany([
    { user: String(user), tenantId: 'ga', isCreatedByUser: true, createdAt: now },
    { user: String(user), tenantId: 'ga', isCreatedByUser: false, createdAt: now },
    { user: String(user), tenantId: 'ga', isCreatedByUser: true, createdAt: old },
    { user: String(other), tenantId: 'other', isCreatedByUser: true, createdAt: now },
  ]);
  await mongoose.models.Conversation.collection.insertMany([
    { tenantId: 'ga' },
    { tenantId: 'other' },
  ]);
  const methods = createGAAdminMethods(mongoose);
  const usage = await methods.getGAUsage(new Date(now.getTime() - 86400000), 'ga');
  expect(usage.transactions).toHaveLength(3);
  expect(usage.transactions).toContainEqual({
    user: String(user),
    email: 'ga@example.com',
    name: 'GA',
    model: 'model-a',
    tokenType: 'prompt',
    rawAmount: 15,
    tokenValue: -30,
    count: 2,
  });
  expect(usage.transactions).toContainEqual(
    expect.objectContaining({ model: 'model-b', tokenValue: 0 }),
  );
  expect(usage.messages).toEqual([
    { user: String(user), email: 'ga@example.com', name: 'GA', count: 1 },
  ]);
  expect(await methods.getGASummary('ga')).toEqual({ users: 1, conversations: 1, messages: 3 });
  expect(await methods.getGAUsage(now, 'empty')).toEqual({ transactions: [], messages: [] });
  expect(await methods.getGASummary('empty')).toEqual({ users: 0, conversations: 0, messages: 0 });
});
